// audio: música de fondo y control de volumen
import { onEnter } from './core.js';

const STORAGE_KEY = 'dufitufi:vol';
const DEFAULT_VOL = 50;

// iconos del altavoz (apagado / bajo / alto)
const ICONS = {
  off:  'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z',
  low:  'M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z',
  high: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
};

let audio, slider, btn, iconPath;
let vol = DEFAULT_VOL;   // 0-100, lo que marca el slider
let prevVol = DEFAULT_VOL; // para restaurar al quitar el mute

// web audio: en iOS Safari audio.volume se ignora, así que el volumen va por un GainNode
let ctx = null;
let gainNode = null;
let unlocked = false;

// curva para que el slider al 50% suene como un 50% de verdad
const toGain = v => Math.pow(v / 100, 2.5);

function readStoredVol() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VOL;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : DEFAULT_VOL;
  } catch {
    return DEFAULT_VOL;
  }
}

function storeVol(v) {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* sin storage, no pasa nada */ }
}

// aplica el volumen al audio (GainNode si existe, si no audio.volume)
function applyGain() {
  const g = toGain(vol);
  if (gainNode && ctx) {
    // rampa corta para evitar chasquidos al mover el slider
    gainNode.gain.setTargetAtTime(g, ctx.currentTime, 0.015);
  } else {
    audio.volume = g;
  }
  audio.muted = vol === 0;
}

// actualiza slider, icono y atributos de accesibilidad
function renderControls() {
  slider.style.setProperty('--vol-pct', vol + '%');
  iconPath.setAttribute('d', vol === 0 ? ICONS.off : vol < 50 ? ICONS.low : ICONS.high);
  const muted = vol === 0;
  btn.setAttribute('aria-pressed', String(muted));
  btn.setAttribute('aria-label', muted ? 'Activar sonido' : 'Silenciar');
}

function setVolume(v) {
  vol = Math.min(100, Math.max(0, Number(v) || 0));
  if (vol > 0) prevVol = vol;
  applyGain();
  renderControls();
}

function toggleMute() {
  const next = vol > 0 ? 0 : (prevVol || DEFAULT_VOL);
  slider.value = String(next);
  setVolume(next);
  storeVol(next);
}

function setupWebAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    gainNode = ctx.createGain();
    gainNode.gain.value = toGain(vol);
    const src = ctx.createMediaElementSource(audio);
    src.connect(gainNode).connect(ctx.destination);
    // ya manda el GainNode, el elemento va a tope
    audio.volume = 1;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (err) {
    console.warn('web audio no disponible, uso audio.volume:', err);
    gainNode = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    applyGain();
  }
}

// hay que llamarla de forma síncrona dentro del gesto del usuario (el click del splash):
// crea el AudioContext y lanza play() antes de que el navegador pierda la activación
export function unlockAudio() {
  if (unlocked || !audio) return;
  unlocked = true;
  // en iOS hace que suene aunque el interruptor de silencio esté puesto
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* nada */ }
  setupWebAudio();
  audio.play().catch(() => {});
}

export function initAudio() {
  audio    = document.getElementById('audio-player');
  slider   = document.getElementById('volSlider');
  btn      = document.getElementById('volBtn');
  iconPath = document.getElementById('volIconPath');
  if (!audio || !slider || !btn || !iconPath) return;

  audio.loop = true;

  vol = readStoredVol();
  if (vol > 0) prevVol = vol;
  slider.value = String(vol);
  applyGain();
  renderControls();

  slider.addEventListener('input', () => {
    setVolume(slider.value);
    storeVol(vol);
  });
  btn.addEventListener('click', toggleMute);

  // por si alguien llama a enter() sin pasar por el splash (idempotente)
  onEnter(unlockAudio);

  // iOS puede suspender el contexto al cambiar de app, lo reanudo al volver
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  });
}
