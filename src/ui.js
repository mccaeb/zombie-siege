import { WEAPONS, WEAPON_ORDER, MAG_MAX_LEVEL } from './config.js';
import { svgIcon, SUN, MOON } from './icons.js';
import { input, STICK } from './input.js';
import { worldToScreen, coarse } from './scene.js';

const $ = id => document.getElementById(id);
export { $ };

const hud = $('hud'), screen = $('screen'), panels = ['pStart', 'pPause', 'pOver'];
export function showPanel(id) {
  screen.hidden = false; panels.forEach(p => ($(p).hidden = p !== id));
  hud.toggleAttribute('data-off', id !== 'pPause');
  const b = $(id).querySelector('.cta'); if (b && !coarse) b.focus({ preventScroll: true });
}
export function hideScreen() { screen.hidden = true; hud.removeAttribute('data-off'); }

let bannerTimer = 0, toastTimer = 0;
export function banner(title, sub, ms = 2000) {
  $('bTitle').textContent = title; $('bSub').textContent = sub || '';
  $('banner').classList.add('show'); clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('banner').classList.remove('show'), ms);
}
export function toast(title, sub) {
  const t = $('toast'); t.innerHTML = `<b>${title}</b>${sub}`; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}

$('armory').innerHTML =
  `<span>${svgIcon('dual')}Dual pistols</span><span>${svgIcon('smg')}SMG</span><span>${svgIcon('shotgun')}Shotgun</span>` +
  `<span class="m">${svgIcon('mag')}Bigger mags</span><span class="h">${svgIcon('med')}Medkit</span>`;

export function buildSlots(g, fresh, onPick) {
  const box = $('hSlots'); box.innerHTML = '';
  for (const w of WEAPON_ORDER) {
    if (!g.owned.has(w)) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'slot' + (w === fresh ? ' fresh' : ''); b.dataset.w = w;
    b.setAttribute('aria-label', WEAPONS[w].name); b.setAttribute('aria-pressed', String(g.weapon === w));
    b.innerHTML = svgIcon(w);
    b.addEventListener('click', () => onPick(w));
    box.appendChild(b);
  }
  const pips = document.createElement('div'); pips.className = 'magpips';
  pips.setAttribute('aria-label', `Magazine upgrades ${g.magLvl} of ${MAG_MAX_LEVEL}`);
  for (let i = 0; i < MAG_MAX_LEVEL; i++) { const e = document.createElement('i'); if (i < g.magLvl) e.className = 'on'; pips.appendChild(e); }
  box.appendChild(pips);
}
export function syncSlots(weapon) { for (const b of $('hSlots').querySelectorAll('.slot')) b.setAttribute('aria-pressed', String(b.dataset.w === weapon)); }

const ui = {};
const set = (k, v, fn) => { if (ui[k] !== v) { ui[k] = v; fn(v); } };
export function updateHud(g) {
  set('score', g.score, v => ($('hScore').textContent = v));
  set('wave', g.wave, v => ($('hWave').textContent = v));
  set('left', g.toSpawn + g.zombies.filter(z => !z.dead).length, v => ($('hLeft').textContent = v));
  const hp = Math.max(0, Math.ceil(g.hp));
  set('hp', hp, v => { $('hHpNum').textContent = v; const b = $('hHp'); b.style.width = v + '%'; b.classList.toggle('low', v <= 30); });
  set('mag', g.reloadT > 0 ? '··' : String(g.ammo[g.weapon]), v => ($('hMag').textContent = v));
  set('max', '/' + g.magMax(g.weapon), v => ($('hMax').textContent = v));
  set('gun', WEAPONS[g.weapon].name, v => ($('hGun').textContent = v));
  set('rl', g.reloadT > 0, v => $('hAmmo').classList.toggle('reloading', v));
  const mult = g.mult();
  set('mult', mult, v => { $('hMult').hidden = v < 2; $('hMult').textContent = '×' + v; });
  const mins = Math.floor(g.tod * 6) * 10;
  set('clock', String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'), v => ($('hClock').textContent = v));
  set('day', g.light > 0.5, v => ($('hClockIco').innerHTML = v ? SUN : MOON));
}

/* ---------- 2D overlay: floating text, sticks, crosshair, damage vignette ---------- */
const ov = $('overlay'), oc = ov.getContext('2d');
let odpr = 1;
export function resizeOverlay() { odpr = Math.min(devicePixelRatio || 1, 2); ov.width = innerWidth * odpr; ov.height = innerHeight * odpr; }
export const floaters = [];
export function floater(x, y, z, txt, color, big) { floaters.push({ x, y, z, txt, color, big, t: big ? 1.4 : 0.9, max: big ? 1.4 : 0.9 }); }

function stick(s, label, hx, hy) {
  oc.lineWidth = 2;
  if (s.id !== null) {
    oc.strokeStyle = 'rgba(236,229,209,.35)'; oc.beginPath(); oc.arc(s.ox, s.oy, STICK, 0, Math.PI * 2); oc.stroke();
    oc.fillStyle = 'rgba(236,229,209,.28)'; oc.beginPath(); oc.arc(s.x, s.y, 24, 0, Math.PI * 2); oc.fill();
  } else {
    oc.strokeStyle = 'rgba(236,229,209,.15)'; oc.beginPath(); oc.arc(hx, hy, STICK, 0, Math.PI * 2); oc.stroke();
    oc.fillStyle = 'rgba(236,229,209,.4)'; oc.font = '600 11px "Chakra Petch", monospace'; oc.textAlign = 'center';
    oc.fillText(label, hx, hy + 4);
  }
}
export function drawOverlay(dt, g, playing) {
  const W = innerWidth, H = innerHeight;
  oc.setTransform(odpr, 0, 0, odpr, 0, 0); oc.clearRect(0, 0, W, H);
  oc.textAlign = 'center';
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t -= dt; f.y += dt * 1.6;
    if (f.t <= 0) { floaters.splice(i, 1); continue; }
    const p = worldToScreen(f.x, f.y, f.z); if (p.behind) continue;
    const pop = f.big ? 1 + Math.max(0, f.t - f.max + 0.15) * 3 : 1;
    oc.save(); oc.translate(p.x, p.y); oc.scale(pop, pop); oc.globalAlpha = Math.min(1, f.t * 2);
    oc.font = `700 ${f.big ? 19 : 14}px "Chakra Petch", monospace`;
    oc.lineWidth = 4; oc.strokeStyle = 'rgba(8,10,9,.75)'; oc.strokeText(f.txt, 0, 0);
    oc.fillStyle = f.color; oc.fillText(f.txt, 0, 0); oc.restore();
  }
  oc.globalAlpha = 1;
  let vig = g.hurtT;
  if (playing && g.hp <= 30) vig = Math.max(vig, 0.25 + 0.12 * Math.sin(performance.now() / 200));
  if (vig > 0) {
    const gr = oc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    gr.addColorStop(0, 'rgba(160,15,10,0)'); gr.addColorStop(1, `rgba(160,15,10,${Math.min(0.75, vig)})`);
    oc.fillStyle = gr; oc.fillRect(0, 0, W, H);
  }
  if (!playing) return;
  if (input.mode === 'touch') { stick(input.left, 'MOVE', 96, H - 110); stick(input.right, 'AIM + FIRE', W - 96, H - 110); return; }
  const mx = input.mouseX, my = input.mouseY;
  oc.strokeStyle = 'rgba(236,229,209,.9)'; oc.lineWidth = 1.5;
  oc.beginPath(); oc.arc(mx, my, 9, 0, Math.PI * 2); oc.stroke();
  oc.beginPath();
  oc.moveTo(mx - 15, my); oc.lineTo(mx - 11, my); oc.moveTo(mx + 11, my); oc.lineTo(mx + 15, my);
  oc.moveTo(mx, my - 15); oc.lineTo(mx, my - 11); oc.moveTo(mx, my + 11); oc.lineTo(mx, my + 15);
  oc.stroke();
  if (g.hitMarkT > 0) {
    oc.strokeStyle = `rgba(255,255,255,${g.hitMarkT * 8})`; oc.lineWidth = 2; oc.beginPath();
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { oc.moveTo(mx + a * 5, my + b * 5); oc.lineTo(mx + a * 10, my + b * 10); }
    oc.stroke();
  }
  if (g.reloadT > 0) {
    oc.strokeStyle = 'rgba(255,201,101,.95)'; oc.lineWidth = 2.5;
    oc.beginPath(); oc.arc(mx, my, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - g.reloadT / g.reloadMax)); oc.stroke();
  }
}
