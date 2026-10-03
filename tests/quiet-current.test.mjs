import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    return { resolve, reject, promise };
  };
}
// EngineSynthImpl imports the pulse worklet module; stub its worklet-scope globals for node.
globalThis.AudioWorkletProcessor ??= class {};
globalThis.registerProcessor ??= () => {};
globalThis.sampleRate ??= 44100;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'));
const voiceUrl = pathToFileURL(join(root, 'src/audio/quietCurrentVoice.js')).href;

// Banned terms (Product Research brief §7.7 + §8.6, plus the Night Pursuit / Chrono lists), whole-word,
// case-insensitive. Stored reversed — same convention as PACK_ENGINE_MIGRATIONS — so pack files never
// contain the literals the gate greps for.
const rev = (s) => [...s].reverse().join('');
const BANNED_REVERSED = [
  'alset', 'alst', 'retsdaor', 'imes alset', 'kcurtrebyc', 'bacrebyc', 'tsaebrebyc', 'dauqrebyc',
  'ixatobor', 'navobor', 'dnalhgih', 'repinuj', 'dialp', 'suorcidul', 'edom enasni', 'edom llihc',
  'regrahcrepus', 'gnigrahcrepus', 'regrahcagem', 'rotcennoc llaw', 'llawrewop', 'kcapagem',
  'yrotcafagig', 'agig', 'sumitpo', 'tolipotua', 'reetsotua', 'tolipotua no etagivan', 'dsf',
  'gnivird-fles lluf', 'gnivird-fles', 'nommus trams', 'nommus trams yllautca', 'noisiv alset',
  'edom yrtnes', 'edom god', 'edom tep', 'edom pmac', 'esnefed nopaewoib', 'retaeht alset',
  'edacra alset', 'xobyot', 'ekoarac', 'xobmoob', 'wohs thgil', 'edom ecnamor', 'korg', 'korg yeh',
  '3wh', '4wh', '4ia', '5ia', 'ucm', 'mahtog', 'snas lasrevinu', 'snaslasrevinu', 'moc.alset',
  'gohrebyc', 'oedor rebyc', 'retsdaor rebyc', 'navrebyc', 'seires noitadnuof', 'erahsrewop',
  'x03', 'ssalg romra', 'noteleksoxe', '1ea6e3#', '02a171#', '14c393#', '26e5c5#', 'ssvmf',
  // Chrono Coupe + Night Pursuit lists stay clean too
  'enihcam emit', 'naerolde', 'cmd', 'erutuf eht ot kcab', 'emitatuo', 'yellav llih',
  'hpm 88', 'hpm88', 'stiucric emit', 'roticapac', 'ttawagig', 'sttawagig', 'noisuf rm', 'cod',
  'ytram', 'nworb', 'redir-thgin', 'redir thgin', 'rennur-thgin', 'ttik', 'seirtsudni thgink',
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED = [
  ...BANNED_REVERSED.map((r) => new RegExp(`(?<![\\w])${esc(rev(r)).replace(/ /g, '[\\s_-]?')}(?![\\w])`, 'i')),
  new RegExp(`(?<![\\w])${rev('ledom')}[\\s_-]?[s3xy](?![\\w])`, 'i'),
  new RegExp(`\\(${rev('desivrepus')}\\)`, 'i'),
  new RegExp(`\\b${rev('lf')}[uüo]+${rev('x')}`, 'i'),
];
const PACK_FILES = [
  'src/audio/quietCurrentPack.ts',
  'src/audio/quietCurrentVoice.js',
  'src/audio/quietCurrentVoice.d.ts',
  'scripts/quiet-current-render.mjs',
  'scripts/quiet-current-qa.mjs',
  'docs/quiet-current-audio-v1.md',
  'tests/quiet-current.test.mjs',
];

const rmsDb = (x, a = 0, b = x.length) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-20);
};
// Power spectrum (naive DFT over a decimated grid is too slow) → radix-2 FFT
function fftPow(x) {
  let n = 1;
  while (n < x.length) n <<= 1;
  n >>= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
  }
  const P = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) P[i] = re[i] * re[i] + im[i] * im[i];
  return P;
}
function spectrum(x, sr) {
  const P = fftPow(x);
  const bin = sr / (2 * P.length);
  let tot = 0;
  let cen = 0;
  for (let i = 0; i < P.length; i++) {
    tot += P[i];
    cen += P[i] * i * bin;
  }
  const band = (lo, hi) => {
    let s = 0;
    for (let i = Math.floor(lo / bin); i < Math.min(P.length, Math.ceil(hi / bin)); i++) s += P[i];
    return 10 * Math.log10(s / tot + 1e-20);
  };
  return { centroid: cen / tot, band };
}
function wavRms(rel) {
  const b = readFileSync(join(root, rel));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  const ch = b.readUInt16LE(22);
  let s = 0;
  let n = 0;
  for (let o = 44; o + 1 < b.length; o += 2 * ch) {
    let v = 0;
    for (let c = 0; c < ch; c++) v += b.readInt16LE(o + 2 * c) / 32768;
    v /= ch;
    s += v * v;
    n++;
  }
  return 10 * Math.log10(s / n);
}

test('identity: ONE constant carries id + display name; builtin, defaults, meta derive from it', async () => {
  const pack = await jiti.import(join(root, 'src/audio/quietCurrentPack.ts'));
  assert.deepEqual({ ...pack.QUIET_CURRENT }, { id: 'quiet-current', displayName: 'Quiet Current' });
  const patch = pack.quietCurrentBuiltinPatch();
  assert.equal(patch.id, pack.QUIET_CURRENT.id);
  assert.equal(patch.topology, pack.QUIET_CURRENT.id);
  assert.equal(patch.name, pack.QUIET_CURRENT.displayName);
  assert.equal(patch.kind, 'ev-whine');
  assert.ok(patch.meta.tags.includes('experimental'));
  assert.equal(patch.params.cyber, 0, 'standard by default');
  assert.equal(patch.params.pursuitBoost, 0);
  assert.equal(patch.params.lifecycleSounds, 0, 'own power cues replace the generic lifecycle one-shots');
  assert.equal(pack.QUIET_CURRENT_VARIANT_STORAGE_KEY, 'revforge.pack.quiet-current.variant');
  assert.equal(pack.QUIET_CURRENT_CYBER_PREVIEW_ID, `${pack.QUIET_CURRENT.id}-cyber`);
  const builtins = await jiti.import(join(root, 'src/audio/builtins.ts'));
  assert.equal(builtins.BUILTIN_PATCHES.filter((x) => x.id === pack.QUIET_CURRENT.id).length, 1, 'exactly one builtin');
  assert.equal(builtins.defaultsForTopology(pack.QUIET_CURRENT.id).steelRing, pack.QUIET_CURRENT_DEFAULTS.steelRing);
  const metaIds = builtins.paramMetaForKind('ev-whine', pack.QUIET_CURRENT.id).map((m) => m.id);
  for (const id of ['inverterTone', 'motorHum', 'gearMesh', 'roadNoise', 'windNoise', 'regenTone', 'cyber', 'steelRing'])
    assert.ok(metaIds.includes(id), id);
  assert.ok(!builtins.paramMetaForKind('ev-whine').some((m) => m.id === 'steelRing'), 'stock EV meta untouched');
  // Rename = one line: no other source file spells the id / name literally
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const full = join(dir, f);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(join(root, 'src'))) {
    if (file.endsWith('quietCurrentPack.ts') || !/\.(ts|tsx|js)$/.test(file)) continue;
    assert.doesNotMatch(readFileSync(file, 'utf8'), /['"`]quiet-current['"`]|Quiet Current['"`]/, file);
  }
  const ep = read('src/pages/EnginesPage.tsx');
  assert.match(ep, /\[QUIET_CURRENT\.id\]: `snippets\/\$\{QUIET_CURRENT\.id\}\.wav`/);
  assert.match(ep, /\[QUIET_CURRENT_CYBER_PREVIEW_ID\]: `snippets\/\$\{QUIET_CURRENT_CYBER_PREVIEW_ID\}\.wav`/);
  const idx = await jiti.import(join(root, 'src/audio/index.ts'));
  assert.equal(idx.QUIET_CURRENT.id, pack.QUIET_CURRENT.id);
  assert.equal(typeof idx.quietCurrentCyberAmount, 'function');
});

test('hooks: getEnvelope / getVoiceEnvelope / setPursuitBoost / setVariant on wrapper + impl (optional, safe)', async () => {
  const ce = read('src/audio/CharacterEngine.ts');
  const impl = read('src/audio/EngineSynthImpl.ts');
  for (const m of ['getEnvelope()', 'getEnvelope(detail', 'getPowerState()', 'getVoiceEnvelope()', 'setPursuitBoost(amount', 'setVariant(variant']) {
    assert.ok(ce.includes(m), `CharacterEngine missing ${m}`);
    assert.ok(impl.includes(m), `EngineSynthImpl missing ${m}`);
  }
  const types = read('src/audio/types.ts');
  assert.match(types, /setVariant\?\(variant: QuietCurrentVariant \| number\): void;/);
  assert.match(types, /getEnvelope\?\(\): number;/);
  assert.match(types, /getPowerState\?\(\): QuietCurrentEnvelope \| null;/);
  assert.match(types, /setPursuitBoost\?\(amount: number\): void;/);

  const { OfflineAudioContext } = await import('node-web-audio-api');
  const { createEngineSynth, EngineSynthImpl } = await jiti.import(join(root, 'src/audio/EngineSynthImpl.ts'));
  const pack = await jiti.import(join(root, 'src/audio/quietCurrentPack.ts'));
  const builtins = await jiti.import(join(root, 'src/audio/builtins.ts'));
  const ctx = new OfflineAudioContext(2, 22050 * 2, 22050);
  // Inactive (not started): all hooks are safe no-ops / zero
  const wrapper = createEngineSynth(ctx, pack.quietCurrentBuiltinPatch());
  assert.equal(wrapper.getEnvelope(), 0);
  assert.equal(wrapper.getVoiceEnvelope(), 0);
  const idle = wrapper.getEnvelope(true);
  assert.deepEqual(
    { ...idle },
    { level: 0, powerKw: 0, powerNorm: 0, maxPowerKw: 300, maxRegenKw: 120, motorRpm: 0, redlineRpm: 18000 },
    'HUD power state is safe (zeros) when inactive',
  );
  wrapper.setVariant('cyber');
  assert.equal(wrapper.getParams().cyber, 1);
  wrapper.setVariant(0.25);
  assert.equal(wrapper.getParams().cyber, 0.25);
  wrapper.setVariant('standard');
  assert.equal(wrapper.getParams().cyber, 0);
  wrapper.setPursuitBoost(2);
  assert.equal(wrapper.getParams().pursuitBoost, 1, 'clamped');
  wrapper.setPursuitBoost(Number.NaN);
  assert.equal(wrapper.getParams().pursuitBoost, 0);
  const base = new EngineSynthImpl(ctx, pack.quietCurrentBuiltinPatch());
  base.setVariant('cyber');
  base.setPursuitBoost(0.5);
  assert.equal(base.getParams().cyber, 1);
  assert.equal(base.getEnvelope(), 0);
  // Other packs: harmless
  const other = new EngineSynthImpl(ctx, builtins.getBuiltin('ev-whine'));
  other.setVariant('cyber');
  other.setPursuitBoost(1);
  assert.equal(other.toPatch().topology, 'ev-whine');
  assert.equal(other.getPowerState(), null, 'power state only on Quiet Current');
  assert.equal(typeof other.getEnvelope(), 'number');
  base.dispose();
  other.dispose();
  base.setVariant('standard'); // after dispose: still safe

  // Running: one setDriving on change still glides to target (settle loop), cue plays, output sane
  ctx.resume = async () => {};
  await wrapper.start();
  wrapper.setDriving({ speed: 0.5, throttle: 0.3 });
  wrapper.triggerUiCue('starter');
  await new Promise((r) => setTimeout(r, 900));
  assert.ok(Math.abs(wrapper.getHud().rpmNorm - 0.5) < 0.01, `settled rpmNorm ${wrapper.getHud().rpmNorm}`);
  assert.equal(typeof wrapper.getEnvelope(), 'number', 'no-arg form stays a number (audioBridge contract)');
  const drive = wrapper.getEnvelope(true);
  assert.ok(drive.powerKw > 0 && drive.powerKw <= drive.maxPowerKw, `drive powerKw ${drive.powerKw}`);
  assert.ok(Math.abs(drive.powerNorm - drive.powerKw / drive.maxPowerKw) < 1e-9);
  assert.ok(Math.abs(drive.motorRpm - 0.5 * drive.redlineRpm) < 200, `motorRpm ${drive.motorRpm}`);
  // Regen on lift-off → negative powerKw / powerNorm (same state as the regen tone)
  wrapper.setDriving({ speed: 0.5, throttle: 0 });
  await new Promise((r) => setTimeout(r, 700));
  const lift = wrapper.getPowerState();
  assert.ok(lift.powerKw < 0 && lift.powerKw >= -lift.maxRegenKw, `regen powerKw ${lift.powerKw}`);
  assert.ok(lift.powerNorm < -0.5 && lift.powerNorm >= -1, `regen powerNorm ${lift.powerNorm}`);
  assert.ok(Math.abs(lift.powerNorm - lift.powerKw / lift.maxRegenKw) < 1e-9);
  wrapper.setDriving({ speed: 0.5, throttle: 0.3 });
  const buf = await ctx.startRendering();
  const x = buf.getChannelData(0);
  let peak = 0;
  for (const v of x) {
    assert.ok(Number.isFinite(v));
    peak = Math.max(peak, Math.abs(v));
  }
  assert.ok(peak > 0.005 && peak < 0.5, `full-chain peak ${peak}`);
  wrapper.dispose();
});

test('no banned terms in pack files (whole-word, case-insensitive)', () => {
  for (const rel of PACK_FILES) {
    const src = read(rel);
    for (const re of BANNED) assert.doesNotMatch(src, re, `${rel} matches ${re}`);
  }
  // also the lines this pack adds to shared files
  for (const rel of ['src/audio/builtins.ts', 'src/audio/EngineSynthImpl.ts', 'src/audio/engineStartShutdown.ts']) {
    const lines = read(rel).split('\n').filter((l) => /QUIET_CURRENT|quietCurrent|QuietCurrent|qcBus|qcDrive/.test(l));
    for (const re of BANNED) for (const l of lines) assert.doesNotMatch(l, re, `${rel}: ${l}`);
  }
});

test('fully procedural: no decoded / fetched audio in the pack voice', () => {
  for (const rel of ['src/audio/quietCurrentVoice.js', 'src/audio/quietCurrentPack.ts']) {
    assert.doesNotMatch(read(rel), /decodeAudioData|fetch\(|\.wav|\.mp3|\.ogg|new Audio\(|import\(/, rel);
  }
  const ess = read('src/audio/engineStartShutdown.ts');
  assert.match(ess, /if \(isQuietCurrentTopology\(s\.topology\)\) \{\n\s+\/\/ Power-on[^\n]*\n\s+return playQuietCurrentPowerOn\(/);
  assert.match(ess, /if \(isQuietCurrentTopology\(s\.topology\)\) \{\n\s+\/\/ Power-off[^\n]*\n\s+return playQuietCurrentPowerOff\(/);
  // No decorative sounds while driving: the upshift bark is skipped for this voice
  assert.match(read('src/audio/EngineSynthImpl.ts'), /if \(this\.g\.qcBus\) return;\n\s+let scale = 1;/);
});

test('drive model: continuous (no cliffs), stepped carrier at low speed, regen / reverse lower, layers gate', async () => {
  const v = await import(voiceUrl);
  const P = { regenTone: 0.6 };
  // Realistic pull-away → cruise → lift → stop: per-frame pitch steps stay small
  const s = v.createQuietCurrentDriveState();
  let prev = null;
  let maxMotor = 0;
  let maxInv = 0;
  let sawStepped = false;
  for (let i = 0; i < 60 * 20; i++) {
    const t = i / 60;
    const speed = t < 1 ? 0 : t < 9 ? Math.min(0.6, (t - 1) * 0.075) : Math.max(0, 0.6 - (t - 9) * 0.06);
    const throttle = t < 1 ? 0 : t < 9 ? Math.min(0.7, (t - 1) * 2) : 0;
    const d = v.stepQuietCurrentDrive(s, { speed, throttle }, 1 / 60, P);
    for (const k of ['motorHz', 'inverterHz', 'regen', 'presence', 'lowHum', 'mesh']) assert.ok(Number.isFinite(d[k]), k);
    if (prev) {
      maxMotor = Math.max(maxMotor, Math.abs(Math.log2(d.motorHz / prev.motorHz)) * 1200);
      maxInv = Math.max(maxInv, Math.abs(Math.log2(d.inverterHz / prev.inverterHz)) * 1200);
    }
    if (d.m > 0.03 && d.m < 0.1 && Math.abs(d.inverterHz / (v.qcInverterHz(d.m) * d.ratio) - 1) > 0.012) sawStepped = true;
    prev = d;
  }
  assert.ok(maxMotor < 30, `motor pitch step ${maxMotor.toFixed(1)} cents/frame`);
  assert.ok(maxInv < 30, `inverter pitch step ${maxInv.toFixed(1)} cents/frame`);
  assert.ok(sawStepped, 'gentle stepped-carrier character at low speed');
  // At speed the inverter tone is the continuous curve (steps faded out)
  const fast = v.createQuietCurrentDriveState();
  let d;
  for (let i = 0; i < 120; i++) d = v.stepQuietCurrentDrive(fast, { speed: 0.5, throttle: 0.3 }, 1 / 60, P);
  assert.ok(d.stepAmt < 1e-6);
  assert.ok(Math.abs(d.inverterHz - v.qcInverterHz(d.m)) < 1);
  assert.ok(d.settled, 'settles');
  // Regen on lift-off: slightly lower (3–10 %) with a gentle glide
  const lift = v.createQuietCurrentDriveState();
  for (let i = 0; i < 120; i++) v.stepQuietCurrentDrive(lift, { speed: 0.5, throttle: 0.3 }, 1 / 60, P);
  const glide = [];
  for (let i = 0; i < 90; i++) glide.push(v.stepQuietCurrentDrive(lift, { speed: 0.5, throttle: 0 }, 1 / 60, P));
  const ratio = glide.at(-1).motorHz / d.motorHz;
  assert.ok(ratio < 0.97 && ratio > 0.9, `regen pitch ratio ${ratio.toFixed(3)}`);
  for (let i = 1; i < glide.length; i++) assert.ok(glide[i].motorHz <= glide[i - 1].motorHz + 1e-9, 'descending glide');
  assert.ok(glide.at(-1).regen > 0.9);
  const ov = v.createQuietCurrentDriveState();
  let o;
  for (let i = 0; i < 90; i++) o = v.stepQuietCurrentDrive(ov, { speed: 0.4, throttle: 0.3, overrun: true }, 1 / 60, P);
  assert.ok(o.regen > 0.5, 'Frontend overrun also engages regen');
  // Reverse: lower
  const r = v.createQuietCurrentDriveState();
  let rd;
  for (let i = 0; i < 120; i++) rd = v.stepQuietCurrentDrive(r, { speed: 0.05, throttle: 0.2, reverse: true }, 1 / 60, P);
  assert.ok(rd.motorHz < v.qcMotorHz(rd.m) * 0.88);
  // Low-speed hum gone by ~30 km/h; gear mesh fades in above ~55 %
  const at = (speed) => {
    const st = v.createQuietCurrentDriveState();
    let q;
    for (let i = 0; i < 240; i++) q = v.stepQuietCurrentDrive(st, { speed, throttle: 0.3 }, 1 / 60, P);
    return q;
  };
  assert.ok(at(0.05).lowHum > 0.5);
  assert.ok(at(31 / v.QC_SPEED_FULL_KPH).lowHum < 0.01);
  assert.ok(at(0.4).mesh < 0.01 && at(0.9).mesh > 0.9);
  // HUD power (simulated kW-equivalent): drive > 0, lift-off regen < 0, powerNorm -1..1
  {
    const pw = v.createQuietCurrentDriveState();
    let q;
    for (let i = 0; i < 120; i++) q = v.stepQuietCurrentDrive(pw, { speed: 0.6, throttle: 1 }, 1 / 60, P);
    assert.ok(q.powerKw > 250 && q.powerKw <= 300, `full drive ${q.powerKw}`);
    assert.ok(q.powerNorm > 0.8 && q.powerNorm <= 1);
    assert.equal(q.redlineRpm, 18000);
    assert.ok(Math.abs(q.motorRpm - q.m * 18000) < 1e-6);
    for (let i = 0; i < 90; i++) q = v.stepQuietCurrentDrive(pw, { speed: 0.6, throttle: 0 }, 1 / 60, P);
    assert.ok(q.powerKw < -100 && q.powerKw >= -120, `regen on lift-off ${q.powerKw}`);
    assert.ok(Math.abs(q.powerNorm - q.powerKw / 120) < 1e-9 && q.powerNorm >= -1);
    assert.ok(q.regen > 0.9, 'same regen state drives the tone');
    const lc = v.quietCurrentPowerLimits({}, 1);
    assert.deepEqual(lc, { maxPowerKw: 390, maxRegenKw: 150, redlineRpm: 18000 }, 'Cyber limits');
    const ov = v.quietCurrentPowerLimits({ maxPowerKw: 200 }, 0);
    assert.equal(ov.maxPowerKw, 200, 'params override');
  }
  // Variant: names map, numbers blend; switching crossfades (never a jump)
  assert.equal(v.quietCurrentCyberAmount('cyber'), 1);
  assert.equal(v.quietCurrentCyberAmount('standard'), 0);
  assert.equal(v.quietCurrentCyberAmount(0.4), 0.4);
  assert.equal(v.quietCurrentCyberAmount(7), 1);
  const sw = v.createQuietCurrentDriveState();
  const first = v.stepQuietCurrentDrive(sw, { speed: 0.4, throttle: 0.3 }, 1 / 60, { cyber: 1 });
  assert.ok(first.cyber > 0 && first.cyber < 0.1, 'variant crossfade');
});

test('offline render: quiet, safe, no >10 kHz glare; Cyber brighter not louder; regen softer', async () => {
  const R = await import(pathToFileURL(join(root, 'scripts/quiet-current-render.mjs')).href);
  const SR = 44100;
  const seg = async (profile, dur, params, a, b) => {
    const buf = await R.renderQuietCurrent(profile, dur, { sampleRate: SR, params });
    const x = buf.getChannelData(0);
    let peak = 0;
    for (const v of x) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
    }
    const s = x.subarray(Math.floor(a * SR), Math.floor(b * SR));
    return { rms: rmsDb(s), peak: 20 * Math.log10(peak), spec: spectrum(s, SR) };
  };
  const cruise = () => ({ speed: 0.5, throttle: 0.25 });
  const std = await seg(cruise, 3, { cyber: 0 }, 1.4, 3);
  const cy = await seg(cruise, 3, { cyber: 1 }, 1.4, 3);
  const rest = await seg(() => ({ speed: 0, throttle: 0 }), 2, {}, 1, 2);
  const regen = await seg((t) => ({ speed: 0.5, throttle: t < 1 ? 0.25 : 0 }), 3, {}, 2, 3);
  assert.ok(rest.rms < -38, `rest ${rest.rms.toFixed(1)} dB (quiet by default)`);
  assert.ok(std.rms < -21 && std.rms > -32, `cruise ${std.rms.toFixed(1)} dB`);
  assert.ok(std.peak < -8 && cy.peak < -8, 'never loud');
  assert.ok(std.spec.band(10500, 22050) < -40 && cy.spec.band(10500, 22050) < -40, 'no piercing >10 kHz content');
  assert.ok(cy.spec.centroid > std.spec.centroid * 1.12, `cyber centroid ${cy.spec.centroid.toFixed(0)} vs ${std.spec.centroid.toFixed(0)}`);
  assert.ok(cy.spec.band(3000, 6000) > std.spec.band(3000, 6000) + 3, 'brighter metallic partials');
  assert.ok(Math.abs(cy.rms - std.rms) < 1.5, `cyber loudness delta ${(cy.rms - std.rms).toFixed(1)} dB`);
  assert.ok(regen.rms < std.rms, 'regen softer than driving');
  assert.ok(regen.spec.centroid < std.spec.centroid, 'regen darker');
  // Boost adds presence, but politely
  const boost = await seg(() => ({ speed: 0.5, throttle: 0.25, boost: 1 }), 3, {}, 1.4, 3);
  assert.ok(boost.rms - std.rms > 1 && boost.rms - std.rms < 4, `boost +${(boost.rms - std.rms).toFixed(1)} dB`);
  // Power cues: soft, finite, below the driving voice's peak
  for (const type of ['on', 'off']) {
    const c = await seg(() => ({ speed: 0, throttle: 0 }), 1.8, { masterGain: 0 }, 0, 1.8);
    assert.ok(c.rms < -60, 'muted voice');
    const buf = await R.renderQuietCurrent(() => ({ speed: 0, throttle: 0 }), 1.8, { sampleRate: SR, cues: [{ t: 0.05, type }] });
    const x = buf.getChannelData(0);
    let pk = 0;
    for (const v of x) pk = Math.max(pk, Math.abs(v));
    const db = 20 * Math.log10(pk);
    assert.ok(db > -40 && db < std.peak, `${type} cue peak ${db.toFixed(1)} dB`);
    const end = rmsDb(x, Math.floor(1.7 * SR), x.length);
    assert.ok(end < rest.rms + 3, `${type} cue decays`);
  }
});

test('preview WAVs: both variants rendered, a few dB below the V8 preview, no level cliffs', () => {
  const v8 = wavRms('public/snippets/v8-rumble.wav');
  for (const rel of ['public/snippets/quiet-current.wav', 'public/snippets/quiet-current-cyber.wav']) {
    assert.ok(existsSync(join(root, rel)), rel);
    const r = wavRms(rel);
    assert.ok(v8 - r >= 2 && v8 - r <= 6, `${rel} ${r.toFixed(1)} dB vs V8 ${v8.toFixed(1)} dB`);
    // 20 ms RMS steps inside the driving part (ignore fade-in from rest and the 0.3 s end fade)
    const b = readFileSync(join(root, rel));
    const ch = b.readUInt16LE(22);
    const sr = b.readUInt32LE(24);
    const w = Math.floor(0.02 * sr);
    const frames = Math.floor((b.length - 44) / (2 * ch) / w);
    const lv = [];
    for (let f = 0; f < frames; f++) {
      let s = 0;
      for (let i = 0; i < w; i++) {
        const v = b.readInt16LE(44 + 2 * ch * (f * w + i)) / 32768;
        s += v * v;
      }
      lv.push(10 * Math.log10(s / w + 1e-12));
    }
    let max = 0;
    for (let f = Math.floor(1.3 / 0.02); f < lv.length - Math.ceil(0.4 / 0.02); f++) max = Math.max(max, Math.abs(lv[f] - lv[f - 1]));
    assert.ok(max < 3, `${rel} max 20 ms step ${max.toFixed(2)} dB`);
  }
});
