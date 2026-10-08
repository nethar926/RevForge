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
  // Every safe-area rule is phone-scoped: the mount fill, or Drive chrome under a CJ phone-layout mount.
  for (const m of css.matchAll(/([^{}]+)\{[^}]*safe-area-inset[^}]*\}/g)) for (const sel of m[1].split(',')) assert.match(sel.trim(), /^(\.cjm\[data-rf-layout='(portrait|phone-landscape)'\] > \.cjm-fill|\.rev-viewport:has\(> \.rev-dock\):has\(\.cjm\[data-rf-layout='(portrait|phone-landscape)'\]\).*)$/);
});
test('phone chrome: every .rev-viewport rule in the CJ mount CSS is scoped to a CJ phone layout with the dock present', () => {
  const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-mount.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(',')).map((x) => x.trim()).filter((x) => x.includes('.rev-'));
  assert.ok(sels.length >= 10);
  for (const sel of sels) assert.match(sel, /^\.rev-viewport:has\(> \.rev-dock\):has\(\.cjm\[data-rf-layout='(portrait|phone-landscape)'\]\)/);
  // phone landscape: right rail (88px + right inset), title visually hidden not removed, vertical throttle
  assert.match(css, /--cjm-rail: 88px/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) var\(--cjm-rail\)/);
  assert.match(css, /> \.rev-topbar > div \{[^}]*clip: rect\(0 0 0 0\)/);
  assert.doesNotMatch(css, /\.rev-topbar[^{]*\{[^}]*display: none/);
  assert.match(css, /writing-mode: vertical-lr/);
});
