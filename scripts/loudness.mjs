/**
 * ITU-R BS.1770-4 integrated loudness (LUFS, K-weighted, 400 ms / 75 % overlap blocks,
 * −70 LUFS absolute + −10 LU relative gates) and sample peak (dBFS). Mono/stereo.
 * Used by render-snippets.mjs (preview level matching) and preview-loudness.mjs (report).
 */
function biquad(x, [b0, b1, b2, a0, a1, a2]) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function kWeight(x, fs) {
  // Stage 1: high shelf +4 dB @ 1.5 kHz; stage 2: RLB high-pass @ 38 Hz (RBJ forms, as pyloudnorm)
  let w0 = (2 * Math.PI * 1500) / fs, c = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2), A = 10 ** (4 / 40), sA = Math.sqrt(A);
  const shelf = [A * (A + 1 + (A - 1) * c + 2 * sA * al), -2 * A * (A - 1 + (A + 1) * c), A * (A + 1 + (A - 1) * c - 2 * sA * al),
    A + 1 - (A - 1) * c + 2 * sA * al, 2 * (A - 1 - (A + 1) * c), A + 1 - (A - 1) * c - 2 * sA * al];
  w0 = (2 * Math.PI * 38) / fs; c = Math.cos(w0); al = Math.sin(w0) / (2 * 0.5);
  const hp = [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
  return biquad(biquad(x, shelf), hp);
}
export function integratedLufs(channels, fs) {
  const k = channels.map((ch) => kWeight(ch, fs));
  const len = k[0].length, blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const z = [];
  for (let s = 0; s + blk <= len; s += hop) {
    let sum = 0;
    for (const ch of k) { let e = 0; for (let i = s; i < s + blk; i++) e += ch[i] * ch[i]; sum += e / blk; }
    z.push(sum);
  }
  const L = (e) => -0.691 + 10 * Math.log10(e + 1e-20);
  const abs = z.filter((e) => L(e) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((e) => L(e) > rel);
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}
export function samplePeakDb(channels) {
  let p = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
  return 20 * Math.log10(p + 1e-12);
}
/** 16-bit PCM WAV (as bufferToWav writes) → { fs, channels: Float64Array[] } */
export function readWav16(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 12, fs = 44100, nch = 2, data = null;
  while (o + 8 <= v.byteLength) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    const sz = v.getUint32(o + 4, true);
    if (id === 'fmt ') { nch = v.getUint16(o + 10, true); fs = v.getUint32(o + 12, true); }
    if (id === 'data') { data = [o + 8, sz]; break; }
    o += 8 + sz + (sz & 1);
  }
  const n = data[1] / 2 / nch;
  const channels = Array.from({ length: nch }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) channels[c][i] = v.getInt16(data[0] + (i * nch + c) * 2, true) / 32768;
  return { fs, channels };
}
