// Solara Bay — main bootstrap: renderer, input, game loop, abilities, saves,
// overlays, and the debug/staging hooks the screenshot run uses.
import * as THREE from 'three';
import { makeRng, pick } from './rng.js';
import { buildCity, ROAD_XS, ROAD_ZS } from './city.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createCombat, WEAPONS } from './combat.js';
import { createMissions } from './missions.js';
import { createActivities, UPGRADES } from './activities.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';
import { districtAt } from './palette.js';
import { clamp } from './rng.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');

// ---------- renderer / scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();

const rng = makeRng(20261120);
const city = buildCity(scene);
const traffic = createTraffic(scene, makeRng(4242));
const peds = createPedestrians(scene, makeRng(9911));

// ---------- game state ----------
const gameState = {
  money: 0, rp: 0, shellsGot: 0,
  missionsDone: new Set(),
  upgradesOwned: new Set(),
  upgrades: { engine: 1, armor: 0, paint: null },
  timeHours: 16.67, // 16:40 sunny afternoon
  radioStation: 0,
  health: 100,
  lastDamageAt: -999,
  started: false,
  paused: false,
  over: false,
};

const upgrades = gameState.upgrades; // player reads this live
const player = createPlayer(scene, city.colliders, upgrades);
const audio = createAudio();
const hud = createHud();

// ---------- police ----------
const police = createPolice(scene, city.colliders, {
  onBusted: () => {
    const lost = Math.floor(gameState.money * 0.1);
    gameState.money -= lost;
    police.state.wanted = 0;
    police.clearUnits();
    player.state.health = maxHealth();
    player.teleport(city.landmarks.hospital.x + 20, city.landmarks.hospital.z + 20, Math.PI / 2);
    $('busted-text').textContent =
      `The PCPD caught up with you. You wake up at St. Marina Hospital, $${lost} lighter.`;
    $('busted-screen').classList.remove('hidden');
    gameState.paused = true;
    audio.busted();
    saveGame(snapshot());
  },
});

// ---------- missions ----------
const missions = createMissions(scene, city.landmarks, {
  say: (text, who) => hud.say(text, who),
  setNight: n => city.setNight(n),
  addWanted: n => police.addWanted(n, nowSec()),
  damagePlayer: n => damagePlayer(n),
  onMissionStart: def => { hud.toast(def.title + ' — ' + def.stages[0].text); },
  onMissionComplete: def => {
    gameState.money += def.reward;
    gameState.rp += def.rp;
    gameState.missionsDone.add(def.id);
    activities.addStanding(districtAt(player.state.x, player.state.z), 1);
    audio.missionDone();
    hud.toast(`JOB DONE · +$${def.reward} · +${def.rp} RP`);
    $('mission-done-title').textContent = def.title + ' — JOB DONE';
    $('mission-done-text').textContent =
      `Faro wires you $${def.reward} and ${def.rp} RP. ${missions.nextMissionIndex() === -1
        ? 'That was the last job. The bay is yours, Mara.'
        : 'Next job is waiting when you are.'}`;
    $('mission-done-screen').classList.remove('hidden');
    gameState.paused = true;
    saveGame(snapshot());
  },
  onMissionFail: (def, reason) => {
    hud.say(`${def.title} failed — ${reason} Faro is giving you another shot.`, 'Faro');
    setTimeout(() => { if (gameState.started) missions.startMission(missions.defs.indexOf(def)); }, 2500);
  },
  onPickup: () => audio.pickup(),
});

// ---------- activities ----------
const activities = createActivities(scene, makeRng(31337), gameState, {
  say: (text, who) => hud.say(text, who),
  onShell: n => {
    audio.pickup();
    hud.toast(`Shell ${n} / 10 · +$15`);
  },
  onFareDone: (pay, dest) => {
    audio.missionDone();
    hud.toast(`Fare delivered to ${dest} · +$${pay}`);
  },
});

// ---------- combat ----------
function hittables() {
  const list = [];
  for (const ped of peds.peds) {
    if (!ped.down) {
      ped.built.group.userData.hitRoot = { type: 'ped', ref: ped };
      list.push(ped.built.group);
    }
  }
  for (const t of missions.state.thugs) {
    if (!t.down) {
      t.built.group.userData.hitRoot = { type: 'thug', ref: t };
      list.push(t.built.group);
    }
  }
  for (const u of police.units) {
    u.built.group.userData.hitRoot = { type: 'police', ref: u };
    list.push(u.built.group);
  }
  for (const c of traffic.cars) {
    if (!c.stolen) {
      c.built.group.userData.hitRoot = { type: 'traffic', ref: c };
      list.push(c.built.group);
    }
  }
  for (const p of traffic.parked) {
    if (!p.stolen) {
      p.built.group.userData.hitRoot = { type: 'parked', ref: p };
      list.push(p.built.group);
    }
  }
  return list;
}

let lastCrimeAt = -999;
function addCrime(n) {
  if (nowSec() - lastCrimeAt < 1.5) return;
  lastCrimeAt = nowSec();
  police.addWanted(n, nowSec());
}

const combat = createCombat(scene, player.camera, {
  onWeaponChange: () => audio.click(),
  onReload: () => hud.toast('Reloading…'),
  onReloadDone: () => {},
  onPunch: () => audio.punch(),
  onShot: () => audio.shot(),
  onHitPerson: (res, ped) => {
    addCrime(1);
    if (res === 'down') hud.say(pick(['Down. Walk away, Mara.', 'That one stays down.', 'Clean hit.']), 'Mara');
  },
  onHitPolice: () => addCrime(1),
  onBulletHit: (ud, damage, point) => {
    if (ud.type === 'ped') {
      const res = peds.damagePed(ud.ref, damage);
      if (res === 'down') addCrime(1);
    } else if (ud.type === 'thug') {
      missions.damageThug(ud.ref, damage);
    } else if (ud.type === 'police') {
      addCrime(1);
      ud.ref.speed *= 0.4;
    }
  },
});

// ---------- helpers ----------
function nowSec() { return performance.now() / 1000; }
function maxHealth() { return 100 + (gameState.upgrades.armor || 0) * 30; }
function damagePlayer(n) {
  player.state.health = Math.max(0, player.state.health - n);
  gameState.lastDamageAt = nowSec();
  if (player.state.health <= 0) {
    player.state.health = maxHealth();
    police.state.wanted = Math.max(police.state.wanted, 1);
    player.teleport(city.landmarks.hospital.x + 20, city.landmarks.hospital.z + 20, Math.PI / 2);
    hud.say('You black out and wake up at St. Marina Hospital.', 'Faro');
  }
}

function snapshot() {
  return {
    money: gameState.money, rp: gameState.rp,
    shellsGot: activities.state.shellsGot,
    missionsDone: gameState.missionsDone,
    upgradesOwned: gameState.upgradesOwned,
    upgrades: gameState.upgrades,
    timeHours: gameState.timeHours,
    playerX: player.state.x, playerZ: player.state.z,
  };
}

function applySave(data) {
  gameState.money = data.money || 0;
  gameState.rp = data.rp || 0;
  gameState.missionsDone = new Set(data.missionsDone || []);
  gameState.upgradesOwned = new Set(data.upgradesOwned || []);
  Object.assign(gameState.upgrades, data.upgrades || {});
  gameState.timeHours = data.timeHours ?? 16.67;
  if (data.player) player.teleport(data.player.x, data.player.z);
  missions.state.done = gameState.missionsDone;
}

// ---------- input ----------
const keysDown = new Set();
const keysPressed = new Set();
const mouse = { dx: 0, dy: 0, down: false, downX: 0, downY: 0 };
const keyApi = {
  down: code => keysDown.has(code),
  pressed: code => keysPressed.has(code),
};
addEventListener('keydown', e => {
  if (e.repeat) return;
  keysDown.add(e.code);
  keysPressed.add(e.code);
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  handleKeyPress(e.code);
});
addEventListener('keyup', e => keysDown.delete(e.code));
canvas.addEventListener('mousedown', e => {
  mouse.down = true; mouse.downX = e.clientX; mouse.downY = e.clientY;
});
addEventListener('mousemove', e => {
  if (!mouse.down) return;
  mouse.dx += e.movementX || 0;
  mouse.dy += e.movementY || 0;
});
addEventListener('mouseup', e => {
  mouse.down = false;
  const moved = Math.hypot(e.clientX - mouse.downX, e.clientY - mouse.downY);
  if (moved < 6 && gameState.started && !gameState.paused && !player.state.inCar) {
    combat.shoot(player.state, hittables());
  }
});

// ---------- crew abilities (keys 5 / 6 / 7) ----------
const abilities = [
  { key: '5', name: "Faro's Eye", cooldown: 0, max: 20 },
  { key: '6', name: 'Nitro Boost', cooldown: 0, max: 12 },
  { key: '7', name: 'Ghost', cooldown: 0, max: 45 },
];
function useAbility(i) {
  const a = abilities[i];
  if (!a || a.cooldown > 0 || !gameState.started || gameState.paused) return;
  if (i === 0) {
    const t = missions.beaconTarget || activities.fareDest;
    if (t) {
      const d = Math.round(Math.hypot(player.state.x - t.x, player.state.z - t.z));
      hud.toast(`Faro's Eye: target ${d}m away`);
    } else {
      hud.toast("Faro's Eye: nothing on the board — free roam");
    }
    a.cooldown = a.max;
  } else if (i === 1) {
    if (!player.state.inCar) { hud.toast('Nitro needs a car.'); return; }
    player.state.nitroTimer = 3;
    a.cooldown = a.max;
    hud.toast('NITRO!');
  } else if (i === 2) {
    if (police.state.wanted === 0) { hud.toast('Ghost: no heat to lose.'); return; }
    police.dropStar();
    a.cooldown = a.max;
    hud.toast('Ghost — one star gone. The PCPD lost the scent.');
  }
}

function handleKeyPress(code) {
  if (!gameState.started || gameState.paused) {
    if (code === 'KeyP' && gameState.started) togglePause();
    return;
  }
  const p = player.state;
  if (code === 'KeyE') {
    if (p.inCar) {
      player.exitCar();
    } else {
      const near = traffic.nearestStealable(p.x, p.z, 5.5);
      if (near) {
        near.car.stolen = true;
        player.enterCar(near.car);
        addCrime(1);
        hud.say(near.type === 'traffic'
          ? 'Carjacking in broad daylight. Bold. I like it.' : 'Borrowed. Permanently.', 'Mara');
        audio.click();
      }
    }
  } else if (code === 'KeyF' && !p.inCar) {
    combat.punch(p, peds, police.units);
    // punching a thug
    const hit = missions.nearestThug(p.x + Math.sin(p.heading) * 1.4, p.z + Math.cos(p.heading) * 1.4, 2.2);
    if (hit) {
      missions.damageThug(hit.thug, 40);
    }
  } else if (code === 'Digit1') combat.selectWeapon(0);
  else if (code === 'Digit2') combat.selectWeapon(1);
  else if (code === 'Digit3') combat.selectWeapon(2);
  else if (code === 'Digit4') combat.selectWeapon(3);
  else if (code === 'Digit5') useAbility(0);
  else if (code === 'Digit6') useAbility(1);
  else if (code === 'Digit7') useAbility(2);
  else if (code === 'KeyR') combat.reload();
  else if (code === 'KeyQ') combat.setWheel(!combat.state.wheelOpen);
  else if (code === 'KeyT') {
    const res = activities.tryTaxi(p);
    if (res === 'none') hud.toast('No fare waiting here. Find the yellow ◆.');
    else if (res === 'busy') hud.toast('Finish this fare first.');
    else if (res === 'need-foot') hud.toast('Hop out to pick up a fare.');
  } else if (code === 'KeyG') {
    const g = city.landmarks.garage;
    if (Math.hypot(p.x - g.x, p.z - g.z) < 30) openGarage();
    else hud.toast("Garage is at Faro's — west side, orange building.");
  } else if (code === 'KeyV') {
    gameState.radioStation = (gameState.radioStation + 1) % 3;
    audio.setStation(gameState.radioStation);
    hud.toast('Radio: ' + ['Bay FM', 'Harbor Rock', 'Night Drive'][gameState.radioStation]);
  } else if (code === 'KeyM') {
    audio.setMuted(!audio.isMuted());
    hud.toast(audio.isMuted() ? 'Muted.' : 'Sound on.');
  } else if (code === 'KeyP') {
    togglePause();
  }
}

function togglePause() {
  if (!gameState.started) return;
  gameState.paused = !gameState.paused;
  $('pause-screen').classList.toggle('hidden', !gameState.paused);
}

// ---------- overlays ----------
function openGarage() {
  gameState.paused = true;
  $('garage-cash').textContent = '$' + gameState.money;
  const list = $('garage-list');
  list.innerHTML = '';
  for (const up of UPGRADES) {
    const owned = gameState.upgradesOwned.has(up.id);
    const locked = up.needs && !gameState.upgradesOwned.has(up.needs);
    const row = document.createElement('div');
    row.className = 'upg';
    row.innerHTML = `<span><b>${up.name}</b> — ${up.desc}</span>`;
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.textContent = owned ? 'OWNED' : locked ? 'NEEDS ' + up.needs : `$${up.cost} BUY`;
    btn.disabled = owned || locked;
    btn.addEventListener('click', () => {
      const res = activities.buyUpgrade(up.id);
      if (res === 'ok') {
        gameState.upgradesOwned.add(up.id);
        audio.missionDone();
        openGarage();
      } else if (res === 'broke') {
        hud.toast('Not enough cash.');
      }
    });
    row.appendChild(btn);
    list.appendChild(row);
  }
  $('garage-screen').classList.remove('hidden');
}

$('garage-close').addEventListener('click', () => {
  $('garage-screen').classList.add('hidden');
  gameState.paused = false;
});
$('start-btn').addEventListener('click', () => startGame(false));
$('continue-btn').addEventListener('click', () => startGame(true));
$('resume-btn').addEventListener('click', togglePause);
$('restart-btn').addEventListener('click', () => { clearSave(); location.reload(); });
$('quit-btn').addEventListener('click', () => location.reload());
$('busted-btn').addEventListener('click', () => {
  $('busted-screen').classList.add('hidden');
  gameState.paused = false;
});
$('mission-done-btn').addEventListener('click', () => {
  $('mission-done-screen').classList.add('hidden');
  gameState.paused = false;
  const next = missions.nextMissionIndex();
  if (next >= 0) missions.startMission(next);
  else hud.toast('All 8 jobs done. The bay is yours, Mara.');
});
if (!hasSave()) $('continue-btn').style.display = 'none';

function startGame(continueSave) {
  if (gameState.started) return;
  audio.resume();
  audio.startRadio();
  if (continueSave) {
    const data = loadGame();
    if (data) applySave(data);
  }
  gameState.started = true;
  $('title-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  hud.say('Mara. You\'re out. Good. The bay missed you — the money didn\'t.', 'Faro');
  const next = missions.nextMissionIndex();
  if (next >= 0) setTimeout(() => {
    if (gameState.started && !missions.currentDef()) missions.startMission(next);
  }, 1200);
}

// ---------- staging hooks (screenshots + tests) ----------
function giveCarNear(px, pz) {
  const near = traffic.nearestStealable(px, pz, 40);
  if (!near) return false;
  near.car.stolen = true;
  player.enterCar(near.car);
  return true;
}

function stageDensity(opts = {}) {
  // Pull traffic cars and pedestrians into the camera frame around the player,
  // so a screenshot shows a living street instead of an empty road.
  const p = player.state;
  let roadX = ROAD_XS[0], best = 1e9;
  for (const x of ROAD_XS) {
    const d = Math.abs(x - p.x);
    if (d < best) { best = d; roadX = x; }
  }
  const fz = Math.cos(p.heading);
  let i = 0;
  for (const c of traffic.cars) {
    if (c.stolen || i >= 8) continue;
    if (i < 4) {
      // spread along the nearest north-south road, north and south of the player
      const dist = i < 2 ? -(20 + i * 13) : 16 + (i - 2) * 14;
      traffic.placeOnRoad(c, true, roadX, p.z + dist, i % 2 === 0 ? 1 : -1);
    } else if (!opts.beachCars) {
      // and along the nearest east-west road, so the cross street reads too
      // (skipped for the pier shot: beach cars cover it, and the pier road
      // runs out over the water)
      let roadZ = ROAD_ZS[0], bestZ = 1e9;
      for (const z of ROAD_ZS) {
        const d = Math.abs(z - p.z);
        if (d < bestZ) { bestZ = d; roadZ = z; }
      }
      const ewd = [-34, 42, -58, 66][i - 4];
      traffic.placeOnRoad(c, false, roadZ, p.x + ewd, i % 2 === 0 ? 1 : -1);
    }
    i++;
  }
  let j = 0;
  for (const ped of peds.peds) {
    if (ped.down || j >= 9) continue;
    const ang = j * 0.85 + 0.4;
    const r = 8 + j * 2.6;
    ped.x = p.x + Math.sin(ang) * r;
    ped.z = p.z + Math.cos(ang) * r;
    ped.heading = ang + Math.PI / 2;
    j++;
  }
  if (opts.parkedSpots) {
    // park cars at exact spots (e.g. along the market's north road)
    let k = 0;
    for (const pk of traffic.parked) {
      if (pk.stolen || k >= opts.parkedSpots.length) continue;
      const [sx, sz, sh] = opts.parkedSpots[k];
      pk.x = sx; pk.z = sz; pk.heading = sh;
      pk.built.group.position.set(sx, 0, sz);
      pk.built.group.rotation.y = sh;
      k++;
    }
  }
  if (opts.beachCars) {
    // beach parking: two parked cars on the sand beside the player
    let k = 0;
    for (const pk of traffic.parked) {
      if (pk.stolen || k >= 2) continue;
      pk.x = p.x + 12 + k * 4;
      pk.z = p.z + (k === 0 ? -9 : 10);
      pk.heading = Math.PI / 2;
      pk.built.group.position.set(pk.x, 0, pk.z);
      pk.built.group.rotation.y = pk.heading;
      k++;
    }
  }
}

function stageShot(n) {
  if (n === 1) return; // title screen, attract camera
  startGame(false);
  if (n === 2) {
    // DAY chase along the coast road, water on the right (heading north)
    gameState.timeHours = 16.67;
    city.setNight(false);
    player.teleport(240, 170, Math.PI);
    if (!giveCarNear(240, 170)) {
      // fallback: drag the nearest parked car next to the player
      const pk = traffic.parked[0];
      pk.x = 240; pk.z = 150; pk.heading = Math.PI;
      pk.built.group.position.set(240, 0, 150);
      pk.built.group.rotation.y = Math.PI;
      giveCarNear(240, 170);
    }
    // re-assert heading north: the stolen car's own heading would override it
    player.teleport(240, 170, Math.PI);
    police.addWanted(2, nowSec());
    missions.startMission(2); // M3 Bay Tour
    stageDensity();
  } else if (n === 3) {
    // NIGHT on foot at the night market
    gameState.timeHours = 21.5;
    city.setNight(true);
    player.teleport(-208, 176, -3 * Math.PI / 4); // among the east stalls, facing the market
    missions.startMission(5); // M6 Night Market
    police.addWanted(1, nowSec());
    stageDensity({ parkedSpots: [[-222, 188, Math.PI / 2], [-194, 188, -Math.PI / 2]] });
  } else if (n === 4) {
    // On-foot mission at the marina / pier, day
    gameState.timeHours = 16.67;
    city.setNight(false);
    player.teleport(318, 48, Math.PI / 2); // on the pier, facing east to the water
    missions.startMission(4); // M5 Pier Pressure
    missions.state.stage = 1; // thugs stage, so the brawl is visible
    stageDensity({ beachCars: true });
  }
}

window.__solara = {
  ready: true,
  start: () => startGame(false),
  stageShot,
  stageDensity,
  teleport: (x, z, h) => player.teleport(x, z, h),
  giveCarNear,
  setWanted: n => { police.state.wanted = n; },
  setTime: h => { gameState.timeHours = h; city.setNight(h >= 20.5 || h < 5); },
  startMission: i => missions.startMission(i),
  setStage: i => { missions.state.stage = i; },
  getState: () => ({
    started: gameState.started, paused: gameState.paused,
    money: gameState.money, rp: gameState.rp,
    wanted: police.state.wanted,
    health: player.state.health,
    inCar: player.state.inCar,
    x: player.state.x, z: player.state.z,
    mission: missions.currentDef() ? missions.currentDef().title : null,
    missionStage: missions.state.stage,
    shellsGot: activities.state.shellsGot,
    trafficNear: traffic.cars.filter(c => !c.stolen &&
      Math.hypot(c.x - player.state.x, c.z - player.state.z) < 60).length,
    pedsNear: peds.visibleCountNear(player.state.x, player.state.z, 60),
    timeHours: gameState.timeHours,
    fareActive: !!activities.state.fare,
  }),
};

// ---------- game loop ----------
const clock = new THREE.Clock();
let nightNow = false;
let saveTimer = 0;
let attractT = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = nowSec();

  if (!gameState.started) {
    // attract camera: slow orbit over the bay and the city
    attractT += dt;
    const a = attractT * 0.045;
    player.camera.position.set(
      90 + Math.sin(a) * 230, 110, 40 + Math.cos(a) * 230);
    player.camera.lookAt(80, 0, 0);
    city.update(dt, t);
    renderer.render(scene, player.camera);
    keysPressed.clear();
    mouse.dx = 0; mouse.dy = 0;
    return;
  }

  if (!gameState.paused) {
    // clock
    gameState.timeHours += dt / 60;
    if (gameState.timeHours >= 24) gameState.timeHours -= 24;
    const isNight = gameState.timeHours >= 20.5 || gameState.timeHours < 5;
    if (isNight !== nightNow) { nightNow = isNight; city.setNight(isNight); }

    // health regen
    if (t - gameState.lastDamageAt > 10 && player.state.health < maxHealth()) {
      player.state.health = Math.min(maxHealth(), player.state.health + 3 * dt);
    }
    for (const a of abilities) if (a.cooldown > 0) a.cooldown -= dt;

    city.update(dt, t);
    traffic.update(dt);
    peds.update(dt, player.state, player.state.carSpeed);
    player.update(dt, keyApi, mouse, traffic);
    police.update(dt, t, player.state, city.colliders);
    missions.update(dt, player.state, police, peds);
    activities.update(dt, player.state);
    combat.update(dt);
    audio.setEngine(player.speedMph(), player.state.inCar);
    audio.setSiren(police.state.wanted > 0 && police.nearestDist(player.state) < 90,
      police.state.wanted);

    // autosave
    saveTimer += dt;
    if (saveTimer > 20) { saveTimer = 0; saveGame(snapshot()); }

    hud.update(dt, {
      wanted: police.state.wanted,
      money: gameState.money,
      shellsGot: activities.state.shellsGot,
      district: districtAt(player.state.x, player.state.z),
      standing: activities.state.standing[districtAt(player.state.x, player.state.z)] || 0,
      mission: missions.currentDef(),
      missionStage: missions.state.stage,
      missionTimer: missions.currentDef() && missions.currentDef().timeLimit ? missions.state.timer : 0,
      timeHours: gameState.timeHours,
      radioStation: gameState.radioStation,
      policeUnits: police.unitList(player.state),
      combat,
      abilities,
      health: player.state.health,
      maxHealth: maxHealth(),
      rp: gameState.rp,
      speedMph: player.speedMph(),
      player: player.state,
      missionTarget: missions.beaconTarget,
      fareDest: activities.fareDest,
      trafficCars: traffic.cars.filter(c => !c.stolen),
      heli: police.heli ? { x: police.heli.position.x, z: police.heli.position.z } : null,
    });
  }

  keysPressed.clear();
  renderer.render(scene, player.camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  player.camera.aspect = innerWidth / innerHeight;
  player.camera.updateProjectionMatrix();
});

// auto-stage for screenshots: ?shot=2|3|4
if (SHOT && SHOT !== '1') {
  setTimeout(() => stageShot(Number(SHOT)), 400);
}
animate();
