import { SCHEMAS, blank, loadSigner } from "./engine.js";
const S = SCHEMAS;

const PIPELINES = {
  reprimand: ['akt', 'uved', 'prik'],
  dismissal: ['akt', 'uved', 'rasp', 'rapt', 'prik'],
};
const SCEN_NAME = { reprimand: 'Строгач: Акт → Уведомление → Приказ', dismissal: 'Увольнение: Акт → Уведомление → Распоряжение → Рапорт → Приказ' };
async function api(path, opts) {
  const r = await fetch(path, opts);
  let j; try { j = await r.json(); } catch { j = {}; }
  if (!r.ok || j.error) {
    const m = typeof j.error === 'string' ? j.error : (j.error && j.error.message) || ('сервер вернул ' + r.status);
    throw new Error(m);
  }
  return j;
}

let _legisCache = null;
async function getLegislation(force) {
  if (_legisCache && !force) return _legisCache;
  try { _legisCache = await api('/api/legislation'); } catch { _legisCache = { updatedAt: null, text: '' }; }
  return _legisCache;
}
function legisStatus(l) {
  if (!l || !l.updatedAt) return 'laws.md не найден или пуст — положите базу в файл laws.md';
  const d = new Date(l.updatedAt);
  return 'laws.md · обновлён ' + d.toLocaleString('ru-RU') + ' · ' + ((l.text || '').length) + ' симв.';
}

/* контракт полей для промпта выводим из SCHEMAS, чтобы не было рассинхрона */
function fieldType(f) {
  switch (f.type) {
    case 'date': return 'строка-дата "ГГГГ-ММ-ДД"';
    case 'textarea': return 'строка; абзацы разделяй \\n; "- " в начале строки — маркер, "1. " — нумерация, "## " — жирный подзаголовок';
    case 'person': return 'объект {post,rank,name,udo?,unit?}';
    case 'people': return 'массив объектов {post,rank,name,udo?,unit?} (первый — главный подписант)';
    case 'list': return 'массив строк';
    case 'attachments': return 'массив объектов {name,pages}';
    default: return 'строка';
  }
}
function docSpec(type) {
  const sc = S[type];
  const lines = sc.fields.filter(f => f.type !== 'sig').map(f =>
    `    "${f.key}": ${fieldType(f)} — ${f.label}${f.optional ? ' (необязательно)' : ''}${f.hint ? ' [' + f.hint + ']' : ''}`);
  return `  ${type} (${sc.name}):\n` + lines.join('\n');
}

const ALL_TYPES = ['akt', 'uved', 'rasp', 'rapt', 'prik'];

// laws.md может быть огромным (мегабайты) — в контекст целиком не влезет.
// Отбираем релевантное: всегда берём Главу VII устава (дисциплина + п. 7.8 «Классификация НВС»)
// и определение НВС, остальное (статьи устава, УК, УПК, служебные проверки) добираем по
// ключевым словам из описания ситуации, в пределах бюджета символов.
function buildLawsExcerpt(laws, situation, budget = 48000) {
  if (!laws) return '';
  if (laws.length <= budget) return laws;
  const lines = laws.split('\n'), n = lines.length;
  const pri = new Array(n).fill(0);
  const setPri = (i, a, b, p) => { for (let k = Math.max(0, i - a); k <= Math.min(n - 1, i + b); k++) pri[k] = Math.max(pri[k], p); };

  // приоритет 2 — включаем всегда (дисциплина, классификация НВС, служебные проверки)
  const anchors = [
    { re: /ГЛАВА\s+VII\./, a: 0, b: 135 },           // дисциплина + п. 7.8 классификация НВС
    { re: /Классификаци\w*\s+НВС/i, a: 2, b: 135 },
    { re: /НВС\s*\(Нарушение/i, a: 1, b: 6 },          // определение НВС (\b в JS не ловит кириллицу)
    { re: /Служебная проверк/i, a: 1, b: 10 },
  ];
  for (let i = 0; i < n; i++) for (const an of anchors) if (an.re.test(lines[i])) setPri(i, an.a, an.b, 2);

  // приоритет 1 — релевантные по ключевым словам ситуации (статьи устава/УК/УПК под ситуацию)
  const stop = new Set('этого этом быть если либо или настоящего настоящим который которые сотрудник сотрудника сотруднику сотрудником также либо'.split(' '));
  const kws = [...new Set((situation.toLowerCase().match(/[а-яё]{5,}/g) || []).filter(w => !stop.has(w)))].slice(0, 40);
  if (kws.length) for (let i = 0; i < n; i++) { const lw = lines[i].toLowerCase(); for (const w of kws) if (lw.includes(w)) { setPri(i, 2, 4, 1); break; } }

  // сборка с приоритетом: сначала всё p=2, затем p=1, пока не кончится бюджет
  const chosen = new Array(n).fill(false); let left = budget;
  for (const level of [2, 1]) for (let i = 0; i < n; i++) {
    if (!chosen[i] && pri[i] === level) { const len = lines[i].length + 1; if (len <= left) { chosen[i] = true; left -= len; } }
  }
  const out = []; let gap = false;
  for (let i = 0; i < n; i++) {
    if (chosen[i]) { out.push(lines[i]); gap = false; }
    else if (!gap) { out.push('…'); gap = true; }
  }
  return out.join('\n');
}

// Системный промпт одинаков в рамках одного пакета — DeepSeek кеширует его префикс.
function systemPrompt(legisText, situation) {
  const specs = ALL_TYPES.map(docSpec).join('\n');
  const legisBlock = (legisText && legisText.trim())
    ? buildLawsExcerpt(legisText, situation || '')
    : 'База не загружена. Используй общие формулировки Внутреннего устава МВД, но НЕ выдумывай конкретные номера статей.';
  return [
    'Ты — делопроизводитель Управления собственной безопасности (УСБ) МВД на игровом RP-сервере Russia Online. По описанию ситуации готовишь служебные документы.',
    '',
    'ПОРЯДОК ДОКУМЕНТООБОРОТА:',
    '• Сценарий "reprimand" (строгий выговор, «строгач»): Акт (akt) → Уведомление (uved) → Приказ (prik). ВАЖНО: служебная проверка НЕ проводится и отстранение НЕ применяется. Акт фиксирует нарушение и основания для взыскания; Уведомление сообщает начальнику подразделения нарушителя о ФАКТЕ нарушения и о ПРИМЕНЁННОМ дисциплинарном взыскании; Приказ выносит строгий выговор на основании Акта. НИГДЕ в этом сценарии не упоминай служебную проверку, материалы проверки и отстранение.',
    '• Сценарий "dismissal" (светит увольнение): проводится служебная проверка. Акт с отстранением (akt) → Уведомление (uved) → Распоряжение (rasp) → Рапорт (rapt) → Приказ (prik). В Акте и Распоряжении отрази отстранение сотрудника на период проверки; Уведомление сообщает о назначении проверки и отстранении; Приказ выносится по результатам проверки.',
    '',
    'ЗАКОНОДАТЕЛЬНАЯ БАЗА (ссылайся на статьи отсюда, цитируй точные номера; не выдумывай номера, которых здесь нет):',
    '<<<', legisBlock, '>>>',
    '',
    'СТИЛЬ (ОЧЕНЬ ВАЖНО): пиши кратко и строго по делу, как в реальных документах УСБ МВД. НИКАКОЙ «воды», лишних вводных и оценочных штампов («совершено умышленно, при исполнении…», «носит характер превышения должностных полномочий и грубого нарушения субординации» и т.п.). Только факты: дата, время, место, кто, что сделал. Короткие абзацы, каждый — с новой строки (\\n).',
    'ТРЕБОВАНИЯ: правильные падежи (поле "to" — дательный, "from" — родительный, "signers" — именительный); реквизиты (ФИО, звания, уд. №, даты) бери из описания; НЕ выдумывай конкретные номера удостоверений — если их нет, оставь поле пустым.',
    '',
    'КВАЛИФИКАЦИЯ НАРУШЕНИЯ (в Акте, Распоряжении, Приказе, Представлении):',
    '— Сам определи нарушение по ситуации и укажи нарушенные пункты устава из базы.',
    '— Формат ссылки — ровно так: «Пункт X.X.X ВУ МВД — краткое описание.» Где это усиливает документ, следующей строкой приведи ДОСЛОВНУЮ цитату пункта/статьи из базы в кавычках «…».',
    '— Классифицируй нарушение по пункту «7.8. Классификация НВС по категориям» из базы: укажи конкретный подпункт и категорию (лёгкая 7.8.1 / средняя 7.8.2 / тяжёлая 7.8.3) и соответствующее взыскание.',
    '— При признаках преступления — ссылки на конкретные статьи Уголовного кодекса (УК), Уголовно-процессуального кодекса (УПК) и ФЗ из базы с их точными формулировками.',
    '— Номера и формулировки бери ТОЛЬКО из базы выше; нет нужной статьи в базе — не ссылайся на неё. В строковых полях используй \\n вместо сырых переводов строк.',
    '',
    'КОНТРАКТ ПОЛЕЙ (data каждого документа):',
    specs,
    '',
    'Флаги в data: secret, seal, copies, ackline (boolean). Обычно у Акта/Распоряжения/Приказа secret=true и seal=true; у Уведомления ackline=true.',
  ].join('\n');
}

async function callModel(messages, maxTokens) {
  const payload = { temperature: 0.4, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages };
  const j = await api('/api/deepseek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const ch = j.choices && j.choices[0];
  const content = ch && ch.message && ch.message.content;
  if (!content) throw new Error('пустой ответ модели');
  if (ch.finish_reason === 'length') throw new Error('ответ модели обрезан по длине — увеличьте max_tokens или упростите ситуацию');
  try { return parseModelJson(content); }
  catch (e) { throw new Error('невалидный JSON (' + content.slice(0, 100).replace(/\s+/g, ' ') + '…)'); }
}

async function classifyScenario(sys, situation) {
  const user = 'По описанию ситуации определи сценарий документооборота. Верни строго JSON {"scenario":"reprimand"|"dismissal"}. reprimand — разовое нарушение, достаточно строгого выговора; dismissal — грубое/систематическое нарушение с основанием для увольнения (нужна служебная проверка).\n\nОписание ситуации:\n' + situation;
  const r = await callModel([{ role: 'system', content: sys }, { role: 'user', content: user }], 60);
  return PIPELINES[r && r.scenario] ? r.scenario : 'reprimand';
}

// Пер-типовые образцы структуры (по реальным документам УСБ) — кратко, без «воды».
// Содержание зависит от сценария: в reprimand НЕТ служебной проверки и отстранения.
function docGuide(type, scen) {
  const dis = scen === 'dismissal';
  if (type === 'akt') {
    const g = [
      'АКТ — кратко и фактологически:',
      '• subject: «О фиксации нарушения служебной дисциплины и установлении оснований для применения мер дисциплинарного воздействия».',
      '• lead: «Комиссия Управления собственной безопасности Министерства внутренних дел по г. Москве и Московской области в составе:».',
      '• intro: «составили настоящий Акт и в рамках реализации предоставленных государственно-властных и надзорно-контрольных полномочий в отношении личного состава Министерства, установили:».',
      '• body: 1–2 абзаца фактов (как поступил материал/обращение; что зафиксировано: дата, время, место, кто, что сделал — конкретно). Затем строка «В действиях сотрудника усматриваются признаки следующих нарушений:» и по одному абзацу на нарушение «Пункт X.X.X ВУ МВД — краткое описание.»; где уместно — следующей строкой дословная цитата из базы в «…».',
    ];
    if (dis) g.push('• decided (постановляет): признать факт нарушения; направить материалы для проведения служебной проверки (со ссылкой на пункты порядка проверки из базы); отстранить сотрудника от исполнения обязанностей на период проверки (со ссылкой на пункт об отстранении); по результатам проверки установить обстоятельства и дать правовую оценку.');
    else g.push('• decided (постановляет): признать факт нарушения служебной дисциплины установленным; квалифицировать нарушение по п. 7.8.X (категория) ВУ МВД; применить к сотруднику дисциплинарное взыскание в виде строгого выговора. НЕ упоминай служебную проверку и отстранение — в сценарии «строгач» их НЕТ.');
    g.push('НЕ добавляй пункты про гриф «СЕКРЕТНО» и «в двух экземплярах» — они формируются галочками оформления.');
    return g.join('\n');
  }
  if (type === 'uved') {
    const head = [
      'УВЕДОМЛЕНИЕ — короткое, на имя НАЧАЛЬНИКА подразделения нарушителя (НЕ самого нарушителя!):',
      '• to: руководитель отдела/подразделения нарушителя (дательный падеж). Если конкретное лицо неизвестно — «Начальнику {подразделение нарушителя}». НИКОГДА не адресуй уведомление самому нарушителю.',
    ];
    if (dis) {
      head.push('• body: «Уведомляю о том, что ваш подчинённый, {звание} {ФИО}, удостоверение №{номер}, допустил нарушение служебной дисциплины, в связи с чем в отношении него назначена служебная проверка и он отстранён от исполнения служебных обязанностей на период её проведения по факту инцидента от {дата}.»');
      head.push('• asks (Прошу): обеспечить недопущение сотрудника к службе на период проведения служебной проверки.');
    } else {
      head.push('• body: уведоми начальника о ФАКТЕ нарушения и о ПРИМЕНЁННОМ взыскании, по образцу: «Уведомляю о том, что ваш подчинённый, {звание} {ФИО}, удостоверение №{номер}, допустил нарушение служебной дисциплины (Пункт X.X.X ВУ МВД), в связи с чем в отношении него применено дисциплинарное взыскание в виде строгого выговора.» БЕЗ упоминания служебной проверки и отстранения — их в этом сценарии НЕТ.');
      head.push('• asks (Прошу): один короткий пункт — например, ознакомить сотрудника с настоящим уведомлением / учесть изложенное при прохождении им службы.');
    }
    return head.join('\n');
  }
  if (type === 'prik') {
    if (dis) return [
      'ПРИКАЗ — «О назначении меры дисциплинарного взыскания» (по результатам проверки):',
      '• subject: «О назначении меры дисциплинарного взыскания».',
      '• preamble: «Рассмотрев материалы служебной проверки, назначенной Распоряжением № __ от {дата} г., а также принимая во внимание характер допущенных нарушений,».',
      '• body (УСТАНОВЛЕНО): кратко что установлено проверкой; что действия — грубое нарушение; строка «В действиях сотрудника установлены нарушения пунктов X, Y, Z Внутреннего устава МВД РО.».',
      '• basis (Руководствуясь): основание санкции, напр. «П. 7.8.3 — тяжёлая категория: «строгий выговор / понижение / увольнение».».',
      '• items (ПРИКАЗЫВАЮ): признать виновным; применить взыскание (понижение/прекращение службы) со ссылкой на пункт; кадровые действия; внести в личное дело; ознакомить сотрудника с приказом.',
    ].join('\n');
    return [
      'ПРИКАЗ — «О назначении меры дисциплинарного взыскания» (на основании Акта, БЕЗ проверки):',
      '• subject: «О назначении меры дисциплинарного взыскания».',
      '• preamble: «Рассмотрев материалы Акта № __ от {дата} г. о нарушении служебной дисциплины,» — БЕЗ упоминания служебной проверки (её в сценарии «строгач» нет).',
      '• body (УСТАНОВЛЕНО): кратко факты нарушения; строка «В действиях сотрудника установлены нарушения пунктов X, Y, Z Внутреннего устава МВД РО.».',
      '• basis (Руководствуясь): п. 7.8.X — категория, предусматривающая строгий выговор.',
      '• items (ПРИКАЗЫВАЮ): признать виновным в нарушении служебной дисциплины; применить дисциплинарное взыскание в виде строгого выговора на основании п. 7.8.X ВУ МВД; внести сведения о взыскании в личное дело; ознакомить сотрудника с приказом. НЕ упоминай служебную проверку и отстранение.',
    ].join('\n');
  }
  if (type === 'rasp') return [
    'РАСПОРЯЖЕНИЕ — кратко, о проведении служебной проверки и отстранении:',
    '• preamble: «Рассмотрев материалы о нарушении служебной дисциплины, допущенном {звание} {ФИО}, удостоверение №{номер}, и в рамках предоставленных полномочий,».',
    '• items (Распоряжаюсь): назначить служебную проверку; отстранить сотрудника на период проверки; возложить проведение на УСБ; установить срок проверки; контроль оставить за собой. Без «воды».',
  ].join('\n');
  if (type === 'rapt') return 'РАПОРТ — короткий доклад: кратко факт (дата, время, место, кто, что), чем подтверждается; просьба — назначить служебную проверку. Без «воды».';
  if (type === 'motp') return 'МОТИВИРОВАННОЕ ПРЕДСТАВЛЕНИЕ — кратко: обстоятельства; основания (ссылки на пункты/статьи из базы); просьба (назначить проверку / отстранить). Без «воды».';
  return '';
}

async function genDoc(sys, type, situation, scen, date, startNum) {
  const extra = [
    date ? 'Дата документов: ' + date : null,
    startNum ? 'Нумерация документов — начиная с № ' + startNum : null,
  ].filter(Boolean).join('\n');
  const guide = '\n\n' + docGuide(type, scen);
  const user = 'Сценарий: ' + scen + '. Сформируй ТОЛЬКО документ type="' + type + '" (' + S[type].name + ') для этого сценария по контракту для ' + type + '. Пиши кратко, без «воды».\n' +
    (extra ? extra + '\n' : '') +
    'Верни строго JSON вида {"data":{…поля документа…}}.' + guide +
    '\n\nОписание ситуации:\n' + situation;
  const r = await callModel([{ role: 'system', content: sys }, { role: 'user', content: user }], 3000);
  return (r && r.data && typeof r.data === 'object') ? r.data : r;
}

function coercePerson(v) {
  if (typeof v === 'string') return { name: v };
  if (!v || typeof v !== 'object') return {};
  const o = {};
  for (const k of ['post', 'rank', 'name', 'udo', 'unit']) if (v[k] != null) o[k] = String(v[k]);
  return o;
}
function coerceDoc(type, ai) {
  const sc = S[type]; const d = blank(sc); ai = ai || {};
  for (const k of ['secret', 'seal', 'copies', 'ackline', 'paper']) if (typeof ai[k] === 'boolean') d[k] = ai[k];
  if (typeof ai.unit === 'string') d.unit = ai.unit;
  for (const f of sc.fields) {
    if (f.key === 'unit') continue;
    const v = ai[f.key]; if (v == null) continue;
    switch (f.type) {
      case 'text': case 'textarea': case 'date': d[f.key] = String(v); break;
      case 'person': d[f.key] = coercePerson(v); break;
      case 'people': { const a = (Array.isArray(v) ? v : [v]).map(coercePerson); d[f.key] = a.length ? a : [{}]; break; }
      case 'list': { const a = (Array.isArray(v) ? v : [v]).map(x => String(x)).filter(x => x.trim()); d[f.key] = a.length ? a : ['']; break; }
      case 'attachments': { const a = (Array.isArray(v) ? v : [v]).map(x => ({ name: String((x && x.name) || ''), pages: String((x && x.pages) || '') })); d[f.key] = a.length ? a : [{ name: '', pages: '' }]; break; }
    }
  }
  const sv = loadSigner();
  if (sv && sv.name && Array.isArray(d.signers) && d.signers.length) d.signers[0] = { ...sv };
  return d;
}

/* --- экран AI --- */
function sanitizeJson(s) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      const c = ch.charCodeAt(0);
      if (c < 0x20) { out += '\\u' + c.toString(16).padStart(4, '0'); continue; }
    }
    out += ch;
  }
  return out;
}
function parseModelJson(content) {
  let s = String(content || '').trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a > 0 || (b >= 0 && b < s.length - 1)) { if (a >= 0 && b > a) s = s.slice(a, b + 1); }
  try { return JSON.parse(s); } catch (e) {}
  return JSON.parse(sanitizeJson(s)); // при неудаче — чиним управляющие символы и парсим снова
}


export { PIPELINES, SCEN_NAME, api, getLegislation, legisStatus, systemPrompt, classifyScenario, genDoc, coerceDoc, buildLawsExcerpt };
