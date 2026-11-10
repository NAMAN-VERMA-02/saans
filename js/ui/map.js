// Saans map: Leaflet map of cities colored by NAQI band + ranked list. Uses getSnapshot from ../data.js.
import { getSnapshot } from '../data.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let fitted = false, L = null, map = null, markers = new Map(), snapshot = [], selectedId = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = LEAFLET + 'leaflet.css'; l.dataset.leaflet = '1';
      document.head.append(l);
    }
    const s = document.createElement('script');
    s.src = LEAFLET + 'leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.append(s);
  });
}

const select = (id) => window.dispatchEvent(new CustomEvent('aqi:select', { detail: id }));

function pinIcon(item, selected) {
  const aqi = item.aqi, band = item.band;
  const size = selected ? 38 : 30;
  const bg = aqi == null || !band ? '' : `background:${band.color};color:${band.textColor || '#111'};`;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    html: `<div class="vz-pin${selected ? ' sel' : ''}${aqi == null ? ' na' : ''}" style="${bg}width:${size}px;height:${size}px">${aqi == null ? '–' : Math.round(aqi)}</div>`,
  });
}

function drawMarkers() {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers = new Map();
  for (const item of snapshot) {
    const c = item.city;
    const m = L.marker([c.lat, c.lon], { icon: pinIcon(item, c.id === selectedId), keyboard: true, title: `${c.name}: ${item.aqi == null ? 'n/a' : Math.round(item.aqi)}`, zIndexOffset: c.id === selectedId ? 1000 : 0 });
    m.bindTooltip(`${c.name}${item.aqi == null ? '' : ' · AQI ' + Math.round(item.aqi) + (item.band ? ' · ' + item.band.label : '')}`, { direction: 'top', offset: [0, -12] });
    m.on('click', () => select(c.id));
    m.addTo(map);
    markers.set(c.id, m);
  }
}

function renderRanking() {
  const host = document.getElementById('ranking');
  if (!host) return;
  host.textContent = '';
  const valid = snapshot.filter((s) => s.aqi != null).sort((a, b) => b.aqi - a.aqi);
  if (!valid.length) return;
  const col = (title, items) => {
    const wrap = document.createElement('div');
    const h = document.createElement('h4'); h.textContent = title;
    const ol = document.createElement('ol');
    items.forEach((it, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const chip = document.createElement('span');
      chip.className = 'vz-chip';
      chip.textContent = Math.round(it.aqi);
      if (it.band) { chip.style.background = it.band.color; chip.style.color = it.band.textColor || '#111'; }
      const name = document.createElement('span');
      name.className = 'vz-name';
      name.textContent = `${i + 1}. ${it.city.name}`;
      b.append(chip, name);
      b.addEventListener('click', () => select(it.city.id));
      li.append(b); ol.append(li);
    });
    wrap.append(h, ol);
    return wrap;
  };
  const root = document.createElement('div');
  root.className = 'vz-rank';
  root.append(col('Most polluted major cities right now', valid.slice(0, 5)), col('Cleanest major cities right now', valid.slice(-5).reverse()));
  host.append(root);
}

async function onCities(e) {
  const d = e.detail; const cities = (Array.isArray(d) ? d : d && d.cities) || [];
  try {
    snapshot = await getSnapshot(cities);
  } catch (err) {
    const host = document.getElementById('ranking');
    if (host) host.textContent = 'Live city ranking unavailable right now.';
    console.warn('[saans] snapshot:', err.message);
    return;
  }
  renderRanking();
  try { L = await loadLeaflet(); } catch (err) {
    const el0 = document.getElementById('map');
    if (el0) el0.textContent = 'Map could not load.';
    console.warn('[saans] map:', err.message);
    return;
  }
  const el = document.getElementById('map');
  if (!el) return;
  if (!map) {
    map = L.map(el, { scrollWheelZoom: false, zoomControl: true, worldCopyJump: true, minZoom: 1 }).setView([20, 10], 2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  }
  if (!fitted && snapshot.length) { map.fitBounds(L.latLngBounds(snapshot.map((s) => [s.city.lat, s.city.lon])), { padding: [20, 20], maxZoom: 3 }); fitted = true; }
  drawMarkers();
  focus();
}

function focus() {
  if (!map || selectedId == null) return;
  const m = markers.get(selectedId);
  if (m) map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 });
}

window.addEventListener('aqi:cities', onCities);
window.addEventListener('aqi:data', (e) => {
  const c = e.detail && e.detail.city;
  if (!c || c.id === selectedId) return;
  selectedId = c.id;
  if (map) { drawMarkers(); focus(); }
});
