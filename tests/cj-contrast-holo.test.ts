// skin/cj-contrast-holo (Oct 17 2026 phone sweep follow-up): HOLO RPM 11px floor, HOLO label contrast,
// switch-shelf / bank engraved legends >= 4.5:1 on the rendered gunmetal, unlit ACQ lamp legend untouched (exempt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACQ_UNLIT_FILL } from '../src/skins/carrier-jet/parts/tokens.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/skins/carrier-jet/carrier-jet.css'), 'utf8');
const parts = readFileSync(join(root, 'src/skins/carrier-jet/parts/parts.css'), 'utf8');
// art.tsx is TSX (node --test cannot import it): read the tokens from its source
const art = readFileSync(join(root, 'src/skins/carrier-jet/parts/art.tsx'), 'utf8');
const tok = (re: RegExp) => { const m = art.match(re); assert.ok(m, String(re)); return m[1]; };
const ENG = { white: tok(/\bwhite: '(#[0-9a-f]{6})'/), grey: tok(/\bgrey: '(#[0-9a-f]{6})'/), amber: tok(/\bamber: '(#[0-9a-f]{6})'/) };
const CUE_TINT = { next: tok(/CUE_TINT = \{ next: '([^']+)'/), busy: tok(/CUE_TINT = \{[^}]*busy: '([^']+)'/) };

const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg: number[], a: number, bg: number[]) => fg.map((v, i) => v * a + bg[i] * (1 - a));

// Mean backgrounds sampled from the rendered build (sweep.mjs, text hidden) at 773x601 / 1280x800.
const PANEL_LIGHTEST = [92, 99, 104]; // lightest sampled gunmetal behind a shelf / bank legend (QUICK START plate area)
const SHELF_HEADER = [94, 101, 104]; // COLD START header strip, luminance ~0.124
const CELL = [86, 93, 98]; // a typical toggle cell / RADAR plate behind ON
const HOLO_AB_GLOW = [92, 76, 49];
// BATT cell (the first cued cell) without its wash: 1280 Park measured rgb(91,103,105) with the 4% wash → ~[89,99,103]
const CUED_CELL_BASE = [89, 99, 103]; // HOLO portrait Drive: amber AB glow behind the RPM label

test('HOLO RPM digits keep an 11px floor in the reflowed board (phone landscape); portrait keeps its own sizing', () => {
  const base = css.match(/\.cj\[data-layout='reflow'\]\[data-variant='swing-wing'\] \.cj-rpm \.cj-k-num \{ font-size: ([^;]+); \}/);
  assert.ok(base, 'reflow swing-wing RPM rule');
  assert.match(base[1], /^max\(11px, min\(calc\(100cqh - 34px\), 42cqw\)\)$/, 'the reflow size, floored at 11px');
  // after the generic reflow RPM size (overrides it) and before the portrait one (same specificity: portrait still wins)
  const at = css.indexOf(base[0]);
  assert.ok(at > css.indexOf(".cj[data-layout='reflow'] .cj-rpm .cj-k-num {"), 'after the generic reflow rule');
  assert.ok(at < css.indexOf(`[data-rf-layout="portrait"] .cj[data-layout='reflow'] .cj-rpm .cj-k-num {`), 'before the portrait rule');
  assert.doesNotMatch(css, /\[data-rf-layout="portrait"\][^{]*\[data-variant='swing-wing'\] \.cj-rpm \.cj-k-num/, 'no portrait floor (no room under SUPERSONIC)');
});

test('HOLO label colour >= 4.5:1 on the amber AB glow', () => {
  const lab = css.match(/--cj-cap: #aebdcc; --cj-lab: (#[0-9a-f]{6});/)?.[1];
  assert.ok(lab, 'swing-wing --cj-lab');
  assert.ok(ratio(rgb(lab), HOLO_AB_GLOW) >= 4.5, `${lab} on AB glow ${ratio(rgb(lab), HOLO_AB_GLOW).toFixed(2)}:1`);
});

test('engraved shelf / bank legends >= 4.5:1 on the rendered gunmetal', () => {
  for (const [name, fg] of [['grey', ENG.grey], ['amber', ENG.amber], ['white', ENG.white]] as const)
    for (const [where, bg] of [['lightest panel', PANEL_LIGHTEST], ['shelf header', SHELF_HEADER], ['cell', CELL]] as const) {
      const r = ratio(rgb(fg), bg); assert.ok(r >= 4.5, `${name} ${fg} on ${where}: ${r.toFixed(2)}:1`);
    }
  assert.match(parts, new RegExp(`\\.cjp-eng--amber \\{[^}]*color: ${ENG.amber};`), 'COLD START uses the lit amber token');
});

test('cued toggle cell: the cue wash keeps grey + amber legends >= 4.5:1', () => {
  for (const [k, w] of Object.entries(CUE_TINT)) {
    const m = w.match(/rgba\((\d+),(\d+),(\d+),([.\d]+)\)/); assert.ok(m, k);
    const bg = over([+m[1], +m[2], +m[3]], +m[4], CUED_CELL_BASE);
    for (const fg of [ENG.grey, ENG.amber]) assert.ok(ratio(rgb(fg), bg) >= 4.5, `${fg} on ${k} cue: ${ratio(rgb(fg), bg).toFixed(2)}:1`);
  }
});

test('unlit lamp legend ACQ stays Wilson\'s unlit-lens shade (inactive component, WCAG exempt)', () => {
  assert.equal(ACQ_UNLIT_FILL, '#1f3619');
});
