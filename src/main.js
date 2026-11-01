import './style.css';
import * as THREE from 'three';
import { WORLD, PLAYER, ZOMBIES, WEAPONS, WEAPON_ORDER, MAG_MAX_LEVEL, DROPS, WAVES, DAY, CAMERA } from './config.js';
import { R, TAU, clamp, lerpAngle, pick } from './util.js';
import { renderer, scene, resize, render, degrade, buildWorld, obstacles, applyTime, lightAt, updateCamera, camState, screenToGround, torch, glowLight, timeState } from './scene.js';
import { makePlayer, makeZombie, makePickup } from './models.js';
import * as fx from './fx.js';
import { initAudio, sfx, groan, setMuted, isMuted } from './audio.js';
import { input, onInput, resetInput } from './input.js';
import { $, showPanel, hideScreen, banner, toast, buildSlots, syncSlots, updateHud, drawOverlay, resizeOverlay, floater, floaters } from './ui.js';

const HALF = WORLD.size / 2 - 2;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PICK = {
  dual:    { label: 'DUAL PISTOLS', color: 0xffc965, ink: '#ffe3a6' },
  smg:     { label: 'SMG',          color: 0xffc965, ink: '#ffe3a6' },
  shotgun: { label: 'SHOTGUN',      color: 0xffc965, ink: '#ffe3a6' },
  mag:     { label: 'BIGGER MAGS',  color: 0x8ff0b0, ink: '#d9f7e2' },
  med:     { label: '+35 HEALTH',   color: 0xff6e5a, ink: '#ffd2c8' }
};

/* ---------- storage ---------- */
let best = 0;
try { best = +localStorage.getItem('gs-best') || 0; setMuted(localStorage.getItem('gs-muted') === '1'); } catch (e) {}

/* ---------- state ---------- */
const player = makePlayer();
scene.add(player.root);
const g = {
  state: 'menu', wave: 1, toSpawn: 0, spawnT: 0, breakT: 0, score: 0, kills: 0, combo: 0, comboT: 0,
  x: 0, z: 0, a: -Math.PI / 2, aimX: 0, aimZ: -1, hp: PLAYER.maxHp, inv: 0, hurtT: 0, step: 0, moving: 0, recoil: 0, hand: 1,
  weapon: 'pistol', ammo: {}, owned: new Set(['pistol']), magLvl: 0, reloadT: 0, reloadMax: 1, fireT: 0,
  upgradeCD: 0, tod: 23, light: 0, zombies: [], bullets: [], pickups: [], hitMarkT: 0, hitstop: 0, groanT: 2,
  magMax: w => Math.round(WEAPONS[w].mag * (1 + 0.5 * g.magLvl)),
  mult: () => 1 + Math.min(3, Math.floor(g.combo / 6))
};

/* ---------- helpers ---------- */
function collide(e, r) {
  for (const o of obstacles) {
    const dx = e.x - o.x, dz = e.z - o.z, rr = o.r + r, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1; e.x = o.x + dx / d * rr; e.z = o.z + dz / d * rr; }
  }
  e.x = clamp(e.x, -HALF, HALF); e.z = clamp(e.z, -HALF, HALF);
}
const muzzleWorld = [new THREE.Vector3(), new THREE.Vector3()];

/* ---------- zombies ---------- */
function spawnZombie() {
  const graves = obstacles.filter(o => o.kind === 'stone' && Math.hypot(o.plotX - g.x, o.plotZ - g.z) > 16);
  let x, z, rise = 0;
  if (graves.length && Math.random() < 0.7) { const o = pick(graves); x = o.plotX + R(-0.3, 0.3); z = o.plotZ + R(-0.3, 0.3); rise = 1.1; }
  else { const ang = R(0, TAU), d = 24 * camState.zoom + 4; x = clamp(g.x + Math.cos(ang) * d, -HALF, HALF); z = clamp(g.z + Math.sin(ang) * d, -HALF, HALF); }
  const rr = Math.random(), pb = WAVES.bruteChance(g.wave), pr = WAVES.runnerChance(g.wave);
  const type = rr < pb ? 'brute' : rr < pb + pr ? 'runner' : 'walker';
  const T = ZOMBIES[type], hp = T.hp + (type === 'brute' ? Math.floor(g.wave / 3) : 0);
  const model = makeZombie(type);
  scene.add(model.root);
  const zb = { type, x, z, a: Math.atan2(g.z - z, g.x - x), hp, max: hp, spd: T.speed * R(0.85, 1.15) * WAVES.speedMult(g.wave), dmg: T.dmg, pts: T.pts, r: T.radius, hitT: 0, rise, riseMax: rise || 1, wob: R(0, 6), dead: false, deadT: 0, model };
  g.zombies.push(zb);
  if (rise) fx.dirt(x, z, 14);
  placeZombie(zb, 0);
}
function placeZombie(zb, dt) {
  const m = zb.model, T = ZOMBIES[zb.type];
  m.root.position.set(zb.x, 0, zb.z);
  m.root.rotation.y = -zb.a;
  if (zb.rise > 0) {
    const f = zb.rise / zb.riseMax;
    m.rig.position.y = -2.3 * T.scale * f;
    m.rig.rotation.z = -0.5 * f;
    m.arms.forEach((a, i) => (a.rotation.z = 0.9 * f + Math.sin(performance.now() / 90 + i) * 0.2 * f));
    return;
  }
  m.rig.position.y = 0;
  if (zb.dead) {
    const t = zb.deadT;
    m.rig.rotation.z = Math.min(1, t / 0.35) * (Math.PI / 2 - 0.05);
    m.rig.position.y = t > 1.6 ? -(t - 1.6) * 1.4 : Math.min(1, t / 0.35) * 0.25 * T.scale;
    return;
  }
  const sw = Math.sin(zb.wob), run = zb.type === 'runner' ? 1.4 : 1;
  m.legs[0].rotation.z = sw * 0.6 * run; m.legs[1].rotation.z = -sw * 0.6 * run;
  m.arms[0].rotation.z = -0.1 + Math.sin(zb.wob * 0.5) * 0.15; m.arms[1].rotation.z = -0.1 - Math.sin(zb.wob * 0.5 + 1) * 0.15;
  m.rig.rotation.x = Math.sin(zb.wob * 0.5) * 0.08;
  m.rig.rotation.z = 0;
  m.mat.emissive.setScalar(zb.hitT > 0 ? 0.9 : 0);
}
function removeZombie(i) {
  const zb = g.zombies[i]; scene.remove(zb.model.root); zb.model.mat.dispose(); g.zombies.splice(i, 1);
}

/* ---------- pickups ---------- */
function dropOptions() {
  const onGround = new Set(g.pickups.map(k => k.type)), o = [];
  if (!g.owned.has('dual') && !onGround.has('dual')) o.push('dual');
  if (g.wave >= 3 && !g.owned.has('smg') && !onGround.has('smg')) o.push('smg');
  if (g.wave >= 4 && !g.owned.has('shotgun') && !onGround.has('shotgun')) o.push('shotgun');
  if (g.magLvl < MAG_MAX_LEVEL && !onGround.has('mag')) o.push('mag');
  return o;
}
function pickDrop(force) {
  const o = dropOptions();
  if (o.length && (force || g.upgradeCD <= 0)) { g.upgradeCD = DROPS.upgradeCooldown; return pick(o); }
  return g.hp < DROPS.medkitBelowHp ? 'med' : null;
}
function spawnPickup(x, z, type, life = DROPS.pickupLife, fall = false) {
  const model = makePickup(type, PICK[type].color);
  model.root.position.set(x, 0, z); scene.add(model.root);
  g.pickups.push({ x, z, type, t: life, age: 0, bob: R(0, 6), y: fall ? 26 : 1.3, vy: 0, falling: fall, model });
}
function removePickup(i) { const k = g.pickups[i]; scene.remove(k.model.root); g.pickups.splice(i, 1); }
function supplyDrop() {
  const type = pickDrop(true) || 'med', a = R(0, TAU), d = R(5.5, 8);
  const k = { x: g.x + Math.cos(a) * d, z: g.z + Math.sin(a) * d };
  collide(k, 0.8);
  spawnPickup(k.x, k.z, type, DROPS.supplyLife, true);
  sfx.drop();
}
function collect(k) {
  const P = PICK[k.type];
  fx.ring(k.x, k.z, P.color, 0.4, 4, 0.5); fx.ring(k.x, k.z, P.color, 0.2, 2.2, 0.35, 1.2);
  fx.burst(k.x, 1.3, k.z, P.color, 30);
  if (k.type === 'med') { g.hp = Math.min(PLAYER.maxHp, g.hp + 35); sfx.heal(); floater(g.x, 2.6, g.z, P.label, P.ink, true); return; }
  if (k.type === 'mag') {
    g.magLvl = Math.min(MAG_MAX_LEVEL, g.magLvl + 1);
    for (const w of g.owned) g.ammo[w] = g.magMax(w);
    g.reloadT = 0; sfx.mag();
    floater(g.x, 2.6, g.z, `BIGGER MAGS ${['I', 'II', 'III'][g.magLvl - 1]}`, P.ink, true);
    buildSlots(g, null, equip); return;
  }
  g.owned.add(k.type); g.ammo[k.type] = g.magMax(k.type);
  equip(k.type, true); sfx.weapon();
  floater(g.x, 2.6, g.z, P.label, P.ink, true);
  buildSlots(g, k.type, equip);
}

/* ---------- weapons ---------- */
function equip(w, silent) {
  if (g.state !== 'play' || !g.owned.has(w) || (g.weapon === w && !silent)) return;
  g.weapon = w; g.reloadT = 0; g.fireT = Math.max(g.fireT, 0.12);
  if (g.ammo[w] == null) g.ammo[w] = g.magMax(w);
  player.setWeapon(w);
  if (!silent) sfx.swap();
  syncSlots(w);
}
function cycleWeapon(dir) {
  const list = WEAPON_ORDER.filter(w => g.owned.has(w)); if (list.length < 2) return;
  equip(list[(list.indexOf(g.weapon) + dir + list.length) % list.length]);
}
function startReload() {
  if (g.reloadT > 0 || g.ammo[g.weapon] >= g.magMax(g.weapon)) return;
  g.reloadT = g.reloadMax = WEAPONS[g.weapon].reload; sfx.reload();
}
function fire() {
  const w = WEAPONS[g.weapon];
  g.fireT = w.rate; g.ammo[g.weapon]--;
  player.root.position.set(g.x, 0, g.z); player.root.rotation.y = -g.a;   // muzzle must match this frame's aim
  player.root.updateMatrixWorld(true);
  let mi = 0;
  if (g.weapon === 'dual') { g.hand = -g.hand; mi = g.hand > 0 ? 1 : 0; }
  const mz = player.muzzles[mi].getWorldPosition(muzzleWorld[0]);
  for (let i = 0; i < w.pellets; i++) {
    const a = g.a + R(-w.spread, w.spread), sp = w.speed * R(0.92, 1.06);
    g.bullets.push({ x: mz.x, y: mz.y, z: mz.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, a, life: w.life * R(0.85, 1.1), age: 0 });
  }
  fx.muzzleFlash([mz], w.pellets > 1);
  fx.casing(mz.x - g.aimX * 0.4, mz.y, mz.z - g.aimZ * 0.4, g.aimX, g.aimZ, w.pellets > 1);
  fx.sparks(mz.x, mz.y, mz.z, w.pellets > 1 ? 8 : 3, 0xffd890);
  g.recoil = Math.min(0.5, g.recoil + w.recoil);
  if (!reduceMotion) { camState.shake = Math.max(camState.shake, w.shake); camState.kickX -= g.aimX * w.kick * 0.5; camState.kickZ -= g.aimZ * w.kick * 0.5; }
  if (w.pellets > 1) { g.x -= g.aimX * 0.35; g.z -= g.aimZ * 0.35; }
  sfx[w.snd]();
}

/* ---------- combat ---------- */
function kill(zb, dx, dz) {
  zb.dead = true; zb.deadT = 0; g.kills++; g.combo++; g.comboT = 2.2;
  const m = g.mult(), pts = zb.pts * m;
  g.score += pts;
  floater(zb.x, 2.4 * ZOMBIES[zb.type].scale, zb.z, '+' + pts, m > 1 ? '#ffc965' : '#ece5d1');
  zb.a = Math.atan2(-dz, -dx);    // fall away from the shot
  fx.blood(zb.x, 1.3, zb.z, dx, dz, zb.type === 'brute' ? 40 : 22, 1.3);
  fx.gibs(zb.x, zb.z, dx, dz, zb.type === 'brute' ? 10 : 5, ZOMBIES[zb.type].skin);
  fx.decal(zb.x + dx * 0.6, zb.z + dz * 0.6, ZOMBIES[zb.type].radius * 1.4);
  sfx.kill();
  if (zb.type === 'brute') { g.hitstop = 0.07; camState.shake = Math.max(camState.shake, 0.35); }
  if (Math.random() < (zb.type === 'brute' ? DROPS.bruteChance : DROPS.zombieChance)) { const t = pickDrop(); if (t) spawnPickup(zb.x, zb.z, t); }
}
function hitZombie(zb, b) {
  const dx = Math.cos(b.a), dz = Math.sin(b.a);
  zb.hp -= 1; zb.hitT = 0.07; g.hitMarkT = 0.12;
  const kb = zb.type === 'brute' ? 0.15 : 0.55;
  zb.x += dx * kb; zb.z += dz * kb;
  fx.blood(b.x, b.y, b.z, dx, dz, 7);
  if (Math.random() < 0.5) fx.decal(zb.x + dx * 0.9, zb.z + dz * 0.9, 0.35);
  sfx.hit();
  if (zb.hp <= 0) kill(zb, dx, dz);
}

/* ---------- game flow ---------- */
function startWave(n) {
  g.wave = n; g.toSpawn = WAVES.base + n * WAVES.perWave; g.spawnT = 1.4;
  const sub = n === 1 ? 'They are coming up out of the ground' : n === 3 ? 'Runners now. Keep moving.' : n === 5 ? 'Brutes now. Empty a mag into them.' : `${g.toSpawn} of them`;
  banner(`Wave ${n}`, sub, 2200); sfx.wave();
}
function clearActors() {
  while (g.zombies.length) removeZombie(0);
  while (g.pickups.length) removePickup(0);
  g.bullets.length = 0; floaters.length = 0; fx.clearFx();
}
function newGame() {
  clearActors(); buildWorld();
  Object.assign(g, { x: 0, z: 0, a: -Math.PI / 2, aimX: 0, aimZ: -1, hp: PLAYER.maxHp, inv: 1, hurtT: 0, recoil: 0, weapon: 'pistol', ammo: { pistol: WEAPONS.pistol.mag }, owned: new Set(['pistol']), magLvl: 0, reloadT: 0, fireT: 0, score: 0, kills: 0, combo: 0, comboT: 0, breakT: 0, upgradeCD: DROPS.firstUpgradeAfter, tod: DAY.startHour, hitstop: 0 });
  camState.zoom = 1; player.setWeapon('pistol'); player.root.visible = true;
  buildSlots(g, null, equip);
  resetInput(); g.state = 'play'; hideScreen(); document.body.classList.add('playing');
  updateCamera(g.x, g.z, g.aimX, g.aimZ, 0, true);
  last = performance.now();
  startWave(1);
}
function gameOver() {
  g.state = 'over'; document.body.classList.remove('playing'); resetInput(); sfx.dead();
  fx.blood(g.x, 1.2, g.z, 0, 0, 40, 1.4); fx.decal(g.x, g.z, 1.4);
  player.root.visible = false;
  const isNew = g.score > best; if (isNew) { best = g.score; try { localStorage.setItem('gs-best', String(best)); } catch (e) {} }
  $('oTitle').textContent = `They got you on wave ${g.wave}`;
  $('oScore').textContent = g.score; $('oKills').textContent = g.kills; $('oBest').textContent = best;
  $('oNew').hidden = !isNew || g.score === 0;
  setTimeout(() => { if (g.state === 'over') showPanel('pOver'); }, 1100);
}
function pause() { if (g.state !== 'play') return; g.state = 'pause'; resetInput(); $('psWave').textContent = g.wave; showPanel('pPause'); document.body.classList.remove('playing'); }
function resume() { if (g.state !== 'pause') return; initAudio(); g.state = 'play'; hideScreen(); document.body.classList.add('playing'); last = performance.now(); }
function menu() {
  g.state = 'menu'; document.body.classList.remove('playing'); $('sBest').textContent = best;
  clearActors(); buildWorld(); camState.zoom = 1;
  Object.assign(g, { x: 0, z: 0, hp: PLAYER.maxHp, weapon: 'pistol', tod: 23 });
  player.setWeapon('pistol'); player.root.visible = true;
  for (let i = 0; i < 8; i++) {
    const type = i === 0 ? 'brute' : i < 3 ? 'runner' : 'walker', a = R(0, TAU), d = R(11, 17);
    const model = makeZombie(type); scene.add(model.root);
    g.zombies.push({ type, x: Math.cos(a) * d, z: Math.sin(a) * d, a: a + Math.PI, hp: 1, max: 1, spd: 0.7, r: ZOMBIES[type].radius, hitT: 0, rise: 0, riseMax: 1, wob: R(0, 6), dead: false, deadT: 0, model });
  }
  ['dual', 'mag', 'med'].forEach((t, i) => { const a = -Math.PI / 2 + (i - 1) * 0.5; spawnPickup(Math.cos(a) * 6.5, Math.sin(a) * 6.5, t, 1e9); });
  updateCamera(0, 0, 0, -1, 0, true);
  showPanel('pStart');
}

/* ---------- input wiring ---------- */
onInput({
  key(e) {
    if (g.state === 'play') {
      if (e.code === 'KeyR') startReload();
      if (e.code === 'KeyQ') cycleWeapon(1);
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (n >= 0) equip(WEAPON_ORDER[n]);
      if (e.code === 'KeyP' || e.code === 'Escape') pause();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    } else if (g.state === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) resume();
  },
  wheel(d) { if (g.state === 'play') cycleWeapon(d); },
  blur() { if (g.state === 'play') pause(); },
  canTouch: () => g.state === 'play'
});
$('hAmmo').addEventListener('click', () => { if (g.state === 'play') startReload(); });
$('bPause').addEventListener('click', () => (g.state === 'play' ? pause() : g.state === 'pause' && resume()));
function applyMute() {
  const m = isMuted();
  $('icoSound').hidden = m; $('icoMute').hidden = !m;
  $('bMute').setAttribute('aria-pressed', String(m)); $('bMute').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
}
$('bMute').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); try { localStorage.setItem('gs-muted', isMuted() ? '1' : '0'); } catch (e) {} applyMute(); });
applyMute();
for (const id of ['bStart', 'bAgain', 'bRestart']) $(id).addEventListener('click', () => { initAudio(); newGame(); });
$('bResume').addEventListener('click', resume);
$('bMenu').addEventListener('click', menu);

/* ---------- update ---------- */
function update(dt) {
  const k = input.keys;
  let mx = 0, mz = 0;
  if (k.KeyW || k.ArrowUp) mz -= 1;
  if (k.KeyS || k.ArrowDown) mz += 1;
  if (k.KeyA || k.ArrowLeft) mx -= 1;
  if (k.KeyD || k.ArrowRight) mx += 1;
  if (input.left.id !== null) { mx += input.left.vx; mz += input.left.vy; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  g.x += mx * PLAYER.speed * dt; g.z += mz * PLAYER.speed * dt;
  g.moving = Math.min(1, ml); g.step += dt * 11 * g.moving;
  collide(g, PLAYER.radius);

  let firing = false;
  if (input.right.id !== null) {
    if (Math.hypot(input.right.vx, input.right.vy) > 0.25) { g.a = Math.atan2(input.right.vy, input.right.vx); firing = true; }
  } else if (input.mode === 'mouse') {
    const p = screenToGround(input.mouseX, input.mouseY);
    if (p) g.a = Math.atan2(p.z - g.z, p.x - g.x);
    firing = input.mouseDown;
  } else if (ml > 0.15) g.a = lerpAngle(g.a, Math.atan2(mz, mx), dt * 8);
  if (k.Space) firing = true;
  g.aimX = Math.cos(g.a); g.aimZ = Math.sin(g.a);

  g.fireT -= dt; g.inv -= dt; g.hurtT = Math.max(0, g.hurtT - dt * 1.4); g.hitMarkT -= dt;
  g.recoil *= Math.exp(-dt * 16);
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) { g.reloadT = 0; g.ammo[g.weapon] = g.magMax(g.weapon); } }
  if (firing && g.fireT <= 0 && g.reloadT <= 0) { if (g.ammo[g.weapon] > 0) fire(); else { sfx.dry(); startReload(); } }
  if (g.ammo[g.weapon] <= 0 && g.reloadT <= 0) startReload();

  // bullets
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i]; let dead = false;
    for (let s = 0; s < 3 && !dead; s++) {
      b.x += b.vx * dt / 3; b.z += b.vz * dt / 3;
      for (const o of obstacles) if ((b.x - o.x) ** 2 + (b.z - o.z) ** 2 < o.r * o.r) { dead = true; fx.sparks(b.x, b.y, b.z, 6); if (Math.random() < 0.3) sfx.ricochet(); break; }
      if (dead) break;
      for (const zb of g.zombies) {
        if (zb.dead) continue;
        const rr = zb.r * (zb.rise > 0 ? 0.6 : 1.1);
        if ((b.x - zb.x) ** 2 + (b.z - zb.z) ** 2 < rr * rr) { dead = true; hitZombie(zb, b); break; }
      }
    }
    b.life -= dt; b.age += dt;
    if (dead || b.life <= 0 || Math.abs(b.x) > HALF + 4 || Math.abs(b.z) > HALF + 4) g.bullets.splice(i, 1);
  }

  // zombies
  const L = lightAt(g.tod), nightMult = 1 - DAY.daySpeedPenalty * L + DAY.nightSpeedBonus * (1 - L);
  for (let i = g.zombies.length - 1; i >= 0; i--) {
    const zb = g.zombies[i];
    zb.hitT -= dt;
    if (zb.dead) { zb.deadT += dt; placeZombie(zb, dt); if (zb.deadT > 2.8) removeZombie(i); continue; }
    if (zb.rise > 0) { zb.rise -= dt; if (Math.random() < 0.4) fx.dirt(zb.x, zb.z, 1); placeZombie(zb, dt); continue; }
    const dx = g.x - zb.x, dz = g.z - zb.z, d = Math.hypot(dx, dz) || 1;
    zb.a = lerpAngle(zb.a, Math.atan2(dz, dx), dt * (zb.type === 'runner' ? 8 : 4));
    zb.wob += dt * (zb.type === 'runner' ? 14 : zb.type === 'brute' ? 5 : 7);
    const sp = zb.spd * (zb.hitT > 0 ? 0.35 : 1) * nightMult;
    zb.x += Math.cos(zb.a) * sp * dt + Math.sin(zb.wob * 0.5) * dt * 0.5;
    zb.z += Math.sin(zb.a) * sp * dt;
    if (d < zb.r + PLAYER.radius && g.inv <= 0) {
      g.hp -= zb.dmg; g.inv = PLAYER.invuln; g.hurtT = 0.7;
      if (!reduceMotion) camState.shake = 0.45;
      g.x += dx / d * 0.8; g.z += dz / d * 0.8; collide(g, PLAYER.radius);
      fx.blood(g.x, 1.4, g.z, dx, dz, 10); sfx.hurt();
      if (g.hp <= 0) { g.hp = 0; gameOver(); return; }
    }
  }
  const live = g.zombies.filter(z => !z.dead && z.rise <= 0);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j], dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-4) {
        const d = Math.sqrt(d2), o = (rr - d) / 2, nx = dx / d, nz = dz / d;
        const wa = a.type === 'brute' ? 0.25 : 1, wb = b.type === 'brute' ? 0.25 : 1;
        a.x -= nx * o * wa; a.z -= nz * o * wa; b.x += nx * o * wb; b.z += nz * o * wb;
      }
    }
    collide(a, a.r);
  }
  for (const zb of live) placeZombie(zb, dt);

  // pickups
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const p = g.pickups[i]; p.t -= dt;
    if (p.t <= 0) { removePickup(i); continue; }
    if (!p.falling && Math.hypot(p.x - g.x, p.z - g.z) < PLAYER.radius + 0.9) { removePickup(i); collect(p); }
  }

  // waves
  if (g.breakT > 0) { g.breakT -= dt; if (g.breakT <= 0) startWave(g.wave + 1); }
  else if (g.toSpawn > 0) {
    g.spawnT -= dt;
    if (g.spawnT <= 0 && live.length < WAVES.maxAlive(g.wave)) { spawnZombie(); g.toSpawn--; g.spawnT = WAVES.spawnGap(g.wave) * R(0.6, 1.3); }
  } else if (!g.zombies.some(z => !z.dead)) {
    g.breakT = WAVES.breakSeconds; g.hp = Math.min(PLAYER.maxHp, g.hp + WAVES.clearHeal);
    if (g.wave % DROPS.supplyEveryWaves === 0) { banner('Wave cleared', `+${WAVES.clearHeal} health · supply drop incoming`, 2600); supplyDrop(); }
    else banner('Wave cleared', `+${WAVES.clearHeal} health · next wave in 3`, 2600);
  }

  g.comboT -= dt; if (g.comboT <= 0) g.combo = 0;
  g.upgradeCD -= dt;
  g.groanT -= dt; if (g.groanT <= 0) { g.groanT = R(1.6, 4); if (live.length) groan(); }

  // clock
  const prevH = g.tod; g.tod = (g.tod + dt / DAY.secondsPerHour(g.tod)) % 24;
  if (prevH < 18 && g.tod >= 18) toast('Dusk', 'Night is coming');
  else if (prevH < 20 && g.tod >= 20) toast('Nightfall', 'They move faster in the dark');
  else if (prevH < 5 && g.tod >= 5) toast('First light', 'Hold on till sunrise');
  else if (prevH < 7 && g.tod >= 7) toast('Daybreak', 'They slow down in the light');

  // camera pulls back slowly as the horde grows (never zooms back in)
  const zt = Math.min(CAMERA.maxZoomOut, 1 + 0.035 * (g.wave - 1) + 0.007 * live.length);
  if (zt > camState.zoom) camState.zoom += (zt - camState.zoom) * Math.min(1, dt * 0.12);
}

/* ---------- per-frame visuals shared by play and menu ---------- */
function animate(dt, now) {
  // player rig
  const pr = player;
  pr.root.position.set(g.x, 0, g.z);
  pr.root.rotation.y = -g.a;
  const sw = Math.sin(g.step) * 0.7 * g.moving;
  pr.legs[0].rotation.z = sw; pr.legs[1].rotation.z = -sw;
  pr.upper.position.y = Math.abs(Math.sin(g.step)) * 0.06 * g.moving;
  pr.upper.position.x = -g.recoil * 0.5;
  pr.gunMounts.forEach(m => (m.rotation.z = g.reloadT > 0 ? -0.6 : g.recoil * 0.8));
  pr.root.visible = g.state !== 'over' && !(g.inv > 0 && g.state === 'play' && Math.floor(now / 50) % 2 === 0);

  // torch follows aim
  torch.position.set(g.x + g.aimX * 0.5, 1.7, g.z + g.aimZ * 0.5);
  torch.target.position.set(g.x + g.aimX * 12, 0, g.z + g.aimZ * 12);
  glowLight.position.set(g.x, 2.6, g.z);

  // pickups float, spin, pulse, fall from the sky for supply drops
  for (const p of g.pickups) {
    p.age += dt; p.bob += dt * 3;
    const m = p.model;
    if (p.falling) {
      p.vy -= 30 * dt; p.y += p.vy * dt;
      if (p.y <= 1.3) { p.y = 1.3; p.falling = false; fx.ring(p.x, p.z, PICK[p.type].color, 0.5, 5, 0.6); fx.dirt(p.x, p.z, 16); camState.shake = Math.max(camState.shake, 0.2); }
    }
    const blink = p.t < 3 && Math.floor(p.t * 6) % 2 === 0;
    m.root.visible = !blink;
    m.root.position.set(p.x, 0, p.z);
    const pop = Math.min(1, p.age * 3);
    m.holder.position.y = p.y + (p.falling ? 0 : Math.sin(p.bob) * 0.18);
    m.holder.rotation.y += dt * 1.8; m.holder.scale.setScalar(0.4 + 0.6 * pop);
    const pulse = 1 + 0.12 * Math.sin(now / 160 + p.bob);
    m.ring.scale.setScalar(pulse); m.ring.material.opacity = 0.4 + 0.25 * Math.sin(now / 160 + p.bob);
    m.iconMat.emissiveIntensity = 0.55 + 0.35 * Math.sin(now / 200 + p.bob);
    if (Math.random() < dt * 8) fx.mote(p.x, p.z, PICK[p.type].color);
  }
}

/* ---------- loop ---------- */
let last = performance.now(), perfAcc = 0, perfN = 0, perfT = 0, perfDone = false;
function frame(now) {
  let dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (g.hitstop > 0) { g.hitstop -= dt; dt *= 0.08; }
  if (g.state === 'play') update(dt);
  else if (g.state === 'menu') {
    g.a = -Math.PI / 2 + Math.sin(now / 2800) * 1.1; g.aimX = Math.cos(g.a); g.aimZ = Math.sin(g.a);
    for (const zb of g.zombies) {
      const dx = g.x - zb.x, dz = g.z - zb.z, d = Math.hypot(dx, dz);
      zb.a = lerpAngle(zb.a, Math.atan2(dz, dx), dt * 2); zb.wob += dt * 5;
      if (d > 9) { zb.x += Math.cos(zb.a) * zb.spd * dt; zb.z += Math.sin(zb.a) * zb.spd * dt; }
      placeZombie(zb, dt);
    }
  } else if (g.state === 'over') {
    for (let i = g.zombies.length - 1; i >= 0; i--) { const zb = g.zombies[i]; if (zb.dead) { zb.deadT += dt; placeZombie(zb, dt); } else { zb.wob += dt * 4; placeZombie(zb, dt); } }
  }
  animate(dt, now);
  fx.updateFx(dt);
  fx.drawTracers(g.bullets);
  applyTime(g.tod, g, null, g.state === 'menu' ? 0 : null);
  g.light = timeState.light;
  updateCamera(g.x, g.z, g.state === 'menu' ? 0 : g.aimX, g.state === 'menu' ? 0 : g.aimZ, dt);
  render();
  drawOverlay(dt, g, g.state === 'play');
  if (g.state === 'play') updateHud(g);

  // adaptive quality: if the game runs slowly for a few seconds, trade effects for frame rate
  if (g.state === 'play' && !perfDone) {
    perfAcc += now - (frame.prev || now); perfN++; perfT += dt;
    if (perfT > 2.5) { if (perfAcc / perfN > 24) perfDone = !degrade(); perfAcc = perfN = perfT = 0; }
  }
  frame.prev = now;
  requestAnimationFrame(frame);
}

addEventListener('resize', () => { resize(); resizeOverlay(); });
resize(); resizeOverlay();
menu();
requestAnimationFrame(frame);

// handy for tuning from the browser console
window.__gs = { g, scene, renderer, spawnZombie, spawnPickup, update, input };
