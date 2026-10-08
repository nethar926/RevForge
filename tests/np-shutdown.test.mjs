/**
 * Night Pursuit key-off: ignition cut → run-down with individually audible, chunky pulses over a
 * full low end → heavy shudder / clunk → dark settle → faint tick. 2–3 s, never above idle + 6 dB
 * (100 ms), integrated within idle + 1.5 dB, opens at the idle level, the running engine is cut
 * at the key, the cue is interruptible (throttle / restart), the generic character sweep is not
 * layered on top. Procedural only; no storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = await import('../src/audio/npShutdownCue.js');
const { renderLive } = await import('../scripts/live-render.mjs');
const NP = 'night-pursuit';
const SR = 44100;
const rmsDb = (x, a, b, sr = SR) => {
  let s = 0;
  const i0 = Math.round(a * sr), i1 = Math.min(x.length, Math.round(b * sr));
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-20);
};
const busOf = (e) => e.base?.g?.npBus ?? e.g?.npBus;
const implOf = (e) => e.base ?? e;
const idle = () => ({ speed: 0, throttle: 0, load: 0 });

test('cue: residual fires then decelerating cross-plane pulses, crank stops, shudder, 2–3 s', () => {
  for (const rpm of [660, 2500]) {
    const r = C.renderNightPursuitShutdown(24000, { rpm, idleRpm: 660 }, C.npShutdownRand(5));
    assert.ok(r.duration >= 2 && r.duration <= 3, `${rpm}: ${r.duration.toFixed(2)} s`);
    const fires = r.events.filter((e) => e.kind === 'fire');
    assert.ok(fires.length >= 1 && fires.length <= 3, `${rpm}: ${fires.length} residual fires`);
    assert.ok(fires.every((e) => e.t < C.NP_SHUTDOWN_FIRE_S), 'fires only right after the cut');
    const iv = r.events.slice(1).map((e, i) => e.t - r.events[i].t);
    const head = iv.slice(0, 5).reduce((a, b) => a + b) / 5;
    const tail = iv.slice(-4).reduce((a, b) => a + b) / 4;
    assert.ok(tail > 3 * head, `${rpm}: run-down slows (${(head * 1000).toFixed(0)} → ${(tail * 1000).toFixed(0)} ms)`);
    assert.ok(tail > 0.06, 'last pulses are individually spaced (> 60 ms)');
    assert.deepEqual(r.events.slice(0, 8).map((e) => e.bank), C.NP_SHUTDOWN_BANKS, 'cross-plane bank pattern');
    assert.ok(r.shudderAt > r.events.at(-1).t && r.shudderAt < r.duration - 0.8, 'shudder after the last pulse, then the settle');
    let pk = 0;
    for (const v of r.data) pk = Math.max(pk, Math.abs(v));
    assert.ok(pk < 0.96 && pk > 0.2, `calibrated, under the ceiling (${pk.toFixed(2)})`);
  }
  assert.ok(C.npRundownSeconds(2500) > C.npRundownSeconds(660), 'longer run-down from higher revs');
});

test('cue: pulses are audible one by one; tick optional; reproducible from the seed', () => {
  const sr = 24000;
  const a = C.renderNightPursuitShutdown(sr, { rpm: 660, idleRpm: 660 }, C.npShutdownRand(9));
  const b = C.renderNightPursuitShutdown(sr, { rpm: 660, idleRpm: 660 }, C.npShutdownRand(9));
  assert.deepEqual(a.data, b.data, 'same seed → same cue');
  // Each pulse after the first 0.3 s rises clearly out of the gap before it
  let ok = 0, n = 0;
  for (const e of a.events.filter((e) => e.t > 0.3)) {
    n++;
    if (rmsDb(a.data, e.t, e.t + 0.02, sr) > rmsDb(a.data, e.t - 0.012, e.t - 0.002, sr) + 3) ok++;
  }
  assert.ok(n >= 6 && ok / n >= 0.8, `separate pulses (${ok}/${n})`);
  const quiet = C.renderNightPursuitShutdown(sr, { rpm: 660, idleRpm: 660, tick: 0 }, C.npShutdownRand(9));
  let d = 0;
  for (let i = 0; i < a.data.length; i++) d = Math.max(d, Math.abs(a.data[i] - quiet.data[i]));
  assert.ok(d > 0.005, 'tick present by default');
  assert.ok(d < 0.2, 'tick stays faint');
});

test('shipped engine: key-off cuts the engine, cue held through stop(), never above idle + 6 dB', async () => {
  for (const [label, profile, at] of [
    ['idle', idle, 1.5],
    ['coasting 2.5k', (t) => (t < 1.5 ? { speed: 0, throttle: 0.6, load: 0.3, rpm: 900 + 1600 * Math.min(1, t / 1.2) } : { speed: 0, throttle: 0, load: 0, rpm: 2500 }), 1.55],
  ]) {
    const seen = {};
    const cues = [
      { t: at, run: (e) => { e.playShutoff(); e.stop(); } },
      { t: at + 0.15, run: (e) => (seen.key = busOf(e).key.gain.value) },
    ];
    const buf = await renderLive(NP, profile, at + 3.4, { cues, seed: 21 });
    const x = buf.getChannelData(0);
    const ref = label === 'idle' ? rmsDb(x, 0.9, 1.5) : null;
    seen.idleRef = ref;
    const idleBuf = label === 'idle' ? null : await renderLive(NP, idle, 2, { seed: 22 });
    const idleDb = ref ?? rmsDb(idleBuf.getChannelData(0), 1.2, 2.0);
    let worst = -200;
    // From the moment the ignition is cut (30 ms fade): whatever the engine was doing before is not the cue
    for (let t = at + 0.05; t < at + 3.0; t += 0.1) worst = Math.max(worst, rmsDb(x, t, t + 0.1));
    console.log(`${label}: key-off max 100 ms ${(worst - idleDb).toFixed(2)} dB over idle`);
    assert.ok(worst <= idleDb + 6, `${label}: max 100 ms ${worst.toFixed(1)} dB vs idle ${idleDb.toFixed(1)} dB`);
    assert.ok(seen.key < 0.01, `${label}: running engine cut at the key (${seen.key})`);
    assert.ok(rmsDb(x, at + 0.5, at + 1.0) > idleDb - 20, `${label}: run-down audible, not cut by stop()`);
    assert.ok(rmsDb(x, at + 3.1, at + 3.4) < -80, `${label}: silent once the cue has finished`);
  }
});

// Band energy (dB) through a 4th-order band split (RBJ 2nd-order high-pass + low-pass, twice)
function bandDb(x, sr, lo, hi) {
  const biq = (y, hz, hp) => {
    const w = (2 * Math.PI * hz) / sr, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
    const b0 = (hp ? (1 + c) / 2 : (1 - c) / 2) / a0, b1 = (hp ? -(1 + c) : 1 - c) / a0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
    const o = new Float64Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = b0 * y[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v;
    }
    return o;
  };
  let y = Float64Array.from(x);
  if (lo > 0) y = biq(biq(y, lo, true), lo, true);
  if (hi) y = biq(biq(y, hi, false), hi, false);
  let e = 0;
  for (const v of y) e += v * v;
  return 10 * Math.log10(e / y.length + 1e-20);
}

test('body: low end carries the cue (40–150 Hz fundamental, 150–400 Hz thumps), the settle stays dark', () => {
  const sr = 22050;
  const r = C.renderNightPursuitShutdown(sr, { rpm: 660, idleRpm: 660 }, C.npShutdownRand(7));
  const all = bandDb(r.data, sr, 0, 0);
  const low = bandDb(r.data, sr, 40, 150);
  const lowMid = bandDb(r.data, sr, 150, 400);
  const air = bandDb(r.data, sr, 600, 0);
  assert.ok(low > all - 5.5, `40–150 Hz is the core of the cue (${(low - all).toFixed(1)} dB re all)`);
  assert.ok(lowMid > low - 14, `cylinder thumps have real low-mid weight (${(lowMid - low).toFixed(1)} dB re 40–150)`);
  assert.ok(air < low - 25, `no airy top (${(air - low).toFixed(1)} dB re 40–150)`);
  // Fundamental / pipes keep sounding through the whole coast-down, not just the first fires
  const seg = (a, b) => r.data.subarray(Math.round(a * sr), Math.round(b * sr));
  const early = bandDb(seg(0.05, 0.35), sr, 40, 150);
  const late = bandDb(seg(0.55, r.stopAt), sr, 40, 150);
  assert.ok(late > early - 6, `low end holds as the revs fall (${(late - early).toFixed(1)} dB)`);
  // The settle after the shudder is pipe ring, not a hiss: dark and well under the run-down
  const settle = seg(r.shudderAt + 0.25, r.shudderAt + 0.6);
  assert.ok(bandDb(settle, sr, 400, 0) < bandDb(settle, sr, 40, 400) - 15, 'settle is dark');
  assert.ok(bandDb(settle, sr, 0, 0) < bandDb(seg(0.1, r.stopAt), sr, 0, 0) - 10, 'settle does not dominate');
});

test('shipped engine (HIG master): fuller but no surprise - integrated <= idle + 1.5 dB, idle-level handoff', async () => {
  const { integratedLufs } = await import('../scripts/loudness.mjs');
  const at = 3.0; // after the post-start fast idle has settled into the idle loop
  // playShutoff() alone: the cue keys the engine off itself (no immediate stop() in an offline render)
  const cues = [{ t: at, run: (e) => e.playShutoff() }];
  const buf = await renderLive(NP, idle, at + 2.8, { master: true, cues, seed: 26 });
  const ch = [0, 1].map((c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
  const seg = (a, b) => ch.map((x) => x.subarray(Math.round(a * SR), Math.round(b * SR)));
  const idleL = integratedLufs(seg(1.6, at), SR);
  const cueL = integratedLufs(seg(at, at + 2.6), SR);
  console.log(`key-off integrated ${(cueL - idleL).toFixed(2)} dB vs idle`);
  assert.ok(cueL <= idleL + 1.5, `integrated ${cueL.toFixed(2)} vs idle ${idleL.toFixed(2)} LUFS`);
  assert.ok(cueL >= idleL - 1.5, `the key-off has body: not much quieter than idle (${(cueL - idleL).toFixed(2)} dB)`);
  const x = ch[0];
  // The idle is lumpy (±3 dB per 50 ms): compare the first 50 ms of the key-off with the idle's mean power
  const before = rmsDb(x, at - 1.0, at);
  const after = rmsDb(x, at, at + 0.05);
  assert.ok(Math.abs(after - before) < 2.5, `no level jump at the key (${(after - before).toFixed(2)} dB)`);
  let pk = 0;
  for (const c of seg(at, at + 2.6)) for (const v of c) pk = Math.max(pk, Math.abs(v));
  assert.ok(20 * Math.log10(pk) < -6, `well under full scale (${(20 * Math.log10(pk)).toFixed(1)} dBFS)`);
});

test('interruptible: a throttle press mid-cue brings the engine back in ~300 ms; restart too', async () => {
  const seen = {};
  const cues = [
    { t: 1.0, run: (e) => e.playShutoff() },
    { t: 1.3, run: (e) => { seen.cueBefore = !!implOf(e).npCue; seen.keyBefore = busOf(e).key.gain.value; } },
    { t: 1.75, run: (e) => { seen.cue = implOf(e).npCue; seen.key = busOf(e).key.gain.value; } },
  ];
  const profile = (t) => (t < 1.4 ? idle() : { speed: 0, throttle: 0.7, load: 0.3 });
  const buf = await renderLive(NP, profile, 2.2, { cues, seed: 23 });
  assert.equal(seen.cueBefore, true);
  assert.ok(seen.keyBefore < 0.01, 'engine off during the cue');
  assert.equal(seen.cue, null, 'cue handed over');
  assert.ok(seen.key > 0.95, `engine back 350 ms after the press (${seen.key.toFixed(2)})`);
  const x = buf.getChannelData(0);
  assert.ok(rmsDb(x, 1.8, 2.2) > rmsDb(x, 0.6, 1.0) - 3, 'live engine audible again');

  const r = {};
  const cues2 = [
    { t: 1.0, run: (e) => { e.playShutoff(); e.stop(); } },
    { t: 1.4, run: async (e) => { await e.start(); } },
    { t: 1.85, run: (e) => { r.cue = implOf(e).npCue; r.key = busOf(e).key.gain.value; } },
  ];
  await renderLive(NP, idle, 2.0, { cues: cues2, seed: 24 });
  assert.equal(r.cue, null, 'restart cancels the cue');
  assert.ok(r.key > 0.95, `restart: engine back (${r.key?.toFixed(2)})`);
});

test('the generic character shutdown sweep is not layered on the Night Pursuit key-off', async () => {
  const calls = { np: [], other: [] };
  for (const [pack, list] of [[NP, calls.np], ['v8-rumble', calls.other]]) {
    const cues = [{ t: 0.6, run: (e) => {
      const fx = e.fx;
      const orig = fx.cue.bind(fx);
      fx.cue = (type) => { list.push(type); return orig(type); };
      e.playShutoff?.();
      e.stop();
    } }];
    await renderLive(pack, idle, 1.0, { cues, seed: 25 });
  }
  assert.ok(!calls.np.includes('shutdown'), 'Night Pursuit: own key-off only');
  assert.ok(calls.other.includes('shutdown'), 'other packs keep the generic sweep');
});

test('key-off cue source stays procedural and storage-free', () => {
  for (const f of ['src/audio/npShutdownCue.js', 'src/audio/nightPursuitVoice.js']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(src, /decodeAudioData|fetch\(|createConvolver|\.wav\b/);
  }
});
