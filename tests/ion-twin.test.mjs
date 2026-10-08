import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import {
  renderIonTwin,
  ionTwinCueModule as cues,
  ION_TWIN_GESTURES,
  ION_TWIN_LOUDNESS_STATES,
  ION_TWIN_ROLES,
} from '../scripts/ion-twin-render.mjs';
import { integratedLufs, readWav16 } from '../scripts/loudness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'), { interopDefault: true });
const voice = await jiti.import(join(root, 'src/audio/ionTwinVoice.ts'));

/** Integrated loudness of the 36fa525 voice (seeded, 3 s pre-roll, 6 s) — the cue-map pass holds it. */
const LOUDNESS_REF = { idle: -33.57, cruise: -13.78, full: -8.08 };
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

test('level trim hits its anchors and stays within ±4 dB', () => {
  for (const [t, db] of voice.ION_TRIM_ANCHORS) assert.ok(Math.abs(voice.ionLevelTrimDb(t) - db) < 1e-9);
  for (let t = -0.2; t <= 1.2; t += 0.05) assert.ok(Math.abs(voice.ionLevelTrimDb(t)) <= 4);
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
    'src/audio/ionTwinCues.ts',
    'scripts/ion-twin-render.mjs',
    'docs/ion-twin-closer-match.md',
    'tests/ion-twin.test.mjs',
  ];
  // Built from fragments so this file stays clean
  const banned = [
    new RegExp(['x', '-?wing'].join(''), 'i'),
    new RegExp(['\\bt', 'ie\\b'].join(''), 'i'),
    new RegExp(['im', 'pulse'].join(''), 'i'),
  ];
  for (const f of files) {
    const src = read(f);
    for (const re of banned) assert.doesNotMatch(src, re, `${f} matches ${re}`);
  }
});

/** 50 ms RMS envelope (dB) of the channel mean. */
function envDb(buf, hop = 0.05) {
  const a = buf.getChannelData(0);
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const n = Math.round(buf.sampleRate * hop);
  const out = [];
  for (let k = 0; k + n <= a.length; k += n) {
    let s = 0;
    for (let i = k; i < k + n; i++) s += ((a[i] + b[i]) / 2) ** 2;
    out.push(10 * Math.log10(s / n + 1e-12));
  }
  return out;
}
function corr(x, y) {
  const n = Math.min(x.length, y.length);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}
const roleRender = (id, extra = {}) => {
  const r = ION_TWIN_ROLES[id];
  return renderIonTwin(r.profile, extra.dur ?? r.dur, { preroll: 3, seed: `t-${id}`, actions: r.actions, ...extra });
};

test('cue buffers are deterministic and ignition is the exact time-reverse of the shutdown', async () => {
  const set = await cues.ionTwinCues(44100);
  for (let c = 0; c < 2; c++) {
    const s = set.shutdown.getChannelData(c);
    const g = set.ignition.getChannelData(c);
    assert.equal(s.length, g.length);
    for (let i = 0; i < s.length; i += 97) assert.equal(g[i], s[s.length - 1 - i]);
  }
  const again = await cues.renderIonCue(44100, cues.ION_TARGET_SECONDS, cues.buildIonTarget);
  const a = set.target.getChannelData(0);
  const b = again.buffer.getChannelData(0);
  for (let i = 0; i < a.length; i += 101) assert.equal(a[i], b[i]);
  // Click-free ends
  for (const buf of [set.shutdown, set.ignition, set.target]) {
    const x = buf.getChannelData(0);
    assert.ok(Math.abs(x[0]) < 1e-3 && Math.abs(x[x.length - 1]) < 1e-3);
  }
});

test('ignition as played = reversed shutdown as played (envelope correlation)', async () => {
  const ign = envDb(await roleRender('ignition'));
  const sd = envDb(await roleRender('shutdown'));
  const T = cues.ION_SHUTDOWN_SECONDS;
  const hop = 0.05;
  // Ignition 0.5–10 s (before it lands in the hum) vs the shutdown read backwards
  const xs = [];
  const ys = [];
  for (let t = 0.5; t < 10; t += hop) {
    xs.push(ign[Math.round(t / hop)]);
    ys.push(sd[Math.round((T - t) / hop) - 1]);
  }
  const r = corr(xs, ys);
  assert.ok(r > 0.9, `envelope correlation ${r.toFixed(3)}`);
});

test('ignition hands over to live input within ~0.3 s and never blocks the throttle', async () => {
  const r = ION_TWIN_ROLES.ignition;
  const drive = (t) => (t < 2 ? { speed: 0, throttle: 0 } : { speed: 0.3, throttle: 0.6 });
  const buf = await renderIonTwin(drive, 4, { preroll: 3, seed: 't-handover', actions: r.actions });
  const e = envDb(buf);
  // Live voice is up by 2.5 s (0.3 s crossfade + control latency) and stays up
  const before = e[Math.round(1.8 / 0.05)];
  const after = Math.min(...e.slice(Math.round(2.5 / 0.05), Math.round(3.9 / 0.05)));
  assert.ok(after > before - 3, `after ${after.toFixed(1)} vs before ${before.toFixed(1)} dB`);
  for (let i = Math.round(1.5 / 0.05); i < e.length - 1; i++) {
    assert.ok(Math.abs(e[i + 1] - e[i]) < 6, `step ${(e[i + 1] - e[i]).toFixed(1)} dB at ${(i * 0.05).toFixed(2)} s`);
  }
});

test('initial acceleration swells, then crossfades into the sustain without a step', async () => {
  const r = ION_TWIN_ROLES.acceleration;
  const drive = (t) => r.profile(Math.min(t, r.dur));
  const buf = await renderIonTwin(drive, 8, { preroll: 3, seed: 't-accel' });
  // 200 ms windows: the low-rpm howl beats faster than that, so shorter windows see texture, not level
  const hop = 0.2;
  const e = envDb(buf, hop);
  const at = (t) => e[Math.round(t / hop)];
  // Swell: quieter early in the phrase than at its peak
  assert.ok(at(1.0) < at(3.2) - 4, `swell ${at(1.0).toFixed(1)} → ${at(3.2).toFixed(1)}`);
  // Pull-away rises no faster than the ref1 onset (~9 dB per 200 ms); phrase ends ≈3.3 s with no
  // step into the sustain
  for (let i = 0; i < e.length - 1; i++) {
    const lim = i * hop < 1.6 ? 9 : 2;
    assert.ok(Math.abs(e[i + 1] - e[i]) < lim, `step ${(e[i + 1] - e[i]).toFixed(1)} dB at ${(i * hop).toFixed(2)} s`);
  }
  const pre = (at(2.8) + at(3.0) + at(3.2)) / 3;
  const post = (at(4.0) + at(4.2) + at(4.4)) / 3;
  assert.ok(Math.abs(post - pre) < 2, `handover ${pre.toFixed(1)} → ${post.toFixed(1)} dB`);
});

test('targeting cue fires once per lock (and respects the lock-sfx enable)', async () => {
  // rpm ramps through the ladder (identified .50 / lock .70 / kill .86, 4% hysteresis)
  const ramp = (t, t0, t1, a, b) => a + (b - a) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  // Up into lock and wobble inside it: one cue
  const up = (t) => ({ speed: ramp(t, 0.5, 1.5, 0.3, 0.78) + 0.05 * Math.sin(t * 9), throttle: 0.6 });
  // Up, back out below the .66 exit, up again: two cues
  const upDownUp = (t) => ({
    speed: t < 2.5 ? ramp(t, 0.5, 1.5, 0.3, 0.78) : t < 4 ? ramp(t, 2.5, 3, 0.78, 0.55) : ramp(t, 4, 4.5, 0.55, 0.78),
    throttle: 0.6,
  });
  const count = async (profile, dur, enable) => {
    let eng;
    await renderIonTwin(profile, dur, {
      preroll: 0.5,
      seed: 't-lock',
      onEngine: (e) => {
        eng = e;
        e.setLockSfxEnabled(enable);
      },
    });
    return eng.base.ionCueCounts.target;
  };
  assert.equal(await count(up, 3, true), 1);
  assert.equal(await count(upDownUp, 6, true), 2);
  assert.equal(await count(up, 3, false), 0);
});

