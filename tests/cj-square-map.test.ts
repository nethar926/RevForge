/**
 * Square MAP (Wilson's rule, Meghan Oct 17): in every Carrier Jet Tesla layout, Drive AND Park, the MAP panel is a full
 * square spanning both instrument rows; the cells around it give way, the map is never shrunk to fit.
 * The grid is solved here from the shipped CSS (carrier-jet-v2.css track lists) for the .cj-body content boxes measured
 * in Chromium at 1256x706, 1280x800 and 773x601 (frontend-handoff/cj-square-map/body.mjs), with the MAP column set the way
 * CjV2Layer sets it (geometry.mapSquareSide), and the map cell measured by geometry.board2CellsMapFirst.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { board2CellsMapFirst, cjMapFirst, keyCount, mapSquareSide, type Box } from '../src/packs/carrier-jet/geometry.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const css = src('packs/mounts/carrier-jet-v2.css');

// .cj-body content box (CSS px) measured in Chromium; the same in Drive and Park (one design)
const SIZES = {
  '1256x706': { layout: 'board', w: 1212, h: 421, cols: [179.781, 164.812, 179.781, 334, 329.625] },
  '1280x800': { layout: 'board', w: 1236, h: 515, cols: [165.047, 151.297, 165.047, 428, 302.609] },
  '773x601': { layout: 'window', w: 745, h: 316, cols: [104.844, 96.1094, 104.844, 230.969, 192.234] },
} as const;
/** Inner map (.cjv2-hsd) = MAP cell minus its 3px CRT inset on every side (measured 357 -> 351 on 99b8ce2). */
const INSET = 3;

const frs = (list: string) => [...list.replace(/var\(--cjv2-map-side, minmax\(0, \d+fr\)\)/, 'SIDE').matchAll(/minmax\(0, (\d+)fr\)|(\d+)px|SIDE/g)].map((m) => (m[1] ? { fr: +m[1] } : m[2] ? { px: +m[2] } : { side: true }));
function rule(sel: RegExp): string {
  const m = css.match(sel);
  assert.ok(m, `rule ${sel}`);
  return m[1];
}
const BASE_ROWS = rule(/\.cj-body \{\s*position: relative;\s*grid-template-columns: [^;]+;\s*grid-template-rows: ([^;]+);/);
const MF_COLS = rule(/\[data-cj-mapfirst='drive'\][^{]*\.cj-body \{\s*grid-template-columns: ([^;]+);/);

function tracks(total: number, gap: number, list: { fr?: number; px?: number }[]): number[] {
  const fixed = list.reduce((s, t) => s + (t.px ?? 0), 0) + gap * (list.length - 1);
  const fr = list.reduce((s, t) => s + (t.fr ?? 0), 0);
  return list.map((t) => t.px ?? ((t.fr ?? 0) / fr) * (total - fixed));
}
const at = (t: number[], gap: number, a: number, b = a) => ({ start: t.slice(0, a).reduce((s, v) => s + v + gap, 0), size: t.slice(a, b + 1).reduce((s, v) => s + v, 0) + gap * (b - a) });
const box = (c: number[], r: number[], cg: number, rg: number, col: [number, number], row: [number, number]): Box => {
  const x = at(c, cg, col[0], col[1]), y = at(r, rg, row[0], row[1]);
  return { left: x.start, top: y.start, width: x.size, height: y.size };
};

function solve(s: (typeof SIZES)[keyof typeof SIZES]) {
  const win = s.layout === 'window';
  const cg = win ? 4 : 6, rg = win ? 2 : 3;
  const keys = 66, keysTop = win ? 0 : 66; // --cjv2-keys 66px; 773 window --cjv2-keys-top 0
  const rowList = BASE_ROWS.replace(/var\(--cjv2-keys-top, var\(--cjv2-keys, 48px\)\)/, `${keysTop}px`).replace(/var\(--cjv2-keys, 48px\)/, `${keys}px`);
  const r = tracks(s.h, rg, frs(rowList));
  // MACH (col 2, row 2) top → COMPASS (col 5, row 6) bottom: rows only, so the side is known before the columns
  const probe = (c: number[]) => ({ mach: box(c, r, cg, rg, [1, 1], [1, 1]), compass: box(c, r, cg, rg, [4, 4], [5, 5]) });
  const side = mapSquareSide(probe(Array(5).fill(0)));
  const c = tracks(s.w, cg, frs(MF_COLS).map((t) => ('side' in t ? { px: side } : t)));
  const rects = {
    speed: box(c, r, cg, rg, [0, 0], [1, 2]), mach: box(c, r, cg, rg, [1, 1], [1, 1]), rpm: box(c, r, cg, rg, [1, 1], [2, 2]),
    vdi: box(c, r, cg, rg, [2, 2], [1, 2]), sweep: box(c, r, cg, rg, [4, 4], [1, 2]), eng: box(c, r, cg, rg, [0, 1], [5, 5]), compass: box(c, r, cg, rg, [4, 4], [5, 5]),
  };
  return { side, cols: c, cells: board2CellsMapFirst(rects) };
}

test('Park is laid out like Drive: map-first on the Tesla layouts in both (no Board 2 in Park)', () => {
  assert.equal(cjMapFirst({ v2: true, tesla: true }), true);
  assert.equal(cjMapFirst({ v2: true, tesla: false }), false);
  assert.equal(cjMapFirst({ v2: false, tesla: true }), false);
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /const mapFirst = cjMapFirst\(\{ v2, tesla \}\);/);
  assert.doesNotMatch(src('packs/carrier-jet/geometry.ts'), /!s\.park/);
});

for (const [name, s] of Object.entries(SIZES)) {
  for (const mode of ['Drive', 'Park']) {
    test(`${mode} ${name}: the MAP panel is square (to 1px) and spans both instrument rows`, () => {
      const { side, cols, cells } = solve(s);
      const m = cells.map;
      assert.ok(Math.abs(m.width - m.height) <= 1, `map ${m.width.toFixed(2)}x${m.height.toFixed(2)}`);
      assert.ok(Math.abs((m.width - 2 * INSET) - (m.height - 2 * INSET)) <= 1);
      assert.ok(Math.abs(m.height - side) < 0.01);
      // spans both rows: MACH's top to COMPASS's bottom
      assert.equal(m.top, cells.mach.top);
      assert.ok(Math.abs(m.top + m.height - (cells.compass.top + cells.compass.height)) < 0.01);
      // the solved tracks match the Chromium-measured ones (the model is the shipped CSS)
      cols.forEach((v, i) => assert.ok(Math.abs(v - s.cols[i]) < 0.6, `col ${i}: ${v.toFixed(2)} vs ${s.cols[i]}`));
      // the cells around it gave way but are all still there, each with at least one key
      for (const id of ['speed', 'mach', 'accel', 'vdi', 'sweep', 'eng', 'compass'] as const) {
        assert.ok(cells[id].width >= 90 && cells[id].height > 60, `${id} ${cells[id].width.toFixed(1)}x${cells[id].height.toFixed(1)}`);
        assert.ok(keyCount(cells[id].width) >= 1);
      }
      // the right bank (DRIVE / MORE) and MAP keys keep their full strips
      assert.ok(keyCount(cells.compass.width) >= 3);
      assert.equal(keyCount(m.width), 4);
    });
  }
}

test('wiring: CjV2Layer sizes the MAP column from the two-row span on the host; CSS uses it; never a shrink-to-fit', () => {
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.match(layer, /mapSquareSide\(\{ mach: rel\(m0, o\), compass: rel\(c0, o\) \}\)/);
  assert.match(layer, /host\.style\.setProperty\('--cjv2-map-side', side\)/);
  assert.match(layer, /host\.style\.removeProperty\('--cjv2-map-side'\)/);
  assert.match(MF_COLS, /^minmax\(0, 96fr\) minmax\(0, 88fr\) minmax\(0, 96fr\) var\(--cjv2-map-side, minmax\(0, 196fr\)\) minmax\(0, 176fr\)$/);
  assert.doesNotMatch(css, /--cjv2-map-side[^;]*(min\(|clamp\()/);
  assert.equal(mapSquareSide({ mach: { left: 0, top: 10, width: 5, height: 5 }, compass: { left: 0, top: 200, width: 5, height: 144.333 } }), 334.33);
});
