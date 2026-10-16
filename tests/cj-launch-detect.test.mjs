// Carrier-launch detector: GPS-speed only (no accelerometer in the Tesla browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tv = await import(pathToFileURL(join(root, 'src/audio/tomcatVoice.js')).href);
const { createLaunchDetector, stepLaunchDetector, TC_SPEED_FULL_MPH: FULL } = tv;

/** Feed 1 Hz GPS fixes (held between) stepped at 25 Hz; returns on/off per second. */
function run(mphPerFix, stepHz = 25) {
  const d = createLaunchDetector();
  const out = [];
  for (let i = 0; i < mphPerFix.length; i++) {
    for (let k = 0; k < stepHz; k++) stepLaunchDetector(d, mphPerFix[i] / FULL, i + k / stepHz);
    out.push(d.on);
  }
  return out;
}

test('hard launch from a stop fires after two fixes, then drops ~2 s after it eases', () => {
  const on = run([0, 0, 9, 18, 27, 35, 38, 39, 39, 39, 39, 39]);
  assert.equal(on[2], false, 'one fix is not enough');
  assert.equal(on[3], true, 'two hard fixes in a row → launch');
  assert.equal(on.at(-1), false, 'drops out once acceleration eases');
});

test('hard pull from cruise speed also fires (any speed regime)', () => {
  const on = run([50, 50, 58, 66, 74, 75, 75, 75, 75, 75]);
  assert.ok(on.includes(true));
});

test('normal driving and a single GPS jump never fire', () => {
  assert.ok(!run([0, 3, 6, 9, 12, 15, 18, 21, 24]).includes(true), '3 mph/s');
  assert.ok(!run([40, 40, 48, 48, 48, 48]).includes(true), 'one-fix spike');
  assert.ok(!run([60, 50, 40, 30, 20, 10, 0]).includes(true), 'braking');
});

test('works when stepped only at the fixes (no settle loop)', () => {
  assert.equal(run([0, 0, 9, 18, 27], 1)[3], true);
});
