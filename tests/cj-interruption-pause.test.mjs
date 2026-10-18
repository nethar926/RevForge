/**
 * HIG interruption pause on the Carrier Jet line: the jet cue bus (and so the stall / master-caution
 * warning tones) runs through the playback session's master bus, fades to silence on an OS
 * interruption, stays silent while interrupted, and ramps back in from silence when it ends —
 * without clicks, and with the stall loop still active (warning state survives the pause).
 *
 * Offline render of the shipped chain (CharacterEngine → EngineSynthImpl → jet cue bus → Tomcat pad →
 * engine master → limiter) into createMasterBus() on the same OfflineAudioContext. The session's
 * lifecycle events come from a fake context (as in tests/playback-session.test.mjs): the audio runs
 * on the offline renderer. Cold start is on with every system off, so the engines are dark and the
 * stall tone is the only sound. Click checks use the engine tap (tap: 'base') — the offline car
 * wrapper stage adds quantum-boundary steps to any tone (see tests/cj-warning-tones.test.mjs) — and
 * a second render through the full wrapper output checks the pause / resume levels end to end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const { renderColdStart } = await imp('tests/cj-cold-start-render.mjs');
const PS = await createJiti(join(root, 'package.json')).import(join(root, 'src/audio/playbackSession.ts'));

const PARK = () => ({ speed: 0, throttle: 0, load: 0 });
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const maxStep = (x) => x.reduce((m, v, i) => (i ? Math.max(m, Math.abs(v - x[i - 1])) : 0), 0);
function power(x, f, sr) {
  const k = 2 * Math.cos((2 * Math.PI * f) / sr);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s0 = x[i] + k * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - k * s1 * s2) / (x.length * x.length);
}

/* lifecycle fakes (same shape as tests/playback-session.test.mjs) */
class Target {
  constructor() {
    this.l = new Map();
  }
  addEventListener(t, f) {
    (this.l.get(t) ?? this.l.set(t, new Set()).get(t)).add(f);
  }
  removeEventListener(t, f) {
    this.l.get(t)?.delete(f);
  }
  emit(t) {
    for (const f of [...(this.l.get(t) ?? [])]) f({ type: t });
  }
}
class FakeCtx extends Target {
  constructor() {
    super();
    this.state = 'running';
    this.currentTime = 0;
    this.suspends = 0;
    this.resumes = 0;
  }
  async resume() {
    this.resumes++;
    this.state = 'running';
    this.emit('statechange');
  }
  async suspend() {
    this.suspends++;
    this.state = 'suspended';
    this.emit('statechange');
  }
  setState(s) {
    this.state = s;
    this.emit('statechange');
  }
}
function fakeEnv() {
  const dom = new Target();
  dom.visibilityState = 'visible';
  const timers = [];
  let t = 0;
  const e = {
    document: dom,
    window: new Target(),
    navigator: {},
    legacyMediaFlag: () => true,
    MediaMetadata: null,
    createAudioElement: null,
    setTimeout: (fn, ms) => {
      const id = { fn, at: t + ms };
      timers.push(id);
      return id;
    },
    clearTimeout: (id) => {
      const i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => t,
  };
  const advance = (ms) => {
    t += ms;
    for (const id of [...timers])
      if (id.at <= t) {
        timers.splice(timers.indexOf(id), 1);
        id.fn();
      }
  };
  return { e, dom, advance };
}

const ON = 0.3; // stall active
const INT = 1.0; // OS interruption (phone call / Siri)
const END = 2.0; // interruption over → auto-resume
const DUR = 3.0;

/** Render with the session; returns the buffer, the session and the event times actually hit. */
async function renderPaused(tap) {
  const h = fakeEnv();
  const s = new PS.PlaybackSession({ env: h.e });
  const lc = new FakeCtx();
  const at = {};
  const seen = {};
  let bus = null;
  const timeline = [
    [0.2, '', (e) => e.setWarningsEnabled(true)],
    [ON, '', (e) => e.setWarning('stall', true)],
    [
      INT,
      '',
      (e) => {
        at.int = e.context.currentTime;
        lc.setState('interrupted');
        seen.paused = s.getSnapshot();
      },
    ],
    [
      INT + 0.4,
      '',
      (e) => {
        h.advance(PS.FADE_OUT_S * 1000 + 25); // post-fade timer (media element pause)
        seen.during = e.getWarnings();
        seen.lcState = lc.state;
      },
    ],
    [
      END,
      '',
      (e) => {
        at.end = e.context.currentTime;
        lc.setState('running'); // the OS hands the context back
      },
    ],
    [
      END + 0.5,
      '',
      (e) => {
        seen.after = e.getWarnings();
        seen.resumed = s.getSnapshot();
      },
    ],
  ];
  const buf = await renderColdStart(timeline, DUR, {
    profile: PARK,
    seed: 'cj-interruption',
    ...(tap ? { tap } : {}),
    onReady: (engine) => {
      const ctx = engine.context;
      bus = PS.createMasterBus(ctx);
      const out = tap === 'base' ? engine.base.output : engine.output;
      out.disconnect();
      out.connect(bus.input);
      bus.fade.gain.value = 1; // engines are dark (cold start): nothing to ramp over
      s.attach(lc, bus);
      s.markRunning();
    },
  });
  return { buf, s, lc, at, seen };
}

test('interruption pauses the jet cue bus: stall fades to silence, resumes from silence without clicks, loop state survives', async () => {
  const { buf, lc, at, seen } = await renderPaused('base');
  const sr = buf.sampleRate;
  const i = (t) => Math.round(t * sr);
  // session: paused on the interruption, back to running when it ends
  assert.equal(seen.paused.state, 'paused');
  assert.equal(seen.paused.reason, 'interrupted');
  // an OS-interrupted context is left to the OS (the session only suspends a context still running)
  assert.equal(seen.lcState, 'interrupted');
  assert.equal(lc.suspends, 0);
  assert.equal(lc.resumes, 0, 'the OS resumed it: no ctx.resume() needed');
  assert.equal(seen.resumed.state, 'running', 'auto-resumed when the interruption ended');
  // warning state is untouched by the pause (Frontend's stall condition still holds)
  assert.deepEqual(seen.during, { enabled: true, stall: true, masterCaution: false });
  assert.deepEqual(seen.after, { enabled: true, stall: true, masterCaution: false });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    assert.ok(x.every(Number.isFinite), 'finite');
    const steadyPk = peak(x.subarray(i(ON + 0.2), i(INT - 0.02)));
    const steadyStep = maxStep(x.subarray(i(ON + 0.2), i(INT - 0.02)));
    assert.ok(db(steadyPk) > -30, `stall audible before the interruption (${db(steadyPk).toFixed(1)} dBFS)`);
    // fade: silent within 150 ms (+ a couple of render quanta), silent for the whole interruption
    const quiet = peak(x.subarray(i(at.int + PS.FADE_OUT_S + 0.01), i(at.end)));
    assert.ok(db(quiet) < -90, `silent while interrupted (${db(quiet).toFixed(1)} dBFS)`);
    // resume: through silence, then a 250 ms ramp back to the same level, never louder
    const preRamp = peak(x.subarray(i(at.end), i(at.end + 0.012)));
    assert.ok(preRamp < steadyPk * 0.08, `resume starts from silence (${db(preRamp / steadyPk).toFixed(1)} dB)`);
    const mid = peak(x.subarray(i(at.end + 0.06), i(at.end + 0.09)));
    assert.ok(mid < steadyPk * 0.6, 'still ramping ≈ 75 ms after the resume');
    const back = peak(x.subarray(i(at.end + 0.35), i(DUR - 0.05)));
    assert.ok(Math.abs(db(back) - db(steadyPk)) < 0.5, `back at the pre-interruption level (${db(back).toFixed(2)} vs ${db(steadyPk).toFixed(2)} dBFS)`);
    assert.ok(peak(x.subarray(i(at.end), i(DUR))) <= steadyPk * 1.01, 'never louder than before');
    // no clicks: the fade and the ramp never step harder than the steady tone
    const fadeStep = maxStep(x.subarray(i(at.int - 0.02), i(at.int + 0.2)));
    const rampStep = maxStep(x.subarray(i(at.end - 0.02), i(at.end + 0.3)));
    assert.ok(fadeStep <= steadyStep * 1.02, `fade step ${fadeStep.toExponential(2)} ≤ steady ${steadyStep.toExponential(2)}`);
    assert.ok(rampStep <= steadyStep * 1.02, `ramp step ${rampStep.toExponential(2)} ≤ steady ${steadyStep.toExponential(2)}`);
  }
  // the loop itself kept running: after the resume it is still the 800 / 600 Hz Hi-Lo tone
  const x = buf.getChannelData(0);
  let hi = 0;
  let lo = 0;
  for (let t = at.end + 0.35; t + 0.02 < DUR - 0.05; t += 0.02) {
    const b = x.subarray(i(t), i(t + 0.02));
    const ph = power(b, 800, sr);
    const pl = power(b, 600, sr);
    if (ph > 4 * pl) hi++;
    else if (pl > 4 * ph) lo++;
  }
  assert.ok(hi >= 5 && lo >= 5, `stall loop alternates after the resume (hi ${hi}, lo ${lo} blocks)`);
});

test('full car output: the warning tone is silenced by the interruption and comes back at the same level', async () => {
  const { buf, at } = await renderPaused();
  const sr = buf.sampleRate;
  const i = (t) => Math.round(t * sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    const before = peak(x.subarray(i(ON + 0.2), i(INT - 0.02)));
    assert.ok(db(before) > -8 && db(before) <= -3, `stall ≈ -5 dBFS through the master bus (${db(before).toFixed(2)})`);
    assert.ok(db(peak(x.subarray(i(at.int + PS.FADE_OUT_S + 0.01), i(at.end)))) < -90, 'silent while interrupted');
    const back = peak(x.subarray(i(at.end + 0.35), i(DUR - 0.05)));
    assert.ok(Math.abs(db(back) - db(before)) < 0.5, `same level after the resume (${db(back).toFixed(2)} vs ${db(before).toFixed(2)})`);
  }
});
