// Saans chart: inline SVG AQI timeline. Listens to window 'aqi:data' and renders into #chart.
const BANDS = [
  { max: 50,  color: '#00e400', label: 'Good' },
  { max: 100, color: '#ffe600', label: 'Moderate' },
  { max: 150, color: '#ff7e00', label: 'Unhealthy for sensitive groups' },
  { max: 200, color: '#ff2a2a', label: 'Unhealthy' },
  { max: 300, color: '#8f3f97', label: 'Very unhealthy' },
  { max: Infinity, color: '#7e0023', label: 'Hazardous' },
];
const NS = 'http://www.w3.org/2000/svg';
const bandOf = (v) => BANDS.find((b) => v <= b.max);
// API times are city-local wall-clock strings ("2026-11-10T21:00"): parse fields as UTC so output is timezone-independent.
const parseWall = (s) => {
  const m = /(\d+)-(\d+)-(\d+)T(\d+):(\d+)/.exec(s || '');
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
};
let last = null;

function el(name, attrs = {}, text) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  const host = document.getElementById('chart');
  if (!host) return;
  host.textContent = '';
  const rows = ((last && last.air && last.air.hourly) || [])
    .map((h) => ({ t: parseWall(h.time), aqi: h.aqi, fc: !!h.isForecast }))
    .filter((h) => Number.isFinite(h.t) && Number.isFinite(h.aqi));
  if (rows.length < 2) {
    host.append(Object.assign(document.createElement('div'), { className: 'vz-empty', textContent: 'No chart data available.' }));
    return;
  }
  const W = Math.max(280, host.clientWidth || 600);
  const H = W < 480 ? 240 : 300;
  const m = { l: 34, r: 10, t: 14, b: 34 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const t0 = rows[0].t, t1 = rows[rows.length - 1].t;
  const maxV = Math.max(...rows.map((r) => r.aqi));
  const yMax = Math.min(500, Math.max(150, Math.ceil((maxV * 1.1) / 50) * 50));
  const X = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const Y = (v) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;
  let nowT = t0;
  for (const r of rows) if (!r.fc) nowT = r.t;

  const svg = el('svg', { class: 'vz-svg', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `AQI over time for ${(last.city && last.city.name) || 'city'}, past 24 hours and next 72 hours` });

  let lo = 0;
  for (const b of BANDS) {
    if (lo >= yMax) break;
    const hi = Math.min(b.max === Infinity ? yMax : b.max, yMax);
    svg.append(el('rect', { x: m.l, y: Y(hi), width: iw, height: Math.max(0, Y(lo) - Y(hi)), fill: b.color, opacity: 0.22 }));
    if (Y(lo) - Y(hi) > 14 && W > 360) svg.append(el('text', { class: 'vz-band-lbl', x: m.l + iw - 4, y: Y(hi) + 12, 'text-anchor': 'end' }, b.label));
    lo = hi;
  }
  const step = yMax > 250 ? 100 : 50;
  for (let v = 0; v <= yMax; v += step) {
    svg.append(el('line', { class: 'vz-grid', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }));
    svg.append(el('text', { class: 'vz-axis', x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, v));
  }
  const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  for (let t = Math.floor(t0 / 864e5) * 864e5 + 864e5; t < t1; t += 864e5) {
    const x = X(t);
    svg.append(el('line', { class: 'vz-grid', x1: x, x2: x, y1: m.t, y2: m.t + ih }));
    svg.append(el('text', { class: 'vz-axis', x: Math.min(x + 4, W - 40), y: H - 12 }, fmtDay.format(new Date(t))));
  }

  const past = rows.filter((r) => r.t <= nowT), fut = rows.filter((r) => r.t >= nowT);
  const seg = (arr, cls, op) => {
    if (arr.length < 2) return;
    const p = arr.map((r) => `${X(r.t).toFixed(1)},${Y(r.aqi).toFixed(1)}`);
    svg.append(el('polygon', { class: 'vz-area', opacity: op, points: `${X(arr[0].t)},${m.t + ih} ${p.join(' ')} ${X(arr[arr.length - 1].t)},${m.t + ih}` }));
    svg.append(el('polyline', { class: 'vz-line ' + cls, points: p.join(' ') }));
  };
  seg(past, 'past', 0.04);
  seg(fut, 'fut', 0.1);

  const xn = X(nowT), flip = xn > W - 50;
  svg.append(el('line', { class: 'vz-now', x1: xn, x2: xn, y1: m.t, y2: m.t + ih }));
  svg.append(el('text', { class: 'vz-nowlbl', x: xn + (flip ? -4 : 4), y: m.t + 10, 'text-anchor': flip ? 'end' : 'start' }, 'Now'));

  const cursor = el('line', { class: 'vz-cursor', y1: m.t, y2: m.t + ih, visibility: 'hidden' });
  const dot = el('circle', { class: 'vz-dot', r: 4.5, visibility: 'hidden' });
  svg.append(cursor, dot);
  const tip = document.createElement('div');
  tip.className = 'vz-tip';
  const fmtT = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const t = t0 + ((px - m.l) / iw) * (t1 - t0);
    let best = rows[0];
    for (const q of rows) if (Math.abs(q.t - t) < Math.abs(best.t - t)) best = q;
    const x = X(best.t), y = Y(best.aqi), b = bandOf(best.aqi);
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('visibility', 'visible');
    tip.textContent = '';
    const bEl = document.createElement('b'); bEl.textContent = `AQI ${Math.round(best.aqi)}`;
    const sw = document.createElement('span'); sw.textContent = ` ${b.label}`;
    const when = document.createElement('div');
    when.textContent = fmtT.format(new Date(best.t)) + (best.fc ? ' (forecast)' : '');
    tip.append(bEl, sw, when);
    tip.style.left = `${Math.min(Math.max((x / W) * r.width, 60), r.width - 60)}px`;
    tip.style.top = `${(y / H) * r.height - 10}px`;
    tip.classList.add('on');
  };
  const hide = () => { cursor.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
  host.append(svg, tip);
}

window.addEventListener('aqi:data', (e) => { last = e.detail; render(); });
let rt, lastW = 0;
const onResize = () => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    const h = document.getElementById('chart');
    if (last && h && h.clientWidth !== lastW) { lastW = h.clientWidth; render(); }
  }, 120);
};
window.addEventListener('resize', onResize);
if (typeof ResizeObserver !== 'undefined') {
  const bind = () => { const h = document.getElementById('chart'); if (h) new ResizeObserver(onResize).observe(h); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bind) : bind();
}
export { render as renderChart };
