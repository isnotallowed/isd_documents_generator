import React from 'react';

export default function AIPanel({ ai, update, legisText, onReloadLaws, onGenerate, genMsg, busy, health }) {
  return (
    <div className="ai-panel">
      <div className="top"><h2>Генерация по ситуации</h2><span className="code">🤖</span></div>
      <p className="lead">
        Опишите ситуацию — AI подберёт нужные документы в правильном порядке (включая Приказ) и
        заполнит формы со ссылками на законодательную базу. Потом проверьте каждый и скачайте PDF.
      </p>

      <div className="legis-box">
        <div className="bt">Законодательная база</div>
        <div className="pill">{legisText}</div>
        <div className="hint">
          Законы берутся из файла <code>laws.md</code> в папке проекта — редактируйте его любым
          текстовым редактором. После правок нажмите «Перечитать laws.md».
        </div>
        <div className="legis-actions">
          <button className="btn ghost" onClick={onReloadLaws}>Перечитать laws.md</button>
        </div>
      </div>

      <div className="ai-field">
        <label>Опишите ситуацию</label>
        <textarea
          placeholder="Например: инспектор ДПС, уд. № 1488, покинул пост без разрешения, оскорбил гражданина и отказался предоставить видеозапись нагрудной камеры по требованию УСБ. Укажите кто, что нарушил, обстоятельства, доказательства, звания и уд. №."
          value={ai.situation}
          onChange={(e) => update('situation', e.target.value)}
        />
      </div>

      <div className="ai-field">
        <label>Сценарий документооборота</label>
        <select value={ai.scenario} onChange={(e) => update('scenario', e.target.value)}>
          <option value="auto">Авто — AI определит сам</option>
          <option value="reprimand">Строгач: Акт → Уведомление → Приказ</option>
          <option value="dismissal">Увольнение: Акт → Уведомление → Распоряжение → Рапорт → Приказ</option>
        </select>
      </div>

      <div className="ai-row">
        <div className="ai-field">
          <label>Дата документов</label>
          <input type="date" value={ai.date} onChange={(e) => update('date', e.target.value)} />
        </div>
        <div className="ai-field">
          <label>Начальный номер (необязательно)</label>
          <input type="text" placeholder="напр. 031" value={ai.startNum} onChange={(e) => update('startNum', e.target.value)} />
        </div>
      </div>

      <div className="actions">
        <button className="btn" disabled={busy} onClick={onGenerate}>Сгенерировать пакет</button>
        <span className={'msg' + (genMsg.err ? ' err' : '')}>{genMsg.text}</span>
        <span className={health.err ? 'msg err' : 'pill'}>{health.text}</span>
      </div>
    </div>
  );
}
