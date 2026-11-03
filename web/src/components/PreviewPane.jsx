import React, { useEffect, useRef, useState } from 'react';
import { preview as osbPreview, ASSETS } from '../lib/engine.js';

const b64buf = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0)).buffer;
let fontsPromise = null;
const loadFonts = () => fontsPromise || (fontsPromise = Promise.all(
  [['PVReg', ASSETS.fontRegular], ['PVBold', ASSETS.fontBold]].map(async ([n, b]) => {
    const f = new FontFace(n, b64buf(b)); await f.load(); document.fonts.add(f);
  })));
const imgCache = new Map();
const loadImg = (src) => {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((ok, no) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + src;
  }));
  return imgCache.get(src);
};
const rgbCss = (c) => c ? `rgb(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)})` : '#000';

export default function PreviewPane({ cur, data, version }) {
  const bodyRef = useRef(null);
  const resRef = useRef(null);
  const seqRef = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState('');

  async function paint(res) {
    const body = bodyRef.current;
    if (!res || !body) return;
    const wCss = Math.round((body.clientWidth - 28) * zoom);
    if (wCss < 120) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), k = wCss * dpr / res.W;
    const imgs = new Map();
    for (const p of res.pages) for (const c of p) if (c.k === 'i' && !imgs.has(c.src)) imgs.set(c.src, await loadImg(c.src));
    const canvases = res.pages.map((cmds, n) => {
      const cv = document.createElement('canvas');
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `Страница ${n + 1} из ${res.pages.length}`);
      cv.width = Math.round(res.W * k); cv.height = Math.round(res.H * k);
      cv.style.width = wCss + 'px'; cv.style.height = Math.round(wCss * res.H / res.W) + 'px';
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(k, 0, 0, k, 0, 0); g.textBaseline = 'alphabetic'; g.fontKerning = 'none';
      for (const c of cmds) {
        if (c.k === 'i') g.drawImage(imgs.get(c.src), c.x, res.H - c.y - c.h, c.w, c.h);
        else if (c.k === 't') { g.font = `${c.sz}px ${c.b ? 'PVBold' : 'PVReg'}`; g.fillStyle = '#000'; g.fillText(c.t, c.x, res.H - c.y); }
        else if (c.k === 'l') { g.strokeStyle = rgbCss(c.c); g.lineWidth = c.th; g.beginPath(); g.moveTo(c.x1, res.H - c.y1); g.lineTo(c.x2, res.H - c.y2); g.stroke(); }
        else if (c.k === 'c') { g.fillStyle = '#000'; g.beginPath(); g.arc(c.x, res.H - c.y, c.r, 0, 7); g.fill(); }
      }
      return cv;
    });
    const st = body.scrollTop; body.replaceChildren(...canvases); body.scrollTop = st;
  }

  async function update() {
    if (!cur || !data) return;
    const my = ++seqRef.current; setStatus('обновляю…');
    try {
      await loadFonts();
      const res = await osbPreview(cur, data);
      if (my !== seqRef.current) return;
      resRef.current = res; await paint(res);
      if (my === seqRef.current) setStatus(`А4 · ${res.pages.length} стр.`);
    } catch (e) { if (my === seqRef.current) setStatus('не удалось построить предпросмотр'); console.error(e); }
  }

  // перестроение (дебаунс) при смене документа или правках
  useEffect(() => {
    if (!cur || !data) { if (bodyRef.current) bodyRef.current.replaceChildren(); setStatus(''); return; }
    const t = setTimeout(update, 200);
    return () => clearTimeout(t);
  }, [cur, version]);

  // перерисовка при зуме
  useEffect(() => { paint(resRef.current); }, [zoom]);

  // перерисовка при изменении ширины
  useEffect(() => {
    const body = bodyRef.current; if (!body) return;
    let t;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => paint(resRef.current), 120); });
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="pvx">
      <div className="pvx-h">
        <b>Предпросмотр</b><span className="pvx-st">{status}</span>
        <button className="pvx-b" title="Мельче" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))}>−</button>
        <button className="pvx-b" title="По ширине" onClick={() => setZoom(1)}>По ширине</button>
        <button className="pvx-b" title="Крупнее" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(2)))}>+</button>
      </div>
      <div className="pvx-body" ref={bodyRef}></div>
    </section>
  );
}
