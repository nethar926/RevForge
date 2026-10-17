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

/** Eased speed (frontend-style exponential follow of 1 Hz fixes), stepped at `fps` with jitter. */
function runEased(mphPerFix, fps, tau = 0.6, seed = 1) {
  const d = createLaunchDetector();
  let r = seed, v = mphPerFix[0], t = 0, firstOn = -1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  while (t < mphPerFix.length) {
    const dt = (1 / fps) * (0.6 + 0.8 * rnd());
    t += dt;
    const target = mphPerFix[Math.min(mphPerFix.length - 1, Math.floor(t))];
    v += (target - v) * (1 - Math.exp(-dt / tau));
    if (stepLaunchDetector(d, v / FULL, t) && firstOn < 0) firstOn = t;
  }
  return firstOn;
}

test('a 7 mph/s launch fires reliably at 7–60 fps through eased speed, within ~2.5 s', () => {
  const ramp = [0, 0, ...Array.from({ length: 8 }, (_, i) => 7 * (i + 1)), 56, 56];
  for (const fps of [7, 10, 13, 19, 30, 60]) {
    for (const seed of [1, 7, 42]) {
      const on = runEased(ramp, fps, 0.6, seed);
      assert.ok(on > 0, `fired at ${fps} fps (seed ${seed})`);
      assert.ok(on - 2 < 2.5, `fired ${(on - 2).toFixed(2)} s after launch at ${fps} fps`);
    }
  }
});

test('GPS reacquire jump (0 → 90 in one fix) never fires, raw or eased', () => {
  assert.ok(!run([0, 0, 0, 90, 90, 90, 90, 90, 91, 92]).includes(true), 'raw');
  for (const fps of [10, 30]) assert.equal(runEased([0, 0, 0, 90, 90, 90, 90, 90, 90], fps), -1, `eased ${fps} fps`);
});

test('a real very hard launch (0–60 in ~2.2 s) still fires', () => {
  assert.ok(run([0, 0, 27, 54, 60, 62, 62]).includes(true));
});

/** Raw held GPS fixes at irregular periods, stepped at a steady fps; seconds from first hard fix to on. */
function runFixes(accelMphs, fps, periods, startMph = 0) {
  const d = createLaunchDetector();
  const fixes = [];
  let ft = 0, v = startMph, k = 0;
  while (ft < 3) fixes.push([ft, v]), (ft += periods[k++ % periods.length]);
  const launchT = ft;
  while (ft < launchT + 8) {
    // car starts pulling one fix before the first hard fix; ±0.4 mph GPS speed noise
    v = startMph + accelMphs * (ft - launchT + 0.8) + 0.4 * Math.sin(k * 2.1);
    fixes.push([ft, Math.min(v, 119)]);
    ft += periods[k++ % periods.length];
  }
  let i = 0;
  for (let n = 0; n < fps * (launchT + 8); n++) {
    const t = n / fps;
    while (i + 1 < fixes.length && fixes[i + 1][0] <= t) i++;
    if (stepLaunchDetector(d, fixes[i][1] / FULL, t)) return t - launchT;
  }
  return -1;
}

test('held 1 Hz-ish fixes at a steady 60 fps: 5.5–7 mph/s fires ~1 s after the first hard fix', () => {
  for (const periods of [[1], [0.72, 0.9, 0.8, 0.75, 0.88], [0.9, 1.0, 0.85]]) {
    for (const a of [5.6, 7, 12]) {
      for (const fps of [60, 30, 7]) {
        for (const start of [0, 45]) {
          const lag = runFixes(a, fps, periods, start);
          assert.ok(lag >= 0 && lag <= 1.4, `${a} mph/s @${fps} fps periods ${periods} from ${start}: ${lag}`);
        }
      }
    }
  }
});

test('±0.4 mph GPS noise at steady speed and normal pulls at 1 Hz-ish never fire', () => {
  for (const a of [0, 3, 3.5]) {
    for (const fps of [60, 10]) assert.equal(runFixes(a, fps, [0.72, 0.9, 0.8, 0.75, 0.88], 30), -1, `${a} mph/s`);
  }
});

test('from a stop: 0–60 in ~2 s at exact 1 Hz fires on the 2nd fix; 4 mph/s does not', () => {
  const plaid = [0, 0, 0, 30, 60, 60, 60, 60];
  const on = run(plaid);
  assert.equal(on[3], false);
  assert.equal(on[4], true, 'Plaid-class launch is not mistaken for a GPS jump');
  assert.ok(!run([0, 0, 0, 4, 8, 12, 16, 20, 24]).includes(true), '4 mph/s from a stop');
});
