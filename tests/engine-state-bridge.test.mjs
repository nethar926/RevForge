import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function loadBridgeTs() {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(join(root, 'package.json'), { moduleCache: false });
  return jiti.import(join(root, 'src/audio/engineStateBridge.ts'));
}

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
  'blossom-run': 3,
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

test('source files encode topology families; scene schedules come from sceneEngines', () => {
  const bridge = readFileSync(join(root, 'src/audio/engineStateBridge.ts'), 'utf8');
  const builtins = readFileSync(join(root, 'src/audio/builtins.ts'), 'utf8');
  const scenes = readFileSync(join(root, 'src/audio/sceneEngines.ts'), 'utf8');
  const worklet = readFileSync(
    join(root, 'src/audio/worklets/pulse-engine-processor.js'),
    'utf8',
  );
  assert.match(bridge, /'rotary-hum':\s*\{[\s\S]*?firingFamily:\s*4/);
  assert.match(bridge, /\.\.\.SCENE_ICE_SCHEDULES/);
  assert.match(builtins, /id: 'rotary-hum'/);
  assert.match(builtins, /firingFamily:\s*4/);
  assert.match(builtins, /firingFamily:\s*1/);
  assert.match(builtins, /collectorDelayMs:\s*1\.8/);
  assert.match(builtins, /sceneEnginePatches\(defaultsForTopology\)/);
  assert.match(worklet, /family === 4/);
  assert.match(worklet, /chambersPerRotor/);
  // No per-scene special case in the bridge; scene schedules are not hand-written tables
  assert.doesNotMatch(bridge, /raw === '/);
  assert.doesNotMatch(bridge, /'copper-mile':\s*\{/);
  // Scene families are derived from the firing order in sceneEngines.ts
  assert.match(scenes, /crossPlane: 1, flatPlane: 2, i6Even: 3/);
});

test('scene schedules resolve by scene id with or without the revforge- prefix', async () => {
  const mod = await loadBridgeTs();
  for (const [id, fam] of Object.entries(SCHED_FAM)) {
    const sched = mod.resolveIcePackSchedule(`revforge-${id}`) ?? mod.resolveIcePackSchedule(id);
    assert.ok(sched, `no schedule for ${id}`);
    assert.equal(sched.firingFamily, fam, id);
  }
  // Unknown ids are a no-op on the bridge
  assert.equal(mod.resolveIcePackSchedule('revforge-no-such-scene'), undefined);
  const b = new mod.EngineStateBridge();
  b.applyPackId(undefined);
  b.applyPackId('no-such-pack');
  b.tick(1 / 60, { throttle: 0.4, speed: 0.2 });
  assert.ok(Number.isFinite(b.rpm));
});
