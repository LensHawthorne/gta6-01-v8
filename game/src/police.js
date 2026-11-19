// Wanted level 0–5 and the Solara Bay PD: named units with roles and distances,
// pursuit driving, a helicopter at 3+ stars, roadblocks at 4+, and getting busted.
import * as THREE from 'three';
import { buildCar } from './vehicles.js';
import { POLICE_UNITS } from './palette.js';
import { clamp, wrapAngle, angleLerp } from './rng.js';
import { ROAD_XS, ROAD_ZS } from './city.js';

function pushOut(x, z, r, colliders) {
  for (const b of colliders) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
      const cx = clamp(x, b.x0, b.x1);
      const cz = clamp(z, b.z0, b.z1);
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.0001) {
        const pl = x - (b.x0 - r), pr = (b.x1 + r) - x;
        const pt = z - (b.z0 - r), pb = (b.z1 + r) - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x0 - r; else if (m === pr) x = b.x1 + r;
        else if (m === pt) z = b.z0 - r; else z = b.z1 + r;
      } else {
        const d = Math.sqrt(d2);
        dx /= d; dz /= d;
        x += dx * (r - d); z += dz * (r - d);
      }
    }
  }
  return [x, z];
}

export function createPolice(scene, colliders, callbacks) {
  const state = {
    wanted: 0,
    heat: 0,
    lastCrimeAt: -999,
    bustedTimer: 0,
    decayTimer: 0,
  };
  const units = []; // active police cars
  let heli = null;
  let roadblocks = [];
  let unitIndex = 0;

  function spawnUnit(px, pz) {
    const def = POLICE_UNITS[unitIndex % (POLICE_UNITS.length - 1)];
    unitIndex++;
    const built = buildCar('police', 0xf2f2f2);
    // spawn on a road near the player, at a distance
    const road = Math.random() < 0.5 ? ROAD_XS : ROAD_ZS;
    const rc = road[Math.floor(Math.random() * road.length)];
    const ns = Math.random() < 0.5;
    const x = ns ? rc : px + (Math.random() < 0.5 ? 90 : -90);
    const z = ns ? pz + (Math.random() < 0.5 ? 90 : -90) : rc;
    const unit = {
      def, built,
      x: clamp(x, -260, 260), z: clamp(z, -260, 260),
      heading: 0, speed: 0, lastDist: 999, stuckTimer: 0,
    };
    built.group.position.set(unit.x, 0, unit.z);
    scene.add(built.group);
    units.push(unit);
    return unit;
  }

  // A unit stuck against a building for too long is re-laid on a road near
  // the player, so the chase never dies on a wall.
  function respawnUnit(unit, px, pz) {
    const road = Math.random() < 0.5 ? ROAD_XS : ROAD_ZS;
    const rc = road[Math.floor(Math.random() * road.length)];
    const ns = Math.random() < 0.5;
    unit.x = ns ? rc : px + (Math.random() < 0.5 ? 50 : -50);
    unit.z = ns ? pz + (Math.random() < 0.5 ? 50 : -50) : rc;
    unit.x = clamp(unit.x, -260, 260);
    unit.z = clamp(unit.z, -260, 260);
    unit.speed = 0;
    unit.stuckTimer = 0;
    unit.lastDist = 999;
    unit.built.group.position.set(unit.x, 0, unit.z);
  }

  function makeHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a4a6a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 2.2), bodyMat);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 0.7), bodyMat);
    tail.position.set(-4, 0.3, 0);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1e2a33 }));
    rotor.position.y = 1.1;
    g.add(rotor);
    const spot = new THREE.Mesh(new THREE.ConeGeometry(6, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
    spot.position.y = -13;
    g.add(spot);
    g.userData.rotor = rotor;
    scene.add(g);
    return g;
  }

  function makeRoadblock(px, pz, heading) {
    const block = [];
    for (const side of [-1, 1]) {
      const built = buildCar('police', 0xf2f2f2);
      const bx = px + Math.cos(heading) * 40 + Math.sin(heading) * side * 4;
      const bz = pz + Math.sin(heading) * 0 + Math.cos(heading) * side * 4;
      built.group.position.set(bx, 0, bz);
      built.group.rotation.y = heading + Math.PI / 2;
      scene.add(built.group);
      block.push({ built, x: bx, z: bz });
    }
    return block;
  }

  function addWanted(n, now) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, 5);
    state.heat = 100;
    state.lastCrimeAt = now;
    state.decayTimer = 0;
    return state.wanted > before;
  }

  function dropStar() {
    state.wanted = Math.max(0, state.wanted - 1);
    if (state.wanted === 0) clearUnits();
  }

  function clearUnits() {
    for (const u of units) scene.remove(u.built.group);
    units.length = 0;
    if (heli) { scene.remove(heli); heli = null; }
    for (const b of roadblocks) for (const c of b) scene.remove(c.built.group);
    roadblocks = [];
  }

  function update(dt, now, player, collidersRef) {
    const want = state.wanted;
    // keep the right number of units on the street
    const targetUnits = want === 0 ? 0 : Math.min(2 + want, 6);
    while (units.length < targetUnits) spawnUnit(player.x, player.z);
    while (units.length > targetUnits) {
      const u = units.pop();
      scene.remove(u.built.group);
    }
    // helicopter at 3+ stars
    if (want >= 3 && !heli) heli = makeHeli();
    if (want < 3 && heli) { scene.remove(heli); heli = null; }
    // roadblocks at 4+ stars, re-laid ahead of the player
    if (want >= 4) {
      if (roadblocks.length === 0 ||
          Math.hypot(roadblocks[0][0].x - player.x, roadblocks[0][0].z - player.z) > 160) {
        for (const b of roadblocks) for (const c of b) scene.remove(c.built.group);
        roadblocks = [makeRoadblock(player.x, player.z, player.heading)];
      }
    } else if (roadblocks.length) {
      for (const b of roadblocks) for (const c of b) scene.remove(c.built.group);
      roadblocks = [];
    }

    // chase driving
    for (const u of units) {
      const dx = player.x - u.x, dz = player.z - u.z;
      const dist = Math.hypot(dx, dz);
      // stuck against a wall? re-lay the unit on a road near the player
      if (dist > 45) {
        if (dist > u.lastDist - 1) u.stuckTimer += dt;
        else u.stuckTimer = 0;
        u.lastDist = dist;
        if (u.stuckTimer > 4) { respawnUnit(u, player.x, player.z); continue; }
      } else {
        u.stuckTimer = 0;
        u.lastDist = dist;
      }
      const wantHeading = Math.atan2(dx, dz);
      const turn = clamp(wrapAngle(wantHeading - u.heading), -2.4 * dt, 2.4 * dt);
      u.heading += turn;
      const targetSpeed = dist > 26 ? 19 + want * 1.4 : 15 + want;
      u.speed += clamp(targetSpeed - u.speed, -20 * dt, 12 * dt);
      u.x += Math.sin(u.heading) * u.speed * dt;
      u.z += Math.cos(u.heading) * u.speed * dt;
      [u.x, u.z] = pushOut(u.x, u.z, 2.2, collidersRef);
      u.x = clamp(u.x, -280, 400);
      u.z = clamp(u.z, -280, 280);
      u.built.group.position.set(u.x, 0, u.z);
      u.built.group.rotation.y = u.heading;
      for (const w of u.built.wheels) w.rotation.z += u.speed * dt * 0.9;
      // flashing light bar
      if (u.built.lightBar) {
        const on = Math.floor(now * 6) % 2 === 0;
        u.built.lightBar.userData.red.material.color.setHex(on ? 0xff2222 : 0x661111);
        u.built.lightBar.userData.blue.material.color.setHex(on ? 0x111166 : 0x2244ff);
      }
      // ram the player's car
      if (player.inCar && dist < 4.6) {
        player.carSpeed *= 0.92;
        u.speed *= 0.9;
      }
    }

    if (heli) {
      heli.position.set(
        player.x + Math.sin(now * 0.5) * 18,
        42,
        player.z + Math.cos(now * 0.5) * 18
      );
      heli.rotation.y = Math.atan2(player.x - heli.position.x, player.z - heli.position.z);
      heli.userData.rotor.rotation.y += dt * 22;
    }

    // busted: a unit stays close to the player on foot
    if (want > 0 && !player.inCar) {
      const near = units.some(u => Math.hypot(u.x - player.x, u.z - player.z) < 4.5);
      if (near) {
        state.bustedTimer += dt;
        if (state.bustedTimer > 1.6) {
          state.bustedTimer = 0;
          callbacks.onBusted();
        }
      } else {
        state.bustedTimer = 0;
      }
    } else {
      state.bustedTimer = 0;
    }

    // wanted decays when the heat is off and no unit is close
    if (want > 0 && now - state.lastCrimeAt > 18) {
      const nearest = units.length
        ? Math.min(...units.map(u => Math.hypot(u.x - player.x, u.z - player.z)))
        : 999;
      if (nearest > 70) {
        state.decayTimer += dt;
        if (state.decayTimer > 8) {
          state.decayTimer = 0;
          state.wanted = Math.max(0, want - 1);
          if (state.wanted === 0) clearUnits();
        }
      } else {
        state.decayTimer = 0;
      }
    }
  }

  function unitList(player) {
    return units.map(u => ({
      label: `${u.def.callsign} ${u.def.name}`,
      role: u.def.role,
      dist: Math.round(Math.hypot(u.x - player.x, u.z - player.z)),
    }));
  }

  function nearestDist(player) {
    if (!units.length) return 999;
    return Math.min(...units.map(u => Math.hypot(u.x - player.x, u.z - player.z)));
  }

  return {
    state, update, addWanted, dropStar, clearUnits, unitList, nearestDist,
    get units() { return units; },
    get heli() { return heli; },
  };
}
