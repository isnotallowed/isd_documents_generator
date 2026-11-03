import React from 'react';
import { SCHEMAS } from '../lib/engine.js';
import { SCEN_NAME } from '../lib/ai.js';

export default function PacketView({ packet, scen, onOpen, onDownloadAll, onBack }) {
  return (
    <div className="ai-panel">
      <div className="top"><h2>Пакет документов</h2><span className="code">🤖</span></div>
      <p className="lead">
        Сценарий: {SCEN_NAME[scen] || scen}. Откройте каждый документ, проверьте и поправьте текст,
        затем скачайте PDF.
      </p>
      <div className="packet">
        {packet.map((it, i) => (
          <button className="pk-card" key={i} onClick={() => onOpen(i)}>
            <span className="n">{i + 1}</span>
            <span>
              <div className="nm">{SCHEMAS[it.type].name}</div>
              {it.note && <div className="sub">{it.note}</div>}
            </span>
            <span className="go">открыть →</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn" onClick={() => onOpen(0)}>Открыть первый</button>
        <button className="btn ghost" onClick={onDownloadAll}>Скачать все PDF</button>
        <button className="btn ghost" onClick={onBack}>← Изменить ситуацию</button>
      </div>
    </div>
  );
}
