// Night Pursuit sensor-pod radar: model, rAF gate, reduced-motion static mode, aria-hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NP = 'src/skins/night-pursuit';
const req = createRequire(join(root, 'package.json'));
const bare = (spec) => pathToFileURL(req.resolve(spec)).href;

/** Transpile the skin's TS/TSX into a temp dir (CSS imports dropped, specifiers resolved). */
const dir = mkdtempSync(join(tmpdir(), 'np-radar-test-'));
for (const f of ['radarModel.ts', 'NightPursuitRadar.tsx', 'NightPursuitOverlay.tsx', 'useHudCompact.ts']) {
  let out = ts.transpileModule(readFileSync(join(root, NP, f), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  out = out
    .replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '')
    .replace(/from\s+['"](\.\/[^'"]+)['"]/g, (_, p) => `from '${p}.mjs'`)
    .replace(/from\s+['"](react(?:-dom)?(?:\/[a-z-]+)?)['"]/g, (_, p) => `from '${bare(p)}'`);
  writeFileSync(join(dir, f.replace(/\.tsx?$/, '.mjs')), out);
}
const load = (n) => import(pathToFileURL(join(dir, `${n}.mjs`)).href);
const m = await load('radarModel');

test('sweep rate follows rpm: idle ~3.5 s/rev, redline ~1 s/rev, monotonic', () => {
  assert.equal(m.sweepPeriodForRpm(0.1), 3.5);
  assert.ok(Math.abs(m.sweepPeriodForRpm(0.95) - 1) < 1e-9);
  assert.ok(Math.abs(m.sweepPeriodForRpm(1) - 1) < 1e-9);
  assert.ok(m.sweepPeriodForRpm(0) <= 3.5 && m.sweepPeriodForRpm(NaN) === 3.5);
  let prev = Infinity;
  for (let r = 0; r <= 1.0001; r += 0.01) {
    const p = m.sweepPeriodForRpm(r);
    assert.ok(p <= prev + 1e-12);
    prev = p;
  }
});

test('rpm step is smoothed: no jumps in sweep rate or bearing', () => {
  const s = m.createRadarState(m.RADAR_SEED, { rpmNorm: 0.1, speedNorm: 0, load: 0 });
  let maxRateStep = 0;
  let maxBearingStep = 0;
  for (let i = 0; i < 600; i++) {
    const before = { rate: s.rate, b: s.bearing };
    m.stepRadar(s, 1 / 60, { rpmNorm: i < 60 ? 0.1 : 1, speedNorm: 0.3, load: 1 });
    maxRateStep = Math.max(maxRateStep, Math.abs(s.rate - before.rate));
    maxBearingStep = Math.max(maxBearingStep, Math.abs(s.bearing - before.b));
  }
  assert.ok(Math.abs(s.rate - 1) < 0.01, 'reaches 1 rev/s at redline');
  assert.ok(maxRateStep < 0.03, `rate step ${maxRateStep}`);
  // ≤ π per half-cycle; at 1 rev/s and 60 fps one frame moves well under 10°
  assert.ok(maxBearingStep < (10 * Math.PI) / 180, `bearing step ${maxBearingStep}`);
});

test('contacts: calm 1–2 at idle, more with speed + load, capped', () => {
  const idle = m.contactTarget(0, 0.1);
  assert.ok(idle >= 1 && idle <= 2, `idle ${idle}`);
  assert.ok(m.contactTarget(0.5, 0.6) > idle);
  assert.equal(m.contactTarget(1, 1), m.MAX_CONTACTS);
  const s = m.createRadarState(m.RADAR_SEED, { rpmNorm: 0.1, speedNorm: 0, load: 0.1 });
  for (let i = 0; i < 300; i++) m.stepRadar(s, 1 / 60, { rpmNorm: 0.1, speedNorm: 0, load: 0.1 });
  const shown = s.contacts.filter((c) => c.presence > 0.05).length;
  assert.ok(shown >= 1 && shown <= 2, `idle shows ${shown}`);
});

test('blips brighten when the sweep crosses, then decay softly (no hard flash)', () => {
  const s = m.createRadarState(m.RADAR_SEED, { rpmNorm: 1, speedNorm: 0, load: 0 });
  const c = s.contacts[0];
  let maxStep = 0;
  let peak = 0;
  const trace = [];
  for (let i = 0; i < 240; i++) {
    const e0 = c.energy;
    m.stepRadar(s, 1 / 60, { rpmNorm: 1, speedNorm: 0, load: 0 });
    maxStep = Math.max(maxStep, Math.abs(c.energy - e0));
    peak = Math.max(peak, c.energy);
    trace.push(c.energy);
  }
  assert.ok(peak > 0.7, 'brightens when crossed');
  assert.ok(maxStep < 0.3, `per-frame energy step ${maxStep.toFixed(3)} (soft rise)`);
  assert.ok(Math.min(...trace.slice(60)) > 0.2, 'persistence: does not fall dark between passes at 1 rev/s');
});

test('seeded: identical input stream → identical scope state', () => {
  const run = () => {
    const s = m.createRadarState(m.RADAR_SEED, { rpmNorm: 0.2, speedNorm: 0.1, load: 0.2 });
    for (let i = 0; i < 400; i++) m.stepRadar(s, 1 / 60, { rpmNorm: 0.2 + i / 800, speedNorm: 0.4, load: 0.6 });
    return JSON.stringify({ b: s.bearing, c: s.contacts.map(({ rng, ...k }) => k) });
  };
  assert.equal(run(), run());
});

test('rAF gate: static (reduced motion) never schedules; hidden/offscreen cancels', () => {
  const calls = { raf: 0, caf: 0 };
  let pending = null;
  const loop = m.createRadarLoop(
    (cb) => { calls.raf++; pending = cb; return calls.raf; },
    () => { calls.caf++; pending = null; },
    () => {},
  );
  loop.set({ staticMode: true, visible: true, hidden: false });
  assert.equal(calls.raf, 0, 'reduced motion: no rAF');
  assert.equal(loop.running, false);
  loop.set({ staticMode: false });
  assert.equal(calls.raf, 1);
  pending(16);
  assert.equal(calls.raf, 2, 'keeps ticking while live');
  loop.set({ hidden: true });
  assert.equal(calls.caf, 1, 'paused when document hidden');
  assert.equal(loop.running, false);
  loop.set({ hidden: false, visible: false });
  assert.equal(calls.raf, 2, 'not scheduled while offscreen');
  loop.set({ visible: true, staticMode: true });
  assert.equal(calls.raf, 2, 'switching to static keeps it stopped');
  assert.equal(m.shouldRun({ staticMode: true, visible: true, hidden: false }), false);
});

test('radar is decorative and static under motion={false}', async () => {
  const { createElement: h } = await import(bare('react'));
  const { renderToStaticMarkup } = await import(bare('react-dom/server'));
  const { NightPursuitRadar } = await load('NightPursuitRadar');
  const still = renderToStaticMarkup(h(NightPursuitRadar, { rpmNorm: 0.5, speedNorm: 0.2, loadFeel: 0.3, motion: false }));
  assert.match(still, /^<div class="np-radar" aria-hidden="true" data-radar="static">/);
  assert.doesNotMatch(still, /<canvas|<text|role=/, 'no canvas, no text, no roles inside the scope');
  const live = renderToStaticMarkup(h(NightPursuitRadar, { rpmNorm: 0.5, speedNorm: 0.2, loadFeel: 0.3 }));
  assert.match(live, /aria-hidden="true" data-radar="live"/);
});

test('overlay: radar lives in the green CRT screen of the sensor pod; motion prop reaches it', async () => {
  const { createElement: h } = await import(bare('react'));
  const { renderToStaticMarkup } = await import(bare('react-dom/server'));
  const { NightPursuitOverlay } = await load('NightPursuitOverlay');
  const props = { rpmNorm: 0.1, speedNorm: 0, throttle: 0, loadFeel: 0 };
  const html = renderToStaticMarkup(h(NightPursuitOverlay, { ...props, motion: false }));
  assert.match(html, /<section class="np-pod np-pod-crt" aria-hidden="true">.*<div class="np-crt np-crt-a np-radar-scope"><div class="np-radar" aria-hidden="true" data-radar="static">/);
  assert.equal((html.match(/class="np-radar"/g) || []).length, 1, 'one scope');
  assert.equal((html.match(/<canvas/g) || []).length, 0, 'no canvas (would promote a layer and re-raster the HUD)');
  assert.match(html, /np-crt np-crt-b/, 'cyan feed screen unchanged');
  assert.match(renderToStaticMarkup(h(NightPursuitOverlay, props)), /data-radar="live"/);
  // Compact layout drops the pods (and therefore the radar) as before (compact resolves after
  // layout, so check the source branch rather than SSR output).
  const ov = readFileSync(join(root, NP, 'NightPursuitOverlay.tsx'), 'utf8');
  const compactBranch = ov.slice(ov.indexOf('if (fit.compact)'), ov.indexOf('return (', ov.indexOf('if (fit.compact)') + 200));
  assert.ok(compactBranch.length > 100 && !compactBranch.includes('NightPursuitRadar'));
});

test('perf + a11y guards in source: no layout reads per frame, no blur filters, no text in the scope', () => {
  const src = readFileSync(join(root, NP, 'NightPursuitRadar.tsx'), 'utf8');
  const drawLive = src.slice(src.indexOf('const drawLive'), src.indexOf('const loop ='));
  assert.ok(drawLive.length > 50);
  assert.doesNotMatch(drawLive, /getBoundingClientRect|offset(Width|Height)|getComputedStyle|client(Width|Height)/);
  assert.doesNotMatch(src, /will-change|willChange|<canvas|<text|filter/);
  assert.match(src, /new ResizeObserver/);
  assert.match(src, /visibilitychange/);
  assert.match(src, /IntersectionObserver/);
  const css = readFileSync(join(root, NP, 'night-pursuit.css'), 'utf8');
  const radarCss = css.slice(css.indexOf('Sensor-pod radar'));
  assert.doesNotMatch(radarCss, /filter|font-size|will-change|animation|transition/);
});
