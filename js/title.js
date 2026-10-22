// título: efecto de "presión" por letra (ejes de la fuente variable) e inclinación 3D
import {
  env, pointer, orient, onPointer, onReducedMotionChange, onEnter, tick,
} from './core.js';

// ejes de Roboto Flex: lejos del puntero -> cerca
const WGHT = [100, 800];
const WDTH = [75, 120];
const SLNT = [0, -10];

const MAX_TILT = 16;       // grados de inclinación con el ratón
const ORIENT_TILT = 10;    // grados por unidad de inclinación del móvil
const FOCUS_LERP = 0.1;    // suavizado del foco (por frame de 60fps)
const STRENGTH_LERP = 0.12;
const TILT_LERP = 0.08;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
// suavizado independiente del framerate (dt en frames de 60fps)
const ease = (k, dt) => 1 - Math.pow(1 - k, dt);

function variation(t) {
  return `'wght' ${Math.round(lerp(WGHT[0], WGHT[1], t))}, ` +
         `'wdth' ${Math.round(lerp(WDTH[0], WDTH[1], t))}, ` +
         `'slnt' ${lerp(SLNT[0], SLNT[1], t).toFixed(1)}`;
}

// posición de un nodo en px de layout (ignora transforms: ni el scale de la
// animación de entrada ni la inclinación 3D falsean la medida)
function layoutPos(node) {
  let x = 0, y = 0;
  for (let n = node; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y };
}

export function initTitle() {
  const el = document.getElementById('pasta');
  const container = document.querySelector('.word-container');
  if (!el || !container) return;

  // una letra por span; el h1 conserva su aria-label, así que los spans se ocultan
  const text = el.textContent.trim();
  const spans = [...text].map(ch => {
    const s = document.createElement('span');
    s.className = 'pressure-letter';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch;
    return s;
  });
  el.replaceChildren(...spans);
  const N = spans.length;

  // caché para escribir en el DOM solo si algo cambia
  const lastKey = new Int32Array(N).fill(-1);
  const lastStyle = new Array(N).fill('');
  const centers = new Float32Array(N * 2);
  let titleHalf = 1;   // medio ancho del título (alcance del efecto)
  let winCx = 0, winCy = 0;

  let ready = false;          // entrada hecha y fuente cargada
  let needsMeasure = true;
  let touching = false, lastType = 'mouse';
  const touch = { x: 0, y: 0 };
  const focus = { x: 0, y: 0 };
  let hadSource = false;
  let strength = 0;
  let tiltX = 0, tiltY = 0;
  let tiltKey = '';

  function measure() {
    needsMeasure = false;
    const base = layoutPos(el);
    for (let i = 0; i < N; i++) {
      const s = spans[i];
      centers[i * 2]     = base.x + s.offsetLeft + s.offsetWidth / 2;
      centers[i * 2 + 1] = base.y + s.offsetTop  + s.offsetHeight / 2;
    }
    titleHalf = Math.max(el.offsetWidth / 2, 1);
    winCx = innerWidth / 2;
    winCy = innerHeight / 2;
  }

  // de dónde viene el foco de presión: ratón, dedo o inclinación del móvil
  const source = { x: 0, y: 0 };
  function readSource() {
    if (lastType === 'touch') {
      if (touching) { source.x = touch.x; source.y = touch.y; return source; }
    } else if (pointer.inside) {
      source.x = pointer.x; source.y = pointer.y;
      return source;
    }
    if (!env.finePointer && orient.active) {
      source.x = winCx + orient.x * titleHalf * 0.6;
      source.y = centers[1] + orient.y * titleHalf * 0.3;
      return source;
    }
    return null;
  }

  function resetLetters() {
    const far = variation(0);
    for (let i = 0; i < N; i++) { spans[i].style.fontVariationSettings = far; }
    lastKey.fill(-1);
    lastStyle.fill('');
  }

  function step(now, dt) {
    if (!ready) return false;
    if (needsMeasure) measure();

    // reducido: sin inclinación ni presión
    if (env.reducedMotion) return false;

    // --- presión de las letras ---
    const src = readSource();
    if (src) {
      if (!hadSource) { focus.x = src.x; focus.y = src.y; }
      const k = ease(FOCUS_LERP, dt);
      focus.x += (src.x - focus.x) * k;
      focus.y += (src.y - focus.y) * k;
    }
    hadSource = !!src;

    const goal = src ? 1 : 0;
    strength += (goal - strength) * ease(STRENGTH_LERP, dt);
    if (Math.abs(goal - strength) < 0.004) strength = goal;

    let wrote = false;
    for (let i = 0; i < N; i++) {
      let t = 0;
      if (strength > 0) {
        const d = Math.hypot(focus.x - centers[i * 2], focus.y - centers[i * 2 + 1]);
        t = clamp(1 - d / titleHalf, 0, 1) * strength;
      }
      // cuantizo a pasos de 1/100 del recorrido para no reescribir por nada
      const q = Math.round(t * 100);
      if (q !== lastKey[i]) {
        lastKey[i] = q;
        const style = variation(q / 100);
        if (style !== lastStyle[i]) {
          lastStyle[i] = style;
          spans[i].style.fontVariationSettings = style;
          wrote = true;
        }
      }
    }

    // --- inclinación 3D del contenedor ---
    let gx = -orient.y * ORIENT_TILT, gy = orient.x * ORIENT_TILT;
    if (pointer.inside && lastType !== 'touch') {
      gx += clamp((pointer.y - winCy) / winCy, -1, 1) * -MAX_TILT;
      gy += clamp((pointer.x - winCx) / winCx, -1, 1) *  MAX_TILT;
    }
    const kt = ease(TILT_LERP, dt);
    tiltX += (gx - tiltX) * kt;
    tiltY += (gy - tiltY) * kt;
    if (Math.abs(gx - tiltX) < 0.005) tiltX = gx;
    if (Math.abs(gy - tiltY) < 0.005) tiltY = gy;

    const key = `perspective(500px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
    if (key !== tiltKey) {
      tiltKey = key;
      container.style.transform = key;
    }

    // todo asentado: paro el bucle (onPointer / orientación / resize lo reanudan)
    const settled = tiltX === gx && tiltY === gy && strength === goal &&
      (!src || (Math.abs(src.x - focus.x) < 0.3 && Math.abs(src.y - focus.y) < 0.3));
    if (settled && !wrote) return false;
  }

  const wake = () => { if (ready) tick(step); };

  // --- entradas ---
  onPointer(e => {
    lastType = e.pointerType;
    if (e.pointerType === 'touch') { touching = true; touch.x = e.clientX; touch.y = e.clientY; }
    wake();
  });
  addEventListener('pointerdown', e => {
    lastType = e.pointerType;
    if (e.pointerType === 'touch') { touching = true; touch.x = e.clientX; touch.y = e.clientY; wake(); }
  }, { passive: true });
  const release = () => { touching = false; wake(); };
  addEventListener('pointerup', release, { passive: true });
  addEventListener('pointercancel', release, { passive: true });
  // el ratón sale de la ventana: relajo el título
  document.documentElement.addEventListener('mouseleave', wake);
  addEventListener('blur', wake);

  // la inclinación del móvil llega con mucho ruido: solo despierto si cambia de verdad
  let lastOx = 0, lastOy = 0;
  addEventListener('deviceorientation', () => {
    if (Math.abs(orient.x - lastOx) < 0.01 && Math.abs(orient.y - lastOy) < 0.01) return;
    lastOx = orient.x; lastOy = orient.y;
    wake();
  }, { passive: true });

  addEventListener('resize', () => { needsMeasure = true; wake(); });

  onReducedMotionChange(reduced => {
    if (reduced) {
      resetLetters();
      tiltX = tiltY = strength = 0;
      tiltKey = '';
      container.style.transform = '';
    } else {
      needsMeasure = true;
      wake();
    }
  });

  // --- arranque: espero a la fuente y a la entrada ---
  const fontReady = (document.fonts && document.fonts.load)
    ? document.fonts.load('900 1em "Roboto Flex"', text).catch(() => {})
    : Promise.resolve();
  let entered = false, fontLoaded = false;
  function maybeStart() {
    if (!entered || !fontLoaded || ready) return;
    ready = true;
    needsMeasure = true;
    wake();
  }
  fontReady.then(() => { fontLoaded = true; maybeStart(); });

  onEnter(() => {
    el.classList.add('entering');
    entered = true;
    maybeStart();
    // al acabar la animación de entrada vuelvo a medir, por si acaso
    el.addEventListener('animationend', e => {
      if (e.target !== el) return;
      needsMeasure = true;
      wake();
    }, { once: true });
  });
}
