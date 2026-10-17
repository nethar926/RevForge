/** Map-first Drive (Meghan's mock 36b7005, ported): gate, cell geometry, and the Park↔Drive swap contract. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { board2Cells, board2CellsMapFirst, cjMapFirst } from '../src/packs/carrier-jet/geometry.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const r = {
  speed: { left: 0, top: 30, width: 200, height: 300 },
  mach: { left: 204, top: 30, width: 150, height: 140 },
  rpm: { left: 204, top: 174, width: 150, height: 156 },
  vdi: { left: 358, top: 30, width: 200, height: 160 },
  sweep: { left: 900, top: 30, width: 150, height: 300 },
  eng: { left: 0, top: 340, width: 354, height: 200 },
  compass: { left: 358, top: 340, width: 200, height: 200 },
};

test('map-first is the Drive default on the Tesla layouts only; Park keeps Board 2', () => {
  assert.equal(cjMapFirst({ v2: true, tesla: true, park: false }), true);
  assert.equal(cjMapFirst({ v2: true, tesla: true, park: true }), false);
  assert.equal(cjMapFirst({ v2: true, tesla: false, park: false }), false);
  assert.equal(cjMapFirst({ v2: false, tesla: true, park: false }), false);
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /const mapFirst = cjMapFirst\(\{ v2, tesla, park \}\);/);
  assert.doesNotMatch(src('packs/mounts/CarrierJetMount.tsx'), /MOCK_MAP_FIRST|URLSearchParams\(location\.search\)\.get\('cjMapFirst'\)/);
});

test('map-first cells: SPEED full column, MACH runs to RPM bottom, MAP spans both rows, ACCEL under VDI', () => {
  const c = board2CellsMapFirst(r);
  assert.deepEqual(c.speed, r.speed);
  assert.equal(c.mach.top + c.mach.height, r.rpm.top + r.rpm.height);
  assert.deepEqual(c.accel, { left: r.vdi.left, top: r.compass.top, width: r.vdi.width, height: r.compass.height });
  assert.equal(c.map.left, r.vdi.left + r.vdi.width + 4);
  assert.equal(c.map.left + c.map.width, r.sweep.left - 4);
  assert.equal(c.map.top, r.mach.top);
  assert.equal(c.map.top + c.map.height, r.compass.top + r.compass.height);
  // Park (Board 2) has the same SPEED / MACH shape (RPM under MACH in both)
  const p = board2Cells(r);
  assert.deepEqual(p.speed, c.speed);
  assert.deepEqual(p.mach, c.mach);
});

test('P↔D swap: one MapCell in a fixed tree position (no remount), re-measured on the attribute; MapLibre resizes itself', () => {
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.equal(layer.match(/<MapCell /g)?.length, 1);
  assert.doesNotMatch(layer, /<MapCell[^>]*\bkey=/);
  assert.match(layer, /attributeFilter: \[[^\]]*'data-cj-mapfirst'/);
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.match(live, /new ResizeObserver\(\(\) => setSize/);
  assert.match(live, /mapRef\.current\?\.resize\(\);[\s\S]{0,60}\}, \[size\.w, size\.h\]\)/);
});

test('773: the AB word / LOAD spacing fix covers Park (Board 2) as well as map-first Drive', () => {
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(css, /\.cjm\[data-cjm-v2\]\[data-rf-layout='window'\] \.cj\[data-variant='carrier-jet'\]\[data-layout='reflow'\] \.cj-a-eng \[data-cj-el='ab-ladder'\] > text:last-child \{ letter-spacing: 0; transform: translateX\(-6px\); \}/);
  assert.match(css, /\.cjm\[data-cjm-v2\]\[data-rf-layout='window'\] [^{]*\[data-cj-el='engines'\] > g:nth-child\(2\) > text:last-child \{ transform: translateX\(4px\); \}/);
});
