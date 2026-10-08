/**
 * Offline audio metrics for QA scripts and tests: ITU-R BS.1770-4 integrated loudness (LUFS),
 * sample peak (dBFS), low-band energy share (FFT) and max sample-to-sample delta.
 * Pure JS on Float32Array channel data — no dependencies.
 */

/** RBJ-style biquad (direct form I) over one channel. */
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** K-weighting coefficients for any sample rate (BS.1770 pre-filter shelf + RLB high-pass). */
function kWeightCoeffs(fs) {
  // Stage 1: high shelf (+4 dB @ ~1.68 kHz)
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: RLB high-pass (~38 Hz)
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [s1, s2];
}

/** Integrated loudness (LUFS, BS.1770-4 gating). channels: Float32Array[] (L, R). */
export function integratedLufs(channels, fs) {
  const [s1, s2] = kWeightCoeffs(fs);
  const weighted = channels.map((ch) => {
    const a = biquad(ch, s1.b0, s1.b1, s1.b2, s1.a1, s1.a2);
    return biquad(a, s2.b0, s2.b1, s2.b2, s2.a1, s2.a2);
  });
  const block = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  const n = weighted[0].length;
  const z = [];
  for (let s = 0; s + block <= n; s += hop) {
    let sum = 0;
    for (const w of weighted) {
      let acc = 0;
      for (let i = s; i < s + block; i++) acc += w[i] * w[i];
      sum += acc / block;
    }
    z.push(sum);
  }
  const L = (p) => -0.691 + 10 * Math.log10(p);
  const abs = z.filter((p) => p > 0 && L(p) > -70);
  if (!abs.length) return -Infinity;
  const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = L(meanAbs) - 10;
  const gated = abs.filter((p) => L(p) > rel);
  const mean = gated.reduce((a, b) => a + b, 0) / gated.length;
  return L(mean);
}

/** Sample peak in dBFS over all channels. */
export function peakDbfs(channels) {
  let m = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > m) m = a; }
  return 20 * Math.log10(m + 1e-12);
}

/** In-place radix-2 FFT (re, im Float64Array, length power of two). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Share (0..1) of spectral energy below `cutHz` (Hann STFT, mono sum, DC bin excluded). */
export function lowBandShare(channels, fs, cutHz = 80, n = 8192) {
  const len = channels[0].length;
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const cutBin = Math.floor((cutHz * n) / fs);
  let low = 0, total = 0;
  for (let s = 0; s + n <= len; s += n / 2) {
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (const ch of channels) v += ch[s + i];
      re[i] = (v / channels.length) * win[i];
    }
    fft(re, im);
    for (let k = 1; k < n / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      total += p;
      if (k <= cutBin) low += p;
    }
  }
  return total > 0 ? low / total : 0;
}

/** Max |x[i] - x[i-1]| over [from, to) samples, all channels. */
export function maxDelta(channels, from = 1, to = Infinity) {
  let m = 0;
  for (const ch of channels) {
    const end = Math.min(ch.length, to);
    for (let i = Math.max(1, from); i < end; i++) { const d = Math.abs(ch[i] - ch[i - 1]); if (d > m) m = d; }
  }
  return m;
}

/** Float AudioBuffer-like {numberOfChannels, length, sampleRate, getChannelData} → 16-bit WAV Buffer. */
export function toWav16(buf, gain = 1) {
  const numCh = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
  const dataLen = len * numCh * 2;
  const out = Buffer.alloc(44 + dataLen);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataLen, 4); out.write('WAVE', 8); out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(numCh, 22); out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(sr * numCh * 2, 28); out.writeUInt16LE(numCh * 2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(dataLen, 40);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i] * gain));
      out.writeInt16LE(Math.round(s * 0x7fff), off);
      off += 2;
    }
  return out;
}
