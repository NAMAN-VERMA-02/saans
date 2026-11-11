// Saans buddy stage: a small card with its own WebGL canvas showing the buddy and local weather.
// Needs the "three" importmap. Fails silently (card shows only the caption) without WebGL.
import { npcState } from '../insights.js';

let lastDetail = null, onData = null;
window.addEventListener('aqi:data', (e) => { lastDetail = e.detail; if (onData) onData(e.detail); });

async function init() {
  const canvas = document.getElementById('buddy-canvas');
  if (!canvas) return;
  let THREE, createBuddy;
  try { THREE = await import('three'); ({ createBuddy } = await import('./buddy.js')); } catch { canvas.hidden = true; return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch { canvas.hidden = true; return; }
  if (!renderer.getContext()) { canvas.hidden = true; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = innerWidth < 700;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0.2, 8);
  camera.lookAt(0, 0.1, 0);
  const buddy = createBuddy(THREE, scene, camera, { mobile, npcState, stage: true });

  const resize = () => {
    const w = Math.max(160, canvas.clientWidth), h = Math.max(160, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 0.95 ? 8 / Math.max(0.7, camera.aspect) * 0.95 : 8;
    camera.lookAt(0, 0.1, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  if (window.ResizeObserver) new ResizeObserver(() => { resize(); if (!running) frame(0); }).observe(canvas);

  let ptrX = 0, ptrY = 0, tx = 0, ty = 0;
  const onPtr = (x, y) => { tx = (x / innerWidth - 0.5) * 2; ty = (y / innerHeight - 0.5) * 2; };
  window.addEventListener('pointermove', (e) => onPtr(e.clientX, e.clientY), { passive: true });

  let time = 0, last = performance.now(), raf = 0, running = false, visible = true;
  function frame(dt) {
    time += dt;
    ptrX += (tx - ptrX) * Math.min(1, dt * 4 || 1); ptrY += (ty - ptrY) * Math.min(1, dt * 4 || 1);
    buddy.update(dt, time, ptrX, ptrY);
    canvas.style.filter = buddy.flash > 0.05 ? `brightness(${1 + buddy.flash * 0.6})` : '';
    renderer.render(scene, camera);
  }
  const loop = (now) => { raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt); };
  const sync = () => {
    const should = visible && !document.hidden && !reduced;
    if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
  };
  document.addEventListener('visibilitychange', sync);
  if (window.IntersectionObserver) new IntersectionObserver((en) => { visible = en[0].isIntersecting; sync(); }).observe(canvas);

  onData = (d) => {
    if (!d || !d.air || !d.air.current) return;
    buddy.setMood(d, reduced);
    if (reduced) frame(0);
  };
  if (lastDetail) onData(lastDetail);
  if (reduced) frame(0); else sync();
}

init().catch(() => {});
