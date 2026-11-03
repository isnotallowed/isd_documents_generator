import React, { useState } from 'react';
import { SCHEMAS, buildPdfBytes, fileName } from '../lib/engine.js';
import { Field, OptsBlock } from './Fields.jsx';

const UNIT_FIELD = { key: 'unit', label: 'Подразделение в шапке (вторая строка)', type: 'text', optional: true, ph: 'можно оставить пустым' };

export async function downloadPdf(type, data) {
  const bytes = await buildPdfBytes(type, data);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(type, data);
  document.body.appendChild(a); a.click(); a.remove();
}

export default function DocumentForm({ cur, data, touch, banner, onClear }) {
  const sc = SCHEMAS[cur];
  const [msg, setMsg] = useState({ text: '', err: false });

  async function onDownload() {
    setMsg({ text: 'Собираю документ…', err: false });
    try {
      const missing = sc.fields
        .filter((f) => !f.optional && ['text', 'textarea', 'date'].includes(f.type) && !(data[f.key] || '').trim())
        .map((f) => f.label);
      await downloadPdf(cur, data);
      if (missing.length) setMsg({ text: 'Файл скачан. Не заполнено: ' + missing.join(', ') + ' — на их месте заготовки в скобках.', err: true });
      else setMsg({ text: 'Готово — файл скачан.', err: false });
    } catch (e) {
      setMsg({ text: 'Не удалось собрать документ: ' + e.message, err: true });
      console.error(e);
    }
  }

  return (
    <div>
      {banner}
      <div className="top"><h2>{sc.name}</h2><span className="code">{sc.code}</span></div>
      <div className="grid">
        <OptsBlock cur={cur} data={data} touch={touch} />
        {sc.fields.map((f) => <Field key={f.key} f={f} data={data} touch={touch} />)}
        <Field f={UNIT_FIELD} data={data} touch={touch} />
      </div>
      <div className="actions">
        <button className="btn" onClick={onDownload}>Скачать PDF</button>
        <button className="btn ghost" onClick={onClear}>Очистить</button>
        <span className={'msg' + (msg.err ? ' err' : '')}>{msg.text}</span>
      </div>
    </div>
  );
}
