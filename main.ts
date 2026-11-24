// main.ts — the entrypoint for "Neon Bay", an open-world crime game built
// for make.fun's gta6-01 bounty. It runs on plain Node 22 with only the
// standard library: no install step, no network.
//
// What it does, in order:
//   1. copies this repo's game/ (static files: index.html + ES modules) and
//      screenshots/ into the output directory (/output, or the directory the
//      MAKEFUN_OUTPUT_DIR environment variable names when set);
//   2. writes output/dossier.json with buildDossier from the vendored
//      make.fun library, using the same caps the gate enforces, so an entry
//      the scorer would refuse is refused here first.
//
// Run it locally to check the entry before submitting:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's own caps (see the competition's RULES.txt): at most 4
// screenshots of 256 KiB each, at most 993 files / 48 MiB under game/,
// paths under 1000 bytes, and a 160 KiB text budget for the dossier.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countEntries(dir) {
  // A quick pre-flight so a too-big game/ fails loudly here, with the
  // counts, instead of silently producing an entry the scorer refuses.
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else { files += 1; bytes += st.size; }
    }
  };
  walk(dir);
  return { files, bytes };
}

mkdirSync(outDir, { recursive: true });

const gameDir = join(repoRoot, 'game');
const gameCount = countEntries(gameDir);
if (gameCount.files > DOSSIER_CAPS.game_max_files) {
  throw new Error(`game/ has ${gameCount.files} files, over the 993 cap`);
}
if (gameCount.bytes > DOSSIER_CAPS.game_max_bytes) {
  throw new Error(`game/ is ${gameCount.bytes} bytes, over the 48 MiB cap`);
}
cpSync(gameDir, join(outDir, 'game'), { recursive: true });

mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  const shotFiles = readdirSync(shotsDir).filter((n) => !n.startsWith('.'));
  if (shotFiles.length < 3 || shotFiles.length > 4) {
    throw new Error(`screenshots/ holds ${shotFiles.length} images, need 3 or 4`);
  }
  for (const name of shotFiles) {
    const st = statSync(join(shotsDir, name));
    if (st.size > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name} is ${st.size} bytes, over the 256 KiB cap`);
    }
  }
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));

console.log(`Neon Bay handed in: ${gameCount.files} game files (${gameCount.bytes} bytes) -> ${outDir}`);
