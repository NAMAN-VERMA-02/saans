# Saans — shared contract (revision 2: global, US EPA AQI)

Name: **Saans** ("breath"). Repo: github.com/NAMAN-VERMA-02/saans.
Static site, no build step, vanilla ES modules, served from repo root on GitHub Pages.
Data: Open-Meteo (air quality, weather, geocoding). Free, no key, CORS ok. Fetched in the browser.

## Layout
    index.html, css/style.css, js/app.js, js/ui/*.js      UI
    js/data.js, js/insights.js                             data layer
    data/cities.json                                       ~40 world cities
    test/run.mjs, package.json                             `node test/run.mjs`

## AQI scale: US EPA AQI, taken directly from Open-Meteo `us_aqi` (no local computation). Range 0..500.
All times are LOCAL to the place ("2026-11-10T21:00"); requests use timezone=auto and "now" is found
from the response's utc_offset_seconds.

## js/data.js
    City = { id, name, country, admin1, lat, lon }
    export async function loadCities() -> City[]                  // data/cities.json
    export async function searchPlaces(query) -> City[]           // geocoding, max 8; [] for blank/no results; id = String(result.id)
    export async function getCityAir(city) -> CityAir
      CityAir = {
        city, updated: ISOString,
        current: { time, aqi, band: Band, dominant: 'pm2_5'|'pm10'|'no2'|'so2'|'o3'|'co',   // largest us_aqi_<pollutant>
                   pm2_5, pm10, no2, o3, so2, co,                // µg/m³ (co in mg/m³)
                   pm2_5_24h },                                  // trailing 24h mean of pm2_5, for cigarettes()/compareToWHO()
        hourly:  [{ time, aqi, band, pm2_5, pm10, isForecast }], // past 24h (incl. now) + next 72h
        daily:   [{ date: 'YYYY-MM-DD', minAqi, maxAqi, band }]  // today + next 2 days, band of maxAqi
      }
    export async function getCityWeather(city) -> Weather
      Weather = { time, temp (°C), feelsLike, humidity (%), precip (mm), windSpeed (km/h), cloudCover (%),
                  isDay: bool, weatherCode, condition: 'clear'|'cloudy'|'fog'|'drizzle'|'rain'|'storm'|'snow' }
    export async function getSnapshot(cities) -> [{ city, aqi, band }]  // batched, sorted worst first
    export function wmoCondition(code) -> condition               // 0-1 clear, 2-3 cloudy, 45/48 fog, 51-57 drizzle,
                                                                  // 61-67/80-82 rain, 71-77/85-86 snow, 95-99 storm
    export function clearCache()
  Errors: async functions throw Error with a human message. 10-minute in-memory cache.

## js/insights.js
    export function aqiBand(aqi) -> Band
      Band = { key: 'good'|'moderate'|'usg'|'unhealthy'|'very_unhealthy'|'hazardous', label, color, textColor,
               level: 0..5, range: [lo, hi] }
      good #00e400 0-50 | moderate #ffff00 51-100 | usg #ff7e00 101-150 ("Unhealthy for Sensitive Groups")
      unhealthy #ff0000 151-200 | very_unhealthy #8f3f97 201-300 | hazardous #7e0023 301-500
    export function healthAdvice(aqi) -> {
        headline, general, sensitive,
        mask: 'none'|'optional'|'n95',
        actions: [string],                                        // 2-4 tips
        activities: [{ id: 'run'|'walk'|'cycle'|'kids_play'|'open_windows', label, emoji, verdict: 'go'|'caution'|'avoid' }]
      }
    export function bestHours(hourly) -> [{ start, end, avgAqi, band }]  // cleanest non-overlapping 2h windows, next 24h, 06:00-21:00 local, max 3
    export function worstHours(hourly) -> { start, end, avgAqi, band } | null
    export function cigarettes(pm25_24hMean) -> number           // 22 µg/m³ ≈ 1 cigarette/day, 1 decimal
    export function compareToWHO(pm25_24hMean) -> number         // multiple of WHO 24h guideline (15 µg/m³), 1 decimal
    export function npcState(cityAir, weather|null) -> {
        mask: 'none'|'cloth'|'n95'|'oxygen',   // none: good/moderate; cloth: usg; n95: unhealthy; oxygen: very_unhealthy/hazardous
        umbrella: bool,                        // drizzle/rain/storm
        wetness: 0..1,                         // from precip mm (0 if not raining)
        smog: 0..1,                            // aqi/300 clamped
        clouds: 0..1, rain: 0..1, snow: bool, storm: bool, fog: bool,
        sunglasses: bool,                      // clear + day + aqi<=100
        isDay: bool,                           // weather.isDay, else 06-18 local hour of current.time
        mood: 'happy'|'ok'|'worried'|'sick',   // aqi <=50 / <=100 / <=200 / above
        caption                                // short line, deterministic per state (weather lines when aqi<=150 and it rains/snows/storms)
      }
