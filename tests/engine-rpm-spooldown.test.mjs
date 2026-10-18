// Reported rpm: 0 with the engines off, realistic spool-down to exactly 0 (+ engineSpooledDown),
// rise from 0 on start, unchanged while running. Bridge unit tests + the live chain (offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'));
const B = await jiti.import(join(root, 'src/audio/engineStateBridge.ts'));
const TC = await jiti.import(join(root, 'src/audio/tomcatVoice.js'));

const STEP = 1 / 60;
const idle = { throttle: 0, rpmHint: 800 };
const RPM_KEYS = ['rpm', 'rpmL', 'rpmR'];

function assertSane(s, where) {
  for (const k of RPM_KEYS) {
    assert.equal(typeof s[k], 'number', `${where}: ${k} is a number`);
    assert.ok(Number.isFinite(s[k]) && s[k] >= 0, `${where}: ${k} = ${s[k]}`);
  }
  if (s.engineSpooledDown.left) assert.ok(Object.is(s.rpmL, 0), `${where}: left spooled → exactly 0`);
  if (s.engineSpooledDown.right) assert.ok(Object.is(s.rpmR, 0), `${where}: right spooled → exactly 0`);
  assert.equal(s.spooledDown, s.engineSpooledDown.left && s.engineSpooledDown.right);
  if (s.spooledDown) assert.ok(Object.is(s.rpm, 0), `${where}: spooled → rpm exactly 0`);
}

/** Bridge driven at 60 Hz: drive tick + power tick, returns the snapshot. */
function frame(b, raw = idle, dt = STEP) {
  b.tick(dt, raw);
  b.tickPower(dt);
  return b.snapshot();
}

/** The pre-change drive smoothing (rpm starts at 800, target rpmHint ?? 800 + thr * 4000). */
function legacyRpm(seq) {
  let rpm = 800;
  return seq.map(([dt, raw]) => {
    const d = Math.max(0.001, Math.min(0.25, dt));
    const thr = Math.max(0, Math.min(1, raw.throttle));
    const target = raw.rpmHint != null ? raw.rpmHint : 800 + thr * 4000;
    rpm += (target - rpm) * Math.min(1, d * 8);
    return rpm;
  });
}

test('engines off: rpm is exactly 0 and spooledDown, whatever the drive input (worklet rpm unchanged)', () => {
  const b = new B.EngineStateBridge();
  let s = b.snapshot();
  assert.ok(Object.is(s.rpm, 0));
  assert.deepEqual(s.engineSpooledDown, { left: true, right: true });
  assert.deepEqual(s.enginePhase, { left: 'off', right: 'off' });
  assert.equal(s.twinEngine, false);
  const seq = [];
  for (let i = 0; i < 120; i++) seq.push([STEP, { throttle: i < 60 ? 0.6 : 0 }]);
  const legacy = legacyRpm(seq);
  seq.forEach(([dt, raw], i) => {
    s = frame(b, raw, dt);
    assertSane(s, `off frame ${i}`);
    assert.ok(Object.is(s.rpm, 0) && s.spooledDown, `off frame ${i}: rpm ${s.rpm}`);
    // audio path: the worklet still gets the old drive rpm
    assert.equal(b.toWorkletParams().rpm, legacy[i]);
  });
});

test('running behaviour and idle unchanged: reported rpm == pre-change rpm once started', () => {
  const b = new B.EngineStateBridge();
  b.setEnginePower(true);
  b.tickPower(5); // start sequence done
  assert.equal(b.snapshot().enginePhase.left, 'run');
  const seq = [];
  for (let i = 0; i < 600; i++) {
    const thr = i < 120 ? 0 : i < 300 ? 0.8 : i < 420 ? 0.3 : 0;
    seq.push([STEP * (1 + (i % 3) * 0.1), i % 50 === 0 ? { throttle: thr } : { throttle: thr, rpmHint: i < 120 || i >= 420 ? 800 : undefined }]);
  }
  const legacy = legacyRpm(seq);
  seq.forEach(([dt, raw], i) => {
    const s = frame(b, raw, dt);
    assert.equal(s.rpm, legacy[i], `frame ${i}`);
    assert.equal(s.rpmL, legacy[i]);
    assert.equal(s.rpmR, legacy[i]);
    assert.equal(b.toWorkletParams().rpm, legacy[i]);
    assert.equal(s.spooledDown, false);
  });
  assert.equal(legacyRpm(seq).at(-1), b.snapshot().rpm);
  assert.ok(Math.abs(b.snapshot().rpm - 800) < 1e-6, 'idle still 800');
});

test('ICE shutdown: quick ~1–2 s spool-down to exactly 0, spooledDown flips, then stays 0', () => {
  for (const [from, lo, hi] of [[800, 0.9, 1.4], [3000, 1.4, 2.0], [6500, 1.6, 2.2]]) {
    const b = new B.EngineStateBridge();
    b.setEnginePower(true);
    b.tickPower(5);
    for (let i = 0; i < 240; i++) frame(b, { throttle: 0.5, rpmHint: from });
    assert.ok(Math.abs(b.snapshot().rpm - from) < 1);
    b.setEnginePower(false);
    let s = b.snapshot();
    assert.equal(s.enginePhase.left, 'shutdown');
    assert.equal(s.spooledDown, false);
    let prev = s.rpm;
    let t = 0;
    let zeroAt = null;
    for (let i = 0; i < 60 * 6; i++) {
      t += STEP;
      // drive input keeps idling (car sim) — must not hold the readout up
      s = frame(b, { throttle: 0.5, rpmHint: from });
      assertSane(s, `ICE ${from} t=${t.toFixed(3)}`);
      assert.ok(s.rpm <= prev, `monotonic ${s.rpm} > ${prev}`);
      prev = s.rpm;
      if (zeroAt === null && s.rpm === 0) zeroAt = t;
      if (zeroAt === null) assert.equal(s.spooledDown, false, 'not spooled while rpm > 0');
      else {
        assert.ok(Object.is(s.rpm, 0), 'stays exactly 0');
        assert.ok(s.spooledDown && s.engineSpooledDown.left);
        assert.equal(s.enginePhase.left, 'off');
      }
    }
    assert.ok(zeroAt !== null && zeroAt >= lo && zeroAt <= hi, `${from} rpm → 0 at ${zeroAt} s (want ${lo}–${hi})`);
    assert.ok(b.toWorkletParams().rpm > 0, 'worklet drive rpm untouched');
  }
});

test('ICE start: rpm rises from 0 with the start sequence (crank → catch → idle), no jump to 800', () => {
  const b = new B.EngineStateBridge();
  b.setSpoolProfile('ice', { startSeconds: 0.95 });
  for (let i = 0; i < 30; i++) frame(b);
  b.setEnginePower(true);
  let s = b.snapshot();
  assert.ok(Object.is(s.rpm, 0), 'start begins at 0');
  assert.equal(s.enginePhase.left, 'starting');
  assert.equal(s.spooledDown, false);
  let prev = 0;
  const samples = [];
  for (let i = 1; i <= 90; i++) {
    s = frame(b);
    assertSane(s, `start ${i}`);
    assert.ok(s.rpm >= prev - 1e-9, 'monotonic rise');
    prev = s.rpm;
    samples.push(s.rpm);
  }
  assert.ok(samples[5] < 100, `first 0.1 s ${samples[5]}`);
  const crank = samples[Math.round(0.5 * 60) - 1];
  assert.ok(crank > 150 && crank < 300, `cranking ≈ 30 %: ${crank}`);
  assert.equal(s.enginePhase.left, 'run');
  assert.equal(s.rpm, 800);
});

test('restart during a spool-down rises from the current rpm, not from 0 or 800', () => {
  const b = new B.EngineStateBridge();
  b.setEnginePower(true);
  b.tickPower(5);
  frame(b);
  b.setEnginePower(false);
  for (let i = 0; i < 20; i++) frame(b);
  const mid = b.snapshot().rpm;
  assert.ok(mid > 50 && mid < 800);
  b.setEnginePower(true);
  assert.ok(Math.abs(b.snapshot().rpm - mid) < 1e-9);
  frame(b);
  assert.ok(b.snapshot().rpm >= mid);
});

test('spool laws are closed form: one 1 s step == 60 small steps; snap below threshold', () => {
  let a = 2400;
  for (let i = 0; i < 60; i++) a = B.spoolDecay(a, 1 / 60, B.ICE_SPOOL_DOWN.tau, B.ICE_SPOOL_DOWN.k);
  const one = B.spoolDecay(2400, 1, B.ICE_SPOOL_DOWN.tau, B.ICE_SPOOL_DOWN.k);
  assert.ok(Math.abs(a - one) < 1e-9, `${a} vs ${one}`);
  assert.equal(B.spoolDecay(0.0003, 0, 1, 1), 0.0003);
  const b = new B.EngineStateBridge();
  b.setEnginePower(true);
  b.tickPower(5);
  frame(b, { throttle: 0, rpmHint: 800 }, 0.25);
  b.setEnginePower(false);
  // walk to just above zero in tiny steps: anything below RPM_ZERO_SNAP reads exactly 0
  for (let i = 0; i < 20000 && b.snapshot().rpm > 0; i++) {
    b.tickPower(0.0005);
    const r = b.snapshot().rpm;
    assert.ok(r === 0 || r >= B.RPM_ZERO_SNAP, `no lingering ${r}`);
  }
  assert.ok(Object.is(b.snapshot().rpm, 0));
  assert.equal(b.snapshot().spooledDown, true);
});

test('twin jet (real Tomcat drive model): left fuel cut spools down over seconds to 0, right keeps running', () => {
  const b = new B.EngineStateBridge();
  b.setSpoolProfile('jet', { twin: true });
  const st = TC.createTomcatDriveState('off');
  TC.tomcatSetColdMode(st, true);
  const phase = (e) => e.cold ?? 'off';
  const sync = () => b.setJetSpool({ phase: phase(st.a), n2: st.a.n2 }, { phase: phase(st.b), n2: st.b.n2 });
  const step = (dt = STEP) => {
    TC.stepTomcatDrive(st, { speed: 0, throttle: 0 }, dt, {});
    b.tickPower(dt);
    sync();
    return b.snapshot();
  };
  sync();
  let s = b.snapshot();
  assert.ok(Object.is(s.rpm, 0) && s.twinEngine);
  assert.deepEqual(s.engineSpooledDown, { left: true, right: true });
  TC.tomcatColdEngine(st, 0, true);
  TC.tomcatColdEngine(st, 1, true);
  let prevL = 0;
  for (let i = 0; i < 60 * 20; i++) {
    s = step();
    assertSane(s, `jet start ${i}`);
    assert.ok(s.rpmL >= prevL - 5, 'left rises from 0 with N2 (no jump)');
    prevL = s.rpmL;
  }
  assert.deepEqual(s.enginePhase, { left: 'run', right: 'run' });
  assert.ok(Math.abs(s.rpmL - 800) < 20 && Math.abs(s.rpmR - 800) < 20, `idle ${s.rpmL} / ${s.rpmR}`);
  assert.equal(s.rpm, Math.max(s.rpmL, s.rpmR));
  TC.tomcatColdEngine(st, 0, false);
  let t = 0;
  let zeroAt = null;
  prevL = s.rpmL;
  for (let i = 0; i < 60 * 16; i++) {
    t += STEP;
    s = step();
    assertSane(s, `jet L shutdown t=${t.toFixed(2)}`);
    assert.ok(s.rpmL <= prevL + 1e-9, 'left monotonic down');
    prevL = s.rpmL;
    assert.equal(s.engineSpooledDown.right, false);
    assert.ok(s.rpmR > 700, 'right engine keeps running');
    if (zeroAt === null && s.rpmL === 0) zeroAt = t;
    if (zeroAt === null) assert.equal(s.engineSpooledDown.left, false);
    else assert.ok(s.engineSpooledDown.left && Object.is(s.rpmL, 0));
  }
  // matches the voice's own fuel-cut rundown (TC_COLD.rundownTc 2.2 s → ~8.5 s from idle)
  assert.ok(zeroAt !== null && zeroAt > 5 && zeroAt < 11, `left → 0 at ${zeroAt}`);
  assert.equal(s.spooledDown, false);
});

test('jet plain stop (voice state reset to N2 0) still spools the readout down instead of snapping', () => {
  const b = new B.EngineStateBridge();
  b.setSpoolProfile('jet', { twin: true });
  b.setJetSpool({ phase: 'run', n2: TC.TC_IDLE_N2 }, { phase: 'run', n2: TC.TC_IDLE_N2 * 1.0014 });
  assert.ok(Math.abs(b.snapshot().rpmL - 800) < 1e-9);
  b.setJetSpool({ phase: 'off', n2: 0 }, { phase: 'off', n2: 0 });
  let s = b.snapshot();
  assert.ok(s.rpmL > 799, 'no snap to 0');
  assert.deepEqual(s.enginePhase, { left: 'shutdown', right: 'shutdown' });
  let t = 0;
  let zeroAt = null;
  for (let i = 0; i < 60 * 8; i++) {
    t += STEP;
    b.tickPower(STEP);
    b.setJetSpool({ phase: 'off', n2: 0 }, { phase: 'off', n2: 0 });
    s = b.snapshot();
    assertSane(s, `plain stop t=${t.toFixed(2)}`);
    if (zeroAt === null && s.rpm === 0) zeroAt = t;
  }
  assert.ok(zeroAt > 3 && zeroAt < 4.5, `quick-shutdown law ≈3.6 s, got ${zeroAt}`);
  assert.deepEqual(s.engineSpooledDown, { left: true, right: true });
});

test('rpm is always finite and >= 0: bad upstream values (NaN, ±Infinity, negative) fall back to 0', () => {
  const bad = [NaN, Infinity, -Infinity, -500, -1e-9, undefined, 1e308];
  for (const profile of ['ice', 'jet']) {
    const b = new B.EngineStateBridge();
    b.setSpoolProfile(profile, { twin: profile === 'jet', startSeconds: NaN });
    for (let k = 0; k < bad.length * 6; k++) {
      const v = bad[k % bad.length];
      const op = Math.floor(k / bad.length) % 6;
      if (op === 0) b.setEnginePower(true);
      if (op === 3) b.setEnginePower(false);
      if (profile === 'jet') {
        const ph = op < 3 ? (op === 0 ? 'starting' : 'run') : 'shutdown';
        b.setJetSpool({ phase: ph, n2: v }, { phase: ph, n2: -v });
      }
      b.tick(v, { throttle: v, rpmHint: v, load: v });
      b.tickPower(v);
      b.tickPower(STEP);
      assertSane(b.snapshot(), `${profile} k=${k} v=${v} op=${op}`);
      assert.ok(Number.isFinite(b.rpm) && b.rpm >= 0);
    }
  }
  assert.equal(B.finiteRpm(NaN), 0);
  assert.equal(B.finiteRpm(-3), 0);
  assert.equal(B.finiteRpm(Infinity), 0);
  assert.equal(B.jetN2ToRpm(NaN), 0);
});

// ── live chain (CharacterEngine → EngineSynthImpl), offline, audio-time clock ──
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);

async function trace(patchId, opts = {}) {
  const out = [];
  await renderLive(() => ({ speed: 0, throttle: 0 }), opts.dur ?? 12, {
    patchId,
    seed: `rpm-zero-${patchId}`,
    fps: 30,
    startAt: 0.5,
    driveBeforeStart: true,
    cues: [{ t: 5, cue: 'shutdown' }],
    onFrame: (engine, t) => {
      const s = engine.getEngineState?.();
      if (s) out.push({ t, ...s });
    },
  });
  return out;
}

test('live Carrier Jet / Tomcat: 0 before start, rises with the start sequence, SHUTDOWN cue runs L/R down to 0', async () => {
  const tr = await trace('aerospace-f14', { dur: 12 });
  assert.ok(tr.length > 300, 'CharacterEngine exposes getEngineState()');
  for (const s of tr) assertSane(s, `live jet t=${s.t.toFixed(2)}`);
  const before = tr.filter((s) => s.t < 0.5 - 1e-6);
  assert.ok(before.length && before.every((s) => Object.is(s.rpm, 0) && s.spooledDown), 'off before start');
  assert.ok(tr.every((s) => s.twinEngine));
  const early = tr.find((s) => s.t >= 0.6);
  assert.ok(early.rpm < 200, `no jump on start: ${early.rpm}`);
  const run = tr.filter((s) => s.t > 4 && s.t < 5);
  assert.ok(run.every((s) => s.enginePhase.left === 'run' && s.rpmL > 750 && s.rpmL < 900 && s.rpmR > 750), 'idle ≈ 800');
  const after = tr.filter((s) => s.t > 5.05);
  const zero = after.find((s) => s.spooledDown);
  assert.ok(zero, 'spooled down');
  // voice quick shutdown (B 0.15 s after A, N2 rundown ≈3.6 s)
  assert.ok(zero.t - 5 > 2.5 && zero.t - 5 < 5.5, `0 after ${(zero.t - 5).toFixed(2)} s`);
  assert.ok(after.filter((s) => s.t > zero.t).every((s) => Object.is(s.rpm, 0) && s.spooledDown));
  const mid = tr.find((s) => s.t > 6);
  assert.ok(mid.rpm > 50 && mid.rpm < 800 && !mid.spooledDown, `still spooling at 6 s: ${mid.rpm}`);
});

test('live single-engine pack: rpm 0 → rises on start → 800 idle → SHUTDOWN cue → exactly 0 in ~1–2 s', async () => {
  const tr = await trace('ev-whine', { dur: 9 });
  for (const s of tr) assertSane(s, `live single t=${s.t.toFixed(2)}`);
  assert.ok(tr.filter((s) => s.t < 0.5 - 1e-6).every((s) => Object.is(s.rpm, 0)));
  assert.ok(tr.every((s) => !s.twinEngine && s.rpmL === s.rpmR && s.rpm === s.rpmL));
  assert.ok(tr.filter((s) => s.t > 2 && s.t < 5).every((s) => s.rpm === 800 && s.enginePhase.left === 'run'));
  const zero = tr.find((s) => s.t > 5 && s.spooledDown);
  assert.ok(zero && zero.t - 5 > 0.8 && zero.t - 5 < 2, `0 after ${zero && (zero.t - 5).toFixed(2)} s`);
});
