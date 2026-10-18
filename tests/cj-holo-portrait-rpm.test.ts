// skin/cj-contrast-holo commit 2: HOLO portrait MACH / RPM cell (RPM digits were 0px, SUPERSONIC on the digits line),
// MATRIX "NEEDS MOTION" chip (ran off the Board 2 edge at 773 / 1280), VECTOR "AB OFF" (cut 1.1px at 773 Drive).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/skins/carrier-jet/carrier-jet.css'), 'utf8');
// parts.tsx is TSX (node --test cannot import it): read it as text
const parts = readFileSync(join(root, 'src/skins/carrier-jet/parts.tsx'), 'utf8');

const P = `[data-rf-layout="portrait"] .cj[data-layout='reflow'][data-variant='swing-wing']`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** declarations of the last rule whose selector is exactly `sel` (the one that wins at equal specificity) */
// top-level rules only: the narrow-width @container fallback is checked on its own below
const flat = css.replace(/@container cj-hgr \([^)]*\) \{[\s\S]*?\n\}/, '');
const decl = (sel: string, src = flat) => { const all = [...src.matchAll(new RegExp(`(?:^|\\n)\\s*${esc(sel)} \\{([^}]*)\\}`, 'g'))]; assert.ok(all.length, `rule ${sel}`); return all[all.length - 1][1]; };
const px = (d: string, prop: string) => { const m = d.match(new RegExp(`(?:^|;)\\s*${prop}: (-?[\\d.]+)px`)); assert.ok(m, `${prop} in ${d}`); return +m[1]; };

test('HOLO portrait: SUPERSONIC sits at the right end of the RPM caption line, never on the digits line', () => {
  const tag = decl(`${P} .cj-c-gr .cj-mach-tag`);
  assert.match(tag, /position: absolute/); assert.match(tag, /right: 0/);
  assert.ok(px(tag, 'font-size') >= 11, 'tag >= 11px');
  const lab = decl(`${P} .cj-c-gr .cj-lab`), num = decl(`${P} .cj-rpm .cj-k-num`), bar = decl(`${P} .cj-c-gr .cj-rpm-bar`);
  // the tag's bottom offset is exactly the lines under the caption: digits (margin + line) + bar (margin + height)
  const under = px(num, 'margin-top') + px(num, 'line-height') + px(bar, 'margin-top') + px(bar, 'height');
  assert.equal(px(tag, 'bottom'), under, 'tag bottom = top of the digits line');
  assert.equal(px(tag, 'line-height'), px(lab, 'line-height'), 'tag line = caption line');
  // the cell is its containing block, MACH / RPM are not (so the offset is measured from the RPM bar's bottom)
  assert.match(decl(`${P} .cj-c-gr`), /position: relative/);
  assert.match(decl(`${P} .cj-c-gr > *`), /container-type: normal; position: static/);
});

test('HOLO portrait: RPM digits on their own >= 11px line, bar full width below', () => {
  const num = decl(`${P} .cj-rpm .cj-k-num`);
  assert.ok(px(num, 'font-size') >= 11 && px(num, 'line-height') >= px(num, 'font-size'), 'fixed >= 11px digits line');
  assert.doesNotMatch(num, /cq[hw]/, 'not sized from the (collapsing) cell');
  assert.doesNotMatch(decl(`${P} .cj-c-gr .cj-rpm-bar`), /margin-right|width/, 'full-width bar');
  // the cell takes its content height; the card row grows by the same amount so SPEED keeps its old height
  assert.match(decl(`${P} .cj-c-left`), /grid-template-rows: minmax\(0, 1fr\) auto;/);
  assert.match(decl(`${P} .cj-body`), /grid-template-rows: minmax\(0, calc\(73px \+ 15\.4%\)\) minmax\(0, 40fr\) minmax\(calc\(\(100% - 12px\) \* 0\.32\), 32fr\);/);
  // ...and the AOA / attitude row keeps its old 32fr share as a floor (WING SWEEP absorbs the taller card)
  assert.match(css, /60px minmax\(0, calc\(7px \+ 15\.4%\)\) minmax\(0, 40fr\) minmax\(calc\(\(100% - 78px\) \* 0\.32\), 32fr\);/);
  assert.match(decl(`${P} .cj-c-gr`), /grid-template-rows: auto auto/);
  // the mach tape rides the MACH line (a line of its own made the card ~14px taller and squeezed the AOA scale at 320x700)
  assert.match(decl(`${P} .cj-c-gr .cj-mach-tape`), /grid-column: 3; grid-row: 1;/);
});

test('HOLO portrait narrow fallback: tag on the bar line, bar shortened to make room', () => {
  const m = css.match(/@container cj-hgr \(max-width: ([\d.]+)px\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'fallback container query');
  // RPM caption (~28px at 11px / 0.2em) + 8px + SUPERSONIC chip (~67px at 11px) must fit above the threshold
  assert.ok(+m[1] >= 28 + 8 + 67, `threshold ${m[1]}px`);
  const tag = decl(`${P} .cj-c-gr .cj-mach-tag`, m[2]), bar = decl(`${P} .cj-c-gr .cj-rpm-bar`, m[2]);
  assert.ok(Math.abs(px(tag, 'bottom')) <= 2, 'tag centred on the 10px bar');
  assert.ok(px(bar, 'margin-right') >= 67 + 6, 'bar leaves the chip width + a gap');
});

test('MATRIX Board 2: NEEDS MOTION is anchored to its COMPASS label (not the board), >= 11px, no ellipsis', () => {
  assert.match(css, /\.cjm\[data-cjm-v2\] \.cj\[data-variant='carrier-jet'\]:is\(\[data-layout='reflow'\], \[data-layout='full'\]\) \.cj-a-mid > \.cj-plab-2:has\(> \.cj-hstale\) \{ position: relative; \}/);
  for (const sel of ['.cj-hstale', ".cj[data-layout='reflow'] .cj-hstale", ".cj[data-variant='carrier-jet'] .cj-hstale"]) {
    const f = decl(sel).match(/font-size: max\((\d+)px/); assert.ok(f && +f[1] >= 11, `${sel} floor`);
  }
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/, 'no ellipsis anywhere in the skin');
});

test('VECTOR AB word: tighter tracking and an inset inside its 70-unit label cell', () => {
  const ls = +parts.match(/export const AB_WORD_LS = ([\d.]+);/)![1], inset = +parts.match(/export const AB_WORD_INSET = ([\d.]+);/)![1];
  assert.ok(ls < 0.06 && ls >= 0, 'tracking tighter than the 0.06em default');
  assert.ok(inset >= 2, 'ink clear of the SVG left edge');
  assert.match(parts, /const labW = 70,/);
  // widest word "AB OFF", 800 weight Barlow Semi Condensed at the boosted ~20 units: ~0.47em/glyph average + tracking
  const w = 6 * 20 * 0.47 + 5 * ls * 20;
  assert.ok(inset + w < 70, `AB OFF ~${(inset + w).toFixed(1)} units < 70`);
  assert.match(parts, /<T x=\{x \+ AB_WORD_INSET\} y=\{zy \+ 18\}[^>]*ls=\{AB_WORD_LS\}>\{abWord\}<\/T>/);
});

test('HOLO portrait: the engines svg lets its R LOAD caption run into the card padding (no clip)', () => {
  // 'R LOAD' (~48 units at 12px) is wider than its bar's 42-unit share; when the svg is height-bound (taller card) it
  // ran 1-2px past the svg edge and was clipped. It stays inside the card (11px padding), so the svg may overflow.
  assert.match(decl(`${P} .cj-c-eng > .cj-svg`), /overflow: visible/);
});
