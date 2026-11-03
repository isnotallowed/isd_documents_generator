import React from 'react';
import { cropPng, saveSigner } from '../lib/engine.js';

function Label({ f }) {
  return <label>{f.label}{f.optional && <span className="opt"> — необязательно</span>}</label>;
}

function readSig(file, cb) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = async () => { try { cb(await cropPng(rd.result)); } catch (e) { console.error(e); } };
  rd.readAsDataURL(file);
}

function TextField({ f, data, touch }) {
  return (
    <div className={'f' + (f.short ? '' : ' wide')}>
      <Label f={f} />
      <input type="text" value={data[f.key] || ''} placeholder={f.ph || ''}
        onChange={(e) => { data[f.key] = e.target.value; touch(); }} />
      {f.hint && <div className="hint">{f.hint}</div>}
    </div>
  );
}

function DateField({ f, data, touch }) {
  return (
    <div className="f">
      <Label f={f} />
      <input type="date" value={data[f.key] || ''}
        onChange={(e) => { data[f.key] = e.target.value; touch(); }} />
      {f.hint && <div className="hint">{f.hint}</div>}
    </div>
  );
}

function TextAreaField({ f, data, touch }) {
  return (
    <div className="f wide">
      <Label f={f} />
      <textarea rows={f.rows || 4} value={data[f.key] || ''} placeholder={f.ph || ''}
        onChange={(e) => { data[f.key] = e.target.value; touch(); }} />
      {f.hint && <div className="hint">{f.hint}</div>}
    </div>
  );
}

function PersonRows({ p, ext, onChange }) {
  const mk = (k, ph) => (
    <input type="text" value={p[k] || ''} placeholder={ph}
      onChange={(e) => { p[k] = e.target.value; onChange(); }} />
  );
  return (
    <div className={'person' + (ext ? ' ext' : '')}>
      {mk('post', 'должность')}{mk('rank', 'звание')}{mk('name', 'имя фамилия')}
      {ext && mk('udo', 'удостоверение №')}
      {ext && mk('unit', 'подразделение')}
    </div>
  );
}

function PersonField({ f, data, touch }) {
  const p = data[f.key] || (data[f.key] = {});
  return (
    <div className="block">
      <div className="bt"><b>{f.label}</b>{f.hint && <span className="hint">{f.hint}</span>}</div>
      <PersonRows p={p} ext={f.ext} onChange={touch} />
    </div>
  );
}

function PeopleField({ f, data, touch }) {
  const list = data[f.key];
  return (
    <div className="block">
      <div className="bt"><b>{f.label}</b>{f.hint && <span className="hint">{f.hint}</span>}</div>
      {list.map((p, i) => {
        const role = f.roles ? (i === 0 ? f.roles[0] : f.roles[1]) : null;
        return (
          <div className="row" key={i}>
            <span className="n">{list.length > 1 ? i + 1 : ''}</span>
            <div>
              {role && <div className="role">{role}</div>}
              <PersonRows p={p} ext={false} onChange={() => { if (i === 0) saveSigner(p); touch(); }} />
              <div className="sigbox">
                Подпись (PNG):
                <input type="file" accept="image/png"
                  onChange={(e) => readSig(e.target.files[0], (r) => { p.sig = r.b64; p.sigRatio = r.ratio; if (i === 0) saveSigner(p); touch(); })} />
                {p.sig && <img alt="" src={'data:image/png;base64,' + p.sig} />}
                {p.sig && <button className="x" title="убрать подпись"
                  onClick={() => { delete p.sig; delete p.sigRatio; if (i === 0) saveSigner(p); touch(); }}>×</button>}
              </div>
            </div>
            {list.length > 1
              ? <button className="x" onClick={() => { list.splice(i, 1); touch(); }}>×</button>
              : <span />}
          </div>
        );
      })}
      {(!f.max || list.length < f.max) &&
        <button className="add" onClick={() => { list.push({}); touch(); }}>+ добавить человека</button>}
    </div>
  );
}

function ListField({ f, data, touch }) {
  const list = data[f.key];
  return (
    <div className="block">
      <div className="bt"><b>{f.label}</b>{f.hint && <span className="hint">{f.hint}</span>}</div>
      {list.map((v, i) => (
        <div className="row" key={i}>
          <span className="n">{i + 1}.</span>
          <input type="text" value={v || ''} placeholder={f.ph || ''}
            onChange={(e) => { list[i] = e.target.value; touch(); }} />
          <button className="x" onClick={() => { list.splice(i, 1); if (!list.length) list.push(''); touch(); }}>×</button>
        </div>
      ))}
      <button className="add" onClick={() => { list.push(''); touch(); }}>+ добавить пункт</button>
    </div>
  );
}

function AttachmentsField({ f, data, touch }) {
  const list = data[f.key];
  return (
    <div className="block">
      <div className="bt"><b>{f.label}</b><span className="hint">Пустые строки в документ не попадают</span></div>
      {list.map((a, i) => (
        <div className="row" key={i}>
          <span className="n">{i + 1}.</span>
          <div className="person" style={{ gridTemplateColumns: '3fr 1fr' }}>
            <input type="text" value={a.name || ''} placeholder="наименование" onChange={(e) => { a.name = e.target.value; touch(); }} />
            <input type="text" value={a.pages || ''} placeholder="листов" onChange={(e) => { a.pages = e.target.value; touch(); }} />
          </div>
          <button className="x" onClick={() => { list.splice(i, 1); if (!list.length) list.push({ name: '', pages: '' }); touch(); }}>×</button>
        </div>
      ))}
      <button className="add" onClick={() => { list.push({ name: '', pages: '' }); touch(); }}>+ добавить приложение</button>
    </div>
  );
}

function SigField({ f, data, touch }) {
  return (
    <div className="f wide">
      <Label f={f} />
      <div className="sigbox">
        Подпись (PNG):
        <input type="file" accept="image/png"
          onChange={(e) => readSig(e.target.files[0], (r) => { data[f.key] = r.b64; data[f.key + 'Ratio'] = r.ratio; touch(); })} />
        {data[f.key] && <img alt="" src={'data:image/png;base64,' + data[f.key]} />}
        {data[f.key] && <button className="x" title="убрать подпись"
          onClick={() => { delete data[f.key]; delete data[f.key + 'Ratio']; touch(); }}>×</button>}
      </div>
    </div>
  );
}

export function Field({ f, data, touch }) {
  switch (f.type) {
    case 'text': return <TextField f={f} data={data} touch={touch} />;
    case 'date': return <DateField f={f} data={data} touch={touch} />;
    case 'textarea': return <TextAreaField f={f} data={data} touch={touch} />;
    case 'person': return <PersonField f={f} data={data} touch={touch} />;
    case 'people': return <PeopleField f={f} data={data} touch={touch} />;
    case 'list': return <ListField f={f} data={data} touch={touch} />;
    case 'attachments': return <AttachmentsField f={f} data={data} touch={touch} />;
    case 'sig': return <SigField f={f} data={data} touch={touch} />;
    default: return null;
  }
}

const OPT_ROWS = [
  { k: 'secret', text: 'Гриф «СЕКРЕТНО»', sub: 'красная печать сверху и строка «присвоен гриф» в конце' },
  { k: 'seal', text: 'Круглая печать УСБ', sub: 'ставится между подписями, подпись заходит на печать' },
];
export function OptsBlock({ cur, data, touch }) {
  return (
    <div className="block opts">
      <div className="bt"><b>Оформление</b></div>
      {OPT_ROWS.map(({ k, text, sub }) => (
        <label className="opt-row" key={k}>
          <input type="checkbox" checked={!!data[k]} onChange={(e) => { data[k] = e.target.checked; touch(); }} />
          <span><b>{text}</b>{sub && <em>{sub}</em>}</span>
        </label>
      ))}
      {cur === 'uved' && (
        <label className="opt-row">
          <input type="checkbox" checked={!!data.ackline} onChange={(e) => { data.ackline = e.target.checked; touch(); }} />
          <span><b>Строка ознакомления</b><em>подпись ознакомленного и дата внизу</em></span>
        </label>
      )}
      {['akt', 'rasp', 'prik'].includes(cur) && (
        <label className="opt-row">
          <input type="checkbox" checked={!!data.copies} onChange={(e) => { data.copies = e.target.checked; touch(); }} />
          <span><b>Строка «Документ составлен в двух экземплярах»</b></span>
        </label>
      )}
      <label className="opt-row">
        <input type="checkbox" checked={!!data.paper} onChange={(e) => { data.paper = e.target.checked; touch(); }} />
        <span><b>Фон старой бумаги</b><em>только для вида, по умолчанию выключен</em></span>
      </label>
    </div>
  );
}
