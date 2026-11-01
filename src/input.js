import { coarse } from './scene.js';

export const STICK = 56;
export const input = {
  keys: {}, mouseX: innerWidth / 2, mouseY: innerHeight / 2, mouseDown: false,
  mode: coarse ? 'touch' : 'mouse',
  left: { id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 },
  right: { id: null, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 }
};
const handlers = { key: () => {}, wheel: () => {}, blur: () => {}, canTouch: () => false };
export const onInput = h => Object.assign(handlers, h);

function setMode(m) { input.mode = m; document.body.classList.toggle('mouse', m === 'mouse'); }
setMode(input.mode);

const cv = document.getElementById('game');
addEventListener('keydown', e => { input.keys[e.code] = true; handlers.key(e); });
addEventListener('keyup', e => { input.keys[e.code] = false; });
addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; input.mouseDown = false; handlers.blur(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) handlers.blur(); });
cv.addEventListener('mousemove', e => { input.mouseX = e.clientX; input.mouseY = e.clientY; setMode('mouse'); });
cv.addEventListener('mousedown', e => { if (e.button === 0) { input.mouseDown = true; setMode('mouse'); } });
addEventListener('mouseup', e => { if (e.button === 0) input.mouseDown = false; });
cv.addEventListener('wheel', e => { e.preventDefault(); handlers.wheel(e.deltaY > 0 ? 1 : -1); }, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());

const stickFor = id => (input.left.id === id ? input.left : input.right.id === id ? input.right : null);
cv.addEventListener('touchstart', e => {
  e.preventDefault(); setMode('touch');
  if (!handlers.canTouch()) return;
  for (const t of e.changedTouches) {
    const s = t.clientX < innerWidth / 2 ? input.left : input.right;
    if (s.id !== null) continue;
    s.id = t.identifier; s.ox = s.x = t.clientX; s.oy = s.y = t.clientY; s.vx = s.vy = 0;
  }
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const s = stickFor(t.identifier); if (!s) continue;
    s.x = t.clientX; s.y = t.clientY;
    let dx = s.x - s.ox, dy = s.y - s.oy; const m = Math.hypot(dx, dy);
    if (m > STICK) { s.ox = s.x - dx / m * STICK; s.oy = s.y - dy / m * STICK; dx = s.x - s.ox; dy = s.y - s.oy; }
    s.vx = dx / STICK; s.vy = dy / STICK;
  }
}, { passive: false });
const end = e => { for (const t of e.changedTouches) { const s = stickFor(t.identifier); if (s) { s.id = null; s.vx = s.vy = 0; } } };
cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
export function resetInput() { for (const s of [input.left, input.right]) { s.id = null; s.vx = s.vy = 0; } input.mouseDown = false; }
