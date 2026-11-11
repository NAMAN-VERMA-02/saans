// Saans 3D backdrop: "the air you breathe". three.js particles + breathing orb in <canvas id="scene">.
// Requires an importmap mapping "three" to https://unpkg.com/three@0.160.0/build/three.module.js
// Fails silently (CSS gradient stays) if WebGL or three is unavailable.
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// target look for a given AQI (0..500)
function look(aqi, bandColor, dim = 1) {
  const s = clamp01(aqi / 300);               // severity (US EPA AQI) 0..1
  const smog = clamp01((aqi - 100) / 100);    // brown/grey blend, full from Unhealthy (151+)
  const bc = hex(bandColor || '#00b050');
  const clean = mix([0.75, 0.92, 1], bc, 0.25);
  const smogCol = mix([0.62, 0.55, 0.48], [0.45, 0.3, 0.2], clamp01((aqi - 200) / 200));
  const color = mix(clean, smogCol, smog);
  // sky gradient: clear blue -> hazy grey -> dark brown-red
  const skyTopG = [0.1, 0.34, 0.62], skyBotG = [0.55, 0.8, 0.95];
  const skyTopH = [0.3, 0.32, 0.34], skyBotH = [0.58, 0.56, 0.52];
  const skyTopS = [0.1, 0.04, 0.04], skyBotS = [0.32, 0.12, 0.09];
  const hz = clamp01(aqi / 150), sv = clamp01((aqi - 150) / 200);
  const top = mix(mix(skyTopG, skyTopH, hz), skyTopS, sv);
  const bot = mix(mix(skyBotG, skyBotH, hz), skyBotS, sv);
  return {
    count: 0.2 + 0.8 * s,
    opacity: 0.8 - 0.5 * s,
    size: 0.28 + 0.6 * s,
    color: color.map((v) => v * dim), top: top.map((v) => v * dim), bot: bot.map((v) => v * dim),
    fog: 0.012 + 0.07 * s,
    rate: 0.55 - 0.4 * s,                     // breaths per second-ish
    orb: mix([0.35, 0.85, 1], [0.55, 0.28, 0.14], clamp01(aqi / 250)),
    orbAlpha: 0.9 - 0.3 * s,
  };
}
const lerpLook = (a, b, t) => {
  const o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? mix(a[k], b[k], t) : a[k] + (b[k] - a[k]) * t;
  return o;
};

async function init() {
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  let THREE;
  try { THREE = await import('three'); } catch { return; }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  } catch { return; }
  if (!renderer.getContext()) return;

  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = innerWidth < 700;
  const CAP = mobile ? 1500 : 5000;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xffffff, 0.02);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  // gradient background texture
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 2; bgCanvas.height = 128;
  const bgCtx = bgCanvas.getContext('2d');
  const bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  const paintBg = (L) => {
    const g = bgCtx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, css(L.top)); g.addColorStop(1, css(L.bot));
    bgCtx.fillStyle = g; bgCtx.fillRect(0, 0, 2, 128);
    bgTex.needsUpdate = true;
  };

  // round soft sprite
  const sp = document.createElement('canvas'); sp.width = sp.height = 64;
  const sc = sp.getContext('2d');
  const rg = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.4, 'rgba(255,255,255,.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  sc.fillStyle = rg; sc.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(sp);

  // one Points object
  const pos = new Float32Array(CAP * 3), seed = new Float32Array(CAP);
  for (let i = 0; i < CAP; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 24 - 2;
    seed[i] = Math.random() * 6.283;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: sprite, size: 1, sizeAttenuation: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // breathing orb: fresnel shader
  const orbMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x5ad) }, uAlpha: { value: 0.9 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.-abs(dot(normalize(vN),normalize(vV))), 2.2); gl_FragColor = vec4(uColor*(0.25+1.1*f), (0.12+0.7*f)*uAlpha); }`,
  });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 4), orbMat);
  scene.add(orb);

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.position.z = w / h < 0.8 ? 12 : 9;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', () => { resize(); if (reduced) frame(0); });

  // state
  let cur = look(40, '#00b050'), from = cur, to = cur, easeT = 1;
  const ease = (t) => t * t * (3 - 2 * t);
  const apply = (L) => {
    mat.color.setRGB(...L.color);
    mat.opacity = L.opacity;
    mat.size = L.size * (mobile ? 0.8 : 1);
    geo.setDrawRange(0, Math.max(50, Math.floor(CAP * L.count)));
    scene.fog.color.setRGB(...L.bot); scene.fog.density = L.fog;
    orbMat.uniforms.uColor.value.setRGB(...L.orb);
    orbMat.uniforms.uAlpha.value = L.orbAlpha;
    paintBg(L);
  };
  apply(cur);

  window.addEventListener('aqi:data', (e) => {
    const air = e.detail && e.detail.air;
    const c = air && air.current;
    if (!c || !Number.isFinite(c.aqi)) return;
    to = look(c.aqi, c.band && c.band.color, 1 - 0.55 * (e.detail.weather && e.detail.weather.isDay === false ? 1 : 0));
    from = cur; easeT = 0;
    if (reduced) { cur = to; easeT = 1; apply(cur); frame(0); }
  });

  // parallax
  let px = 0, py = 0, tx = 0, ty = 0;
  const onPtr = (x, y) => { tx = (x / innerWidth - 0.5) * 2; ty = (y / innerHeight - 0.5) * 2; };
  window.addEventListener('pointermove', (e) => onPtr(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) onPtr(t.clientX, t.clientY); }, { passive: true });

  let last = performance.now(), time = 0, phase = 0, raf = 0;
  function frame(dt) {
    if (easeT < 1) {
      easeT = Math.min(1, easeT + dt / 1.5);
      cur = lerpLook(from, to, ease(easeT));
      apply(cur);
    }
    time += dt;
    phase += dt * cur.rate * 6.283;
    const breath = 0.5 + 0.5 * Math.sin(phase);
    orb.scale.setScalar(0.92 + 0.16 * breath);
    orb.rotation.y += dt * 0.1;
    px += (tx - px) * Math.min(1, dt * 3); py += (ty - py) * Math.min(1, dt * 3);
    camera.position.x = px * 0.8; camera.position.y = -py * 0.5;
    camera.lookAt(0, 0, 0);
    // drift
    if (!reduced) {
      const n = Math.floor(CAP * cur.count);
      const up = dt * (0.25 - 0.12 * clamp01(cur.fog * 14));
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        pos[k + 1] += up;
        pos[k] += Math.sin(time * 0.3 + seed[i]) * dt * 0.15;
        if (pos[k + 1] > 9) pos[k + 1] = -9;
      }
      geo.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
  };
  const start = () => { if (!raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (reduced) frame(0); else start();
}

init().catch(() => {});
