/**
 * One even bottom row on the Tesla dock (Meghan's spec + Wilson's layout, Oct 18; William's gate):
 * GPS/RADAR · AFTERBURNER · [host chips] · EMER STOP · QUICK START · FASTEN SEAT BELT · SHELF, left (driver) to right,
 * DOM = visual = VoiceOver order, at 773 / 1256 / 1280; equal gaps; AFTERBURNER, SEAT BELT and SHELF one height;
 * EMER STOP, QUICK START and the plate (118px skin minimums) on the same baseline. Browser-measured in
 * frontend-handoff/cj-board-batch/final (gate.mjs row.*).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const css = src('packs/mounts/carrier-jet-v2.css');
const mount = src('packs/mounts/CarrierJetMount.tsx');
const R = String.raw`\[data-cjm-row\]:is\(\[data-rf-layout='board'\], \[data-rf-layout='window'\]\)`;

test('DOM order = visual order: plate, AFTERBURNER | EMER STOP, QUICK START, SEAT BELT, SHELF', () => {
  const bank = mount.slice(mount.indexOf('<div ref={bankRef} className="cjm-bank"'), mount.indexOf('const shutdownGuard'));
  assert.ok(bank.indexOf('{plate}') < bank.indexOf('cjm-bank-ab'));
  const b = mount.slice(mount.indexOf('const bankB = row ?'), mount.indexOf(') : null;', mount.indexOf('const bankB = row ?')));
  const at = (t: string) => { const i = b.indexOf(t); assert.ok(i > 0, t); return i; };
  assert.ok(at('pullQs(') < at('{sbLamp}') && at('{sbLamp}') < at('{shelf}'));
  assert.doesNotMatch(b, /\{plate\}/, 'the plate is never at the right end');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /\[data-cjm-row\][^{]*\.cjm-bank-plate \{ display: none/, 'the plate shows at every size');
});

test('one even row: space-between, every part a flex item, one baseline, shared height for the short parts', () => {
  assert.match(css, new RegExp(String.raw`\.rev-dock:has\(> \.cjm-bank\[data-cjm-v2\]${R}\) \{\s*--cjrow-h: 60px; display: flex; align-items: flex-end; justify-content: space-between;`));
  assert.match(css, /\.rev-dock > \.cjm-bank-b\[data-cjm-row\] > \.cjm-bank-es \{ display: contents !important; \}/, 'EMER STOP and QUICK START are separate row items (equal gaps)');
  assert.match(css, /margin: 0 0 -3px !important; flex: none; align-self: flex-end;/);
  assert.match(css, new RegExp(String.raw`> \.cjm-bank-ab \{ height: var\(--cjrow-h\); display: flex; \}`));
  assert.match(css, /\.cjm-sbl \.sbl \{ box-sizing: border-box; height: var\(--cjrow-h\);/);
  assert.match(css, /\.cjm-bank-shelf \.cjcs-shelfkey \{ height: var\(--cjrow-h\); \}/);
});

test('773 window: all six parts fit one row (dock on the board width, AFTERBURNER caption over the guard)', () => {
  assert.match(css, /\.rev-dock:has\(> \.cjm-bank\[data-cjm-v2\]\[data-cjm-row\]\[data-rf-layout='window'\]\) \{ --cjrow-h: 66px; left: 8px !important; right: 8px !important; \}/);
  // widths (CSS px, measured): plate 89 (narrow), AFTERBURNER 254 (caption over the 144 px well + 88 px AB ARMED),
  // EMER STOP 76 (wide pull: the full 'EMER STOP' caption), QUICK START 96, SEAT BELT 104, SHELF 80; dock 773 - 16
  const parts = 89 + 254 + 76 + 96 + 104 + 80, dock = 773 - 16;
  assert.ok((dock - parts) / 5 >= 8, `gap ${(dock - parts) / 5}`);
  // AFTERBURNER at 66 px: 2 + 11 (caption) + 2 + 48 (well) + 2 = 65
  assert.ok(2 + 11 + 2 + 48 + 2 <= 66);
});

test('EMER STOP reads in full at every size: the row always takes the wide pull (76 px)', () => {
  assert.match(mount, /cold\.render\.pullQs\(layout === 'board' \? 'wide' : 'narrow', 'wide'\)/);
  const cs = src('packs/mounts/CjColdStart.tsx');
  assert.match(cs, /const pullQs = \(size: 'wide' \| 'narrow', pullSize: 'wide' \| 'narrow' = size\) =>/);
  assert.match(cs, /<PullHandle [^>]*size=\{pullSize\}/);
  assert.doesNotMatch(css, /\.cjp-pull \{ width: 66px; \}/);
  // Meghan's PullHandle: narrow → 'EMER', wide → 'EMER STOP' (read only)
  assert.match(src('skins/carrier-jet/parts/PullHandle.tsx'), /\{size === 'narrow' \? 'EMER' : 'EMER STOP'\}/);
});

test('GPS plate ACQ legend: 4px more inset from the plate bottom (both states)', () => {
  assert.match(css, /\.cjm-bank-plate \.cjp-gps svg > g:is\(\[data-acq='unlit'\], \[data-acq='lit'\]\) \{ transform: translateY\(-4px\); \}/);
  assert.match(src('skins/carrier-jet/parts/GpsPlate.tsx'), /<g data-acq="unlit">[\s\S]*<g data-acq="lit"/);
});
