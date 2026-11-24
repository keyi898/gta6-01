// police.js — the Neon Bay Police Department: the wanted system, pursuit
// cars that ram the player, foot cops who try to bust them, and the heat
// that cools off when nobody can see you.

import { makeRng, clamp, angleDiff, dist, randRange } from './util.js';
import { makeCar, CAR_TYPES, drawCar, drawCopLights } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { randomRoadPoint } from './world.js';

export const WANTED_NAMES = ['', 'Suspicious', 'Pursuit', 'Man hunt', 'Lockdown', 'Full force'];

// Wanted level 0..5. Crimes add heat; hiding cools it.
export function addWanted(G, n, reason) {
  if (G.player.wanted >= 5) return;
  G.player.wanted = clamp(G.player.wanted + n, 0, 5);
  G.wantedTimer = 0;
  G.lastCrime = reason || '';
  if (G.player.wanted >= 1) G.hudMessage = 'WANTED — ' + WANTED_NAMES[G.player.wanted];
}

// How many cop cars the current wanted level fields.
export function wantedCopCount(wanted) {
  return [0, 1, 2, 3, 4, 5][wanted];
}

export function spawnCopCar(G) {
  const p = G.player;
  // Spawn on a road 500-800 away, roughly behind the player.
  let x, y, tries = 0;
  do {
    const pt = randomRoadPoint(G.rng);
    x = pt.x; y = pt.y;
    tries++;
  } while (dist(x, y, p.x, p.y) < 500 && tries < 20);
  const car = makeCar(G.rng, x, y, 'cop');
  car.driver = true;
  car.cruise = 0;
  car.cop = true;
  car.ramCooldown = 0;
  G.cops.push(car);
  return car;
}

export function spawnFootCop(G) {
  const p = G.player;
  const ang = G.rng() * Math.PI * 2;
  const x = clamp(p.x + Math.cos(ang) * 420, 60, G.world.size - 60);
  const y = clamp(p.y + Math.sin(ang) * 420, 60, G.world.size - 60);
  G.footCops.push({
    x, y, angle: 0, speed: 165,
    health: 100, arrest: 0, // seconds spent touching the player
    shirt: '#20242e', pants: '#20242e', skin: '#d8a878',
    hair: '#20242e', walkPhase: 0, fleeing: 0, scared: false, cop: true,
  });
}

// Keep the right number of pursuit units on the street for the wanted level.
export function updatePolice(G, dt) {
  const p = G.player;
  const want = wantedCopCount(p.wanted);
  // Spawn cop cars until the street has enough.
  while (G.cops.length < want) spawnCopCar(G);
  // Foot cops join the chase on foot when the player is on foot.
  if (p.wanted >= 2 && !p.inCar && G.footCops.length < p.wanted - 1) {
    spawnFootCop(G);
  }
  // Heat cools off when no unit can see the player.
  let seen = false;
  for (const c of G.cops) if (dist(c.x, c.y, p.x, p.y) < 520) seen = true;
  for (const f of G.footCops) if (dist(f.x, f.y, p.x, p.y) < 380) seen = true;
  if (!seen && p.wanted > 0) {
    G.wantedTimer += dt;
    if (G.wantedTimer > 9) {
      p.wanted -= 1;
      G.wantedTimer = 0;
      G.hudMessage = p.wanted === 0 ? 'You lost them. Heat is off.' : 'Heat dropping… ' + p.wanted + ' star' + (p.wanted > 1 ? 's' : '');
    }
  } else {
    G.wantedTimer = 0;
  }
  // Cop cars chase and ram.
  for (const c of G.cops) {
    c.ramCooldown = Math.max(0, (c.ramCooldown || 0) - dt);
    const target = p.inCar && p.car ? p.car : p;
    const wantAngle = Math.atan2(target.y - c.y, target.x - c.x);
    c.angle += angleDiff(c.angle, wantAngle) * Math.min(1, 2.6 * dt);
    const desired = clamp(dist(c.x, c.y, target.x, target.y) / 2.2, 150, c.top + 40);
    c.speed += clamp(desired - c.speed, -420 * dt, 300 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Ram: shove the player's car and hurt it.
    if (p.inCar && p.car && dist(c.x, c.y, p.car.x, p.car.y) < 46 && c.ramCooldown <= 0) {
      c.ramCooldown = 0.9;
      p.car.health -= 6;
      p.car.speed *= 0.55;
      const push = Math.atan2(p.car.y - c.y, p.car.x - c.x);
      p.car.x += Math.cos(push) * 22;
      p.car.y += Math.sin(push) * 22;
      G.shake = Math.min(14, G.shake + 6);
      G.sfx.crash();
      G.addParticles(p.car.x, p.car.y, 8, '#ffb84d');
    }
    // Cop cars also collide with buildings (they are not ghosts).
    for (const b of G.world.buildings) {
      if (c.x + 20 < b.x || c.x - 20 > b.x + b.w || c.y + 20 < b.y || c.y - 20 > b.y + b.h) continue;
      c.speed *= 0.4;
      c.angle += Math.PI / 2;
      break;
    }
  }
  // Foot cops run at the player and try to bust them.
  for (const f of G.footCops) {
    if (f.health <= 0) continue;
    const d = dist(f.x, f.y, p.x, p.y);
    const wantAngle = Math.atan2(p.y - f.y, p.x - f.x);
    f.angle += angleDiff(f.angle, wantAngle) * Math.min(1, 6 * dt);
    f.walkPhase += dt * 12;
    if (!p.inCar && d > 26) {
      f.x += Math.cos(f.angle) * f.speed * dt;
      f.y += Math.sin(f.angle) * f.speed * dt;
      f.arrest = 0;
    } else if (!p.inCar) {
      f.arrest += dt;
      if (f.arrest > 1.6) {
        G.busted = true;
        G.state = 'busted';
        G.sfx.busted();
      }
    }
  }
  // Clean up dead / far units when the heat is off.
  if (p.wanted === 0) {
    G.cops = G.cops.filter(c => dist(c.x, c.y, p.x, p.y) < 700);
    G.footCops = G.footCops.filter(f => f.health > 0 && dist(f.x, f.y, p.x, p.y) < 600);
  }
  G.cops = G.cops.filter(c => c.health > 0);
}

export function drawCops(ctx, G, time) {
  for (const c of G.cops) {
    drawCar(ctx, c);
    drawCopLights(ctx, c, time);
  }
  for (const f of G.footCops) {
    if (f.health <= 0) continue;
    drawPed(ctx, f);
    // Badge + cap.
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.fillStyle = '#e8c84d';
    ctx.fillRect(-2, -6, 4, 4);
    ctx.restore();
  }
}
