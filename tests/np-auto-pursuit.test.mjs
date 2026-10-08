// Night Pursuit AUTO drive mode + POWER retirement (Frontend). Pure modules only:
// the state machine, boost targets and the runtime bus run under node with a fake
// clock and an in-memory localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
/** Fresh module graph per call so runtime.ts's in-memory caches start empty. */
const load = (rel) => createJiti(import.meta.url, { moduleCache: false }).import(join(root, rel));

const ap = await load('src/packs/autoPursuit.ts');

function fakeClock(start = 1000) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms) => (t += ms);
  return clock;
}

/** Sample every `dt` ms for `ms` total at a fixed throttle; returns the engaged history. */
function hold(ctl, clock, { active = true, throttle, ms, dt = 80 }) {
  const seen = [];
  for (let el = 0; el < ms; el += dt) {
    clock.advance(Math.min(dt, ms - el));
    seen.push(ctl.sample(active, throttle));
  }
  return seen;
}

test('auto-pursuit thresholds match the spec', () => {
  assert.equal(ap.AUTO_ENGAGE_THROTTLE, 0.8);
  assert.equal(ap.AUTO_ENGAGE_HOLD_MS, 400);
  assert.equal(ap.AUTO_DISENGAGE_THROTTLE, 0.35);
  assert.equal(ap.AUTO_DISENGAGE_HOLD_MS, 2000);
});

test('engage: throttle ≥ 0.8 held 400 ms engages, not before', () => {
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  assert.equal(ctl.sample(true, 1), false, 'first hard sample starts the hold');
  assert.equal(ctl.msUntilDue(), 400);
  clock.advance(399);
  assert.equal(ctl.sample(true, 0.8), false, '399 ms is not enough (0.8 counts as ≥ 0.8)');
  assert.equal(ctl.msUntilDue(), 1);
  clock.advance(1);
  assert.equal(ctl.sample(true, 0.9), true, 'engaged at exactly 400 ms');
  assert.equal(ctl.msUntilDue(), null, 'nothing pending once engaged at high throttle');
});

test('engage: a dip below 0.8 restarts the 400 ms hold', () => {
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  ctl.sample(true, 1);
  clock.advance(350);
  assert.equal(ctl.sample(true, 0.79), false);
  clock.advance(10);
  assert.equal(ctl.sample(true, 1), false, 'hold restarted');
  clock.advance(399);
  assert.equal(ctl.sample(true, 1), false);
  clock.advance(1);
  assert.equal(ctl.sample(true, 1), true);
});

test('engage completes from the deadline alone (no new telemetry needed)', () => {
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  ctl.sample(true, 1);
  clock.advance(ctl.msUntilDue());
  assert.equal(ctl.sample(true, 1), true, 're-sampling at msUntilDue() with the same input engages');
});

test('disengage: throttle ≤ 0.35 held 2000 ms returns to Cruise, not before', () => {
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  hold(ctl, clock, { throttle: 1, ms: 480 });
  assert.equal(ctl.engaged, true);
  assert.equal(ctl.sample(true, 0.35), true, 'lift starts the 2 s hold (0.35 counts as ≤ 0.35)');
  assert.equal(ctl.msUntilDue(), 2000);
  clock.advance(1999);
  assert.equal(ctl.sample(true, 0), true, '1999 ms still engaged');
  clock.advance(1);
  assert.equal(ctl.sample(true, 0), false, 'disengaged at exactly 2000 ms');
});

test('disengage: a blip above 0.35 restarts the 2000 ms hold', () => {
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  hold(ctl, clock, { throttle: 1, ms: 480 });
  ctl.sample(true, 0);
  clock.advance(1900);
  assert.equal(ctl.sample(true, 0.36), true);
  clock.advance(10);
  assert.equal(ctl.sample(true, 0), true, 'hold restarted');
  clock.advance(1999);
  assert.equal(ctl.sample(true, 0), true);
  clock.advance(1);
  assert.equal(ctl.sample(true, 0), false);
});

test('no flicker: throttle oscillating 0.4 ↔ 0.75 holds whatever state it is in', () => {
  const osc = (ctl, clock, ms) => {
    const seen = new Set();
    for (let el = 0, i = 0; el < ms; el += 40, i++) {
      clock.advance(40);
      seen.add(ctl.sample(true, 0.4 + 0.35 * (0.5 + 0.5 * Math.sin(i / 3))));
      seen.add(ctl.sample(true, i % 2 ? 0.4 : 0.75));
    }
    return [...seen];
  };
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  assert.deepEqual(osc(ctl, clock, 10_000), [false], 'stays in Cruise for 10 s');
  assert.equal(ctl.msUntilDue(), null, 'no transition pending');
  hold(ctl, clock, { throttle: 1, ms: 480 });
  assert.equal(ctl.engaged, true);
  assert.deepEqual(osc(ctl, clock, 10_000), [true], 'stays in Pursuit for 10 s');
  assert.equal(ctl.msUntilDue(), null);
});

test('reset: leaving auto or stopping the engine drops to disengaged with nothing pending', () => {
  for (const why of ['mode change', 'engine stop']) {
    const clock = fakeClock();
    const ctl = ap.createAutoPursuit(clock);
    hold(ctl, clock, { throttle: 1, ms: 480 });
    assert.equal(ctl.engaged, true, why);
    // active = mode === 'auto' && running — either side going false is the same input.
    clock.advance(80);
    assert.equal(ctl.sample(false, 1), false, `${why}: disengaged immediately`);
    assert.equal(ctl.msUntilDue(), null, `${why}: nothing pending`);
    clock.advance(80);
    assert.equal(ctl.sample(true, 1), false, `${why}: back in auto, a fresh 400 ms hold is required`);
    clock.advance(400);
    assert.equal(ctl.sample(true, 1), true);
  }
  // A half-done engage hold does not survive a reset either.
  const clock = fakeClock();
  const ctl = ap.createAutoPursuit(clock);
  ctl.sample(true, 1);
  clock.advance(300);
  ctl.sample(false, 1);
  clock.advance(100);
  assert.equal(ctl.sample(true, 1), false);
  // reset() (unmount) clears state.
  hold(ctl, clock, { throttle: 1, ms: 480 });
  ctl.reset();
  assert.equal(ctl.engaged, false);
  assert.equal(ctl.msUntilDue(), null);
});

test('stepAutoPursuit is pure (never mutates its input state)', () => {
  const s0 = Object.freeze({ engaged: false, since: null });
  const s1 = ap.stepAutoPursuit(s0, { active: true, throttle: 1, now: 0 });
  assert.deepEqual(s1, { engaged: false, since: 0 });
  const s2 = ap.stepAutoPursuit(Object.freeze(s1), { active: true, throttle: 1, now: 400 });
  assert.deepEqual(s2, { engaged: true, since: null });
  assert.deepEqual(ap.stepAutoPursuit(s2, { active: true, throttle: Number.NaN, now: 401 }), { engaged: true, since: 401 }, 'NaN reads as 0');
});

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    store: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

test('POWER retired for Night Pursuit: saved power → norm on read, written back', async () => {
  const ls = memoryStorage({ 'revforge.pack.night-pursuit.mode': 'power', 'revforge.pack.stellar-helm.mode': 'power' });
  globalThis.localStorage = ls;
  try {
    const rt = await load('src/packs/runtime.ts');
    assert.equal(rt.getPackMode('night-pursuit'), 'norm');
    assert.equal(ls.store.get('revforge.pack.night-pursuit.mode'), 'norm', 'migration persisted');
    // A stale POWER button (pre-Visual rail) also lands on Cruise.
    const heard = [];
    const off = rt.onPackMode((id, mode) => heard.push([id, mode]));
    rt.setPackMode('night-pursuit', 'power');
    off();
    assert.deepEqual(heard, [['night-pursuit', 'norm']]);
    assert.equal(ls.store.get('revforge.pack.night-pursuit.mode'), 'norm');
    // Other packs keep POWER (Stellar Helm's SPORT maps to it).
    assert.equal(rt.getPackMode('stellar-helm'), 'power');
    assert.equal(ls.store.get('revforge.pack.stellar-helm.mode'), 'power');
    // auto / pursuit / norm saves for NP are untouched.
    for (const m of ['auto', 'pursuit', 'norm']) {
      globalThis.localStorage = memoryStorage({ 'revforge.pack.night-pursuit.mode': m });
      const fresh = await load('src/packs/runtime.ts');
      assert.equal(fresh.getPackMode('night-pursuit'), m);
    }
  } finally {
    delete globalThis.localStorage;
  }
});

test('auto-engaged runtime signal: session-only, dedups, never touches the stored mode', async () => {
  const ls = memoryStorage({ 'revforge.pack.night-pursuit.mode': 'auto' });
  globalThis.localStorage = ls;
  try {
    const rt = await load('src/packs/runtime.ts');
    const before = new Map(ls.store);
    const heard = [];
    const off = rt.onPackAutoEngaged((id, on) => heard.push([id, on]));
    assert.equal(rt.getPackAutoEngaged('night-pursuit'), false);
    rt.setPackAutoEngaged('night-pursuit', true);
    rt.setPackAutoEngaged('night-pursuit', true);
    assert.equal(rt.getPackAutoEngaged('night-pursuit'), true);
    rt.setPackAutoEngaged('night-pursuit', false);
    off();
    rt.setPackAutoEngaged('night-pursuit', true);
    assert.deepEqual(heard, [['night-pursuit', true], ['night-pursuit', false]]);
    assert.deepEqual(new Map(ls.store), before, 'storage unchanged');
    assert.equal(rt.getPackMode('night-pursuit'), 'auto');
  } finally {
    delete globalThis.localStorage;
  }
});

test('boost target: NP auto engaged = 1 (Pursuit), disengaged = 0 (Cruise); other modes unchanged', async () => {
  const b = await load('src/packs/boost.ts');
  assert.equal(b.packBoostTarget('night-pursuit', 'auto', true), 1);
  assert.equal(b.packBoostTarget('night-pursuit', 'auto', false), 0);
  assert.equal(b.packBoostTarget('night-pursuit', 'pursuit', false), 1);
  assert.equal(b.packBoostTarget('night-pursuit', 'norm', true), 0, 'engaged flag only matters in auto');
  assert.equal(b.packBoostTarget('night-pursuit', 'pursuit', true), 1);
  // boostForMode kept as-is (power stays for safety / other packs).
  assert.deepEqual(['power', 'auto', 'norm', 'pursuit'].map(b.boostForMode), [0.5, 0, 0, 1]);
  // Chrono Coupe / Stellar Helm ignore auto-engage entirely.
  for (const id of ['chrono-coupe', 'stellar-helm']) {
    for (const mode of ['power', 'auto', 'norm', 'pursuit']) {
      for (const on of [false, true]) assert.equal(b.packBoostTarget(id, mode, on), b.boostForMode(mode), `${id} ${mode} ${on}`);
    }
  }
  // The bridge routes through packBoostTarget + the auto-engaged signal, and still exports boostForMode.
  const bridge = read('src/packs/audioBridge.ts');
  assert.match(bridge, /packBoostTarget\(packId, getPackMode\(packId\), getPackAutoEngaged\(packId\)\)/);
  assert.match(bridge, /onPackAutoEngaged\(/);
  assert.match(bridge, /export \{ boostForMode \} from '\.\/boost'/);
});

test('Chrono Coupe mode mapping is unchanged', () => {
  const src = read('src/packs/mounts/ChronoCoupeMount.tsx');
  const pick = (name) => {
    const line = src.split('\n').find((l) => l.startsWith(`const ${name} = `));
    assert.ok(line, `${name} present`);
    const js = ts.transpileModule(line, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function(`${js}; return ${name};`)();
  };
  const toRail = pick('toRail');
  const toPack = pick('toPack');
  assert.deepEqual(
    Object.fromEntries(['power', 'auto', 'norm', 'pursuit'].map((m) => [m, toRail(m)])),
    { power: 'cruise', auto: 'off', norm: 'cruise', pursuit: 'jump' },
  );
  assert.deepEqual(
    Object.fromEntries(['off', 'cruise', 'jump'].map((m) => [m, toPack(m)])),
    { off: 'auto', cruise: 'norm', jump: 'pursuit' },
  );
  assert.doesNotMatch(src, /AutoEngaged|autoPursuit/, 'Chrono never sees the NP auto-engage signal');
});

test('NP mount wiring: auto hook, runtime signal, data attribute, skin prop, single polite announcer', () => {
  const src = read('src/packs/mounts/NightPursuitMount.tsx');
  assert.match(src, /useAutoPursuit\(autoActive, throttle\)/);
  assert.match(src, /const autoActive = mode === 'auto' && running;/);
  assert.match(src, /setPackAutoEngaged\(NIGHT_PURSUIT_ID, autoEngaged\)/);
  assert.match(src, /setPackAutoEngaged\(NIGHT_PURSUIT_ID, false\)/, 'unmount publishes disengaged');
  assert.match(src, /data-auto-engaged=\{autoEngaged \? 'true' : 'false'\}/);
  assert.match(src, /autoEngaged=\{autoEngaged\}/);
  assert.match(src, /'Auto: Pursuit engaged'/);
  assert.match(src, /'Auto: back to Cruise'/);
  assert.doesNotMatch(src, /@ts-ignore|@ts-expect-error/);
  assert.equal((src.match(/aria-live=/g) || []).length, 1, 'exactly one live region in the mount');
  // The skin has no announcer of its own, so the mount's region cannot double up.
  const skin = read('src/skins/night-pursuit/NightPursuitOverlay.tsx');
  assert.doesNotMatch(skin, /aria-live|role="status"|role="alert"/);
});
