// Vehicle and pedestrian meshes, built from boxes, cylinders and spheres.
// Kinds: sedan, hatch, pickup, van, taxi, police. Every car gets windows,
// wheels, headlights and taillights so it reads as a car, not a box.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { pick } from './rng.js';

function lam(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}

function part(parent, geo, mat, x, y, z, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  parent.add(m);
  return m;
}

// Returns { group, wheels:[4 meshes], lightBar? } — wheels spin while driving.
export function buildCar(kind, color) {
  const g = new THREE.Group();
  const body = lam(color);
  const glass = lam(0x2e4a5e, { transparent: true, opacity: 0.85 });
  const dark = lam(0x1e2a33);
  const chrome = lam(0xd8dee2);

  let len = 4.4, wid = 1.9, bodyH = 0.62, bodyY = 0.55;
  if (kind === 'pickup') { len = 5.0; bodyH = 0.7; }
  if (kind === 'van') { len = 5.0; bodyH = 1.0; bodyY = 0.8; }
  if (kind === 'hatch') { len = 3.8; }

  part(g, new THREE.BoxGeometry(len, bodyH, wid), body, 0, bodyY, 0);
  // cabin
  const cabLen = kind === 'van' ? 3.6 : kind === 'pickup' ? 1.7 : 2.2;
  const cabX = kind === 'pickup' ? -0.9 : -0.2;
  part(g, new THREE.BoxGeometry(cabLen, 0.55, wid - 0.25), glass, cabX, bodyY + bodyH / 2 + 0.26, 0);
  if (kind === 'pickup') {
    part(g, new THREE.BoxGeometry(1.9, 0.35, wid - 0.3), dark, 1.2, bodyY + bodyH / 2 + 0.12, 0);
  }
  // bumpers + grille
  part(g, new THREE.BoxGeometry(0.25, 0.3, wid), chrome, len / 2, 0.42, 0);
  part(g, new THREE.BoxGeometry(0.25, 0.3, wid), chrome, -len / 2, 0.42, 0);
  // headlights / taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const dz of [-0.6, 0.6]) {
    part(g, new THREE.BoxGeometry(0.08, 0.18, 0.42), headMat, len / 2 + 0.02, 0.62, dz, false);
    part(g, new THREE.BoxGeometry(0.08, 0.18, 0.42), tailMat, -len / 2 - 0.02, 0.62, dz, false);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateX(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[len / 2 - 0.85, wid / 2], [len / 2 - 0.85, -wid / 2],
                          [-len / 2 + 0.85, wid / 2], [-len / 2 + 0.85, -wid / 2]]) {
    wheels.push(part(g, wheelGeo, dark, wx, 0.36, wz));
  }

  let lightBar = null;
  if (kind === 'police') {
    // white body, blue doors, red/blue light bar
    g.children[0].material = lam(0xf2f2f2);
    part(g, new THREE.BoxGeometry(1.4, 0.3, wid + 0.04), lam(0x2a5fd0), 0, 0.62, 0);
    const bar = new THREE.Group();
    const r = part(bar, new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }), -0.3, 1.5, 0, false);
    const b = part(bar, new THREE.BoxGeometry(0.5, 0.16, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }), 0.3, 1.5, 0, false);
    bar.userData = { red: r, blue: b };
    g.add(bar);
    lightBar = bar;
  }
  if (kind === 'taxi') {
    g.children[0].material = lam(0xffc21a);
    part(g, new THREE.BoxGeometry(1.0, 0.3, 1.0), lam(0x1e2a33), -0.2, 1.42, 0);
    const sign = part(g, new THREE.BoxGeometry(0.9, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe066 }), -0.2, 1.5, 0, false);
    sign.material = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  }
  return { group: g, wheels, lightBar, len, wid };
}

export function randomCarColor(rng) {
  return pick(rng, PALETTE.carColors);
}

// Pedestrian: torso, head, legs, arms — bright varied clothing, big in frame.
export function buildPed(rng) {
  const g = new THREE.Group();
  const shirt = lam(pick(rng, PALETTE.pedShirts));
  const pants = lam(pick(rng, PALETTE.pedPants));
  const skin = lam(pick(rng, PALETTE.skinTones));
  const hair = lam(pick(rng, [0x1e1e1e, 0x6a4a2a, 0xd8b84a, 0x8a8a8a, 0x3a2a1a]));

  const torso = part(g, new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt, 0, 1.15, 0);
  const head = part(g, new THREE.SphereGeometry(0.26, 10, 8), skin, 0, 1.78, 0);
  const hairTop = part(g, new THREE.SphereGeometry(0.27, 10, 8), hair, 0, 1.84, -0.03);
  hairTop.scale.set(1, 0.7, 1);
  const legL = part(g, new THREE.BoxGeometry(0.22, 0.78, 0.24), pants, -0.16, 0.39, 0);
  const legR = part(g, new THREE.BoxGeometry(0.22, 0.78, 0.24), pants, 0.16, 0.39, 0);
  const armL = part(g, new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt, -0.42, 1.12, 0);
  const armR = part(g, new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt, 0.42, 1.12, 0);
  return {
    group: g, torso, head, legL, legR, armL, armR,
    height: 1.95,
  };
}

// The player character — Mara Solano: red jacket, dark jeans, distinct at a glance.
export function buildPlayer() {
  const g = new THREE.Group();
  const jacket = lam(0xd02323);
  const jeans = lam(0x2e3a4a);
  const skin = lam(0xe8b88a);
  const torso = part(g, new THREE.BoxGeometry(0.66, 0.78, 0.4), jacket, 0, 1.16, 0);
  const head = part(g, new THREE.SphereGeometry(0.27, 12, 10), skin, 0, 1.8, 0);
  const hair = part(g, new THREE.SphereGeometry(0.28, 12, 10), lam(0x1e1e1e), 0, 1.86, -0.04);
  hair.scale.set(1, 0.75, 1);
  const legL = part(g, new THREE.BoxGeometry(0.24, 0.8, 0.26), jeans, -0.17, 0.4, 0);
  const legR = part(g, new THREE.BoxGeometry(0.24, 0.8, 0.26), jeans, 0.17, 0.4, 0);
  const armL = part(g, new THREE.BoxGeometry(0.19, 0.64, 0.22), jacket, -0.44, 1.12, 0);
  const armR = part(g, new THREE.BoxGeometry(0.19, 0.64, 0.22), jacket, 0.44, 1.12, 0);
  return { group: g, torso, head, legL, legR, armL, armR, height: 2.0 };
}
