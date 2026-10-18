/**
 * Twin Ion lock ladder stability (Meghan: KILL held only 0.1–0.6 s, lock/kill/identified flicker).
 * The ladder reads a smoothed drive value (LOCK_INPUT_TAU_S) with hysteresis + minimum dwell:
 * every stage holds ≥ LOCK_MIN_HOLD_S (1.0 s), KILL ≥ LOCK_KILL_HOLD_S (1.5 s); step-down only
 * after the value stayed below enter − h for that dwell; a full release skips that wait.
 * Every scenario asserts at most one transition per second.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);
const { createJiti } = await import('jiti');
const jiti = createJiti(join(root, 'package.json'), { moduleCache: false });
const ladder = await jiti.import(join(root, 'src/audio/lockStage.ts'));
const { LockLadder, LOCK_MIN_HOLD_S, LOCK_KILL_HOLD_S, LOCK_HYSTERESIS, LOCK_INPUT_TAU_S, LOCK_RELEASE_THROTTLE } = ladder;

const FPS = 60;
const FRAME = 1 / FPS;
const ORDER = ['none', 'identified', 'lock', 'kill'];

/** Transitions from a [{t, stage}] log. */
function transitionsOf(log) {
  const out = [];
  for (let i = 1; i < log.length; i++) {
    if (log[i].stage !== log[i - 1].stage) out.push({ t: log[i].t, from: log[i - 1].stage, to: log[i].stage });
  }
  return out;
}

/** ≤ 1 transition in any 1 s window, every stage ≥ 1.0 s, KILL ≥ 1.5 s (one frame of slack). */
function assertDwell(trans, label) {
  for (let i = 1; i < trans.length; i++) {
    const gap = trans[i].t - trans[i - 1].t;
    assert.ok(gap >= LOCK_MIN_HOLD_S - FRAME / 2, `${label}: ${trans[i - 1].to}→${trans[i].to} only ${gap.toFixed(3)} s apart`);
    if (trans[i].from === 'kill') {
      assert.ok(gap >= LOCK_KILL_HOLD_S - FRAME / 2, `${label}: KILL held only ${gap.toFixed(3)} s`);
    }
  }
  for (const a of trans) {
    const inWindow = trans.filter((b) => b.t >= a.t && b.t < a.t + 1 - FRAME / 2).length;
    assert.ok(inWindow <= 1, `${label}: ${inWindow} transitions within 1 s of t=${a.t.toFixed(3)}`);
  }
}

function assertMonotonicUpThenDown(trans, label) {
  const idx = trans.map((x) => ORDER.indexOf(x.to));
  const peak = idx.indexOf(Math.max(...idx));
  for (let i = 1; i <= peak; i++) assert.ok(idx[i] > idx[i - 1], `${label}: chatter on the way up ${JSON.stringify(trans)}`);
  for (let i = peak + 1; i < idx.length; i++) assert.ok(idx[i] < idx[i - 1], `${label}: chatter on the way down ${JSON.stringify(trans)}`);
}

/**
 * Drive the real shipped engine (CharacterEngine → EngineSynthImpl) offline and log the stage.
 * Assertions only use times of frames that actually ran (the suspend-stepped harness can skip
 * frames on a loaded box; the ladder then simply steps with a longer dt).
 */
async function driveIonTwin(profile, dur, { lockSfx = false, onStage } = {}) {
  const log = [];
  const callbacks = [];
  const cues = [];
  await renderLive(profile, dur, {
    patchId: 'ion-twin',
    seed: 'ion-lockstage-dwell',
    fps: FPS,
    sampleRate: 8000,
    onFrame: (engine, t) => {
      if (!engine.__lockSpy) {
        engine.__lockSpy = true;
        engine.onLockStageChange = (s) => callbacks.push({ t, s });
        if (lockSfx) {
          engine.setLockSfxEnabled(true);
          const cue = engine.fx.cue.bind(engine.fx);
          engine.fx.cue = (c) => {
            if (c === 'lock') cues.push(t);
            return cue(c);
          };
        }
      }
      const hud = engine.getHud();
      onStage?.(engine.getLockStage(), t);
      log.push({
        t,
        stage: engine.getLockStage(),
        hud: hud.lockStage,
        base: engine.base.getLockStage(),
        hudRpmNorm: hud.rpmNorm,
      });
    },
  });
  return { log, callbacks, cues, trans: transitionsOf(log) };
}

test('lockStage.ts exports the dwell constants (spec: ≤ 1 change/s, KILL ≥ 1.5 s, h = 0.04)', () => {
  assert.equal(LOCK_MIN_HOLD_S, 1.0);
  assert.equal(LOCK_KILL_HOLD_S, 1.5);
  assert.equal(LOCK_HYSTERESIS, 0.04);
  assert.ok(LOCK_INPUT_TAU_S > 0 && LOCK_INPUT_TAU_S <= 0.5);
  assert.ok(LOCK_RELEASE_THROTTLE > 0 && LOCK_RELEASE_THROTTLE <= 0.05);
  assert.equal(ladder.lockDwellSeconds('kill'), 1.5);
  assert.equal(ladder.lockDwellSeconds('lock'), 1.0);
});

test('LockLadder: input wobbling ±0.09 around the KILL edge (2× hysteresis) never chatters', () => {
  const l = new LockLadder();
  const log = [];
  for (let k = 0; k < FPS * 30; k++) {
    const t = k * FRAME;
    // cam / LFO style wobble (3.1 Hz + 0.7 Hz) plus a rev-jitter term, centred on 0.86
    const raw = 0.86 + 0.05 * Math.sin(t * 2 * Math.PI * 3.1) + 0.03 * Math.sin(t * 2 * Math.PI * 0.7) + 0.01 * Math.sin(t * 91);
    l.step(raw, FRAME, { released: false });
    log.push({ t, stage: l.stage });
    assert.ok(Number.isFinite(l.input) && l.input >= 0 && l.input <= 1);
  }
  const trans = transitionsOf(log);
  assertDwell(trans, 'wobble');
  assert.ok(trans.length <= 30 / LOCK_MIN_HOLD_S);
});

test('LockLadder: escalation is one stage per step and prompt (≤ 1.0 s apart), release drops in one step', () => {
  const l = new LockLadder();
  const log = [];
  for (let k = 0; k < FPS * 8; k++) {
    const t = k * FRAME;
    const thr = t < 4 ? 0.99 : 0;
    l.step(thr, FRAME, { released: thr <= LOCK_RELEASE_THROTTLE });
    log.push({ t, stage: l.stage });
  }
  const trans = transitionsOf(log);
  assert.deepEqual(trans.map((x) => x.to), ['identified', 'lock', 'kill', 'none']);
  assert.ok(trans[0].t < 0.3, `first stage at ${trans[0].t}`);
  assert.ok(trans[2].t - trans[0].t <= 2 * LOCK_MIN_HOLD_S + FRAME, 'escalation stays prompt');
  assert.ok(trans[3].t >= 4 && trans[3].t < 4 + 2 * FRAME, `release step at ${trans[3].t}`);
  assertDwell(trans, 'unit release');
});

test('ion-twin parked steady throttle 0.99 (no rpmNorm): reaches KILL and holds 5 s with zero transitions', async () => {
  const { log, trans, callbacks } = await driveIonTwin(() => ({ speed: 0, throttle: 0.99, load: 0.99 }), 10);
  const kill = trans.find((x) => x.to === 'kill');
  assert.ok(kill, `never reached kill: ${JSON.stringify(trans)}`);
  assert.ok(kill.t <= 4, `kill only at ${kill.t}`);
  const after = log.filter((r) => r.t >= kill.t);
  assert.ok(after.at(-1).t - kill.t >= 5, `logged ${after.at(-1).t - kill.t} s after kill`);
  assert.ok(after.every((r) => r.stage === 'kill' && r.hud === 'kill' && r.base === 'kill'), 'kill held 5 s');
  assert.equal(transitionsOf(after).length, 0);
  assert.deepEqual(trans.map((x) => x.to), ['identified', 'lock', 'kill']);
  assert.deepEqual(callbacks.map((c) => c.s), ['identified', 'lock', 'kill'], 'onLockStageChange once per transition');
  // HUD rpmNorm stays the acoustic parked fallback; only the ladder reads the Rev throttle.
  assert.ok(Math.abs(log.at(-1).hudRpmNorm - 0.99 * 0.55) < 1e-6);
  assertDwell(trans, 'steady 0.99');
});

test('ion-twin parked steady throttle 0.90: steady KILL, no transitions after entry', async () => {
  const { trans } = await driveIonTwin(() => ({ speed: 0, throttle: 0.9, load: 0.9 }), 8);
  assert.deepEqual(trans.map((x) => x.to), ['identified', 'lock', 'kill']);
  assertDwell(trans, 'steady 0.90');
});

test('ion-twin slow parked ramp up and down: monotonic transitions, no chatter', async () => {
  const ramp = (t) => (t < 10 ? t / 10 : Math.max(0, 1 - (t - 10) / 10));
  const { trans, callbacks } = await driveIonTwin((t) => ({ speed: 0, throttle: ramp(t), load: ramp(t) }), 21);
  assert.deepEqual(
    trans.map((x) => x.to),
    ['identified', 'lock', 'kill', 'lock', 'identified', 'none'],
    JSON.stringify(trans),
  );
  assertMonotonicUpThenDown(trans, 'ramp');
  assertDwell(trans, 'ramp');
  assert.equal(callbacks.length, trans.length);
});

test('ion-twin releasing throttle from KILL steps down cleanly (one transition, after the KILL hold)', async () => {
  const { trans, callbacks } = await driveIonTwin(
    (t) => ({ speed: 0, throttle: t < 5 ? 0.99 : 0, load: t < 5 ? 0.99 : 0 }),
    8,
  );
  assert.deepEqual(trans.map((x) => x.to), ['identified', 'lock', 'kill', 'none'], JSON.stringify(trans));
  const kill = trans[2];
  const down = trans[3];
  assert.ok(down.t >= 5 && down.t <= 5 + 0.5, `release step at ${down.t}`);
  assert.ok(down.t - kill.t >= LOCK_KILL_HOLD_S - FRAME / 2);
  assert.equal(callbacks.at(-1).s, 'none');
  assertDwell(trans, 'release');
});

test('ion-twin release right after KILL entry still holds KILL 1.5 s', async () => {
  // Release 0.4 s after KILL is entered → the step-down waits out the 1.5 s KILL hold.
  let killAt = null;
  const { trans } = await driveIonTwin(
    (t) => {
      const thr = killAt !== null && t >= killAt + 0.4 ? 0 : 0.99;
      return { speed: 0, throttle: thr, load: 0 };
    },
    8,
    { onStage: (s, t) => { if (s === 'kill' && killAt === null) killAt = t; } },
  );
  const kill = trans.find((x) => x.to === 'kill');
  assert.ok(kill, JSON.stringify(trans));
  const down = trans[trans.indexOf(kill) + 1];
  assert.ok(down, JSON.stringify(trans));
  assert.equal(down.to, 'none');
  const held = down.t - kill.t;
  assert.ok(held >= LOCK_KILL_HOLD_S - FRAME / 2 && held <= LOCK_KILL_HOLD_S + 0.5, `kill held ${held}`);
  assertDwell(trans, 'early release');
});

test('ion-twin gearbox sawtooth rpmNorm (Forge auto, upshifts): no KILL flicker, lock cue once per entry', async () => {
  // Frontend rpmNorm climbing to the 0.89 shift point then dropping 0.3 on each upshift (the
  // pattern that held KILL for 0.05–0.43 s before the fix).
  const saw = (t) => 0.57 + 0.32 * ((t % 1.3) / 1.3);
  const { trans, cues } = await driveIonTwin(
    (t) => ({ speed: Math.min(1, 0.05 + t * 0.03), throttle: 0.99, load: 0.99, rpmNorm: saw(t) }),
    16,
    { lockSfx: true },
  );
  assertDwell(trans, 'sawtooth');
  const killHolds = [];
  for (let i = 0; i < trans.length - 1; i++) if (trans[i].to === 'kill') killHolds.push(trans[i + 1].t - trans[i].t);
  assert.ok(killHolds.every((h) => h >= LOCK_KILL_HOLD_S - FRAME / 2), `kill holds ${killHolds}`);
  assert.ok(trans.length <= 16 / LOCK_MIN_HOLD_S);
  const intoLock = trans.filter((x) => x.to === 'lock').length;
  assert.equal(cues.length, intoLock, 'lock fx cue fires once per real transition into lock');
});

test('ion-twin Forge drive sim (auto, 8 gears, pedal 0.99 from rest): ≤ 1 change/s, KILL ≥ 1.5 s, cue per lock entry', async () => {
  // Same feed as useDriveSimulation: rpmNorm = (rpm − idle) / (redline − idle), throttle ×0.3 while shifting.
  const sim = await jiti.import(join(root, 'src/forge/simulation.ts'));
  const config = { idleRpm: 700, redline: 10000, gears: 8, shiftRpm: 9000, finalDrive: 3.31, topSpeedMps: 120 / 2.2369362920544 };
  const s = sim.createSimulation(config);
  let last = 0;
  const profile = (t) => {
    const dt = t - last;
    last = t;
    sim.stepSimulation(s, config, dt, { source: 'demo', mode: 'auto', pedal: 0.99, brake: false, shift: 0, gpsSpeed: null });
    return {
      speed: Math.min(1, (s.speedMps * 2.2369362920544) / 120),
      throttle: s.shifting ? 0.99 * 0.3 : 0.99,
      load: s.load,
      rpm: s.rpm,
      shifting: s.shifting,
      rpmNorm: sim.clamp((s.rpm - config.idleRpm) / (config.redline - config.idleRpm), 0, 1),
    };
  };
  const { trans, cues, callbacks } = await driveIonTwin(profile, 20, { lockSfx: true });
  assertDwell(trans, 'forge auto');
  assert.ok(trans.length <= 8, `${trans.length} transitions in 20 s: ${JSON.stringify(trans)}`);
  assert.equal(callbacks.length, trans.length);
  assert.equal(cues.length, trans.filter((x) => x.to === 'lock').length);
});

test('ion-twin high sawtooth crossing KILL every 2.5 s: KILL never held < 1.5 s', async () => {
  const saw = (t) => 0.6 + 0.39 * ((t % 2.5) / 2.5);
  const { trans } = await driveIonTwin((t) => ({ speed: 0.3, throttle: 0.99, load: 0.99, rpmNorm: saw(t) }), 16);
  assert.ok(trans.some((x) => x.to === 'kill'), JSON.stringify(trans));
  assertDwell(trans, 'high sawtooth');
});
