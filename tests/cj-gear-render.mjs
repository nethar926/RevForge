/**
 * Offline demo for the Carrier Jet landing gear (src/audio/jetGear.js), through the shipped live chain.
 * Part 1: engine at ground idle, gear lever up (retract), pause, lever down (extend).
 * Part 2: the same pair with the engine off (TF30 voice muted, i.e. the gear on its own).
 * The parts are joined with a short crossfade. CLI: node tests/cj-gear-render.mjs <out.wav>
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);
const { wav16 } = await import(pathToFileURL(join(root, 'tests/cj-flight-render.mjs')).href);

/** [t, label, fn(engine)] per part; lever pulls via playJetCue (no report → default lock timing). */
export const GEAR_TIMELINE = [
  [0.6, 'gear lever up (retract)', (e) => e.playJetCue('gearUp')],
  [6.4, 'gear lever down (extend)', (e) => e.playJetCue('gearDown')],
];
export const GEAR_PART_SECONDS = 11;
const XFADE = 0.25;

async function part(engineOn) {
  const pending = [...GEAR_TIMELINE];
  return renderLive(() => ({ speed: 0, throttle: 0.04, load: 0.1 }), GEAR_PART_SECONDS, {
    patchId: 'aerospace-f14',
    seed: 'cj-gear-demo',
    fps: 30,
    onFrame: (e, t) => {
      if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower';
      if (t === 0 && !engineOn) e.base.g.tcVoice.out.disconnect();
      while (pending.length && pending[0][0] <= t + 1e-9) pending.shift()[2](e);
    },
  });
}

export async function renderGearDemo() {
  const a = await part(true);
  const b = await part(false);
  const sr = a.sampleRate;
  const nx = Math.round(XFADE * sr);
  const n = a.length + b.length - nx;
  const ch = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
    for (let i = 0; i < a.length; i++) ch[c][i] = x[i] * (i < a.length - nx ? 1 : Math.cos(((i - (a.length - nx)) / nx) * Math.PI * 0.5));
    for (let i = 0; i < b.length; i++) ch[c][a.length - nx + i] += y[i] * (i >= nx ? 1 : Math.sin((i / nx) * Math.PI * 0.5));
  }
  return { length: n, sampleRate: sr, duration: n / sr, numberOfChannels: 2, getChannelData: (c) => ch[c] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] ?? 'carrier-jet-gear.wav';
  const buf = await renderGearDemo();
  writeFileSync(out, wav16(buf));
  const log = [];
  for (const [k, off] of [['engine idle', 0], ['engine off', GEAR_PART_SECONDS - XFADE]]) for (const [t, l] of GEAR_TIMELINE) log.push(`${(t + off).toFixed(2)}  ${l} (${k})`);
  writeFileSync(out.replace(/\.wav$/, '.log'), log.join('\n'));
  console.log(out, buf.duration.toFixed(2), 's');
}
