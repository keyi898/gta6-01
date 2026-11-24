// player.js — the player character on foot: walking, entering and leaving
// cars, taking damage, and the steal-a-car crime itself.

import { clamp, dist } from './util.js';
import { buildingAt } from './world.js';
import { collideBuildings } from './vehicles.js';

export const PLAYER_SPEED = 230;

export function makePlayer(x, y) {
  return {
    x, y,
    angle: 0, // facing
    aimAngle: 0,
    speed: 0,
    health: 100,
    cash: 0,
    wanted: 0,
    inCar: false,
    car: null,
    shootCooldown: 0,
    walkPhase: 0,
    missionsDone: [],
    dead: false,
    shirt: '#3a86d8',
    pants: '#2a2f3a',
    skin: '#f2c9a0',
    hair: '#20242e',
  };
}

// The nearest stealable car within reach, if any.
export function nearestCar(G, maxDist) {
  let best = null, bd = maxDist;
  for (const c of G.cars) {
    if (c.player) continue;
    if (c.cop) continue;
    const d = dist(G.player.x, G.player.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function tryEnterCar(G) {
  const p = G.player;
  if (p.inCar) {
    // Get out: step to the side of the car.
    const car = p.car;
    car.player = false;
    p.inCar = false;
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    G.sfx.click();
    return;
  }
  const car = nearestCar(G, 64);
  if (!car) return;
  if (car.driver) {
    // Stealing an occupied car: the driver flees, the law notices.
    car.driver = false;
    G.addWanted(1, 'carjacking');
    G.hudMessage = 'Carjacked! The driver ran — and somebody called it in.';
    // The driver becomes a fleeing ped.
    G.peds.push({
      x: car.x, y: car.y, angle: car.angle, speed: 60,
      shirt: '#e8e8e8', pants: '#2a2f3a', skin: '#d8a878', hair: '#20242e',
      axis: 'x', dir: 1, lane: 0, fleeing: 4, scared: true, walkPhase: 0,
    });
  } else {
    G.hudMessage = 'You took the car.';
  }
  car.player = true;
  car.cruise = 0;
  p.inCar = true;
  p.car = car;
  p.x = car.x; p.y = car.y;
  G.sfx.click();
}

export function updatePlayerOnFoot(G, input, dt) {
  const p = G.player;
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  let mx = 0, my = 0;
  if (input.up) my -= 1;
  if (input.down) my += 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len; my /= len;
    p.x += mx * PLAYER_SPEED * dt;
    p.y += my * PLAYER_SPEED * dt;
    p.walkPhase += dt * 11;
    p.angle = Math.atan2(my, mx);
  }
  // Aim at the mouse.
  p.aimAngle = Math.atan2(G.mouse.worldY - p.y, G.mouse.worldX - p.x);
  p.x = clamp(p.x, 24, G.world.size - 24);
  p.y = clamp(p.y, 24, G.world.size - 24);
  // Buildings are solid.
  for (const b of G.world.buildings) {
    if (p.x + 12 < b.x || p.x - 12 > b.x + b.w || p.y + 12 < b.y || p.y - 12 > b.y + b.h) continue;
    const dxl = p.x + 12 - b.x, dxr = b.x + b.w - (p.x - 12);
    const dyt = p.y + 12 - b.y, dyb = b.y + b.h - (p.y - 12);
    const m = Math.min(dxl, dxr, dyt, dyb);
    if (m === dxl) p.x = b.x - 12;
    else if (m === dxr) p.x = b.x + b.w + 12;
    else if (m === dyt) p.y = b.y - 12;
    else p.y = b.y + b.h + 12;
  }
  // Slow health regen out of combat.
  if (p.health < 100 && p.wanted === 0) p.health = Math.min(100, p.health + 2 * dt);
}

export function drawPlayer(ctx, p, time) {
  if (p.inCar || p.dead) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const bob = Math.sin(p.walkPhase) * 1.5;
  // Body faces the aim direction; feet point along movement.
  ctx.rotate(p.aimAngle + Math.PI / 2);
  ctx.fillStyle = p.pants;
  ctx.fillRect(-4, -2 + bob, 3, 10);
  ctx.fillRect(1, -2 - bob, 3, 10);
  ctx.fillStyle = p.shirt;
  ctx.fillRect(-6, -9, 12, 11);
  // Pistol in hand when aiming.
  ctx.fillStyle = '#20242e';
  ctx.fillRect(4, -14, 3, 9);
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.arc(0, -12, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.hair;
  ctx.beginPath(); ctx.arc(0, -13, 5.5, Math.PI, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Muzzle flash.
  if (G_MUZZLE > 0) {
    ctx.save();
    ctx.translate(p.x + Math.cos(p.aimAngle) * 22, p.y + Math.sin(p.aimAngle) * 22);
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// Set by main.js each frame so drawPlayer can flash the muzzle.
export let G_MUZZLE = 0;
export function setMuzzle(v) { G_MUZZLE = v; }
