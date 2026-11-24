// main.js — Neon Bay's entry point: the game state, the loop, input, the
// camera, save/load, and the deterministic ?shot= staging used for the
// screenshots (start / foot / chase / mission).

import { makeRng, clamp, dist } from './util.js';
import { buildWorld, drawWorld, isOnRoad, WORLD_SIZE } from './world.js';
import { spawnTraffic, updateTraffic, drivePlayerCar, drawCar, collideBuildings, carHitsCar, makeCar } from './vehicles.js';
import { spawnPeds, updatePeds, drawPed, scarePeds } from './pedestrians.js';
import { updatePolice, addWanted, drawCops, WANTED_NAMES } from './police.js';
import { playerShoot, updateBullets, updateGangsters, drawBullets } from './combat.js';
import { makePlayer, updatePlayerOnFoot, tryEnterCar, drawPlayer, setMuzzle } from './player.js';
import { startMission, updateMission, drawMarker, MISSIONS, LOC, SPAWN } from './missions.js';
import { drawHud, drawTitle, drawPause, drawBusted, drawGameOver } from './hud.js';
import * as sfx from './audio.js';

const SAVE_KEY = 'neon-bay-save-v1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Game state -------------------------------------------------------------
const G = {
  rng: makeRng(20261124),
  world: null,
  player: null,
  cars: [],
  peds: [],
  cops: [],
  footCops: [],
  gangsters: [],
  bullets: [],
  particles: [],
  mission: null,
  pendingMission: null,
  pendingTimer: 0,
  storyDone: false,
  state: 'title', // title | playing | paused | busted | gameover
  time: 0,
  shake: 0,
  muzzle: 0,
  hudMessage: '',
  hudTimer: 0,
  wantedTimer: 0,
  lastCrime: '',
  busted: false,
  saveExists: false,
  view: { w: 1280, h: 800 },
  cam: { x: 0, y: 0, view: { x: 0, y: 0, w: 1280, h: 800 } },
  keys: {},
  mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
  sfx,
  addWanted: (n, reason) => addWanted(G, n, reason),
  addParticles: (x, y, n, color) => addParticles(x, y, n, color),
  saveGame: () => saveGame(),
};

function addParticles(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = G.rng() * Math.PI * 2;
    const sp = 60 + G.rng() * 180;
    G.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + G.rng() * 0.4, max: 0.8,
      color, size: 2 + G.rng() * 3,
    });
  }
}

// --- Save / load ------------------------------------------------------------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.player.cash,
      missionsDone: G.player.missionsDone,
      wanted: G.player.wanted,
    }));
  } catch (e) { /* private mode: saving is best-effort */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// --- Setup ------------------------------------------------------------------
function newGame(fromSave) {
  G.world = buildWorld(20261124);
  G.player = makePlayer(SPAWN.x, SPAWN.y);
  G.cars = spawnTraffic(G.world, G.rng, 26);
  G.peds = spawnPeds(G.rng, 46);
  G.cops = [];
  G.footCops = [];
  G.gangsters = [];
  G.bullets = [];
  G.particles = [];
  G.mission = null;
  G.pendingMission = null;
  G.pendingTimer = 0;
  G.storyDone = false;
  G.time = 0;
  G.hudMessage = '';
  G.hudTimer = 0;
  G.wantedTimer = 0;
  if (fromSave) {
    G.player.cash = fromSave.cash || 0;
    G.player.missionsDone = fromSave.missionsDone || [];
    const next = G.player.missionsDone.length;
    if (next < MISSIONS.length) G.pendingMission = next;
    else G.storyDone = true;
  } else {
    G.pendingMission = 0;
    G.pendingTimer = 1.2;
  }
  G.state = 'playing';
  G.cam.x = G.player.x - G.view.w / 2;
  G.cam.y = G.player.y - G.view.h / 2;
}

// --- Input ------------------------------------------------------------------
const input = {
  get up() { return G.keys['KeyW'] || G.keys['ArrowUp']; },
  get down() { return G.keys['KeyS'] || G.keys['ArrowDown']; },
  get left() { return G.keys['KeyA'] || G.keys['ArrowLeft']; },
  get right() { return G.keys['KeyD'] || G.keys['ArrowRight']; },
  get handbrake() { return G.keys['Space']; },
};

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  G.keys[e.code] = true;
  sfx.initAudio();
  if (e.code === 'KeyM') sfx.setMuted(!sfx.isMuted());
  if (e.code === 'KeyP' && (G.state === 'playing' || G.state === 'paused')) {
    G.state = G.state === 'playing' ? 'paused' : 'playing';
  }
  if (e.code === 'KeyR' && G.state === 'paused') newGame(null);
  if (e.code === 'KeyE' && G.state === 'playing') tryEnterCar(G);
});
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  G.mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  G.mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', (e) => {
  sfx.initAudio();
  G.mouse.down = true;
  if (G.state === 'title') {
    const W = G.view.w, H = G.view.h;
    const mx = G.mouse.x, my = G.mouse.y;
    if (mx >= W / 2 - 130 && mx <= W / 2 + 130 && my >= H * 0.56 && my <= H * 0.56 + 56) {
      sfx.sfxClick();
      newGame(loadSave());
      return;
    }
    if (mx >= W / 2 - 130 && mx <= W / 2 + 130 && my >= H * 0.56 + 72 && my <= H * 0.56 + 128) {
      sfx.sfxClick();
      G.showHelp = !G.showHelp;
      return;
    }
    return;
  }
  if (G.state === 'busted') {
    G.player.cash = Math.max(0, G.player.cash - 200);
    G.player.wanted = 0;
    G.cops = [];
    G.footCops = [];
    G.player.health = 100;
    G.player.x = SPAWN.x; G.player.y = SPAWN.y;
    G.state = 'playing';
    saveGame();
    return;
  }
  if (G.state === 'gameover') {
    newGame(null);
    return;
  }
  if (G.state === 'playing') playerShoot(G);
});
window.addEventListener('mouseup', () => { G.mouse.down = false; });
window.addEventListener('blur', () => { G.keys = {}; });

// --- Camera -----------------------------------------------------------------
function updateCamera(dt) {
  const p = G.player;
  const tx = clamp(p.x - G.view.w / 2, 0, WORLD_SIZE - G.view.w);
  const ty = clamp(p.y - G.view.h / 2, 0, WORLD_SIZE - G.view.h);
  G.cam.x += (tx - G.cam.x) * Math.min(1, 5 * dt);
  G.cam.y += (ty - G.cam.y) * Math.min(1, 5 * dt);
  const shx = (G.rng() - 0.5) * G.shake;
  const shy = (G.rng() - 0.5) * G.shake;
  G.cam.view = {
    x: G.cam.x + shx, y: G.cam.y + shy,
    w: G.view.w, h: G.view.h,
  };
  G.mouse.worldX = G.mouse.x + G.cam.view.x;
  G.mouse.worldY = G.mouse.y + G.cam.view.y;
  G.shake = Math.max(0, G.shake - 30 * dt);
}

// --- Update -----------------------------------------------------------------
function update(dt) {
  G.time += dt * 1000;
  // A new toast message gets a fresh 4s timer; an old one fades out.
  if (G.hudMessage !== G._lastHud) {
    G._lastHud = G.hudMessage;
    G.hudTimer = 4;
  }
  G.hudTimer = Math.max(0, G.hudTimer - dt);
  if (G.hudTimer <= 0) G.hudMessage = '';
  G.muzzle = Math.max(0, G.muzzle - dt);
  setMuzzle(G.muzzle);
  const p = G.player;

  // A pending mission starts a few seconds after the last one ends.
  if (G.pendingMission != null) {
    G.pendingTimer -= dt;
    if (G.pendingTimer <= 0) {
      const idx = G.pendingMission;
      G.pendingMission = null;
      startMission(G, idx);
    }
  }

  // Player movement / driving.
  if (p.inCar && p.car) {
    drivePlayerCar(G, p.car, input, dt);
    p.x = p.car.x; p.y = p.car.y;
    if (collideBuildings(G.world, p.car)) {
      if (Math.abs(p.car.speed) > 140) {
        G.sfx.crash();
        G.shake = Math.min(14, G.shake + 7);
        G.addParticles(p.car.x, p.car.y, 10, '#ffb84d');
        p.car.health -= 5;
      }
      p.car.speed *= 0.45;
    }
    // Car-car collisions.
    for (const other of G.cars) {
      if (other === p.car || other.player) continue;
      if (carHitsCar(p.car, other)) {
        const push = Math.atan2(other.y - p.car.y, other.x - p.car.x);
        other.x += Math.cos(push) * 14;
        other.y += Math.sin(push) * 14;
        if (Math.abs(p.car.speed) > 120) {
          G.sfx.crash();
          G.shake = Math.min(12, G.shake + 5);
          p.car.health -= 4;
          other.health -= 8;
        }
        p.car.speed *= 0.7;
        other.speed *= 0.5;
      }
    }
    // A wrecked car strands the player.
    if (p.car.health <= 0) {
      G.addParticles(p.car.x, p.car.y, 26, '#ff8c42');
      G.sfx.crash();
      G.hudMessage = 'Your car is wrecked. Get out and find another.';
      p.car.cruise = 0;
      p.car.speed = 0;
      const wreck = p.car;
      p.inCar = false;
      p.car = null;
      p.x = wreck.x + 40; p.y = wreck.y + 40;
      G.cars = G.cars.filter(c => c !== wreck);
    }
    sfx.setEngine(clamp(Math.abs(p.car.speed) / p.car.top, 0, 1), true);
  } else {
    updatePlayerOnFoot(G, input, dt);
    if (G.mouse.down) playerShoot(G);
    sfx.setEngine(0, false);
  }

  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt);
  updateGangsters(G, dt);
  updateBullets(G, dt);
  updateMission(G, dt);
  sfx.updateSiren(G.time, p.wanted);

  // Particles.
  for (const pt of G.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  G.particles = G.particles.filter(pt => pt.life > 0);

  // Keep traffic topped up near the player.
  if (G.cars.filter(c => !c.player && c.cruise > 0).length < 20) {
    const extra = spawnTraffic(G.world, G.rng, 4);
    G.cars.push(...extra);
  }
  // Keep the streets populated.
  if (G.peds.length < 30) {
    G.peds.push(...spawnPeds(G.rng, 6));
  }

  updateCamera(dt);
}

// --- Render -----------------------------------------------------------------
function render() {
  const v = G.cam.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, G.view.w, G.view.h);
  if (G.state === 'title') {
    drawTitle(ctx, G);
    if (G.showHelp) {
      ctx.fillStyle = 'rgba(8,12,24,0.9)';
      ctx.beginPath(); ctx.roundRect(G.view.w / 2 - 300, G.view.h / 2 - 150, 600, 300, 12); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'left';
      const lines = [
        'HOW TO PLAY',
        '',
        'WASD / arrows — walk or drive. Mouse — aim. Click — shoot.',
        'E — enter a car, or steal one (the driver runs, the cops notice).',
        'Space — handbrake. P — pause. M — mute. R — restart (when paused).',
        '',
        'Follow the gold marker: Marla Voss has four jobs for you.',
        'Stars mean heat: more stars, more NBPD. Break line of sight',
        'and stay hidden to cool off. Getting busted costs $200.',
        '',
        'Progress saves automatically in this browser.',
      ];
      lines.forEach((ln, i) => ctx.fillText(ln, G.view.w / 2 - 280, G.view.h / 2 - 120 + i * 22));
      ctx.textAlign = 'left';
    }
    return;
  }
  ctx.save();
  ctx.translate(-v.x, -v.y);
  drawWorld(ctx, G.world, G.cam, G.time);
  drawMarker(ctx, G, G.time);
  // Parked + traffic cars, then the player car on top.
  for (const c of G.cars) if (!c.player) drawCar(ctx, c);
  drawCops(ctx, G, G.time);
  for (const p of G.peds) drawPed(ctx, p);
  for (const e of G.gangsters) {
    if (e.health > 0) drawPed(ctx, e);
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (G.player.inCar && G.player.car) drawCar(ctx, G.player.car);
  drawPlayer(ctx, G.player, G.time);
  drawBullets(ctx, G);
  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Wanted flash at the screen edge when the heat is high.
  if (G.player.wanted >= 3) {
    const a = 0.10 + Math.sin(G.time * 0.006) * 0.06;
    ctx.fillStyle = 'rgba(255,40,40,' + a.toFixed(3) + ')';
    ctx.fillRect(v.x, v.y, G.view.w, 26);
    ctx.fillRect(v.x, v.y + G.view.h - 26, G.view.w, 26);
    ctx.fillRect(v.x, v.y, 26, G.view.h);
    ctx.fillRect(v.x + G.view.w - 26, v.y, 26, G.view.h);
  }
  ctx.restore();
  drawHud(ctx, G);
  if (G.state === 'paused') drawPause(ctx, G);
  if (G.state === 'busted') drawBusted(ctx, G);
  if (G.state === 'gameover') drawGameOver(ctx, G);
}

// --- Screenshot staging -----------------------------------------------------
// ?shot=start|foot|chase|mission&seed=N renders a fixed, lively scene with
// no input needed, so the screenshots are reproducible.
function applyShot() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return;
  const seed = parseInt(q.get('seed') || '7', 10);
  G.rng = makeRng(seed);
  if (shot === 'start') {
    G.state = 'title';
    return;
  }
  newGame(null);
  // Staging picks the mission explicitly; the pending auto-start from
  // newGame must not fire later and replace it.
  G.pendingMission = null;
  if (shot === 'foot') {
    // On foot downtown, mid-mission, traffic and peds all around.
    G.player.x = 1400; G.player.y = 1400;
    startMission(G, 0);
    G.cam.x = G.player.x - G.view.w / 2;
    G.cam.y = G.player.y - G.view.h / 2;
  } else if (shot === 'chase') {
    // Behind the wheel of a sports car, 3 stars, NBPD in pursuit.
    const car = makeCar(G.rng, 1800, 1800, 'sport');
    car.color = '#ff5ea8';
    car.player = true;
    car.cruise = 0;
    G.cars.push(car);
    G.player.inCar = true;
    G.player.car = car;
    G.player.x = car.x; G.player.y = car.y;
    G.player.cash = 2400;
    G.player.missionsDone = ['hot-wheels'];
    startMission(G, 1);
    G.mission.briefTimer = 0;
    G.mission.step = 1;
    G.mission.marker = { ...LOC.motel };
    G.mission.objective = 'Drop the courier at the Sunset Motel. Lose the cops if you can.';
    G.player.wanted = 3;
    for (let i = 0; i < 3; i++) {
      const cop = makeCar(G.rng, 1800 - 160 - i * 90, 1800 + (i % 2 ? 40 : -40), 'cop');
      cop.cop = true;
      cop.speed = 200;
      cop.angle = 0;
      G.cops.push(cop);
    }
    car.speed = 190;
    car.angle = 0;
    G.cam.x = G.player.x - G.view.w / 2;
    G.cam.y = G.player.y - G.view.h / 2;
  } else if (shot === 'mission') {
    // On foot at the cannery, gangsters visible, mission objective live.
    G.player.x = LOC.cannery.x - 260;
    G.player.y = LOC.cannery.y + 120;
    G.player.wanted = 1;
    G.player.cash = 1250;
    G.player.missionsDone = ['hot-wheels', 'the-pickup'];
    startMission(G, 2);
    G.mission.briefTimer = 0;
    G.cam.x = G.player.x - G.view.w / 2;
    G.cam.y = G.player.y - G.view.h / 2;
  }
}

// --- Boot -------------------------------------------------------------------
function resize() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
  canvas.style.width = Math.floor(1280 * scale) + 'px';
  canvas.style.height = Math.floor(800 * scale) + 'px';
  G.view.w = 1280;
  G.view.h = 800;
}
window.addEventListener('resize', resize);
resize();

G.saveExists = !!loadSave();
G.world = buildWorld(20261124);
G.player = makePlayer(SPAWN.x, SPAWN.y);
G.cars = spawnTraffic(G.world, G.rng, 26);
G.peds = spawnPeds(G.rng, 46);
G.cam.x = G.player.x - G.view.w / 2;
G.cam.y = G.player.y - G.view.h / 2;
G.cam.view = { x: G.cam.x, y: G.cam.y, w: 1280, h: 800 };

// Debug/testing handle: lets automated play-tests read the live state.
// Harmless in normal play; the game never reads it back.
window.__neonBay = G;

applyShot();

let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (G.state === 'playing') update(dt);
  else if (G.state === 'title') { G.time += dt * 1000; updateCamera(dt); }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
