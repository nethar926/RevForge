// Carrier Jet: thrust bass holds while cruising or accelerating; only slowing drops it. AB unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/audio/tomcatVoice.js';

const hold = (st, s, secs, d) => { for (let i = 0; i < secs * 60; i++) T.stepTomcatDrive(st, d, 1 / 60); return st.thrCmd; };

test('GPS cruise (accel ≈ 0) holds thrust at the cruise floor; a pull adds on top; slowing drops it', () => {
  const st = T.createTomcatDriveState('running');
  const cruise = hold(st, null, 4, { speed: 0.375, throttle: 0.12, load: 0.12, acceleration: 0 });
  assert.ok(cruise >= 0.5, `cruise ${cruise}`);
  const pull = hold(st, null, 4, { speed: 0.375, throttle: 0.42, load: 0.42, acceleration: 1.5 });
  assert.ok(pull > cruise + 0.1, `pull ${pull}`);
  // GPS noise just under zero keeps it (hysteresis)
  assert.ok(hold(st, null, 3, { speed: 0.36, throttle: 0.08, load: 0.08, acceleration: -0.3 }) >= 0.5);
  const slow = hold(st, null, 3, { speed: 0.3, throttle: 0, load: 0, acceleration: -1.5 });
  assert.ok(slow < 0.02, `slowing ${slow}`);
  // parked: no floor
  assert.ok(hold(st, null, 3, { speed: 0, throttle: 0, load: 0, acceleration: 0 }) < 0.02);
});

test('no acceleration supplied (other callers): command unchanged; AB demand still from load only', () => {
  const st = T.createTomcatDriveState('running');
  assert.equal(hold(st, null, 2, { speed: 0.375, throttle: 0.12, load: 0.12 }), 0.12);
  const st2 = T.createTomcatDriveState('running');
  hold(st2, null, 2, { speed: 0.7, throttle: 0.12, load: 0.12, acceleration: 0 });
  assert.equal(st2.abDemand, 0.12);
});
