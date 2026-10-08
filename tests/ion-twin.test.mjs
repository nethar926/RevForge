import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import {
  renderIonTwin,
  ION_TWIN_GESTURES,
  ION_TWIN_LOUDNESS_STATES,
} from '../scripts/ion-twin-render.mjs';
import { integratedLufs, readWav16 } from '../scripts/loudness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'), { interopDefault: true });
const voice = await jiti.import(join(root, 'src/audio/ionTwinVoice.ts'));

/** Integrated loudness of the voice before the Twin Ion closer pass (seeded, 3 s pre-roll, 6 s). */
const LOUDNESS_REF = { idle: -33.51, cruise: -13.76, full: -8.43 };
const LUFS_TOL = 0.5;

const lufsOf = (buf) =>
  integratedLufs(
    Array.from({ length: buf.numberOfChannels }, (_, c) => Float64Array.from(buf.getChannelData(c))),
    buf.sampleRate,
  );

function bandShare(x, sr, lo, hi) {
  // Coarse windowed DFT (every 2nd bin) on a centred 4096-sample frame — enough to check layer gating
  const n = 4096;
  const off = Math.max(0, Math.floor(x.length / 2) - n / 2);
  let inBand = 0;
  let total = 0;
  for (let k = 1; k < n / 2; k += 2) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const v = x[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
      re += v * Math.cos((2 * Math.PI * k * i) / n);
      im -= v * Math.sin((2 * Math.PI * k * i) / n);
    }
    const p = re * re + im * im;
    const f = (k * sr) / n;
    total += p;
    if (f >= lo && f < hi) inBand += p;
  }
  return inBand / Math.max(1e-30, total);
}

test('ion shaper curves are odd-length, symmetric and zero at zero (no DC offset)', () => {
  for (const amt of [0, 0.03, 0.2, 0.58, 1]) {
    const c = voice.ionShaper(amt);
    assert.equal(c.length % 2, 1);
    assert.equal(c[(c.length - 1) / 2], 0);
    for (let i = 0; i < c.length; i++) assert.ok(Math.abs(c[i] + c[c.length - 1 - i]) < 1e-6);
    assert.ok(Math.abs(c[c.length - 1] - 1) < 1e-6);
  }
  assert.equal(voice.ionShaperStep(0.512), Math.round(0.512 * 40) / 40);
});

test('level trim hits its anchors and stays within ±2 dB', () => {
  for (const [t, db] of voice.ION_TRIM_ANCHORS) assert.ok(Math.abs(voice.ionLevelTrimDb(t) - db) < 1e-9);
  for (let t = -0.2; t <= 1.2; t += 0.05) assert.ok(Math.abs(voice.ionLevelTrimDb(t)) <= 2);
});

test('howl wave has no fundamental and the motor wave is fundamental-led', () => {
  const calls = [];
  const fake = { createPeriodicWave: (re, im) => (calls.push([re, im]), {}) };
  voice.ionHowlWave(fake, 16);
  voice.ionMotorWave(fake);
  assert.equal(calls[0][1][1], 0);
  assert.ok(calls[0][1][2] > 0);
  assert.equal(calls[1][1][1], 1);
  assert.ok(calls[1][1][2] < 0.5);
});

test('live voice renders finite, audible and deterministic for a seed', async () => {
  const g = ION_TWIN_GESTURES.ref1;
  const a = await renderIonTwin(g.profile, 1.5, { layers: g.layers, preroll: 0.5, seed: 't' });
  const b = await renderIonTwin(g.profile, 1.5, { layers: g.layers, preroll: 0.5, seed: 't' });
  const x = a.getChannelData(0);
  const y = b.getChannelData(0);
  let peak = 0;
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    assert.ok(Number.isFinite(x[i]));
    peak = Math.max(peak, Math.abs(x[i]));
    diff = Math.max(diff, Math.abs(x[i] - y[i]));
  }
  assert.ok(peak > 0.005 && peak < 1, `peak ${peak}`);
  assert.equal(diff, 0);
});

test('motor-bed-only idle is dark; howl layer adds the 300–1600 Hz bellow', async () => {
  const motor = await renderIonTwin(ION_TWIN_GESTURES.ref2.profile, 1.2, {
    layers: ['motorBed'],
    preroll: 2,
    seed: 'g',
  });
  const howl = await renderIonTwin(ION_TWIN_GESTURES.ref6.profile, 1.2, {
    layers: ['formantHowl'],
    preroll: 3,
    seed: 'g',
  });
  const sr = motor.sampleRate;
  assert.ok(bandShare(motor.getChannelData(0), sr, 300, 1600) < 0.05);
  assert.ok(bandShare(howl.getChannelData(0), sr, 300, 1600) > 0.5);
});

test('live loudness holds idle / cruise / full within ±0.5 LU of the reference', async () => {
  for (const [k, state] of Object.entries(ION_TWIN_LOUDNESS_STATES)) {
    const buf = await renderIonTwin(() => state, 6, { preroll: 3, seed: `ion-twin-loud-${k}` });
    const l = lufsOf(buf);
    assert.ok(Math.abs(l - LOUDNESS_REF[k]) <= LUFS_TOL, `${k}: ${l.toFixed(2)} vs ${LOUDNESS_REF[k]}`);
  }
});

test('preview snippet sits at −20.4 LUFS', () => {
  const { channels, fs: sampleRate } = readWav16(readFileSync(join(root, 'public/snippets/ion-twin.wav')));
  const l = integratedLufs(channels, sampleRate);
  assert.ok(Math.abs(l - -20.4) < 0.1, `preview ${l.toFixed(2)} LUFS`);
});

test('new Twin Ion voice files stay free of franchise names', () => {
  const files = [
    'src/audio/ionTwinVoice.ts',
    'scripts/ion-twin-render.mjs',
    'docs/ion-twin-closer-match.md',
    'tests/ion-twin.test.mjs',
  ];
  // Built from fragments so this file stays clean
  const banned = [new RegExp(['x', '-?wing'].join(''), 'i'), new RegExp(['\\bt', 'ie\\b'].join(''), 'i')];
  for (const f of files) {
    const src = read(f);
    for (const re of banned) assert.doesNotMatch(src, re, `${f} matches ${re}`);
  }
});
