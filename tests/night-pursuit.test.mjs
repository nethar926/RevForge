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

// ——— Visual skin: v3 quick pass (drive-mode key colours, red-first scanner, grey captions) ———
const NP_TSX = 'src/skins/night-pursuit/NightPursuitOverlay.tsx';
const NP_CSS = 'src/skins/night-pursuit/night-pursuit.css';
const cssRule = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[},])\\s*${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
};
const hexLum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => {
  const [x, y] = [hexLum(a), hexLum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('NP drive-mode keys: CRUISE green, PURSUIT red, AUTO white legend (never red)', () => {
  const tsx = read(NP_TSX);
  const css = read(NP_CSS);
  assert.match(tsx, /\{ id: 'norm', label: 'Cruise', tone: 'g' \}/);
  assert.match(tsx, /\{ id: 'pursuit', label: 'Pursuit', tone: 'r' \}/);
  assert.match(tsx, /\{ id: 'auto', label: 'Auto', tone: 'w' \}/);
  assert.doesNotMatch(tsx, /label: 'Norm'/);
  assert.match(tsx, /np-mode-btn tone-\$\{m\.tone\}/);
  assert.match(cssRule(css, '.np-mode-btn.tone-g.active'), /color: #6af59a/);
  assert.match(cssRule(css, '.np-mode-btn.tone-r.active'), /color: #ff7a6a/);
  const auto = cssRule(css, '.np-mode-btn.tone-w.active');
  assert.match(auto, /color: #f4eee2/);
  assert.doesNotMatch(auto, /#ff|255, 50, 30|crimson/i, 'AUTO is never red');
  const unlit = cssRule(css, '.np-mode-btn');
  assert.match(unlit, /color: #a3a5ab/, 'unlit legend grey');
  assert.match(unlit, /#2a2c30/, 'unlit key dark');
  assert.match(cssRule(css, '.np-overlay .np-mode-btn'), /color: #a3a5ab/, 'unlit legend beats host button reset');
  assert.doesNotMatch(css, /\.np-mode-btn\.amber/, 'old amber AUTO/NORM keys removed');
});

test('NP scanner is red-first: red chase, red idle eye, one red lamp-test sweep', () => {
  const tsx = read(NP_TSX);
  const css = read(NP_CSS);
  assert.match(tsx, /data-scan=\{pursuitHot \? 'chase' : 'idle'\}/);
  assert.match(tsx, /np-scanner-test" onAnimationEnd=\{\(\) => setLampTest\(false\)\}/);
  const idle = cssRule(css, '.np-scanner[data-scan="idle"] .np-scanner-eye');
  assert.match(idle, /animation: none/, 'idle eye is steady');
  assert.match(idle, /255, 40, 20/, 'idle eye is red');
  const sweep = cssRule(css, '.np-scanner-test');
  assert.match(sweep, /animation: np-lamp-sweep \d+ms ease-out 1 forwards/, 'lamp test runs once');
  assert.match(sweep, /#d81808/, 'lamp test is red');
  // No green / cyan anywhere in the scanner styles.
  const scannerCss = css.slice(css.indexOf('/* Top scanner'), css.indexOf('/* Dash grid */'));
  assert.doesNotMatch(scannerCss, /green|cyan|#00c853|#00e5ff|60, 230, 110/);
});

test('NP motion: nothing faster than 3 flashes/s; Reduce Motion stops chase and sweep', () => {
  const css = read(NP_CSS);
  const tsx = read(NP_TSX);
  // Chase: one alternate pass per period, so at most 1000/period edge-hits per second.
  for (const ms of [...tsx.matchAll(/'(\d+)ms'/g)].map((m) => Number(m[1]))) {
    assert.ok(1000 / ms < 3, `scanner period ${ms}ms`);
  }
  const sweepMs = Number(css.match(/np-lamp-sweep (\d+)ms/)[1]);
  assert.ok(sweepMs >= 334, 'lamp test is one slow pass');
  assert.doesNotMatch(css, /animation:[^;]*np-lamp-sweep[^;]*infinite/);
  for (const block of [
    css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'), css.indexOf('.motion-off .np-scanner-cell {')),
    css.slice(css.indexOf('.motion-off .np-scanner-eye'), css.indexOf('/* Dash grid */')),
  ]) {
    assert.match(block, /\.np-scanner-eye,\s*\n\s*(\.motion-off )?\.np-scanner-test \{\s*animation: none !important;\s*display: none;/);
  }
});

test('NP grey status and captions: neutral grey, >= 11px, >= 4.5:1 on the panel', () => {
  const css = read(NP_CSS);
  assert.match(css, /--skin-caption: #a9abb0;/);
  assert.match(css, /--skin-status: #c4c6ca;/);
  for (const sel of ['.np-pod-label', '.np-bar-label', '.np-status']) {
    const rule = cssRule(css, sel);
    assert.ok(rule, `${sel} rule found`);
    assert.ok(Number(rule.match(/font-size: (\d+)px/)[1]) >= 11, `${sel} >= 11px`);
    assert.match(rule, /color: var\(--skin-(caption|status)/, `${sel} uses the grey token`);
    assert.doesNotMatch(rule, /cyan|crimson|amber/, `${sel} neutral`);
  }
  // Lightest panel / footer / key surfaces the captions sit on.
  for (const bg of ['#1d1f22', '#111214', '#080808', '#2a2c30']) {
    assert.ok(contrast('#a9abb0', bg) >= 4.5, `caption on ${bg}: ${contrast('#a9abb0', bg).toFixed(2)}`);
    assert.ok(contrast('#c4c6ca', bg) >= 4.5, `status on ${bg}`);
    assert.ok(contrast('#a3a5ab', bg) >= 4.5, `unlit key legend on ${bg}`);
  }
});

test('NP skin copy stays original (no banned names)', () => {
  for (const rel of [NP_TSX, NP_CSS]) {
    const src = read(rel);
    for (const re of BANNED) assert.doesNotMatch(src, re, `${rel} contains ${re}`);
  }
});

test('NP lamp test can never stick: 1.4 s timer end, skipped under reduced motion, armed after ignition', () => {
  const src = readFileSync(new URL('../src/skins/night-pursuit/NightPursuitOverlay.tsx', import.meta.url), 'utf8');
  assert.match(src, /setTimeout\(\(\) => setLampPhase\('done'\), 1400\)/, 'timer ends the lamp test');
  assert.match(src, /prefers-reduced-motion: reduce/, 'OS reduced motion skips it');
  assert.match(src, /closest\('\.motion-off'\)/, 'app motion-off skips it');
  assert.match(src, /useState<'pending' \| 'on' \| 'done'>\('pending'\)/, 'starts pending, not lit under the splash');
  assert.match(src, /const engineLive = rpmReal > 0/, 'armed by first engine RPM');
});
