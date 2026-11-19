// Side activities: taxi fares, 10 beach shells, district standing, and the
// garage upgrade shop (engine, armor, paint) that spends mission money.
import * as THREE from 'three';
import { buildPed } from './vehicles.js';
import { makeRng, pick, range } from './rng.js';
import { districtAt } from './palette.js';
import { BEACH_X0 } from './city.js';

const TAXI_STANDS = [
  { x: 108, z: 156 },   // St. Marina Hospital
  { x: 12, z: -12 },    // downtown tower
  { x: 252, z: 96 },    // beachfront
  { x: -204, z: 156 },  // night market
];

export const UPGRADES = [
  { id: 'engine1', name: 'Engine Tune I', cost: 200, desc: '+15% top speed', apply: s => { s.engine = 1.15; } },
  { id: 'engine2', name: 'Engine Tune II', cost: 400, desc: '+30% top speed', needs: 'engine1', apply: s => { s.engine = 1.3; } },
  { id: 'armor1', name: 'Kevlar Vest', cost: 150, desc: '+30 max health', apply: s => { s.armor = 1; } },
  { id: 'armor2', name: 'Plated Vest', cost: 300, desc: '+60 max health', needs: 'armor1', apply: s => { s.armor = 2; } },
  { id: 'paint1', name: 'Sunset Paint', cost: 100, desc: 'Hot coral paint job', apply: s => { s.paint = 0xe8382e; } },
  { id: 'paint2', name: 'Bay Teal Paint', cost: 100, desc: 'Teal paint job', apply: s => { s.paint = 0x2fa8b8; } },
];

export function createActivities(scene, rng, gameState, ctx) {
  const state = {
    shells: [],
    shellsGot: 0,
    fare: null,          // active fare { dest, pay }
    farePeds: [],
    standing: {},        // district -> 0..5
    upgradesOwned: new Set(),
    upgrades: { engine: 1, armor: 0, paint: null },
  };

  // ---- beach shells ----
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 6),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xff9ec4 : 0xfff2e0, emissive: 0x332200 })
    );
    mesh.scale.y = 0.4;
    const x = range(rng, BEACH_X0 + 6, BEACH_X0 + 42);
    const z = range(rng, -240, 240);
    mesh.position.set(x, 0.25, z);
    scene.add(mesh);
    state.shells.push({ mesh, x, z, taken: false });
  }

  // ---- taxi fare peds at stands ----
  for (const stand of TAXI_STANDS) {
    const built = buildPed(rng);
    built.group.position.set(stand.x, 0, stand.z);
    scene.add(built.group);
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshBasicMaterial({ color: 0xffd24d })
    );
    marker.position.set(stand.x, 3.2, stand.z);
    scene.add(marker);
    state.farePeds.push({ built, marker, x: stand.x, z: stand.z, waiting: true });
  }

  // fare destination beacon
  const fareBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 36, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24d, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  fareBeacon.position.y = 18;
  fareBeacon.visible = false;
  scene.add(fareBeacon);

  function addStanding(district, n) {
    state.standing[district] = Math.min(5, (state.standing[district] || 0) + n);
  }

  function tryTaxi(player) {
    if (state.fare) return 'busy';
    if (player.inCar) return 'need-foot';
    for (const f of state.farePeds) {
      if (!f.waiting) continue;
      if (Math.hypot(player.x - f.x, player.z - f.z) < 5) {
        f.waiting = false;
        f.built.group.visible = false;
        f.marker.visible = false;
        const dests = [
          { x: 108, z: 156, name: 'St. Marina Hospital' },
          { x: 12, z: -12, name: 'downtown tower' },
          { x: 252, z: 96, name: 'the beachfront' },
          { x: -204, z: 156, name: 'the night market' },
          { x: -96, z: -96, name: "Faro's Garage" },
          { x: 360, z: -160, name: 'the marina' },
        ];
        const dest = pick(rng, dests.filter(d => Math.hypot(d.x - f.x, d.z - f.z) > 60));
        state.fare = { dest, pay: 40 + Math.floor(rng() * 5) * 10, from: f };
        fareBeacon.position.set(dest.x, 18, dest.z);
        fareBeacon.visible = true;
        ctx.say(`Take me to ${dest.name}, quick!`, 'Fare');
        return 'ok';
      }
    }
    return 'none';
  }

  function update(dt, player) {
    // shells
    for (const s of state.shells) {
      if (s.taken) continue;
      if (Math.hypot(player.x - s.x, player.z - s.z) < 2.2) {
        s.taken = true;
        scene.remove(s.mesh);
        state.shellsGot++;
        gameState.money += 15;
        gameState.rp += 2;
        ctx.onShell(state.shellsGot);
      }
    }
    // taxi fare arrival
    if (state.fare) {
      const d = state.fare.dest;
      if (player.inCar && Math.hypot(player.x - d.x, player.z - d.z) < 13) {
        const pay = state.fare.pay;
        gameState.money += pay;
        gameState.rp += 5;
        addStanding(districtAt(d.x, d.z), 1);
        ctx.onFareDone(pay, d.name);
        state.fare.from.waiting = true;
        state.fare.from.built.group.visible = true;
        state.fare.from.marker.visible = true;
        state.fare = null;
        fareBeacon.visible = false;
      }
    }
    // bob the fare markers
    for (const f of state.farePeds) {
      if (f.waiting) f.marker.rotation.y += dt * 2;
    }
  }

  function buyUpgrade(id) {
    const up = UPGRADES.find(u => u.id === id);
    if (!up || state.upgradesOwned.has(id)) return 'owned';
    if (up.needs && !state.upgradesOwned.has(up.needs)) return 'needs-prev';
    if (gameState.money < up.cost) return 'broke';
    gameState.money -= up.cost;
    state.upgradesOwned.add(id);
    up.apply(state.upgrades);
    return 'ok';
  }

  return {
    state, update, tryTaxi, buyUpgrade, addStanding,
    get fareDest() { return state.fare ? state.fare.dest : null; },
    get fareActive() { return !!state.fare; },
  };
}
