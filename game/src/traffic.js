// Traffic: cars that drive the road grid, turn at intersections, brake for the
// car ahead — plus parked cars along the kerb. Cars are stealable (E).
import * as THREE from 'three';
import { buildCar, randomCarColor } from './vehicles.js';
import { makeRng, pick, range, rangeInt } from './rng.js';
import { ROAD_XS, ROAD_ZS } from './city.js';
import { clamp, wrapAngle } from './rng.js';

const KINDS = ['sedan', 'sedan', 'hatch', 'pickup', 'van', 'taxi', 'sedan'];

export function createTraffic(scene, rng) {
  const cars = [];
  const parked = [];

  function spawnTrafficCar() {
    const kind = pick(rng, KINDS);
    const built = buildCar(kind, randomCarColor(rng));
    const ns = rng() < 0.5;
    const road = ns ? pick(rng, ROAD_XS) : pick(rng, ROAD_ZS);
    const dir = rng() < 0.5 ? 1 : -1;
    const t = range(rng, -240, 240);
    const car = {
      built, kind, ns, road, dir,
      t, speed: range(rng, 7, 13), baseSpeed: 0,
      x: 0, z: 0, heading: 0, targetSpeed: 0, stolen: false,
    };
    car.baseSpeed = car.speed;
    car.targetSpeed = car.speed;
    placeCar(car);
    scene.add(built.group);
    cars.push(car);
    return car;
  }

  function placeCar(car) {
    const lane = 4.2;
    if (car.ns) {
      car.x = car.road + (car.dir > 0 ? -lane : lane);
      car.z = car.t;
      car.heading = car.dir > 0 ? 0 : Math.PI;
    } else {
      car.z = car.road + (car.dir > 0 ? lane : -lane);
      car.x = car.t;
      car.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.built.group.position.set(car.x, 0, car.z);
    car.built.group.rotation.y = car.heading;
  }

  function maybeTurn(car) {
    // At an intersection, sometimes turn onto the crossing road.
    const cross = car.ns ? ROAD_ZS : ROAD_XS;
    for (const c of cross) {
      if (Math.abs(car.t - c) < 1.2 && rng() < 0.22) {
        if (car.ns) { car.ns = false; car.road = c; }
        else { car.ns = true; car.road = c; }
        car.dir = rng() < 0.5 ? 1 : -1;
        car.t = car.ns ? car.z : car.x;
        // snap onto the new road
        placeCar(car);
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i < 26; i++) spawnTrafficCar();

  // Parked cars along kerbs, a few angled, several on the coast road.
  for (let i = 0; i < 30; i++) {
    const kind = pick(rng, ['sedan', 'hatch', 'pickup', 'van', 'sedan']);
    const built = buildCar(kind, randomCarColor(rng));
    let x, z, heading;
    if (i < 8) {
      // coast road parking, facing the beach
      x = 240 + (rng() < 0.5 ? 8.5 : -8.5);
      z = range(rng, -230, 230);
      heading = rng() < 0.5 ? 0 : Math.PI;
    } else {
      const ns = rng() < 0.5;
      const road = ns ? pick(rng, ROAD_XS) : pick(rng, ROAD_ZS);
      const off = range(rng, -230, 230);
      const side = rng() < 0.5 ? 8.5 : -8.5;
      if (ns) { x = road + side; z = off; heading = rng() < 0.5 ? 0 : Math.PI; }
      else { z = road + side; x = off; heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; }
    }
    built.group.position.set(x, 0, z);
    built.group.rotation.y = heading + range(rng, -0.06, 0.06);
    scene.add(built.group);
    parked.push({ built, kind, x, z, heading, stolen: false });
  }

  function nearestStealable(px, pz, maxDist) {
    let best = null, bestD = maxDist;
    for (const c of cars) {
      if (c.stolen) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bestD) { bestD = d; best = { type: 'traffic', car: c, dist: d }; }
    }
    for (const p of parked) {
      if (p.stolen) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < bestD) { bestD = d; best = { type: 'parked', car: p, dist: d }; }
    }
    return best;
  }

  function update(dt) {
    for (const car of cars) {
      if (car.stolen) continue;
      // brake for the car ahead on the same road and lane
      let ahead = 99;
      for (const o of cars) {
        if (o === car || o.stolen || o.ns !== car.ns || o.road !== car.road || o.dir !== car.dir) continue;
        const gap = (o.t - car.t) * car.dir;
        if (gap > 0 && gap < ahead) ahead = gap;
      }
      car.targetSpeed = ahead < 10 ? 0 : car.baseSpeed;
      car.speed += clamp(car.targetSpeed - car.speed, -14 * dt, 8 * dt);
      car.t += car.dir * car.speed * dt;
      if (car.t > 252 || car.t < -252) {
        car.dir *= -1;
        car.t = clamp(car.t, -252, 252);
      }
      maybeTurn(car);
      placeCar(car);
      for (const w of car.built.wheels) w.rotation.z += car.speed * dt * 0.9;
    }
  }

  function allCarPositions() {
    const out = [];
    for (const c of cars) if (!c.stolen) out.push({ x: c.x, z: c.z, r: 2.6 });
    for (const p of parked) if (!p.stolen) out.push({ x: p.x, z: p.z, r: 2.6 });
    return out;
  }

  // Staging hook: put a traffic car on a given road at a given point.
  function placeOnRoad(car, ns, road, t, dir) {
    car.ns = ns;
    car.road = road;
    car.t = t;
    car.dir = dir;
    placeCar(car);
  }

  return { cars, parked, update, nearestStealable, allCarPositions, spawnTrafficCar, placeOnRoad };
}
