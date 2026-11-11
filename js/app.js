import * as data from './data.js';
const { loadCities, getCityAir } = data;
import { aqiBand, healthAdvice, bestHours, worstHours, cigarettes, compareToWHO } from './insights.js';

const $ = id => document.getElementById(id);
const KEY = 'saans:place';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const POLL = { pm2_5: ['PM2.5', 'µg/m³'], pm10: ['PM10', 'µg/m³'], no2: ['NO₂', 'µg/m³'], o3: ['O₃', 'µg/m³'], so2: ['SO₂', 'µg/m³'], co: ['CO', 'mg/m³'] };

let cities = [], current = null, token = 0, shownAqi = 0;

// API times are local wall-clock strings ("YYYY-MM-DDTHH:MM") for the city; format them literally.
const hm = t => { const m = /T(\d\d):(\d\d)/.exec(String(t)); if (!m) return '--'; let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m[2] === '00' ? `${h} ${ap}` : `${h}:${m[2]} ${ap}`; };
const fmtHour = hm;
const fmtDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const num = (v, d = 0) => v == null || isNaN(v) ? '--' : Number(v).toFixed(d);
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } },
};

function setStatus(msg, kind, retry) {
  const el = $('status');
  el.hidden = !msg; el.className = 'status' + (kind ? ' ' + kind : '');
  el.textContent = msg || '';
  if (retry) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = 'Try again'; b.onclick = retry;
    el.append(b);
  }
}

function countUp(el, to) {
  if (reduce || !isFinite(to)) { el.textContent = num(to); shownAqi = to; return; }
  const from = shownAqi, t0 = performance.now(), dur = 900;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step); else shownAqi = to;
  };
  requestAnimationFrame(step);
}

function render(air) {
  const c = air.current, band = c.band || aqiBand(c.aqi), adv = healthAdvice(c.aqi);
  const root = document.documentElement.style;
  root.setProperty('--band', band.color); root.setProperty('--band-ink', band.textColor || '#fff');

  $('hero-city').textContent = air.city.name;
  $('hero-state').textContent = place(air.city);
  $('hero-updated').textContent = c.time ? `Local time ${hm(c.time)}` : '';
  countUp($('aqi-num'), c.aqi);
  $('ring').setAttribute('role', 'img');
  $('ring').setAttribute('aria-label', `Air quality index ${c.aqi}, ${band.label}`);
  $('ring-fg').style.strokeDashoffset = 326.7 * (1 - Math.min(1, c.aqi / 500));
  $('scale-pin').style.left = Math.min(100, c.aqi / 5) + '%';
  $('band-badge').textContent = band.label;
  $('verdict').textContent = adv.headline;
  const dom = POLL[c.dominant];
  $('dominant').textContent = dom ? `Main pollutant: ${dom[0]}` : '';
  $('mask').textContent = { none: '😌 No mask needed', optional: '😷 A mask is optional, helpful if you are sensitive', n95: '😷 Wear a well-fitted N95 mask outdoors' }[adv.mask] || '';

  // Lungs: mean PM2.5 over the past 24 hourly (non-forecast) entries
  const past = air.hourly.filter(h => !h.isForecast && h.pm2_5 != null).slice(-24);
  const mean = past.length ? past.reduce((s, h) => s + h.pm2_5, 0) / past.length : c.pm2_5;
  $('cig').textContent = '≈ ' + num(cigarettes(mean), 1);
  $('who').textContent = num(compareToWHO(mean), 1);
  $('pm-mean').textContent = `24h mean PM2.5: ${num(mean, 1)} µg/m³ (WHO guideline 15)`;

  const tiles = $('tiles'); tiles.replaceChildren();
  for (const k of Object.keys(POLL)) {
    const d = document.createElement('div');
    d.className = 'tile' + (k === c.dominant ? ' dom' : '');
    d.innerHTML = `<div class="name">${POLL[k][0]}</div><div class="val">${num(c[k], k === 'co' ? 2 : 1)}</div><div class="unit">${POLL[k][1]}</div>` + (k === c.dominant ? '<span class="dtag">Main</span>' : '');
    tiles.append(d);
  }

  $('h-general').textContent = adv.general;
  $('h-sensitive').textContent = adv.sensitive;
  $('h-actions').replaceChildren(...adv.actions.map(a => Object.assign(document.createElement('li'), { textContent: a })));
  $('acts').replaceChildren(...adv.activities.map(a => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="em" aria-hidden="true"></span><span class="lb"></span><span class="chip ${a.verdict}"></span>`;
    li.children[0].textContent = a.emoji; li.children[1].textContent = a.label; li.children[2].textContent = a.verdict;
    return li;
  }));

  const best = bestHours(air.hourly);
  $('best-hours').replaceChildren(...(best.length ? best : [null]).map(h => {
    const li = document.createElement('li');
    if (!h) { li.textContent = 'No clear window found in the next 24 hours.'; return li; }
    li.style.setProperty('--c', h.band.color);
    li.innerHTML = '<span class="dot"></span><span class="t"></span><span class="muted"></span>';
    li.children[1].textContent = `${fmtHour(h.start)} – ${fmtHour(h.end)}`;
    li.children[2].textContent = `AQI ~${Math.round(h.avgAqi)} · ${h.band.label}`;
    return li;
  }));
  const w = worstHours(air.hourly), wEl = $('worst-hours');
  wEl.innerHTML = '<span class="dot"></span><span></span>';
  if (w) { wEl.style.setProperty('--c', w.band.color); wEl.lastChild.textContent = `${fmtHour(w.start)}${w.end !== w.start ? ' – ' + fmtHour(w.end) : ''}: AQI ~${Math.round(w.avgAqi)} (${w.band.label})`; }
  else wEl.lastChild.textContent = 'No data';

  $('outlook').replaceChildren(...(air.daily || []).slice(0, 3).map(d => {
    const li = document.createElement('li'); li.style.setProperty('--c', d.band.color);
    li.innerHTML = '<div class="d"></div><div class="r"></div><div class="l"></div>';
    li.children[0].textContent = fmtDay(d.date);
    li.children[1].textContent = `${Math.round(d.minAqi)}–${Math.round(d.maxAqi)}`;
    li.children[2].textContent = d.band.label;
    return li;
  }));
}

const WX = { clear: '☀️', cloudy: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', storm: '⛈️', snow: '❄️' };
function renderWeather(w) {
  const el = $('wx');
  if (!w || w.temp == null) { el.hidden = true; return; }
  const em = w.condition === 'clear' && w.isDay === 0 ? '🌙' : (WX[w.condition] || '🌡️');
  el.textContent = `${em} ${Math.round(w.temp)}°C · ${w.condition ? w.condition[0].toUpperCase() + w.condition.slice(1) : ''}`;
  el.hidden = false;
}

async function select(city, { save = true } = {}) {
  if (!city) return;
  const my = ++token; current = city;
  $('city-input').value = `${city.name}`;
  if (save) store.set(city);
  $('content').classList.add('loading');
  setStatus(`Loading air quality for ${city.name}…`);
  try {
    const [ar, wr] = await Promise.allSettled([getCityAir(city), data.getCityWeather ? data.getCityWeather(city) : Promise.reject()]);
    if (my !== token) return;
    if (ar.status === 'rejected') throw ar.reason;
    const air = ar.value, weather = wr.status === 'fulfilled' ? wr.value : null;
    render(air); renderWeather(weather);
    setStatus('');
    window.dispatchEvent(new CustomEvent('aqi:data', { detail: { city, air, cities, weather } }));
  } catch (e) {
    if (my !== token) return;
    setStatus(`Could not load data for ${city.name}: ${e.message || 'network error'}.`, 'error', () => select(city, { save: false }));
  } finally {
    if (my === token) $('content').classList.remove('loading');
  }
}

const findCity = q => {
  q = q.trim().toLowerCase();
  return cities.find(c => c.name.toLowerCase() === q || c.id === q) ||
    cities.find(c => c.name.toLowerCase().startsWith(q)) || cities.find(c => c.name.toLowerCase().includes(q));
};

window.addEventListener('buddy:mood', e => {
  const el = $('buddy-caption'), t = e.detail && e.detail.text;
  if (!t) return;
  el.textContent = t; el.hidden = false;
});

const place = c => [c.admin1 || c.state, c.country].filter(Boolean).join(', ');
const TZ_ALIAS = { 'Asia/Calcutta': 'Delhi', 'Asia/Kolkata': 'Delhi', 'America/Los_Angeles': 'Los Angeles', 'America/New_York': 'New York', 'Asia/Saigon': 'Ho Chi Minh City', 'Europe/Kyiv': 'Kyiv', 'Asia/Shanghai': 'Beijing' };
function guessCity() {
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  const seg = (TZ_ALIAS[tz] || tz.split('/').pop().replace(/_/g, ' ')).toLowerCase();
  return cities.find(c => c.name.toLowerCase() === seg) || cities.find(c => c.name.toLowerCase() === 'london') || cities[0];
}

// Combobox: local quick-picks instantly, global geocoding results after a 300ms debounce.
let opts = [], active = -1, debTimer, searchSeq = 0;
function showList(items, msg) {
  const ul = $('city-list'); opts = items; active = -1;
  ul.replaceChildren(...(items.length ? items.map((c, i) => {
    const li = document.createElement('li'); li.role = 'option'; li.id = 'opt' + i;
    li.append(document.createTextNode(c.name));
    const s = place(c); if (s) { const m = document.createElement('small'); m.textContent = ', ' + s; li.append(m); }
    li.addEventListener('mousedown', e => { e.preventDefault(); choose(c); });
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'none', textContent: msg || 'No matches' })]));
  ul.hidden = false; $('city-input').setAttribute('aria-expanded', 'true');
}
const hideList = () => { $('city-list').hidden = true; $('city-input').setAttribute('aria-expanded', 'false'); active = -1; };
function choose(c) { hideList(); $('city-input').blur(); select(c); }
function mark(i) {
  if (!opts.length) return;
  active = (i + opts.length) % opts.length;
  [...$('city-list').children].forEach((l, k) => l.setAttribute('aria-selected', k === active));
  $('city-input').setAttribute('aria-activedescendant', 'opt' + active);
  $('city-list').children[active].scrollIntoView({ block: 'nearest' });
}
function onType() {
  const raw = $('city-input').value.trim(), q = raw.toLowerCase();
  const local = (q ? cities.filter(c => c.name.toLowerCase().includes(q)) : cities).slice(0, 12);
  clearTimeout(debTimer);
  if (q.length < 2) return showList(local);
  showList(local, 'Searching…');
  const seq = ++searchSeq;
  debTimer = setTimeout(async () => {
    try {
      const res = data.searchPlaces ? await data.searchPlaces(raw) : [];
      if (seq !== searchSeq || $('city-list').hidden) return;
      const seen = new Set(), all = [];
      for (const c of [...local, ...res]) { const k = c.name.toLowerCase() + '|' + (+c.lat).toFixed(0) + (+c.lon).toFixed(0); if (!seen.has(k)) { seen.add(k); all.push(c); } }
      showList(all.slice(0, 10), 'No matching places');
    } catch { if (seq === searchSeq) showList(local, 'Search is unavailable right now'); }
  }, 300);
}

async function init() {
  const inp = $('city-input');
  $('search-form').addEventListener('submit', e => { e.preventDefault(); const c = opts[Math.max(active, 0)]; if (c) choose(c); });
  inp.addEventListener('input', onType);
  inp.addEventListener('focus', e => { e.target.select(); onType(); });
  inp.addEventListener('blur', () => setTimeout(hideList, 120));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if ($('city-list').hidden) onType(); else mark(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(active - 1); }
    else if (e.key === 'Escape') hideList();
  });
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Location is not available in this browser.', 'error');
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      p => select({ id: 'here', name: 'Your location', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }, { save: false }),
      () => setStatus('Could not get your location. Search for a city instead.', 'error'),
      { timeout: 10000, maximumAge: 600000 });
  });
  window.addEventListener('aqi:select', e => { const d = e.detail, c = d && typeof d === 'object' ? d : cities.find(c => c.id === d); if (c) { select(c); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); } });

  try {
    cities = await loadCities();
  } catch (e) {
    return setStatus('Could not load the city list: ' + (e.message || 'network error'), 'error', () => location.reload());
  }
  window.dispatchEvent(new CustomEvent('aqi:cities', { detail: cities }));
  const saved = store.get();
  select(saved && saved.lat != null && saved.id !== 'here' ? saved : guessCity(), { save: false });
}
init();
