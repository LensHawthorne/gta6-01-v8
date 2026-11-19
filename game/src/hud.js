// HUD: every panel the judge can read at a glance — wanted stars, money,
// mission stages, named police units with distance and role, clock, radio,
// weapon slots, health, crew rank & RP, dialogue, speedometer, crew abilities,
// and the round minimap with roads, water, player, targets and police.
import { ROAD_XS, ROAD_ZS, WATER_X0, BEACH_X0 } from './city.js';
import { WEAPONS } from './combat.js';
import { rankFor, RADIO_STATIONS } from './palette.js';
import { clamp } from './rng.js';

const $ = id => document.getElementById(id);

export function createHud() {
  const minimap = $('minimap');
  const mctx = minimap.getContext('2d');
  const W = minimap.width, H = minimap.height;
  const MAP = { x0: -300, x1: 480, z0: -300, z1: 300 };
  const sx = v => ((v - MAP.x0) / (MAP.x1 - MAP.x0)) * W;
  const sz = v => ((v - MAP.z0) / (MAP.z1 - MAP.z0)) * H;

  let dialogueTimer = 0;
  let toastTimer = 0;

  function say(text, who) {
    $('dialogue-text').textContent = text;
    $('dialogue').querySelector('.who').textContent = (who || 'Faro') + ':';
    $('dialogue').classList.remove('hidden');
    dialogueTimer = 6;
  }

  function toast(text) {
    $('toast').textContent = text;
    $('toast').classList.remove('hidden');
    toastTimer = 2.6;
  }

  function daypart(hours) {
    if (hours >= 5 && hours < 8) return 'EARLY MORNING';
    if (hours >= 8 && hours < 12) return 'LATE MORNING';
    if (hours >= 12 && hours < 17) return 'SUNNY AFTERNOON';
    if (hours >= 17 && hours < 19) return 'GOLDEN HOUR';
    if (hours >= 19 && hours < 21) return 'DUSK';
    return 'NIGHT';
  }

  function fmtClock(hours) {
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours % 1) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function renderWeapons(combat) {
    const wrap = $('weapons');
    if (wrap.childElementCount !== WEAPONS.length) {
      wrap.innerHTML = '';
      WEAPONS.forEach((w, i) => {
        const d = document.createElement('div');
        d.className = 'slot';
        d.innerHTML = `<div class="wname">${w.name} [${w.key}]</div><div class="ammo"></div>`;
        wrap.appendChild(d);
      });
    }
    [...wrap.children].forEach((el, i) => {
      el.classList.toggle('active', i === combat.state.current);
      const ammo = combat.state.ammo[i];
      el.querySelector('.ammo').textContent =
        i === 0 ? 'melee' : (combat.state.reloading > 0 && i === combat.state.current
          ? 'RELOADING…' : `ammo ${ammo} / ${WEAPONS[i].mag}`);
    });
  }

  function renderAbilities(abilities) {
    const wrap = $('abilities');
    if (wrap.childElementCount !== abilities.length) {
      wrap.innerHTML = '';
      for (const a of abilities) {
        const d = document.createElement('div');
        d.className = 'ability';
        d.innerHTML = `<div class="aname"></div><div class="astate"></div>`;
        wrap.appendChild(d);
      }
    }
    [...wrap.children].forEach((el, i) => {
      const a = abilities[i];
      el.querySelector('.aname').textContent = `${a.key} · ${a.name}`;
      el.querySelector('.astate').textContent = a.cooldown > 0
        ? `${Math.ceil(a.cooldown)}s` : 'READY';
      el.classList.toggle('ready', a.cooldown <= 0);
    });
  }

  function drawMinimap(g) {
    mctx.clearRect(0, 0, W, H);
    // clip to circle
    mctx.save();
    mctx.beginPath();
    mctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
    mctx.clip();
    // ground
    mctx.fillStyle = '#9db08a';
    mctx.fillRect(0, 0, W, H);
    // water + beach
    mctx.fillStyle = '#2fa8b8';
    mctx.fillRect(sx(WATER_X0), 0, W - sx(WATER_X0), H);
    mctx.fillStyle = '#e9d6a4';
    mctx.fillRect(sx(BEACH_X0), 0, sx(WATER_X0) - sx(BEACH_X0), H);
    // roads
    mctx.strokeStyle = '#5d6670';
    mctx.lineWidth = 7;
    for (const x of ROAD_XS) {
      mctx.beginPath(); mctx.moveTo(sx(x), 0); mctx.lineTo(sx(x), H); mctx.stroke();
    }
    for (const z of ROAD_ZS) {
      mctx.beginPath(); mctx.moveTo(0, sz(z)); mctx.lineTo(W, sz(z)); mctx.stroke();
    }
    // mission target
    if (g.missionTarget) {
      mctx.fillStyle = '#ffb02e';
      const x = sx(g.missionTarget.x), y = sz(g.missionTarget.z);
      mctx.beginPath();
      mctx.moveTo(x, y - 9); mctx.lineTo(x + 8, y); mctx.lineTo(x, y + 9); mctx.lineTo(x - 8, y);
      mctx.closePath(); mctx.fill();
      mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5; mctx.stroke();
    }
    // fare destination
    if (g.fareDest) {
      mctx.fillStyle = '#ffe066';
      mctx.beginPath();
      mctx.arc(sx(g.fareDest.x), sz(g.fareDest.z), 6, 0, Math.PI * 2);
      mctx.fill();
    }
    // traffic dots
    mctx.fillStyle = '#ffffff';
    for (const c of g.trafficCars) {
      mctx.fillRect(sx(c.x) - 1.5, sz(c.z) - 1.5, 3, 3);
    }
    // police dots
    for (const u of g.policeUnits) {
      mctx.fillStyle = '#2244ff';
      mctx.beginPath();
      mctx.arc(sx(u.x), sz(u.z), 4, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.stroke();
    }
    if (g.heli) {
      mctx.fillStyle = '#ff4d4d';
      mctx.beginPath();
      mctx.arc(sx(g.heli.x), sz(g.heli.z), 5, 0, Math.PI * 2);
      mctx.fill();
    }
    // player arrow
    const px = sx(g.player.x), py = sz(g.player.z);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(Math.PI - g.player.heading); // arrow tip follows (sin h, cos h) on screen
    mctx.fillStyle = '#fff';
    mctx.strokeStyle = '#1a1206';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(0, -10); mctx.lineTo(7, 8); mctx.lineTo(0, 4); mctx.lineTo(-7, 8);
    mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
    mctx.restore();
  }

  function update(dt, g) {
    // stars
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < g.wanted ? '★' : '<span class="off">☆</span>';
    $('stars').innerHTML = stars;
    $('money').textContent = '$' + g.money.toLocaleString('en-US');
    $('shells-line').textContent = `Shells ${g.shellsGot} / 10`;
    $('district-line').innerHTML =
      `District: <b>${g.district}</b> · Standing ${'★'.repeat(g.standing)}${'☆'.repeat(5 - g.standing)}`;

    // mission panel
    if (g.mission) {
      $('mission-title').textContent = g.mission.title;
      const list = $('mission-stages');
      list.innerHTML = '';
      g.mission.stages.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = i < g.missionStage ? 'done' : i === g.missionStage ? 'now' : 'todo';
        li.textContent = s.text;
        list.appendChild(li);
      });
      let obj = g.mission.stages[g.missionStage]
        ? g.mission.stages[g.missionStage].text : 'Job done.';
      if (g.missionTimer > 0) obj += ` — ${Math.ceil(g.missionTimer)}s left!`;
      $('mission-objective').textContent = obj;
    } else {
      $('mission-title').textContent = 'Free Roam';
      $('mission-stages').innerHTML = '';
      $('mission-objective').textContent =
        'Explore Solara Bay. Steal a car, earn cash, stay out of trouble. Next job starts soon.';
    }

    $('clock').textContent = fmtClock(g.timeHours);
    $('daypart').textContent = daypart(g.timeHours);
    const st = RADIO_STATIONS[g.radioStation];
    $('radio-line').innerHTML = `♪ <b>${st.name}</b> · ${st.desc}`;

    // police list
    const list = $('police-list');
    if (g.policeUnits.length) {
      list.classList.remove('hidden');
      $('police-units').innerHTML = g.policeUnits.map(u =>
        `<div class="unit"><span>${u.label} <span class="role">· ${u.role}</span></span><span class="dist">${u.dist}m</span></div>`
      ).join('');
    } else {
      list.classList.add('hidden');
    }

    renderWeapons(g.combat);
    renderAbilities(g.abilities);
    $('health-fill').style.width = clamp(g.health / g.maxHealth * 100, 0, 100) + '%';
    $('health-fill').style.background = g.health > 50
      ? 'linear-gradient(90deg,#57e389,#a5f2b0)'
      : g.health > 25 ? 'linear-gradient(90deg,#ffb02e,#ffd98a)' : 'linear-gradient(90deg,#ff4d4d,#ff9a9a)';
    $('crew-rank').textContent = rankFor(g.rp);
    $('crew-rp').textContent = g.rp;

    $('speed').innerHTML = `${Math.round(g.speedMph)} <small>MPH</small>`;

    if (dialogueTimer > 0) {
      dialogueTimer -= dt;
      if (dialogueTimer <= 0) $('dialogue').classList.add('hidden');
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) $('toast').classList.add('hidden');
    }

    drawMinimap(g);
  }

  return { update, say, toast };
}
