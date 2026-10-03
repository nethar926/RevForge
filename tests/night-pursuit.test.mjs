import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

async function loadTs(rel) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'np-test-')), 'm.mjs');
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

// Banned show/brand strings (case-insensitive) — never in catalog entries, UI copy or audio sources.
const BANNED = [/night[\s_-]?rider/i, /night[\s_-]?runner/i, /\bkitt\b/i, /knight\s*rider/i, /knight\s*industries/i];
const AUDIO_FILES = [
  'src/audio/builtins.ts',
  'src/audio/nightPursuitPack.ts',
  'src/audio/nightPursuitVoice.js',
  'src/audio/nightPursuitVoice.d.ts',
  'src/audio/envelopeMeter.ts',
  'src/audio/engineStartShutdown.ts',
  'src/audio/EngineSynthImpl.ts',
  'src/audio/CharacterEngine.ts',
  'src/audio/worklets/pulse-engine-processor.js',
  'scripts/night-pursuit-render.mjs',
  'scripts/render-snippets.mjs',
  'docs/night-pursuit-audio-v1.md',
];

test('night-pursuit builtin: single entry, real topology, cross-plane family', async () => {
  const builtins = read('src/audio/builtins.ts');
  assert.equal((builtins.match(/nightPursuitBuiltinPatch\(\)/g) || []).length, 1);
  assert.doesNotMatch(builtins, /id:\s*'night-pursuit'/, 'placeholder entry must be replaced in place');
  assert.doesNotMatch(builtins, /placeholder alias/);
  const pack = await loadTs('src/audio/nightPursuitPack.ts');
  const patch = pack.nightPursuitBuiltinPatch();
  assert.equal(patch.id, 'night-pursuit');
  assert.equal(patch.topology, 'night-pursuit');
  assert.equal(pack.NIGHT_PURSUIT_SKIN_ID, 'night-pursuit');
  assert.equal(patch.name, 'Night Pursuit');
  assert.equal(patch.kind, 'ice');
  assert.equal(pack.NIGHT_PURSUIT_EXPERIMENTAL, true);
  assert.ok(patch.meta.tags.includes('experimental'));
  const p = patch.params;
  assert.equal(p.firingFamily, 1, 'cross-plane firing family');
  assert.equal(p.cylinders, 8);
  assert.equal(p.bankOffsetDeg, 90);
  assert.ok(p.collectorDelayMs >= 0.5 && p.collectorDelayMs <= 3);
  assert.equal(p.firingMask, 0);
  assert.equal(p.pursuitBoost, 0, 'PURSUIT seasoning off in NORM');
  assert.equal(p.scannerTick, 0, 'scanner tick off by default');
  const bridge = read('src/audio/engineStateBridge.ts');
  assert.match(bridge, /'night-pursuit': \{\s*cylinders: 8,\s*firingFamily: 1,\s*bankSchedule: 'crossPlaneV8'/);
  assert.match(read('src/audio/types.ts'), /\| 'night-pursuit'/);
  assert.match(builtins, /case 'night-pursuit':\s*return \{ \.\.\.NIGHT_PURSUIT_DEFAULTS \}/);
});

test('no banned strings in Night Pursuit audio sources / builtins / docs', () => {
  for (const rel of AUDIO_FILES) {
    const src = read(rel);
    for (const re of BANNED) assert.doesNotMatch(src, re, `${rel} contains ${re}`);
  }
});

test('fully procedural: no decoded samples, fetches or audio assets in the pack voice', () => {
  for (const rel of ['src/audio/nightPursuitVoice.js', 'src/audio/nightPursuitPack.ts']) {
    const src = read(rel);
    assert.doesNotMatch(src, /decodeAudioData|fetch\(|\.wav|\.mp3|\.ogg|new Audio\(/, rel);
  }
});

test('pack hooks exist on wrapper + base (PackAudioHooks typeof checks)', () => {
  const ce = read('src/audio/CharacterEngine.ts');
  const impl = read('src/audio/EngineSynthImpl.ts');
  for (const m of ['getEnvelope()', 'getVoiceEnvelope()', 'scannerTick(edge', 'setPursuitBoost(amount']) {
    assert.ok(ce.includes(m), `CharacterEngine missing ${m}`);
    assert.ok(impl.includes(m), `EngineSynthImpl missing ${m}`);
  }
  // Driving-adapt contract kept: Frontend rpmNorm preferred, CharacterEngine wrap intact
  assert.match(impl, /d\.rpmNorm !== undefined && Number\.isFinite\(d\.rpmNorm\)/);
  assert.match(impl, /new CharacterEngine/);
});

test('worklet opt-ins default to 0 so other packs are unchanged', () => {
  const w = read('src/audio/worklets/pulse-engine-processor.js');
  for (const name of ['camLope', 'bankSplit', 'overrun', 'overrunBurble', 'dcGuard']) {
    assert.match(w, new RegExp(`name: '${name}', defaultValue: 0,`));
  }
  assert.equal(w, read('public/worklets/pulse-engine-processor.js'), 'public worklet in sync');
});

test('drive model: Frontend rpm wins; fallback automatic has no rpm cliffs', async () => {
  const v = await import(pathToFileURL(join(root, 'src/audio/nightPursuitVoice.js')).href);
  const params = { rpmIdle: 44, rpmRedline: 340, cylinders: 8, pursuitBoost: 0 };
  const s1 = v.createNightPursuitDriveState(660);
  const given = v.stepNightPursuitDrive(s1, { speed: 0.3, throttle: 0.4, rpm: 2345 }, 1 / 60, params);
  assert.equal(given.modelled, false);
  assert.equal(given.rpm, 2345);
  const s = v.createNightPursuitDriveState(660);
  let prev = null;
  let maxStep = 0;
  let maxGear = 1;
  for (let i = 0; i < 60 * 14; i++) {
    const t = i / 60;
    const d = v.stepNightPursuitDrive(s, { speed: Math.min(1, t / 12), throttle: t < 13 ? 0.6 : 0 }, 1 / 60, params);
    assert.ok(Number.isFinite(d.rpm) && d.rpm >= 600 && d.rpm <= 5200);
    // ignore the converter launch flare (idle -> stall) in the first 0.5 s; shifts must glide
    if (prev && t > 0.5) maxStep = Math.max(maxStep, Math.abs(d.rpm - prev.rpm));
    maxGear = Math.max(maxGear, d.gear);
    prev = d;
  }
  assert.ok(maxStep < 120, `per-frame rpm jump ${maxStep.toFixed(0)} (cliff)`);
  assert.equal(maxGear, 4, 'reaches overdrive');
  assert.ok(prev.overrun > 0, 'lift-off at speed opens overrun burble');
  assert.equal(v.nightPursuitBoostForMode('pursuit'), 1);
  assert.equal(v.nightPursuitBoostForMode('power'), 0.5);
  assert.equal(v.nightPursuitBoostForMode('norm'), 0);
  assert.equal(v.nightPursuitBoostForMode('auto'), 0);
});

test('real worklet render: idle audible + lumpy, high rpm does not collapse', async () => {
  const { renderNightPursuit } = await import(pathToFileURL(join(root, 'scripts/night-pursuit-render.mjs')).href);
  const rms = (buf, a, b) => {
    const d = buf.getChannelData(0);
    let s = 0;
    const i0 = Math.floor(a * buf.sampleRate);
    const i1 = Math.floor(b * buf.sampleRate);
    for (let i = i0; i < i1; i++) {
      assert.ok(Number.isFinite(d[i]));
      s += d[i] * d[i];
    }
    return 20 * Math.log10(Math.sqrt(s / (i1 - i0)) + 1e-12);
  };
  const idle = await renderNightPursuit(() => ({ speed: 0, throttle: 0 }), 1.5, { sampleRate: 22050 });
  assert.ok(rms(idle, 0.5, 1.5) > -45, 'idle audible');
  const high = await renderNightPursuit(() => ({ speed: 0.6, throttle: 1, load: 0.8, rpm: 4600 }), 1.5, {
    sampleRate: 22050,
  });
  assert.ok(rms(high, 0.8, 1.5) > -30, `high rpm collapsed: ${rms(high, 0.8, 1.5).toFixed(1)} dB`);
});
