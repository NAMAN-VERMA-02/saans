// Saans buddy: a tiny low-poly character living in the scene3d scene. Reacts to AQI + weather.
// createBuddy(THREE, scene, camera, { mobile, npcState }) -> { update(dt, time, ptrX, ptrY), setMood(detail, instant), dim }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const EPA = [[50, 'Good'], [100, 'Moderate'], [150, 'Unhealthy for sensitive groups'], [200, 'Unhealthy'], [300, 'Very unhealthy'], [Infinity, 'Hazardous']];
const bandName = (a) => EPA.find((b) => a <= b[0])[1];

export function createBuddy(THREE, scene, camera, { mobile = false, npcState = null } = {}) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, flatShading: true, ...extra });
  const M = {
    body: std(0xffb86b), wet: std(0x6a4a2a, { roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0 }),
    eye: std(0x1b1b2a, { roughness: 0.2 }), shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouth: std(0x7a2b1d), mask: std(0xdfeaf2), maskN95: std(0xffffff), strap: std(0x9fb3c2),
    steel: std(0xb8c4cc, { metalness: 0.7, roughness: 0.3 }), valve: std(0xe23b3b),
    shade: std(0x111118, { roughness: 0.2 }), canopy: std(0xe8453c, { side: THREE.DoubleSide }), stick: std(0x5b4636),
    drop: std(0x7cc8ff, { transparent: true, opacity: 0.85 }), fan: std(0x4aa3df, { side: THREE.DoubleSide }),
    moon: new THREE.MeshBasicMaterial({ color: 0xfff3c4 }),
  };
  const lights = {
    hemi: new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.1),
    sun: new THREE.DirectionalLight(0xffffff, 1.4),
    flash: new THREE.PointLight(0xcfe0ff, 0, 40),
  };
  lights.sun.position.set(3, 5, 6); lights.flash.position.set(0, 4, 4);
  scene.add(lights.hemi, lights.sun, lights.flash);

  const root = new THREE.Group();
  const baseX = mobile ? 1.3 : 3.1, baseY = mobile ? -3.6 : -2.2;
  root.position.set(baseX, baseY, 2.5);
  root.scale.setScalar(mobile ? 0.85 : 1.1);
  root.rotation.y = -0.55; scene.add(root);
  const hop = new THREE.Group(); root.add(hop);

  // body (capsule) + wet lower half
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.7, 4, 10), M.body); body.position.y = 0.55; hop.add(body);
  const wet = new THREE.Mesh(new THREE.SphereGeometry(0.515, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.wet); wet.position.y = 0.55 - 0.35 + 0.0; wet.scale.y = 1.3; body.add(wet); wet.position.set(0, -0.35, 0);
  const wetCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.515, 0.4, 10, 1, true), M.wet); wetCyl.position.y = -0.15; body.add(wetCyl);
  // head
  const head = new THREE.Group(); head.position.y = 1.6; hop.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), M.body));
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), M.eye); e.position.set(sx * 0.2, 0.08, 0.5); e.scale.set(1, 1.25, 0.6);
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), M.shine); s.position.set(0.03, 0.05, 0.08); e.add(s);
    head.add(e); eyes.push(e);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI), M.mouth); mouth.position.set(0, -0.12, 0.52); mouth.rotation.z = Math.PI; head.add(mouth);
  // mask
  const maskG = new THREE.Group(); head.add(maskG);
  const maskM = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M.mask); maskM.scale.set(1.15, 0.7, 0.55); maskM.position.set(0, -0.14, 0.42); maskG.add(maskM);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), M.valve); valve.rotation.x = Math.PI / 2; valve.position.set(0.12, -0.14, 0.62); maskG.add(valve);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.012, 4, 20), M.strap); strap.rotation.x = Math.PI / 2; strap.position.y = -0.1; strap.scale.set(1, 1, 1); maskG.add(strap);
  // sunglasses
  const shades = new THREE.Group(); head.add(shades);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.04), M.shade); l.position.set(sx * 0.2, 0.08, 0.53); shades.add(l); }
  const br = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), M.shade); br.position.set(0, 0.11, 0.53); shades.add(br);
  // arms (pivot at shoulder)
  const arms = [];
  for (const sx of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sx * 0.55, 0.95, 0);
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.4, 3, 8), M.body); a.position.y = -0.3; p.add(a);
    hop.add(p); arms.push(p);
  }
  // oxygen cylinder on back
  const tank = new THREE.Group(); tank.position.set(0, 0.7, -0.62); hop.add(tank);
  tank.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.6, 3, 10), M.steel));
  const vv = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), M.valve); vv.position.y = 0.52; tank.add(vv);
  const vk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), M.valve); vk.position.y = 0.6; tank.add(vk);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 4, 16, Math.PI), M.strap); hose.position.set(0, 1.12, -0.1); hose.rotation.set(0.2, 0, 0); hop.add(hose);
  // umbrella (held in right hand, above head)
  const umb = new THREE.Group(); umb.position.set(0.75, 0.55, 0); hop.add(umb);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6), M.stick); stick.position.y = 0.9; umb.add(stick);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.55, 8, 1, true), M.canopy); canopy.position.y = 1.95; umb.add(canopy);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), M.stick); tip.position.y = 2.25; umb.add(tip);
  // fan (left hand)
  const fan = new THREE.Group(); fan.position.set(-0.8, 0.6, 0.35); hop.add(fan);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.34), M.fan); b.position.y = 0.19; const g = new THREE.Group(); g.rotation.z = (i * Math.PI) / 2; g.add(b); fan.add(g); }
  // sweat drops
  const sweat = [0, 1, 2].map((i) => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), M.drop); d.scale.y = 1.5; head.add(d); return { d, ph: i / 3 }; });

  // sprites: puffs, sparkles
  const mk = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); };
  const puffTex = mk([[0, 'rgba(255,255,255,.9)'], [0.6, 'rgba(255,255,255,.4)'], [1, 'rgba(255,255,255,0)']]);
  const sparkTex = mk([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,240,170,.8)'], [1, 'rgba(255,240,170,0)']]);
  const smog = [], clouds = [], sparks = [];
  const mkSprite = (tex, color, blending) => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0, blending: blending || THREE.NormalBlending }));
  for (let i = 0; i < (mobile ? 4 : 7); i++) { const s = mkSprite(puffTex, 0x6f6a64); s.scale.setScalar(2.6 + Math.random() * 1.6); s.userData = { a: Math.random() * 6.28, r: 1.6 + Math.random() * 1.6, y: Math.random() * 3, sp: 0.15 + Math.random() * 0.2 }; root.add(s); smog.push(s); }
  for (let i = 0; i < 3; i++) { const s = mkSprite(puffTex, 0xf4f6fa); s.scale.set(4 + i, 2.4 + i * 0.3, 1); s.position.set(-1.5 + i * 1.8, 4.6 + (i % 2) * 0.4, -0.5); root.add(s); clouds.push(s); }
  for (let i = 0; i < 8; i++) { const s = mkSprite(sparkTex, 0xffffff, THREE.AdditiveBlending); s.userData = { a: (i / 8) * 6.28, r: 1.2 + (i % 3) * 0.35, y: 1 + (i % 4) * 0.6, ph: Math.random() * 6 }; root.add(s); sparks.push(s); }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), M.moon); moon.position.set(mobile ? -1.5 : -3.2, 5.2, -2); root.add(moon); moon.visible = false;

  // rain streaks: one LineSegments
  const NR = mobile ? 90 : 220, rp = new Float32Array(NR * 6), rv = new Float32Array(NR);
  for (let i = 0; i < NR; i++) { rp[i * 6] = (Math.random() - 0.5) * 16; rp[i * 6 + 1] = Math.random() * 14 - 5; rp[i * 6 + 2] = (Math.random() - 0.3) * 8; rv[i] = 9 + Math.random() * 5; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xa8cdf0, transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rg, rainMat); rain.frustumCulled = false; scene.add(rain);

  // state (targets set by setMood, eased in update)
  const T = { umb: 0, wet: 0, rain: 0, storm: 0, mask: 0, n95: 0, tank: 0, smog: 0, happy: 0, shades: 0, hot: 0, cloud: 0, night: 0, snow: 0 };
  const S = { ...T }; const api = { dim: 1 };
  let blinkT = 2, blink = 0, flashT = 3, flash = 0, hopT = 0, fanSpin = 0;

  // Fallback used only if insights.npcState is missing. Mirrors npcState's output shape (EPA AQI).
  const derive = (aqi, w, name) => {
    const cond = (w && w.condition) || 'clear', wetC = ['rain', 'drizzle', 'storm'].includes(cond);
    const has = Number.isFinite(aqi);
    return {
      mask: !has || aqi < 101 ? 'none' : aqi < 151 ? 'cloth' : aqi < 201 ? 'n95' : 'oxygen',
      umbrella: wetC, wetness: wetC ? (cond === 'drizzle' ? 0.5 : 1) : 0,
      smog: has && aqi >= 151 ? clamp01((aqi - 140) / 100) : 0, clouds: cond === 'cloudy' || cond === 'fog' ? 1 : 0,
      rain: wetC ? (cond === 'drizzle' ? 0.4 : 1) : 0, snow: cond === 'snow', storm: cond === 'storm', fog: cond === 'fog',
      sunglasses: has && aqi <= 50 && cond === 'clear' && !!w && w.temp > 30 && w.isDay,
      isDay: !w || w.isDay !== false, mood: has && aqi <= 50 && cond === 'clear' ? 'happy' : 'ok',
      caption: `${name}'s air is ${has ? bandName(aqi) : 'unknown'}.`,
    };
  };

  api.setMood = (detail, instant) => {
    const air = detail && detail.air, w = (detail && detail.weather) || null, aqi = air && air.current && air.current.aqi;
    const name = (detail && detail.city && detail.city.name) || 'Your city';
    let n = null;
    try { if (npcState) n = npcState(air, w); } catch { n = null; }
    if (!n) n = derive(aqi, w, name);
    const has = Number.isFinite(aqi);
    T.umb = n.umbrella ? 1 : 0; T.wet = clamp01(n.wetness || 0);
    T.rain = clamp01(+n.rain || 0) * 0.9; T.snow = n.snow ? 1 : 0; T.storm = n.storm ? 1 : 0;
    T.mask = n.mask !== 'none' ? 1 : 0; T.n95 = n.mask === 'n95' || n.mask === 'oxygen' ? 1 : 0; T.tank = n.mask === 'oxygen' ? 1 : 0;
    T.smog = clamp01(+n.smog || 0); T.cloud = n.fog ? 1 : clamp01(+n.clouds || 0);
    T.shades = n.sunglasses ? 1 : 0; T.night = n.isDay === false ? 1 : 0;
    T.hot = w && w.temp > 35 ? 1 : 0;
    T.happy = n.mood === 'happy' && !n.rain && !n.snow ? 1 : 0;
    if (instant) Object.assign(S, T);
    window.dispatchEvent(new CustomEvent('buddy:mood', { detail: { text: n.caption || derive(aqi, w, name).caption } }));
  };

  api.update = (dt, time, ptrX = 0, ptrY = 0) => {
    const k = dt > 0 ? 1 - Math.exp(-dt * 3.5) : 0;
    for (const key in T) S[key] += (T[key] - S[key]) * k;
    api.dim = 1 - 0.55 * S.night;
    lights.hemi.intensity = 1.1 * api.dim; lights.sun.intensity = 1.4 * api.dim * (1 - 0.35 * S.smog);
    // idle
    const bob = Math.sin(time * 2) * 0.04;
    hopT += dt * (3.2);
    const jump = S.happy > 0.05 ? Math.abs(Math.sin(hopT)) * 0.35 * S.happy : 0;
    hop.position.y = bob + jump;
    body.scale.set(1 + Math.sin(time * 2 + 1) * 0.015, 1 - Math.sin(time * 2 + 1) * 0.015, 1);
    // look at pointer
    head.rotation.y += (ptrX * 0.6 - head.rotation.y) * Math.min(1, dt * 6 || 1);
    head.rotation.x += (ptrY * 0.35 - head.rotation.x) * Math.min(1, dt * 6 || 1);
    // blink
    blinkT -= dt; if (blinkT < 0) { blink = 0.14; blinkT = 2 + Math.random() * 3; }
    blink = Math.max(0, blink - dt);
    const eyeY = blink > 0 ? 0.1 : 1.25;
    eyes.forEach((e) => (e.scale.y = eyeY));
    // arms
    arms[0].rotation.z = 0.25 + (S.hot ? -0.9 : 0) + Math.sin(time * 2) * 0.05 + S.happy * Math.abs(Math.sin(hopT)) * 0.6;
    arms[1].rotation.z = -0.25 - S.umb * 0.5 - Math.sin(time * 2) * 0.05 - S.happy * Math.abs(Math.sin(hopT)) * 0.6;
    // accessories by blend
    const vis = (o, v) => { o.visible = v > 0.02; };
    vis(maskG, S.mask); maskG.scale.setScalar(0.4 + 0.6 * S.mask);
    maskM.material = S.n95 > 0.5 ? M.maskN95 : M.mask; valve.visible = S.n95 > 0.5; maskM.scale.x = 1.15 + 0.15 * S.n95;
    mouth.visible = S.mask < 0.5;
    vis(tank, S.tank); tank.scale.setScalar(S.tank); hose.visible = S.tank > 0.5;
    vis(shades, S.shades); vis(fan, S.hot); fan.scale.setScalar(S.hot);
    fanSpin += dt * 18; fan.children.forEach((g) => (g.rotation.y = 0)); fan.rotation.z = fanSpin;
    // umbrella open transition
    vis(umb, S.umb); const o = S.umb;
    canopy.scale.set(0.15 + 0.85 * o, 0.5 + 0.5 * o, 0.15 + 0.85 * o);
    umb.rotation.z = -0.15 * o;
    // wet look
    M.wet.opacity = 0.85 * S.wet; wet.visible = wetCyl.visible = S.wet > 0.02;
    // sweat
    sweat.forEach((s) => { const ph = (time * 0.8 + s.ph) % 1; s.d.visible = S.hot > 0.3; s.d.position.set((s.ph - 0.33) * 0.9, 0.35 - ph * 0.8, 0.45); s.d.material.opacity = 0.85 * (1 - ph); });
    // smog puffs
    smog.forEach((s) => { const u = s.userData; u.a += dt * u.sp; s.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(time * 0.5 + u.a) * 0.2, Math.sin(u.a) * u.r * 0.6); s.material.opacity = 0.5 * S.smog; });
    clouds.forEach((s, i) => { s.position.x += Math.sin(time * 0.1 + i) * dt * 0.1; s.material.opacity = 0.75 * S.cloud; });
    sparks.forEach((s) => { const u = s.userData; u.a += dt * 0.5; s.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r * 0.5 + 0.3); const tw = 0.5 + 0.5 * Math.sin(time * 3 + u.ph); s.scale.setScalar(0.15 + 0.25 * tw); s.material.opacity = S.happy * tw; });
    moon.visible = S.night > 0.5;
    // rain
    const sn = S.snow, pr = Math.max(S.rain, sn);
    rainMat.color.setHex(sn > 0.5 ? 0xffffff : 0xa8cdf0); rainMat.opacity = (sn > 0.5 ? 0.8 : 0.55) * pr; rain.visible = pr > 0.02;
    if (rain.visible) {
      for (let i = 0; i < NR; i++) {
        const j = i * 6, dy = rv[i] * dt * (sn > 0.5 ? 0.12 : 1), len = sn > 0.5 ? 0.08 : 0.6;
        rp[j + 1] -= dy; rp[j + 4] = rp[j + 1] - len; rp[j] += dy * 0.08 + (sn > 0.5 ? Math.sin(time + i) * dt * 0.3 : 0); rp[j + 3] = rp[j] + 0.05; rp[j + 5] = rp[j + 2];
        if (rp[j + 1] < -6) { rp[j + 1] = 8; rp[j] = (Math.random() - 0.5) * 16; }
      }
      rg.attributes.position.needsUpdate = true;
    }
    // lightning
    if (S.storm > 0.5 && dt > 0) { flashT -= dt; if (flashT < 0) { flash = 1; flashT = 2 + Math.random() * 4; } }
    flash = Math.max(0, flash - dt * 4); lights.flash.intensity = flash * 40 * (Math.random() > 0.3 ? 1 : 0.4);
  };
  return api;
}
