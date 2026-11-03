import React from 'react';
import { SCHEMAS } from '../lib/engine.js';

export default function Sidebar({ mode, cur, onAI, onOpen }) {
  const codes = Object.keys(SCHEMAS);
  const aiActive = mode === 'ai' || mode === 'packet';
  return (
    <aside>
      <h1>Документы<br />УСБ МВД РО</h1>
      <p className="sub">Опишите ситуацию — AI заполнит документы. Проверьте, поправьте и скачайте PDF.</p>
      <ul className="reg">
        <li className="ai-item">
          <button className={aiActive ? 'on' : ''} onClick={onAI}>
            <span className="code">🤖</span><span className="nm">Генерация по ситуации</span>
          </button>
        </li>
        {codes.map((code) => (
          <li key={code}>
            <button className={mode === 'form' && cur === code ? 'on' : ''} onClick={() => onOpen(code)}>
              <span className="code">{SCHEMAS[code].code}</span><span className="nm">{SCHEMAS[code].name}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
