// Pedestrians: ~48 walkers on sidewalks, the beach and the night market.
// They stroll, turn at intersections, and scatter when a car barrels at them.
// They can be punched or shot (which raises the wanted level) and respawn.
import { buildPed } from './vehicles.js';
import { makeRng, pick, range, rangeInt } from './rng.js';
import { ROAD_XS, ROAD_ZS, BEACH_X0 } from './city.js';
import { clamp, wrapAngle, angleLerp } from './rng.js';

export function createPedestrians(scene, rng) {
  const peds = [];
  const COUNT = 48;

  function spawnPed(px, pz) {
    const built = buildPed(rng);
    const ped = {
      built,
      x: px ?? range(rng, -240, 240),
      z: pz ?? range(rng, -240, 240),
      heading: range(rng, 0, Math.PI * 2),
      speed: range(rng, 1.0, 2.0),
      walkPhase: range(rng, 0, 6),
      hp: 100, down: false, downTimer: 0,
      mode: 'street', fleeTimer: 0,
    };
    if (px === undefined) {
      // snap onto a sidewalk next to a road
      const ns = rng() < 0.5;
      if (ns) {
        ped.x = pick(rng, ROAD_XS) + (rng() < 0.5 ? 11 : -11);
        ped.z = range(rng, -240, 240);
        ped.heading = rng() < 0.5 ? 0 : Math.PI;
      } else {
        ped.z = pick(rng, ROAD_ZS) + (rng() < 0.5 ? 11 : -11);
        ped.x = range(rng, -240, 240);
        ped.heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    ped.built.group.position.set(ped.x, 0, ped.z);
    ped.built.group.rotation.y = ped.heading;
    scene.add(ped.built.group);
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < COUNT; i++) {
    if (i < 8) {
      // beach strollers
      spawnPed(range(rng, BEACH_X0 + 8, BEACH_X0 + 44), range(rng, -240, 240));
    } else if (i < 14) {
      // night market browsers
      spawnPed(range(rng, -232, -200), range(rng, 152, 184));
    } else {
      spawnPed();
    }
  }

  function update(dt, player, playerCarSpeed) {
    for (const ped of peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          // respawn fresh elsewhere
          ped.built.group.visible = true;
          ped.built.group.rotation.x = 0;
          ped.down = false;
          ped.hp = 100;
          ped.x = range(Math.random, -240, 240);
          ped.z = range(Math.random, -240, 240);
        }
        continue;
      }
      // scatter from a fast approaching player car
      if (player && player.inCar && playerCarSpeed > 6) {
        const d = Math.hypot(ped.x - player.x, ped.z - player.z);
        if (d < 7 && ped.fleeTimer <= 0) {
          ped.fleeTimer = 1.2;
          ped.heading = Math.atan2(ped.x - player.x, ped.z - player.z) + range(Math.random, -0.5, 0.5);
        }
      }
      if (ped.fleeTimer > 0) {
        ped.fleeTimer -= dt;
        ped.x += Math.sin(ped.heading) * 4.2 * dt;
        ped.z += Math.cos(ped.heading) * 4.2 * dt;
      } else {
        // stroll; at intersections sometimes turn
        const nearCross = (ped.x % 48 + 48) % 48;
        if (rng() < 0.002) ped.heading += pick(rng, [-Math.PI / 2, Math.PI / 2, Math.PI]);
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
        if (ped.x > 258) ped.heading = -Math.PI / 2; // turn back west
        if (ped.x < -252) ped.heading = Math.PI / 2;  // turn back east
        if (ped.z > 252) ped.heading = Math.PI;       // turn back north
        if (ped.z < -252) ped.heading = 0;            // turn back south
        if (ped.x > BEACH_X0 - 2 && ped.z > -250 && ped.z < 250 && Math.abs(ped.heading) < 1.2) {
          ped.heading = Math.PI; // don't walk into the sea
        }
      }
      ped.walkPhase += dt * ped.speed * 4.5;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.built.legL.rotation.x = swing;
      ped.built.legR.rotation.x = -swing;
      ped.built.armL.rotation.x = -swing * 0.8;
      ped.built.armR.rotation.x = swing * 0.8;
      ped.built.group.position.set(ped.x, 0, ped.z);
      ped.built.group.rotation.y = ped.heading;
    }
  }

  function nearestPed(px, pz, maxDist) {
    let best = null, bestD = maxDist;
    for (const ped of peds) {
      if (ped.down) continue;
      const d = Math.hypot(ped.x - px, ped.z - pz);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best ? { ped: best, dist: bestD } : null;
  }

  // Returns 'down' when the ped goes down, 'hurt' otherwise.
  function damagePed(ped, amount) {
    ped.hp -= amount;
    if (ped.hp <= 0 && !ped.down) {
      ped.down = true;
      ped.downTimer = 6;
      ped.built.group.rotation.x = -Math.PI / 2;
      ped.built.group.position.y = 0.3;
      return 'down';
    }
    return 'hurt';
  }

  function visibleCountNear(px, pz, r) {
    let n = 0;
    for (const ped of peds) {
      if (!ped.down && Math.hypot(ped.x - px, ped.z - pz) < r) n++;
    }
    return n;
  }

  return { peds, update, nearestPed, damagePed, visibleCountNear };
}
