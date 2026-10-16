// Twin Ion bed smoothness metrics (shared by tests/ion-twin-seamless.test.mjs and QA renders).
const SR = 44100;
export const mono = (buf) => {
  const a = buf.getChannelData(0);
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const m = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) / 2;
  return m;
};
/** Window RMS levels (dB). */
export const envDb = (x, win, from = 0) => {
  const W = Math.round(win * SR);
  const e = [];
  for (let o = Math.round(from * SR); o + W <= x.length; o += W) {
    let s = 0;
    for (let i = o; i < o + W; i++) s += x[i] * x[i];
    e.push(10 * Math.log10(s / W + 1e-12));
  }
  return e;
};
export const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
/**
 * Bed smoothness: p99 10 ms level step (dB), std (dB) of 50 ms levels around their 1 s mean
 * (pumping / chop), and click ratio = max |Δx| / p99.9 |Δx| (an isolated discontinuity spikes it).
 */
export function smoothness(x, from = 0.5) {
  const e10 = envDb(x, 0.01, from);
  const steps = e10.slice(1).map((v, i) => Math.abs(v - e10[i]));
  const e50 = envDb(x, 0.05, from);
  const dev = e50.map((v, i) => {
    const lo = Math.max(0, i - 10);
    const hi = Math.min(e50.length, i + 10);
    let m = 0;
    for (let j = lo; j < hi; j++) m += e50[j];
    return v - m / (hi - lo);
  });
  const std = Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length);
  const d = [];
  for (let i = Math.round(from * SR) + 1; i < x.length; i++) d.push(Math.abs(x[i] - x[i - 1]));
  const click = d.reduce((a, b) => Math.max(a, b), 0) / Math.max(1e-9, pct(d, 0.999));
  return { p99: pct(steps, 0.99), std, click };
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
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < len / 2; j++) {
        const wr = Math.cos(a * j);
        const wi = Math.sin(a * j);
        const xr = re[i + j + len / 2] * wr - im[i + j + len / 2] * wi;
        const xi = re[i + j + len / 2] * wi + im[i + j + len / 2] * wr;
        re[i + j + len / 2] = re[i + j] - xr;
        im[i + j + len / 2] = im[i + j] - xi;
        re[i + j] += xr;
        im[i + j] += xi;
      }
    }
  }
}
/** Max third-octave timbre change (dB RMS across 100 Hz–6.4 kHz, level removed) between 0.25 s frames 0.1 s apart. */
export function timbreJumpMax(x, from = 0.5) {
  const N = 4096;
  const edges = Array.from({ length: 19 }, (_, k) => 100 * Math.pow(2, k / 3));
  const frames = [];
  for (let o = Math.round(from * SR); o + 2 * N <= x.length; o += Math.round(0.1 * SR)) {
    // Welch: three half-overlapped 4096-point frames (≈0.19 s) per analysis frame
    const pw = new Float64Array(N / 2);
    for (let h = 0; h < 3; h++) {
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = (x[o + h * (N / 2) + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      fft(re, im);
      for (let k = 0; k < N / 2; k++) pw[k] += re[k] * re[k] + im[k] * im[k];
    }
    const v = [];
    for (let b = 0; b < edges.length - 1; b++) {
      let p = 0;
      let c = 0;
      for (let k = Math.ceil((edges[b] * N) / SR); k < (edges[b + 1] * N) / SR; k++, c++) p += pw[k];
      v.push(10 * Math.log10(p / Math.max(1, c) + 1e-20));
    }
    const m = v.reduce((a, b) => a + b) / v.length;
    frames.push(v.map((y) => y - m));
  }
  let mx = 0;
  for (let i = 1; i < frames.length; i++) {
    let s = 0;
    for (let b = 0; b < frames[i].length; b++) s += (frames[i][b] - frames[i - 1][b]) ** 2;
    mx = Math.max(mx, Math.sqrt(s / frames[i].length));
  }
  return mx;
}

