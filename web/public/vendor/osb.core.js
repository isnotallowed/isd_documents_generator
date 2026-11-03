
/* Ядро генератора документов УСБ: описание формы → ops → PDF (pdf-lib). Работает в браузере и в node. */
(function (root) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const PL = isNode ? require('pdf-lib') : root.PDFLib;
  const FK = isNode ? require('@pdf-lib/fontkit') : root.fontkit;

  const MM = 72 / 25.4;
  const NB = ' ';
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function fmtDate(iso) {
    if (!iso) return `«__»${NB}_________${NB}2026${NB}г.`;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return `«${String(d).padStart(2, '0')}»${NB}${MONTHS[m - 1]}${NB}${y}${NB}г.`;
  }
  function b64ToBytes(b64) {
    const clean = b64.replace(/^data:[^,]+,/, '');
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64');
    const bin = atob(clean); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const orBlank = (v, blank) => (v && String(v).trim()) ? String(v).trim().replace(/\.+$/, '') : blank;
  const N = (v) => orBlank(v, '___');
  const has = (p) => p && (p.post || p.rank || p.name);
  const full = (p) => [p.post, p.rank, p.name].filter(Boolean).join(', ') || '[должность, звание, имя, фамилия]';
  const fio = (p) => [p.rank, p.name].filter(Boolean).join(' ') || '[звание, имя, фамилия]';
  /* «Владимир Дзержинский» → «В. Дзержинский»; уже сокращённое не трогаем */
  function short(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts[0] || 'И. Фамилия';
    if (/\./.test(parts[0]) || parts[0].length <= 2) return parts.join(' ');
    return parts[0][0].toUpperCase() + '. ' + parts[parts.length - 1];
  }
  const toLines = (t) => t ? [t.post, t.rank, t.name, t.udo ? `уд. №${NB}${t.udo}` : '', t.unit].filter(Boolean) : [];

  /* ---------- схемы форм ---------- */
  const common = [
    { key: 'number', label: 'Номер документа', type: 'text', short: true, ph: '031' },
    { key: 'date', label: 'Дата', type: 'date', short: true },
    { key: 'place', label: 'Место составления', type: 'text', short: true, ph: 'г. Москва' },
  ];
  const unitF = { key: 'unit', label: 'Подразделение в шапке (вторая строка)', type: 'text', optional: true, ph: 'Управление собственной безопасности — можно оставить пустым' };
  const BODY_HINT = 'Каждая строка — отдельный абзац. «- » в начале строки — маркированный список, «1. » — нумерованный, «## » — жирная строка.';
  const SEC_LINE = 'Данному документу присвоен гриф «СЕКРЕТНО».';
  const COPIES_LINE = 'Документ составлен в двух экземплярах.';

  const SCHEMAS = {
    akt: { code: '01', name: 'Акт', opts: { secret: true, seal: true, copies: true }, fields: [...common,
      { key: 'subject', label: 'О чём акт (заголовок)', type: 'textarea', rows: 2, ph: 'О фиксации нарушения служебной дисциплины…' },
      { key: 'lead', label: 'Кто составил (вводная строка)', type: 'textarea', rows: 2 },
      { key: 'signers', label: 'Комиссия', type: 'people', sign: true, roles: ['Председатель комиссии', 'Член комиссии'], hint: 'Первый — председатель; внизу под каждым — подпись' },
      { key: 'intro', label: 'Вводная часть (после состава комиссии)', type: 'textarea', rows: 2 },
      { key: 'body', label: 'Основная часть акта', type: 'textarea', rows: 9, hint: BODY_HINT },
      { key: 'decided', label: 'Комиссия постановляет', type: 'list', ph: 'Признать факт нарушения установленным.' },
    ] },
    uved: { code: '02', name: 'Уведомление', opts: { secret: false, seal: false, ackline: true }, fields: [...common,
      { key: 'subject', label: 'Заголовок', type: 'text', optional: true, ph: 'О назначении служебной проверки' },
      { key: 'to', label: 'Кому (дательный падеж)', type: 'person', ext: true, hint: 'Начальнику ДПС МВД, генерал-майору полиции, Сергею Высоцкому' },
      { key: 'body', label: 'Текст уведомления', type: 'textarea', rows: 8, hint: BODY_HINT },
      { key: 'asks', label: 'Прошу', type: 'list', optional: true, ph: 'Обеспечить недопущение сотрудника к службе до особого распоряжения.' },
      { key: 'ack', label: 'Ознакомлен (имя и фамилия)', type: 'text', short: true, optional: true, hint: 'Если пусто — в строке будет линия для подписи и «И. Фамилия»' },
      { key: 'ackDate', label: 'Дата ознакомления', type: 'date', short: true, optional: true, hint: 'Если пусто — «__» _____ 2026 г.' },
      { key: 'ackSig', label: 'Подпись ознакомленного', type: 'sig', optional: true },
      { key: 'signers', label: 'Подписант', type: 'people', sign: true, max: 1 },
    ] },
    rapt: { code: '03', name: 'Рапорт', opts: { secret: false, seal: false }, fields: [
      { key: 'date', label: 'Дата', type: 'date', short: true },
      { key: 'to', label: 'Кому (дательный падеж)', type: 'person', ext: true, hint: 'Начальнику УСБ МВД, генерал-лейтенанту полиции, В. Дзержинскому' },
      { key: 'from', label: 'От кого (родительный падеж, для шапки)', type: 'person', ext: true, hint: 'заместителя начальника УСБ МВД, полковника полиции, Р. Натова' },
      { key: 'subject', label: 'О чём рапорт', type: 'text', optional: true, ph: 'о выявленном дисциплинарном нарушении' },
      { key: 'body', label: 'Текст рапорта', type: 'textarea', rows: 9, hint: BODY_HINT },
      { key: 'ask', label: 'Просьба', type: 'textarea', rows: 3, ph: 'Прошу назначить служебную проверку…' },
      { key: 'attNote', label: 'Приложения', type: 'text', optional: true, ph: 'видеозапись на 1 файле, скриншоты на 2 л.' },
      { key: 'signers', label: 'Подписант (именительный падеж)', type: 'people', sign: true, max: 1 },
    ] },
    rasp: { code: '04', name: 'Распоряжение', opts: { secret: true, seal: true, copies: true }, fields: [...common,
      { key: 'subject', label: 'О чём распоряжение (заголовок)', type: 'textarea', rows: 2 },
      { key: 'preamble', label: 'Преамбула', type: 'textarea', rows: 4, ph: 'Рассмотрев материалы …, и в рамках реализации … полномочий,' },
      { key: 'items', label: 'Распоряжаюсь', type: 'list', ph: 'Назначить проведение служебной проверки в отношении …' },
      { key: 'signers', label: 'Подписант', type: 'people', sign: true, max: 2, hint: 'Можно добавить второго подписанта' },
    ] },
    prik: { code: '05', name: 'Приказ', opts: { secret: true, seal: true, copies: false }, fields: [...common,
      { key: 'subject', label: 'О чём приказ (заголовок)', type: 'textarea', rows: 2 },
      { key: 'preamble', label: 'Преамбула', type: 'textarea', rows: 3, ph: 'Рассмотрев материалы служебной проверки…' },
      { key: 'body', label: 'Установлено (необязательно)', type: 'textarea', rows: 5, optional: true, hint: BODY_HINT },
      { key: 'basis', label: 'Руководствуясь', type: 'list', optional: true, ph: 'ст. 32.1, 32.3 Внутреннего устава МВД;' },
      { key: 'items', label: 'Приказываю', type: 'list', ph: 'Прекратить дальнейшее прохождение службы …' },
      { key: 'signers', label: 'Подписанты', type: 'people', sign: true, max: 3 },
    ] },
    motp: { code: '06', name: 'Мотивированное представление', opts: { secret: false, seal: false }, fields: [...common,
      { key: 'to', label: 'Кому (дательный падеж)', type: 'person', ext: true, hint: 'Начальнику МВД, генералу полиции, Даниилу Базанову' },
      { key: 'subject', label: 'О чём представление', type: 'textarea', rows: 2, ph: 'о проведении служебной проверки и отстранении сотрудника' },
      { key: 'preamble', label: 'Вводная часть', type: 'textarea', rows: 3, ph: 'Рассмотрев материалы …, установлено следующее:' },
      { key: 'body', label: 'Обстоятельства', type: 'textarea', rows: 7, hint: BODY_HINT },
      { key: 'basis', label: 'Руководствуясь', type: 'list', optional: true, ph: 'ст. 30.2 Внутреннего устава МВД;' },
      { key: 'items', label: 'Прошу', type: 'list', ph: 'Рассмотреть вопрос о назначении служебной проверки …' },
      { key: 'att', label: 'Приложения', type: 'attachments' },
      { key: 'signers', label: 'Подписант', type: 'people', sign: true, max: 2 },
    ] },
  };

  /* ---------- ops ---------- */
  const T = (t, o = {}) => ({ k: 'p', runs: [{ t, b: !!o.b }], ...o });
  const gap = (h = 12) => ({ k: 'gap', h });
  const bodyP = (t) => ({ k: 'p', runs: [{ t }], align: 'justify', first: 1.25, after: 7 });

  /* Мини-разметка текста: строка = абзац; «- » список; «1. » нумерация; «## » жирная строка */
  function parseBody(text) {
    const out = []; let cur = null;
    const flush = () => { if (cur) { out.push(cur); cur = null; } };
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      let m;
      if ((m = line.match(/^[-•●]\s+(.*)$/))) { if (!cur || cur.k !== 'bul') { flush(); cur = { k: 'bul', items: [] }; } cur.items.push(m[1]); }
      else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (!cur || cur.k !== 'num') { flush(); cur = { k: 'num', items: [] }; } cur.items.push(m[1]); }
      else if ((m = line.match(/^##\s+(.*)$/))) { flush(); out.push({ k: 'p', runs: [{ t: m[1], b: true }], after: 5, before: 2 }); }
      else { flush(); out.push(bodyP(line)); }
    }
    flush();
    return out.map(o => (o.k === 'bul' || o.k === 'num') ? { ...o, after: 7 } : o);
  }
  const listOps = (kind, items) => { const l = (items || []).map(x => String(x).trim()).filter(Boolean); return l.length ? [{ k: kind, items: l, after: 7 }] : []; };

  const header = (d) => { const u = d.unit && d.unit.trim();
    return [{ k: 'logo' },
      T('МИНИСТЕРСТВО ВНУТРЕННИХ ДЕЛ РО', { b: true, sz: 14, align: 'center', ...(u ? {} : { dbl: true }) }),
      ...(u ? [T(u, { b: true, align: 'center', dbl: true })] : [])]; };
  const title = (t, sz = 15) => T(t, { b: true, sz, align: 'center', before: 10, after: 6 });
  const subjectC = (t) => t && t.trim() ? [T(t.trim(), { b: true, align: 'center', after: 10 })] : [];
  const dateLine = (d, right = true) => ({ k: 'row3', l: orBlank(d.place, 'г. Москва'), r: fmtDate(d.date) });
  const rblock = (...blocks) => { const bl = blocks.filter(b => b && b.length); return bl.length ? [{ k: 'rblock', blocks: bl }, gap(8)] : []; };
  const addressee = (lines, left = 9.5) => lines.length ? [...lines.map(l => ({ k: 'p', runs: [{ t: l }], left })), gap(10)] : [];

  function signers(d, labels) {
    const s = (d.signers || []).filter(has);
    const list = s.length ? s : [{}];
    return { k: 'sig', seal: !!d.seal, items: list.map((p, i) => ({
      label: labels ? labels(i, list.length) : null,
      lines: [p.post || '[Должность]', p.rank || '[звание]'],
      name: short(p.name), sig: p.sig, ratio: p.sigRatio })) };
  }

  function compose(type, d) {
    let c = [];
    const secretItem = d.secret ? [SEC_LINE] : [];
    const copiesItem = d.copies ? [COPIES_LINE] : [];
    if (type === 'akt') {
      const sg = (d.signers || []).filter(has); const list = sg.length ? sg : [{}];
      const pLine = (p) => ({ k: 'p', runs: [{ t: [p.post, p.rank].filter(Boolean).join(' - ') + (p.post || p.rank ? ' ' : '') }, { t: p.name || '[имя фамилия]', b: true }], align: 'justify', after: 6 });
      c = [...header(d),
        T('А К Т', { b: true, sz: 15, align: 'center', before: 10, after: 6 }),
        { k: 'row3', l: fmtDate(d.date), c: orBlank(d.place, 'г. Москва').replace(/^г\.\s*/, ''), r: '№' + NB + N(d.number) },
        gap(6), T(orBlank(d.subject, '[о чём акт]'), { b: true, align: 'justify', after: 8 }),
        T(orBlank(d.lead, 'Комиссия в составе:').replace(/\.$/, ''), { b: true, align: 'justify', after: 6 }),
        { k: 'rule' },
        T('Председатель комиссии:', { b: true, after: 1 }), pLine(list[0]),
        ...(list.length > 1 ? [T('Члены комиссии:', { b: true, after: 1 }), ...list.slice(1).map(pLine)] : []),
        { k: 'rule' },
        ...(d.intro && d.intro.trim() ? [{ k: 'p', runs: [{ t: d.intro.trim() }], align: 'justify', after: 7 }] : []),
        ...parseBody(d.body),
        T('На основании вышеизложенного комиссия постановляет:', { b: true, after: 4, before: 2 }),
        ...listOps('num', [...(d.decided || []), ...secretItem, ...copiesItem]),
        gap(14),
        signers(d, (i, n) => i === 0 ? 'Председатель комиссии:' : (i === 1 && n > 1 ? 'Члены комиссии:' : null))];
    }
    if (type === 'uved') {
      c = [...header(d),
        title(d.number && d.number.trim() ? `УВЕДОМЛЕНИЕ №${NB}${d.number.trim()}` : 'УВЕДОМЛЕНИЕ'),
        dateLine(d), gap(4), ...subjectC(d.subject), ...(d.subject ? [] : [gap(4)]),
        ...rblock(toLines(d.to)),
        ...parseBody(d.body),
        ...((d.asks || []).some(x => x && x.trim()) ? [T('Прошу:', { after: 3 , keep: true }), ...listOps('num', d.asks)] : []),
        ...(d.secret ? [bodyP(SEC_LINE)] : []),
        gap(14), signers(d),
        ...(d.ackline ? [gap(12), T('С уведомлением ознакомлен, копию получил:', { after: 4, keep: true }),
          { k: 'ackrow', name: d.ack && d.ack.trim() ? short(d.ack) : '', sig: d.ackSig, ratio: d.ackSigRatio, date: d.ackDate ? fmtDate(d.ackDate) : `«__»${NB}_________${NB}2026${NB}г.` }] : [])];
    }
    if (type === 'rapt') {
      const frm = has(d.from) ? d.from : {};
      c = [...rblock(toLines(d.to), ['от ' + (frm.post || '[должность]'), frm.rank, frm.name, frm.udo ? `уд. №${NB}${frm.udo}` : ''].filter(Boolean)),
        title('РАПОРТ', 15), ...(d.subject && d.subject.trim() ? [T(d.subject.trim(), { b: true, align: 'center', after: 10 })] : [gap(6)]),
        ...parseBody(d.body),
        ...(d.ask && d.ask.trim() ? [bodyP(d.ask.trim())] : []),
        ...(d.secret ? [bodyP(SEC_LINE)] : []),
        ...(d.attNote && d.attNote.trim() ? [gap(4), T('Приложения: ' + d.attNote.trim().replace(/\.$/, '') + '.', { after: 6 })] : []),
        gap(14), signers(d), gap(10), T(fmtDate(d.date))];
    }
    if (type === 'rasp') {
      c = [...header(d),
        title(`РАСПОРЯЖЕНИЕ №${NB}${N(d.number)}`),
        ...subjectC(orBlank(d.subject, '[о чём распоряжение]')),
        dateLine(d), gap(10),
        { ...bodyP(orBlank(d.preamble, '[преамбула]').replace(/,?$/, ',')), first: 0 },
        T('РАСПОРЯЖАЮСЬ:', { b: true, after: 5, before: 2 }),
        ...listOps('num', [...(d.items || []), ...secretItem, ...copiesItem]),
        gap(18), signers(d)];
    }
    if (type === 'prik') {
      const hasBasis = (d.basis || []).some(x => x && x.trim());
      c = [...header(d),
        title(`ПРИКАЗ №${NB}${N(d.number)}`),
        ...subjectC(orBlank(d.subject, '[о чём приказ]')),
        dateLine(d), gap(10),
        { ...bodyP(orBlank(d.preamble, '[преамбула]').replace(/,?$/, ',')), first: 0 },
        ...(d.body && d.body.trim() ? [T('УСТАНОВЛЕНО:', { b: true, after: 5 }), ...parseBody(d.body)] : []),
        ...(hasBasis ? [T('Руководствуясь:', { after: 4 , keep: true }), ...listOps('bul', d.basis)] : []),
        T('ПРИКАЗЫВАЮ:', { b: true, after: 5, before: 2 }),
        ...listOps('num', [...(d.items || []), ...secretItem, ...copiesItem]),
        gap(18), signers(d)];
    }
    if (type === 'motp') {
      const hasBasis = (d.basis || []).some(x => x && x.trim());
      const atts = (d.att || []).filter(a => a && (a.name || '').trim());
      c = [...header(d),
        title(d.number && d.number.trim() ? `МОТИВИРОВАННОЕ ПРЕДСТАВЛЕНИЕ №${NB}${d.number.trim()}` : 'МОТИВИРОВАННОЕ ПРЕДСТАВЛЕНИЕ', 14),
        ...subjectC(orBlank(d.subject, '[о чём представление]')),
        dateLine(d), gap(8),
        ...rblock(toLines(d.to)),
        ...(d.preamble && d.preamble.trim() ? [bodyP(d.preamble.trim())] : []),
        ...parseBody(d.body),
        ...(hasBasis ? [T('Руководствуясь:', { after: 4 , keep: true }), ...listOps('bul', d.basis)] : []),
        T('ПРОШУ:', { b: true, after: 5, before: 2 }),
        ...listOps('num', [...(d.items || [])]),
        ...(d.secret ? [bodyP(SEC_LINE)] : []),
        ...(atts.length ? [T('Приложения:', { after: 3 , keep: true }), ...listOps('num', atts.map(a => `${a.name.trim()}${a.pages ? ' — на ' + String(a.pages).trim() + ' л.' : ''}`))] : []),
        gap(14), signers(d)];
    }
    return c.filter(Boolean);
  }

  /* ---------- PDF ---------- */
  /* Контекст (шрифты и картинки). Для предпросмотра создаётся один раз и переиспользуется. */
  let SCRATCH = null;
  async function makeCtx(A) {
    const pdf = await PL.PDFDocument.create(); pdf.registerFontkit(FK);
    const img = async (b64) => { const im = await pdf.embedPng(b64ToBytes(b64)); im.__src = b64; return im; };
    const fReg = await pdf.embedFont(b64ToBytes(A.fontRegular), { subset: false });
    const fBold = await pdf.embedFont(b64ToBytes(A.fontBold), { subset: false });
    return { A, pdf, img, fReg, fBold, eagle: await img(A.eagle), sealImg: await img(A.seal), stampImg: await img(A.secret), paper: null, sigCache: new Map() };
  }
  async function runPdf(type, d, A, force, rec) {
    const ops = compose(type, d);
    let sigBroke = false, lastIdx = -1;
    const { rgb } = PL;
    let ctx;
    if (rec) { if (!SCRATCH || SCRATCH.A !== A) SCRATCH = await makeCtx(A); ctx = SCRATCH; } else ctx = await makeCtx(A);
    const { pdf, fReg, fBold, eagle, sealImg, stampImg } = ctx;
    const charset = ctx.charset || (ctx.charset = new Set(fReg.getCharacterSet()));
    const clean = (t) => { let o = ''; for (const ch of String(t)) { const cp = ch.codePointAt(0); o += (ch === NB || ch === ' ') ? NB : (charset.has(cp) ? ch : (/\s/.test(ch) ? ' ' : '?')); } return o; };
    if (d.paper && A.paper && !ctx.paper) ctx.paper = await ctx.img(A.paper);
    const paperImg = d.paper && A.paper ? ctx.paper : null;
    const sigOf = async (b64) => { if (!ctx.sigCache.has(b64)) ctx.sigCache.set(b64, await ctx.img(b64)); return ctx.sigCache.get(b64); };
    /* «страница-самописец»: вместо PDF запоминает команды рисования для предпросмотра */
    const recPage = () => { const cmds = []; return { cmds,
      /* слова кладутся по метрикам шрифта PDF — пробелы не зависят от браузера */
      drawText: (t, o) => { let x = o.x; for (const w of t.split(/( )/)) { if (!w) continue; if (w !== ' ') cmds.push({ k: 't', t: w, x, y: o.y, sz: o.size, b: o.font === fBold }); x += o.font.widthOfTextAtSize(w, o.size); } },
      drawImage: (im, o) => cmds.push({ k: 'i', src: im.__src, x: o.x, y: o.y, w: o.width, h: o.height }),
      drawLine: (o) => cmds.push({ k: 'l', x1: o.start.x, y1: o.start.y, x2: o.end.x, y2: o.end.y, th: o.thickness, c: o.color }),
      drawCircle: (o) => cmds.push({ k: 'c', x: o.x, y: o.y, r: o.size }) }; };

    const W = 595.28, PH = 841.89;
    const ML = 17.5 * MM, MR = 18 * MM, MT = 15 * MM, MB = 15 * MM;
    const TW = W - ML - MR;
    const CM = 10 * MM;
    const black = rgb(0, 0, 0);
    const LH = (sz) => sz * 1.3;
    const fnt = (b) => b ? fBold : fReg;
    const wid = (t, sz, b) => fnt(b).widthOfTextAtSize(t.replace(/ /g, ' '), sz);
    const text = (page, t, x, y, sz, b) => page.drawText(t.replace(/ /g, ' '), { x, y, size: sz, font: fnt(b), color: black });

    let page, y; const pages = [];
    const newPage = () => {
      page = rec ? recPage() : pdf.addPage([W, PH]); pages.push(page);
      if (paperImg) page.drawImage(paperImg, { x: 0, y: 0, width: W, height: PH });
      y = PH - MT;
      if (pages.length === 1 && d.secret) {
        const sw = 132, sh = sw * stampImg.height / stampImg.width;
        page.drawImage(stampImg, { x: ML - 10, y: PH - 22 - sh, width: sw, height: sh });
      }
    };
    const need = (h) => { if (y - h < MB) newPage(); };
    /* абзац целиком переносится на следующую страницу, если не помещается (но не длиннее страницы) */
    const keepTogether = (h) => { if (y - h < MB && h < PH - MT - MB && y < PH - MT - 1) newPage(); };
    newPage();

    /* слова с учётом смешанного жирного */
    const tokenize = (runs) => {
      const words = []; let cur = null;
      for (const r of runs) { const t = clean(r.t || ''); const b = !!r.b;
        for (const ch of t) {
          if (/[ \t\r\n]/.test(ch)) { if (cur) { words.push(cur); cur = null; } continue; }
          if (!cur) cur = { pieces: [], w: 0 };
          const last = cur.pieces[cur.pieces.length - 1];
          if (last && last.b === b) last.t += ch; else cur.pieces.push({ t: ch, b });
        } }
      if (cur) words.push(cur);
      return words;
    };
    const measure = (wd, sz) => { wd.w = wd.pieces.reduce((a, p) => a + wid(p.t, sz, p.b), 0); return wd.w; };
    const wrapWords = (words, sz, firstW, restW) => {
      const sp = wid(' ', sz, false); const lines = []; let line = [], lw = 0, maxW = firstW;
      for (const wd of words) { const ww = measure(wd, sz);
        if (line.length && lw + sp + ww > maxW) { lines.push({ words: line, w: lw }); line = [wd]; lw = ww; maxW = restW; }
        else { lw += (line.length ? sp : 0) + ww; line.push(wd); } }
      if (line.length) lines.push({ words: line, w: lw });
      return lines;
    };
    const drawWord = (wd, x, by, sz) => { let cx = x; for (const p of wd.pieces) { text(page, p.t, cx, by, sz, p.b); cx += wid(p.t, sz, p.b); } return cx - x; };
    const drawLines = (lines, sz, x0, firstIndent, width, align, onFirst) => {
      const lh = LH(sz), sp = wid(' ', sz, false);
      lines.forEach((ln, i) => { need(lh); y -= lh; const by = y + sz * 0.26;
        if (i === 0 && onFirst) onFirst(by);
        const x = x0 + (i === 0 ? firstIndent : 0); const aw = width - (i === 0 ? firstIndent : 0); const last = i === lines.length - 1;
        if (align === 'justify' && !last && ln.words.length > 1) { const g = (aw - ln.w) / (ln.words.length - 1) + sp; let cx = x; for (const wd of ln.words) cx += drawWord(wd, cx, by, sz) + g; }
        else { const sx = align === 'center' ? x + (aw - ln.w) / 2 : align === 'right' ? x + aw - ln.w : x; let cx = sx; ln.words.forEach((wd, k) => { cx += drawWord(wd, cx, by, sz) + (k < ln.words.length - 1 ? sp : 0); }); }
      });
    };

    /* блок подписей */
    const SH = 64, SEALW = 102, OVF = 0.12;
    const SEALH = SEALW * sealImg.height / sealImg.width;
    const sigBlock = async (op) => {
      const sz = 12, lh = LH(sz);
      const nameW = Math.max(...op.items.map(it => wid(clean(it.name), sz, false)));
      const nameLeft = ML + TW - nameW;
      const sealLeft = nameLeft - 8 - SEALW;
      const sigRight = sealLeft + OVF * SEALW;           /* правый край подписи заходит на печать на ~12% её ширины */
      const swOf = (it) => it.sig ? Math.min(130, SH * (it.ratio || 2)) : 90;
      const maxSw = Math.max(...op.items.map(swOf));
      const leftMax = Math.max(150, sigRight - maxSw - 10 - ML);
      const sealOn = op.seal;
      const rows = op.items.map(it => {
        const lines = []; for (const l of it.lines) wrapWords(tokenize([{ t: l }]), sz, leftMax, leftMax).forEach(x => lines.push(x));
        const textH = lines.length * lh;
        return { it, lines, textH, rowH: Math.max(SH, textH) + 2, sw: swOf(it) };
      });
      if (sealOn && rows.length === 1) rows[0].rowH = Math.max(rows[0].rowH, SEALH + 2);
      const labelH = (it) => it.label ? lh + 2 : 0;
      const gaps = rows.map((r, i) => {
        if (i === 0) return 0;
        if (sealOn && i === 1) return Math.max(12, 0.78 * SEALH - rows[0].rowH / 2 - r.rowH / 2 - labelH(r.it));
        return 12; });
      let total = 0; rows.forEach((r, i) => { total += gaps[i] + labelH(r.it) + r.rowH; });
      need(total + 4);
      const jobs = []; let yy = y;
      rows.forEach((r, i) => {
        yy -= gaps[i];
        if (r.it.label) { jobs.push({ t: 'label', text: r.it.label, y: yy - sz }); yy -= labelH(r.it); }
        const top = yy, bottom = yy - r.rowH, mid = (top + bottom) / 2;
        jobs.push({ t: 'row', r, mid }); yy = bottom;
      });
      const rowJobs = jobs.filter(j => j.t === 'row');
      if (sealOn) {
        const cy = rowJobs.length === 1 ? rowJobs[0].mid : (rowJobs[0].mid + rowJobs[1].mid) / 2;
        page.drawImage(sealImg, { x: sealLeft, y: cy - SEALH / 2, width: SEALW, height: SEALH });
      }
      for (const j of jobs) {
        if (j.t === 'label') { text(page, clean(j.text), ML, j.y, sz, true); continue; }
        const { r, mid } = j;
        let ty = mid + r.textH / 2; let lastBase = 0;
        r.lines.forEach((ln, k) => { ty -= lh; let cx = ML; ln.words.forEach((wd, q) => { cx += drawWord(wd, cx, ty + sz * 0.26, sz) + (q < ln.words.length - 1 ? wid(' ', sz, false) : 0); });
          lastBase = ty + sz * 0.26;
          if (k === r.lines.length - 1) text(page, clean(r.it.name), ML + TW - wid(clean(r.it.name), sz, false), lastBase, sz, false); });
        if (r.it.sig) { const im = await sigOf(r.it.sig); page.drawImage(im, { x: sigRight - r.sw, y: mid - SH / 2, width: r.sw, height: SH }); }
        else text(page, '____________', sigRight - wid('____________', sz, false) - 4, lastBase, sz, false);
      }
      y = yy;
    };

    for (let oi = 0; oi < ops.length; oi++) {
      const op = ops[oi];
      if (force && force.op === oi && force.item == null && y < PH - MT - 1) newPage();
      if (op.k !== 'gap' && op.k !== 'sig') lastIdx = oi;
      if (op.k === 'gap') { y -= op.h; continue; }
      if (op.k === 'logo') { const w = 128, h = w * eagle.height / eagle.width; need(h + 6); y -= h; page.drawImage(eagle, { x: ML + (TW - w) / 2, y, width: w, height: h }); y -= 4; continue; }
      if (op.k === 'rblock') { const sz = 12, lh = LH(sz);
        const all = op.blocks.flat().map(clean); const maxW = Math.min(TW * 0.72, Math.max(...all.map(l => wid(l, sz, false)))); const x = ML + TW - maxW;
        op.blocks.forEach((bl, bi) => { if (bi) y -= 6; bl.forEach(l => { wrapWords(tokenize([{ t: l }]), sz, maxW, maxW).forEach(ln => { need(lh); y -= lh; let cx = x; ln.words.forEach((wd, q) => { cx += drawWord(wd, cx, y + sz * 0.26, sz) + (q < ln.words.length - 1 ? wid(' ', sz, false) : 0); }); }); }); });
        continue; }
      if (op.k === 'ackrow') { const sz = 12, lh = LH(sz); const h = op.sig ? 44 : lh + 6; need(h); y -= h; const mid = y + h / 2; const by = mid - sz * 0.3;
        if (op.name) text(page, clean(op.name), ML, by, sz, false); else text(page, '____________  И. Фамилия', ML, by, sz, false);
        if (op.sig) { const im = await sigOf(op.sig); const w = Math.min(110, 40 * (op.ratio || 2)); page.drawImage(im, { x: ML + TW * 0.5 - w / 2, y: mid - 20, width: w, height: 40 }); }
        const t = clean(op.date); text(page, t, ML + TW - wid(t, sz, false), by, sz, false); continue; }
      if (op.k === 'rule') { y -= 3; page.drawLine({ start: { x: ML, y }, end: { x: ML + TW, y }, thickness: 0.5, color: rgb(0.45, 0.45, 0.45) }); y -= 8; continue; }
      if (op.k === 'row3') { const sz = 12, lh = LH(sz); need(lh); y -= lh; const by = y + sz * 0.26;
        if (op.l) text(page, clean(op.l), ML, by, sz, false);
        if (op.c) { const t = clean(op.c); text(page, t, ML + (TW - wid(t, sz, false)) / 2, by, sz, false); }
        if (op.r) { const t = clean(op.r); text(page, t, ML + TW - wid(t, sz, false), by, sz, false); }
        y -= 2; continue; }
      if (op.k === 'num' || op.k === 'bul') { const sz = 12, ind = 1.25 * CM;
        op.items.forEach((t, i) => { if (force && force.op === oi && force.item === i && y < PH - MT - 1) newPage();
          const lines = wrapWords(tokenize([{ t }]), sz, TW - ind, TW - ind);
          keepTogether(lines.length * LH(sz));
          drawLines(lines, sz, ML + ind, 0, TW - ind, 'justify', (by) => {
            if (op.k === 'num') text(page, `${i + 1}.`, ML + 0.5 * CM, by, sz, false);
            else page.drawCircle({ x: ML + 0.62 * CM, y: by + sz * 0.3, size: 2.1, color: black }); });
          y -= 1.5; });
        if (op.after) y -= op.after; continue; }
      if (op.k === 'sig') { const n0 = pages.length; await sigBlock(op); if (pages.length > n0) sigBroke = true; continue; }
      /* абзац */
      const sz = op.sz || 12; const left = (op.left || 0) * CM, first = (op.first || 0) * CM;
      let runs = op.runs; if (op.b) runs = runs.map(r => ({ ...r, b: true }));
      const lines = wrapWords(tokenize(runs), sz, TW - left - first, TW - left);
      const isHead = op.keep || /:\s*$/.test(runs.map(r => r.t).join('')) || (runs.length && runs.every(r => r.b) && op.align !== 'center' && op.align !== 'justify');
      keepTogether(lines.length * LH(sz) + (op.before || 0) + (isHead ? LH(sz) * 2.2 : 0));
      if (op.before) y -= op.before;
      if (!lines.length) { y -= LH(sz); }
      else drawLines(lines, sz, ML + left, first, TW - left, op.align || 'left');
      if (op.dbl) { y -= 3; for (const dy of [0, 2.4]) page.drawLine({ start: { x: ML, y: y - dy }, end: { x: ML + TW, y: y - dy }, thickness: 0.8, color: black }); y -= 8; }
      if (op.after) y -= op.after;
    }
    return { bytes: rec ? null : await pdf.save(), pages, sigBroke, lastIdx, ops };
  }
  async function pass(type, d, A, rec) {
    let r = await runPdf(type, d, A, null, rec);
    if (r.sigBroke && r.lastIdx >= 0) {
      const op = r.ops[r.lastIdx];
      const force = { op: r.lastIdx, item: (op.k === 'num' || op.k === 'bul') ? op.items.length - 1 : null };
      r = await runPdf(type, d, A, force, rec);
    }
    return r;
  }
  async function buildPdf(type, d, A) { return (await pass(type, d, A, false)).bytes; }
  /* предпросмотр: та же раскладка, что у PDF, но результат — команды рисования по страницам */
  async function preview(type, d, A) { const r = await pass(type, d, A, true); return { W: 595.28, H: 841.89, pages: r.pages.map(p => p.cmds) }; }

  function fileName(type, d) {
    const nm = SCHEMAS[type].name.replace(/[^\wа-яА-ЯёЁ]+/g, '_');
    return `${nm}_${d.date || 'без_даты'}.pdf`;
  }
  const api = { SCHEMAS, compose, buildPdf, preview, fileName, fmtDate };
  if (isNode) module.exports = api; else root.OSB = api;
})(typeof window !== 'undefined' ? window : globalThis);

