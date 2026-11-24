// util.js — small math and random helpers shared by every Neon Bay module.
// Nothing here is game-specific: pure functions so the rest of the code can
// stay short and readable.

// mulberry32: a tiny deterministic PRNG. Same seed -> same city, same traffic.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Shortest signed turn from angle a toward angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * t;
}
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}
// Point-in-rect test, used for building collision and click picking.
export function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
// Circle vs rect push-out: returns the corrected position for a circle of
// radius `rad` centred at (x, y) overlapping rect r, or null when clear.
export function circleRectResolve(x, y, rad, r) {
  const cx = clamp(x, r.x, r.x + r.w);
  const cy = clamp(y, r.y, r.y + r.h);
  const dx = x - cx, dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rad * rad) return null;
  if (d2 === 0) return { x: r.x - rad, y };
  const d = Math.sqrt(d2);
  return { x: cx + (dx / d) * rad, y: cy + (dy / d) * rad };
}
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}
export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
// Format cash as $1,234.
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
