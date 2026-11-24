// hud.js — everything drawn on top of the world: the HUD (cash, health,
// wanted stars, mission objective, messages), the minimap, and the menus
// (title, pause, busted, game over, mission complete).

import { money, clamp } from './util.js';
import { ROAD_LINES } from './world.js';
import { LOC } from './missions.js';

const MAP_SIZE = 184;
const MAP_PAD = 14;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,12,24,0.72)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHud(ctx, G) {
  const W = G.view.w, H = G.view.h;
  const p = G.player;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // --- Top left: cash, health, story progress.
  panel(ctx, 14, 14, 250, 84);
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(money(p.cash), 28, 24);
  ctx.fillStyle = '#fff';
  ctx.font = '13px sans-serif';
  ctx.fillText('Jobs done: ' + p.missionsDone.length + ' / 4', 28, 52);
  // Health bar.
  ctx.fillStyle = '#333';
  ctx.fillRect(28, 72, 150, 10);
  ctx.fillStyle = p.health > 40 ? '#7ec850' : '#e84d4d';
  ctx.fillRect(28, 72, 150 * clamp(p.health / 100, 0, 1), 10);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.fillText('HP', 184, 70);

  // --- Top centre: wanted stars.
  if (p.wanted > 0) {
    panel(ctx, W / 2 - 110, 14, 220, 46);
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < p.wanted ? '#ffe14d' : 'rgba(255,255,255,0.25)';
      ctx.font = '26px sans-serif';
      ctx.fillText('★', W / 2 - 80 + i * 40, 20);
    }
    ctx.fillStyle = '#ff9a9a';
    ctx.font = '11px sans-serif';
    ctx.fillText('WANTED', W / 2, 44);
    ctx.textAlign = 'left';
  }

  // --- Mission objective, under the cash panel.
  if (G.mission) {
    const obj = G.mission.objective;
    ctx.font = '13px sans-serif';
    const w = Math.min(420, ctx.measureText(obj).width + 28);
    panel(ctx, 14, 110, w, 52);
    ctx.fillStyle = '#ffe14d';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('◆ ' + G.mission.def.title, 28, 120);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(obj, 28, 140);
  } else if (G.pendingMission != null) {
    panel(ctx, 14, 110, 300, 34);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText('Marla is calling…', 28, 120);
  }

  // --- Speed + car health, bottom right (driving only).
  if (p.inCar && p.car) {
    panel(ctx, W - 190, H - 76, 176, 62);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36 * 2.2) + ' mph', W - 28, H - 66);
    ctx.fillStyle = '#9ab';
    ctx.font = '12px sans-serif';
    ctx.fillText(p.car.type.toUpperCase() + '  ·  ' + Math.max(0, Math.round(p.car.health)) + '%', W - 28, H - 34);
    ctx.textAlign = 'left';
  }

  // --- Controls hint, bottom left.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '12px sans-serif';
  ctx.fillText(p.inCar
    ? 'WASD drive · Space handbrake · E get out · Mouse aim · Click shoot · P pause · M mute'
    : 'WASD walk · E enter car · Click shoot · P pause · M mute', 16, H - 16);

  drawMinimap(ctx, G);

  // --- Toast message, centre top.
  if (G.hudMessage && G.hudTimer > 0) {
    ctx.font = 'bold 16px sans-serif';
    const w = ctx.measureText(G.hudMessage).width + 32;
    panel(ctx, W / 2 - w / 2, 72, w, 34);
    ctx.fillStyle = '#ffe14d';
    ctx.textAlign = 'center';
    ctx.fillText(G.hudMessage, W / 2, 81);
    ctx.textAlign = 'left';
  }

  // --- Phone briefing at mission start.
  if (G.mission && G.mission.briefTimer > 0) {
    const lines = wrapText(ctx, G.mission.def.brief, 460, '14px sans-serif');
    const h = lines.length * 20 + 56;
    panel(ctx, W / 2 - 250, H - h - 24, 500, h);
    ctx.fillStyle = '#3ae0ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('📱 MARLA VOSS', W / 2 - 234, H - h - 8);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2 - 234, H - h + 18 + i * 20));
  }
}

export function drawMinimap(ctx, G) {
  const W = G.view.w;
  const x0 = W - MAP_SIZE - MAP_PAD, y0 = MAP_PAD;
  const s = MAP_SIZE / G.world.size;
  panel(ctx, x0 - 6, y0 - 6, MAP_SIZE + 12, MAP_SIZE + 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, MAP_SIZE, MAP_SIZE);
  ctx.clip();
  // Water + sand on the east edge.
  ctx.fillStyle = '#1668a8';
  ctx.fillRect(x0, y0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(x0 + G.world.beachX * s, y0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#7a9a6a';
  ctx.fillRect(x0, y0, G.world.beachX * s, MAP_SIZE);
  // Roads.
  ctx.strokeStyle = '#3a3f4d';
  ctx.lineWidth = 4;
  for (const l of ROAD_LINES) {
    ctx.beginPath(); ctx.moveTo(x0, y0 + l * s); ctx.lineTo(x0 + MAP_SIZE, y0 + l * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + l * s, y0); ctx.lineTo(x0 + l * s, y0 + MAP_SIZE); ctx.stroke();
  }
  // Parks.
  ctx.fillStyle = '#4a8a4a';
  for (const pk of G.world.parks) ctx.fillRect(x0 + pk.x * s, y0 + pk.y * s, pk.w * s, pk.h * s);
  // Mission marker.
  if (G.mission && G.mission.marker) {
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.arc(x0 + G.mission.marker.x * s, y0 + G.mission.marker.y * s, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#20242e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Cops (blue), gangsters (red), player (white arrow).
  ctx.fillStyle = '#3a86ff';
  for (const c of G.cops) {
    ctx.beginPath(); ctx.arc(x0 + c.x * s, y0 + c.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#ff2d2d';
  for (const e of G.gangsters) {
    if (e.health <= 0) continue;
    ctx.beginPath(); ctx.arc(x0 + e.x * s, y0 + e.y * s, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  const p = G.player;
  ctx.save();
  ctx.translate(x0 + p.x * s, y0 + p.y * s);
  ctx.rotate(p.inCar && p.car ? p.car.angle : p.aimAngle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('NEON BAY', x0, y0 + MAP_SIZE + 22);
}

function wrapText(ctx, text, maxW, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (ctx.measureText(cur + ' ' + w).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + ' ' + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- Menus -----------------------------------------------------------------

export function drawTitle(ctx, G) {
  const W = G.view.w, H = G.view.h;
  // Sunset gradient sky over a drawn city silhouette.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a2a5e');
  grad.addColorStop(0.55, '#c85a7a');
  grad.addColorStop(0.8, '#ff9a5a');
  grad.addColorStop(1, '#2a1a3a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath(); ctx.arc(W * 0.86, H * 0.2, 64, 0, Math.PI * 2); ctx.fill();
  // Skyline.
  ctx.fillStyle = '#1a1430';
  let x = 0;
  const rngHeights = [120, 200, 150, 260, 180, 300, 140, 220, 170, 240, 130, 280];
  for (let i = 0; i < rngHeights.length; i++) {
    const bw = W / rngHeights.length;
    ctx.fillRect(x, H - 260 - rngHeights[i], bw - 6, 260 + rngHeights[i]);
    x += bw;
  }
  ctx.fillStyle = 'rgba(255,225,77,0.9)';
  for (let i = 0; i < 60; i++) {
    ctx.fillRect((i * 97) % W, H - 240 + ((i * 53) % 200), 4, 5);
  }
  ctx.fillStyle = 'rgba(10,10,30,0.55)';
  ctx.fillRect(0, H - 260, W, 260);
  // Title.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5ea8';
  ctx.font = 'bold 84px sans-serif';
  ctx.shadowColor = '#ff5ea8';
  ctx.shadowBlur = 30;
  ctx.fillText('NEON BAY', W / 2, H * 0.34);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('An open-world crime story', W / 2, H * 0.34 + 40);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('Steal cars. Outrun the NBPD. Finish Marla\'s four jobs. Own the city.', W / 2, H * 0.34 + 72);
  // Buttons.
  drawButton(ctx, W / 2 - 130, H * 0.56, 260, 56, G.saveExists ? 'CONTINUE' : 'START GAME');
  drawButton(ctx, W / 2 - 130, H * 0.56 + 72, 260, 56, 'HOW TO PLAY');
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px sans-serif';
  ctx.fillText('WASD move / drive · E enter & steal cars · Mouse aim, Click shoot · Space handbrake · P pause · M mute', W / 2, H * 0.56 + 168);
  ctx.fillText('A wholly original game. No Rockstar / GTA content. Neon Bay, its people and its story are invented.', W / 2, H - 24);
  ctx.textAlign = 'left';
}

function drawButton(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#ff5ea8';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 7);
  ctx.textAlign = 'left';
}

export function drawPause(ctx, G) {
  dim(ctx, G);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('PAUSED', G.view.w / 2, G.view.h / 2 - 20);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('Press P to keep playing · M to mute · R to restart the story', G.view.w / 2, G.view.h / 2 + 24);
  ctx.textAlign = 'left';
}

export function drawBusted(ctx, G) {
  dim(ctx, G);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a5a';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('BUSTED!', G.view.w / 2, G.view.h / 2 - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText('The NBPD caught up with you. Marla paid your bail — this time.', G.view.w / 2, G.view.h / 2 + 20);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('Click to get back on the street (you lose $200)', G.view.w / 2, G.view.h / 2 + 52);
  ctx.textAlign = 'left';
}

export function drawGameOver(ctx, G) {
  dim(ctx, G);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5a5a';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText('WASTED', G.view.w / 2, G.view.h / 2 - 20);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText('Neon Bay chewed you up. Marla sends her regards.', G.view.w / 2, G.view.h / 2 + 20);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('Click to start over', G.view.w / 2, G.view.h / 2 + 52);
  ctx.textAlign = 'left';
}

function dim(ctx, G) {
  ctx.fillStyle = 'rgba(5,8,18,0.72)';
  ctx.fillRect(0, 0, G.view.w, G.view.h);
}
