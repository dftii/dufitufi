// dragones 3D de las esquinas: un renderer por canvas, sin copias entre canvas
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { env, tick, onEnter, onReducedMotionChange } from './core.js';

const MODEL_URL = 'Dragon.glb';
// fase de cada dragón (el segundo va desfasado para que no se muevan a la par)
const PHASES = [0, 1.2];
const CANVAS_IDS = ['pasta-3d', 'pasta-3d-bottom'];
// instante fijo para el frame estático (reduced motion)
const STATIC_T = 0;

export function initDragons() {
  const dragons = [];

  // un renderer por canvas; si WebGL no está disponible, los canvas se quedan ocultos
  try {
    CANVAS_IDS.forEach((id, i) => {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !env.lowPower,
        powerPreference: 'low-power',
      });
      renderer.setClearColor(0x000000, 0);
      const { scene, camera } = buildScene();
      dragons.push({
        canvas, renderer, scene, camera,
        phase: PHASES[i] ?? 0,
        model: null,
        visible: true,   // lo corrige el IntersectionObserver
        lost: false,
        w: 0, h: 0,
      });
    });
  } catch (err) {
    console.warn('WebGL no disponible, sin dragones:', err);
    dragons.forEach(d => d.renderer.dispose());
    return;
  }
  if (!dragons.length) return;

  let baseY = 0;
  let ready = false;     // modelo cargado
  let entered = false;   // splash superado
  let running = false;   // el tick está suscrito

  // pose del dragón en el instante t (segundos)
  function render(d, t) {
    d.model.position.y = baseY + Math.sin(t * 1.5 + d.phase) * 0.22;
    d.model.rotation.z = Math.sin(t * 0.9 + d.phase) * 0.11;
    d.renderer.render(d.scene, d.camera);
  }

  const canDraw = d => ready && d.model && !d.lost && d.w > 0 && d.h > 0;

  // frame suelto de los que se pueden dibujar (reduced motion, resize, context restored)
  function renderStatic(only) {
    for (const d of only ? [only] : dragons) {
      if (canDraw(d)) render(d, STATIC_T);
    }
  }

  function loop(now) {
    if (env.reducedMotion) { renderStatic(); running = false; return false; }
    const t = now / 1000;
    let drew = false;
    for (const d of dragons) {
      if (!d.visible || !canDraw(d)) continue;
      render(d, t);
      drew = true;
    }
    // nada visible: paro el tick, se reanuda con wake()
    if (!drew) { running = false; return false; }
  }

  function wake() {
    if (!ready || !entered || running) return;
    if (env.reducedMotion) { renderStatic(); return; }
    running = true;
    tick(loop);
  }

  // tamaño: el CSS manda, aquí solo ajusto el buffer (con dpr)
  function resize(d) {
    const w = d.canvas.clientWidth, h = d.canvas.clientHeight;
    d.w = w; d.h = h;
    if (!w || !h) return;
    d.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, env.lowPower ? 1.5 : 2));
    d.renderer.setSize(w, h, false);
    d.camera.aspect = w / h;
    d.camera.updateProjectionMatrix();
    // setSize vacía el buffer: repinto ya, aunque el loop esté parado
    if (canDraw(d) && (!running || env.reducedMotion)) render(d, STATIC_T);
    // por si el loop se había parado por tamaño 0
    wake();
  }

  for (const d of dragons) {
    new ResizeObserver(() => resize(d)).observe(d.canvas);
    resize(d);

    d.canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      d.lost = true;
    });
    d.canvas.addEventListener('webglcontextrestored', () => {
      d.lost = false;
      resize(d);
      renderStatic(d);
      wake();
    });
  }

  // si el canvas no está en pantalla, no lo renderizo
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const d = dragons.find(x => x.canvas === e.target);
      if (d) d.visible = e.isIntersecting;
    }
    wake();
  }, { threshold: 0 });
  dragons.forEach(d => io.observe(d.canvas));

  onReducedMotionChange(reduced => {
    if (reduced) renderStatic();
    else wake();
  });

  // los canvas se muestran al entrar (el frame ya puede estar pintado)
  onEnter(() => {
    entered = true;
    dragons.forEach(d => d.canvas.classList.add('visible'));
    wake();
  });

  // cargo el GLB una sola vez; el segundo dragón es un clon (comparte geometría y material)
  new GLTFLoader().loadAsync(MODEL_URL).then(gltf => {
    const m = gltf.scene;

    // centro y escalo el modelo
    const box    = new THREE.Box3().setFromObject(m);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const scale  = 3.0 / Math.max(size.x, size.y, size.z);
    m.scale.setScalar(scale);
    m.position.copy(center.multiplyScalar(-scale));
    baseY = m.position.y;

    // material rosa compartido
    const mat = new THREE.MeshStandardMaterial({
      color: 0xDD0099,
      metalness: 0.75,
      roughness: 0.18,
      emissive: 0x550033,
      emissiveIntensity: 0.5,
    });
    m.traverse(child => { if (child.isMesh) child.material = mat; });

    dragons.forEach((d, i) => {
      d.model = i === 0 ? m : m.clone(true);
      d.scene.add(d.model);
    });
    ready = true;

    // un frame ya listo para cuando se haga el fade-in
    renderStatic();
    wake();
  }).catch(err => {
    console.error('No se pudo cargar Dragon.glb:', err);
  });
}

// escena + cámara + luces, igual para los dos dragones
function buildScene() {
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 3.5;
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const l1 = new THREE.PointLight(0xFF00CC, 5, 20);
  l1.position.set(2, 2, 2); scene.add(l1);
  const l2 = new THREE.PointLight(0x0044FF, 2.5, 20);
  l2.position.set(-2, -1, 0); scene.add(l2);
  return { scene, camera };
}
