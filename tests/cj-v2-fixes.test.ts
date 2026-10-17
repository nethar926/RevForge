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
  assert.match(css, /\.cj-a-sweep \.cj-mode\.is-over \{\s*position: absolute; right: calc\(100% \+ 8px\); top: 0; margin: 0; transform: none;/, 'AUTO / OVER · DECK chip on the SWEEP caption line, left of the digits, off the tape');
  assert.match(css, /--cj-v2-mode-nudge: translate\(calc\(-100% - 6px\), calc\(-100% - 4px\)\);/, 'v2 nudge kept for phone portrait');
  assert.match(css, /\[data-rf-layout="portrait"\] \.cj\[data-variant='carrier-jet'\]\[data-layout='reflow'\] \.cj-a-sweep \.cj-swd > \.cj-mode\.cj-mode \{ position: static;[^}]*transform: var\(--cj-v2-mode-nudge, none\); \}/, 'phone portrait keeps its previous chip placement');
  assert.match(css, /\[data-cj-el='aoa'\] > text:first-child \{\s*transform: translate\(min\(0px,[^;]*max\(calc\(11\.2px \/ var\(--cj-sv, 1\) - 19px\), 0px\)\)/, 'AOA move is zero unless the floor grows the legend');
});

test('WING SWEEP AUTO chip: no longer translated onto the tape end; font size floors kept (>= 11px)', () => {
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  const v2 = [...css.matchAll(/\.cjm\[data-cjm-v2\][^{]*\.cj-a-sweep \.cj-mode[^{]*\{([^}]*)\}/g)];
  assert.ok(v2.length >= 2, 'v2 chip rules found');
  for (const m of v2) assert.doesNotMatch(m[1], /font-size/, 'chip rules do not shrink the text');
  assert.doesNotMatch(css, /^\.cjm\[data-cjm-v2\] \.cj\[data-variant='carrier-jet'\]:is\(\[data-layout='reflow'\], \[data-layout='full'\]\) \.cj-a-sweep \.cj-mode \{ transform: translate/m, 'old tape-end translate is gone outside portrait');
  assert.match(css, /\.cj-mode \{[^}]*font-size: max\(12px,/, 'base chip >= 12px');
  assert.match(css, /\.cj\[data-layout='reflow'\] \.cj-mode \{ font-size: max\(11px,/, 'reflow chip >= 11px');
});

test('WING SWEEP readout clear of the sweep tape: cell size container, pinned --k, wide-cell caption row + capped tape', () => {
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  const A = String.raw`\.cjm\[data-cjm-v2\] \.cj\[data-variant='carrier-jet'\]:is\(\[data-layout='reflow'\], \[data-layout='full'\]\)`;
  assert.match(css, /@property --cj-k-cell \{ syntax: '<length>'; inherits: true; initial-value: 1px; \}/, 'board scale pinned as a length');
  assert.match(css, new RegExp(`${A} \\.cj-a-sweep \\{ container: cjsw / size; --cj-k-cell: var\\(--k\\); --cj-swf: max\\(28px, calc\\(76 \\* var\\(--cj-k-cell\\)\\)\\); \\}`), 'sweep cell is the size container; digits size from the board scale (unchanged 76k, >= 28px)');
  assert.match(css, new RegExp(`${A} \\.cj-a-sweep > \\* \\{ --k: var\\(--cj-k-cell\\); \\}`), 'children keep the board --k (text not rescaled by the new container)');
  const wide = css.match(/@container cjsw \(min-aspect-ratio: 2 \/ 1\) \{([\s\S]*?)\n\}/);
  assert.ok(wide, 'wide, short cell query (1256x706 Tesla)');
  assert.match(wide[1], /\.cj-swd \{ flex-direction: row;/, 'caption beside the digits');
  assert.match(wide[1], /\.cj-a-tape \{ max-height: calc\(100cqh - 0\.66 \* var\(--cj-swf\) - 4px\); \}/, 'tape capped under the digits');
  assert.doesNotMatch(wide[1], /font-size/, 'digits keep their size');
  assert.match(css, /\[data-rf-layout="portrait"\] \.cj\[data-variant='carrier-jet'\]\[data-layout='reflow'\] \.cj-a-sweep \{ container: none; \}/, 'phone portrait: no size container');
});
