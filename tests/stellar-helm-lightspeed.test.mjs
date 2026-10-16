import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const SKIN = 'src/skins/stellar-helm/';

async function loadTs(rel) {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(mkdtempSync(join(tmpdir(), 'sh-ls-')), 'm.mjs');
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

test('warp factor = mph ÷ 10, one decimal, capped at 9.9', async () => {
  const { warpFactor } = await loadTs(`${SKIN}lightSpeed.ts`);
  assert.equal(warpFactor(0), '0.0');
  assert.equal(warpFactor(35), '3.5');
  assert.equal(warpFactor(62), '6.2');
  assert.equal(warpFactor(75), '7.5');
  assert.equal(warpFactor(61.6), '6.2'); // follows the whole mph the HUD shows
  assert.equal(warpFactor(140), '9.9');
  assert.equal(warpFactor(-5), '0.0');
  assert.equal(warpFactor(Number.NaN), '0.0');
});

test('light speed % = mph ÷ jump speed, clamped 0–100; 100 only at/after the jump', async () => {
  const { lightSpeedPct, LIGHT_SPEED_MPH_DEFAULT } = await loadTs(`${SKIN}lightSpeed.ts`);
  assert.equal(LIGHT_SPEED_MPH_DEFAULT, 70);
  assert.equal(lightSpeedPct(0), 0);
  assert.equal(lightSpeedPct(35), 50);
  assert.equal(lightSpeedPct(62), 89);
  assert.equal(lightSpeedPct(69.9), 99);
  assert.equal(lightSpeedPct(70), 100);
  assert.equal(lightSpeedPct(75), 100);
  assert.equal(lightSpeedPct(-3), 0);
  assert.equal(lightSpeedPct(50, 100), 50);
  assert.equal(lightSpeedPct(35, 0), 50); // bad jump speed → default 70
  assert.equal(lightSpeedPct(35, Number.NaN), 50);
});

test('HUD: optional lightSpeedMph prop, meter replaces AUDIO BUS, labelled readouts', () => {
  const hud = read(`${SKIN}StellarHelmHud.tsx`);
  assert.match(hud, /lightSpeedMph\?: number;/);
  assert.doesNotMatch(hud, />AUDIO BUS</);
  assert.doesNotMatch(hud, /className="sh-bus/);
  assert.match(hud, /role="meter"/);
  assert.match(hud, /aria-valuenow=\{lsPct\}/);
  assert.match(hud, /aria-label=\{`Light speed \$\{lsPct\} percent`\}/);
  assert.match(hud, /aria-label=\{`Warp \$\{warp\}`\}/);
  // the readouts are no longer inside an aria-hidden section
  assert.doesNotMatch(hud, /className="sh-ring sh-panel" aria-hidden/);
  assert.doesNotMatch(hud, /className="sh-power" aria-hidden/);
  // both looks keep their caption (generic wording)
  assert.match(hud, /'WARP' : 'DRIVE'/);
});

test('CSS: meter + warp shown in compact, steady (no animation / transition), both frames coloured', () => {
  const css = read(`${SKIN}stellar-helm.css`).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /\.sh-compact \.sh-ls[^{]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /\.sh-compact \.sh-warp[^{]*\{[^}]*display:\s*none/);
  for (const rule of css.match(/[^}]*\.sh-(ls|warp)[^{]*\{[^}]*\}/g) || []) assert.doesNotMatch(rule, /animation|transition/, rule);
  for (const f of ['frame-classic.css', 'frame-helm.css']) {
    const s = read(SKIN + f);
    for (const v of ['--sh-ls-on', '--sh-ls-plate-bg', '--sh-ls-plate-fg', '--sh-warp']) assert.match(s, new RegExp(`${v}:`), `${f} ${v}`);
  }
});

test('new light-speed code stays free of franchise names', () => {
  const banned = [['Enter', 'prise'], ['Star', 'fleet'], ['Tr', 'ek'], ['dili', 'thium'], ['hyper', 'drive'], ['Mill', 'ennium'], ['Fal', 'con']]
    .map((p) => new RegExp(`\\b${p.join('')}\\b`, 'i'));
  for (const f of ['lightSpeed.ts', 'StellarHelmHud.tsx', 'HANDOFF.md']) {
    const s = read(SKIN + f);
    for (const re of banned) assert.doesNotMatch(s, re, `${f}: ${re}`);
  }
});

test('ring panel: WARP FACTOR is the only readout (no centre digit, no GEAR, no MPH · RPM line)', () => {
  const dir = 'src/skins/stellar-helm/';
  for (const f of ['HelmRings.tsx', 'StellarHelmHud.tsx', 'stellar-helm.css', 'frame-classic.css', 'frame-helm.css', 'StellarHelmThumb.tsx', 'HANDOFF.md'])
    assert.doesNotMatch(read(dir + f), /gear/i, f);
  const hud = read(`${dir}StellarHelmHud.tsx`);
  assert.doesNotMatch(hud, /sh-cap-r/);
  assert.doesNotMatch(read(`${dir}HelmRings.tsx`), /<text/);
  // primary readouts stay
  for (const c of ['sh-rpm', 'sh-mph', 'sh-power-head', 'sh-warp-num', 'role="meter"', "'WARP' : 'DRIVE'"]) assert.ok(hud.includes(c), c);
  assert.match(hud, /POWER · RPM × 1000/);
});

// MPH / RPM box parity with 510870f. The big readouts size from their container (cqh), so any
// row the light-speed work adds above the bottom bar would shrink and shift them. The browser
// gate (lightspeed/v3/parity.mjs) measures the boxes; this pins the CSS that makes them equal.
test('MPH / RPM parity: readout sizing and the compact rows match 510870f; LIGHT SPEED adds no height', () => {
  const css = read(`${SKIN}stellar-helm.css`).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const decl = Object.fromEntries(m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim().replace(/\s+/g, ' ')]; }));
    for (const sel of m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '))) rules.set(sel, { ...(rules.get(sel) || {}), ...decl });
  }
  const get = (sel, prop) => rules.get(sel)?.[prop];
  // 510870f values, verbatim
  assert.equal(get('.sh-mph', 'font'), '600 min(178px, 40cqh) / 0.92 var(--sh-display)');
  assert.equal(get('.sh-rpm', 'font'), '600 min(80px, 17cqh) / 1 var(--sh-display)');
  assert.equal(get('.sh-compact .sh-mph', 'font-size'), 'min(calc(120 * var(--u, 1px)), 42cqh)');
  assert.equal(get('.sh-compact .sh-rpm', 'font-size'), 'min(calc(48 * var(--u, 1px)), 22cqh)');
  assert.equal(get('.sh-compact[data-sh-tight] .sh-mph', 'font-size'), 'min(calc(120 * var(--u, 1px)), 34cqh)');
  assert.equal(get('.sh.sh-compact', 'grid-template-rows'), '0px minmax(0, 1fr) auto calc(48 * var(--u, 1px))');
  assert.equal(get('.sh.sh-compact', 'grid-template-columns'), 'calc(96 * var(--u, 1px)) minmax(0, 1fr) 0px minmax(calc(170 * var(--u, 1px)), 34%)');
  // the power strip keeps its 510870f compact heights (no tight-mode squeeze either)
  assert.equal(get('.sh-compact .sh-segs', 'height'), 'calc(20 * var(--u, 1px))');
  assert.equal(get('.sh-compact .sh-segs', 'margin-top'), 'calc(16 * var(--u, 1px))');
  assert.equal(get('.sh-compact .sh-nums', 'margin-top'), 'calc(2 * var(--u, 1px))');
  assert.equal(get('.sh-compact .sh-power-head', 'font-size'), 'calc(11.25 * var(--u, 1px))');
  assert.equal(get('.sh-compact[data-sh-tight] .sh-segs', 'height'), undefined);
  // compact: the meter sits beside the power strip (ring column) and is size-contained, so it
  // cannot make the power row (and so the auto grid row) taller than 510870f's
  assert.equal(get('.sh.sh-compact .sh-power', 'display'), 'grid');
  assert.match(css, /@supports \(grid-template-columns: subgrid\) \{ \.sh\.sh-compact \.sh-power \{ grid-template-columns: subgrid; \} \}/);
  for (const c of ['.sh-power-head', '.sh-segs', '.sh-nums']) assert.equal(get(`.sh-compact .sh-power > ${c}`, 'grid-column'), '1', c);
  assert.equal(get('.sh-compact .sh-ls', 'grid-column'), '3');
  assert.equal(get('.sh-compact .sh-ls', 'grid-row'), '1 / 4');
  assert.equal(get('.sh-compact .sh-ls', 'contain'), 'size');
  assert.equal(get('.sh-compact .sh-ls', 'align-self'), 'stretch');
  assert.notEqual(get('.sh-compact .sh-ls', 'display'), 'none');
});
