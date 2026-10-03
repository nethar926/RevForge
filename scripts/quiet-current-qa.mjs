/**
 * Quiet Current QA renders → WAVs for listening + numpy analysis (both variants).
 * Run: node scripts/quiet-current-qa.mjs [outDir] [case...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderQuietCurrent, bufferToWav, quietCurrentPreviewProfile, QC_PREVIEW_SECONDS } from './quiet-current-render.mjs';

const out = process.argv[2] && !process.argv[2].match(/^[a-z0-9-]+$/) ? process.argv[2] : 'qa-out/quiet-current';
const only = process.argv.slice(2).filter((a) => /^[a-z0-9-]+$/.test(a));
mkdirSync(out, { recursive: true });
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const CASES = {
  rest: [() => ({ speed: 0, throttle: 0 }), 3],
  creep: [(t) => ({ speed: 0.12 * ramp(t, 0.3, 4), throttle: 0.3 }), 5],
  'pull-away': [(t) => ({ speed: 0.6 * ramp(t, 0.5, 6), throttle: t < 0.5 ? 0 : 0.75 }), 6.5],
  cruise: [() => ({ speed: 0.5, throttle: 0.25 }), 4],
  'cruise-fast': [() => ({ speed: 0.85, throttle: 0.3 }), 4],
  regen: [(t) => ({ speed: 0.5 - 0.25 * ramp(t, 1.5, 4.5), throttle: t < 1.5 ? 0.3 : 0 }), 5],
  reverse: [(t) => ({ speed: 0.05 * ramp(t, 0.3, 1.5), throttle: 0.25, reverse: true }), 3],
  boost: [() => ({ speed: 0.5, throttle: 0.4, boost: 1 }), 3],
  'variant-sweep': [(t) => ({ speed: 0.5, throttle: 0.3, cyber: t < 2 ? 0 : 1 }), 4.5],
  'power-on': [() => ({ speed: 0, throttle: 0 }), 2, { cues: [{ t: 0.05, type: 'on' }], params: { masterGain: 0.62 } }],
  'power-off': [() => ({ speed: 0, throttle: 0 }), 1.6, { cues: [{ t: 0.05, type: 'off' }] }],
  preview: [quietCurrentPreviewProfile, QC_PREVIEW_SECONDS, { fadeOut: 0.3 }],
};
for (const [name, [profile, dur, opts]] of Object.entries(CASES)) {
  if (only.length && !only.includes(name)) continue;
  for (const cyber of [0, 1]) {
    const o = { ...(opts ?? {}), params: { ...(opts?.params ?? {}), cyber } };
    const buf = await renderQuietCurrent(profile, dur, o);
    const file = `${name}${cyber ? '-cyber' : ''}.wav`;
    writeFileSync(join(out, file), bufferToWav(buf));
    let peak = 0, ss = 0;
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      peak = Math.max(peak, Math.abs(d[i]));
      ss += d[i] * d[i];
    }
    const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
    console.log(`${file}: rms ${db(Math.sqrt(ss / d.length))} dB  peak ${db(peak)} dB`);
  }
}
process.exit(0);
