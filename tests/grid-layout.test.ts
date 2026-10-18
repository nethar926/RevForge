/**
 * Layout picking for the shared grid: the probe viewports land on the layout whose rects a theme declares
 * (pickRfLayout + isDriveWindow, the same inputs useRfLayout reads), and each theme's rule for that layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRfLayout, PHONE_LANDSCAPE_MAX_H, PHONE_LANDSCAPE_MIN_ASPECT, PORTRAIT_MAX_W } from '../src/packs/layout.ts';
import { isDriveWindow } from '../src/themes/useDriveWindow.ts';
import { GRID_LAYOUTS, gridHandles, resolveCells } from '../src/packs/grid/contract.ts';
import { CJ_GRID } from '../src/packs/carrier-jet/cells.ts';

const pick = (w: number, h: number, coarse: boolean) => pickRfLayout({ w, h, coarse, driveWindow: isDriveWindow(w, h) });

test('the four probe viewports pick the four layouts', () => {
  assert.equal(pick(1280, 800, false), 'board');
  assert.equal(pick(1256, 706, false), 'board');
  assert.equal(pick(773, 601, false), 'window');
  assert.equal(pick(390, 844, true), 'portrait');
  assert.equal(pick(844, 390, true), 'phone-landscape');
});

test('every pick is a GRID_LAYOUTS member (a theme can always look its rule up)', () => {
  for (let w = 280; w <= 1600; w += 37) for (let h = 280; h <= 1100; h += 41) for (const coarse of [false, true]) {
    assert.ok(GRID_LAYOUTS.includes(pick(w, h, coarse)), `${w}x${h} ${coarse}`);
  }
});

test('phone layouts need a coarse pointer; edges match the picker constants', () => {
  assert.equal(PHONE_LANDSCAPE_MAX_H, 500);
  assert.equal(PHONE_LANDSCAPE_MIN_ASPECT, 1.6);
  assert.equal(PORTRAIT_MAX_W, 500);
  assert.notEqual(pick(844, 390, false), 'phone-landscape');
  assert.notEqual(pick(390, 844, false), 'portrait');
  assert.equal(pickRfLayout({ w: 800, h: 500, coarse: true, driveWindow: false }), 'phone-landscape');
  assert.equal(pickRfLayout({ w: 799, h: 500, coarse: true, driveWindow: false }), 'board', 'just under 1.6:1');
  assert.equal(pickRfLayout({ w: 500, h: 501, coarse: true, driveWindow: false }), 'portrait');
  assert.equal(pickRfLayout({ w: 501, h: 900, coarse: true, driveWindow: false }), 'board');
  assert.equal(pickRfLayout({ w: 0, h: 0, coarse: true, driveWindow: true }), 'window', 'no size yet: never a phone layout');
});

test('Carrier Jet: board and window are grid-drawn (derived from the skin), phones are the skin’s own CSS', () => {
  const at = { board: pick(1280, 800, false), window: pick(773, 601, false), portrait: pick(390, 844, true), phone: pick(844, 390, true) };
  assert.equal(gridHandles(CJ_GRID, at.board), true);
  assert.equal(gridHandles(CJ_GRID, at.window), true);
  assert.equal(gridHandles(CJ_GRID, at.portrait), false);
  assert.equal(gridHandles(CJ_GRID, at.phone), false);
  assert.equal(CJ_GRID.layouts.board?.kind, 'derive');
  assert.equal(resolveCells(CJ_GRID, at.phone, null), null);
});
