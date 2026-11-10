// US EPA AQI bands, health advice, timing insights and the NPC state.
const BANDS = [
  { key: 'good', label: 'Good', color: '#00e400', textColor: '#000000', range: [0, 50] },
  { key: 'moderate', label: 'Moderate', color: '#ffff00', textColor: '#000000', range: [51, 100] },
  { key: 'usg', label: 'Unhealthy for Sensitive Groups', color: '#ff7e00', textColor: '#000000', range: [101, 150] },
  { key: 'unhealthy', label: 'Unhealthy', color: '#ff0000', textColor: '#ffffff', range: [151, 200] },
  { key: 'very_unhealthy', label: 'Very Unhealthy', color: '#8f3f97', textColor: '#ffffff', range: [201, 300] },
  { key: 'hazardous', label: 'Hazardous', color: '#7e0023', textColor: '#ffffff', range: [301, 500] },
].map((b, level) => ({ ...b, level }));

export function aqiBand(aqi) {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  const a = Math.round(aqi);
  const b = BANDS.find((x) => a <= x.range[1]) || BANDS[5];
  return { ...b, range: [...b.range] };
}

const ADVICE = [
  {
    headline: 'Fresh air. Go enjoy it.',
    general: 'The air is clean and poses little or no risk. A lovely day to be outdoors.',
    sensitive: 'Even people with asthma or heart conditions can carry on as usual.',
    mask: 'none',
    actions: ['Open the windows and let the house breathe.', 'Great day for a long walk or a run.'],
  },
  {
    headline: 'Air is okay for most people.',
    general: 'Air quality is acceptable. Most people will not notice anything.',
    sensitive: 'A few unusually sensitive people may feel mild symptoms. Consider shorter hard workouts outside.',
    mask: 'none',
    actions: ['Normal outdoor plans are fine.', 'If you are sensitive to pollution, keep your inhaler handy.'],
  },
  {
    headline: 'Sensitive groups, take care today.',
    general: 'Most people are fine, but longer or harder time outside may bother some.',
    sensitive: 'Children, older adults and people with asthma, lung or heart disease should cut back on long or intense outdoor effort.',
    mask: 'optional',
    actions: ['Keep strenuous workouts short or move them indoors.', 'Sensitive people: take more breaks outside.', 'Watch for coughing or a tight chest.'],
  },
  {
    headline: 'Unhealthy air. Skip the outdoor run.',
    general: 'Everyone may begin to feel effects. Cut back on prolonged or heavy exertion outside.',
    sensitive: 'Sensitive groups can feel more serious effects. Stay indoors as much as you can.',
    mask: 'n95',
    actions: ['Wear an N95 or FFP2 mask if you must go out.', 'Keep windows closed and run an air purifier if you have one.', 'Move exercise indoors.', 'Avoid busy roads.'],
  },
  {
    headline: 'Very unhealthy air. Stay indoors.',
    general: 'This is a health alert: everyone may experience serious effects. Avoid outdoor exertion.',
    sensitive: 'People with lung or heart disease, children and older adults should stay inside and rest.',
    mask: 'n95',
    actions: ['Stay indoors with windows and doors shut.', 'Wear a well-fitted N95 for any unavoidable trip.', 'Use an air purifier and keep medication close.', 'Call a doctor if you feel chest tightness or breathlessness.'],
  },
  {
    headline: 'Hazardous air. Avoid going out.',
    general: 'Emergency conditions: everyone is likely to be affected. Avoid all outdoor activity.',
    sensitive: 'People with existing illness, children and older adults are at serious risk. Stay indoors and rest.',
    mask: 'n95',
    actions: ['Do not exercise or play outdoors.', 'Seal gaps, keep windows shut and run a purifier.', 'Wear a fitted N95 for any unavoidable trip.', 'Seek medical help early if you feel unwell.'],
  },
];

// go if aqi <= goMax, caution if <= cautionMax, otherwise avoid
const ACTIVITIES = [
  { id: 'run', label: 'Running', emoji: '🏃', goMax: 50, cautionMax: 150 },
  { id: 'walk', label: 'Walking', emoji: '🚶', goMax: 100, cautionMax: 200 },
  { id: 'cycle', label: 'Cycling', emoji: '🚴', goMax: 50, cautionMax: 150 },
  { id: 'kids_play', label: 'Kids playing outside', emoji: '⚽', goMax: 50, cautionMax: 100 },
  { id: 'open_windows', label: 'Open windows', emoji: '🪟', goMax: 100, cautionMax: 150 },
];

export function healthAdvice(aqi) {
  const band = aqiBand(aqi) || BANDS[0];
  const a = ADVICE[band.level];
  return {
    headline: a.headline,
    general: a.general,
    sensitive: a.sensitive,
    mask: a.mask,
    actions: [...a.actions],
    activities: ACTIVITIES.map(({ id, label, emoji, goMax, cautionMax }) => ({
      id, label, emoji,
      verdict: aqi <= goMax ? 'go' : aqi <= cautionMax ? 'caution' : 'avoid',
    })),
  };
}

const addHours = (t, n) => new Date(Date.parse(t + ':00Z') + n * 3600e3).toISOString().slice(0, 16);

// 2h windows from the 24 hourly points after "now" (last non-forecast point).
function windows(hourly) {
  if (!Array.isArray(hourly) || !hourly.length) return [];
  let nowIdx = -1;
  hourly.forEach((h, i) => { if (!h.isForecast) nowIdx = i; });
  const next = hourly.slice(nowIdx + 1, nowIdx + 25);
  const out = [];
  for (let i = 0; i + 1 < next.length; i++) {
    const a = next[i];
    const b = next[i + 1];
    if (a.aqi == null || b.aqi == null) continue;
    if (addHours(a.time, 1) !== b.time) continue;
    const avg = Math.round((a.aqi + b.aqi) / 2);
    out.push({ start: a.time, end: addHours(a.time, 2), avgAqi: avg, band: aqiBand(avg) });
  }
  return out;
}

export function bestHours(hourly) {
  const ok = windows(hourly).filter((w) => {
    const h = Number(w.start.slice(11, 13));
    return h >= 6 && h + 2 <= 21;
  });
  ok.sort((x, y) => x.avgAqi - y.avgAqi || (x.start < y.start ? -1 : 1));
  const picked = [];
  for (const w of ok) {
    if (picked.some((p) => w.start < p.end && p.start < w.end)) continue;
    picked.push(w);
    if (picked.length === 3) break;
  }
  return picked;
}

export function worstHours(hourly) {
  let worst = null;
  for (const w of windows(hourly)) if (!worst || w.avgAqi > worst.avgAqi) worst = w;
  return worst;
}

const round1 = (x) => Math.round(x * 10) / 10;
export const cigarettes = (pm25) => round1(pm25 / 22);
export const compareToWHO = (pm25) => round1(pm25 / 15);

const CAPTIONS = {
  good: ['Crisp air today. Deep breath in!', 'Lungs say thank you.', 'Perfect day to be outside.'],
  moderate: ['Air is alright. I am fine!', 'Not bad, not perfect.', 'Business as usual, mostly.'],
  usg: ['Hmm, the air feels a bit heavy.', 'Taking it easy outside today.', 'Mask on, just in case.'],
  unhealthy: ['Cough cough. Not a great day.', 'I am heading indoors.', 'This air is rough.'],
  very_unhealthy: ['I can barely see the street!', 'Oxygen tank on. Stay safe.', 'Everyone inside, please.'],
  hazardous: ['This is hazardous. Do not go out!', 'Hard to breathe out here.', 'Emergency air. Seal the windows.'],
};
const WEATHER_CAPTIONS = {
  storm: ['Thunder! Staying put.', 'What a storm out there.'],
  snow: ['Snow day! Brrr.', 'Fresh snow everywhere.'],
  rain: ['Umbrella up. Splash!', 'Rain is rinsing the air.'],
  drizzle: ['Just a light drizzle.', 'Drizzly, but cosy.'],
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function npcState(cityAir, weather = null) {
  const cur = cityAir.current;
  const aqi = cur.aqi;
  const band = aqiBand(aqi) || BANDS[0];
  const w = weather || null;
  const cond = w ? w.condition : null;
  const raining = cond === 'drizzle' || cond === 'rain' || cond === 'storm';
  const precip = w && w.precip > 0 ? w.precip : 0;
  const isDay = w ? !!w.isDay : (() => { const h = Number(String(cur.time).slice(11, 13)); return h >= 6 && h < 18; })();

  const mask = ['none', 'none', 'cloth', 'n95', 'oxygen', 'oxygen'][band.level];
  const mood = aqi <= 50 ? 'happy' : aqi <= 100 ? 'ok' : aqi <= 200 ? 'worried' : 'sick';
  const rain = cond === 'drizzle' ? 0.3 : cond === 'rain' ? 0.4 + clamp01(precip / 8) * 0.6 : cond === 'storm' ? 1 : 0;

  let pool = CAPTIONS[band.key];
  if (band.level < 3 && WEATHER_CAPTIONS[cond]) pool = WEATHER_CAPTIONS[cond];
  const caption = pool[Math.round(aqi) % pool.length];

  return {
    mask,
    umbrella: raining,
    wetness: raining ? clamp01(Math.max(precip / 5, rain * 0.5)) : 0,
    smog: clamp01(aqi / 300),
    clouds: w && w.cloudCover != null ? clamp01(w.cloudCover / 100) : 0,
    rain,
    snow: cond === 'snow',
    storm: cond === 'storm',
    fog: cond === 'fog',
    sunglasses: cond === 'clear' && isDay && aqi <= 100,
    isDay,
    mood,
    caption,
  };
}
