// Night Pursuit "Drive mode" rail: modes, Auto engaged / pursuitHot, group labelling, physical CSS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NP = 'src/skins/night-pursuit';
const req = createRequire(join(root, 'package.json'));
const bare = (spec) => pathToFileURL(req.resolve(spec)).href;
const src = (f) => readFileSync(join(root, NP, f), 'utf8');

/** Transpile every TS/TSX module of the skin into a temp dir (CSS imports dropped, specifiers resolved). */
const dir = mkdtempSync(join(tmpdir(), 'np-rail-test-'));
for (const f of readdirSync(join(root, NP)).filter((n) => /\.tsx?$/.test(n) && !n.endsWith('.d.ts'))) {
  let out = ts.transpileModule(src(f), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  out = out
    .replace(/^import\s+['"][^'"]+\.css['"];?\s*$/gm, '')
    .replace(/from\s+['"](\.\/[^'"]+)['"]/g, (_, p) => `from '${p}.mjs'`)
    .replace(/from\s+['"](react(?:-dom)?(?:\/[a-z-]+)?)['"]/g, (_, p) => `from '${bare(p)}'`);
  writeFileSync(join(dir, f.replace(/\.tsx?$/, '.mjs')), out);
}
const { NightPursuitOverlay, NP_MODES } = await import(pathToFileURL(join(dir, 'NightPursuitOverlay.mjs')).href);
const React = await import(bare('react'));
const { renderToStaticMarkup } = await import(bare('react-dom/server'));

const base = { rpmNorm: 0.2, speedNorm: 0.1, throttle: 0.3, loadFeel: 0.2 };
const render = (props) => renderToStaticMarkup(React.createElement(NightPursuitOverlay, { ...base, ...props }));
const buttons = (html) =>
  [...html.matchAll(/<button([^>]*)>(?:<span[^>]*><\/span>)?([^<]*)<\/button>/g)].map((m) => ({
    label: m[2],
    pressed: /aria-pressed="true"/.test(m[1]),
    active: /class="[^"]*\bactive\b/.test(m[1]),
    engaged: /data-engaged="true"/.test(m[1]),
  }));
const footer = (html) => html.match(/Scanner (?:idle|chase) · Mode [^<]*/)?.[0];
const hot = (html) => /class="np-overlay[^"]*\bnp-hot\b/.test(html);

test('MODES: Auto / Cruise / Pursuit, no Power button; norm keeps its id', () => {
  assert.deepEqual(
    NP_MODES.map((m) => [m.id, m.label]),
    [
      ['auto', 'Auto'],
      ['norm', 'Cruise'],
      ['pursuit', 'Pursuit'],
    ],
  );
  const html = render({ mode: 'norm' });
  assert.deepEqual(buttons(html).map((b) => b.label), ['Auto', 'Cruise', 'Pursuit']);
  assert.doesNotMatch(html, />Power</);
  // 'power' stays in the mode type for old saves (Frontend migrates it to norm).
  assert.match(src('NightPursuitOverlay.tsx'), /export type NightPursuitMode = 'power' \| 'auto' \| 'norm' \| 'pursuit';/);
});

test('"Drive mode" caption labels the key group (VoiceOver: "Drive mode, group")', () => {
  const html = render({ mode: 'norm' });
  const group = html.match(/<div class="np-mode-rail"([^>]*)>/);
  assert.ok(group, 'rail rendered');
  assert.match(group[1], /role="group"/);
  assert.doesNotMatch(group[1], /aria-label=/, 'name comes from the visible caption');
  const id = group[1].match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(id, 'aria-labelledby set');
  const label = html.match(new RegExp(`<div class="np-mode-label" id="${id}">([^<]*)</div>`));
  assert.ok(label, 'labelledby points at the caption');
  assert.equal(label[1], 'Drive mode', 'sentence case in the DOM');
  // Caption is not a control; every key keeps aria-pressed and a decorative lamp.
  assert.doesNotMatch(label[0], /<button|role="button"|tabindex/);
  assert.equal((html.match(/aria-pressed="(true|false)"/g) || []).length, 3);
  assert.equal((html.match(/<span class="np-key-lamp" aria-hidden="true"><\/span>/g) || []).length, 3);
  // Two HUDs on one page get distinct ids.
  const id2 = render({ mode: 'norm' }).match(/aria-labelledby="([^"]+)"/)[1];
  assert.notEqual(id, id2);
  // The mount owns announcements: no live region in the skin.
  assert.doesNotMatch(html, /aria-live|role="status"|role="alert"/);
});

test('exactly one key lit + pressed, matching the mode', () => {
  for (const [mode, label] of [
    ['auto', 'Auto'],
    ['norm', 'Cruise'],
    ['pursuit', 'Pursuit'],
  ]) {
    const b = buttons(render({ mode }));
    assert.deepEqual(b.filter((x) => x.pressed).map((x) => x.label), [label], mode);
    assert.deepEqual(b.filter((x) => x.active).map((x) => x.label), [label], mode);
  }
  // Legacy 'power' (un-migrated save): runs hot, no key lit.
  const p = render({ mode: 'power' });
  assert.equal(buttons(p).filter((x) => x.pressed || x.active).length, 0);
  assert.ok(hot(p));
});

test('autoEngaged: optional, default false; pursuitHot = pursuit | power | (auto && engaged)', () => {
  const idle = render({ mode: 'auto' });
  assert.equal(hot(idle), false, 'auto idle is not hot');
  assert.equal(footer(idle), 'Scanner idle · Mode AUTO');
  assert.equal(buttons(idle).some((b) => b.engaged), false);

  const engaged = render({ mode: 'auto', autoEngaged: true });
  assert.ok(hot(engaged), 'auto engaged runs hot');
  assert.equal(footer(engaged), 'Scanner chase · Mode AUTO · PURSUIT');
  const b = buttons(engaged);
  assert.deepEqual(b.filter((x) => x.active || x.pressed).map((x) => x.label), ['Auto'], 'only Auto lit');
  assert.equal(b.find((x) => x.label === 'Pursuit').active, false, 'Pursuit stays unlit');
  assert.equal(b.find((x) => x.label === 'Auto').engaged, true);
  assert.match(engaged, /SYS · PURSUIT/);

  // autoEngaged only matters in auto.
  for (const mode of ['norm', 'pursuit']) {
    const a = render({ mode, autoEngaged: true });
    const n = render({ mode });
    assert.equal(hot(a), hot(n), mode);
    assert.equal(buttons(a).some((x) => x.engaged), false, mode);
  }
  assert.equal(hot(render({ mode: 'norm' })), false);
  assert.ok(hot(render({ mode: 'pursuit' })));
  assert.equal(footer(render({ mode: 'norm' })), 'Scanner idle · Mode CRUISE');
  assert.equal(footer(render({ mode: 'pursuit' })), 'Scanner chase · Mode PURSUIT');
  assert.equal(footer(render({})), 'Scanner idle · Mode CRUISE', 'default mode is norm (Cruise)');
});

test('compact keeps the same rail: caption + 3 keycaps with lamps', () => {
  const tsx = src('NightPursuitOverlay.tsx');
  const rails = tsx.match(/\{modeRail\([^)]*\)\}/g) || [];
  assert.deepEqual(rails, ["{modeRail(' np-c-rail')}", '{modeRail()}'], 'compact and full share one rail');
});

test('physical layer: static, paint-only, contrast + forced-colours cues', () => {
  const css = src('night-pursuit-physical.css');
  assert.doesNotMatch(css, /@keyframes|(?:^|\n)\s*(?:animation|transition|will-change)[a-z-]*\s*:/, 'no motion');
  // Geometry untouched: no spacing / box-size properties in the layer (lamp is absolutely placed).
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:padding|margin|min-height|min-width|border-width|gap)[a-z-]*\s*:/);
  for (const q of ['@media (prefers-contrast: more)', '@media (forced-colors: active)']) {
    const block = css.slice(css.indexOf(q));
    assert.ok(css.includes(q), q);
    assert.match(block, /\.np-mode-btn\.active \.np-key-lamp/, `${q}: lit lamp`);
    assert.match(block, /text-decoration: underline/, `${q}: underline cue`);
  }
  assert.match(src('NightPursuitOverlay.tsx'), /import '\.\/night-pursuit-physical\.css';/);
});
