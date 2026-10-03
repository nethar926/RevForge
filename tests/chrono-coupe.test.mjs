import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'));

// Banned terms for this pack (whole-word, case-insensitive). Stored reversed — same convention as
// PACK_ENGINE_MIGRATIONS — so pack files never contain the literals Build Lead greps for.
const rev = (s) => [...s].reverse().join('');
const BANNED_REVERSED = [
  'enihcam emit', 'naerolde', 'cmd', 'erutuf eht ot kcab', 'emitatuo', 'yellav llih',
  'hpm 88', 'hpm88', 'stiucric emit', 'roticapac', 'srotlcapac', 'ttawagig', 'sttawagig', '12.1',
  'noisuf .rm', 'noisuf rm', 'cod', 'ytram', 'nworb',
  // Night Pursuit list stays clean too
  'redir-thgin', 'redir thgin', 'rennur-thgin', 'ttik', 'redir thginK', 'seirtsudni thgink',
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED = [
  ...BANNED_REVERSED.map((r) => new RegExp(`(?<![\\w])${esc(rev(r)).replace(/ /g, '[\\s_-]?')}(?![\\w])`, 'i')),
  new RegExp(`\\b${rev('lf')}[uüo]+${rev('x')}`, 'i'), // any spelling (prefix match)
];
const PACK_FILES = [
  'src/audio/chronoCoupePack.ts',
  'src/audio/chronoCoupeVoice.js',
  'src/audio/chronoCoupeVoice.d.ts',
  'scripts/chrono-coupe-render.mjs',
  'scripts/chrono-coupe-qa.mjs',
  'docs/chrono-coupe-audio-v1.md',
  'tests/chrono-coupe.test.mjs',
];

test('identity: ONE constant carries id + display name; builtin derives from it', async () => {
  const pack = await jiti.import(join(root, 'src/audio/chronoCoupePack.ts'));
  assert.deepEqual({ ...pack.CHRONO_COUPE }, { id: 'chrono-coupe', displayName: 'Chrono Coupe' });
  const patch = pack.chronoCoupeBuiltinPatch();
  assert.equal(patch.id, pack.CHRONO_COUPE.id);
  assert.equal(patch.topology, pack.CHRONO_COUPE.id);
  assert.equal(patch.name, pack.CHRONO_COUPE.displayName);
  assert.equal(patch.kind, 'ice');
  assert.ok(patch.meta.tags.includes('experimental'));
  const p = patch.params;
  assert.equal(p.cylinders, 6);
  assert.equal(p.firingFamily, 5, 'odd-fire 90° V6 family');
  assert.equal(p.bankOffsetDeg, 90);
  assert.equal(p.pursuitBoost, 0);
  assert.equal(p.chargeLevel, 0);
  const builtins = await jiti.import(join(root, 'src/audio/builtins.ts'));
  const hits = builtins.BUILTIN_PATCHES.filter((x) => x.id === pack.CHRONO_COUPE.id);
  assert.equal(hits.length, 1, 'exactly one builtin');
  assert.equal(builtins.defaultsForTopology(pack.CHRONO_COUPE.id).firingFamily, 5);
  const metaIds = builtins.paramMetaForKind('ice', pack.CHRONO_COUPE.id).map((m) => m.id);
  for (const id of ['injectionHiss', 'shellResonance', 'wheeze', 'chargeIntensity']) assert.ok(metaIds.includes(id));
  // Rename = one line: no other source file spells the id / name literally
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const full = join(dir, f);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(join(root, 'src'))) {
    if (file.endsWith('chronoCoupePack.ts') || !/\.(ts|tsx|js)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /['"`]chrono-coupe['"`]|Chrono Coupe['"`]/, file);
  }
  assert.match(read('src/pages/EnginesPage.tsx'), /\[CHRONO_COUPE\.id\]: `snippets\/\$\{CHRONO_COUPE\.id\}\.wav`/);
});

test('odd-fire 90° V6: worklet family 5 + bridge schedule (150°/90° alternating)', async () => {
  const w = read('src/audio/worklets/pulse-engine-processor.js');
  assert.match(w, /name: 'firingFamily', defaultValue: 0, minValue: 0, maxValue: 5,/);
  assert.match(w, /this\._oddV6Deg = new Float64Array\(\[0, 150, 240, 390, 480, 630\]\)/);
  assert.equal(w, read('public/worklets/pulse-engine-processor.js'), 'public worklet in sync');
  const bridge = await jiti.import(join(root, 'src/audio/engineStateBridge.ts'));
  const pack = await jiti.import(join(root, 'src/audio/chronoCoupePack.ts'));
  const sched = bridge.ICE_PACK_SCHEDULES[pack.CHRONO_COUPE.id];
  assert.equal(sched.firingFamily, 5);
  assert.equal(sched.cylinders, 6);
  const a = sched.eventAnglesDeg;
  const gaps = a.map((x, i) => ((i + 1 < a.length ? a[i + 1] : a[0] + 720) - x));
  assert.deepEqual(gaps, [150, 90, 150, 90, 150, 90]);
  const b = new bridge.EngineStateBridge();
  b.applyPackId(pack.CHRONO_COUPE.id);
  assert.equal(b.bankSchedule, 'oddFireV6');
});

test('hooks on CharacterEngine wrapper + EngineSynthImpl (optional, guarded)', () => {
  const ce = read('src/audio/CharacterEngine.ts');
  const impl = read('src/audio/EngineSynthImpl.ts');
  for (const m of ['getEnvelope()', 'getVoiceEnvelope()', 'setPursuitBoost(amount', 'setChargeLevel(level', 'triggerDischarge()']) {
    assert.ok(ce.includes(m), `CharacterEngine missing ${m}`);
    assert.ok(impl.includes(m), `EngineSynthImpl missing ${m}`);
  }
  assert.match(ce, /triggerDischarge\(\):void\{if\(!this\.disposed&&this\.running\)this\.base\.triggerDischarge\?\.\(\);\}/);
  assert.match(ce, /setChargeLevel\(level:number\):void\{if\(this\.disposed\)return;/);
  assert.match(impl, /triggerDischarge\(\): void \{\n\s+if \(this\.disposed \|\| !this\.started\) return;\n\s+const bus = this\.g\.ccBus;\n\s+if \(!bus\) return;/);
  const types = read('src/audio/types.ts');
  assert.match(types, /setChargeLevel\?\(level: number\): void;/);
  assert.match(types, /triggerDischarge\?\(\): void;/);
});

test('no banned terms in pack files (whole-word, case-insensitive)', () => {
  for (const rel of PACK_FILES) {
    const src = read(rel);
    for (const re of BANNED) assert.doesNotMatch(src, re, `${rel} matches ${re}`);
  }
});

test('fully procedural: no decoded / fetched audio in the pack voice', () => {
  for (const rel of ['src/audio/chronoCoupeVoice.js', 'src/audio/chronoCoupePack.ts']) {
    assert.doesNotMatch(read(rel), /decodeAudioData|fetch\(|\.wav|\.mp3|\.ogg|new Audio\(/, rel);
  }
});

test('drive model: Frontend rpm wins; 5-speed fallback glides (no cliffs); overrun on lift', async () => {
  const v = await import(pathToFileURL(join(root, 'src/audio/chronoCoupeVoice.js')).href);
  const params = { rpmIdle: 43, rpmRedline: 300, cylinders: 6 };
  const given = v.stepChronoCoupeDrive(v.createChronoCoupeDriveState(), { speed: 0.3, throttle: 0.4, rpm: 3210 }, 1 / 60, params);
  assert.equal(given.modelled, false);
  assert.equal(given.rpm, 3210);
  const norm = v.stepChronoCoupeDrive(v.createChronoCoupeDriveState(), { speed: 0.3, throttle: 0.4, rpmNorm: 0.5 }, 1 / 60, params);
  assert.ok(Math.abs(norm.rpm - (860 + 0.5 * (6000 - 860))) < 1);
  const s = v.createChronoCoupeDriveState(860);
  let prev = null;
  let maxStep = 0;
  let maxGear = 1;
  for (let i = 0; i < 60 * 22; i++) {
    const t = i / 60;
    const d = v.stepChronoCoupeDrive(s, { speed: Math.min(1, t / 18), throttle: t < 20 ? 0.6 : 0 }, 1 / 60, params);
    assert.ok(Number.isFinite(d.rpm) && d.rpm >= 830 && d.rpm <= 6000);
    if (prev && t > 0.5) maxStep = Math.max(maxStep, Math.abs(d.rpm - prev.rpm));
    maxGear = Math.max(maxGear, d.gear);
    prev = d;
  }
  assert.ok(maxStep < 150, `per-frame rpm jump ${maxStep.toFixed(0)} (cliff)`);
  assert.equal(maxGear, 5);
  assert.ok(prev.overrun > 0, 'lift-off at speed opens gentle overrun pops');
  // Charge intensity: boost (setPursuitBoost) raises it; chargeIntensity 0 silences charge
  const lo = v.chronoCoupeChargeIntensity({ chargeIntensity: 0.75, pursuitBoost: 0 });
  const hi = v.chronoCoupeChargeIntensity({ chargeIntensity: 0.75, pursuitBoost: 1 });
  assert.ok(hi > lo && lo > 0);
  assert.equal(v.chronoCoupeChargeIntensity({ chargeIntensity: 0 }), 0);
});

test('real worklet: odd-fire signature + loudness-safe discharge (rate-limited)', async () => {
  const { renderChronoCoupe } = await import(pathToFileURL(join(root, 'scripts/chrono-coupe-render.mjs')).href);
  const SR = 22050;
  const orders = async (family) => {
    const buf = await renderChronoCoupe(() => ({ speed: 0.15, throttle: 0.25, rpm: 1200 }), 3, { sampleRate: SR, family });
    const x = buf.getChannelData(0).subarray(SR, 3 * SR);
    // Goertzel-ish power at order 1.5 (30 Hz) vs firing order 3 (60 Hz)
    const pow = (f) => {
      let s = 0;
      for (const df of [-1, -0.5, 0, 0.5, 1]) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < x.length; i++) {
          const ph = (2 * Math.PI * (f + df) * i) / SR;
          re += x[i] * Math.cos(ph);
          im += x[i] * Math.sin(ph);
        }
        s += re * re + im * im;
      }
      return s;
    };
    return 10 * Math.log10(pow(30) / pow(60));
  };
  const odd = await orders(undefined);
  const even = await orders(3);
  assert.ok(odd - even > 8, `odd-fire order-1.5 lift ${odd.toFixed(1)} vs even ${even.toFixed(1)} dB`);

  const prof = () => ({ speed: 0.74, throttle: 0.5, charge: 1 });
  const buf = await renderChronoCoupe(prof, 2.2, { sampleRate: SR, cues: [{ t: 1.2, type: 'discharge' }] });
  const x = buf.getChannelData(0);
  const rms = (a, b) => {
    let s = 0;
    for (let i = Math.floor(a * SR); i < Math.floor(b * SR); i++) {
      assert.ok(Number.isFinite(x[i]));
      s += x[i] * x[i];
    }
    return 20 * Math.log10(Math.sqrt(s / (Math.floor(b * SR) - Math.floor(a * SR))) + 1e-12);
  };
  const pre = rms(0.7, 1.15);
  let post = -Infinity;
  for (let k = 0; k < 10; k++) post = Math.max(post, rms(1.2 + k * 0.025, 1.3 + k * 0.025));
  assert.ok(post - pre <= 3.5, `discharge short-term loudness +${(post - pre).toFixed(1)} dB over engine`);
  assert.ok(post - pre >= -3, 'discharge still audible');

  const v = await import(pathToFileURL(join(root, 'src/audio/chronoCoupeVoice.js')).href);
  const { OfflineAudioContext } = await import('node-web-audio-api');
  const ctx = new OfflineAudioContext(2, SR, SR);
  const bus = new v.ChronoCoupeBus(ctx, ctx.destination);
  bus.setCharge(2);
  bus.updateCharge({});
  assert.equal(bus.discharge({}), true);
  assert.equal(bus.discharge({}), false, 'cooldown');
  bus.dispose();
});
