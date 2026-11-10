# Saans 🌬️

A live 3D air quality and health explorer for any city on Earth. *Saans* is Hindi for "breath".

![live](https://img.shields.io/badge/live-GitHub%20Pages-brightgreen)
![data](https://img.shields.io/badge/data-Open--Meteo%20%2F%20CAMS-blue)
![no API keys](https://img.shields.io/badge/no%20API%20keys-yes-success)
![license](https://img.shields.io/badge/license-MIT-green)

**Live: https://naman-verma-02.github.io/saans/**

---

## Why

Air pollution is one of the largest environmental health risks in the world, and it quietly shapes how long and how well people live. Raw AQI numbers do not tell you what to do, though, and most apps stop at a color on a map. Saans turns the numbers into plain advice: should you run, let the kids out, open the windows, or wear a mask today?

## Features

- 🌍 **3D globe of world cities**, each colored by its live US AQI band
- 🧍 **A 3D buddy that reacts to live conditions**: an umbrella in rain, a mask and oxygen cylinder in bad air, sunglasses on clear, clean days
- 🩺 **Plain-language health verdict** with an activity guide for running, walking, cycling, kids playing outside, and opening windows
- ⏱️ **Best and worst 2-hour windows** to be outside in the next 24 hours
- 📅 **3-day forecast** of AQI for the place you pick
- 🚬 **Cigarette equivalence** of today's PM2.5, plus a multiple of the WHO 24-hour guideline
- 🔎 **Search any place on Earth** by name

## Where the data comes from

Air quality comes from the [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api), which serves the global model of the [Copernicus Atmosphere Monitoring Service (CAMS)](https://atmosphere.copernicus.eu/), run by the EU's ECMWF. Weather and geocoding come from Open-Meteo.

Important limits:

- This is independent global model data. It is **not** a national government's ground-station network.
- AQI values use the **US EPA scale**, taken directly from Open-Meteo's `us_aqi` field.
- Values are model estimates. Saans is **not a medical device**.
- Cigarette equivalence uses the Berkeley Earth rule of thumb: 22 µg/m³ of PM2.5 averaged over 24 hours is roughly one cigarette.

## AQI bands

| AQI | Label | What to do |
|---|---|---|
| 0–50 | Good | Air is fine. Enjoy outdoor activities. |
| 51–100 | Moderate | Acceptable. Unusually sensitive people should consider limiting long outdoor exertion. |
| 101–150 | Unhealthy for Sensitive Groups | Children, older adults, and people with asthma or heart disease should cut back on heavy or long outdoor exertion. |
| 151–200 | Unhealthy | Everyone may feel effects. Sensitive groups avoid long outdoor exertion; others reduce it. |
| 201–300 | Very Unhealthy | Health alert. Everyone may feel more serious effects. Avoid outdoor exertion. |
| 301–500 | Hazardous | Emergency conditions. Everyone should stay indoors and avoid outdoor exertion. |

## How it works

Saans is a static site. It uses vanilla ES modules with no build step, no backend, and no API keys. [three.js](https://threejs.org/) draws the 3D globe and the buddy. The browser fetches data directly from Open-Meteo, and responses are cached in memory for 10 minutes.

```
saans/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js            # entry point, wiring and state
│   ├── ui/               # globe, panels, buddy, search
│   ├── data.js           # Open-Meteo calls, 10-min cache
│   └── insights.js       # AQI bands, health advice, best/worst hours
├── data/
│   └── cities.json       # ~40 world cities
├── test/
│   └── run.mjs          # plain Node test runner, no deps
└── .github/
    └── workflows/
        └── pages.yml    # deploys to GitHub Pages on push to main
```

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Run the tests with Node 18 or newer. There are no dependencies to install:

```bash
node test/run.mjs
```

## Deploy your own

1. Fork this repository.
2. In your fork, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` deploys the site.

## Credits

- [Open-Meteo](https://open-meteo.com/) for air quality, weather, and geocoding
- [Copernicus Atmosphere Monitoring Service (CAMS)](https://atmosphere.copernicus.eu/) and ECMWF for the global model
- [three.js](https://threejs.org/) for 3D rendering

## License

MIT. See [LICENSE](LICENSE).
