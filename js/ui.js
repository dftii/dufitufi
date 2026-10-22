// interfaz: splash, modales, ondas de click, toast y easter eggs
import { env, state, enter, requestOrientation } from './core.js';
import { unlockAudio } from './audio.js';

const $ = id => document.getElementById(id);

// los efectos (ondas, flash) van dentro del dialog abierto si lo hay:
// un dialog modal está en la top layer y tapa todo lo que haya fuera
const overlayHost = () => document.querySelector('dialog[open]') || document.body;

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* sin vibración */ }
}

// quita un efecto al terminar su animación (con timeout por si la animación no corre)
function removeAfterAnimation(el, fallbackMs) {
  const done = () => el.remove();
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, fallbackMs);
}

// splash de entrada
function initSplash() {
  const splash = $('splash');
  if (!splash) return;
  let busy = false;

  // el foco estaba en el botón del splash, que desaparece: lo paso al título
  function moveFocus() {
    const title = $('pasta');
    if (!title) return;
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  }

  // lo visual (ocultar splash + entrada de título y dragones) va en la transición
  function reveal() {
    splash.classList.add('hidden');
    enter();
    moveFocus();
  }

  splash.addEventListener('click', () => {
    if (busy || state.entered) return;
    busy = true;
    vibrate(40);
    requestOrientation();
    // audio: síncrono dentro del gesto. startViewTransition llama a su callback
    // de forma asíncrona y para entonces play() ya podría estar bloqueado (iOS)
    unlockAudio();
    if (document.startViewTransition && !env.reducedMotion) {
      document.startViewTransition(reveal);
    } else {
      reveal();
    }
  });
}

// modales (<dialog>)
function initDialogs() {
  for (const dialog of document.querySelectorAll('dialog.overlay')) {
    // cierro solo si el click empezó y terminó en el fondo (no al soltar un arrastre desde el modal)
    let downOnBackdrop = false;
    dialog.addEventListener('pointerdown', e => { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener('click', e => {
      if (e.target.closest('[data-close]') || (e.target === dialog && downOnBackdrop)) dialog.close();
      downOnBackdrop = false;
    });
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (dialog && !dialog.open) dialog.showModal();
}

// onda rosa al tocar (solo pointerdown: un único evento en ratón y táctil)
function initRipples() {
  document.addEventListener('pointerdown', e => {
    if (env.reducedMotion) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top  = e.clientY + 'px';
    overlayHost().appendChild(ripple);
    removeAfterAnimation(ripple, 800);
  });
}

// aviso en la región aria-live (se anuncia y se ve)
let toastTimer = 0;
function showToast(msg) {
  const region = $('toast-region');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  region.replaceChildren(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2100);
}

// teclas que no cuentan para las secuencias (modificadores, repeticiones, eventos sin key)
const ignoreKey = e => !e.key || e.ctrlKey || e.metaKey || e.altKey || e.repeat ||
  e.key === 'Shift' || e.key === 'CapsLock';

// easter egg: escribir "pasta"
function initPasta() {
  const seq = 'pasta';
  let idx = 0;
  document.addEventListener('keydown', e => {
    if (ignoreKey(e)) return;
    // escribiendo en un campo (el slider de volumen incluido) no cuenta
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) { idx = 0; return; }
    const k = e.key.toLowerCase();
    if (k === seq[idx]) {
      idx++;
      if (idx === seq.length) { idx = 0; openDialog('overlay-easter'); }
    } else {
      idx = k === seq[0] ? 1 : 0;
    }
  });
}

// 10 clicks rápidos (menos de 2.5s entre uno y otro) = modal secreto
function initSecretClicks() {
  let clicks = 0;
  let timer = 0;
  document.addEventListener('click', e => {
    if (!state.entered) return;
    if (document.querySelector('dialog[open]') || e.target.closest('.vol-ctrl')) return;
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 2500);
    if (clicks >= 10) {
      clicks = 0;
      clearTimeout(timer);
      openDialog('overlay-secret');
    }
  });
}

// konami code
function initKonami() {
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let buf = [];
  let rainbowTimer = 0;

  function celebrate() {
    // flash rosa
    const flash = document.createElement('div');
    flash.className = 'konami-flash';
    overlayHost().appendChild(flash);
    removeAfterAnimation(flash, 800);

    showToast('⬆⬆⬇⬇⬅➡⬅➡ BA 🎮 KONAMI!');
    vibrate([80, 40, 80, 40, 200]);

    // arcoíris en el título 6 segundos
    const title = $('pasta');
    if (title) {
      title.classList.add('rainbow');
      clearTimeout(rainbowTimer);
      rainbowTimer = setTimeout(() => title.classList.remove('rainbow'), 6000);
    }
  }

  document.addEventListener('keydown', e => {
    if (ignoreKey(e)) return;
    buf.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (buf.length > KONAMI.length) buf.shift();
    if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i])) {
      buf = [];
      celebrate();
    }
  });
}

export function initUI() {
  initSplash();
  initDialogs();
  initRipples();
  initPasta();
  initSecretClicks();
  initKonami();
}
