/**
 * dcGuard before/after: steady-rpm renders of every stock pulse ICE builtin with the guard
 * off (old behaviour) vs the shipped rpm-gated guard. Prints RMS dBFS per rpm point.
 * Run: node scripts/dcguard-qa.mjs [ids...]
 */
import { renderIcePack } from './ice-render.mjs';

const IDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['v8-rumble', 'i4-zip', 'i6-silk', 'rotary-hum'];
const POINTS = [
  { label: 'idle', d: { speed: 0, throttle: 0 } },
  { label: '1200', d: { speed: 0.15, throttle: 0.2, rpm: 1200 } },
  { label: '2000', d: { speed: 0.3, throttle: 0.4, rpm: 2000 } },
  { label: '3000', d: { speed: 0.45, throttle: 0.6, rpm: 3000 } },
  { label: '4500', d: { speed: 0.7, throttle: 0.9, load: 0.6, rpm: 4500 } },
  { label: '6000', d: { speed: 0.9, throttle: 1, load: 0.8, rpm: 6000 } },
];
const rms = (buf, a) => {
  let s = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = Math.floor(a * buf.sampleRate); i < x.length; i++) {
      s += x[i] * x[i];
      n++;
    }
  }
  return 20 * Math.log10(Math.sqrt(s / n) + 1e-12);
};
const rows = [];
for (const id of IDS) {
  for (const pt of POINTS) {
    const r = {};
    for (const mode of ['off', 'auto']) {
      const buf = await renderIcePack(id, () => pt.d, 2.5, { dcGuard: mode, sampleRate: 44100 });
      r[mode] = rms(buf, 1.0);
    }
    rows.push({ id, rpm: pt.label, before: r.off.toFixed(1), after: r.auto.toFixed(1), delta: (r.auto - r.off).toFixed(1) });
    console.log(`${id.padEnd(11)} ${pt.label.padStart(5)}  before ${r.off.toFixed(1).padStart(6)} dB  after ${r.auto.toFixed(1).padStart(6)} dB  Δ ${(r.auto - r.off).toFixed(1)}`);
  }
}
console.log(JSON.stringify(rows));
process.exit(0);
