// vehicles.js — every car in Neon Bay: traffic that follows the street grid,
// parked cars waiting to be stolen, and the player car's arcade physics.
// A car is a plain object: {x, y, angle, speed, color, type, ...}.

import { makeRng, pick, randRange, clamp, angleDiff, dist } from './util.js';
import { ROAD_LINES, ROAD_W, nearestLine, randomRoadPoint, buildingAt } from './world.js';

export const CAR_COLORS = ['#e84d4d', '#3a86d8', '#f2c14e', '#7ec850', '#c86fd8', '#e8e8e8', '#3a3a3a', '#ff8c42'];
export const CAR_TYPES = {
  sedan: { len: 46, wid: 22, top: 150, accel: 260 },
  taxi: { len: 46, wid: 22, top: 165, accel: 280 },
  sport: { len: 48, wid: 22, top: 230, accel: 380 },
  van: { len: 56, wid: 26, top: 125, accel: 200 },
  pickup: { len: 52, wid: 24, top: 160, accel: 250 },
  cop: { len: 48, wid: 22, top: 240, accel: 360 },
};

export function makeCar(rng, x, y, type) {
  const t = type || pick(rng, ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'sport']);
  const spec = CAR_TYPES[t];
  return {
    x, y,
    angle: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    speed: 0,
    type: t,
    color: t === 'taxi' ? '#f2c14e' : t === 'cop' ? '#20242e' : pick(rng, CAR_COLORS),
    len: spec.len, wid: spec.wid, top: spec.top, accel: spec.accel,
    // Traffic AI: which axis it drives on and which way.
    axis: rng() < 0.5 ? 'x' : 'y',
    dir: rng() < 0.5 ? 1 : -1,
    lane: (rng() < 0.5 ? -1 : 1) * 16,
    cruise: randRange(rng, 110, 175),
    // Player car state.
    player: false,
    driver: true, // a driver is inside (stealing it is a crime)
    health: 100,
    brakeLight: false,
  };
}

// Spawn traffic cars spread over the grid, plus parked cars on side streets.
export function spawnTraffic(world, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(rng, 200);
    const car = makeCar(rng, p.x, p.y);
    car.speed = car.cruise * randRange(rng, 0.7, 1);
    cars.push(car);
  }
  // Parked cars, hugging the curb just off the road.
  for (let i = 0; i < 14; i++) {
    const p = randomRoadPoint(rng, 200);
    const car = makeCar(rng, p.x, p.y);
    car.axis = rng() < 0.5 ? 'x' : 'y';
    car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = 0;
    car.cruise = 0;
    car.driver = rng() < 0.5;
    // Nudge onto the curb lane.
    if (car.axis === 'x') car.y = nearestLine(p.y) + car.lane; else car.x = nearestLine(p.x) + car.lane;
    cars.push(car);
  }
  return cars;
}

// --- Collision helpers ------------------------------------------------------

// Push a car out of buildings; returns true on a hard hit.
export function collideBuildings(world, car) {
  let hit = false;
  const r = car.len / 2;
  for (const b of world.buildings) {
    if (car.x + r < b.x || car.x - r > b.x + b.w || car.y + r < b.y || car.y - r > b.y + b.h) continue;
    // Resolve along the smallest penetration axis.
    const dxl = car.x + r - b.x, dxr = b.x + b.w - (car.x - r);
    const dyt = car.y + r - b.y, dyb = b.y + b.h - (car.y - r);
    const m = Math.min(dxl, dxr, dyt, dyb);
    if (m === dxl) car.x = b.x - r;
    else if (m === dxr) car.x = b.x + b.w + r;
    else if (m === dyt) car.y = b.y - r;
    else car.y = b.y + b.h + r;
    hit = true;
  }
  return hit;
}

export function carHitsCar(a, b) {
  const rr = (a.len + b.len) / 2 - 8;
  return dist(a.x, a.y, b.x, b.y) < rr * 0.8;
}

// --- Player driving ---------------------------------------------------------

export function drivePlayerCar(G, car, input, dt) {
  const fwd = Math.cos(car.angle), rgt = Math.sin(car.angle);
  const speedAlong = car.speed;
  const throttle = (input.up ? 1 : 0) - (input.down ? 0.55 : 0);
  car.speed = clamp(car.speed + throttle * car.accel * dt, -90, car.top);
  if (!input.up && !input.down) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 520 * dt);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const steerAuthority = clamp(Math.abs(car.speed) / 120, 0, 1);
  car.angle += steer * 2.1 * steerAuthority * dt * (car.speed >= 0 ? 1 : -1) * (input.handbrake ? 1.5 : 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 30, G.world.size - 30);
  car.y = clamp(car.y, 30, G.world.size - 30);
  car.brakeLight = input.down || input.handbrake;
  return { fwd, rgt, speedAlong };
}

// --- Traffic AI -------------------------------------------------------------

export function updateTraffic(G, dt) {
  const world = G.world;
  for (const car of G.cars) {
    if (car.player) continue;
    if (car.cruise <= 0) continue; // parked
    // At an intersection, sometimes turn onto the crossing street.
    const onX = Math.abs(car.y - nearestLine(car.y)) < 4;
    const onY = Math.abs(car.x - nearestLine(car.x)) < 4;
    if ((car.axis === 'x' && onX && Math.abs(car.x - nearestLine(car.x)) < 4) ||
        (car.axis === 'y' && onY && Math.abs(car.y - nearestLine(car.y)) < 4)) {
      if (G.rng() < 0.012) {
        car.axis = car.axis === 'x' ? 'y' : 'x';
        car.dir = G.rng() < 0.5 ? 1 : -1;
        car.lane = (G.rng() < 0.5 ? -1 : 1) * 16;
      }
    }
    // Slow down for the car ahead on the same lane.
    let target = car.cruise;
    for (const other of G.cars) {
      if (other === car || other.cruise <= 0 && !other.player) continue;
      if (car.axis === 'x' && Math.abs(other.y - car.y) < 26) {
        const ahead = (other.x - car.x) * car.dir;
        if (ahead > 0 && ahead < 90) target = Math.min(target, other.speed * 0.9);
      }
      if (car.axis === 'y' && Math.abs(other.x - car.x) < 26) {
        const ahead = (other.y - car.y) * car.dir;
        if (ahead > 0 && ahead < 90) target = Math.min(target, other.speed * 0.9);
      }
    }
    // Fleeing peds / a speeding player car ahead makes traffic brake.
    car.speed += clamp(target - car.speed, -260 * dt, 180 * dt);
    const targetAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.angle += angleDiff(car.angle, targetAngle) * Math.min(1, 6 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Stay on the road: snap the off-axis coordinate to its lane.
    if (car.axis === 'x') car.y = nearestLine(car.y) + car.lane * (car.dir > 0 ? 1 : -1) * 0 + car.lane;
    else car.x = nearestLine(car.x) + car.lane;
    // Wrap around the world edge so traffic never runs out.
    if (car.x < 60) car.x = G.world.size - 80;
    if (car.x > G.world.size - 60) car.x = 80;
    if (car.y < 60) car.y = G.world.size - 80;
    if (car.y > G.world.size - 60) car.y = 80;
  }
}

// --- Drawing ----------------------------------------------------------------

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-car.len / 2 + 3, -car.wid / 2 + 3, car.len, car.wid);
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.len / 2, -car.wid / 2, car.len, car.wid, 7);
  ctx.fill();
  // Windshield + roof.
  ctx.fillStyle = 'rgba(20,40,70,0.85)';
  ctx.fillRect(car.len * 0.12, -car.wid / 2 + 3, car.len * 0.2, car.wid - 6);
  ctx.fillStyle = car.type === 'cop' ? '#e8e8e8' : 'rgba(0,0,0,0.25)';
  ctx.fillRect(-car.len * 0.12, -car.wid / 2 + 4, car.len * 0.24, car.wid - 8);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(car.len / 2 - 3, -car.wid / 2 + 2, 3, 5);
  ctx.fillRect(car.len / 2 - 3, car.wid / 2 - 7, 3, 5);
  if (car.brakeLight) {
    ctx.fillStyle = '#ff2d2d';
    ctx.fillRect(-car.len / 2, -car.wid / 2 + 2, 3, 5);
    ctx.fillRect(-car.len / 2, car.wid / 2 - 7, 3, 5);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242e';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.type === 'cop') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NBPD', 0, 3);
  }
  ctx.restore();
}

export function drawCopLights(ctx, car, time) {
  // Flashing red/blue light bar above a police car.
  const on = Math.floor(time / 180) % 2 === 0;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = on ? '#ff2d2d' : '#2d6bff';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(-4, -car.wid / 2 - 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = on ? '#2d6bff' : '#ff2d2d';
  ctx.shadowColor = ctx.fillStyle;
  ctx.beginPath(); ctx.arc(-4, car.wid / 2 + 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
