/**
 * Carrier Jet (Tomcat) wind trim vs ef4021e (the build Wilson tested): broadband air / wind layers
 * come down (TC_AIR) while the low end stays put — energy below 120 Hz and in 30–200 Hz within
 * ±0.5 dB, integrated loudness within 1.5 LU (wind cut lowers it a little; margin for timing noise under load) — at idle, mid, full (MIL) and AB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const { renderLive, channelsOf } = await imp('scripts/live-engine-render.mjs');
const { integratedLufs, samplePeakDb } = await imp('scripts/loudness.mjs');
const voice = await imp('src/audio/tomcatVoice.js');

let base = null;
try {
  base = mkdtempSync(join(tmpdir(), 'cj-wind-base-'));
  const tar = execFileSync('git', ['-C', root, 'archive', 'ef4021e', 'src', 'scripts', 'package.json'], { maxBuffer: 1 << 28 });
  writeFileSync(join(base, 'a.tar'), tar);
  execFileSync('tar', ['-xf', join(base, 'a.tar'), '-C', base]);
  symlinkSync(join(root, 'node_modules'), join(base, 'node_modules'));
} catch {
  base = null;
}
process.on('exit', () => base && rmSync(base, { recursive: true, force: true }));

/** RBJ biquad; 4th-order Butterworth LP / HP as two sections. */
function biquad(x, type, f0, q, sr) {
  const w = (2 * Math.PI * f0) / sr;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const a0 = 1 + al;
  const a1 = -2 * c;
  const a2 = 1 - al;
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
const lp = (x, f, sr) => biquad(biquad(x, 'lp', f, 0.5412, sr), 'lp', f, 1.3066, sr);
const hp = (x, f, sr) => biquad(biquad(x, 'hp', f, 0.5412, sr), 'hp', f, 1.3066, sr);
const db = (x) => 10 * Math.log10(x.reduce((s, v) => s + v * v, 0) / x.length + 1e-30);

const STATES = {
  idle: { speed: 0, throttle: 0, load: 0 },
  mid: { speed: 0.4, throttle: 0.5, load: 0.5 },
  full: { speed: 0.6, throttle: 0.8, load: 0.8 },
  ab: { speed: 1, throttle: 1, load: 1 },
};
async function bands(r, name) {
  const buf = await renderLive(() => STATES[name], 12, {
    root: r,
    patchId: 'aerospace-f14',
    seed: `wind-${name}`,
    fps: 30,
    onFrame: (e) => {
      if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower';
    },
  });
  const chs = channelsOf(buf, 7, 12);
  const sr = buf.sampleRate;
  const mono = chs[0].map((v, i) => (v + chs[1][i]) / 2);
  return { lufs: integratedLufs(chs, sr), low: db(lp(mono, 120, sr)), band: db(lp(hp(mono, 30, sr), 200, sr)), air: db(lp(hp(mono, 1000, sr), 4000, sr)), peak: samplePeakDb(chs) };
}

test('wind trim constants: wind layers −10.5 … −12 dB, filters only above the low end', () => {
  const A = voice.TC_AIR;
  const dB = (g) => 20 * Math.log10(g);
  assert.ok(dB(A.ramWind) <= -10 && dB(A.ramWind) >= -14);
  assert.ok(dB(A.ramBuffet) <= -10 && dB(A.ramBuffet) >= -14);
  assert.ok(dB(A.hot) <= -10 && dB(A.hot) >= -14);
  assert.ok(A.ramWind > 0 && A.hot > 0 && A.bed > 0, 'a faint touch stays');
  assert.ok(A.bedLpHz >= 300 && A.bodyLpHz >= 400, 'air LPs sit above the bass bands');
});

test('wind trim vs ef4021e: bass < 120 Hz and 30–200 Hz within ±0.5 dB, loudness within 1.5 LU, less air', { skip: !base && 'ef4021e not available' }, async () => {
  const rows = [];
  for (const name of Object.keys(STATES)) {
    const o = await bands(base, name);
    const n = await bands(root, name);
    rows.push(`${name}: <120 ${(n.low - o.low).toFixed(2)} · 30–200 ${(n.band - o.band).toFixed(2)} · LUFS ${(n.lufs - o.lufs).toFixed(2)} · 1–4 kHz ${(n.air - o.air).toFixed(2)} dB`);
    assert.ok(Math.abs(n.low - o.low) <= 0.5, `${name}: < 120 Hz ${(n.low - o.low).toFixed(2)} dB`);
    assert.ok(Math.abs(n.band - o.band) <= 0.5, `${name}: 30–200 Hz ${(n.band - o.band).toFixed(2)} dB`);
    assert.ok(Math.abs(n.lufs - o.lufs) <= 1.5, `${name}: ${(n.lufs - o.lufs).toFixed(2)} LU`);
    assert.ok(n.air <= o.air + 0.1, `${name}: air band must not rise`);
    if (name !== 'idle') assert.ok(n.air < o.air - 2.5, `${name}: air band ${(n.air - o.air).toFixed(2)} dB`);
    assert.ok(n.peak <= -1, `${name}: peak ${n.peak.toFixed(2)}`);
  }
  console.log(rows.join('\n'));
});
