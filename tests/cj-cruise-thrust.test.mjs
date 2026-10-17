// Carrier Jet: thrust bass holds while cruising or accelerating; only slowing drops it. AB unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/audio/tomcatVoice.js';

const hold = (st, s, secs, d) => { for (let i = 0; i < secs * 60; i++) T.stepTomcatDrive(st, d, 1 / 60); return st.thrCmd; };

// 1 Hz GPS fixes with ±0.5 mph noise; acceleration spikes the way the car sim's per-frame derivative does
const drive = (st, secs, mphAt, extra = {}, seed = 7) => {
  let r = seed, fix = -1, gps = 0, prev = 0, lo = Infinity, drops = 0, wasHi = st.thrCmd >= 0.3;
  for (let i = 0; i < secs * 60; i++) {
    const t = i / 60;
    if (Math.floor(t) !== fix) { fix = Math.floor(t); r = (r * 16807) % 2147483647; const m = mphAt(t); prev = gps; gps = m > 0.5 ? m + (r / 2147483647 - 0.5) : m; }
    const acc = (gps - prev) * 0.447 * (i % 60 < 6 ? 6 : 0.1);
    T.stepTomcatDrive(st, { speed: gps / 120, throttle: 0.12, load: 0.12, acceleration: acc, ...extra }, 1 / 60);
    const hi = st.thrCmd >= 0.3; if (wasHi && !hi) drops++; wasHi = hi; if (t > secs - 1) lo = Math.min(lo, st.thrCmd);
  }
  return { drops, end: st.thrCmd, lo };
};

test('GPS cruise holds thrust through noise spikes; a pull adds on top; slowing drops it once', () => {
  for (const seed of [3, 7, 11, 19, 23]) {
    const st = T.createTomcatDriveState('running');
    const c = drive(st, 60, () => 45, {}, seed);
    assert.equal(c.drops, 0, `seed ${seed} cruise drops`);
    assert.ok(c.end >= 0.5, `cruise ${c.end}`);
    const g = drive(st, 15, (t) => 45 - 0.5 * t, {}, seed);
    assert.equal(g.drops, 1, `seed ${seed} gentle slowdown should drop once`);
    assert.ok(g.lo < 0.15, `gentle end ${g.lo}`);
    const back = drive(st, 8, () => 37.5, {}, seed);
    assert.ok(back.end >= 0.45, `cruise again ${back.end}`);
  }
  const st = T.createTomcatDriveState('running');
  const cruise = drive(st, 8, () => 45).end;
  const pull = drive(st, 3, (t) => 45 + 3 * t, { throttle: 0.42, load: 0.42 }).end;
  assert.ok(pull > cruise + 0.1, `pull ${pull}`);
  const brake = drive(st, 1.5, (t) => Math.max(0, 54 - 10 * t));
  assert.ok(brake.end < 0.15, `brake ${brake.end}`);
  assert.ok(drive(st, 3, () => 0, { throttle: 0, load: 0 }).end < 0.02, 'parked');
});

test('no acceleration supplied (other callers): command unchanged; AB demand still from load only', () => {
  const st = T.createTomcatDriveState('running');
  assert.equal(hold(st, null, 2, { speed: 0.375, throttle: 0.12, load: 0.12 }), 0.12);
  const st2 = T.createTomcatDriveState('running');
  hold(st2, null, 2, { speed: 0.7, throttle: 0.12, load: 0.12, acceleration: 0 });
  assert.equal(st2.abDemand, 0.12);
});
