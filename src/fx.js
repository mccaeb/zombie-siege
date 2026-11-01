import * as THREE from 'three';
import { scene, muzzleLight } from './scene.js';
import { R, TAU } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

/* ---------- particle pools (instanced cubes with simple physics) ---------- */
class Pool {
  constructor(n, mat, size = 1, boost = 1) {
    this.n = n; this.i = 0; this.boost = boost;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.p = Array.from({ length: n }, () => ({ life: 0 }));
    for (let k = 0; k < n; k++) { this.mesh.setMatrixAt(k, HIDE); this.mesh.setColorAt(k, col.set(0xffffff)); }
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    const k = this.i; this.i = (this.i + 1) % this.n;
    Object.assign(this.p[k], { x, y, z, vx, vy, vz, life, max: life, size, g: opts.g ?? 22, bounce: opts.bounce ?? 0.3, drag: opts.drag ?? 1.5, spin: R(-12, 12), rx: R(0, TAU), ry: R(0, TAU), stay: opts.stay ?? false });
    this.mesh.setColorAt(k, col.set(color).multiplyScalar(this.boost));
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let k = 0; k < this.n; k++) {
      const p = this.p[k];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { this.mesh.setMatrixAt(k, HIDE); continue; }
      p.vy -= p.g * dt;
      const f = Math.exp(-p.drag * dt); p.vx *= f; p.vz *= f;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.size / 2) { p.y = p.size / 2; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
      p.rx += p.spin * dt; p.ry += p.spin * dt * 0.7;
      const t = p.life / p.max, sc = p.size * (p.stay ? Math.min(1, t * 4) : Math.min(1, t * 2.5));
      e.set(p.rx, p.ry, 0); q.setFromEuler(e);
      this.mesh.setMatrixAt(k, m4.compose(v.set(p.x, p.y, p.z), q, s.set(sc, sc, sc)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (let k = 0; k < this.n; k++) { this.p[k].life = 0; this.mesh.setMatrixAt(k, HIDE); } this.mesh.instanceMatrix.needsUpdate = true; }
}
const lit = new Pool(700, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 }), 1);
lit.mesh.castShadow = true;
const glow = new Pool(500, new THREE.MeshBasicMaterial({ toneMapped: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 1, 3.5);

export function blood(x, y, z, dx, dz, n, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dz, dx) + R(-0.8, 0.8), sp = R(2, 8) * power;
    lit.spawn(x, y, z, Math.cos(a) * sp, R(1, 6), Math.sin(a) * sp, R(0.5, 1.1), R(0.07, 0.17), [0x7a0d0d, 0x9a1414, 0x5a0a0a][i % 3], { bounce: 0.1 });
  }
}
export function gibs(x, z, dx, dz, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dz, dx) + R(-1, 1), sp = R(3, 9);
    lit.spawn(x, R(0.8, 1.8), z, Math.cos(a) * sp, R(3, 8), Math.sin(a) * sp, R(1.6, 2.6), R(0.14, 0.26), i % 2 ? color : 0x6a1010, { bounce: 0.25, stay: true });
  }
}
export function dirt(x, z, n) {
  for (let i = 0; i < n; i++) lit.spawn(x + R(-0.6, 0.6), 0.2, z + R(-0.6, 0.6), R(-2.5, 2.5), R(2, 6), R(-2.5, 2.5), R(0.5, 1), R(0.08, 0.2), [0x4a3726, 0x5e4630, 0x3a2a1c][i % 3], { bounce: 0.15 });
}
export function casing(x, y, z, ax, az, shell) {
  const side = Math.random() < 0.5 ? 1 : 1, px = -az * side, pz = ax * side;
  lit.spawn(x, y, z, px * R(3, 5) - ax * R(0, 1), R(3, 5), pz * R(3, 5) - az * R(0, 1), shell ? 3 : 2.2, shell ? 0.12 : 0.07, shell ? 0xb33a2a : 0xd4a640, { bounce: 0.45, drag: 0.6, stay: true });
}
export function sparks(x, y, z, n = 6, color = 0xffc878) {
  for (let i = 0; i < n; i++) { const a = R(0, TAU), sp = R(3, 10); glow.spawn(x, y, z, Math.cos(a) * sp, R(1, 6), Math.sin(a) * sp, R(0.12, 0.3), R(0.04, 0.08), color, { g: 18, bounce: 0.4, drag: 2 }); }
}
export function burst(x, y, z, color, n = 24) {
  for (let i = 0; i < n; i++) { const a = R(0, TAU), sp = R(3, 9); glow.spawn(x, y, z, Math.cos(a) * sp, R(2, 9), Math.sin(a) * sp, R(0.4, 0.8), R(0.06, 0.12), color, { g: 6, drag: 2.5 }); }
}
export function mote(x, z, color) { glow.spawn(x + R(-0.6, 0.6), R(0.2, 0.8), z + R(-0.6, 0.6), R(-0.3, 0.3), R(1.2, 2.2), R(-0.3, 0.3), R(0.8, 1.4), R(0.04, 0.08), color, { g: -0.5, drag: 0.5 }); }
export function eyeTrail(x, y, z, color) { glow.spawn(x, y, z, 0, 0, 0, 0.25, 0.06, color, { g: 0 }); }

/* ---------- blood decals on the ground ---------- */
const DEC = 420;
const decals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: 0.88 }), DEC);
decals.receiveShadow = true;
for (let k = 0; k < DEC; k++) { decals.setMatrixAt(k, HIDE); decals.setColorAt(k, col.set(0x4a0808)); }
scene.add(decals);
let decI = 0;
export function decal(x, z, r) {
  for (let i = 0; i < 3; i++) {
    const k = decI; decI = (decI + 1) % DEC;
    e.set(0, R(0, TAU), 0); q.setFromEuler(e);
    const sc = r * R(0.5, 1.2);
    decals.setMatrixAt(k, m4.compose(v.set(x + R(-r, r) * 0.6, 0.03 + k * 0.00002, z + R(-r, r) * 0.6), q, s.set(sc * R(0.8, 1.4), 1, sc)));
    decals.setColorAt(k, col.setRGB(R(0.2, 0.34), 0.02, 0.02));
  }
  decals.instanceMatrix.needsUpdate = true; decals.instanceColor.needsUpdate = true;
}

/* ---------- tracers ---------- */
const TR = 260;
const tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.78, 0.45).multiplyScalar(2.2), toneMapped: false, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), TR);
tracers.frustumCulled = false;
for (let k = 0; k < TR; k++) tracers.setMatrixAt(k, HIDE);
scene.add(tracers);
export function drawTracers(bullets) {
  let k = 0;
  for (const b of bullets) {
    if (k >= TR) break;
    const len = Math.min(1.1, b.age * 40);
    e.set(0, -Math.atan2(b.vz, b.vx), 0); q.setFromEuler(e);
    tracers.setMatrixAt(k++, m4.compose(v.set(b.x - Math.cos(b.a) * len / 2, b.y, b.z - Math.sin(b.a) * len / 2), q, s.set(len, 0.035, 0.035)));
  }
  for (; k < TR; k++) tracers.setMatrixAt(k, HIDE);
  tracers.instanceMatrix.needsUpdate = true;
}

/* ---------- muzzle flash ---------- */
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = gr; g.beginPath();
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, r = i % 2 ? 22 : 64; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const flashMat = new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(2.2, 2, 1.7) });
const flashes = [new THREE.Sprite(flashMat), new THREE.Sprite(flashMat)];
flashes.forEach(f => { f.visible = false; scene.add(f); });
let flashT = 0;
export function muzzleFlash(points, big) {
  flashT = 0.055;
  points.forEach((p, i) => { const f = flashes[i]; f.visible = true; f.position.copy(p); f.scale.setScalar((big ? 1.6 : 0.9) * R(0.8, 1.2)); f.material.rotation = R(0, TAU); });
  for (let i = points.length; i < flashes.length; i++) flashes[i].visible = false;
  muzzleLight.position.copy(points[0]).y += 0.4;
  muzzleLight.intensity = big ? 70 : 38;
}

/* ---------- expanding rings ---------- */
const rings = [];
const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
export function ring(x, z, color, r0, r1, life = 0.5, y = 0.08) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.position.set(x, y, z); scene.add(m);
  rings.push({ m, r0, r1, t: life, max: life });
}

export function updateFx(dt) {
  lit.update(dt); glow.update(dt);
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flashes.forEach(f => (f.visible = false)); } }
  muzzleLight.intensity *= Math.exp(-dt * 40);
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t -= dt;
    if (r.t <= 0) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
    const f = 1 - r.t / r.max, rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - f, 2));
    r.m.scale.set(rad, 1, rad); r.m.material.opacity = 1 - f;
  }
}
export function clearFx() {
  lit.clear(); glow.clear();
  for (let k = 0; k < DEC; k++) decals.setMatrixAt(k, HIDE); decals.instanceMatrix.needsUpdate = true;
  rings.forEach(r => scene.remove(r.m)); rings.length = 0;
}
