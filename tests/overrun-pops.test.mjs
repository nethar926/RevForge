import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const burst = await import(pathToFileURL(join(root, 'src/audio/overrunBurst.js')).href);

function run(profile, dur, opts = { idleRpm: 700, redlineRpm: 6000 }) {
  const s = burst.createOverrunBurstState();
  const out = [];
  for (let i = 0; i <= dur * 60; i++) out.push(burst.stepOverrunBurst(s, profile(i / 60), 1 / 60, opts));
  return { s, out, max: Math.max(...out) };
}
const wobble = (t) => 0.45 * (0.6 * Math.sin(2.3 * t) + 0.3 * Math.sin(7.1 * t + 1.7) + 0.1 * Math.sin(18 * t + 0.4));

test('lift-off gate: steady cruise (GPS-noisy throttle), low-rpm coast and idle never open it', () => {
  assert.equal(run((t) => ({ throttle: Math.max(0, 0.12 + wobble(t) / 5), rpm: 3000 }), 20).max, 0, 'steady 3k');
  assert.equal(run((t) => ({ throttle: 0.04, rpm: 1700 - t * 55 }), 10).max, 0, 'low-rpm coast');
  assert.equal(run(() => ({ throttle: 0, rpm: 750 }), 10).max, 0, 'idle');
  // gentle ease-off at high rpm (over ~2 s) is not a lift-off
  assert.equal(run((t) => ({ throttle: Math.max(0, 0.5 - t * 0.25), rpm: 4200 }), 6).max, 0, 'slow ease-off');
  // fast lift at LOW rpm (2.2k) is not a high-rpm lift-off
  assert.equal(run((t) => ({ throttle: t < 2 ? 0.8 : 0, rpm: 2200 }), 6).max, 0, 'low-rpm lift');
});

test('lift-off gate: one bounded burst from ~5k that decays as rpm falls; re-arms only after pulling', () => {
  const prof = (t) => {
    if (t < 2) return { throttle: 0.85, rpm: 5000 };
    const u = t - 2;
    return { throttle: Math.max(0, 0.85 * (1 - u / 0.1)), rpm: 700 + 4300 * Math.exp(-u / 1.15) };
  };
  const { s, out, max } = run(prof, 10);
  assert.ok(max > 0.5, `burst strong right after the lift (${max.toFixed(2)})`);
  assert.equal(s.bursts, 1, 'exactly one burst');
  const at = (sec) => out[Math.round(sec * 60)];
  assert.equal(at(1.9), 0, 'nothing while pulling');
  assert.ok(at(2.3) > at(3.5) && at(3.5) > at(4.2), 'decays as rpm falls');
  assert.equal(at(5.2), 0, 'over by ~3 s after the lift');
  assert.equal(at(9.5), 0, 'silent at idle');
  // per-step change is small (no hard gate → no click in the pop amount itself)
  let maxStep = 0;
  for (let i = 1; i < out.length; i++) maxStep = Math.max(maxStep, Math.abs(out[i] - out[i - 1]));
  assert.ok(maxStep < 0.45, `envelope step ${maxStep.toFixed(2)}`);
  // back on the throttle ends a burst at once
  const back = run((t) => (t < 2 ? { throttle: 0.9, rpm: 5200 } : t < 2.5 ? { throttle: 0, rpm: 4800 } : { throttle: 0.6, rpm: 4800 }), 4);
  assert.ok(back.out[Math.round(2.4 * 60)] > 0.3);
  assert.ok(back.out[Math.round(3.2 * 60)] < 0.01);
  assert.ok(burst.gatedCrackle(0.3, 0) === 0 && burst.gatedCrackle(0.3, 1) === 0.3);
});

test('voices + engine use the gate (no coasting floor / Frontend overrun flag trigger)', async () => {
  const np = await import(pathToFileURL(join(root, 'src/audio/nightPursuitVoice.js')).href);
  const cc = await import(pathToFileURL(join(root, 'src/audio/chronoCoupeVoice.js')).href);
  for (const [create, step, params] of [
    [np.createNightPursuitDriveState, np.stepNightPursuitDrive, { rpmIdle: 44, rpmRedline: 340, cylinders: 8 }],
    [cc.createChronoCoupeDriveState, cc.stepChronoCoupeDrive, { rpmIdle: 43, rpmRedline: 300, cylinders: 6 }],
  ]) {
    const s = create();
    let max = 0;
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      const acc = wobble(t);
      const load = Math.max(0, 0.12 + acc / 5);
      max = Math.max(max, step(s, { speed: 0.43, throttle: load, load, rpm: 3000, overrun: acc < -0.25 }, 1 / 60, params).overrun);
    }
    assert.equal(max, 0, 'steady GPS cruise with flickering overrun flag: no pops');
    const c = create();
    max = 0;
    for (let i = 0; i < 600; i++) max = Math.max(max, step(c, { speed: 0.2, throttle: 0.03, rpm: 1600 - i, overrun: true }, 1 / 60, params).overrun);
    assert.equal(max, 0, 'low-rpm coast: no pops');
  }
  const impl = read('src/audio/EngineSynthImpl.ts');
  assert.match(impl, /gatedCrackle\(Number\(p\.crackle \?\? 0\.35\), env\)/);
  assert.match(impl, /this\.setWorkletParam\('overrun', 0, tc\);/);
  assert.doesNotMatch(impl, /setWorkletParam\('crackle', Number\(p\.crackle/);
  for (const f of ['src/audio/nightPursuitVoice.js', 'src/audio/chronoCoupeVoice.js']) {
    assert.doesNotMatch(read(f), /coastFloor|input\?\.overrun/, f);
  }
});
