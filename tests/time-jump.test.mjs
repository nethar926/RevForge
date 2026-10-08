// Chrono Coupe 88 mph time-jump light: edge + timeout logic (src/forge/timeJump.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rf-tj-')), 'timeJump.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(join(root, 'src/forge/timeJump.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { createTimeJumpEdge, createTimeJumpLight, TIME_JUMP_MPH, MPS_TO_MPH } = await import(pathToFileURL(out).href);

function fakeTimers() {
  let now = 0, seq = 0;
  const q = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => q.delete(id),
    advance(ms) { now += ms; for (const [id, t] of [...q]) if (t.at <= now) { q.delete(id); t.fn(); } },
    get pending() { return q.size; },
  };
}

test('edge: fires once on a rising 88 mph crossing; first sample is only a baseline', () => {
  assert.equal(TIME_JUMP_MPH, 88);
  const e = createTimeJumpEdge();
  assert.equal(e.step(95), false, 'mount above 88 is not a crossing');
  assert.equal(e.step(100), false);
  assert.equal(e.step(80), false);
  assert.equal(e.step(87.9), false);
  assert.equal(e.step(88), true, 'crossing at exactly 88');
  assert.equal(e.step(120), false, 'no retrigger while above');
  assert.equal(e.step(88.1), false);
  assert.equal(e.step(87), false);
  assert.equal(e.step(90), true, 'new crossing after falling below re-arms');
  assert.equal(e.step(Number.NaN), false);
  e.reset();
  assert.equal(e.step(140), false, 'reset (theme change) → baseline again');
  // 88 mph ≈ 141.6 km/h ≈ 39.34 m/s
  const e2 = createTimeJumpEdge();
  e2.step(0);
  assert.equal(e2.step((141.5 / 3.6) * MPS_TO_MPH), false);
  assert.equal(e2.step((141.7 / 3.6) * MPS_TO_MPH), true);
});

test('light: on for the cue length, ignores triggers while lit, re-triggerable after', () => {
  const t = fakeTimers(), log = [];
  const l = createTimeJumpLight((on) => log.push(on), 2000, t);
  assert.equal(l.trigger(), true);
  assert.equal(l.active, true);
  t.advance(1000);
  assert.equal(l.trigger(), false, 'no retrigger while active');
  t.advance(999);
  assert.equal(l.active, true);
  t.advance(1);
  assert.equal(l.active, false);
  assert.deepEqual(log, [true, false]);
  assert.equal(l.trigger(), true, 'next crossing lights again');
  t.advance(2000);
  assert.deepEqual(log, [true, false, true, false]);
  assert.equal(t.pending, 0);
});

test('light: cancel (unmount / theme change) clears the timer and turns it off once', () => {
  const t = fakeTimers(), log = [];
  const l = createTimeJumpLight((on) => log.push(on), 2000, t);
  l.cancel();
  assert.deepEqual(log, [], 'cancel when idle is a no-op');
  l.trigger();
  t.advance(500);
  l.cancel();
  assert.equal(t.pending, 0);
  assert.deepEqual(log, [true, false]);
  t.advance(5000);
  assert.deepEqual(log, [true, false], 'no late callback after cancel');
});

test('wiring: ThemeStage edge → ForgePage onTimeJump → Chrono mount prop; option gates it', () => {
  const stage = readFileSync(join(root, 'src/themes/ThemeStage.tsx'), 'utf8');
  assert.match(stage, /if\(jumpEdge\.current\.step\(mph\)\)onTimeJump\?\.\(\)/);
  assert.match(stage, /timeJumpActive=\{chrono\?!!timeJumpActive:undefined\}/);
  const forge = readFileSync(join(root, 'src/forge/ForgePage.tsx'), 'utf8');
  assert.match(forge, /onTimeJump=\{onTimeJump\} timeJumpActive=\{timeJumpActive\}/);
  assert.match(forge, /<TimeJumpCueSwitch on=\{timeJumpCue\} onChange=\{setTimeJumpCue\}\/>/);
  const cue = readFileSync(join(root, 'src/forge/timeJumpCue.tsx'), 'utf8');
  assert.match(cue, /if \(cueOn && trigger\(\) && HAS_TIME_JUMP_CUE_API\) triggerUiCue\?\.\('time-jump'\);/);
  assert.match(cue, /storageKey\(TIME_JUMP_CUE_KEY\)/);
  assert.match(cue, /role="switch" aria-label="88 mph time jump \(light and sound\)"/);
});
