import assert from 'node:assert/strict';
import { aqiBand, healthAdvice, bestHours, worstHours, cigarettes, compareToWHO, npcState } from '../js/insights.js';
import { getCityAir, getSnapshot, loadCities, searchPlaces, getCityWeather, wmoCondition, clearCache } from '../js/data.js';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('ok  ' + name); };

await test('band edges', () => {
  const edges = [[0, 'good'], [50, 'good'], [51, 'moderate'], [100, 'moderate'], [101, 'usg'], [150, 'usg'],
    [151, 'unhealthy'], [200, 'unhealthy'], [201, 'very_unhealthy'], [300, 'very_unhealthy'], [301, 'hazardous'], [500, 'hazardous']];
  for (const [a, k] of edges) assert.equal(aqiBand(a).key, k, `aqi ${a}`);
  assert.equal(aqiBand(500).level, 5);
  assert.equal(aqiBand(120).color, '#ff7e00');
  assert.equal(aqiBand(120).label, 'Unhealthy for Sensitive Groups');
});

await test('healthAdvice', () => {
  const lo = healthAdvice(40), hi = healthAdvice(350);
  assert.equal(lo.mask, 'none');
  assert.equal(hi.mask, 'n95');
  assert.equal(lo.activities.length, 5);
  const v = (a, id) => healthAdvice(a).activities.find((x) => x.id === id).verdict;
  assert.equal(v(50, 'run'), 'go');
  assert.equal(v(120, 'run'), 'caution');
  assert.equal(v(160, 'run'), 'avoid');
  assert.equal(v(80, 'kids_play'), 'caution');
  assert.equal(v(160, 'open_windows'), 'avoid');
  for (const a of [0, 75, 125, 175, 250, 400]) {
    const n = healthAdvice(a).actions.length;
    assert.ok(n >= 2 && n <= 4);
  }
});

await test('cigarettes / WHO', () => {
  assert.equal(cigarettes(44), 2);
  assert.equal(cigarettes(11), 0.5);
  assert.equal(compareToWHO(150), 10);
});

const fmt = (d) => d.toISOString().slice(0, 13) + ':00';
function series(startISO, n, aqiFor) {
  return Array.from({ length: n }, (_, i) => {
    const t = fmt(new Date(Date.parse(startISO + ':00Z') + i * 3600e3));
    return { time: t, aqi: aqiFor(i, t), isForecast: false };
  });
}

await test('bestHours / worstHours', () => {
  const h = series('2026-01-01T09:00', 30, (i, t) => {
    const hr = +t.slice(11, 13);
    return hr === 14 || hr === 15 ? 30 : hr === 18 ? 400 : 150;
  });
  h.forEach((x, i) => { x.isForecast = i > 0; });
  const best = bestHours(h);
  assert.equal(best.length, 3);
  assert.equal(best[0].start, '2026-01-01T14:00');
  assert.equal(best[0].end, '2026-01-01T16:00');
  assert.equal(best[0].avgAqi, 30);
  assert.ok(best[0].avgAqi <= best[1].avgAqi && best[1].avgAqi <= best[2].avgAqi);
  best.forEach((w) => { const hr = +w.start.slice(11, 13); assert.ok(hr >= 6 && hr + 2 <= 21); });
  assert.ok(best[1].start >= best[0].end || best[1].end <= best[0].start);
  const worst = worstHours(h);
  assert.ok(worst.start === '2026-01-01T17:00' || worst.start === '2026-01-01T18:00');
  assert.equal(worst.avgAqi, 275);
  assert.equal(worstHours([]), null);
});

await test('WMO mapping', () => {
  const m = { 0: 'clear', 1: 'clear', 2: 'cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 57: 'drizzle',
    61: 'rain', 67: 'rain', 80: 'rain', 82: 'rain', 71: 'snow', 77: 'snow', 85: 'snow', 86: 'snow', 95: 'storm', 99: 'storm' };
  for (const [c, k] of Object.entries(m)) assert.equal(wmoCondition(+c), k, `code ${c}`);
});

await test('npcState combos', () => {
  const air = (aqi) => ({ current: { aqi, time: '2026-01-01T12:00' } });
  const wx = (o) => ({ condition: 'clear', isDay: true, precip: 0, cloudCover: 10, ...o });
  let s = npcState(air(30), wx({}));
  assert.deepEqual([s.mask, s.sunglasses, s.mood, s.umbrella, s.storm], ['none', true, 'happy', false, false]);
  s = npcState(air(130), wx({ condition: 'rain', precip: 4, cloudCover: 100 }));
  assert.deepEqual([s.mask, s.umbrella, s.mood, s.sunglasses], ['cloth', true, 'worried', false]);
  assert.ok(s.wetness > 0.5 && s.rain > 0.5 && s.clouds === 1);
  s = npcState(air(180), wx({ condition: 'storm' }));
  assert.deepEqual([s.mask, s.storm, s.rain], ['n95', true, 1]);
  s = npcState(air(250), wx({ condition: 'fog', isDay: false }));
  assert.deepEqual([s.mask, s.fog, s.isDay, s.mood], ['oxygen', true, false, 'sick']);
  s = npcState(air(450), wx({ condition: 'snow' }));
  assert.equal(s.mask, 'oxygen'); assert.equal(s.snow, true); assert.equal(s.smog, 1);
  s = npcState(air(75), null);
  assert.equal(s.isDay, true); assert.equal(s.mood, 'ok'); assert.equal(s.umbrella, false);
  assert.equal(npcState(air(75), null).caption, s.caption);
  assert.ok(typeof s.caption === 'string' && s.caption.length > 0);
});

// ---- data.js with mocked fetch ----
// A location with +05:30 offset and one with -05:00; "now" is derived from each offset.
const mkTimes = (offsetSec) => {
  const local = new Date(Date.now() + offsetSec * 1000);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 2);
  return Array.from({ length: 120 }, (_, i) => fmt(new Date(start + i * 3600e3)).slice(0, 16));
};
const payload = (offsetSec, aqi, pm25) => {
  const time = mkTimes(offsetSec);
  const f = (v) => time.map(() => v);
  return {
    utc_offset_seconds: offsetSec,
    hourly: {
      time, us_aqi: f(aqi), us_aqi_pm2_5: f(aqi), us_aqi_pm10: f(20), us_aqi_nitrogen_dioxide: f(5),
      us_aqi_ozone: time.map((_, i) => (i % 5 === 0 ? null : 10)), us_aqi_sulphur_dioxide: f(1), us_aqi_carbon_monoxide: f(2),
      pm2_5: f(pm25), pm10: f(40), carbon_monoxide: f(500), nitrogen_dioxide: f(20), sulphur_dioxide: f(5), ozone: f(30),
    },
  };
};
const calls = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  const ok = (body) => ({ ok: true, json: async () => body });
  if (u.endsWith('cities.json')) return ok([{ id: 'x', name: 'X', country: 'Y', admin1: 'Z', lat: 1, lon: 2 }]);
  if (u.startsWith('https://geocoding-api.open-meteo.com/')) {
    const q = new URL(u).searchParams;
    assert.equal(q.get('count'), '8');
    if (q.get('name') === 'nowhere') return ok({ generationtime_ms: 1 });
    return ok({ results: [{ id: 1275339, name: 'Mumbai', latitude: 19.07283, longitude: 72.88261, country: 'India', admin1: 'Maharashtra' }] });
  }
  if (u.startsWith('https://api.open-meteo.com/')) {
    return ok({ current: { time: '2026-01-01T10:00', temperature_2m: 31.2, apparent_temperature: 35, relative_humidity_2m: 70,
      precipitation: 2.5, weather_code: 63, cloud_cover: 90, wind_speed_10m: 12, is_day: 1 } });
  }
  const q = new URL(u).searchParams;
  assert.equal(q.get('past_days'), '2');
  assert.equal(q.get('timezone'), 'auto');
  assert.ok(q.get('hourly').includes('us_aqi'));
  const lats = q.get('latitude').split(',');
  const list = lats.map((_, i) => (i === 1 ? payload(-5 * 3600, 160, 70) : payload(19800, 75, 25)));
  return ok(lats.length === 1 ? list[0] : list);
};

const cityA = { id: 'a', name: 'A', country: 'C', admin1: 'S', lat: 28.61, lon: 77.21 };
const cityB = { id: 'b', name: 'B', country: 'C', admin1: 'S', lat: 40.71, lon: -74.01 };

await test('loadCities', async () => {
  assert.equal((await loadCities()).length, 1);
});

await test('cities.json shape', async () => {
  const { readFileSync } = await import('node:fs');
  const list = JSON.parse(readFileSync(new URL('../data/cities.json', import.meta.url)));
  assert.ok(list.length >= 38);
  for (const c of list) {
    assert.ok(c.id && c.name && c.country && c.admin1 !== undefined);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180);
  }
  for (const n of ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata']) assert.ok(list.some((c) => c.name === n), n);
  assert.equal(new Set(list.map((c) => c.id)).size, list.length);
});

await test('getCityAir single', async () => {
  const air = await getCityAir(cityA);
  assert.equal(air.current.aqi, 75);
  assert.equal(air.current.band.key, 'moderate');
  assert.equal(air.current.dominant, 'pm2_5');
  assert.equal(air.current.co, 0.5);
  assert.equal(air.current.pm2_5, 25);
  assert.equal(air.current.pm2_5_24h, 25);
  assert.ok(air.hourly.length > 24 && air.hourly.length <= 96);
  assert.ok(air.hourly.some((h) => h.isForecast) && !air.hourly[0].isForecast);
  assert.ok(air.hourly.every((h) => h.isForecast === (h.time > air.current.time)));
  assert.equal(air.daily.length, 3);
  assert.equal(air.daily[0].maxAqi, 75);
  const n = calls.length;
  await getCityAir(cityA);
  assert.equal(calls.length, n, 'second call served from cache');
});

await test('getSnapshot array, offsets, sorting, chunking', async () => {
  clearCache();
  calls.length = 0;
  const snap = await getSnapshot([cityA, cityB]);
  assert.equal(calls.length, 1);
  assert.deepEqual(snap.map((s) => [s.city.id, s.aqi]), [['b', 160], ['a', 75]]);
  assert.equal(snap[0].band.key, 'unhealthy');
  clearCache();
  calls.length = 0;
  const many = Array.from({ length: 120 }, (_, i) => ({ id: 'c' + i, name: 'c', lat: 10 + i / 10, lon: 70 + i / 10 }));
  assert.equal((await getSnapshot(many)).length, 120);
  assert.equal(calls.length, 3);
});

await test('searchPlaces', async () => {
  assert.deepEqual(await searchPlaces('   '), []);
  assert.deepEqual(await searchPlaces('nowhere'), []);
  const [p] = await searchPlaces('Mumbai');
  assert.deepEqual(p, { id: '1275339', name: 'Mumbai', country: 'India', admin1: 'Maharashtra', lat: 19.07, lon: 72.88 });
});

await test('getCityWeather', async () => {
  const w = await getCityWeather(cityA);
  assert.deepEqual(w, { time: '2026-01-01T10:00', temp: 31.2, feelsLike: 35, humidity: 70, precip: 2.5, windSpeed: 12,
    cloudCover: 90, isDay: true, weatherCode: 63, condition: 'rain' });
});

await test('errors are friendly', async () => {
  clearCache();
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(getCityAir(cityA), /trouble/);
  await assert.rejects(searchPlaces('x'), /trouble/);
  await assert.rejects(getCityWeather(cityA), /trouble/);
  globalThis.fetch = async () => { throw new TypeError('network'); };
  await assert.rejects(getSnapshot([cityA]), /reach/);
});

console.log(`\n${passed} test groups passed`);
