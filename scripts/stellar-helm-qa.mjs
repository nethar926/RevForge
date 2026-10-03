/**
 * Stellar Helm QA — offline renders of the real voice + measurements used in
 * docs/stellar-helm-audio-v1.md. Usage: node scripts/stellar-helm-qa.mjs [outDir]
 * (writes WAVs to outDir when given; qa-out/ is git-ignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderStellarHelm, bufferToWav, renderStellarHelmPreview } from './stellar-helm-render.mjs';

export function analyse(buf, a, b) {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
  const i0 = Math.floor(a * sr);
  const i1 = Math.min(L.length, Math.floor(b * sr));
  let s = 0;
  let pk = 0;
  for (let i = i0; i < i1; i++) {
    const m = (L[i] + R[i]) * 0.5;
    s += m * m;
    pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  }
  const rms = Math.sqrt(s / Math.max(1, i1 - i0));
  // Averaged power spectrum (Hann, 8192)
  const N = 8192;
  const spec = new Float64Array(N / 2);
  let frames = 0;
  for (let st = i0; st + N <= i1; st += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((L[st + i] + R[st + i]) * 0.5) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const hz = (k) => (k * sr) / N;
  let tot = 0;
  let cen = 0;
  const bands = { sub: 0, low: 0, mid: 0, high: 0, air: 0 };
  let peakK = 1;
  for (let k = 1; k < N / 2; k++) {
    const p = spec[k];
    tot += p;
    cen += p * hz(k);
    const f = hz(k);
    if (f < 80) bands.sub += p;
    else if (f < 250) bands.low += p;
    else if (f < 1000) bands.mid += p;
    else if (f < 4000) bands.high += p;
    else bands.air += p;
    if (f > 20 && p > spec[peakK]) peakK = k;
  }
  for (const k of Object.keys(bands)) bands[k] = Math.round((bands[k] / tot) * 1000) / 10;
  // Slow modulation: 50 ms RMS envelope → depth (dB p-p of the 10–90 % range)
  const hop = Math.floor(0.05 * sr);
  const env = [];
  for (let st = i0; st + hop <= i1; st += hop) {
    let e = 0;
    for (let i = st; i < st + hop; i++) e += L[i] * L[i];
    env.push(10 * Math.log10(e / hop + 1e-12));
  }
  const sorted = [...env].sort((x, y) => x - y);
  const q = (f) => sorted[Math.floor(f * (sorted.length - 1))] ?? 0;
  return {
    rmsDb: +(20 * Math.log10(rms + 1e-12)).toFixed(1),
    peakDb: +(20 * Math.log10(pk + 1e-12)).toFixed(1),
    centroidHz: frames ? Math.round(cen / tot) : 0,
    peakHz: +hz(peakK).toFixed(1),
    bands,
    modDb: +(q(0.9) - q(0.1)).toFixed(2),
  };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export const CASES = {
  parked: { profile: () => ({ speed: 0, throttle: 0 }), dur: 8 },
  cruise30: { profile: () => ({ speed: 0.25, throttle: 0.3 }), dur: 8 },
  cruise65: { profile: () => ({ speed: 0.54, throttle: 0.35 }), dur: 8 },
  full: { profile: () => ({ speed: 0.9, throttle: 1, load: 0.8 }), dur: 8 },
  boost: { profile: () => ({ speed: 0.54, throttle: 0.35, boost: 1 }), dur: 8 },
  reverse: { profile: () => ({ speed: 0.06, throttle: 0.3, reverse: true }), dur: 8 },
  reverseRef: { profile: () => ({ speed: 0.06, throttle: 0.3 }), dur: 8 },
  liftoff: { profile: (t) => ({ speed: 0.54, throttle: t < 3 ? 1 : 0 }), dur: 8 },
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const outDir = process.argv[2];
  if (outDir) mkdirSync(outDir, { recursive: true });
  const results = {};
  for (const [name, c] of Object.entries(CASES)) {
    const buf = await renderStellarHelm(c.profile, c.dur, { sampleRate: 44100 });
    results[name] = analyse(buf, 3, c.dur);
    if (name === 'liftoff') {
      results['liftoff:pressed'] = analyse(buf, 1.5, 3);
      results['liftoff:relaxed'] = analyse(buf, 6, 8);
    }
    const wrapped = await renderStellarHelm(c.profile, c.dur, { sampleRate: 44100, wrapper: true });
    results[name].carRmsDb = analyse(wrapped, 3, c.dur).rmsDb;
    if (outDir) writeFileSync(join(outDir, `${name}.wav`), bufferToWav(buf));
  }
  const prev = await renderStellarHelmPreview();
  results['preview:powerup'] = analyse(prev, 0, 1.5);
  results['preview:cruise'] = analyse(prev, 1.6, 3.1);
  results['preview:boost'] = analyse(prev, 3.2, 4.2);
  for (const [k, r] of Object.entries(results)) console.log(k.padEnd(18), JSON.stringify(r));
  process.exit(0);
}
