'use strict';

/*
 * Мини-сервер для генератора документов УСБ (без npm-зависимостей, Node 18+).
 *
 *  - Раздаёт index.html и статику (origin = http://localhost:PORT, уходит проблема CORS).
 *  - POST /api/deepseek    — релей в DeepSeek (ключ берётся из config.json, наружу не уходит).
 *  - GET  /api/legislation — отдать законодательную базу из файла laws.md.
 *
 * База законов — это просто файл laws.md в папке проекта. Вы редактируете его руками;
 * сервер лишь читает его и отдаёт в генератор. Никаких БД и парсинга форума.
 *
 * Запуск:  node server.js   →  открыть http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'dist'); // собранное React-приложение (web → vite build → dist)
const CONFIG_PATH = path.join(ROOT, 'config.json');
const LAWS_PATH = path.join(ROOT, 'laws.md');

/* ---------- конфиг ---------- */
function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.warn('\n[!] Не удалось прочитать config.json (' + e.message + ').');
    console.warn('    Скопируйте config.example.json → config.json и впишите ключ DeepSeek.\n');
  }
  cfg.port = cfg.port || 3000;
  cfg.deepseek = cfg.deepseek || {};
  cfg.deepseek.baseUrl = cfg.deepseek.baseUrl || 'https://api.deepseek.com/chat/completions';
  cfg.deepseek.model = cfg.deepseek.model || 'deepseek-chat';
  return cfg;
}

// Заголовки HTTP принимают только ASCII. Заглушка ключа в config.json — кириллицей,
// поэтому так отсекаем незаполненный ключ с понятной ошибкой.
function asciiSet(v) { return typeof v === 'string' && v.trim() !== '' && /^[\x20-\x7e]+$/.test(v); }

/* ---------- утилиты HTTP ---------- */
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Тело запроса слишком большое')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function fetchWithTimeout(url, opts = {}, ms = 120000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/* ---------- законодательная база (файл laws.md) ---------- */
function readLaws() {
  try {
    const text = fs.readFileSync(LAWS_PATH, 'utf8');
    const st = fs.statSync(LAWS_PATH);
    return { updatedAt: st.mtime.toISOString(), text };
  } catch {
    return { updatedAt: null, text: '' };
  }
}

/* ---------- DeepSeek релей ---------- */
async function deepseekRelay(cfg, payload) {
  if (!asciiSet(cfg.deepseek.apiKey)) {
    throw new Error('Не задан ключ DeepSeek: впишите настоящий deepseek.apiKey в config.json (сейчас там заглушка).');
  }
  const body = { model: cfg.deepseek.model, ...payload };
  if (!body.model) body.model = cfg.deepseek.model;
  const r = await fetchWithTimeout(cfg.deepseek.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.deepseek.apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.ok ? 200 : (r.status || 502), json };
}

/* ---------- статика ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon',
};
function serveStatic(req, res) {
  if (!fs.existsSync(WEB_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<meta charset="utf-8"><body style="font:16px system-ui;padding:40px;max-width:640px;margin:auto">'
      + '<h2>Приложение не собрано</h2><p>Соберите React-приложение:</p>'
      + '<pre style="background:#f4f2ec;padding:12px;border-radius:6px">cd web\nnpm install\nnpm run build</pre>'
      + '<p>…затем обновите страницу. Для разработки: <code>cd web && npm run dev</code> (откройте http://localhost:5173).</p></body>');
    return;
  }
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  let abs = path.normalize(path.join(WEB_DIR, rel));
  if (!abs.startsWith(WEB_DIR + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(abs, (err, data) => {
    if (err) { // SPA-фоллбэк: отдаём index.html
      fs.readFile(path.join(WEB_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------- роутинг ---------- */
const server = http.createServer(async (req, res) => {
  const cfg = loadConfig(); // перечитываем, чтобы правки config.json подхватывались без рестарта
  const url = req.url.split('?')[0];

  try {
    if (req.method === 'POST' && url === '/api/deepseek') {
      const payload = JSON.parse(await readBody(req));
      const { status, json } = await deepseekRelay(cfg, payload);
      return sendJson(res, status, json);
    }
    if (req.method === 'GET' && url === '/api/legislation') {
      return sendJson(res, 200, readLaws());
    }
    if (req.method === 'GET' && url === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        deepseek: asciiSet(cfg.deepseek.apiKey),
        model: cfg.deepseek.model,
        legislation: readLaws().updatedAt,
      });
    }
    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end('Method Not Allowed');
  } catch (e) {
    sendJson(res, 400, { error: e.message || String(e) });
  }
});

const cfg0 = loadConfig();
server.listen(cfg0.port, () => {
  console.log('\n  Генератор УСБ запущен:  http://localhost:' + cfg0.port + '\n');
  console.log('  DeepSeek ключ: ' + (asciiSet(cfg0.deepseek.apiKey) ? 'задан (' + cfg0.deepseek.model + ')' : 'НЕ задан — впишите в config.json'));
  console.log('  База законов: ' + (readLaws().text ? 'laws.md найден' : 'laws.md ПУСТ/нет — положите законы в laws.md'));
  console.log('');
});
