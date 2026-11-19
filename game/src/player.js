// Mara Solano on foot and behind the wheel: WASD movement, jumping, running,
// car stealing, driving with steering/braking/handbrake/nitro, and a smooth
// third-person chase camera that answers to the mouse.
import * as THREE from 'three';
import { buildPlayer } from './vehicles.js';
import { clamp, wrapAngle, angleLerp } from './rng.js';

const ON_FOOT_WALK = 4.6;
const ON_FOOT_RUN = 9.0;
const GRAVITY = 22;

function circleHitsBox(x, z, r, b) {
  const cx = clamp(x, b.x0, b.x1);
  const cz = clamp(z, b.z0, b.z1);
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

function pushOutOfBoxes(x, z, r, colliders) {
  for (const b of colliders) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) {
      const cx = clamp(x, b.x0, b.x1);
      const cz = clamp(z, b.z0, b.z1);
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.0001) {
        // centre inside the box: push out along the smallest penetration
        const pl = x - (b.x0 - r), pr = (b.x1 + r) - x;
        const pt = z - (b.z0 - r), pb = (b.z1 + r) - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.x0 - r; else if (m === pr) x = b.x1 + r;
        else if (m === pt) z = b.z0 - r; else z = b.z1 + r;
      } else {
        const d = Math.sqrt(d2);
        const push = (r - d);
        dx /= d; dz /= d;
        x += dx * push; z += dz * push;
      }
    }
  }
  return [x, z];
}

export function createPlayer(scene, colliders, upgrades) {
  const mesh = buildPlayer();
  scene.add(mesh.group);

  const state = {
    x: 240, z: 120, heading: Math.PI, // start mid coast road, facing north up the beach
    speed: 0, vy: 0, y: 0, onGround: true,
    inCar: false, car: null, carSpeed: 0, carHeading: 0,
    health: 100, walkPhase: 0,
    camYaw: Math.PI, camPitch: 0.24, camDist: 7.5,
    nitroTimer: 0, nitroCooldown: 0,
    steer: 0,
  };

  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.1, 2000);
  scene.add(camera);

  function enterCar(carObj) {
    state.inCar = true;
    state.car = carObj;
    state.carSpeed = 0;
    state.carHeading = carObj.heading;
    state.x = carObj.x; state.z = carObj.z;
    mesh.group.visible = false;
    return true;
  }

  function exitCar() {
    if (!state.inCar || !state.car) return;
    const c = state.car;
    state.inCar = false;
    state.car = null;
    state.x = c.x + Math.sin(c.heading + Math.PI / 2) * 3;
    state.z = c.z + Math.cos(c.heading + Math.PI / 2) * 3;
    state.heading = c.heading;
    mesh.group.visible = true;
    mesh.group.position.set(state.x, 0, state.z);
  }

  function teleport(x, z, heading) {
    if (state.inCar && state.car) {
      state.car.x = x; state.car.z = z;
      state.car.heading = heading ?? state.car.heading;
      if (heading !== undefined) state.carHeading = heading;
      state.car.built.group.position.set(x, 0, z);
      state.car.built.group.rotation.y = state.car.heading;
      state.carSpeed = 0;
    }
    state.x = x; state.z = z;
    if (heading !== undefined) { state.heading = heading; state.camYaw = heading + Math.PI; }
    mesh.group.position.set(x, 0, z);
  }

  function update(dt, keys, mouse, traffic) {
    // camera orbit from mouse drag
    state.camYaw -= mouse.dx * 0.005;
    state.camPitch = clamp(state.camPitch + mouse.dy * 0.003, 0.08, 1.1);
    mouse.dx = 0; mouse.dy = 0;
    if (keys.pressed('KeyC')) {
      state.camDist = state.camDist > 9 ? 9 : 14;
    }

    if (!state.inCar) {
      // ---- on foot ----
      const run = keys.down('ShiftLeft') || keys.down('ShiftRight');
      const moveSpeed = run ? ON_FOOT_RUN : ON_FOOT_WALK;
      let fx = 0, fz = 0;
      const cy = state.camYaw;
      const fwdX = -Math.sin(cy), fwdZ = -Math.cos(cy);
      const rightX = -fwdZ, rightZ = fwdX;
      if (keys.down('KeyW')) { fx += fwdX; fz += fwdZ; }
      if (keys.down('KeyS')) { fx -= fwdX; fz -= fwdZ; }
      if (keys.down('KeyA')) { fx -= rightX; fz -= rightZ; }
      if (keys.down('KeyD')) { fx += rightX; fz += rightZ; }
      const len = Math.hypot(fx, fz);
      if (len > 0.01) {
        fx /= len; fz /= len;
        state.x += fx * moveSpeed * dt;
        state.z += fz * moveSpeed * dt;
        state.heading = angleLerp(state.heading, Math.atan2(fx, fz), Math.min(1, dt * 12));
        state.speed = moveSpeed;
        state.walkPhase += dt * moveSpeed * 1.6;
      } else {
        state.speed = 0;
      }
      // jump
      if (keys.pressed('Space') && state.onGround) {
        state.vy = 8; state.onGround = false;
      }
      if (!state.onGround) {
        state.vy -= GRAVITY * dt;
        state.y += state.vy * dt;
        if (state.y <= 0) { state.y = 0; state.vy = 0; state.onGround = true; }
      }
      [state.x, state.z] = pushOutOfBoxes(state.x, state.z, 0.7, colliders);
      state.x = clamp(state.x, -280, 460);
      state.z = clamp(state.z, -280, 280);
      // walk cycle
      const swing = state.speed > 0.1 ? Math.sin(state.walkPhase) * 0.55 : 0;
      mesh.legL.rotation.x = swing;
      mesh.legR.rotation.x = -swing;
      mesh.armL.rotation.x = -swing * 0.8;
      mesh.armR.rotation.x = swing * 0.8;
      mesh.group.position.set(state.x, state.y, state.z);
      mesh.group.rotation.y = state.heading;
      // camera follows behind the player
      state.camYaw = angleLerp(state.camYaw, state.heading + Math.PI, Math.min(1, dt * 2.2));
    } else {
      // ---- driving ----
      const c = state.car;
      const maxSpeed = 30 * (upgrades.engine || 1) + (state.nitroTimer > 0 ? 15 : 0);
      const accel = 16, brake = 30;
      let target = state.carSpeed;
      if (keys.down('KeyW')) target += accel * dt;
      if (keys.down('KeyS')) target -= (state.carSpeed > 1 ? brake : 10) * dt;
      if (!keys.down('KeyW') && !keys.down('KeyS')) {
        target -= Math.sign(target) * Math.min(Math.abs(target), 6 * dt);
      }
      if (keys.down('Space')) { // handbrake
        target -= Math.sign(target) * Math.min(Math.abs(target), 26 * dt);
      }
      // sand slows the car
      const onSand = state.x > 264;
      const cap = onSand ? 12 : maxSpeed;
      target = clamp(target, -10, cap);
      state.carSpeed = target;
      // steering: stronger at low speed, handbrake turns sharper
      const steerInput = (keys.down('KeyA') ? 1 : 0) - (keys.down('KeyD') ? 1 : 0);
      const steerRate = (keys.down('Space') ? 2.4 : 1.5) * clamp(Math.abs(state.carSpeed) / 8, 0.25, 1);
      state.carHeading += steerInput * steerRate * dt * Math.sign(state.carSpeed || 1);
      state.steer = steerInput;
      state.x += Math.sin(state.carHeading) * state.carSpeed * dt;
      state.z += Math.cos(state.carHeading) * state.carSpeed * dt;
      // collisions with buildings
      const before = [state.x, state.z];
      [state.x, state.z] = pushOutOfBoxes(state.x, state.z, 2.2, colliders);
      if (before[0] !== state.x || before[1] !== state.z) {
        state.carSpeed *= 0.45; // thud into the wall
      }
      // collisions with other cars
      for (const o of traffic.allCarPositions()) {
        const dx = state.x - o.x, dz = state.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / 2;
          state.x += (dx / d) * push;
          state.z += (dz / d) * push;
          state.carSpeed *= 0.97;
        }
      }
      state.x = clamp(state.x, -280, 400);
      state.z = clamp(state.z, -280, 280);
      c.x = state.x; c.z = state.z; c.heading = state.carHeading;
      c.built.group.position.set(state.x, 0, state.z);
      c.built.group.rotation.y = state.carHeading;
      for (const w of c.built.wheels) w.rotation.z += state.carSpeed * dt * 0.9;
      state.heading = state.carHeading;
      state.camYaw = angleLerp(state.camYaw, state.carHeading + Math.PI, Math.min(1, dt * 1.8));
      if (state.nitroTimer > 0) state.nitroTimer -= dt;
      if (state.nitroCooldown > 0) state.nitroCooldown -= dt;
    }

    // ---- camera ----
    const dist = state.camDist * (state.inCar ? 1.15 : 1);
    const height = 3.2 + Math.sin(state.camPitch) * dist * 0.7;
    const back = Math.cos(state.camPitch) * dist;
    const cx = state.x + Math.sin(state.camYaw) * back;
    const cz = state.z + Math.cos(state.camYaw) * back;
    camera.position.set(cx, height + state.y, cz);
    camera.lookAt(state.x, 1.6 + state.y, state.z);
  }

  function speedMph() {
    return Math.abs(state.inCar ? state.carSpeed : state.speed) * 2.237;
  }

  return {
    state, camera, update, enterCar, exitCar, teleport, speedMph,
    mesh,
  };
}
