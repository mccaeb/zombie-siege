import * as THREE from 'three';
import { ZOMBIES } from './config.js';
import { cbox, merge, R } from './util.js';
import { iconGeometry } from './icons.js';
import { eyeMats } from './scene.js';

// Chunky low-poly placeholders in the Minigore spirit. Every model faces +X.
// Replace these builders with loaded glTF models when real art arrives.

const gunMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.75 });

const GUNS = {
  pistol: () => merge([cbox(0.44, 0.11, 0.08, 0.16, 0.02, 0, 0x22262a), cbox(0.12, 0.22, 0.07, -0.02, -0.12, 0, 0x151719, [0, 0, -0.25]), cbox(0.08, 0.05, 0.05, 0.4, 0.02, 0, 0x101214)]),
  smg: () => merge([cbox(0.62, 0.15, 0.1, 0.2, 0.02, 0, 0x2a2e33), cbox(0.3, 0.05, 0.05, 0.62, 0.03, 0, 0x101214), cbox(0.08, 0.3, 0.07, 0.24, -0.17, 0, 0x1a1c1f, [0, 0, 0.12]), cbox(0.11, 0.2, 0.08, -0.02, -0.12, 0, 0x151719, [0, 0, -0.25]), cbox(0.3, 0.06, 0.06, -0.2, 0.04, 0, 0x151719)]),
  shotgun: () => merge([cbox(1.0, 0.07, 0.07, 0.5, 0.06, 0, 0x1c1f22), cbox(0.85, 0.06, 0.06, 0.45, -0.02, 0, 0x26292d), cbox(0.3, 0.1, 0.1, 0.62, -0.03, 0, 0x6b4a2e), cbox(0.36, 0.13, 0.1, 0.0, 0.03, 0, 0x2a2e33), cbox(0.5, 0.14, 0.09, -0.36, -0.04, 0, 0x5a3b22, [0, 0, 0.12])])
};
const GUN_GEOS = {}; for (const k in GUNS) GUN_GEOS[k] = GUNS[k]();
const MUZZLE = { pistol: 0.46, smg: 0.8, shotgun: 1.02 };

export function makePlayer() {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const legGeo = merge([cbox(0.32, 0.72, 0.32, 0, -0.36, 0, 0x2b3038), cbox(0.42, 0.18, 0.34, 0.06, -0.8, 0, 0x1a1a1a)]);
  const legs = [-0.2, 0.2].map(z => {
    const pivot = new THREE.Group(); pivot.position.set(0, 0.88, z);
    const m = new THREE.Mesh(legGeo, mat); m.castShadow = true; pivot.add(m); root.add(pivot); return pivot;
  });
  const upper = new THREE.Group(); root.add(upper);
  const torso = new THREE.Mesh(merge([
    cbox(0.52, 0.82, 0.86, 0, 1.3, 0, 0x2f3b46),            // jacket
    cbox(0.54, 0.82, 0.1, 0, 1.3, -0.22, 0xe8c53f),         // hi-vis bands
    cbox(0.54, 0.82, 0.1, 0, 1.3, 0.22, 0xe8c53f),
    cbox(0.56, 0.1, 0.88, 0, 1.0, 0, 0x1d1f22),             // belt
    cbox(0.3, 0.6, 0.6, -0.38, 1.35, 0, 0x3a3226),          // backpack
    cbox(0.44, 0.44, 0.44, 0.02, 1.98, 0, 0xc9a27c),        // head
    cbox(0.48, 0.2, 0.48, 0.0, 2.24, 0, 0x26282a),          // beanie
    cbox(0.06, 0.08, 0.3, 0.24, 2.0, 0, 0x1a1a1a)           // brow shadow
  ]), mat);
  torso.castShadow = true; upper.add(torso);

  const armGeo = merge([cbox(0.62, 0.2, 0.2, 0.31, 0, 0, 0x2f3b46), cbox(0.16, 0.16, 0.16, 0.66, 0, 0, 0xc9a27c)]);
  const arms = [new THREE.Mesh(armGeo, mat), new THREE.Mesh(armGeo, mat)];
  arms.forEach(a => { a.castShadow = true; upper.add(a); });

  const gunMounts = [new THREE.Group(), new THREE.Group()];
  gunMounts.forEach(g => upper.add(g));
  const muzzles = [new THREE.Object3D(), new THREE.Object3D()];
  gunMounts.forEach((g, i) => g.add(muzzles[i]));
  const gunMeshes = [new THREE.Mesh(GUN_GEOS.pistol, gunMetal), new THREE.Mesh(GUN_GEOS.pistol, gunMetal)];
  gunMeshes.forEach((m, i) => { m.castShadow = true; gunMounts[i].add(m); });

  function setWeapon(w) {
    const dual = w === 'dual', geo = GUN_GEOS[dual ? 'pistol' : w], len = MUZZLE[dual ? 'pistol' : w];
    gunMeshes[0].geometry = geo; gunMeshes[1].geometry = geo;
    gunMounts[1].visible = dual;
    if (dual) {
      arms[0].position.set(0.05, 1.55, -0.42); arms[0].rotation.set(0, 0, -0.12);
      arms[1].position.set(0.05, 1.55, 0.42); arms[1].rotation.set(0, 0, -0.12);
      gunMounts[0].position.set(0.72, 1.45, -0.42); gunMounts[1].position.set(0.72, 1.45, 0.42);
    } else {
      const long = w !== 'pistol';
      arms[0].position.set(0.05, 1.55, -0.4); arms[0].rotation.set(0, long ? -0.15 : 0.35, -0.12);
      arms[1].position.set(0.05, 1.55, 0.4); arms[1].rotation.set(0, long ? 0.75 : -0.35, -0.12);
      gunMounts[0].position.set(long ? 0.62 : 0.72, 1.45, 0);
    }
    muzzles.forEach(m => m.position.set(len, 0.04, 0));
  }
  setWeapon('pistol');
  return { root, legs, upper, arms, gunMounts, muzzles, setWeapon, mat };
}

/* ---------- zombies ---------- */
const ZGEO = {};
function zombieGeos(type) {
  if (ZGEO[type]) return ZGEO[type];
  const T = ZOMBIES[type], skin = T.skin, shirt = T.shirt, pants = 0x34343a, blood = 0x5a1212, bone = 0xd8d2bc;
  const wide = type === 'brute' ? 1.25 : 1, lean = type === 'runner' ? 0.85 : 1;
  const body = merge([
    cbox(0.5, 0.8, 0.82 * wide * lean, 0, 1.28, 0, shirt),
    cbox(0.52, 0.3, 0.4, 0, 1.4, -0.18, blood),                 // gore patch
    cbox(0.18, 0.2, 0.3, 0.2, 1.15, 0.24, skin),                // torn shirt hole
    cbox(0.46, 0.46, 0.46, 0.08, 1.95, 0, skin),                // head
    cbox(0.2, 0.12, 0.36, 0.26, 1.8, 0, 0x2a1515),              // jaw
    cbox(0.1, 0.06, 0.24, 0.32, 1.86, 0, bone),                 // teeth
    cbox(0.2, 0.18, 0.2, 0.02, 2.2, 0.12, 0x2b2b20),            // hair tufts
    cbox(0.22, 0.12, 0.18, -0.08, 2.18, -0.14, 0x2b2b20)
  ]);
  const arm = merge([cbox(0.72, 0.2, 0.2, 0.36, 0, 0, shirt), cbox(0.3, 0.17, 0.17, 0.82, 0, 0, skin), cbox(0.1, 0.05, 0.14, 1.0, -0.04, 0, 0x2a2a20)]);
  const leg = merge([cbox(0.3, 0.74, 0.3, 0, -0.37, 0, pants), cbox(0.36, 0.14, 0.32, 0.05, -0.8, 0, 0x1e1a16)]);
  const eyes = merge([cbox(0.06, 0.08, 0.08, 0.32, 2.02, -0.11, 0xffffff), cbox(0.06, 0.08, 0.08, 0.32, 2.02, 0.11, 0xffffff)]);
  return (ZGEO[type] = { body, arm, leg, eyes });
}
const EYE = {};
function eyeMat(type) {
  if (EYE[type]) return EYE[type];
  const m = new THREE.MeshBasicMaterial({ color: ZOMBIES[type].eye, toneMapped: false });
  m.userData.base = new THREE.Color(ZOMBIES[type].eye);
  eyeMats.push(m);
  return (EYE[type] = m);
}

export function makeZombie(type) {
  const G = zombieGeos(type), T = ZOMBIES[type];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig); rig.scale.setScalar(T.scale * R(0.94, 1.06));
  const upper = new THREE.Group(); upper.position.y = 0.95; rig.add(upper);
  const body = new THREE.Mesh(G.body, mat); body.position.y = -0.95; body.castShadow = true; upper.add(body);
  const eyes = new THREE.Mesh(G.eyes, eyeMat(type)); eyes.position.y = -0.95; upper.add(eyes);
  const arms = [-0.42, 0.42].map(z => { const a = new THREE.Mesh(G.arm, mat); a.position.set(0.05, 0.62, z * (type === 'brute' ? 1.2 : 1)); a.castShadow = true; upper.add(a); return a; });
  const legs = [-0.18, 0.18].map(z => { const p = new THREE.Group(); p.position.set(0, 0.88, z); const m = new THREE.Mesh(G.leg, mat); m.castShadow = true; p.add(m); rig.add(p); return p; });
  upper.rotation.z = type === 'runner' ? -0.38 : type === 'brute' ? -0.12 : -0.2;   // hunch forward
  return { root, rig, upper, arms, legs, mat };
}

/* ---------- pickups ---------- */
const beamMat = (col) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { color: { value: new THREE.Color(col) }, alpha: { value: 0.32 } },
  vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 color; uniform float alpha; varying float vY; void main(){ float a = pow(1.0 - clamp(vY / 7.0, 0.0, 1.0), 2.2) * alpha; gl_FragColor = vec4(color * a, a); }'
});
const beamGeo = new THREE.CylinderGeometry(0.42, 0.62, 7, 20, 1, true).translate(0, 3.5, 0);
const ringGeo = new THREE.RingGeometry(0.9, 1.15, 40).rotateX(-Math.PI / 2);

export function makePickup(type, color) {
  const root = new THREE.Group();
  const col = new THREE.Color(color);
  const iconMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.2 });
  const icon = new THREE.Mesh(iconGeometry(type), iconMat);
  icon.scale.setScalar(type === 'mag' || type === 'med' ? 1.3 : 1.65);
  const holder = new THREE.Group(); holder.add(icon); root.add(holder);
  const beam = new THREE.Mesh(beamGeo, beamMat(col)); root.add(beam);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  ring.position.y = 0.05; root.add(ring);
  return { root, holder, icon, beam, ring, iconMat };
}
