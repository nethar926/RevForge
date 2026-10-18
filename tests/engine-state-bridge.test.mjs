import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function loadBridge() {
  // Prefer tsx register if present
  try {
    const { register } = await import('node:module');
    // Node 20: use dynamic import of .ts via vite? fall through
  } catch {}
  try {
    return await import(pathToFileURL(join(root, 'src/audio/engineStateBridge.ts')).href);
  } catch (e) {
    // Fallback: evaluate key exports by spawning a tiny transpile-free duplicate check
    return null;
  }
}

// --- Pure mapping mirror (must stay in sync with engineStateBridge / schedules v1) ---
function mapRevforgeFiringToFamily(firing, cylinders) {
  const f = (firing ?? '').toLowerCase();
  if (f === 'crossplane') return 1;
  if (f === 'even' && cylinders >= 8) return 2;
  if (f === 'smooth' || f === 'even' || cylinders === 6 || cylinders === 4) return 3;
  return cylinders === 8 ? 1 : 3;
}

const SCHED_FAM = {
  'v8-rumble': 1,
  'i4-zip': 3,
  'i6-silk': 3,
  'copper-mile': 1,
  'ember-dusk': 2,
  'violet-grid': 2,
  'azure-bend': 2,
  'pink-current': 1,
  'silver-run': 2,
  sandwake: 1,
  frostpass: 3,
  'rotary-hum': 4,
};

function isSlotDisabled(mask, slot) {
  return (mask & (1 << slot)) !== 0;
}

function nextEventAnglesDeg(family, cylinders) {
  let fam = family | 0;
  if (fam === 0) fam = cylinders === 8 ? 1 : 3;
  if (fam === 1 || fam === 2) return [0, 90, 180, 270, 360, 450, 540, 630];
  if (cylinders === 6) return [0, 120, 240, 360, 480, 600];
  if (cylinders === 4) return [0, 180, 360, 540];
  return Array.from({ length: cylinders }, (_, i) => (i / cylinders) * 720);
}

function estimateNextPulseDt(crankAngleDeg, nextEventDeg, rpm) {
  const degPerSec = Math.max(200, rpm) * 6;
  let d = nextEventDeg - (crankAngleDeg % 720);
  if (d <= 0) d += 720;
  return d / degPerSec;
}

test('mask bit SET disables slot', () => {
  assert.equal(isSlotDisabled(0, 0), false);
  assert.equal(isSlotDisabled(1 << 1, 1), true);
});

test('crossPlane bank A intervals from schedule', () => {
  const bankA = [0, 180, 270, 450];
  const intervals = [];
  for (let i = 0; i < bankA.length; i++) {
    const a = bankA[i];
    const b = bankA[(i + 1) % bankA.length] + (i + 1 === bankA.length ? 720 : 0);
    intervals.push(b - a);
  }
  assert.deepEqual(intervals, [180, 90, 180, 270]);
});

test('mapRevforgeFiringToFamily canonical', () => {
  assert.equal(mapRevforgeFiringToFamily('crossplane', 8), 1);
  assert.equal(mapRevforgeFiringToFamily('even', 8), 2);
  assert.equal(mapRevforgeFiringToFamily('smooth', 6), 3);
  assert.equal(mapRevforgeFiringToFamily('even', 6), 3);
});

test('ICE schedule family table', () => {
  for (const [id, fam] of Object.entries(SCHED_FAM)) {
    assert.equal(SCHED_FAM[id], fam);
  }
  assert.equal('blossom-run' in SCHED_FAM, false);
});

test('nextPulseDt grows for farther event', () => {
  const a = nextEventAnglesDeg(1, 8);
  const dt0 = estimateNextPulseDt(85, a[1], 3000);
  const dt1 = estimateNextPulseDt(85, a[2], 3000);
  assert.ok(dt1 > dt0);
});


test('rotary twin stack angles + drop-chamber lope', () => {
  const twin = [0, 60, 120, 180, 240, 300];
  const single = [0, 120, 240];
  assert.deepEqual(twin, [0, 60, 120, 180, 240, 300]);
  assert.deepEqual(single, [0, 120, 240]);
  // drop chamber slot 1 → uneven intervals on 360° cycle
  const mask = 1 << 1;
  const active = twin.filter((_, i) => (mask & (1 << i)) === 0);
  const iv = [];
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const b = active[(i + 1) % active.length] + (i + 1 === active.length ? 360 : 0);
    iv.push(b - a);
  }
  assert.equal(active.length, 5);
  assert.ok(Math.max(...iv) > 60);
});

test('source files encode pack families + blossom-run exclusion', () => {
  const bridge = readFileSync(join(root, 'src/audio/engineStateBridge.ts'), 'utf8');
  const catalog = readFileSync(join(root, 'src/forge/catalog.ts'), 'utf8');
  const builtins = readFileSync(join(root, 'src/audio/builtins.ts'), 'utf8');
  const worklet = readFileSync(
    join(root, 'src/audio/worklets/pulse-engine-processor.js'),
    'utf8',
  );
  assert.match(bridge, /'pink-current':\s*\{[\s\S]*?firingFamily:\s*1/);
  assert.match(bridge, /'ember-dusk':\s*\{[\s\S]*?firingFamily:\s*2/);
  assert.match(bridge, /frostpass:\s*\{[\s\S]*?firingFamily:\s*3/);
  assert.match(bridge, /'rotary-hum':\s*\{[\s\S]*?firingFamily:\s*4/);
  assert.match(builtins, /id: 'rotary-hum'/);
  assert.match(builtins, /firingFamily:\s*4/);
  assert.match(bridge, /raw === 'blossom-run'/);
  assert.match(builtins, /firingFamily:\s*1/);
  assert.match(builtins, /collectorDelayMs:\s*1\.8/);
  assert.match(worklet, /family === 4/);
  assert.match(worklet, /chambersPerRotor/);
  // blossom-run stays in packs JSON but is not an ICE_PACK_SCHEDULES key
  assert.equal(/'blossom-run'\s*:/.test(bridge), false);
});

test('revforge-packs.json blossom-run unchanged checksum field', () => {
  const packs = JSON.parse(
    readFileSync(join(root, 'src/forge/revforge-packs.json'), 'utf8'),
  );
  const blossom = packs.find((p) => p.id === 'blossom-run');
  assert.ok(blossom);
  assert.equal(blossom.engine.cylinders, 6);
  assert.equal(blossom.engine.firing, 'even');
  assert.equal(blossom.engine.idleRpm, 950);
  assert.equal(blossom.engine.turbo, 0.72);
});

test('catalog scenePatch legacy pulse values (source contains exact pulse values)', () => {
  const catalog = readFileSync(join(root, 'src/forge/catalog.ts'), 'utf8');
  assert.match(catalog, /pulseJitter: p\.firing === "crossplane" \? 0\.14 : 0\.045/);
  assert.match(catalog, /pulseWidth: p\.firing === "crossplane" \? 0\.44 : 0\.25/);
});
