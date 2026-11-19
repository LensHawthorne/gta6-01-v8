// Combat: fists, pistol, shotgun and SMG, a Q weapon wheel, reloads, muzzle
// flash and tracers. Hitting people or police raises the wanted level.
import * as THREE from 'three';
import { clamp } from './rng.js';

export const WEAPONS = [
  { id: 'fists', name: 'FISTS', key: '1', damage: 40, range: 2.8, rate: 0.45, mag: Infinity, desc: 'Knuckles. Quiet, personal.' },
  { id: 'pistol', name: 'PISTOL', key: '2', damage: 100, range: 70, rate: 0.32, mag: 12, desc: 'Standard sidearm. Loud.' },
  { id: 'shotgun', name: 'SHOTGUN', key: '3', damage: 55, range: 26, rate: 0.95, mag: 6, pellets: 5, desc: 'Five pellets of goodbye.' },
  { id: 'smg', name: 'SMG', key: '4', damage: 34, range: 48, rate: 0.09, mag: 30, desc: 'Sprays fast, sprays wide.' },
];

export function createCombat(scene, camera, callbacks) {
  const raycaster = new THREE.Raycaster();
  const state = {
    current: 0,
    ammo: [Infinity, 12, 6, 30],
    cooldown: 0,
    reloading: 0,
    wheelOpen: false,
    flash: null,
    tracer: null,
    tracerTimer: 0,
  };

  // muzzle flash: small bright plane at the bottom-right of the view
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 })
  );
  flash.position.set(0.5, -0.4, -1.2);
  camera.add(flash);
  state.flash = flash;

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
  ]);
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  scene.add(tracer);
  state.tracer = tracer;

  function selectWeapon(i) {
    state.current = i;
    state.reloading = 0;
    callbacks.onWeaponChange(WEAPONS[i]);
  }

  function reload() {
    const w = WEAPONS[state.current];
    if (isFinite(w.mag) && state.ammo[state.current] < w.mag && state.reloading <= 0) {
      state.reloading = 1.1;
      callbacks.onReload(w);
    }
  }

  function punch(player, peds, policeUnits) {
    if (state.cooldown > 0) return;
    state.cooldown = WEAPONS[0].rate;
    callbacks.onPunch();
    const px = player.x, pz = player.z, h = player.heading;
    // nearest ped in front
    const hit = peds.nearestPed(px + Math.sin(h) * 1.4, pz + Math.cos(h) * 1.4, 2.2);
    if (hit) {
      const res = peds.damagePed(hit.ped, 40);
      callbacks.onHitPerson(res, hit.ped);
      return;
    }
    for (const u of policeUnits) {
      const d = Math.hypot(u.x - px, u.z - pz);
      if (d < 2.6) {
        callbacks.onHitPolice();
        return;
      }
    }
  }

  function shoot(player, hittables) {
    const w = WEAPONS[state.current];
    if (state.current === 0) return;
    if (state.cooldown > 0 || state.reloading > 0) return;
    if (state.ammo[state.current] <= 0) {
      reload();
      return;
    }
    state.cooldown = w.rate;
    state.ammo[state.current]--;
    callbacks.onShot(w);

    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = w.range;
    const pellets = w.pellets || 1;
    let anyHit = false;
    for (let p = 0; p < pellets; p++) {
      const dir = raycaster.ray.direction.clone();
      if (pellets > 1) {
        dir.x += (Math.random() - 0.5) * 0.06;
        dir.y += (Math.random() - 0.5) * 0.06;
        dir.normalize();
      }
      raycaster.set(camera.getWorldPosition(new THREE.Vector3()), dir);
      const hits = raycaster.intersectObjects(hittables, true);
      for (const hit of hits) {
        let obj = hit.object;
        let root = null;
        while (obj) {
          if (obj.userData && obj.userData.hitRoot) { root = obj; break; }
          obj = obj.parent;
        }
        if (root) {
          anyHit = true;
          const end = hit.point.clone();
          showTracer(end);
          callbacks.onBulletHit(root.userData.hitRoot, w.damage, end);
          break;
        }
        // hit the world: spark + stop
        showTracer(hit.point.clone());
        break;
      }
      if (!anyHit && p === 0) {
        const end = camera.getWorldPosition(new THREE.Vector3())
          .add(dir.clone().multiplyScalar(w.range));
        showTracer(end);
      }
    }
    flash.material.opacity = 0.95;
    setTimeout(() => { flash.material.opacity = 0; }, 60);
  }

  function showTracer(end) {
    const start = camera.getWorldPosition(new THREE.Vector3());
    start.y -= 0.25;
    tracerGeo.setFromPoints([start, end]);
    tracer.visible = true;
    state.tracerTimer = 0.07;
  }

  function update(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const w = WEAPONS[state.current];
        state.ammo[state.current] = w.mag;
        callbacks.onReloadDone(w);
      }
    }
    if (state.tracerTimer > 0) {
      state.tracerTimer -= dt;
      if (state.tracerTimer <= 0) state.tracer.visible = false;
    }
  }

  function buildWheel(onPick) {
    const wheel = document.getElementById('wheel');
    wheel.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const slot = document.createElement('div');
      slot.className = 'wheel-slot' + (i === state.current ? ' sel' : '');
      slot.innerHTML = `<div class="wname">${w.key} · ${w.name}</div><div class="wdesc">${w.desc}</div>`;
      slot.addEventListener('click', () => {
        selectWeapon(i);
        setWheel(false);
        onPick(i);
      });
      wheel.appendChild(slot);
    });
  }

  function setWheel(open) {
    state.wheelOpen = open;
    document.getElementById('wheel').classList.toggle('hidden', !open);
    if (open) buildWheel(() => {});
  }

  return {
    state, selectWeapon, reload, punch, shoot, update, setWheel, buildWheel,
  };
}
