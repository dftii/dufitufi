// campo de estrellas rosas: deriva lenta, parpadeo y huida del cursor
import { env, pointer, orient, onReducedMotionChange, tick, fitCanvas } from './core.js';

const COLOR = 'rgb(255,58,170)';
const TAU = Math.PI * 2;
const MIN_ALPHA = 0.25;
const MAX_ALPHA = 0.95;
const REPEL_RADIUS = 120;
const REPEL_FORCE = 2.2;
const TILT_DRIFT = 0.45;

// nº de estrellas según el área de la ventana (con tope); menos en móvil
function targetCount(w, h) {
  const area = w * h;
  if (env.lowPower) return Math.max(40, Math.min(60, Math.round(area / 6000)));
  return Math.max(70, Math.min(200, Math.round(area / 13000)));
}

function newStar(w, h) {
  return {
    x:     Math.random() * w,
    y:     Math.random() * h,
    r:     1.4 + Math.random() * 2.6,
    vx:    (Math.random() - 0.5) * 0.52,
    vy:    (Math.random() - 0.5) * 0.52,
    alpha: 0.4 + Math.random() * 0.5,
    da:    (0.001 + Math.random() * 0.005) * (Math.random() < 0.5 ? 1 : -1),
  };
}

export function initStars() {
  const canvas = document.getElementById('stars-canvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  const stars = [];
  let w = 0, h = 0, dpr = 0;

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COLOR;
    for (const s of stars) {
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function step(now, dt) {
    if (env.reducedMotion) return false;

    const repel = env.finePointer && pointer.inside;
    const ox = orient.x * TILT_DRIFT;
    const oy = orient.y * TILT_DRIFT;

    for (const s of stars) {
      s.x += (s.vx + ox) * dt;
      s.y += (s.vy + oy) * dt;

      // las estrellas huyen del cursor
      if (repel) {
        const dx = s.x - pointer.x, dy = s.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < REPEL_RADIUS * REPEL_RADIUS && d2 > 0) {
          const d = Math.sqrt(d2);
          const f = (REPEL_RADIUS - d) / REPEL_RADIUS * REPEL_FORCE * dt;
          s.x += dx / d * f;
          s.y += dy / d * f;
        }
      }

      // parpadeo: rebota entre MIN_ALPHA y MAX_ALPHA
      s.alpha += s.da * dt;
      if (s.alpha >= MAX_ALPHA)      { s.alpha = MAX_ALPHA; s.da = -Math.abs(s.da); }
      else if (s.alpha <= MIN_ALPHA) { s.alpha = MIN_ALPHA; s.da =  Math.abs(s.da); }

      // al salir por un borde reaparece por el opuesto
      const m = s.r;
      if (s.x < -m)     s.x = w + m;
      else if (s.x > w + m) s.x = -m;
      if (s.y < -m)     s.y = h + m;
      else if (s.y > h + m) s.y = -m;
    }
    draw();
  }

  function resize() {
    const nw = innerWidth, nh = innerHeight;
    const ndpr = Math.min(devicePixelRatio || 1, 2);
    // ventana sin tamaño (iframe oculto, etc.): espero a tener uno real
    if (nw < 1 || nh < 1) return;
    if (nw === w && nh === h && ndpr === dpr) return;

    // reescalo las posiciones en vez de regenerar, así no "saltan" al redimensionar
    if (w && h) {
      const sx = nw / w, sy = nh / h;
      for (const s of stars) { s.x *= sx; s.y *= sy; }
    }
    w = nw; h = nh; dpr = ndpr;
    fitCanvas(canvas, ctx, w, h, 2);

    const n = targetCount(w, h);
    while (stars.length > n) stars.pop();
    while (stars.length < n) stars.push(newStar(w, h));

    // al cambiar el tamaño el canvas se vacía: repinto ya
    draw();
  }

  resize();
  if (!env.reducedMotion) tick(step);

  addEventListener('resize', resize);
  // con movimiento reducido dejo el cielo estático; si se desactiva, reanudo
  onReducedMotionChange(reduced => {
    if (reduced) draw();
    else tick(step);
  });
}
