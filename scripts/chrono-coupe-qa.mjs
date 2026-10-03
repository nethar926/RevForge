/**
 * Chrono Coupe QA renders → WAVs for listening + numpy analysis.
 * Run: node scripts/chrono-coupe-qa.mjs [outDir] [case...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderChronoCoupe, bufferToWav } from './chrono-coupe-render.mjs';

const out = process.argv[2] && !process.argv[2].match(/^[a-z-]+$/) ? process.argv[2] : 'qa-out/chrono-coupe';
const only = process.argv.slice(2).filter((a) => /^[a-z0-9-]+$/.test(a));
mkdirSync(out, { recursive: true });
const CASES = {
  idle: [() => ({ speed: 0, throttle: 0 }), 4],
  'idle-even': [() => ({ speed: 0, throttle: 0 }), 4, { family: 3 }],
  cruise: [(t) => ({ speed: (45 / 120) * Math.min(1, t / 3), throttle: t < 3 ? 0.45 : 0.22 }), 8],
  'cruise-even': [(t) => ({ speed: (45 / 120) * Math.min(1, t / 3), throttle: t < 3 ? 0.45 : 0.22 }), 8, { family: 3 }],
  wot: [(t) => ({ speed: Math.min(1, 0.05 + t * 0.09), throttle: 1, load: 0.7 }), 7],
  hold1200: [() => ({ speed: 0.15, throttle: 0.25, rpm: 1200 }), 4],
  'hold1200-even': [() => ({ speed: 0.15, throttle: 0.25, rpm: 1200 }), 4, { family: 3 }],
  hold4500: [() => ({ speed: 0.6, throttle: 0.9, load: 0.6, rpm: 4500 }), 3],
  liftoff: [(t) => ({ speed: Math.min(0.55, t * 0.1) - Math.max(0, t - 5.5) * 0.02, throttle: t < 5.5 ? 0.85 : 0 }), 8.5],
  revpark: [(t) => ({ speed: 0, throttle: t > 0.6 && t < 1.2 ? 0.9 : t > 2.2 && t < 2.5 ? 1 : 0 }), 4],
  charge: [(t) => ({ speed: Math.min(0.8, t * 0.12), throttle: 0.6, charge: Math.min(1, (t * 0.12) / 0.73) }), 6.2],
  'charge-boost': [(t) => ({ speed: Math.min(0.8, t * 0.12), throttle: 0.6, charge: Math.min(1, (t * 0.12) / 0.73), boost: 1 }), 6.2],
  discharge: [() => ({ speed: 0.74, throttle: 0.5, charge: 1 }), 3.5, { cues: [{ t: 1.5, type: 'discharge' }] }],
  'discharge-boost': [() => ({ speed: 0.74, throttle: 0.5, charge: 1, boost: 1 }), 3.5, { cues: [{ t: 1.5, type: 'discharge' }] }],
  'discharge-idle': [() => ({ speed: 0, throttle: 0, charge: 0 }), 3, { cues: [{ t: 1.5, type: 'discharge' }] }],
  starter: [() => ({ speed: 0, throttle: 0 }), 2.4, { cues: [{ t: 0.05, type: 'starter' }], params: { masterGain: 0 } }],
  shutoff: [() => ({ speed: 0, throttle: 0 }), 1.8, { cues: [{ t: 0.05, type: 'shutoff' }], params: { masterGain: 0 } }],
};
for (const [name, [profile, dur, opts]] of Object.entries(CASES)) {
  if (only.length && !only.includes(name)) continue;
  const buf = await renderChronoCoupe(profile, dur, opts ?? {});
  writeFileSync(join(out, `${name}.wav`), bufferToWav(buf));
  const tr = buf.trace;
  const last = tr[tr.length - 1];
  console.log(`${name}: rpm end ${last.rpm.toFixed(0)} gear ${last.gear} maxRpm ${Math.max(...tr.map((x) => x.rpm)).toFixed(0)}`);
}
process.exit(0);
