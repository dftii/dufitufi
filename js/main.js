// punto de entrada: arranca cada efecto por separado, si uno falla los demás siguen
import { initStars }  from './stars.js';
import { initCursor } from './cursor.js';
import { initTitle }  from './title.js';
import { initAudio }  from './audio.js';
import { initUI }     from './ui.js';

for (const init of [initStars, initCursor, initTitle, initAudio, initUI]) {
  try { init(); } catch (err) { console.error(err); }
}

// three.js pesa: lo cargo aparte para no bloquear el resto
import('./dragons.js')
  .then(m => m.initDragons())
  .catch(err => console.error('dragones 3D no disponibles:', err));
