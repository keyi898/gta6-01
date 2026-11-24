// missions.js — the story of Neon Bay. Four jobs from the fixer "Marla Voss",
// each a small state machine: an objective, a map marker, a check for
// completion and a cash reward. Missions are saved when finished.

import { clamp, dist } from './util.js';
import { nearestLine, ROAD_LINES } from './world.js';
import { makeGangster } from './combat.js';
import { makeCar } from './vehicles.js';

// Where the player starts the game: the boardwalk by the bay.
export const SPAWN = { x: 600, y: 3000 };

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    pay: 400,
    brief: 'Marla Voss: "Kid, I need wheels. Steal any car on the street — press E next to one — and bring it to my garage. Try not to get spotted."',
    hint: 'Steal a car (E) and drive it to the garage marker.',
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    pay: 800,
    brief: 'Marla Voss: "My courier is stuck at the marina with a bag that isn\'t his. Pick him up, then drop him at the Sunset Motel. Cops are already sniffing around — keep it smooth."',
    hint: 'Pick up the courier at the marina, then drive him to the motel.',
  },
  {
    id: 'payback',
    title: 'Payback',
    pay: 1200,
    brief: 'Marla Voss: "The Red Jackals torched my warehouse. Four of them are holding the old cannery. Go on foot, take them all out, and don\'t come back until the cannery is quiet."',
    hint: 'Eliminate all 4 Red Jackals at the cannery.',
  },
  {
    id: 'the-big-one',
    title: 'The Big One',
    pay: 2500,
    brief: 'Marla Voss: "Last job. A vault truck is parked at the docks — take it, and the whole city will come for you. Lose the cops, bring the truck to the garage, and we\'re rich. Don\'t get caught."',
    hint: 'Steal the vault truck, lose the cops, deliver it to the garage.',
  },
];

// Fixed story locations, chosen on the grid.
export const LOC = {
  garage: { x: 1000, y: 2600 },
  marina: { x: 3300, y: 600 },
  motel: { x: 600, y: 1000 },
  cannery: { x: 2200, y: 2200 },
  docks: { x: 3000, y: 3000 },
};

export function startMission(G, index) {
  const def = MISSIONS[index];
  G.mission = {
    index,
    def,
    step: 0,
    objective: def.hint,
    marker: null,
    timer: 0,
    briefTimer: 7,
    data: {},
  };
  G.hudMessage = 'New job: ' + def.title + ' — ' + def.pay + ' cash';
  G.sfx.mission();
  setupMission(G);
}

function setupMission(G) {
  const m = G.mission;
  if (!m) return;
  if (m.def.id === 'hot-wheels') {
    m.marker = { ...LOC.garage };
  } else if (m.def.id === 'the-pickup') {
    m.marker = { ...LOC.marina };
    m.data.passenger = null;
  } else if (m.def.id === 'payback') {
    m.marker = { ...LOC.cannery };
    G.gangsters = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      G.gangsters.push(makeGangster(G, LOC.cannery.x + Math.cos(a) * 90, LOC.cannery.y + Math.sin(a) * 90));
    }
    G.addWanted(0);
  } else if (m.def.id === 'the-big-one') {
    m.marker = { ...LOC.docks };
    // The vault truck, parked at the docks.
    const truck = makeCar(G.rng, LOC.docks.x, LOC.docks.y, 'van');
    truck.color = '#3a3a3a';
    truck.cruise = 0;
    truck.driver = false;
    truck.vault = true;
    G.cars.push(truck);
    m.data.truck = truck;
  }
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m) return;
  const p = G.player;
  m.briefTimer = Math.max(0, m.briefTimer - dt);
  const near = (loc, r) => dist(p.x, p.y, loc.x, loc.y) < r;

  if (m.def.id === 'hot-wheels') {
    if (m.step === 0) {
      m.objective = p.inCar ? 'Drive the stolen car to the garage.' : 'Steal a car — walk up to one and press E.';
      if (p.inCar) m.step = 1;
    } else if (near(LOC.garage, 90) && p.inCar) {
      completeMission(G);
    }
  } else if (m.def.id === 'the-pickup') {
    if (m.step === 0) {
      m.objective = 'Drive to the marina and pick up the courier.';
      if (near(LOC.marina, 90) && p.inCar) {
        m.step = 1;
        m.marker = { ...LOC.motel };
        m.data.passenger = { x: LOC.marina.x, y: LOC.marina.y, riding: true };
        G.hudMessage = 'Courier aboard. Get him to the Sunset Motel — fast, but quiet.';
        G.addWanted(2, 'aiding a fugitive');
      }
    } else if (m.step === 1) {
      m.objective = 'Drop the courier at the Sunset Motel. Lose the cops if you can.';
      if (near(LOC.motel, 90) && p.inCar) completeMission(G);
    }
  } else if (m.def.id === 'payback') {
    const left = G.gangsters.filter(e => e.health > 0).length;
    m.objective = 'Eliminate the Red Jackals at the cannery. ' + left + ' left.';
    if (left === 0) completeMission(G);
  } else if (m.def.id === 'the-big-one') {
    if (m.step === 0) {
      m.objective = 'Steal the vault truck at the docks (E).';
      if (p.inCar && p.car && p.car.vault) {
        m.step = 1;
        m.marker = { ...LOC.garage };
        G.addWanted(4, 'stealing a vault truck');
        G.hudMessage = 'The whole city is coming. Lose them, then reach the garage.';
      }
    } else if (m.step === 1) {
      m.objective = p.wanted > 0
        ? 'Lose the cops, then deliver the truck to the garage.'
        : 'Deliver the vault truck to the garage.';
      if (near(LOC.garage, 90) && p.inCar && p.car && p.car.vault) completeMission(G);
    }
  }
}

function completeMission(G) {
  const m = G.mission;
  G.player.cash += m.def.pay;
  G.player.missionsDone.push(m.def.id);
  G.hudMessage = 'Job done: ' + m.def.title + ' — +' + m.def.pay + ' cash';
  G.sfx.cash();
  G.addParticles(G.player.x, G.player.y, 24, '#ffe14d');
  G.saveGame();
  const next = m.index + 1;
  G.mission = null;
  G.gangsters = [];
  if (next < MISSIONS.length) {
    G.pendingMission = next;
    G.pendingTimer = 3;
  } else {
    G.storyDone = true;
    G.hudMessage = 'All jobs done. Neon Bay is yours, kid. Free roam — cause some chaos.';
  }
}

// A small gold marker column + ring, drawn over the mission target.
export function drawMarker(ctx, G, time) {
  const m = G.mission;
  if (!m || !m.marker) return;
  const { x, y } = m.marker;
  const pulse = 1 + Math.sin(time * 0.004) * 0.15;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,225,77,0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // Beam of light.
  const grad = ctx.createLinearGradient(0, -160, 0, 0);
  grad.addColorStop(0, 'rgba(255,225,77,0)');
  grad.addColorStop(1, 'rgba(255,225,77,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(-14, -160, 28, 160);
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▼', 0, -44);
  ctx.restore();
}
