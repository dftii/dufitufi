// núcleo compartido: entorno, puntero, orientación, ticker único y evento de entrada

const mqFine    = matchMedia('(pointer: fine)');
const mqCoarse  = matchMedia('(pointer: coarse)');
const mqReduced = matchMedia('(prefers-reduced-motion: reduce)');

// flags de entorno (getters: siempre al día si cambian las media queries)
export const env = {
  // hay ratón/trackpad (un portátil táctil también cuenta)
  get finePointer()   { return mqFine.matches; },
  // móvil/tablet sin puntero fino: menos partículas, menos resolución
  get lowPower()      { return mqCoarse.matches && !mqFine.matches; },
  get reducedMotion() { return mqReduced.matches; },
};

// avisa a fn cuando cambia prefers-reduced-motion
export function onReducedMotionChange(fn) {
  mqReduced.addEventListener('change', () => fn(mqReduced.matches));
}
export function onFinePointerChange(fn) {
  mqFine.addEventListener('change', () => fn(mqFine.matches));
}

// estado del puntero (ratón o dedo), en px de viewport
export const pointer = { x: -9999, y: -9999, inside: false, type: 'mouse' };
const pointerSubs = new Set();
export function onPointer(fn) { pointerSubs.add(fn); return () => pointerSubs.delete(fn); }

addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.inside = true; pointer.type = e.pointerType;
  for (const fn of pointerSubs) fn(e);
}, { passive: true });
// el ratón sale de la ventana
document.documentElement.addEventListener('mouseleave', () => { pointer.inside = false; });
addEventListener('blur', () => { pointer.inside = false; });

// inclinación del móvil normalizada a [-1, 1]
export const orient = { x: 0, y: 0, active: false };
const clamp1 = v => Math.max(-1, Math.min(1, v));
function onOrientation(e) {
  if (e.gamma == null && e.beta == null) return;
  orient.x = clamp1((e.gamma || 0) / 25);
  orient.y = clamp1(((e.beta ?? 45) - 45) / 25);
  orient.active = true;
}
addEventListener('deviceorientation', onOrientation, { passive: true });

// iOS pide permiso para la orientación; hay que llamarlo dentro de un gesto del usuario
export function requestOrientation() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    D.requestPermission().catch(() => {});
  }
}

// ticker único: un solo requestAnimationFrame para todos los efectos.
// fn(now, dt) donde dt está en "frames de 60fps" (1 ≈ 16.7ms), así todo va
// igual de rápido a 60, 120 o 144Hz. Si fn devuelve false, se da de baja
// (para parar efectos inactivos); se vuelve a dar de alta con tick(fn).
const subs = new Set();
let rafId = 0, last = 0;

function frame(now) {
  rafId = 0;
  const dt = Math.min((now - last) / (1000 / 60), 4);
  last = now;
  for (const fn of subs) {
    if (fn(now, dt) === false) subs.delete(fn);
  }
  if (subs.size && !document.hidden) rafId = requestAnimationFrame(frame);
}

function wake() {
  if (rafId || !subs.size || document.hidden) return;
  last = performance.now();
  rafId = requestAnimationFrame(frame);
}

export function tick(fn) {
  subs.add(fn);
  wake();
  return () => subs.delete(fn);
}

// al volver a la pestaña reanudo (sin duplicar el bucle: wake comprueba rafId)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else wake();
});

// ajusta un canvas 2D a su tamaño CSS con el devicePixelRatio (máx maxDpr).
// Deja el contexto escalado para dibujar en px CSS. Devuelve el dpr usado.
export function fitCanvas(canvas, ctx, cssW, cssH, maxDpr = 2) {
  const dpr = Math.min(devicePixelRatio || 1, maxDpr);
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return dpr;
}

// entrada a la página (tras el splash)
export const state = { entered: false };
const enterSubs = new Set();
export function onEnter(fn) {
  if (state.entered) fn(); else enterSubs.add(fn);
}
export function enter() {
  if (state.entered) return;
  state.entered = true;
  document.documentElement.classList.add('entered');
  for (const fn of enterSubs) {
    try { fn(); } catch (err) { console.error(err); }
  }
  enterSubs.clear();
}
