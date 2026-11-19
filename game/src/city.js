// Solara Bay city: grid streets, bright varied buildings, beach + bay + pier,
// marina, night-market plaza, Faro's garage, hospital and the Solara Tower.
// Layout is seeded so every load builds the same city.
import * as THREE from 'three';
import { makeRng, pick, range, rangeInt } from './rng.js';
import { PALETTE } from './palette.js';

export const PITCH = 48;          // block pitch (road centre to road centre)
export const ROAD_W = 16;         // road width
export const ROAD_XS = [-240, -192, -144, -96, -48, 0, 48, 96, 144, 192, 240];
export const ROAD_ZS = [-240, -192, -144, -96, -48, 0, 48, 96, 144, 192, 240];
export const BEACH_X0 = 264;      // sand starts here
export const WATER_X0 = 322;      // bay starts here
export const WORLD = { x0: -288, x1: 470, z0: -288, z1: 288 };

const SEED = 20261120;

// Canvas facade textures: bright walls with varied window grids.
function facadeTexture(rng, baseColor, style) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = '#' + baseColor.toString(16).padStart(6, '0');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical shading strips so neighbours never match
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, 14, 256);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  g.fillRect(114, 0, 14, 256);
  const cols = style === 'wide' ? 3 : 4;
  const rows = style === 'tall' ? 9 : 6;
  const cw = 128 / cols, rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (rng() < 0.12) continue; // some blank wall
      const lit = rng() < 0.3;
      g.fillStyle = lit ? '#ffe9a8' : (rng() < 0.5 ? '#2e4a5e' : '#5e7a8e');
      const x = col * cw + cw * 0.22, y = r * rh + rh * 0.22;
      g.fillRect(x, y, cw * 0.56, rh * 0.52);
      if (style === 'balcony' && rng() < 0.5) {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x - 2, y + rh * 0.52, cw * 0.56 + 4, 3);
      }
    }
  }
  // awning stripe on the ground floor for shops
  if (style === 'shop') {
    g.fillStyle = '#e8382e';
    g.fillRect(0, 226, 128, 14);
    g.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) g.fillRect(i * 16, 226, 8, 14);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts.mat || {}) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  return m;
}

export function buildCity(scene) {
  const rng = makeRng(SEED);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);
  const animated = { boats: [], clouds: [], glints: [], marketLights: [] };

  // ---- ground, beach, water ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.x1 - WORLD.x0 + 120, WORLD.z1 - WORLD.z0 + 120),
    new THREE.MeshLambertMaterial({ color: 0x9db08a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((WORLD.x0 + WORLD.x1) / 2, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(120, WORLD.z1 - WORLD.z0 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(BEACH_X0 + 50, 0.02, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const waterMat = new THREE.MeshPhongMaterial({
    color: PALETTE.water, shininess: 120, specular: 0x99ddff, transparent: true, opacity: 0.92,
  });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(220, WORLD.z1 - WORLD.z0 + 200),
    waterMat
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_X0 + 100, 0.05, 0);
  group.add(water);
  // sun glints sliding on the water
  for (let i = 0; i < 14; i++) {
    const glint = new THREE.Mesh(
      new THREE.PlaneGeometry(range(rng, 8, 22), 1.6),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.55 })
    );
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(range(rng, WATER_X0 + 10, WATER_X0 + 180), 0.08, range(rng, -270, 270));
    group.add(glint);
    animated.glints.push(glint);
  }

  // ---- roads, sidewalks, dashes, crosswalks ----
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 4);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd24d });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 1200);
  let dashCount = 0;
  const dummy = new THREE.Object3D();
  const crossGeo = new THREE.BoxGeometry(3, 0.06, 1.4);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const crosses = new THREE.InstancedMesh(crossGeo, crossMat, 800);
  let crossCount = 0;

  function roadStrip(x, z, w, d) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.06, z);
    r.receiveShadow = true;
    group.add(r);
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(w + 8, d + 8), walkMat);
    w1.rotation.x = -Math.PI / 2;
    w1.position.set(x, 0.03, z);
    w1.receiveShadow = true;
    group.add(w1);
  }
  for (const x of ROAD_XS) roadStrip(x, 0, ROAD_W, WORLD.z1 - WORLD.z0);
  for (const z of ROAD_ZS) roadStrip(0, z, WORLD.x1 - WORLD.x0 - 180, ROAD_W);

  for (const x of ROAD_XS) {
    for (let z = -264; z <= 264; z += 12) {
      if (ROAD_ZS.some(rz => Math.abs(z - rz) < 12)) continue;
      dummy.position.set(x, 0.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      if (dashCount < 1200) dashes.setMatrixAt(dashCount++, dummy.matrix);
    }
  }
  for (const z of ROAD_ZS) {
    for (let x = -264; x <= 240; x += 12) {
      if (ROAD_XS.some(rx => Math.abs(x - rx) < 12)) continue;
      dummy.position.set(x, 0.1, z);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      if (dashCount < 1200) dashes.setMatrixAt(dashCount++, dummy.matrix);
    }
  }
  dashes.count = dashCount;
  group.add(dashes);
  // crosswalks at downtown intersections
  for (const x of [-96, -48, 0, 48, 96]) {
    for (const z of [-96, -48, 0, 48, 96]) {
      for (let i = -3; i <= 3; i++) {
        dummy.position.set(x + i * 2.2, 0.1, z - 9);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        if (crossCount < 800) crosses.setMatrixAt(crossCount++, dummy.matrix);
      }
    }
  }
  crosses.count = crossCount;
  group.add(crosses);

  // ---- buildings ----
  const facadeTexs = PALETTE.facades.slice(0, 6).map((c, i) =>
    facadeTexture(makeRng(SEED + i * 7), c, ['wide', 'tall', 'balcony', 'shop'][i % 4]));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x7a6a55 });

  function addBuilding(cx, cz, w, h, d, texIdx) {
    const side = new THREE.MeshLambertMaterial({ map: facadeTexs[texIdx % facadeTexs.length] });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [side, side, roofMat, roofMat, side, side]
    );
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
    // rooftop box for silhouette variety
    if (h > 18 && rng() < 0.7) {
      const top = box(w * 0.3, 2.4, d * 0.3, pick(rng, PALETTE.roofs), cx + range(rng, -3, 3), h + 1.2, cz + range(rng, -3, 3));
      group.add(top);
    }
    return mesh;
  }

  const blockCenters = [];
  for (let bx = -216; bx <= 216; bx += PITCH) {
    for (let bz = -216; bz <= 216; bz += PITCH) blockCenters.push([bx, bz]);
  }
  const plaza = { x: -216, z: 168 };           // night market
  const garageBlock = { x: -96, z: -96 };      // Faro's garage
  const hospitalBlock = { x: 96, z: 168 };     // St. Marina Hospital
  const towerBlock = { x: 0, z: 0 };           // Solara Tower

  for (const [bx, bz] of blockCenters) {
    if (bx === plaza.x && bz === plaza.z) continue;
    if (bx === garageBlock.x && bz === garageBlock.z) continue;
    if (bx === hospitalBlock.x && bz === hospitalBlock.z) continue;
    if (bx === towerBlock.x && bz === towerBlock.z) continue;
    if (bx === 216 && bz <= -120) continue;    // marina docks instead
    const downtown = Math.abs(bx) <= 120 && Math.abs(bz) <= 120;
    const count = downtown ? rangeInt(rng, 2, 3) : rangeInt(rng, 1, 2);
    for (let i = 0; i < count; i++) {
      const w = range(rng, 16, 26), d = range(rng, 16, 26);
      const h = downtown ? range(rng, 20, 46) : range(rng, 8, 22);
      const ox = count === 1 ? 0 : (i === 0 ? -8 : 8);
      const oz = count === 1 ? 0 : (i === 0 ? 8 : -8);
      addBuilding(bx + ox, bz + oz, w, h, d, rangeInt(rng, 0, 5));
    }
  }

  // Solara Tower — tall glass landmark at the city centre.
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(26, 92, 26),
    new THREE.MeshLambertMaterial({ color: 0x9cc8d8, emissive: 0x1a3a4a })
  );
  tower.position.set(0, 46, 0);
  tower.castShadow = true;
  group.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4d4d })
  );
  beacon.position.set(0, 94, 0);
  group.add(beacon);
  colliders.push({ x0: -13, z0: -13, x1: 13, z1: 13 });
  animated.beacon = beacon;

  // Faro's garage — low brick building with a big roller door.
  const garage = box(30, 9, 22, 0xc96a3a, garageBlock.x, 4.5, garageBlock.z);
  group.add(garage);
  const door = box(12, 6, 0.4, 0x3a4a5a, garageBlock.x, 3, garageBlock.z + 11.2);
  group.add(door);
  colliders.push({ x0: garageBlock.x - 15, z0: garageBlock.z - 11, x1: garageBlock.x + 15, z1: garageBlock.z + 11 });

  // St. Marina Hospital — white block with a red cross.
  const hosp = box(28, 16, 20, 0xf0f0e8, hospitalBlock.x, 8, hospitalBlock.z);
  group.add(hosp);
  const crossV = box(2, 8, 0.5, 0xe8382e, hospitalBlock.x, 12, hospitalBlock.z + 10.2);
  const crossH = box(8, 2, 0.5, 0xe8382e, hospitalBlock.x, 12, hospitalBlock.z + 10.2);
  group.add(crossV); group.add(crossH);
  colliders.push({ x0: hospitalBlock.x - 14, z0: hospitalBlock.z - 10, x1: hospitalBlock.x + 14, z1: hospitalBlock.z + 10 });

  // ---- palms along the coast road and downtown sidewalks ----
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e9e4a });
  const palmSpots = [];
  for (let z = -252; z <= 252; z += 24) {
    palmSpots.push([228, z + 6]);
    if (rng() < 0.8) palmSpots.push([254, z - 6]);
  }
  for (let i = 0; i < 26; i++) {
    palmSpots.push([pick(rng, ROAD_XS.slice(2, 9)) + 11, pick(rng, ROAD_ZS)]);
  }
  for (const [px, pz] of palmSpots) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(px, 3.5, pz);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(px, 7.6, pz);
    crown.scale.set(1.4, 0.55, 1.4);
    crown.castShadow = true;
    group.add(crown);
  }

  // ---- streetlights ----
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a4a5a });
  const bulbGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const bulbMatDay = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of ROAD_XS) {
    for (const z of [-144, -48, 48, 144]) {
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(x + 9, 3, z);
      group.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMatDay);
      bulb.position.set(x + 9, 6.2, z);
      group.add(bulb);
    }
  }

  // ---- beach umbrellas + towels ----
  const umbColors = [0xff6a9a, 0xffb02e, 0x2fa8b8, 0x7a4fd0];
  for (let i = 0; i < 12; i++) {
    const ux = range(rng, BEACH_X0 + 6, BEACH_X0 + 46);
    const uz = range(rng, -240, 240);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    pole.position.set(ux, 1.3, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: pick(rng, umbColors) }));
    top.position.set(ux, 3, uz);
    group.add(top);
  }

  // ---- pier (z = 48) reaching into the bay ----
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
  for (let x = BEACH_X0; x <= 380; x += 6) {
    const plank = box(5.6, 0.5, 11, 0x9a7a4a, x, 0.6, 48);
    plank.castShadow = false;
    group.add(plank);
  }
  for (let x = BEACH_X0 + 4; x <= 380; x += 24) {
    for (const dz of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
      post.position.set(x, 0.4, 48 + dz);
      group.add(post);
    }
  }
  const pierHut = box(8, 5, 8, 0xe8382e, 352, 3.1, 48);
  group.add(pierHut);
  colliders.push({ x0: 348, z0: 44, x1: 356, z1: 52 });

  // ---- marina docks + boats (north-east water) ----
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  for (let i = 0; i < 3; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 6), dockMat);
    dock.position.set(360, 0.6, -180 + i * 42);
    group.add(dock);
  }
  function makeBoat(bx, bz, color, withMast) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 3.4),
      new THREE.MeshLambertMaterial({ color }));
    hull.position.y = 0.8;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    cabin.position.set(-0.6, 2.2, 0);
    boat.add(cabin);
    if (withMast) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 5),
        new THREE.MeshLambertMaterial({ color: 0x6a4a2a }));
      mast.position.set(1.4, 4.4, 0);
      boat.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.4),
        new THREE.MeshLambertMaterial({ color: 0xfff7e8, side: THREE.DoubleSide }));
      sail.position.set(3, 4.2, 0);
      boat.add(sail);
    }
    boat.position.set(bx, 0, bz);
    boat.rotation.y = range(rng, 0, Math.PI * 2);
    boat.traverse(o => { o.castShadow = true; });
    group.add(boat);
    animated.boats.push(boat);
    return boat;
  }
  for (let i = 0; i < 8; i++) {
    makeBoat(range(rng, WATER_X0 + 30, WATER_X0 + 170), range(rng, -260, 260),
      pick(rng, [0xf2f2f2, 0xffb02e, 0x2fa8b8, 0xe8382e]), rng() < 0.5);
  }
  for (let i = 0; i < 5; i++) {
    makeBoat(range(rng, 330, 390), -180 + i * 42 + range(rng, -6, 6),
      pick(rng, [0xf2f2f2, 0x2fa8b8]), false);
  }

  // ---- night market plaza (block -216, 168) ----
  const stallColors = [0xe8382e, 0xffb02e, 0x2fa8b8, 0x7a4fd0, 0xff6a9a];
  const stalls = [];
  for (let i = 0; i < 10; i++) {
    const sx = plaza.x - 14 + (i % 5) * 7;
    const sz = plaza.z - 10 + Math.floor(i / 5) * 16;
    const stall = new THREE.Group();
    const counter = box(5, 1.1, 3, 0x8a6a4a, 0, 0.55, 0);
    stall.add(counter);
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.4),
      new THREE.MeshLambertMaterial({ color: stallColors[i % stallColors.length], side: THREE.DoubleSide }));
    awn.rotation.x = -Math.PI / 2 + 0.35;
    awn.position.set(0, 2.6, 0);
    stall.add(awn);
    const goods = box(4.4, 0.7, 2.4, pick(rng, [0xffb02e, 0x2ecc71, 0xff6a9a, 0x37c2d4]), 0, 1.4, 0);
    stall.add(goods);
    stall.position.set(sx, 0, sz);
    stall.rotation.y = (i % 2 === 0 ? 0 : Math.PI);
    group.add(stall);
    stalls.push(stall);
    colliders.push({ x0: sx - 2.6, z0: sz - 1.6, x1: sx + 2.6, z1: sz + 1.6 });
    // lantern glow
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd24d }));
    lamp.position.set(sx, 3.4, sz);
    group.add(lamp);
    animated.marketLights.push(lamp);
  }

  // ---- sky dome, sun, clouds ----
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6fb9e8');
  grad.addColorStop(0.55, '#a8d8f0');
  grad.addColorStop(1, '#ffe9b8');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false })
  );
  sun.position.set(-420, 320, -520);
  sun.lookAt(0, 0, 0);
  scene.add(sun);

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      puff.position.set(j * 9 - 9, range(rng, -1, 1), range(rng, -3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -500, 500), range(rng, 120, 200), range(rng, -500, 500));
    scene.add(cloud);
    animated.clouds.push(cloud);
  }

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 1.1);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffe9b8, 1.6);
  sunLight.position.set(-180, 260, -120);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -320;
  sunLight.shadow.camera.right = 320;
  sunLight.shadow.camera.top = 320;
  sunLight.shadow.camera.bottom = -320;
  sunLight.shadow.camera.far = 800;
  scene.add(sunLight);
  scene.fog = new THREE.Fog(0xcfe8f5, 420, 950);

  let night = false;
  function setNight(isNight) {
    night = isNight;
    if (isNight) {
      sky.material.color.set(0x8a9ab8);
      scene.fog.color.set(0x1a2c44);
      hemi.intensity = 0.35;
      hemi.color.set(0x4a6a9a);
      sunLight.intensity = 0.25;
      sunLight.color.set(0x9ab8e8);
      sun.visible = false;
      waterMat.color.set(0x144a6a);
    } else {
      sky.material.color.set(0xffffff);
      scene.fog.color.set(0xcfe8f5);
      hemi.intensity = 1.1;
      hemi.color.set(0xcfe8ff);
      sunLight.intensity = 1.6;
      sunLight.color.set(0xffe9b8);
      sun.visible = true;
      waterMat.color.set(PALETTE.water);
    }
  }

  function update(dt, t) {
    for (const b of animated.boats) {
      b.position.y = Math.sin(t * 0.7 + b.position.x * 0.05) * 0.18;
      b.rotation.z = Math.sin(t * 0.5 + b.position.z * 0.04) * 0.02;
    }
    for (const c of animated.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 560) c.position.x = -560;
    }
    for (let i = 0; i < animated.glints.length; i++) {
      const gl = animated.glints[i];
      gl.position.x += dt * (2 + (i % 3));
      if (gl.position.x > WATER_X0 + 190) gl.position.x = WATER_X0 + 12;
    }
    if (animated.beacon) {
      animated.beacon.material.color.setHex(Math.sin(t * 3) > 0 ? 0xff4d4d : 0x881111);
    }
  }

  return {
    colliders,
    update,
    setNight,
    landmarks: {
      garage: { x: garageBlock.x, z: garageBlock.z },
      hospital: { x: hospitalBlock.x, z: hospitalBlock.z },
      pier: { x: 352, z: 48 },
      pierStart: { x: 280, z: 48 },
      marina: { x: 360, z: -160 },
      market: { x: plaza.x, z: plaza.z },
      tower: { x: 0, z: 0 },
      beachSouth: { x: 300, z: 200 },
      beachNorth: { x: 300, z: -200 },
      northPoint: { x: 240, z: -240 },
    },
    stalls,
  };
}
