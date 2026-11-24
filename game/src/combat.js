// combat.js — shooting: the player's pistol, gang members who shoot back,
// bullets, muzzle flashes and the particles that sell every hit.

import { clamp, dist } from './util.js';
import { buildingAt } from './world.js';
import { scarePeds } from './pedestrians.js';

export function playerShoot(G) {
  const p = G.player;
  if (p.shootCooldown > 0 || p.inCar) return;
  p.shootCooldown = 0.28;
  const mx = G.mouse.worldX, my = G.mouse.worldY;
  const ang = Math.atan2(my - p.y, mx - p.x);
  p.aimAngle = ang;
  G.bullets.push({
    x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18,
    vx: Math.cos(ang) * 720, vy: Math.sin(ang) * 720,
    fromPlayer: true, damage: 34, life: 0.7,
  });
  G.muzzle = 0.06;
  G.shake = Math.min(8, G.shake + 1.5);
  G.sfx.gunshot();
  scarePeds(G, p.x, p.y, 420);
  if (p.wanted < 1) G.addWanted(1, 'firing a weapon');
}

export function enemyShoot(G, e) {
  const p = G.player;
  const ang = Math.atan2(p.y - e.y, p.x - e.x);
  G.bullets.push({
    x: e.x + Math.cos(ang) * 16, y: e.y + Math.sin(ang) * 16,
    vx: Math.cos(ang) * 620, vy: Math.sin(ang) * 620,
    fromPlayer: false, damage: 9, life: 0.8,
  });
  e.shootCooldown = 0.9 + G.rng() * 0.7;
  G.sfx.gunshot();
}

// Gang members: hostile NPCs used by missions. They stand their ground,
// strafe a little and shoot at the player when close.
export function makeGangster(G, x, y) {
  return {
    x, y, angle: 0, health: 100,
    shirt: '#8a2a2a', pants: '#2a2f3a', skin: '#d8a878',
    hair: '#20242e', walkPhase: 0, fleeing: 0, scared: false,
    shootCooldown: 0.5 + G.rng(), strafe: G.rng() * Math.PI * 2,
    gang: true,
  };
}

export function updateGangsters(G, dt) {
  const p = G.player;
  for (const e of G.gangsters) {
    if (e.health <= 0) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    e.strafe += dt;
    const wantAngle = Math.atan2(p.y - e.y, p.x - e.x);
    e.angle = wantAngle;
    e.walkPhase += dt * 6;
    if (d < 420 && d > 120) {
      // Close the distance, strafing sideways.
      e.x += Math.cos(wantAngle) * 70 * dt + Math.cos(wantAngle + Math.PI / 2) * Math.sin(e.strafe) * 40 * dt;
      e.y += Math.sin(wantAngle) * 70 * dt + Math.sin(wantAngle + Math.PI / 2) * Math.sin(e.strafe) * 40 * dt;
    }
    e.shootCooldown -= dt;
    if (d < 460 && e.shootCooldown <= 0 && !p.dead) {
      enemyShoot(G, e);
    }
  }
  G.gangsters = G.gangsters.filter(e => e.health > 0 || e.deathTimer > 0);
  for (const e of G.gangsters) {
    if (e.health <= 0) e.deathTimer = (e.deathTimer || 0.4) - dt;
  }
  G.gangsters = G.gangsters.filter(e => e.health > 0 || (e.deathTimer || 0) > 0);
}

export function updateBullets(G, dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    // Buildings stop bullets.
    if (buildingAt(G.world, b.x, b.y)) {
      b.life = 0;
      G.addParticles(b.x, b.y, 4, '#c8c8c8');
      continue;
    }
    if (b.fromPlayer) {
      // Hit a gangster?
      for (const e of G.gangsters) {
        if (e.health > 0 && dist(b.x, b.y, e.x, e.y) < 16) {
          e.health -= b.damage;
          b.life = 0;
          G.addParticles(b.x, b.y, 6, '#ff5a5a');
          if (e.health <= 0) {
            G.addParticles(e.x, e.y, 14, '#ff5a5a');
            G.hudMessage = 'Gangster down.';
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit a foot cop? That is a very bad idea.
      for (const f of G.footCops) {
        if (f.health > 0 && dist(b.x, b.y, f.x, f.y) < 16) {
          f.health -= b.damage;
          b.life = 0;
          G.addWanted(2, 'shooting a cop');
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit a car? It takes damage and may smoke.
      for (const c of G.cars) {
        if (dist(b.x, b.y, c.x, c.y) < 24) {
          c.health -= b.damage;
          b.life = 0;
          G.addParticles(b.x, b.y, 5, '#ffb84d');
          if (c.health <= 0) {
            G.addParticles(c.x, c.y, 20, '#ff8c42');
            G.sfx.crash();
            c.health = 0;
            c.cruise = 0;
            c.speed = 0;
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      // Hit a pedestrian? The city remembers.
      for (const p of G.peds) {
        if (dist(b.x, b.y, p.x, p.y) < 14) {
          b.life = 0;
          G.addParticles(b.x, b.y, 6, '#ff5a5a');
          G.addWanted(1, 'hitting a pedestrian');
          scarePeds(G, p.x, p.y, 300);
          p.fleeing = 4;
          break;
        }
      }
    } else {
      // Enemy bullet: the player, or the player's car.
      const p = G.player;
      if (p.inCar && p.car) {
        if (dist(b.x, b.y, p.car.x, p.car.y) < 26) {
          p.car.health -= b.damage;
          b.life = 0;
          G.addParticles(b.x, b.y, 4, '#ffb84d');
        }
      } else if (dist(b.x, b.y, p.x, p.y) < 14) {
        p.health -= b.damage;
        b.life = 0;
        G.addParticles(b.x, b.y, 5, '#ff5a5a');
        G.shake = Math.min(10, G.shake + 3);
        if (p.health <= 0) {
          p.dead = true;
          G.state = 'gameover';
          G.sfx.busted();
        }
      }
    }
  }
  G.bullets = G.bullets.filter(b => b.life > 0);
}

export function drawBullets(ctx, G) {
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
