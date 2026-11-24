// pedestrians.js — the people of Neon Bay: commuters, joggers, beach walkers
// and the odd tourist, strolling the sidewalks and scattering when trouble
// starts. A ped is {x, y, angle, speed, shirt, pants, fleeing, ...}.

import { makeRng, pick, randRange, clamp, angleLerp, dist } from './util.js';
import { randomSidewalkPoint, nearestLine, ROAD_W } from './world.js';

const SHIRTS = ['#e84d4d', '#3a86d8', '#f2c14e', '#7ec850', '#c86fd8', '#e8e8e8', '#ff8c42', '#3ad8c8'];
const PANTS = ['#2a2f3a', '#4a3a2a', '#3a4a6b', '#5a5a5a'];

export function makePed(rng, x, y) {
  return {
    x, y,
    angle: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    speed: randRange(rng, 45, 75),
    shirt: pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
    skin: pick(rng, ['#f2c9a0', '#d8a878', '#a87850', '#f7d6b8']),
    hair: pick(rng, ['#20242e', '#6b4a2a', '#c8c8c8', '#e8b83a']),
    // Walking the sidewalk: which road axis and lane they follow.
    axis: rng() < 0.5 ? 'x' : 'y',
    dir: rng() < 0.5 ? 1 : -1,
    lane: (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 12),
    fleeing: 0, // seconds left of panic
    scared: false,
    walkPhase: rng() * Math.PI * 2,
  };
}

export function spawnPeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = randomSidewalkPoint(rng);
    peds.push(makePed(rng, p.x, p.y));
  }
  return peds;
}

// A gunshot, a crash or a car barrelling at them makes nearby peds panic.
export function scarePeds(G, x, y, radius) {
  for (const p of G.peds) {
    if (dist(p.x, p.y, x, y) < radius) {
      p.fleeing = 3 + G.rng() * 2;
      p.scared = true;
    }
  }
}

export function updatePeds(G, dt) {
  const player = G.player;
  for (const p of G.peds) {
    p.walkPhase += dt * (p.fleeing > 0 ? 14 : 8);
    if (p.fleeing > 0) {
      p.fleeing -= dt;
      // Run directly away from the player.
      const away = Math.atan2(p.y - player.y, p.x - player.x);
      p.angle = angleLerp(p.angle, away, Math.min(1, 8 * dt));
      p.x += Math.cos(p.angle) * 150 * dt;
      p.y += Math.sin(p.angle) * 150 * dt;
      continue;
    }
    // The player's car bearing down on the sidewalk scares them.
    if (player.inCar && player.car) {
      const d = dist(p.x, p.y, player.car.x, player.car.y);
      if (d < 70 && Math.abs(player.car.speed) > 120) {
        p.fleeing = 2.5;
        continue;
      }
    }
    // Amble along the sidewalk; turn at intersections sometimes.
    const onX = Math.abs(p.y - nearestLine(p.y)) < 6;
    const onY = Math.abs(p.x - nearestLine(p.x)) < 6;
    if ((p.axis === 'x' && onX && Math.abs(p.x - nearestLine(p.x)) < 6) ||
        (p.axis === 'y' && onY && Math.abs(p.y - nearestLine(p.y)) < 6)) {
      if (G.rng() < 0.02) {
        p.axis = p.axis === 'x' ? 'y' : 'x';
        p.dir = G.rng() < 0.5 ? 1 : -1;
        p.lane = (G.rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 12);
      }
    }
    const targetAngle = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    p.angle += (targetAngle - p.angle) * Math.min(1, 6 * dt);
    p.x += Math.cos(p.angle) * p.speed * dt;
    p.y += Math.sin(p.angle) * p.speed * dt;
    if (p.axis === 'x') p.y = nearestLine(p.y) + p.lane;
    else p.x = nearestLine(p.x) + p.lane;
    // Wrap at the world edge.
    if (p.x < 40) p.x = G.world.size - 60;
    if (p.x > G.world.size - 40) p.x = 60;
    if (p.y < 40) p.y = G.world.size - 60;
    if (p.y > G.world.size - 40) p.y = 60;
  }
}

export function drawPed(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle + Math.PI / 2);
  const bob = Math.sin(p.walkPhase) * 1.5;
  // Legs (two little steps) and body.
  ctx.fillStyle = p.pants;
  ctx.fillRect(-4, -2 + bob, 3, 10);
  ctx.fillRect(1, -2 - bob, 3, 10);
  ctx.fillStyle = p.shirt;
  ctx.fillRect(-5, -8, 10, 10);
  // Head.
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, -11, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, -12, 5, Math.PI, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (p.scared) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', p.x, p.y - 22);
  }
}
