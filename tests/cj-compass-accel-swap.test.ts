/** Map-first COMPASS ⇄ ACCEL swap (Oct 17): COMPASS in the narrow bottom cell (col 3), ACCEL in the wide bottom-right;
 * the right bank (DRIVE / MORE) and the CONFIG tile slots stay by position, so CONFIG and the bank don't move. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cellKeys, rightBankFor, RIGHT_BANK } from '../src/packs/carrier-jet/edgeKeys.ts';
import { CELL_ORDER, CELL_ORDER_MAP_FIRST, cellOrderFor } from '../src/packs/carrier-jet/configCells.ts';
import { MAP_VIEW_DEFAULT } from '../src/packs/carrier-jet/mapView.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('CSS moves the skin COMPASS (+ label) into column 3 of the bottom row in map-first only', () => {
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(css, /\[data-cj-mapfirst='drive'\] [^{]*\.cj-a-mid > div:nth-of-type\(2\) \{ grid-column: 3; grid-row: 6; \}/);
  assert.match(css, /\[data-cj-mapfirst='drive'\] [^{]*\.cj-a-mid > \.cj-plab-2 \{ grid-column: 3; grid-row: 5; \}/);
});

test('right bank is positional: map-first → ACCEL (bottom-right) carries DRIVE / MORE; COMPASS gets none', () => {
  assert.equal(rightBankFor(false), RIGHT_BANK);
  assert.equal(rightBankFor(true), 'accel');
  const k = (cell: 'accel' | 'compass', bank: 'accel' | 'compass') => cellKeys(cell, 3, { map: MAP_VIEW_DEFAULT, config: null, bank }).map((x) => x?.id ?? null);
  assert.deepEqual(k('accel', 'accel'), ['drive', 'more', null]);
  assert.deepEqual(k('compass', 'accel'), [null, null, null]);
  assert.deepEqual(k('compass', 'compass'), ['drive', 'more', null]);
  // CONFIG: the bank keeps DRIVE / MORE; the narrow COMPASS cell takes its tile's SEL
  const cfg = { tiles: { compass: { label: 'PLT' } }, subs: 1 };
  assert.deepEqual(cellKeys('compass', 2, { map: MAP_VIEW_DEFAULT, config: cfg, bank: 'accel' }).map((x) => x?.id ?? null), ['sel', null]);
  assert.deepEqual(cellKeys('accel', 2, { map: MAP_VIEW_DEFAULT, config: cfg, bank: 'accel' }).map((x) => x?.id ?? null), ['drive', 'more']);
});

test('CONFIG tile slots stay by position: the narrow bottom cell keeps slot 1, the bottom-right slot 6', () => {
  assert.deepEqual(cellOrderFor(false), CELL_ORDER);
  assert.deepEqual(cellOrderFor(true), CELL_ORDER_MAP_FIRST);
  assert.equal(CELL_ORDER_MAP_FIRST.indexOf('compass'), CELL_ORDER.indexOf('accel'));
  assert.equal(CELL_ORDER_MAP_FIRST.indexOf('accel'), CELL_ORDER.indexOf('compass'));
  assert.deepEqual([...CELL_ORDER_MAP_FIRST].sort(), [...CELL_ORDER].sort());
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.match(layer, /const order = cellOrderFor\(geo\?\.mapFirst\);/);
  assert.match(layer, /const bank = rightBankFor\(geo\?\.mapFirst\);/);
  assert.doesNotMatch(layer, /CELL_ORDER\.indexOf|cells\[RIGHT_BANK\]/);
  // CONFIG title spans MACH + VDI in map-first (ACCEL is no longer beside them)
  assert.match(layer, /\(geo\.mapFirst \? cells\.vdi : cells\.accel\)/);
});
