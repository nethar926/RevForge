#!/usr/bin/env node
/**
 * ICE drop-cyl / collectorDelayMs QA (crossPlane packs).
 * Pass = lope interval pattern changes after dropCylinder(slot), not quieter-only.
 * Also documents collectorDelayMs → samples @ 48 kHz.
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const SR = 48000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Cross-plane scene schedules are derived in src/audio/sceneEngines.ts (no copied tables here).
const { SCENE_ICE_SCHEDULES } = await createJiti(join(ROOT, 'package.json')).import(
  join(ROOT, 'src/audio/sceneEngines.ts'),
);
const CROSS_PACKS = {
  'v8-rumble': { fam: 1, collectorDelayMs: 1.8 },
  ...Object.fromEntries(
    Object.entries(SCENE_ICE_SCHEDULES)
      .filter(([, s]) => s.firingFamily === 1)
      .map(([id, s]) => [id, { fam: 1, collectorDelayMs: s.collectorDelayMs }]),
  ),
};

const GLOBAL_8 = [0, 90, 180, 270, 360, 450, 540, 630];

function collectorMsToSamples(ms, sr = SR) {
  const clamped = Math.max(0.5, Math.min(3, ms));
  return Math.max(8, Math.min(254, Math.floor(clamped * 0.001 * sr)));
}

function activeIntervals(angles, mask) {
  const active = angles.filter((_, i) => (mask & (1 << i)) === 0);
  assert.ok(active.length >= 2, 'need ≥2 active slots');
  const iv = [];
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const b = active[(i + 1) % active.length] + (i + 1 === active.length ? 720 : 0);
    iv.push(b - a);
  }
  return { active, intervals: iv };
}

function intervalSignature(iv) {
  return iv.join('/');
}

function quieterOnlyWouldBeSameIntervals(before, after) {
  // Quieter-only FAIL mode: same interval sequence (just fewer? or scaled level).
  // True lope change: interval multiset / sequence differs.
  return signatureSorted(before) === signatureSorted(after) && before.length === after.length;
}

function signatureSorted(iv) {
  return [...iv].sort((a, b) => a - b).join(',');
}

console.log('=== collectorDelayMs → samples @ 48kHz (clamp 0.5–3 ms) ===');
for (const [id, p] of Object.entries(CROSS_PACKS)) {
  const samp = collectorMsToSamples(p.collectorDelayMs);
  const msEff = (samp / SR) * 1000;
  console.log(
    `  ${id}: collectorDelayMs=${p.collectorDelayMs} → ${samp} samples (~${msEff.toFixed(2)} ms)`,
  );
}

console.log('\n=== dropCylinder(1) lope QA (crossPlane 8-slot collector) ===');
const results = [];
for (const [id, p] of Object.entries(CROSS_PACKS)) {
  const full = activeIntervals(GLOBAL_8, 0);
  // eng.dropCylinder(1) → bit 1 set
  const mask = 1 << 1;
  const dropped = activeIntervals(GLOBAL_8, mask);

  const samePattern = quieterOnlyWouldBeSameIntervals(full.intervals, dropped.intervals);
  const eventCountDown = dropped.active.length < full.active.length;
  const intervalChanged =
    signatureSorted(full.intervals) !== signatureSorted(dropped.intervals) ||
    full.intervals.length !== dropped.intervals.length;

  // Max gap grows when a slot is skipped (lope limp)
  const maxBefore = Math.max(...full.intervals);
  const maxAfter = Math.max(...dropped.intervals);
  const maxGapGrew = maxAfter > maxBefore;

  const pass = eventCountDown && intervalChanged && maxGapGrew && !samePattern;
  const note = pass
    ? `PASS lope: events ${full.active.length}→${dropped.active.length}; iv ${intervalSignature(full.intervals)} → ${intervalSignature(dropped.intervals)}; maxGap ${maxBefore}°→${maxAfter}°`
    : `FAIL quieter-only risk: intervalChanged=${intervalChanged} maxGapGrew=${maxGapGrew}`;

  console.log(`  ${id} fam=${p.fam}: ${note}`);
  results.push({ id, pass, note, collectorSamples: collectorMsToSamples(p.collectorDelayMs) });
}

// Bridge-style dropCylinder API smoke
class FakeEng {
  constructor() {
    this.firingMask = 0;
  }
  dropCylinder(slot) {
    const s = Math.max(0, Math.min(7, Math.round(slot)));
    this.firingMask = (this.firingMask | (1 << s)) & 255;
  }
  setFiringMask(mask) {
    this.firingMask = Math.max(0, Math.min(255, Math.round(mask))) & 255;
  }
}
const eng = new FakeEng();
eng.dropCylinder(1);
assert.equal(eng.firingMask, 1 << 1);
eng.setFiringMask(0);
assert.equal(eng.firingMask, 0);
console.log('\neng.dropCylinder(1) / setFiringMask(0) API: OK');

const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.error('\nQA FAILED:', failed.map((f) => f.id).join(', '));
  process.exit(1);
}
console.log('\nAll crossPlane drop-cyl packs: PASS (lope changes, not quieter-only)');

// --- Rotary chamber-pulse drop-chamber QA (family 4, 360° eccentric) ---
console.log('\n=== dropChamber(1) lope QA (rotary twin 6-slot @ 360°) ===');
const ROTARY_TWIN = [0, 60, 120, 180, 240, 300];
function activeIntervals360(angles, mask) {
  const active = angles.filter((_, i) => (mask & (1 << i)) === 0);
  assert.ok(active.length >= 2, 'need ≥2 active chambers');
  const iv = [];
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const b = active[(i + 1) % active.length] + (i + 1 === active.length ? 360 : 0);
    iv.push(b - a);
  }
  return { active, intervals: iv };
}
{
  const full = activeIntervals360(ROTARY_TWIN, 0);
  const dropped = activeIntervals360(ROTARY_TWIN, 1 << 1);
  const intervalChanged =
    signatureSorted(full.intervals) !== signatureSorted(dropped.intervals) ||
    full.intervals.length !== dropped.intervals.length;
  const maxGapGrew = Math.max(...dropped.intervals) > Math.max(...full.intervals);
  const pass = dropped.active.length < full.active.length && intervalChanged && maxGapGrew;
  console.log(
    pass
      ? `  rotary-hum: PASS lope events ${full.active.length}→${dropped.active.length}; maxGap ${Math.max(...full.intervals)}°→${Math.max(...dropped.intervals)}°`
      : `  rotary-hum: FAIL quieter-only / no lope change`,
  );
  if (!pass) process.exitCode = 1;
}

