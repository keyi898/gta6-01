// audio.js — every sound in Neon Bay is synthesized live with WebAudio:
// no audio files, no network. Engine hum, sirens, gunshots, crashes,
// pickup chimes and a small synthwave bass loop, all behind one mute flag.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let musicTimer = null;
let musicStep = 0;
let muted = false;

export function audioUnlocked() {
  return ctx !== null;
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Engine: a low sawtooth whose pitch follows speed, plus a sub sine.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineSub = ctx.createOscillator();
    engineSub.type = 'sine';
    engineSub.frequency.value = 28;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineSub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineSub.start();
    // Police siren: two-tone square wave, wails while wanted.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    startMusic();
  } catch (e) {
    ctx = null; // headless / no audio device: the game still plays silent.
  }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = muted ? 0 : 0.5;
}
export function isMuted() {
  return muted;
}

// Engine pitch + volume follow the car's speed (0..1).
export function setEngine(speedNorm, driving) {
  if (!ctx || !engineOsc) return;
  const t = ctx.currentTime;
  engineGain.gain.setTargetAtTime(driving ? 0.05 + speedNorm * 0.07 : 0, t, 0.08);
  engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, t, 0.1);
}

// Siren wail: alternate 700/950 Hz while any wanted level is active.
let sirenHigh = false;
let sirenLast = 0;
export function updateSiren(now, wanted) {
  if (!ctx || !sirenOsc) return;
  sirenGain.gain.setTargetAtTime(wanted > 0 ? 0.045 : 0, ctx.currentTime, 0.2);
  if (wanted > 0 && now - sirenLast > 420) {
    sirenLast = now;
    sirenHigh = !sirenHigh;
    sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.05);
  }
}

function blip(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, filterFreq) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq || 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export function sfxGunshot() {
  noiseBurst(0.12, 0.3, 2600);
  blip(160, 0.08, 'square', 0.1, 60);
}
export function sfxCrash() {
  noiseBurst(0.25, 0.35, 700);
}
export function sfxPickup() {
  blip(660, 0.09, 'sine', 0.14);
  setTimeout(() => blip(990, 0.14, 'sine', 0.14), 80);
}
export function sfxCash() {
  blip(880, 0.08, 'sine', 0.13);
  setTimeout(() => blip(1174, 0.08, 'sine', 0.13), 70);
  setTimeout(() => blip(1568, 0.16, 'sine', 0.13), 140);
}
export function sfxHorn() {
  blip(370, 0.22, 'sawtooth', 0.1, 340);
}
export function sfxBusted() {
  blip(440, 0.3, 'sawtooth', 0.12, 220);
  setTimeout(() => blip(330, 0.5, 'sawtooth', 0.12, 165), 280);
}
export function sfxMission() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.18, 'triangle', 0.14), i * 110));
}
export function sfxClick() {
  blip(1200, 0.05, 'square', 0.08);
}

// Short aliases, so game code can call G.sfx.mission() etc.
export {
  sfxMission as mission,
  sfxCash as cash,
  sfxCrash as crash,
  sfxGunshot as gunshot,
  sfxBusted as busted,
  sfxClick as click,
  sfxHorn as horn,
};

// A tiny synthwave loop: Am – F – C – G bass roots with a sparkle arp.
// Scheduled one 8th-note step at a time so it survives tab throttling.
const BASS = [55, 43.65, 65.41, 49];
const ARP = [220, 261.63, 329.63, 440, 329.63, 261.63];
function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx || muted) return;
    const step = musicStep++;
    const bar = Math.floor(step / 8) % 4;
    if (step % 2 === 0) {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = BASS[bar];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.45);
    }
    if (step % 4 === 1) {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = ARP[(step / 4 | 0) % ARP.length] * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.32);
    }
  }, 210);
}
