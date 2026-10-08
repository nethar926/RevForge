import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveDriveMode, effectiveGearCount, packHasGears, packMediaCommand } from '../src/packs/gears.ts';
import { mediaCommand } from '../src/forge/mediaActions.ts';
import { createSimulation, stepSimulation } from '../src/forge/simulation.ts';
import type { Controls, Drivetrain } from '../src/forge/simulation.ts';
import CARRIER_JET from '../src/packs/carrier-jet.identity.ts';

const GEARED = ['night-pursuit', 'chrono-coupe', 'stellar-helm', 'ion-twin'];
const ACTIONS = ['play', 'pause', 'nexttrack', 'previoustrack'] as const;

test('Carrier Jet has no gears; NP, Chrono Coupe, Stellar Helm, Twin Ion and no pack keep theirs', () => {
  assert.equal(CARRIER_JET.id, 'carrier-jet');
  assert.equal(packHasGears('carrier-jet'), false);
  for (const id of GEARED) assert.equal(packHasGears(id), true, id);
  assert.equal(packHasGears(undefined), true);
  assert.equal(packHasGears(null), true);
  assert.equal(packHasGears(''), true);
});

test('effective gear count / mode: CJ = single speed in Auto whatever the prefs; others pass the prefs through', () => {
  for (const pref of [1, 4, 6, 8, 10]) {
    assert.equal(effectiveGearCount('carrier-jet', pref), 1);
    for (const id of GEARED) assert.equal(effectiveGearCount(id, pref), pref, `${id} ${pref}`);
  }
  assert.equal(effectiveDriveMode('carrier-jet', 'manual'), 'auto');
  assert.equal(effectiveDriveMode('carrier-jet', 'auto'), 'auto');
  for (const id of GEARED) assert.equal(effectiveDriveMode(id, 'manual'), 'manual');
});

test('media buttons never shift on Carrier Jet (pause stops, next/previous no-op); other packs unchanged', () => {
  for (const running of [true, false]) for (const manual of [true, false]) for (const pauseShifts of [true, false]) for (const action of ACTIONS) {
    const cj = packMediaCommand('carrier-jet', action, running, manual, pauseShifts);
    assert.ok(cj !== 'up' && cj !== 'down', `${action} ${running} ${manual} ${pauseShifts} → ${cj}`);
    for (const id of GEARED) assert.equal(packMediaCommand(id, action, running, manual, pauseShifts), mediaCommand(action, running, manual, pauseShifts), id);
  }
  assert.equal(packMediaCommand('carrier-jet', 'nexttrack', true, true, true), 'none');
  assert.equal(packMediaCommand('carrier-jet', 'previoustrack', true, true, true), 'none');
  assert.equal(packMediaCommand('carrier-jet', 'pause', true, true, true), 'stop');
  assert.equal(packMediaCommand('carrier-jet', 'play', false, true, true), 'start');
  assert.equal(packMediaCommand('night-pursuit', 'nexttrack', true, true, true), 'up');
});

test('Carrier Jet drivetrain: full throttle 0→top speed and manual shift requests never change gear', () => {
  const config: Drivetrain = { idleRpm: 780, redline: 6800, shiftRpm: 6100, gears: effectiveGearCount('carrier-jet', 8), finalDrive: 3.31, topSpeedMps: 60 };
  const base: Controls = { pedal: 1, brake: false, mode: effectiveDriveMode('carrier-jet', 'manual'), shift: 0, source: 'demo', gpsSpeed: null };
  const s = createSimulation(config);
  let changes = 0;
  for (let i = 0; i < 60 * 40; i++) {
    const g = s.gear;
    stepSimulation(s, config, 1 / 60, { ...base, shift: i % 30 === 0 ? (i % 60 ? -1 : 1) : 0 });
    if (s.gear !== g) changes++;
  }
  assert.equal(changes, 0);
  assert.equal(s.gear, 1);
  assert.ok(s.speedMps > 20, `accelerates (${s.speedMps})`);
});

test('shell wiring: ForgePage uses the helper (gears, mode, media) and hides Auto/Manual + paddles on gearless packs', () => {
  const page = readFileSync(new URL('../src/forge/ForgePage.tsx', import.meta.url), 'utf8');
  assert.match(page, /gears: effectiveGearCount\(activePackId, prefs\.gearCount\)/);
  assert.match(page, /hasGears&&<div className="rev-segment">/);
  assert.match(page, /\{driveMode==='manual'&&<>/);
  assert.match(page, /manual:hasGears && driveMode==='manual'/);
  assert.match(page, /shift:\(d:number\)=>\{if\(hasGears\)shift\(d\);\}/);
  assert.doesNotMatch(page, /gearCount\s*:/, 'never writes the saved gearCount');
});
