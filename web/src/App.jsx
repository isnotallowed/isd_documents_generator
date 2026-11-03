import React, { useEffect, useState } from 'react';
import { SCHEMAS, blank, example, loadSigner } from './lib/engine.js';
import {
  PIPELINES, api, getLegislation, legisStatus, systemPrompt,
  classifyScenario, genDoc, coerceDoc,
} from './lib/ai.js';
import Sidebar from './components/Sidebar.jsx';
import AIPanel from './components/AIPanel.jsx';
import PacketView from './components/PacketView.jsx';
import DocumentForm, { downloadPdf } from './components/DocumentForm.jsx';
import PreviewPane from './components/PreviewPane.jsx';

export default function App() {
  const [mode, setMode] = useState('ai');            // 'ai' | 'packet' | 'form'
  const [cur, setCur] = useState(null);
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);          // bump → перерисовка формы + предпросмотра
  const [packet, setPacket] = useState([]);
  const [packetIndex, setPacketIndex] = useState(-1);
  const [scen, setScen] = useState('reprimand');

  const [ai, setAi] = useState({ situation: '', scenario: 'auto', date: today(), startNum: '' });
  const [genMsg, setGenMsg] = useState({ text: '', err: false });
  const [busy, setBusy] = useState(false);
  const [legis, setLegis] = useState(null);
  const [health, setHealth] = useState({ text: 'проверяю сервер…', err: false });

  const touch = () => setVersion((v) => v + 1);
  const updateAi = (field, value) => setAi((s) => ({ ...s, [field]: value }));

  useEffect(() => {
    getLegislation().then(setLegis).catch(() => {});
    (async () => {
      try {
        const h = await api('/api/health');
        setHealth(h.deepseek ? { text: 'DeepSeek: ' + h.model, err: false } : { text: 'DeepSeek: ключ не задан в config.json', err: true });
      } catch {
        setHealth({ text: 'Сервер не отвечает — запустите «node server.js»', err: true });
      }
    })();
  }, []);

  function openAI() { setMode('ai'); }

  function openManual(code) {
    const sc = SCHEMAS[code];
    const d = { ...blank(sc), ...(example(code) || {}) };
    const sv = loadSigner();
    if (sv && sv.name && d.signers) d.signers[0] = { ...sv };
    setCur(code); setData(d); setPacketIndex(-1); setMode('form'); touch();
  }

  function openGenerated(i) {
    const it = packet[i];
    if (!it) return;
    setCur(it.type); setData(it.data); setPacketIndex(i); setMode('form'); touch();
  }

  function clearForm() {
    const sc = SCHEMAS[cur];
    const keep = { secret: data.secret, seal: data.seal, copies: data.copies, ackline: data.ackline, paper: data.paper };
    const d = { ...blank(sc), ...keep };
    if (packetIndex >= 0 && packet[packetIndex]) packet[packetIndex].data = d;
    setData(d); touch();
  }

  async function reloadLaws() {
    setLegis({ updatedAt: null, text: '' });
    try { setLegis(await getLegislation(true)); } catch { /* ignore */ }
  }

  async function generate() {
    if (busy) return;
    if (!ai.situation.trim()) { setGenMsg({ text: 'Сначала опишите ситуацию.', err: true }); return; }
    setBusy(true); setGenMsg({ text: '', err: false });
    try {
      const l = await getLegislation();
      const sys = systemPrompt(l.text, ai.situation);
      let s = ai.scenario === 'auto' ? null : ai.scenario;
      if (!s) { setGenMsg({ text: 'Определяю сценарий…', err: false }); s = await classifyScenario(sys, ai.situation); }
      const order = PIPELINES[s];
      const built = [];
      for (let i = 0; i < order.length; i++) {
        const t = order[i];
        setGenMsg({ text: `Генерирую ${i + 1}/${order.length}: ${SCHEMAS[t].name}…`, err: false });
        const d = await genDoc(sys, t, ai.situation, s, ai.date, ai.startNum);
        built.push({ type: t, data: coerceDoc(t, d), note: t === 'prik' ? 'сгенерирован — проверьте и при необходимости поправьте' : '' });
      }
      setPacket(built); setScen(s); setMode('packet'); setGenMsg({ text: '', err: false });
    } catch (e) {
      setGenMsg({ text: 'Не удалось: ' + e.message, err: true });
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    for (const it of packet) {
      try { await downloadPdf(it.type, it.data); await new Promise((r) => setTimeout(r, 300)); }
      catch (e) { console.error(e); }
    }
  }

  const banner = (mode === 'form' && packetIndex >= 0) ? (
    <div className="gen-banner">
      <button className="btn ghost" onClick={() => setMode('packet')}>← К пакету</button>
      <span>Документ {packetIndex + 1} из {packet.length}: {SCHEMAS[cur].name}</span>
      {packet[packetIndex]?.note && <span className="gen-note">{packet[packetIndex].note}</span>}
      {packetIndex < packet.length - 1 &&
        <button className="btn ghost" onClick={() => openGenerated(packetIndex + 1)}>Следующий →</button>}
    </div>
  ) : null;

  return (
    <div className="app">
      <Sidebar mode={mode} cur={cur} onAI={openAI} onOpen={openManual} />
      <main>
        <div className="layout">
          <div className="col-main">
            {mode === 'ai' && (
              <AIPanel
                ai={ai} update={updateAi}
                legisText={legisStatus(legis)}
                onReloadLaws={reloadLaws}
                onGenerate={generate}
                genMsg={genMsg} busy={busy} health={health}
              />
            )}
            {mode === 'packet' && (
              <PacketView
                packet={packet} scen={scen}
                onOpen={openGenerated} onDownloadAll={downloadAll}
                onBack={openAI}
              />
            )}
            {mode === 'form' && data && (
              <DocumentForm cur={cur} data={data} touch={touch} banner={banner} onClear={clearForm} />
            )}
          </div>
          <PreviewPane cur={mode === 'form' ? cur : null} data={mode === 'form' ? data : null} version={version} />
        </div>
      </main>
    </div>
  );
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
