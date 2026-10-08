/** Small analysis helpers for QA renders: averaged power spectrum, band split, centroid, peaks. */
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
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
/** Mono-summed Welch power spectrum (Hann, 8192). */
export function powerSpectrum(channels, fs, N = 8192) {
  const len = channels[0].length;
  const ps = new Float64Array(N / 2);
  let frames = 0;
  for (let s = 0; s + N <= len; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let v = 0;
      for (const ch of channels) v += ch[s + i];
      re[i] = (v / channels.length) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) ps[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  for (let k = 0; k < N / 2; k++) ps[k] /= Math.max(1, frames);
  return { ps, df: fs / N };
}
export function analyse(channels, fs) {
  const { ps, df } = powerSpectrum(channels, fs);
  const edges = [0, 150, 500, 2000, 6000, fs / 2];
  const bands = new Array(edges.length - 1).fill(0);
  let tot = 0, cen = 0;
  for (let k = 1; k < ps.length; k++) {
    const f = k * df;
    tot += ps[k];
    cen += ps[k] * f;
    for (let b = 0; b < bands.length; b++) if (f >= edges[b] && f < edges[b + 1]) bands[b] += ps[k];
  }
  // tonal peaks: bins ≥ 12 dB above the local median (±40 bins)
  const peaks = [];
  for (let k = 5; k < ps.length - 5; k++) {
    if (!(ps[k] > ps[k - 1] && ps[k] >= ps[k + 1])) continue;
    const loc = [];
    for (let j = Math.max(1, k - 40); j < Math.min(ps.length, k + 40); j++) loc.push(ps[j]);
    loc.sort((a, b) => a - b);
    const med = loc[loc.length >> 1];
    const prom = 10 * Math.log10(ps[k] / (med + 1e-30));
    if (prom > 12) peaks.push({ hz: Math.round(k * df), db: +(10 * Math.log10(ps[k] / tot)).toFixed(1), prom: +prom.toFixed(1) });
  }
  peaks.sort((a, b) => b.db - a.db);
  return {
    centroidHz: Math.round(cen / tot),
    bandsPct: bands.map((b) => Math.round((100 * b) / tot)),
    peaks: peaks.slice(0, 8),
  };
}
