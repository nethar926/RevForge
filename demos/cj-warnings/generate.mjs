// Procedural generator for Carrier Jet cockpit-warning DEMO sounds.
// 100% synthesized (oscillators + envelopes); no samples or recordings.
// Usage: node generate.mjs [outDir]   -> writes 48 kHz mono 16-bit WAVs
// Then encode: ffmpeg -i x.wav -codec:a libmp3lame -b:a 192k x.mp3
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SR = 48000;
const TARGET_PEAK_DB = -4.5; // headroom so the MP3 decode stays <= -3 dBFS
const outDir = process.argv[2] || '.';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

function finalize(buf, fadeIn, fadeOut) {
  const n = buf.length;
  // remove DC
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  for (let i = 0; i < n; i++) buf[i] -= mean;
  // edge fades (raised cosine) so the file starts/ends at exactly zero
  const fi = Math.round(fadeIn * SR), fo = Math.round(fadeOut * SR);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fi) g *= smooth(i / fi);
    if (i > n - 1 - fo) g *= smooth((n - 1 - i) / fo);
    buf[i] *= g;
  }
  // normalize
  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(buf[i])) throw new Error('non-finite sample');
    peak = Math.max(peak, Math.abs(buf[i]));
  }
  const gain = Math.pow(10, TARGET_PEAK_DB / 20) / peak;
  for (let i = 0; i < n; i++) buf[i] *= gain;
  return buf;
}

// Hi-Lo two-tone. `rate` = full Hi+Lo cycles per second; frequency switches are
// phase-continuous and glided over `glide` seconds, and the amplitude dips
// slightly at each switch for a clean, click-free warble.
function stall({ hi, lo, rate, dur, harmonics, glide = 0.006 }) {
  const n = Math.round(dur * SR);
  const buf = new Float64Array(n);
  const half = 1 / (2 * rate);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const pos = t % (2 * half);
    // 0 -> hi segment, 1 -> lo segment, with smoothed transitions
    const mix = pos < half ? (pos < glide ? 1 - smooth(pos / glide) : 0) : (pos - half < glide ? smooth((pos - half) / glide) : 1);
    const f = hi + (lo - hi) * mix;
    phase += (2 * Math.PI * f) / SR;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    let s = 0;
    for (const [k, a] of harmonics) s += a * Math.sin(k * phase);
    const segPos = pos % half;
    const dip = 0.85 + 0.15 * smooth(Math.min(segPos, half - segPos) / glide);
    buf[i] = s * dip;
  }
  return finalize(buf, 0.04, 0.15);
}

// Bell-like strike: a few slightly inharmonic sine partials with exponential decay.
function strike(buf, t0, f, amp, decay = 0.35) {
  const partials = [[1, 1, 1], [2.0, 0.35, 0.6], [2.76, 0.18, 0.45], [4.07, 0.07, 0.3]];
  const start = Math.round(t0 * SR);
  const len = Math.round(decay * 12 * SR); // tail decays to ~-100 dB, no truncation click
  const atk = Math.round(0.004 * SR);
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / SR;
    const a = i < atk ? smooth(i / atk) : 1;
    let s = 0;
    for (const [r, g, dr] of partials) s += g * Math.exp(-t / (decay * dr)) * Math.sin(2 * Math.PI * f * r * t);
    buf[start + i] += amp * a * s;
  }
}

function chime(pattern, dur = 3, period = 1.5) {
  const buf = new Float64Array(Math.round(dur * SR));
  for (let rep = 0; rep < 2; rep++)
    for (const [dt, f, a, d] of pattern) strike(buf, rep * period + dt, f, a, d);
  return finalize(buf, 0.002, 0.25);
}

function wav(path, buf) {
  const n = buf.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), 44 + i * 2);
  writeFileSync(path, b);
}

const sounds = {
  // A: brighter 1000/700 Hz, 5 Hi-Lo cycles/s, a touch of odd harmonics
  'stall-warning-a': stall({ hi: 1000, lo: 700, rate: 5, dur: 4, harmonics: [[1, 1], [3, 0.18], [5, 0.06]] }),
  // B: softer 800/600 Hz, 4 cycles/s, near-pure sine
  'stall-warning-b': stall({ hi: 800, lo: 600, rate: 4, dur: 4, harmonics: [[1, 1], [2, 0.08]] }),
  // A: short double chime (two quick strikes on the same pitch), pattern x2
  'master-caution-a': chime([[0, 1175, 1, 0.3], [0.16, 1175, 0.9, 0.35]]),
  // B: single descending two-note chime (A5 -> E5), pattern x2
  'master-caution-b': chime([[0, 880, 1, 0.35], [0.28, 659.25, 0.95, 0.45]]),
};
for (const [name, buf] of Object.entries(sounds)) wav(join(outDir, `${name}.wav`), buf);
console.log('wrote', Object.keys(sounds).join(', '));
