/**
 * Tesla layouts (773 window, 1256 and 1280 board): stopped / Park and moving / Drive produce the SAME cells, the same
 * square MAP and the same edge-key boxes (Wilson, Oct 18). The old Board 2 grid stays for phones (map-first is off
 * there); this pins that nothing on the Tesla board reads the Park state for layout:
 *  - the map-first gate takes no Park input, and the host attribute is constant ('drive') whenever it is on;
 *  - no stylesheet the board uses keys a rule on a Park / stopped / moving state;
 *  - the geometry path (grid solve → square side → cells → key strips → key boxes) has no Park input, so the cells,
 *    map side and key boxes solved for Park equal Drive's at every Tesla size (browser-measured in
 *    frontend-handoff/cj-board-batch/measure.json, drive-* vs park-*).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { board2CellsMapFirst, cjMapFirst, KEY_H, KEY_W, keyXs, mapSquareSide, type Box } from '../src/packs/carrier-jet/geometry.ts';
import { cellKeys, KEY_CELLS, rightBankFor, stripCount, wxSlot } from '../src/packs/carrier-jet/edgeKeys.ts';
import { MAP_VIEW_DEFAULT } from '../src/packs/carrier-jet/mapView.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const css = src('packs/mounts/carrier-jet-v2.css');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// .cj-body content boxes measured in Chromium (cj-square-map body.mjs), the same in Drive and Park
const SIZES = {
  '773x601': { layout: 'window', w: 745, h: 316 },
  '1256x706': { layout: 'board', w: 1212, h: 421 },
  '1280x800': { layout: 'board', w: 1236, h: 515 },
} as const;

const frs = (list: string) => [...list.replace(/var\(--cjv2-map-side, minmax\(0, \d+fr\)\)/, 'SIDE').matchAll(/minmax\(0, (\d+)fr\)|(\d+)px|SIDE/g)].map((m) => (m[1] ? { fr: +m[1] } : m[2] ? { px: +m[2] } : { side: true as const }));
const rule = (re: RegExp) => { const m = css.match(re); assert.ok(m, String(re)); return m[1]; };
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

/** The board for one Tesla size and one Park state. `_park` is accepted and, by design, not read by any step. */
function board(s: (typeof SIZES)[keyof typeof SIZES], _park: boolean) {
  const mapFirst = cjMapFirst({ v2: true, tesla: true });
  const win = s.layout === 'window';
  const cg = win ? 4 : 6, rg = win ? 2 : 3;
  const rowList = BASE_ROWS.replace(/var\(--cjv2-keys-top, var\(--cjv2-keys, 48px\)\)/, `${win ? 0 : 66}px`).replace(/var\(--cjv2-keys, 48px\)/, '66px');
  const r = tracks(s.h, rg, frs(rowList));
  const side = mapSquareSide({ mach: box(Array(5).fill(0), r, cg, rg, [1, 1], [1, 1]), compass: box(Array(5).fill(0), r, cg, rg, [4, 4], [5, 5]) });
  const c = tracks(s.w, cg, frs(MF_COLS).map((t) => ('side' in t ? { px: side } : t)));
  const cells = board2CellsMapFirst({
    speed: box(c, r, cg, rg, [0, 0], [1, 2]), mach: box(c, r, cg, rg, [1, 1], [1, 1]), rpm: box(c, r, cg, rg, [1, 1], [2, 2]),
    vdi: box(c, r, cg, rg, [2, 2], [1, 2]), sweep: box(c, r, cg, rg, [4, 4], [1, 2]), eng: box(c, r, cg, rg, [0, 1], [5, 5]), compass: box(c, r, cg, rg, [4, 4], [5, 5]),
  });
  const gap = win ? 4 : 6;
  const keys: string[] = [];
  for (const wxOn of [false, true]) {
    const ctx = { map: MAP_VIEW_DEFAULT, config: null, wx: { on: wxOn, slot: wxSlot(cells.map.width, MAP_VIEW_DEFAULT) }, bank: rightBankFor(mapFirst) };
    for (const cell of KEY_CELLS) {
      const b = cells[cell as keyof typeof cells] as Box;
      const n = stripCount(cell, b.width, ctx);
      const xs = keyXs(b, n);
      cellKeys(cell, n, ctx).forEach((_, i) => keys.push(`${wxOn ? 'wx' : '-'}:${cell}@${xs[i].toFixed(2)},${(b.top + b.height + gap).toFixed(2)},${KEY_W}x${KEY_H}`));
    }
  }
  return { mapFirst, side, cells, keys };
}

test('the map-first gate and the host attribute take no Park / moving input', () => {
  assert.match(src('packs/carrier-jet/geometry.ts'), /export const cjMapFirst = \(s: \{ v2: boolean; tesla: boolean \}\): boolean => s\.v2 && s\.tesla;/);
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /const mapFirst = cjMapFirst\(\{ v2, tesla \}\);/);
  assert.match(mount, /data-cj-mapfirst=\{mapFirst \? 'drive' : undefined\}/);
  // the board geometry path in CjV2Layer: the key strips are counted and placed without Park
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const strips = layer.slice(layer.indexOf('const kctx = '), layer.indexOf('const xs = keyXs(b, n);'));
  assert.ok(strips.length > 0);
  assert.doesNotMatch(strips, /\bpark\b/i);
});

test('no board stylesheet keys a rule on a Park / stopped / moving state', () => {
  const sheets = ['packs/mounts/carrier-jet-v2.css', 'packs/mounts/carrier-jet-mount.css', 'packs/mounts/carrier-jet-controls.css',
    ...readdirSync(new URL('../src/skins/carrier-jet/', import.meta.url), { recursive: true }).map(String).filter((f) => f.endsWith('.css')).map((f) => `skins/carrier-jet/${f}`)];
  for (const f of sheets) {
    const sel = strip(src(f)).match(/[^{}]+(?=\{)/g) ?? [];
    for (const s of sel) assert.doesNotMatch(s, /data-(cj-)?(park|parked|stopped|moving|speed)\b|data-cj-mapfirst='park'/i, `${f}: ${s.trim().slice(0, 120)}`);
  }
});

for (const [name, s] of Object.entries(SIZES)) {
  test(`${name}: Park and Drive give identical cells, map square and key boxes`, () => {
    const drive = board(s, false), park = board(s, true);
    assert.equal(drive.mapFirst, true);
    assert.deepEqual(park.cells, drive.cells);
    assert.equal(park.side, drive.side);
    assert.deepEqual(park.keys, drive.keys);
    const m = drive.cells.map;
    assert.ok(Math.abs(m.width - m.height) <= 1, `map ${m.width.toFixed(2)}x${m.height.toFixed(2)} square`);
    assert.ok(drive.keys.length >= 2 * 9, 'every key cell has its strip');
  });
}
