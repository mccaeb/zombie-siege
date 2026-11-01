import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WORLD, CAMERA } from './config.js';
import { R, TAU, clamp, smooth, cbox, merge, colorize } from './util.js';

export const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------- renderer + post ---------- */
const canvas = document.getElementById('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05080c, 0.03);
scene.background = new THREE.Color(0x05080c);

export const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 220);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

export const quality = { bloom: true, torchShadows: !coarse, pixelRatio: Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2) };
let vw = 1, vh = 1;
export function resize() {
  vw = innerWidth; vh = innerHeight;
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(vw, vh, false);
  composer.setPixelRatio(quality.pixelRatio);
  composer.setSize(vw, vh);
  bloom.resolution.set(vw / 2, vh / 2);
  camera.aspect = vw / vh;
  // keep a similar amount of world visible on tall phones
  camera.fov = vw < vh ? CAMERA.fov * 1.35 : CAMERA.fov;
  camera.updateProjectionMatrix();
}
export function render() { if (quality.bloom) composer.render(); else renderer.render(scene, camera); }

/** Step quality down one notch when frames are slow. Returns false when already at the floor. */
export function degrade() {
  if (torch.castShadow) { torch.castShadow = false; quality.torchShadows = false; return true; }
  if (quality.pixelRatio > 1) { quality.pixelRatio = 1; resize(); return true; }
  if (quality.bloom) { quality.bloom = false; return true; }
  if (sun.shadow.mapSize.x > 1024) { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; return true; }
  return false;
}

/* ---------- lights ---------- */
export const hemi = new THREE.HemisphereLight(0x26324a, 0x0a0d0a, 0.15);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// player's torch
export const torch = new THREE.SpotLight(0xffd9a0, 0, 34, 0.52, 0.45, 1.1);
torch.castShadow = quality.torchShadows;
torch.shadow.mapSize.set(512, 512);
torch.shadow.bias = -0.002; torch.shadow.camera.near = 0.5;
scene.add(torch, torch.target);
export const glowLight = new THREE.PointLight(0xffe2b0, 0, 9, 1.6);   // soft light around the player at night
scene.add(glowLight);
export const muzzleLight = new THREE.PointLight(0xffc070, 0, 14, 1.6);
scene.add(muzzleLight);

/* ---------- ground ---------- */
const HALF = WORLD.size / 2;
function groundTexture() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), px = S / WORLD.size;
  g.fillStyle = '#4a5f3a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {   // grass: same hue, varied lightness so it reads as texture, not confetti
    const s = R(1, 4), l = R(0.6, 1.35);
    g.fillStyle = `rgba(${(64 * l) | 0},${(92 * l) | 0},${(48 * l) | 0},${R(0.3, 0.7).toFixed(2)})`;
    g.fillRect(R(0, S), R(0, S), s, s);
  }
  g.lineWidth = 1.5;
  for (let i = 0; i < 9000; i++) {   // blades
    const x = R(0, S), y = R(0, S), l = R(0.8, 1.5);
    g.strokeStyle = `rgba(${(70 * l) | 0},${(104 * l) | 0},${(50 * l) | 0},.5)`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - R(3, 7)); g.stroke();
  }
  for (let i = 0; i < 300; i++) {   // patches of worn and dark grass
    g.fillStyle = Math.random() < 0.5 ? 'rgba(90,82,50,.12)' : 'rgba(20,40,20,.18)';
    g.beginPath(); g.arc(R(0, S), R(0, S), R(20, 70), 0, TAU); g.fill();
  }
  const pw = WORLD.pathWidth * px;
  g.fillStyle = '#8b8170'; g.fillRect(S / 2 - pw / 2, 0, pw, S); g.fillRect(0, S / 2 - pw / 2, S, pw);
  for (let i = 0; i < 14000; i++) {
    const v = Math.random() < 0.5;
    const x = v ? R(S / 2 - pw / 2, S / 2 + pw / 2) : R(0, S), y = v ? R(0, S) : R(S / 2 - pw / 2, S / 2 + pw / 2);
    const l = R(0.65, 1.3);
    g.fillStyle = `rgba(${(140 * l) | 0},${(130 * l) | 0},${(112 * l) | 0},.8)`; g.fillRect(x, y, R(1.5, 3.5), R(1.5, 3.5));
  }
  return { canvas: c, px };
}
const gt = groundTexture();
export const groundCanvas = gt;
const groundTex = new THREE.CanvasTexture(gt.canvas);
groundTex.colorSpace = THREE.SRGBColorSpace;
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD.size + 60, WORLD.size + 60).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x2b3426, roughness: 1 })
);
ground.receiveShadow = true;
scene.add(ground);
const arena = new THREE.Mesh(
  new THREE.PlaneGeometry(WORLD.size, WORLD.size).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ map: groundTex, bumpMap: groundTex, bumpScale: 0.6, roughness: 0.95 })
);
arena.position.y = 0.01; arena.receiveShadow = true;
scene.add(arena);

/* ---------- graves, trees, fence, lamps ---------- */
export const obstacles = [];
const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 });
const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1c1f1e, roughness: 0.6, metalness: 0.6 });
const envGroup = new THREE.Group(); scene.add(envGroup);

const STONE_TYPES = [
  // rounded slab
  () => { const top = new THREE.CylinderGeometry(0.55, 0.55, 0.22, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2); top.translate(0, 1.15, 0); return merge([cbox(1.1, 1.15, 0.22, 0, 0.575, 0, 0x6d736c), colorize(top, 0x6d736c), cbox(1.3, 0.14, 0.4, 0, 0.07, 0, 0x5a5f58), cbox(0.6, 0.05, 0.03, 0, 0.95, 0.12, 0x3c403b), cbox(0.4, 0.05, 0.03, 0, 0.8, 0.12, 0x3c403b)]); },
  // cross
  () => merge([cbox(0.24, 1.7, 0.24, 0, 0.85, 0, 0x7a7f77), cbox(0.9, 0.22, 0.24, 0, 1.22, 0, 0x7a7f77), cbox(0.7, 0.2, 0.5, 0, 0.1, 0, 0x5a5f58)]),
  // square slab, slightly broken
  () => merge([cbox(1.0, 1.0, 0.24, 0, 0.5, 0, 0x60665f, [0, 0, 0.06]), cbox(0.4, 0.2, 0.24, 0.25, 1.05, 0, 0x60665f, [0, 0, 0.3]), cbox(1.2, 0.12, 0.38, 0, 0.06, 0, 0x50554f)]),
  // obelisk
  () => { const o = new THREE.CylinderGeometry(0.16, 0.36, 2.2, 4).rotateY(Math.PI / 4); o.translate(0, 1.4, 0); return merge([colorize(o, 0x80857c), cbox(0.9, 0.3, 0.9, 0, 0.15, 0, 0x5a5f58)]); }
];
const stoneGeos = STONE_TYPES.map(f => f());
const moundGeo = (() => { const g = new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2); g.scale(0.75, 0.22, 1.2); return colorize(g, 0x4a3726); })();
const moundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

export function buildWorld() {
  envGroup.clear(); obstacles.length = 0;
  const step = WORLD.size / (WORLD.graveRows + 1);
  const counts = stoneGeos.map(() => []), mounds = [];
  for (let r = 0; r < WORLD.graveRows; r++) for (let c = 0; c < WORLD.graveRows; c++) {
    if (Math.random() < 0.42) continue;
    const x = -HALF + step * (c + 1) + R(-1.6, 1.6), z = -HALF + step * (r + 1) + R(-1.6, 1.6);
    if (Math.abs(x) < 4.5 || Math.abs(z) < 4.5 || Math.hypot(x, z) < 15) continue;
    const t = Math.random() < 0.5 ? 0 : (Math.random() * 4) | 0, rot = R(-0.15, 0.15);
    counts[t].push({ x, z, rot, tilt: R(-0.08, 0.08) });
    mounds.push({ x, z: z + 1.6, rot });
    obstacles.push({ x, z, r: t === 3 ? 0.55 : 0.7, kind: 'stone', plotX: x, plotZ: z + 1.6 });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  counts.forEach((list, i) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(stoneGeos[i], stoneMat, list.length);
    list.forEach((o, k) => { e.set(0, o.rot, o.tilt); q.setFromEuler(e); p.set(o.x, 0, o.z); im.setMatrixAt(k, m.compose(p, q, s)); });
    im.castShadow = im.receiveShadow = true; envGroup.add(im);
  });
  const mm = new THREE.InstancedMesh(moundGeo, moundMat, mounds.length);
  mounds.forEach((o, k) => { e.set(0, o.rot, 0); q.setFromEuler(e); p.set(o.x, 0, o.z); mm.setMatrixAt(k, m.compose(p, q, s)); });
  mm.receiveShadow = true; envGroup.add(mm);

  // trees: dark trunk + clumped low-poly canopy
  let tries = 0; const trees = [];
  while (trees.length < WORLD.trees && tries++ < 500) {
    const x = R(-HALF + 7, HALF - 7), z = R(-HALF + 7, HALF - 7);
    if (Math.abs(x) < 5.5 || Math.abs(z) < 5.5 || Math.hypot(x, z) < 17) continue;
    if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < 5.5)) continue;
    trees.push({ x, z, s: R(0.85, 1.25) }); obstacles.push({ x, z, r: 0.75, kind: 'tree' });
  }
  for (const t of trees) {
    const parts = [cbox(0.7, 4, 0.7, 0, 2, 0, 0x2e241c), cbox(0.25, 1.6, 0.25, 0.6, 3.2, 0.2, 0x2e241c, [0, 0, -0.8])];
    for (let i = 0; i < 4; i++) {
      const ico = new THREE.IcosahedronGeometry(R(1.7, 2.4), 0);
      ico.translate(R(-1.2, 1.2), R(4.2, 6), R(-1.2, 1.2));
      parts.push(colorize(ico, [0x1d3323, 0x24402b, 0x1a2c1f][i % 3]));
    }
    const mesh = new THREE.Mesh(merge(parts), leafMat);
    mesh.position.set(t.x, 0, t.z); mesh.scale.setScalar(t.s); mesh.rotation.y = R(0, TAU);
    mesh.castShadow = mesh.receiveShadow = true; envGroup.add(mesh);
  }

  // iron fence around the arena
  const posts = [], gap = 1.3;
  for (let a = -HALF; a <= HALF; a += gap) posts.push([a, -HALF], [a, HALF], [-HALF, a], [HALF, a]);
  const postGeo = merge([cbox(0.12, 2.0, 0.12, 0, 1.0, 0, 0x1c1f1e), (() => { const c = new THREE.ConeGeometry(0.12, 0.3, 4); c.translate(0, 2.15, 0); return colorize(c, 0x1c1f1e); })()]);
  const pm = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.6 }), posts.length);
  posts.forEach(([x, z], k) => { p.set(x, 0, z); pm.setMatrixAt(k, m.compose(p, q.identity(), s)); });
  pm.castShadow = true; envGroup.add(pm);
  for (const y of [0.4, 1.7]) for (const [x, z, w, d] of [[0, -HALF, WORLD.size, 0.08], [0, HALF, WORLD.size, 0.08], [-HALF, 0, 0.08, WORLD.size], [HALF, 0, 0.08, WORLD.size]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), ironMat); rail.position.set(x, y, z); rail.castShadow = true; envGroup.add(rail);
  }
  // two lamp posts at the crossroads
  for (const [x, z] of [[-3.6, -3.6], [3.6, 3.6]]) {
    const lamp = new THREE.Mesh(merge([cbox(0.18, 3.6, 0.18, 0, 1.8, 0, 0x1c1f1e), cbox(0.5, 0.25, 0.5, 0, 3.7, 0, 0x1c1f1e), cbox(0.6, 0.15, 0.6, 0, 0.07, 0, 0x2a2d2b)]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.7 }));
    lamp.position.set(x, 0, z); lamp.castShadow = true; envGroup.add(lamp);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), lampBulbMat); bulb.position.set(x, 3.4, z); envGroup.add(bulb);
    obstacles.push({ x, z, r: 0.35, kind: 'lamp' });
    lampLights[lamps++ % 2].position.set(x, 3.3, z);
  }
  lamps = 0;
  return obstacles;
}
const lampBulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc56b).multiplyScalar(3), toneMapped: false });
let lamps = 0;
const lampLights = [new THREE.PointLight(0xffb45a, 0, 16, 1.5), new THREE.PointLight(0xffb45a, 0, 16, 1.5)];
lampLights.forEach(l => scene.add(l));

/* ---------- day / night ---------- */
// light 0 = full night, 1 = full day. warmth peaks mid-dusk and mid-dawn.
export function lightAt(h) { if (h >= 7 && h < 18) return 1; if (h >= 18 && h < 20) return 1 - smooth((h - 18) / 2); if (h >= 5 && h < 7) return smooth((h - 5) / 2); return 0; }
export function warmthAt(h) { if (h >= 18 && h < 20) return Math.sin(Math.PI * (h - 18) / 2); if (h >= 5 && h < 7) return Math.sin(Math.PI * (h - 5) / 2); return 0; }

const C = (hex) => new THREE.Color(hex);
const PAL = {
  night: { sky: C(0x05080c), sun: C(0x6f86b8), sunI: 0.35, hemiS: C(0x2a3650), hemiG: C(0x0a0d0a), hemiI: 0.22, fog: 0.026 },
  day:   { sky: C(0xa9b8bf), sun: C(0xfff1dc), sunI: 2.6,  hemiS: C(0xc4d6e6), hemiG: C(0x4c5a3c), hemiI: 1.0,  fog: 0.010 },
  dusk:  { sky: C(0x6a4a52), sun: C(0xff9a5a) },
  dawn:  { sky: C(0x9a7a86), sun: C(0xffb0a0) }
};
const tmp = new THREE.Color(), tmp2 = new THREE.Color();
export const eyeMats = [];
export const timeState = { light: 0, warmth: 0 };
export function applyTime(h, focus, aim, nightOverride) {
  const L = nightOverride != null ? nightOverride : lightAt(h), W = nightOverride != null ? 0 : warmthAt(h), N = 1 - L;
  timeState.light = L; timeState.warmth = W;
  const warm = h > 12 ? PAL.dusk : PAL.dawn;
  tmp.copy(PAL.night.sky).lerp(PAL.day.sky, L).lerp(warm.sky, W * 0.55);
  scene.background.copy(tmp); scene.fog.color.copy(tmp);
  scene.fog.density = PAL.night.fog + (PAL.day.fog - PAL.night.fog) * L + W * 0.002;
  sun.color.copy(PAL.night.sun).lerp(PAL.day.sun, L).lerp(warm.sun, W);
  sun.intensity = PAL.night.sunI + (PAL.day.sunI - PAL.night.sunI) * L + W * 0.6;
  hemi.color.copy(PAL.night.hemiS).lerp(PAL.day.hemiS, L).lerp(warm.sky, W * 0.5);
  hemi.groundColor.copy(PAL.night.hemiG).lerp(PAL.day.hemiG, L);
  hemi.intensity = PAL.night.hemiI + (PAL.day.hemiI - PAL.night.hemiI) * L;
  // sun swings across the sky; long low shadows at dusk and dawn; the moon sits high at night
  const az = (h / 24) * TAU + 0.6, elev = L > 0.02 ? clamp(0.32 + 0.7 * Math.sin(Math.PI * clamp((h - 5) / 15, 0, 1)), 0.25, 1.05) : 0.95;
  sun.position.set(focus.x + Math.cos(az) * Math.cos(elev) * 50, Math.sin(elev) * 50, focus.z + Math.sin(az) * Math.cos(elev) * 50);
  sun.target.position.set(focus.x, 0, focus.z);
  torch.intensity = 60 * clamp(N * 1.15, 0, 1);
  glowLight.intensity = 5 * N;
  for (const l of lampLights) l.intensity = (18 + Math.sin(performance.now() * 0.023) * 1.5 + (Math.random() < 0.02 ? -10 : 0)) * N;
  lampBulbMat.color.setRGB(1, 0.77, 0.42).multiplyScalar(0.6 + 2.6 * N);
  for (const m of eyeMats) m.color.copy(m.userData.base).multiplyScalar(0.8 + 5 * N);
  bloom.strength = 0.55 + 0.4 * N;
  renderer.toneMappingExposure = 1.0 + 0.15 * N;
}

/* ---------- camera ---------- */
const camTarget = new THREE.Vector3(), camOff = new THREE.Vector3();
export const camState = { zoom: 1, shake: 0, kickX: 0, kickZ: 0 };
export function updateCamera(px, pz, aimX, aimZ, dt, snap) {
  const pitch = THREE.MathUtils.degToRad(CAMERA.pitch), dist = CAMERA.distance * camState.zoom;
  const tx = px + aimX * CAMERA.lookAhead + camState.kickX, tz = pz + aimZ * CAMERA.lookAhead + camState.kickZ;
  if (snap) camTarget.set(tx, 0, tz); else camTarget.lerp(tmpV.set(tx, 0, tz), 1 - Math.exp(-dt * 8));
  camOff.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  const sh = camState.shake;
  camera.position.set(camTarget.x + camOff.x + R(-sh, sh), camOff.y + R(-sh, sh) * 0.5, camTarget.z + camOff.z + R(-sh, sh));
  camera.lookAt(camTarget.x, 0, camTarget.z);
  camState.kickX *= Math.exp(-dt * 14); camState.kickZ *= Math.exp(-dt * 14);
  camState.shake = Math.max(0, sh - dt * 2.2);
}
const tmpV = new THREE.Vector3();

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1), hit = new THREE.Vector3();
export function screenToGround(sx, sy) {
  ndc.set(sx / vw * 2 - 1, -(sy / vh) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? hit : null;
}
const proj = new THREE.Vector3();
export function worldToScreen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return { x: (proj.x + 1) / 2 * vw, y: (1 - proj.y) / 2 * vh, behind: proj.z > 1 };
}
export const viewSize = () => ({ w: vw, h: vh });
