// cursor personalizado (punto + aro) y estela de cometa en canvas
import {
  env, pointer, onPointer, onFinePointerChange, onReducedMotionChange, tick, fitCanvas,
} from './core.js';

const TRAIL_MS = 300;          // vida de la estela
const TRAIL_MS_REDUCED = 130;  // con movimiento reducido: más corta y sin chispas
const MAX_POINTS = 90;
const MAX_SPARKS = 60;
const SPARK_EVERY = 22;        // px recorridos entre chispas
const HEAD_WIDTH = 5;          // grosor de la estela en la cabeza (px)
const INTERACTIVE =
  'button, a[href], input, select, textarea, label, summary, [role="button"], [data-close], .splash';

// capas de la estela, de fuera (resplandor rosa) a dentro (núcleo blanco)
const LAYERS = [
  { color: '#DD0099', k: 2.8, a: 0.16 },
  { color: '#ff3aaa', k: 1.5, a: 0.42 },
  { color: '#ffffff', k: 0.75, a: 0.95 },
];

// los <dialog> modales viven en la top layer, por encima de cualquier z-index:
// mientras haya uno abierto, el punto no se vería, así que se usa el cursor nativo
let dialogOpen = false;
const dialogSubs = [];
function watchDialogs() {
  const check = () => {
    const open = !!document.querySelector('dialog[open]');
    if (open === dialogOpen) return;
    dialogOpen = open;
    for (const fn of dialogSubs) fn();
  };
  new MutationObserver(check).observe(document.documentElement, {
    subtree: true, attributes: true, attributeFilter: ['open'],
  });
  check();
}

function initDot(dot) {
  const root = document.documentElement;
  let custom = false, visible = false, hover = false;

  const setVisible = v => {
    if (v === visible) return;
    visible = v;
    dot.classList.toggle('is-visible', v);
  };
  const setHover = v => {
    if (v === hover) return;
    hover = v;
    dot.classList.toggle('is-hover', v);
  };
  const place = (x, y) => {
    dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  // activa/desactiva el cursor propio (y oculta el nativo solo cuando está activo)
  function sync() {
    const next = env.finePointer && !dialogOpen;
    if (next === custom) return;
    custom = next;
    root.classList.toggle('has-custom-cursor', custom);
    if (!custom) { setVisible(false); setHover(false); return; }
    if (pointer.inside && pointer.type !== 'touch') {
      place(pointer.x, pointer.y);
      setVisible(true);
    }
  }

  onPointer(e => {
    if (!custom) return;
    // el dedo no lleva punto, solo estela
    if (e.pointerType === 'touch') { setVisible(false); return; }
    place(e.clientX, e.clientY);
    setVisible(true);
    const t = e.target;
    setHover(t instanceof Element && !!t.closest(INTERACTIVE));
  });

  const hide = () => { setVisible(false); dot.classList.remove('is-down'); };
  root.addEventListener('mouseleave', hide);
  addEventListener('blur', hide);

  addEventListener('pointerdown', e => {
    if (custom && e.pointerType !== 'touch') dot.classList.add('is-down');
  }, { passive: true });
  const up = () => dot.classList.remove('is-down');
  addEventListener('pointerup', up, { passive: true });
  addEventListener('pointercancel', up, { passive: true });

  dialogSubs.push(sync);
  onFinePointerChange(sync);
  sync();
}

function initTrail(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const pts = [];      // {x, y, t}
  const sparks = [];   // chispas que suben y se desvanecen
  const lives = new Float32Array(MAX_POINTS + 1);
  let w = 0, h = 0;
  let needsResize = true;
  let travelled = 0;

  function resize() {
    needsResize = false;
    w = innerWidth; h = innerHeight;
    fitCanvas(canvas, ctx, w, h, env.lowPower ? 1.5 : 2);
  }
  // el canvas se ajusta en el siguiente frame de dibujo, no en cada evento resize
  addEventListener('resize', () => { needsResize = true; });

  function spawnSpark(x, y) {
    if (sparks.length >= MAX_SPARKS) return;
    sparks.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -(0.2 + Math.random() * 0.5),
      r: 0.8 + Math.random() * 1.1,
      age: 0,
      dur: 450 + Math.random() * 450,
    });
  }

  function addPoint(x, y, now) {
    const last = pts[pts.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < 1) return;
      travelled += d;
    }
    pts.push({ x, y, t: now });
    if (pts.length > MAX_POINTS) pts.shift();
    if (!env.reducedMotion && travelled >= SPARK_EVERY) {
      travelled = 0;
      spawnSpark(x, y);
    }
    tick(step);
  }

  onPointer(e => {
    if (dialogOpen) return;
    addPoint(e.clientX, e.clientY, performance.now());
  });
  // un dedo nuevo empieza una estela nueva (no la une con la anterior)
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') { pts.length = 0; travelled = 0; }
  }, { passive: true });
  onReducedMotionChange(reduced => { if (reduced) sparks.length = 0; });

  function drawTrail(now, ttl) {
    const n = pts.length;
    if (n < 2) return;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    for (let i = 0; i < n; i++) lives[i] = Math.max(0, Math.min(1, 1 - (now - pts[i].t) / ttl));

    for (const L of LAYERS) {
      ctx.strokeStyle = L.color;
      for (let i = 1; i < n; i++) {
        const life = (lives[i] + lives[i - 1]) / 2;
        const lw = HEAD_WIDTH * life * L.k;
        if (lw < 0.2) continue;
        const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        // curva suave: de punto medio a punto medio, con el punto como control
        const sx = i === 1 ? p0.x : (p0.x + p1.x) / 2;
        const sy = i === 1 ? p0.y : (p0.y + p1.y) / 2;
        const ex = p2 ? (p1.x + p2.x) / 2 : p1.x;
        const ey = p2 ? (p1.y + p2.y) / 2 : p1.y;
        ctx.globalAlpha = L.a * Math.pow(life, 1.4);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(p1.x, p1.y, ex, ey);
        ctx.stroke();
      }
    }
  }

  function drawSparks() {
    if (!sparks.length) return;
    // primero los halos rosas y luego los núcleos blancos (menos cambios de estilo)
    ctx.fillStyle = '#ff3aaa';
    for (const s of sparks) {
      const life = 1 - s.age / s.dur;
      ctx.globalAlpha = life * 0.28;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 3 * (0.5 + life * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    for (const s of sparks) {
      const life = 1 - s.age / s.dur;
      ctx.globalAlpha = life * 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.4 + life * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step(now, dt) {
    if (needsResize) resize();
    const ttl = env.reducedMotion ? TRAIL_MS_REDUCED : TRAIL_MS;

    // descarto lo viejo (los puntos están ordenados por tiempo)
    let drop = 0;
    while (drop < pts.length && now - pts[drop].t > ttl) drop++;
    if (drop) pts.splice(0, drop);

    const dtMs = dt * (1000 / 60);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dtMs;
      if (s.age >= s.dur) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    ctx.clearRect(0, 0, w, h);
    // nada que pintar: dejo el canvas limpio y paro el bucle hasta el próximo movimiento
    if (!pts.length && !sparks.length) return false;

    ctx.globalCompositeOperation = 'lighter';
    drawTrail(now, ttl);
    drawSparks();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  resize();
}

export function initCursor() {
  const canvas = document.getElementById('cursor-trail');
  const dot = document.getElementById('cursor-dot');
  if (dot) initDot(dot);
  if (canvas) initTrail(canvas);
  watchDialogs();
}
