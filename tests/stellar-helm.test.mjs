import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
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
  const file = join(mkdtempSync(join(tmpdir(), 'sh-test-')), 'm.mjs');
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

const voiceUrl = pathToFileURL(join(root, 'src/audio/stellarHelmVoice.js')).href;

/** New files owned by this pack — must stay free of franchise / show terms. */
const NEW_FILES = [
  'src/audio/stellarHelmPack.ts',
  'src/audio/stellarHelmVoice.js',
  'src/audio/stellarHelmVoice.d.ts',
  'scripts/stellar-helm-render.mjs',
  'scripts/stellar-helm-qa.mjs',
  'docs/stellar-helm-audio-v1.md',
];
// Whole-word, case-insensitive. Built from fragments so this test file itself stays clean.
const BANNED_WORDS = [
  ['Enter', 'prise'],
  ['Star T', 'rek'],
  ['Tr', 'ek'],
  ['Star', 'fleet'],
  ['LC', 'ARS'],
  ['wa', 'rp'],
  ['imp', 'ulse'],
  ['dili', 'thium'],
  ['N', 'CC'],
  ['N', 'CC-1701'],
  ['Feder', 'ation'],
  ['eng', 'age'],
  ['Kling', 'on'],
  ['Ki', 'rk'],
  ['Pic', 'ard'],
  ['Sp', 'ock'],
  ['Oku', 'da'],
].map((parts) => new RegExp(`\\b${parts.join('').replace(/[-]/g, '\\-')}\\b`, 'i'));
const BANNED_SHOW = [
  ['night[\\s_-]?', 'ri', 'der'],
  ['night[\\s_-]?', 'run', 'ner'],
  ['\\bki', 'tt\\b'],
  ['kni', 'ght\\s*', 'ri', 'der'],
].map((parts) => new RegExp(parts.join(''), 'i'));
const OLD_WORKING_ID = new RegExp(['enter', 'prise-console'].join(''), 'i');

test('identity: one constant drives id, name, builtin, topology and preview', async () => {
  const pack = await loadTs('src/audio/stellarHelmPack.ts');
  assert.deepEqual({ ...pack.STELLAR_HELM_PACK }, { id: 'stellar-helm', name: 'Stellar Helm' });
  const src = read('src/audio/stellarHelmPack.ts');
  assert.equal((src.match(/'stellar-helm'/g) || []).length, 1, 'id literal appears exactly once');
  assert.equal((src.match(/'Stellar Helm'/g) || []).length, 1, 'name literal appears exactly once');
  const patch = pack.stellarHelmBuiltinPatch();
  assert.equal(patch.id, pack.STELLAR_HELM_PACK.id);
  assert.equal(patch.topology, pack.STELLAR_HELM_PACK.id);
  assert.equal(patch.name, pack.STELLAR_HELM_PACK.name);
  assert.equal(patch.kind, 'ev-whine');
  assert.ok(patch.meta.tags.includes('experimental'));
  assert.equal(patch.params.pursuitBoost, 0, 'boost off by default');
  assert.equal(patch.params.lifecycleSounds, 0, 'generic chirps replaced by pack cues');
  assert.equal(patch.params.gearCount, 1, 'single continuous ratio for Frontend sims');

  const builtins = read('src/audio/builtins.ts');
  assert.equal((builtins.match(/stellarHelmBuiltinPatch\(\)/g) || []).length, 1, 'single builtin entry');
  assert.match(builtins, /case STELLAR_HELM_PACK\.id:\s*return \{ \.\.\.STELLAR_HELM_DEFAULTS \}/);
  assert.match(read('src/audio/types.ts'), /\| typeof STELLAR_HELM_PACK\.id/);
  assert.match(read('src/pages/EnginesPage.tsx'), /\[STELLAR_HELM_PACK\.id\]: `snippets\/\$\{STELLAR_HELM_PACK\.id\}\.wav`/);
  assert.ok(existsSync(join(root, 'public/snippets/stellar-helm.wav')), 'preview snippet rendered');
  assert.match(read('scripts/render-snippets.mjs'), /id: 'stellar-helm', file: 'stellar-helm\.wav'/);
});

test('no franchise / show terms (whole word) and no old working id in the new files', () => {
  for (const rel of NEW_FILES) {
    const src = read(rel);
    for (const re of [...BANNED_WORDS, ...BANNED_SHOW, OLD_WORKING_ID]) {
      assert.doesNotMatch(src, re, `${rel} contains ${re}`);
    }
  }
  // Added lines in shared files carry the same guarantee (diff-free check: grep our markers)
  for (const rel of ['src/audio/EngineSynthImpl.ts', 'src/audio/builtins.ts', 'src/audio/engineStartShutdown.ts']) {
    const lines = read(rel).split('\n').filter((l) => /stellar|helm/i.test(l));
    for (const l of lines) for (const re of BANNED_WORDS) assert.doesNotMatch(l, re, `${rel}: ${l}`);
  }
});

test('fully procedural: no decoded/fetched audio or audio files in the voice', () => {
  for (const rel of ['src/audio/stellarHelmVoice.js', 'src/audio/stellarHelmPack.ts']) {
    assert.doesNotMatch(read(rel), /decodeAudioData|fetch\(|\.wav|\.mp3|\.ogg|new Audio\(|audioWorklet\.addModule/, rel);
  }
});

test('hooks: envelope + boost on CharacterEngine wrapper and EngineSynthImpl, voice wired', () => {
  const ce = read('src/audio/CharacterEngine.ts');
  const impl = read('src/audio/EngineSynthImpl.ts');
  for (const m of ['getEnvelope()', 'getVoiceEnvelope()', 'setPursuitBoost(amount']) {
    assert.ok(ce.includes(m), `CharacterEngine missing ${m}`);
    assert.ok(impl.includes(m), `EngineSynthImpl missing ${m}`);
  }
  assert.match(impl, /isStellarHelmTopology\(_topology\)[\s\S]{0,200}new StellarHelmVoice\(ctx, master/);
  assert.match(impl, /g\.helmVoice\?\.dispose\(\)/);
  assert.match(impl, /if \(g\.helmVoice\) \{\s*this\.applyStellarHelmDriving\(d, immediate\);\s*\} else if \(kind === 'ice'\)/);
  assert.match(impl, /helmVoice\.powerUp\(1\.6, undefined, 0\)/);
  assert.match(impl, /if \(this\.started\) g\.helmVoice\.powerUp\(1\.2, undefined, 0\)/, 'pack switch while running');
  assert.match(impl, /helmVoice\?\.powerDown\(dur \* 0\.85\)/);
  const ss = read('src/audio/engineStartShutdown.ts');
  assert.match(ss, /isStellarHelmTopology\(topology\)\) return SH_STARTER_SECONDS/);
  assert.match(ss, /isStellarHelmTopology\(topology\)\) return SH_SHUTOFF_SECONDS/);
});

test('drive model: continuous, no cliffs; rpm ignored; throttle/reverse/boost directions', async () => {
  const v = await import(voiceUrl);
  const P = { pursuitBoost: 0 };
  // rpm / rpmNorm from a gearbox sim must not change anything
  const a = v.stepStellarHelmDrive(v.createStellarHelmDriveState(), { speed: 0.4, throttle: 0.3 }, 0.5, P);
  const b = v.stepStellarHelmDrive(
    v.createStellarHelmDriveState(),
    { speed: 0.4, throttle: 0.3, rpm: 6800, rpmNorm: 0.95 },
    0.5,
    P,
  );
  assert.deepEqual(a, b);

  // Hard steps in every input (speed 0→1, throttle, reverse, boost) → per-frame target moves stay small
  const s = v.createStellarHelmDriveState();
  let prev = null;
  const maxStep = { coreHz: 0, cutoff: 0, coreGain: 0, subGain: 0, level: 0 };
  for (let i = 0; i < 60 * 12; i++) {
    const t = i / 60;
    const input = {
      speed: t < 2 ? 0 : t < 8 ? 1 : 0.1,
      throttle: t < 3 ? 0 : t < 6 ? 1 : 0,
      reverse: t >= 9 && t < 10.5,
    };
    const drv = v.stepStellarHelmDrive(s, input, 1 / 60, { pursuitBoost: t >= 4 && t < 7 ? 1 : 0 });
    const tg = v.stellarHelmTargets({}, drv);
    for (const k of Object.keys(tg)) assert.ok(Number.isFinite(tg[k]), `${k} finite`);
    if (prev) {
      maxStep.coreHz = Math.max(maxStep.coreHz, Math.abs(Math.log2(tg.coreHz / prev.coreHz)) * 1200);
      maxStep.cutoff = Math.max(maxStep.cutoff, Math.abs(Math.log2(tg.cutoff / prev.cutoff)) * 1200);
      for (const k of ['coreGain', 'subGain', 'level']) maxStep[k] = Math.max(maxStep[k], Math.abs(tg[k] - prev[k]));
    }
    prev = tg;
  }
  // Physically impossible hard steps still glide (audio params smooth a further ~80 ms)
  assert.ok(maxStep.coreHz < 30, `core pitch moved ${maxStep.coreHz.toFixed(1)} cents in one frame`);
  // A floored pedal opens the core ~1.3 oct over ~1 s: a swell, not a step
  assert.ok(maxStep.cutoff < 100, `cutoff moved ${maxStep.cutoff.toFixed(1)} cents in one frame`);
  assert.ok(maxStep.coreGain < 0.02 && maxStep.subGain < 0.02 && maxStep.level < 0.02, JSON.stringify(maxStep));

  // Realistic launch 0→60 mph in 5 s with throttle → sub-5-cent frame moves
  const sr = v.createStellarHelmDriveState();
  let pr = null;
  let maxReal = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const t = i / 60;
    const drv = v.stepStellarHelmDrive(sr, { speed: Math.min(0.5, t / 10), throttle: t < 5 ? 0.6 : 0.2 }, 1 / 60, P);
    const hz = v.stellarHelmTargets({}, drv).coreHz;
    if (pr) maxReal = Math.max(maxReal, Math.abs(Math.log2(hz / pr)) * 1200);
    pr = hz;
  }
  assert.ok(maxReal < 5, `realistic launch moved ${maxReal.toFixed(2)} cents in one frame`);

  const at = (drv) => v.stellarHelmTargets({}, { x: 0, thr: 0, rev: 0, boost: 0, ...drv });
  // Pitch and brightness rise monotonically (and gently) with speed
  let last = at({ x: 0 });
  for (let x = 0.05; x <= 1.0001; x += 0.05) {
    const cur = at({ x });
    assert.ok(cur.coreHz > last.coreHz && cur.cutoff > last.cutoff);
    last = cur;
  }
  const idle = at({});
  const top = at({ x: 1 });
  assert.ok(top.coreHz / idle.coreHz < 2, 'gentle: under one octave across the speed range');
  // Throttle = warmth + power; reverse = lower + softer; boost = more intensity + brightness
  const thr = at({ x: 0.5, thr: 1 });
  const cruise = at({ x: 0.5 });
  assert.ok(thr.shelfDb > cruise.shelfDb && thr.powerGain > cruise.powerGain && thr.coreGain > cruise.coreGain);
  const rev = at({ x: 0.1, rev: 1 });
  const fwd = at({ x: 0.1 });
  assert.ok(rev.coreHz < fwd.coreHz && rev.level < fwd.level && rev.cutoff < fwd.cutoff);
  const boost = at({ x: 0.5, boost: 1 });
  assert.ok(boost.cutoff > cruise.cutoff && boost.shimmerGain > cruise.shimmerGain && boost.coreGain > cruise.coreGain);
  // Lift-off relaxes slower than pressing
  const st = v.createStellarHelmDriveState();
  v.stepStellarHelmDrive(st, { speed: 0.5, throttle: 1 }, 0.3, P);
  const rise = st.thr;
  const st2 = v.createStellarHelmDriveState();
  st2.thr = 1;
  v.stepStellarHelmDrive(st2, { speed: 0.5, throttle: 0 }, 0.3, P);
  assert.ok(1 - st2.thr < rise, 'release slower than attack');
});

test('offline render of the real voice: levels, spectrum, boost, reverse, cues', async () => {
  const { renderStellarHelm } = await import(pathToFileURL(join(root, 'scripts/stellar-helm-render.mjs')).href);
  const { analyse } = await import(pathToFileURL(join(root, 'scripts/stellar-helm-qa.mjs')).href);
  const SR = 22050;
  const r = (profile, dur, opts = {}) => renderStellarHelm(profile, dur, { sampleRate: SR, ...opts });
  const parked = analyse(await r(() => ({ speed: 0, throttle: 0 }), 4), 2, 4);
  const cruise = analyse(await r(() => ({ speed: 0.54, throttle: 0.35 }), 4), 2, 4);
  const boost = analyse(await r(() => ({ speed: 0.54, throttle: 0.35, boost: 1 }), 4), 2, 4);
  const full = analyse(await r(() => ({ speed: 0.95, throttle: 1, load: 0.8, boost: 1 }), 4), 2, 4);
  const rev = analyse(await r(() => ({ speed: 0.06, throttle: 0.3, reverse: true }), 4), 2.5, 4);
  const fwd = analyse(await r(() => ({ speed: 0.06, throttle: 0.3 }), 4), 2.5, 4);
  assert.ok(parked.rmsDb > -32, `parked audible (${parked.rmsDb})`);
  assert.ok(parked.centroidHz < 130, `parked deep (${parked.centroidHz} Hz)`);
  assert.ok(cruise.centroidHz > parked.centroidHz, 'brightens with speed');
  assert.ok(boost.centroidHz > cruise.centroidHz, 'boost is brighter');
  assert.ok(boost.rmsDb - cruise.rmsDb < 4, `boost restrained (+${(boost.rmsDb - cruise.rmsDb).toFixed(1)} dB)`);
  assert.ok(full.rmsDb - parked.rmsDb < 7, 'whole range within 7 dB (no surprise loudness)');
  assert.ok(full.peakDb < -3, `headroom at full boost (${full.peakDb} dBFS peak)`);
  assert.ok(rev.rmsDb < fwd.rmsDb - 2 && rev.centroidHz < fwd.centroidHz, 'reverse lower + softer');

  // Power-up starts silent and settles into the hum; shutoff falls away to silence
  const up = await r(() => ({ speed: 0, throttle: 0 }), 4, { powerUp: 1.6, cues: [{ t: 0.02, type: 'starter' }] });
  const early = analyse(up, 0, 0.2);
  const sweep = analyse(up, 0.5, 1.6);
  const settled = analyse(up, 2.5, 4);
  assert.ok(early.rmsDb < settled.rmsDb - 10, 'power-up starts near silence');
  assert.ok(sweep.peakDb < settled.peakDb + 3, `starter never jumps over the hum (+${(sweep.peakDb - settled.peakDb).toFixed(1)} dB)`);
  const down = await r(() => ({ speed: 0, throttle: 0 }), 5, { cues: [{ t: 2, type: 'shutoff' }] });
  const before = analyse(down, 0.5, 2);
  const during = analyse(down, 2, 3);
  const after = analyse(down, 4.5, 5);
  assert.ok(during.rmsDb < before.rmsDb + 3, 'shutoff restrained');
  assert.ok(during.centroidHz < before.centroidHz, 'power-down falls in pitch');
  assert.ok(after.rmsDb < -60, 'soft tail ends in silence');
});
