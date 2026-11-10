// Open-Meteo air quality (US AQI), weather and geocoding. No key, runs in the browser.
import { aqiBand } from './insights.js';

const AQ_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WX_API = 'https://api.open-meteo.com/v1/forecast';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const VARS = [
  'us_aqi', 'us_aqi_pm2_5', 'us_aqi_pm10', 'us_aqi_nitrogen_dioxide', 'us_aqi_ozone',
  'us_aqi_sulphur_dioxide', 'us_aqi_carbon_monoxide',
  'pm10', 'pm2_5', 'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone',
].join(',');
const SUB = {
  us_aqi_pm2_5: 'pm2_5', us_aqi_pm10: 'pm10', us_aqi_nitrogen_dioxide: 'no2',
  us_aqi_ozone: 'o3', us_aqi_sulphur_dioxide: 'so2', us_aqi_carbon_monoxide: 'co',
};
const TTL = 10 * 60 * 1000;
const CHUNK = 50;
const cache = new Map(); // "lat,lon" -> { at, air }
const wxCache = new Map();
let citiesCache = null;

const key = (c) => `${(+c.lat).toFixed(2)},${(+c.lon).toFixed(2)}`;
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const fresh = (e) => e && Date.now() - e.at < TTL;

async function getJson(url, what) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Could not reach the ${what} service. Please check your connection and try again.`);
  }
  if (!res.ok) throw new Error(`The ${what} service is having trouble right now (error ${res.status}). Please try again shortly.`);
  try {
    return await res.json();
  } catch {
    throw new Error(`The ${what} service sent an unreadable response. Please try again.`);
  }
}

export async function loadCities() {
  if (citiesCache) return citiesCache;
  const res = await getJson(new URL('../data/cities.json', import.meta.url), 'city list');
  citiesCache = res;
  return citiesCache;
}

async function request(cities) {
  const lat = cities.map((c) => (+c.lat).toFixed(2)).join(',');
  const lon = cities.map((c) => (+c.lon).toFixed(2)).join(',');
  const json = await getJson(`${AQ_API}?latitude=${lat}&longitude=${lon}&hourly=${VARS}&past_days=2&forecast_days=3&timezone=auto`, 'air quality');
  const list = Array.isArray(json) ? json : [json];
  if (list.length !== cities.length || list.some((x) => !x || !x.hourly || !Array.isArray(x.hourly.time))) {
    throw new Error('The air quality service returned unexpected data. Please try again.');
  }
  return list;
}

// Local "now" for a location as "YYYY-MM-DDTHH:00", using its UTC offset.
const localHour = (offsetSec, now = Date.now()) =>
  new Date(now + (offsetSec || 0) * 1000).toISOString().slice(0, 13) + ':00';

function trailingMean(values, i, window) {
  let sum = 0, n = 0;
  for (let j = Math.max(0, i - window + 1); j <= i; j++) {
    if (values[j] != null) { sum += values[j]; n++; }
  }
  return n >= Math.ceil(window * 0.75) ? sum / n : null;
}

export function buildCityAir(city, payload, now = Date.now()) {
  const h = payload.hourly;
  const n = h.time.length;
  const col = (k) => h[k] || new Array(n).fill(null);
  const aqiCol = col('us_aqi');
  const nowStr = localHour(payload.utc_offset_seconds, now);

  let idx = -1;
  for (let i = 0; i < n; i++) if (h.time[i] <= nowStr && aqiCol[i] != null) idx = i;
  if (idx < 0) throw new Error('No air quality reading is available for this place right now.');

  const hourly = [];
  for (let i = Math.max(0, idx - 23); i <= Math.min(n - 1, idx + 72); i++) {
    if (aqiCol[i] == null) continue;
    hourly.push({
      time: h.time[i], aqi: Math.round(aqiCol[i]), band: aqiBand(aqiCol[i]),
      pm2_5: r1(col('pm2_5')[i]), pm10: r1(col('pm10')[i]), isForecast: i > idx,
    });
  }

  const today = nowStr.slice(0, 10);
  const daily = [];
  for (let d = 0; d < 3; d++) {
    const date = new Date(Date.parse(today + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
    const vals = [];
    for (let i = 0; i < n; i++) if (aqiCol[i] != null && h.time[i].startsWith(date)) vals.push(Math.round(aqiCol[i]));
    if (!vals.length) continue;
    const maxAqi = Math.max(...vals);
    daily.push({ date, minAqi: Math.min(...vals), maxAqi, band: aqiBand(maxAqi) });
  }

  let dominant = null, best = -1;
  for (const [k, short] of Object.entries(SUB)) {
    const v = col(k)[idx];
    if (v != null && v > best) { best = v; dominant = short; }
  }
  if (!dominant) dominant = 'pm2_5';

  const co = col('carbon_monoxide')[idx];
  const aqi = Math.round(aqiCol[idx]);
  return {
    city,
    updated: new Date(now).toISOString(),
    current: {
      time: h.time[idx], aqi, band: aqiBand(aqi), dominant,
      pm2_5: r1(col('pm2_5')[idx]), pm10: r1(col('pm10')[idx]),
      no2: r1(col('nitrogen_dioxide')[idx]), o3: r1(col('ozone')[idx]),
      so2: r1(col('sulphur_dioxide')[idx]),
      co: co == null ? null : Math.round(co / 10) / 100, // µg/m³ -> mg/m³
      pm2_5_24h: r1(trailingMean(col('pm2_5'), idx, 24)),
    },
    hourly,
    daily,
  };
}

export async function getCityAir(city) {
  const hit = cache.get(key(city));
  if (fresh(hit)) return { ...hit.air, city };
  const [payload] = await request([city]);
  const air = buildCityAir(city, payload);
  cache.set(key(city), { at: Date.now(), air });
  return air;
}

export async function getSnapshot(cities) {
  const out = [];
  const missing = [];
  for (const c of cities) {
    const hit = cache.get(key(c));
    if (fresh(hit)) out.push({ city: c, aqi: hit.air.current.aqi, band: hit.air.current.band });
    else missing.push(c);
  }
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const payloads = await request(chunk);
    chunk.forEach((c, j) => {
      try {
        const air = buildCityAir(c, payloads[j]);
        cache.set(key(c), { at: Date.now(), air });
        out.push({ city: c, aqi: air.current.aqi, band: air.current.band });
      } catch {
        // skip places with no usable data
      }
    });
  }
  if (!out.length) throw new Error('No air quality data is available right now. Please try again shortly.');
  return out.sort((a, b) => b.aqi - a.aqi);
}

export async function searchPlaces(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const json = await getJson(`${GEO_API}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`, 'place search');
  return (json.results || []).map((r) => ({
    id: String(r.id), name: r.name, country: r.country || '', admin1: r.admin1 || '',
    lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100,
  }));
}

export function wmoCondition(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloudy';
}

export async function getCityWeather(city) {
  const k = key(city);
  const hit = wxCache.get(k);
  if (fresh(hit)) return hit.wx;
  const url = `${WX_API}?latitude=${(+city.lat).toFixed(2)}&longitude=${(+city.lon).toFixed(2)}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day&timezone=auto';
  const json = await getJson(url, 'weather');
  const c = json && json.current;
  if (!c) throw new Error('The weather service returned unexpected data. Please try again.');
  const wx = {
    time: c.time, temp: c.temperature_2m, feelsLike: c.apparent_temperature, humidity: c.relative_humidity_2m,
    precip: c.precipitation, windSpeed: c.wind_speed_10m, cloudCover: c.cloud_cover,
    isDay: c.is_day === 1, weatherCode: c.weather_code, condition: wmoCondition(c.weather_code),
  };
  wxCache.set(k, { at: Date.now(), wx });
  return wx;
}

export function clearCache() {
  cache.clear();
  wxCache.clear();
}
