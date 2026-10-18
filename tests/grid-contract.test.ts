/**
 * Shared cell-grid contract (src/packs/grid): declaration rules, rect resolution, HIG floors, rail slots, and
 * Carrier Jet declaring its Board 2 cells through it (same rects as geometry.ts, same key strips).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GRID_LAYOUTS, gridFitArgs, gridHandles, requiredCells, resolveCells, validateSpec, type GridSpec, type Rect } from '../src/packs/grid/contract.ts';
import { checkGrid, HIG_MIN_TARGET_PX, HIG_MIN_TEXT_PX, warnGridIssues } from '../src/packs/grid/hig.ts';
import { railCount, railSlots, railTop, railXs } from '../src/packs/grid/rail.ts';
import { CJ_GRID, type CjAnchors } from '../src/packs/carrier-jet/cells.ts';
import { board2Cells, board2CellsMapFirst, keyCount, keyXs, KEY_GAP, KEY_H, KEY_W, type CellId } from '../src/packs/carrier-jet/geometry.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const R = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height });

/** The worked example in CELL-CONTRACT.md: a hypothetical Night Pursuit sheet (fixed rects, 1280-wide box). */
type NpId = 'scanner' | 'velocity' | 'gear' | 'throttle' | 'tach' | 'voice' | 'bars' | 'sensor' | 'feed' | 'modes' | 'status' | 'badge';
const npBoard: Record<NpId, Rect> = {
  scanner: R(16, 8, 1248, 40), velocity: R(16, 64, 400, 220), gear: R(432, 64, 120, 220), throttle: R(16, 300, 536, 60),
  tach: R(568, 64, 420, 220), voice: R(1004, 64, 260, 220), bars: R(568, 300, 420, 140), sensor: R(1004, 300, 128, 140),
  feed: R(1136, 300, 128, 140), modes: R(16, 456, 976, 64), status: R(1004, 456, 220, 64), badge: R(1232, 472, 32, 32),
};
// the drive window, portrait phone and landscape phone get their own design boxes (fitFor) and reshape freely
const npWindow: Record<NpId, Rect> = {
  scanner: R(12, 6, 756, 28), velocity: R(12, 44, 250, 150), gear: R(270, 44, 90, 150), tach: R(368, 44, 260, 150), voice: R(636, 44, 132, 150),
  throttle: R(12, 202, 348, 44), bars: R(368, 202, 260, 90), sensor: R(636, 202, 64, 90), feed: R(704, 202, 64, 90),
  modes: R(12, 300, 616, 56), status: R(636, 300, 132, 56), badge: R(736, 364, 32, 32),
};
const npPortrait: Partial<Record<NpId, Rect>> = {
  scanner: R(8, 6, 374, 24), velocity: R(8, 38, 262, 130), gear: R(278, 38, 104, 130), throttle: R(8, 176, 374, 40), tach: R(8, 224, 374, 130),
  voice: R(8, 362, 120, 90), bars: R(136, 362, 246, 90), sensor: R(8, 460, 120, 80), feed: R(136, 460, 246, 80),
  modes: R(8, 548, 374, 104), status: R(8, 660, 374, 40),
};
const npPhoneLandscape: Partial<Record<NpId, Rect>> = {
  scanner: R(8, 4, 828, 20), velocity: R(8, 30, 200, 120), gear: R(214, 30, 70, 120), tach: R(290, 30, 260, 120), voice: R(556, 30, 90, 120),
  feed: R(652, 30, 184, 56), sensor: R(652, 94, 184, 56), throttle: R(8, 156, 276, 40), bars: R(290, 156, 356, 72),
  status: R(652, 156, 184, 40), modes: R(8, 234, 638, 56),
};
const NP_EXAMPLE: GridSpec<NpId> = {
  id: 'night-pursuit-example',
  fit: { w: 1280, minH: 520, maxH: 740, fallbackH: 720 },
  fitFor: {
    window: { w: 780, minH: 400, maxH: 520, fallbackH: 440 },
    portrait: { w: 390, minH: 720, maxH: 900, fallbackH: 760 },
    'phone-landscape': { w: 844, minH: 300, maxH: 390, fallbackH: 340 },
  },
  cells: [
    { id: 'scanner', name: 'SCANNER', role: 'decoration', z: 0 },
    { id: 'velocity', name: 'VELOCITY', role: 'readout', minText: 12 },
    { id: 'gear', name: 'GEAR', role: 'readout', minText: 12 },
    { id: 'throttle', name: 'THROTTLE', role: 'readout', minText: 12 },
    { id: 'tach', name: 'TACH', role: 'readout', minText: 12 },
    { id: 'voice', name: 'VOICE', role: 'decoration' },
    { id: 'bars', name: 'LOAD / ENGINE', role: 'readout', minText: 12 },
    { id: 'sensor', name: 'SENSOR A', role: 'decoration' },
    { id: 'feed', name: 'SENSOR B FEED', role: 'readout', minText: 12 },
    { id: 'modes', name: 'DRIVE MODE', role: 'target', z: 2, minSize: { w: 352, h: 48 } },
    { id: 'status', name: 'STATUS', role: 'readout', minText: 12 },
    { id: 'badge', name: 'BADGE', role: 'decoration', optionalIn: ['portrait', 'phone-landscape'] },
  ],
  layouts: {
    board: { kind: 'rects', rects: npBoard },
    window: { kind: 'rects', rects: npWindow },
    portrait: { kind: 'rects', rects: npPortrait },
    'phone-landscape': { kind: 'rects', rects: npPhoneLandscape },
  },
};

test('the four layouts are exactly pickRfLayout’s', () => {
  assert.deepEqual([...GRID_LAYOUTS].sort(), ['board', 'phone-landscape', 'portrait', 'window']);
  assert.match(src('packs/grid/contract.ts'), /import type \{ RfLayout \} from '\.\.\/layout\.ts';\s*\nexport type GridLayout = RfLayout;/);
});

test('validateSpec: Carrier Jet and the NP worked example are valid', () => {
  assert.deepEqual(validateSpec(CJ_GRID), []);
  assert.deepEqual(validateSpec(NP_EXAMPLE), []);
});

test('validateSpec: drop nothing — a handled layout must place every required cell', () => {
  const { tach: _t, ...noTach } = npBoard;
  const bad: GridSpec<NpId> = { ...NP_EXAMPLE, layouts: { ...NP_EXAMPLE.layouts, window: { kind: 'rects', rects: noTach } } };
  assert.deepEqual(validateSpec(bad), ['window: cell "tach" has no rect (drop nothing: give it a rect or list the layout in optionalIn)']);
  // optionalIn is the only way out (badge is optional on phones, so those layouts may omit it)
  assert.deepEqual(requiredCells(NP_EXAMPLE, 'portrait').includes('badge'), false);
  assert.deepEqual(requiredCells(NP_EXAMPLE, 'board').includes('badge'), true);
});

test('validateSpec: decoration is never a hit area; rects only for declared cells; no empty rects; rail fits its frame', () => {
  const errs = validateSpec<string, unknown>({
    id: 't', fit: { w: 100, minH: 50, maxH: 80, fallbackH: 60 },
    rail: { key: { w: 40, h: 40, gap: 4 }, hit: { w: 44, h: 44 } },
    cells: [
      { id: 'a', name: 'A', role: 'decoration', rail: true },
      { id: 'b', name: 'B', role: 'decoration', targets: [{ name: 'x', w: 44, h: 44 }] },
      { id: 'b', name: 'B2', role: 'readout' },
    ],
    layouts: { board: { kind: 'rects', rects: { a: R(0, 0, 10, 10), b: R(0, 0, 0, 10), z: R(0, 0, 1, 1) } }, window: null, portrait: null, 'phone-landscape': null },
  });
  assert.ok(errs.includes('a: decoration cell carries a rail (decoration is never a hit area)'));
  assert.ok(errs.includes('b: decoration cell declares targets (decoration is never a hit area)'));
  assert.ok(errs.includes('b: duplicate cell id'));
  assert.ok(errs.includes('board: rect for undeclared cell "z"'));
  assert.ok(errs.includes('board: cell "b" has an empty rect'));
  assert.ok(errs.includes('rail: hit area larger than the key frame'));
});

test('resolveCells: null layout → null; derive waits for anchors; a missing required cell never half-draws', () => {
  assert.equal(resolveCells(CJ_GRID, 'portrait', null), null);
  assert.equal(resolveCells(CJ_GRID, 'phone-landscape', { anchors: ANCHORS, mapFirst: false }), null, 'phones: the skin’s own CSS');
  assert.equal(resolveCells(CJ_GRID, 'board', null), null, 'no anchors yet');
  assert.equal(gridHandles(CJ_GRID, 'board'), true);
  assert.equal(gridHandles(CJ_GRID, 'portrait'), false);
  assert.deepEqual(resolveCells(NP_EXAMPLE, 'board', null), npBoard);
  const half: GridSpec<NpId> = { ...NP_EXAMPLE, layouts: { ...NP_EXAMPLE.layouts, board: { kind: 'derive', derive: () => ({ velocity: npBoard.velocity }) } } };
  assert.equal(resolveCells(half, 'board', {} as never), null);
});

/** Board-2-like skin anchors (relative to the host), 1280 board proportions. */
const ANCHORS: CjAnchors = {
  speed: R(22, 154, 132, 186), mach: R(158, 154, 120, 96), rpm: R(158, 250, 120, 90), vdi: R(410, 154, 132, 186),
  sweep: R(974, 154, 236, 186), eng: R(22, 382, 256, 156), compass: R(282, 382, 132, 156),
};

test('Carrier Jet declares its cells through the contract: same rects as geometry.ts (Board 2 and map-first)', () => {
  assert.deepEqual(resolveCells(CJ_GRID, 'board', { anchors: ANCHORS, mapFirst: false }), board2Cells(ANCHORS));
  assert.deepEqual(resolveCells(CJ_GRID, 'window', { anchors: ANCHORS, mapFirst: false }), board2Cells(ANCHORS));
  assert.deepEqual(resolveCells(CJ_GRID, 'board', { anchors: ANCHORS, mapFirst: true }), board2CellsMapFirst(ANCHORS));
  assert.deepEqual(resolveCells(CJ_GRID, 'window', { anchors: ANCHORS, mapFirst: true }), board2CellsMapFirst(ANCHORS));
  const ids: CellId[] = ['speed', 'mach', 'accel', 'vdi', 'sweep', 'eng', 'map', 'compass'];
  assert.deepEqual(CJ_GRID.cells.map((c) => c.id), ids);
  assert.ok(CJ_GRID.cells.every((c) => c.rail), 'every Board 2 cell has a key strip');
  assert.deepEqual(gridFitArgs(CJ_GRID), [1280, 520, 740, 720], 'the mount’s useFitBox box');
  assert.deepEqual(CJ_GRID.rail, { key: { w: 52, h: 66, gap: 4 }, hit: { w: 44, h: 44 }, max: 4 });
});

test('rail slots are the CJ key-strip maths, unchanged (old formula inline)', () => {
  const oldCount = (w: number, max = 4) => Math.max(1, Math.min(max, Math.floor((w + KEY_GAP) / (KEY_W + KEY_GAP))));
  const oldXs = (c: Rect, n: number) => { const t = n * KEY_W + (n - 1) * KEY_GAP; const x0 = c.left + (c.width - t) / 2; return Array.from({ length: n }, (_, i) => Math.round(x0 + i * (KEY_W + KEY_GAP))); };
  const key = CJ_GRID.rail!.key;
  for (let w = 0; w <= 520; w += 0.25) {
    assert.equal(railCount(w, key), oldCount(w));
    assert.equal(keyCount(w, 5), oldCount(w, 5));
    for (const left of [0, 13.37, 410.5]) {
      const c = R(left, 100, w, 50);
      for (const n of [1, 2, 3, 4, 5]) {
        assert.deepEqual(railXs(c, n, key), oldXs(c, n));
        assert.deepEqual(keyXs(c, n), oldXs(c, n));
      }
    }
  }
  assert.equal(railTop(R(0, 154.5, 10, 186.25), 4), 154.5 + 186.25 + 4);
  assert.deepEqual(railSlots(R(0, 0, 108, 10), 2, key, 4), [{ left: 0, top: 14, width: KEY_W, height: KEY_H }, { left: 56, top: 14, width: KEY_W, height: KEY_H }]);
});

test('NP worked example: every layout passes the floors at its own design box, and fits inside its min height', () => {
  for (const layout of GRID_LAYOUTS) {
    const rects = resolveCells(NP_EXAMPLE, layout, null)!;
    assert.ok(rects, layout);
    assert.deepEqual(checkGrid(NP_EXAMPLE, rects, { layout }), [], layout);
    const [w, minH] = gridFitArgs(NP_EXAMPLE, layout);
    for (const [id, r] of Object.entries(rects)) assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= w && r.top + r.height <= minH, `${layout} ${id} inside ${w}x${minH}`);
  }
  // why fitFor exists: the 1280 board squeezed into a 773 window (scale ≈ 0.6) drops its text under 11 px
  assert.ok(checkGrid(NP_EXAMPLE, npBoard, { layout: 'window', scale: 773 / 1280 }).some((i) => i.rule === 'text'));
  assert.deepEqual(gridFitArgs(NP_EXAMPLE, 'portrait'), [390, 720, 900, 760]);
  assert.deepEqual(gridFitArgs(NP_EXAMPLE), [1280, 520, 740, 720]);
  assert.deepEqual(gridFitArgs(CJ_GRID, 'portrait'), [1280, 520, 740, 720], 'no fitFor: one box');
});

test('HIG floors: 11 px text and 44 px targets after the fit scale; rails; min sizes; missing cells', () => {
  assert.equal(HIG_MIN_TEXT_PX, 11);
  assert.equal(HIG_MIN_TARGET_PX, 44);
  assert.deepEqual(checkGrid(NP_EXAMPLE, npBoard, { layout: 'board', scale: 1 }), []);
  // the same sheet squeezed to 0.8: 12 px text renders 9.6, the 64 px rail renders 51.2 (still fine)
  const at08 = checkGrid(NP_EXAMPLE, npBoard, { layout: 'board', scale: 0.8 });
  assert.ok(at08.length > 0 && at08.every((i) => i.rule === 'text'), JSON.stringify(at08));
  assert.match(at08[0].message, /renders 9\.6 px \(floor 11\)/);
  // a 40 px tall mode rail is a target below 44
  const thin = { ...npBoard, modes: R(16, 456, 976, 40) };
  const t = checkGrid(NP_EXAMPLE, thin, { layout: 'board' });
  assert.deepEqual(t.map((i) => i.rule).sort(), ['min-size', 'target']);
  // a missing required cell
  const { gear: _g, ...noGear } = npBoard;
  assert.deepEqual(checkGrid(NP_EXAMPLE, noGear, { layout: 'board' }).map((i) => `${i.rule}:${i.cell}`), ['missing:gear']);
  assert.deepEqual(checkGrid(NP_EXAMPLE, (({ badge: _b, ...r }) => r)(npBoard), { layout: 'portrait' }), [], 'optional on phones');
  // CJ: 44 px caps and its 44 px (i) at scale 1 pass; at 0.9 both would fail
  const cj = board2CellsMapFirst(ANCHORS);
  assert.deepEqual(checkGrid(CJ_GRID, cj, { layout: 'board' }), []);
  const cj09 = checkGrid(CJ_GRID, cj, { layout: 'board', scale: 0.9 });
  assert.ok(cj09.some((i) => i.rule === 'rail') && cj09.some((i) => i.rule === 'target' && /\(i\)/.test(i.message)));
  assert.deepEqual(checkGrid(CJ_GRID, cj, { layout: 'board', scale: 0.9, railCells: [] }).filter((i) => i.rule === 'rail'), [], 'no rails drawn, no rail issue');
});

test('decoration above a target it overlaps is reported (it would hide it); hit areas never move', () => {
  const spec: GridSpec<'glass' | 'key'> = {
    id: 't', fit: { w: 200, minH: 100, maxH: 100, fallbackH: 100 },
    cells: [{ id: 'glass', name: 'GLASS', role: 'decoration', z: 3 }, { id: 'key', name: 'KEY', role: 'target', z: 1 }],
    layouts: { board: { kind: 'rects', rects: { glass: R(0, 0, 200, 100), key: R(10, 10, 60, 60) } }, window: null, portrait: null, 'phone-landscape': null },
  };
  const rects = resolveCells(spec, 'board', null)!;
  assert.deepEqual(checkGrid(spec, rects, { layout: 'board' }).map((i) => i.rule), ['decoration-over-target']);
  // reshaping the decoration leaves the target's rect (its hit area) exactly as declared
  const moved = { ...rects, glass: R(0, 0, 50, 50) };
  assert.deepEqual(moved.key, rects.key);
  assert.match(src('packs/grid/GridLayer.tsx'), /deco \? \{ pointerEvents: 'none' \} : null/);
});

test('warnGridIssues: dev/test warning, once per distinct message', () => {
  const log: string[] = [];
  const issues = checkGrid(NP_EXAMPLE, { ...npBoard, modes: R(16, 456, 976, 40) }, { layout: 'window' });
  assert.equal(warnGridIssues('np-test', issues, (m) => log.push(m)).length, issues.length);
  assert.equal(warnGridIssues('np-test', issues, (m) => log.push(m)).length, 0, 'deduped');
  assert.ok(log.some((m) => m.startsWith('[grid:np-test] target: DRIVE MODE: target renders 976×40 px in window')));
});

test('GridLayer: headless and theme-agnostic; dev-only HIG warning; Reduce Motion pass-through; uses the fit scaler + layout picker', () => {
  const files = readdirSync(new URL('../src/packs/grid/', import.meta.url));
  for (const f of files) {
    const s = src(`packs/grid/${f}`);
    assert.doesNotMatch(s, /from '[^']*skins\//, `${f}: no skin import`);
    assert.doesNotMatch(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /carrier|night|pursuit|cjv2|\bcj-|#[0-9a-f]{6}\b/i, `${f}: no theme ids, classes or colours`);
  }
  const layer = src('packs/grid/GridLayer.tsx');
  assert.match(layer, /const DEV = !!import\.meta\.env\?\.DEV;/);
  assert.match(layer, /if \(!DEV \|\| !cells\) return;\s*warnGridIssues\(spec\.id, checkGrid\(/);
  assert.match(layer, /data-motion=\{reduced \? 'static' : 'live'\}/);
  assert.match(layer, /useFitBox\(w, minH, maxH, fallbackH\)/);
  assert.match(layer, /const layout = useRfLayout\(driveWindow\);/);
  const hooks = src('packs/grid/useGrid.ts');
  assert.match(hooks, /matchMedia\(RM\)/);
  assert.match(hooks, /export const useGridMotion = \(\): boolean =>/);
});

test('CJ is on the grid: CjV2Layer measures through useGridMeasure, resolves CJ_GRID, renders GridLayer; mount uses CJ_GRID.fit', () => {
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.match(layer, /const m = useGridMeasure\(selfRef, read, GEO_OBSERVE\);/);
  assert.match(layer, /const cells = useGrid\(CJ_GRID, layout, ctx\);/);
  assert.equal((layer.match(/<GridLayer ref=\{selfRef\} className="cjv2" spec=\{CJ_GRID\}/g) ?? []).length, 2, 'bare + ready, one root');
  assert.match(layer, /const top = railTop\(b, geo\.gap\);/);
  assert.doesNotMatch(layer, /new ResizeObserver|new MutationObserver/, 'observers live in the grid hook');
  assert.doesNotMatch(layer, /board2Cells(MapFirst)?\(/, 'cells come from CJ_GRID');
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /useFitBox\(CJ_GRID\.fit\.w, CJ_GRID\.fit\.minH, CJ_GRID\.fit\.maxH, CJ_GRID\.fit\.fallbackH\)/);
});
