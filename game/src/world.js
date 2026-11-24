// world.js — Neon Bay itself: the street grid, buildings, parks, beach and
// water, plus the queries (is this point on a road? inside a building?) and
// the renderer that draws it all under the camera.

import { makeRng, pick, randInt, randRange, inRect, clamp } from './util.js';

export const WORLD_SIZE = 3600;
export const ROAD_W = 72;
// Road centre lines: a 9x9 grid, 400 apart, starting at 200.
export const ROAD_LINES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];

// Pastel sun-soaked palettes for the buildings, one per block.
const PALETTES = [
  ['#f2b8c6', '#f7d6a0', '#a8d8c8', '#f9f1de'],
  ['#c9d6f2', '#f2c9a0', '#e8a8b8', '#b8d8a8'],
  ['#ffd9a0', '#a0c8e8', '#f2a8a8', '#d8c8f2'],
  ['#b8e0d2', '#f7c8a0', '#e8e8a0', '#c8b8e8'],
];

export function buildWorld(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  // Two park blocks, picked from interior blocks.
  const parkBlocks = new Set();
  while (parkBlocks.size < 2) {
    parkBlocks.add(randInt(rng, 1, 7) * 10 + randInt(rng, 1, 7));
  }
  for (let bx = 0; bx < 8; bx++) {
    for (let by = 0; by < 8; by++) {
      const x0 = ROAD_LINES[bx] + ROAD_W / 2 + 14;
      const y0 = ROAD_LINES[by] + ROAD_W / 2 + 14;
      const bw = 400 - ROAD_W - 28;
      const bh = 400 - ROAD_W - 28;
      if (parkBlocks.has(bx * 10 + by)) {
        parks.push({ x: x0, y: y0, w: bw, h: bh });
        for (let t = 0; t < 14; t++) {
          trees.push({
            x: x0 + randRange(rng, 20, bw - 20),
            y: y0 + randRange(rng, 20, bh - 20),
            r: randRange(rng, 10, 18),
          });
        }
        continue;
      }
      const palette = pick(rng, PALETTES);
      const cols = randInt(rng, 1, 2);
      const rows = randInt(rng, 1, 2);
      const cw = bw / cols, ch = bh / rows;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (rng() < 0.12) continue; // empty lot / plaza
          const w = cw - randRange(rng, 14, 40);
          const h = ch - randRange(rng, 14, 40);
          const x = x0 + i * cw + (cw - w) / 2;
          const y = y0 + j * ch + (ch - h) / 2;
          buildings.push({
            x, y, w, h,
            color: pick(rng, palette),
            roof: pick(rng, ['#5a6b7a', '#7a5a4a', '#4a5a6b', '#6b7a5a']),
            neon: rng() < 0.35,
            neonColor: pick(rng, ['#ff5ea8', '#3ae0ff', '#ffe14d', '#7dff6a']),
            floors: randInt(rng, 2, 6),
            tall: rng() < 0.18,
          });
        }
      }
      // Street trees along the block edge.
      for (let t = 0; t < 3; t++) {
        trees.push({
          x: x0 + randRange(rng, 0, bw),
          y: y0 - 8,
          r: randRange(rng, 8, 13),
        });
      }
    }
  }
  // Beach strip on the east edge + the bay itself.
  return {
    size: WORLD_SIZE,
    buildings,
    trees,
    parks,
    beachX: 3400 + ROAD_W / 2,
    waterX: 3520,
    rngSeed: seed,
  };
}

export function isOnRoad(x, y) {
  for (const l of ROAD_LINES) {
    if (Math.abs(x - l) <= ROAD_W / 2 || Math.abs(y - l) <= ROAD_W / 2) return true;
  }
  return false;
}

// Nearest road centre line to a point on one axis.
export function nearestLine(v) {
  let best = ROAD_LINES[0], bd = Infinity;
  for (const l of ROAD_LINES) {
    const d = Math.abs(v - l);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

export function buildingAt(world, x, y) {
  for (const b of world.buildings) {
    if (inRect(x, y, b)) return b;
  }
  return null;
}

// Random point on a road (for spawning traffic, cops, pickups).
export function randomRoadPoint(rng, margin = 120) {
  const vertical = rng() < 0.5;
  const line = pick(rng, ROAD_LINES);
  const along = randRange(rng, margin, WORLD_SIZE - margin);
  return vertical ? { x: line, y: along } : { x: along, y: line };
}

export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 12);
  if (rng() < 0.5) p.x += off; else p.y += off;
  return p;
}

// ---- Rendering -------------------------------------------------------------

export function drawWorld(ctx, world, cam, time) {
  const { x: vx, y: vy, w: vw, h: vh } = cam.view;
  // Ground.
  ctx.fillStyle = '#8fae7e';
  ctx.fillRect(vx, vy, vw, vh);
  // Beach sand, then the bay with animated waves.
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(Math.max(vx, world.beachX), vy, Math.max(0, world.waterX - Math.max(vx, world.beachX)), vh);
  const waveGrad = ctx.createLinearGradient(world.waterX, 0, WORLD_SIZE, 0);
  waveGrad.addColorStop(0, '#2fa8c8');
  waveGrad.addColorStop(1, '#1668a8');
  ctx.fillStyle = waveGrad;
  ctx.fillRect(Math.max(vx, world.waterX), vy, WORLD_SIZE - Math.max(vx, world.waterX), vh);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const wx = world.waterX + 14 + i * 16 + Math.sin(time * 0.001 + i * 1.7) * 4;
    ctx.beginPath();
    ctx.moveTo(wx, vy);
    ctx.lineTo(wx, vy + vh);
    ctx.stroke();
  }
  // Parks.
  for (const p of world.parks) {
    if (p.x > vx + vw || p.y > vy + vh || p.x + p.w < vx || p.y + p.h < vy) continue;
    ctx.fillStyle = '#5da864';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(p.x + p.w / 2 - 6, p.y, 12, p.h);
    ctx.fillRect(p.x, p.y + p.h / 2 - 6, p.w, 12);
  }
  // Roads: asphalt, sidewalk border, centre dashes.
  ctx.fillStyle = '#333947';
  for (const l of ROAD_LINES) {
    ctx.fillRect(vx, l - ROAD_W / 2, vw, ROAD_W);
    ctx.fillRect(l - ROAD_W / 2, vy, ROAD_W, vh);
  }
  ctx.fillStyle = '#4a5160';
  for (const l of ROAD_LINES) {
    ctx.fillRect(vx, l - ROAD_W / 2, vw, 6);
    ctx.fillRect(vx, l + ROAD_W / 2 - 6, vw, 6);
    ctx.fillRect(l - ROAD_W / 2, vy, 6, vh);
    ctx.fillRect(l + ROAD_W / 2 - 6, vy, 6, vh);
  }
  ctx.strokeStyle = '#e8c84d';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  for (const l of ROAD_LINES) {
    ctx.moveTo(vx, l); ctx.lineTo(vx + vw, l);
    ctx.moveTo(l, vy); ctx.lineTo(l, vy + vh);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const lx of ROAD_LINES) {
    for (const ly of ROAD_LINES) {
      if (lx < vx - 60 || lx > vx + vw + 60 || ly < vy - 60 || ly > vy + vh + 60) continue;
      for (let s = -3; s <= 3; s++) {
        ctx.fillRect(lx + s * 10 - 3, ly - ROAD_W / 2 + 4, 6, 12);
        ctx.fillRect(lx + s * 10 - 3, ly + ROAD_W / 2 - 16, 6, 12);
      }
    }
  }
  // Buildings, with windows, roof detail and the odd neon sign.
  for (const b of world.buildings) {
    if (b.x > vx + vw || b.y > vy + vh || b.x + b.w < vx || b.y + b.h < vy) continue;
    const lift = b.tall ? 10 : 5;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + lift, b.y + lift, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Windows.
    ctx.fillStyle = 'rgba(30,50,80,0.75)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 12, 14);
      }
    }
    if (b.neon) {
      ctx.fillStyle = b.neonColor;
      ctx.shadowColor = b.neonColor;
      ctx.shadowBlur = 12;
      ctx.fillRect(b.x + b.w / 2 - 22, b.y - 4, 44, 7);
      ctx.shadowBlur = 0;
    }
  }
  // Trees.
  for (const t of world.trees) {
    if (t.x < vx - 30 || t.x > vx + vw + 30 || t.y < vy - 30 || t.y > vy + vh + 30) continue;
    ctx.fillStyle = '#3f7a3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6abe5a';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  // World edge fence on the west/north/south, the bay on the east.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
}
