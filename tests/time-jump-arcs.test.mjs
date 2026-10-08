// Chrono Coupe time-jump arcs: ride the '88 mph time jump (light and sound)' switch, off under Reduce Motion
// (src/forge/timeJump.ts timeJumpArcsEnabled + the ForgePage → ThemeStage → Chrono mount prop path).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'rf-tja-')), 'timeJump.mjs');
writeFileSync(out, ts.transpileModule(readFileSync(join(root, 'src/forge/timeJump.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { timeJumpArcsEnabled } = await import(pathToFileURL(out).href);

// ForgePage's Reduce Motion: OS prefers-reduced-motion, or 'Animated environment' (motion) off.
const arcs = ({ cueOn, motion = true, osReduced = false }) => timeJumpArcsEnabled(cueOn, osReduced || !motion);

test('arcs: on when the time-jump switch is on and motion is allowed', () => {
  assert.equal(timeJumpArcsEnabled(true, false), true);
  assert.equal(arcs({ cueOn: true }), true);
});

test('arcs: off when the time-jump switch is off', () => {
  assert.equal(timeJumpArcsEnabled(false, false), false);
  assert.equal(arcs({ cueOn: false }), false);
  assert.equal(arcs({ cueOn: false, osReduced: true, motion: false }), false);
});

test('arcs: off under Reduce Motion (OS setting or in-app Animated environment off)', () => {
  assert.equal(timeJumpArcsEnabled(true, true), false);
  assert.equal(arcs({ cueOn: true, osReduced: true }), false, 'OS prefers-reduced-motion: reduce');
  assert.equal(arcs({ cueOn: true, motion: false }), false, "in-app 'Animated environment' off");
  assert.equal(arcs({ cueOn: true, motion: false, osReduced: true }), false);
});

test('arcs: always a strict boolean (never undefined → skin default on)', () => {
  for (const cueOn of [true, false]) for (const rm of [true, false]) assert.equal(typeof timeJumpArcsEnabled(cueOn, rm), 'boolean');
});

test('wiring: switch + motion → ForgePage → ThemeStage → Chrono mount (PackHudProps) → skin; no new switch', () => {
  const cue = readFileSync(join(root, 'src/forge/timeJumpCue.tsx'), 'utf8');
  assert.match(cue, /export function useTimeJumpArcs\(cueOn: boolean, motion: boolean\): boolean/);
  assert.match(cue, /matchMedia\(REDUCED_MOTION_QUERY\)/);
  assert.match(cue, /const REDUCED_MOTION_QUERY = '\(prefers-reduced-motion: reduce\)'/);
  assert.match(cue, /return timeJumpArcsEnabled\(cueOn, osReduced \|\| !motion\);/);
  assert.equal((cue.match(/role="switch"/g) ?? []).length, 1, 'still exactly one switch');
  const forge = readFileSync(join(root, 'src/forge/ForgePage.tsx'), 'utf8');
  assert.match(forge, /const timeJumpArcs=useTimeJumpArcs\(timeJumpCue,motion\);/);
  assert.match(forge, /timeJumpActive=\{timeJumpActive\} timeJumpArcs=\{timeJumpArcs\}/);
  assert.equal((forge.match(/<TimeJumpCueSwitch /g) ?? []).length, 1);
  const stage = readFileSync(join(root, 'src/themes/ThemeStage.tsx'), 'utf8');
  assert.match(stage, /timeJumpArcs=\{chrono\?timeJumpArcs:undefined\}/);
  const types = readFileSync(join(root, 'src/packs/types.ts'), 'utf8');
  assert.match(types, /timeJumpArcs\?: boolean;/);
  const mount = readFileSync(join(root, 'src/packs/mounts/ChronoCoupeMount.tsx'), 'utf8');
  assert.match(mount, /<ChronoCoupeHud\s+\{\.\.\.props\}/, 'mount spreads PackHudProps into the skin');
});
