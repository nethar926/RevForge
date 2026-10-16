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
