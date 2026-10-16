/**
 * Before / after wind demo: ~12 s of cruise → full on ef4021e, a gap, then the same on this build.
 * CLI: node tests/cj-wind-render.mjs <outDir>   (writes wind-before.wav / wind-after.wav)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);
const { wav16 } = await import(pathToFileURL(join(root, 'tests/cj-flight-render.mjs')).href);

/** 0–3 s spool-up (trimmed), 3–9 s cruise (108 mph, part throttle), 9–15 s full (MIL, 72 → 100 mph). */
export const windProfile = (t) => (t < 9 ? { speed: 0.9, throttle: 0.6, load: 0.6 } : { speed: Math.min(100, 72 + (t - 9) * 6) / 120, throttle: 0.8, load: 0.8 });

const out = process.argv[2] ?? '.';
const base = mkdtempSync(join(tmpdir(), 'cj-wind-demo-'));
try {
  writeFileSync(join(base, 'a.tar'), execFileSync('git', ['-C', root, 'archive', 'ef4021e', 'src', 'scripts', 'package.json'], { maxBuffer: 1 << 28 }));
  execFileSync('tar', ['-xf', join(base, 'a.tar'), '-C', base]);
  symlinkSync(join(root, 'node_modules'), join(base, 'node_modules'));
  for (const [name, r] of [['wind-before', base], ['wind-after', root]]) {
    const buf = await renderLive(windProfile, 15, {
      root: r,
      patchId: 'aerospace-f14',
      seed: 'cj-wind-demo',
      fps: 30,
      onFrame: (e) => {
        if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower'; // node HRTF is mono (offline only)
      },
    });
    writeFileSync(join(out, `${name}.wav`), wav16(buf));
    console.log('wrote', name);
  }
} finally {
  rmSync(base, { recursive: true, force: true });
}
