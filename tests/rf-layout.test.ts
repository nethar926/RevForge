import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickRfLayout } from '../src/packs/layout.ts';
import { isDriveWindow } from '../src/themes/useDriveWindow.ts';

const L = (w: number, h: number, coarse: boolean) => pickRfLayout({ w, h, coarse, driveWindow: isDriveWindow(w, h) });

test('1280x800 fine and coarse → board', () => {
  assert.equal(L(1280, 800, false), 'board');
  assert.equal(L(1280, 800, true), 'board');
});
test('Tesla drive-window sizes → window (fine and coarse; never phone-landscape or portrait)', () => {
  for (const [w, h] of [[760, 560], [773, 601], [830, 640]]) for (const coarse of [false, true]) assert.equal(L(w, h, coarse), 'window', `${w}x${h} ${coarse}`);
});
test('844x390: coarse → phone-landscape, fine → not phone-landscape', () => {
  assert.equal(L(844, 390, true), 'phone-landscape');
  assert.notEqual(L(844, 390, false), 'phone-landscape');
  assert.equal(L(844, 390, false), 'window');
});
test('390x844 coarse → portrait; fine → not portrait', () => {
  assert.equal(L(390, 844, true), 'portrait');
  assert.notEqual(L(390, 844, false), 'portrait');
});
test('edges: phone-landscape needs h ≤ 500 and ≥ 1.6:1; portrait needs w ≤ 500 and tall', () => {
  assert.equal(pickRfLayout({ w: 800, h: 500, coarse: true, driveWindow: true }), 'phone-landscape');
  assert.equal(pickRfLayout({ w: 799, h: 500, coarse: true, driveWindow: true }), 'window');
  assert.equal(pickRfLayout({ w: 900, h: 501, coarse: true, driveWindow: true }), 'window');
  assert.equal(pickRfLayout({ w: 500, h: 501, coarse: true, driveWindow: true }), 'portrait');
  assert.equal(pickRfLayout({ w: 501, h: 900, coarse: true, driveWindow: true }), 'window');
  assert.equal(pickRfLayout({ w: 400, h: 400, coarse: true, driveWindow: false }), 'board');
});
test('index.html meta viewport has viewport-fit=cover; safe-area padding only under the phone layouts', () => {
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /<meta name="viewport" content="[^"]*viewport-fit=cover/);
  const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-mount.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /safe-area-inset-top/);
  for (const m of css.matchAll(/([^{}]+)\{[^}]*safe-area-inset[^}]*\}/g)) assert.match(m[1], /^(\s*\.cjm\[data-rf-layout='(portrait|phone-landscape)'\] > \.cjm-fill,?\s*)+$/);
});
