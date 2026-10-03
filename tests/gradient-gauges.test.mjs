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
  const file = join(mkdtempSync(join(tmpdir(), 'gg-test-')), 'm.mjs');
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

const m = await loadTs('src/skins/gradient-gauges/gaugeMath.ts');

test('sweep numerals clear 4.5:1 against every point of the readout sector, both inks', () => {
  // light ink: the whole readout sector, including both blends.
  assert.ok(m.minContrastAlong(m.SWEEP_INK.light, m.SWEEP_BOTTOM.light.stops.map((x) => x[0])) >= 4.5);
  for (const ink of ['light', 'dark']) {
    const c = m.minContrastAlong(m.SWEEP_INK[ink], m.SWEEP_BOTTOM[ink].core);
    assert.ok(c >= 4.5, `${ink} ink min contrast ${c.toFixed(2)}`);
  }
});

test('the reference navy-on-mid-blue would fail (documented deviation)', () => {
  assert.ok(m.contrast('#0d1b33', '#1a6fe6') < 4.5);
});

test('cyan fade never reaches the pinned readout sector, at any value', () => {
  for (let v = 0; v <= 160; v += 0.5) {
    const g = m.sweepGradient(m.sweepAngle(v, 160));
    const degs = [...g.matchAll(/ (-?[\d.]+)deg/g)].slice(1).map((x) => Number(x[1]));
    for (let i = 1; i < degs.length; i++) assert.ok(degs[i] >= degs[i - 1], `stops ascend at v=${v}`);
    const cyanAt = Number(g.match(/#19d3ff ([\d.]+)deg/)[1]);
    const pastAt = Number(g.match(/#1a6fe6 ([\d.]+)deg/)[1]);
    assert.ok(pastAt <= m.SWEEP_BOTTOM_FROM, `fade ends ${pastAt} before ${m.SWEEP_BOTTOM_FROM}`);
    assert.ok(cyanAt <= m.SWEEP_SPAN + 1e-9);
  }
});

test('twin dial centre text contrast', () => {
  assert.ok(m.contrast('#ff4a4d', '#0b1320') >= 4.5, 'red on housing');
  assert.ok(m.contrast('#ff4a4d', '#3a0b0e') >= 4.5, 'red on speed tile');
  assert.ok(m.contrast('#ff4a4d', '#2a0a0d') >= 4.5, 'red on rpm pill');
  assert.ok(m.contrast('#19d3ff', '#0f2236') >= 4.5, 'cyan gear chip');
  assert.ok(m.contrast('#ffffff', '#8f1119') >= 4.5, 'REDLINE chip');
});

test('graphics: needle edges and redline keylines ≥ 3:1', () => {
  assert.ok(m.contrast('#19d3ff', m.SWEEP_COLORS.filledEnd) >= 3, 'sweep hard edge');
  // Redline marks = coral outline on a black keyline: whichever edge meets the
  // background must clear 3:1 against every arc/disc colour (and blends of them).
  const bgs = ['#19d3ff', '#1a6fe6', '#0f4fbf', '#0c3d94', '#03133a', '#1257c9', '#2079f5', '#1257c8', '#0a3576', '#031634', '#ef4146', '#8a2f45'];
  for (const a of bgs) for (const b of bgs) for (let s = 0; s <= 10; s++) {
    const p = m.mix(a, b, s / 10);
    assert.ok(Math.max(m.contrast('#000000', p), m.contrast('#ff8a7e', p)) >= 3, `redline mark on ${p}`);
  }
  assert.ok(m.contrast('#c8f6ff', '#03101e') >= 3, 'speed needle outline vs core');
});

test('aria value text in words', () => {
  assert.equal(m.speedValueText('Speed', 42, 'mph'), 'Speed 42 miles per hour');
  assert.equal(m.speedValueText('Speed', 1, 'kph'), 'Speed 1 kilometer per hour');
  assert.equal(m.rpmValueText(3200), 'RPM 3,200');
  assert.equal(m.rpmValueText(7100, true), 'RPM 7,100, redline');
});

test('redline ticks are flagged from redlineFrom', () => {
  const ticks = m.sweepTicks(160, 140);
  assert.equal(ticks.length, 11);
  assert.deepEqual(ticks.filter((t) => t.redline).map((t) => Math.round(t.value)), [144, 160]);
});

test('no brand names in gauge sources', () => {
  for (const f of ['SweepGauge.tsx', 'TwinDialCluster.tsx', 'GradientGaugeHuds.tsx', 'index.ts', 'gradient-gauges.css']) {
    const s = read(`src/skins/gradient-gauges/${f}`);
    assert.doesNotMatch(s, /tesla|porsche|bmw|mercedes|audi|ferrari|apple car/i, f);
  }
});
