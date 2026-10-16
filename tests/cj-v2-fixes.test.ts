import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// v2 fixes (Oct 16 2026): the AB guard is the leftmost bottom-bank control (nearest the driver); EMER STOP PULL sits
// to its right in every bottom-row placement (1280 and 773). Short RPM cell, OVER · DECK chip and AOA legend are CSS.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');
const gallery = readFileSync(join(SKIN, 'parts/gallery/gallery.tsx'), 'utf8');

test('bottom bank placements: AB guard leftmost, PULL right of it (1280 and 773)', () => {
  for (const size of ['1280', '773']) {
    const m = gallery.match(new RegExp(`data-gal-bank="${size}">([\\s\\S]*?)\\n\\s*</div>\\n\\s*</Item>`));
    assert.ok(m, `${size} bank found`);
    const kids = [...m[1].matchAll(/^\s*<div [^\n]*?><(\w+)/gm)].map((k) => k[1]);
    assert.equal(kids[0], 'CarrierJetAfterburnerGuard', `${size}: the guard is the leftmost control (${kids.join(', ')})`);
    assert.equal(kids[1], 'PullHandle', `${size}: PULL directly right of the guard`);
    assert.ok(kids.indexOf('PullHandle') > kids.indexOf('CarrierJetAfterburnerGuard'));
  }
  assert.doesNotMatch(readFileSync(join(SKIN, 'parts/README.md'), 'utf8'), /PullHandle`[^\n]*far left/, 'README no longer puts PULL far left');
});

test('gallery title is look-neutral', () => {
  assert.match(gallery, /<h1 className="gal-h1">JET · COLD-START PARTS<\/h1>/);
});

test('773 skin fixes are scoped (1280 rules untouched)', () => {
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  assert.match(css, /@container \(max-height: 34px\) \{[\s\S]*?\.cj-rpm > \.cj-k-num \{[^}]*font-size: max\(11px,/, 'short RPM cell: digits on the label line, >= 11px');
  assert.match(css, /\.cj-a-sweep \.cj-mode \{ transform: translate\(calc\(-100% - 6px\), calc\(-100% - 4px\)\); \}/, 'chip beside the digits, off the tape');
  assert.match(css, /\[data-cj-el='aoa'\] > text:first-child \{\s*transform: translate\(min\(0px,[^;]*max\(calc\(11\.2px \/ var\(--cj-sv, 1\) - 19px\), 0px\)\)/, 'AOA move is zero unless the floor grows the legend');
});
