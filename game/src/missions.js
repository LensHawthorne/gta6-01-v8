// Eight story missions for Mara Solano, chained in order: steal, heat, tour,
// timed run, pier brawl, night market, marina delivery, and the final stand.
// Each mission has stages the HUD lists, a 3D beacon at its target, and a
// cash + RP reward. Missions are the spine of the game.
import * as THREE from 'three';
import { buildPed } from './vehicles.js';
import { FARO_LINES } from './palette.js';
import { makeRng } from './rng.js';

const thugRng = makeRng(777);

export function missionDefs(landmarks) {
  const G = landmarks.garage, H = landmarks.hospital, P = landmarks.pier;
  const M = landmarks.marina, K = landmarks.market, T = landmarks.tower;
  const BS = landmarks.beachSouth, BN = landmarks.beachNorth, NP = landmarks.northPoint;
  return [
    {
      id: 1, title: 'M1 Wheels Up', reward: 150, rp: 40,
      intro: FARO_LINES.intro,
      stages: [
        { text: 'Steal any car (walk up and press E)', target: null, kind: 'steal' },
        { text: "Bring it to Faro's Garage", target: G, radius: 14, kind: 'goto' },
      ],
    },
    {
      id: 2, title: 'M2 Heat Check', reward: 200, rp: 60,
      intro: FARO_LINES.m2start,
      stages: [
        { text: 'Get the heat to 2 stars (steal, punch, shoot)', target: null, kind: 'wanted', level: 2 },
        { text: 'Lose the cops — stay clean until the stars fade', target: null, kind: 'clean' },
      ],
    },
    {
      id: 3, title: 'M3 Bay Tour', reward: 250, rp: 80,
      intro: FARO_LINES.m3start,
      stages: [
        { text: 'Bay Tour stop 1 of 4: the main pier', target: P, radius: 14, kind: 'goto' },
        { text: 'Bay Tour stop 2 of 4: the marina', target: M, radius: 16, kind: 'goto' },
        { text: 'Bay Tour stop 3 of 4: south beach', target: BS, radius: 16, kind: 'goto' },
        { text: 'Bay Tour stop 4 of 4: north point', target: NP, radius: 14, kind: 'goto' },
      ],
    },
    {
      id: 4, title: 'M4 Sunset Run', reward: 300, rp: 100,
      intro: FARO_LINES.m4start, timeLimit: 75,
      stages: [
        { text: 'Checkpoint 1 of 3: downtown tower', target: T, radius: 14, kind: 'goto' },
        { text: 'Checkpoint 2 of 3: night market', target: K, radius: 14, kind: 'goto' },
        { text: 'Checkpoint 3 of 3: the pier', target: P, radius: 14, kind: 'goto' },
      ],
    },
    {
      id: 5, title: 'M5 Pier Pressure', reward: 350, rp: 120,
      intro: FARO_LINES.m5start,
      stages: [
        { text: 'Go to the pier, on foot', target: P, radius: 16, kind: 'goto' },
        { text: 'Drop all 4 dock thugs (F to punch)', target: P, radius: 30, kind: 'thugs', count: 4 },
      ],
    },
    {
      id: 6, title: 'M6 Night Market', reward: 300, rp: 100,
      intro: FARO_LINES.m6start, night: true,
      stages: [
        { text: 'Night Market: pick up 6 crates from the stalls', target: K, radius: 26, kind: 'crates', count: 6 },
      ],
    },
    {
      id: 7, title: 'M7 Marina Lights', reward: 450, rp: 150,
      intro: FARO_LINES.m7start,
      stages: [
        { text: 'Pick up the package at the marina', target: M, radius: 14, kind: 'goto' },
        { text: 'Deliver it to Faro\'s Garage — the PCPD is watching', target: G, radius: 14, kind: 'goto' },
      ],
    },
    {
      id: 8, title: 'M8 The Bay King', reward: 800, rp: 250,
      intro: FARO_LINES.m8start,
      stages: [
        { text: 'Reach the Solara Tower', target: T, radius: 16, kind: 'goto' },
        { text: 'Survive 5 stars for 60 seconds', target: T, radius: 60, kind: 'survive', seconds: 60 },
        { text: 'Escape to the north beach', target: BN, radius: 16, kind: 'goto' },
      ],
    },
  ];
}

export function createMissions(scene, landmarks, ctx) {
  const defs = missionDefs(landmarks);
  const state = {
    current: 0,           // index into defs, -1 = none
    stage: 0,
    timer: 0,
    surviveTimer: 0,
    thugs: [],
    crates: [],
    done: new Set(),
    active: false,
  };

  // beacon: light pillar + spinning diamond at the current target
  const beacon = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  pillar.position.y = 21;
  beacon.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffb02e })
  );
  diamond.position.y = 8;
  beacon.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4, 5.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  beacon.add(ring);
  beacon.visible = false;
  scene.add(beacon);

  function currentDef() {
    return state.active && state.current >= 0 ? defs[state.current] : null;
  }
  function currentStage() {
    const d = currentDef();
    return d ? d.stages[state.stage] : null;
  }

  function clearThugs() {
    for (const t of state.thugs) scene.remove(t.built.group);
    state.thugs = [];
  }
  function clearCrates() {
    for (const c of state.crates) scene.remove(c.mesh);
    state.crates = [];
  }

  function spawnThugs() {
    clearThugs();
    for (let i = 0; i < 4; i++) {
      const built = buildPed(thugRng);
      built.torso.material.color.set(0x2e2e2e);
      built.head.material.color.set(0xd9a06a);
      const thug = {
        built,
        x: landmarks.pier.x - 20 + i * 10,
        z: landmarks.pier.z + (i % 2 === 0 ? -8 : 8),
        hp: 80, punchCooldown: 0, down: false,
      };
      built.group.position.set(thug.x, 0, thug.z);
      scene.add(built.group);
      state.thugs.push(thug);
    }
  }

  function spawnCrates() {
    clearCrates();
    const spots = [
      [-228, 158], [-214, 158], [-200, 162], [-228, 178], [-214, 182], [-202, 176],
    ];
    for (const [x, z] of spots) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 1.6),
        new THREE.MeshLambertMaterial({ color: 0xffb02e, emissive: 0x664400 })
      );
      mesh.position.set(x, 0.6, z);
      mesh.castShadow = true;
      scene.add(mesh);
      state.crates.push({ mesh, x, z, taken: false });
    }
  }

  function startMission(i) {
    const def = defs[i];
    if (!def || state.done.has(def.id)) return false;
    state.current = i;
    state.stage = 0;
    state.timer = def.timeLimit || 0;
    state.surviveTimer = 0;
    state.active = true;
    if (def.night) ctx.setNight(true);
    if (def.id === 7) ctx.addWanted(0); // heat comes at pickup
    ctx.say(def.intro, 'Faro');
    ctx.onMissionStart(def);
    return true;
  }

  function completeMission() {
    const def = currentDef();
    if (!def) return;
    state.done.add(def.id);
    state.active = false;
    beacon.visible = false;
    clearThugs();
    clearCrates();
    ctx.onMissionComplete(def);
  }

  function failMission(reason) {
    const def = currentDef();
    if (!def) return;
    state.active = false;
    beacon.visible = false;
    clearThugs();
    clearCrates();
    ctx.onMissionFail(def, reason);
  }

  function atTarget(player, target, radius) {
    return Math.hypot(player.x - target.x, player.z - target.z) < radius;
  }

  function update(dt, player, police, peds) {
    const def = currentDef();
    if (!def) return;
    const stage = currentStage();
    if (!stage) { completeMission(); return; }

    // beacon follows the stage target
    if (stage.target) {
      beacon.visible = true;
      beacon.position.set(stage.target.x, 0, stage.target.z);
      diamond.rotation.y += dt * 2;
      diamond.position.y = 8 + Math.sin(performance.now() / 300) * 0.8;
      ring.scale.setScalar(1 + Math.sin(performance.now() / 400) * 0.08);
    } else {
      beacon.visible = false;
    }

    // mission timer
    if (def.timeLimit) {
      state.timer -= dt;
      if (state.timer <= 0) {
        failMission('Out of time.');
        return;
      }
    }

    switch (stage.kind) {
      case 'steal':
        if (player.inCar) { state.stage++; ctx.say(FARO_LINES.m1done, 'Faro'); }
        break;
      case 'goto':
        if (atTarget(player, stage.target, stage.radius)) {
          if (def.id === 7 && state.stage === 0) {
            ctx.say('Package secured. Now run — the PCPD just got the call.', 'Lena');
            ctx.addWanted(3);
          }
          state.stage++;
          if (state.stage >= def.stages.length) completeMission();
        }
        break;
      case 'wanted':
        if (police.state.wanted >= stage.level) {
          ctx.say(FARO_LINES.m2start, 'Faro');
          state.stage++;
        }
        break;
      case 'clean':
        if (police.state.wanted === 0) state.stage++;
        if (state.stage >= def.stages.length) completeMission();
        break;
      case 'thugs': {
        if (state.thugs.length === 0) spawnThugs();
        let alive = 0;
        for (const t of state.thugs) {
          if (t.down) continue;
          alive++;
          // thugs close in and swing
          const d = Math.hypot(player.x - t.x, player.z - t.z);
          if (d < 26 && !player.inCar) {
            const h = Math.atan2(player.x - t.x, player.z - t.z);
            t.x += Math.sin(h) * 3.2 * dt;
            t.z += Math.cos(h) * 3.2 * dt;
            t.built.group.rotation.y = h;
            t.punchCooldown -= dt;
            if (d < 2.2 && t.punchCooldown <= 0) {
              t.punchCooldown = 1.1;
              ctx.damagePlayer(6);
              ctx.say('Hey! That\'s our turf!', 'Thug');
            }
          }
          t.built.group.position.set(t.x, 0, t.z);
        }
        if (alive === 0) {
          state.stage++;
          if (state.stage >= def.stages.length) completeMission();
        }
        break;
      }
      case 'crates': {
        if (state.crates.length === 0) spawnCrates();
        let left = 0;
        for (const c of state.crates) {
          if (c.taken) continue;
          left++;
          if (Math.hypot(player.x - c.x, player.z - c.z) < 2.4) {
            c.taken = true;
            scene.remove(c.mesh);
            ctx.onPickup('crate');
          }
        }
        if (left === 0) {
          state.stage++;
          if (state.stage >= def.stages.length) completeMission();
        }
        break;
      }
      case 'survive': {
        if (police.state.wanted < 5) ctx.addWanted(5 - police.state.wanted);
        state.surviveTimer += dt;
        if (state.surviveTimer >= stage.seconds) {
          ctx.say('Sixty seconds at five stars. Now run for the beach!', 'Faro');
          state.stage++;
        }
        break;
      }
      default:
        break;
    }
  }

  function damageThug(thug, amount) {
    thug.hp -= amount;
    if (thug.hp <= 0 && !thug.down) {
      thug.down = true;
      thug.built.group.rotation.x = -Math.PI / 2;
      thug.built.group.position.y = 0.3;
      return true;
    }
    return false;
  }

  function nearestThug(px, pz, maxDist) {
    let best = null, bestD = maxDist;
    for (const t of state.thugs) {
      if (t.down) continue;
      const d = Math.hypot(t.x - px, t.z - pz);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { thug: best, dist: bestD } : null;
  }

  function nextMissionIndex() {
    for (let i = 0; i < defs.length; i++) {
      if (!state.done.has(defs[i].id)) return i;
    }
    return -1;
  }

  return {
    state, defs, currentDef, currentStage, startMission, completeMission,
    failMission, update, damageThug, nearestThug, nextMissionIndex,
    get beaconTarget() {
      const s = currentStage();
      return s && s.target ? s.target : null;
    },
  };
}
