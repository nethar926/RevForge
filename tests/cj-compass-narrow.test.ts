import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roseNarrowGeom } from '../src/skins/carrier-jet/svgFit.ts';

// Narrow compass (COMPASS / ACCEL swap). Layout is pinned by the browser sweep (compass-narrow/compass.json:
// no overlaps or clipping at 773 / 1256 / 1280, Drive and Park); these pin the contract in source.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parts = readFileSync(join(root, 'src/skins/carrier-jet/parts.tsx'), 'utf8');
const fit = readFileSync(join(root, 'src/skins/carrier-jet/svgFit.ts'), 'utf8');
const legend = readFileSync(join(root, 'src/skins/carrier-jet/map/HeadingLegend.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/skins/carrier-jet/carrier-jet.css'), 'utf8');

test('Rose switches to the narrow layout below 0.6 rendered px per unit; full rose untouched otherwise', () => {
  assert.match(parts, /export const ROSE_NARROW_SCALE = 0\.6;/);
  assert.match(parts, /if \(sv < ROSE_NARROW_SCALE\) return <RoseNarrow/);
  assert.match(fit, /export const SvgScale = createContext<SvgFit>\(\{ s: 1, top: 0 \}\)/, 'server / unmeasured = full rose');
});

test('narrow rose: cardinals always, 30s only when >= 20px apart, centre on the cell floor', () => {
  assert.match(parts, /const lab = d % 90 === 0 \|\| \(showNums && d % 30 === 0\);/);
  assert.match(parts, /\* sv >= 20;/);
  assert.match(fit, /R = Math\.max\(0, Math\.min\(w \* 0\.46, y \+ h - top - 2 \* u\)\)/);
  assert.match(parts, /data-cj-rose="narrow"/);
  assert.match(parts, /className="cj-rose-box"/);
});

test('HDG chip steps 18 -> 13px (>= 11px floor) in cells under 130px and is tagged for the rose box hide', () => {
  assert.match(legend, /host\.clientWidth < 130 \? 13 : 18\)/);
  assert.match(legend, /data-cj-hdg-chip=""/);
  assert.match(css, /:root:has\(\[data-cj-hdg-chip\]\) \[data-cj-rose='narrow'\] \.cj-rose-box \{ visibility: hidden; \}/);
});

test('narrow rose: tiny / too-short cells never give a negative SVG r or clip height (844x390 phone board)', () => {
  // the 844x390 case that logged 'circle r -200.4' / 'rect height -116.7', plus a sweep of tiny cells and scales
  for (const sv of [0.05, 0.1, 0.2, 0.3, 0.45, 0.59]) for (const w of [0, 1, 10, 40, 99, 174]) for (const h of [0, 1, 5, 12, 30, 60, 160]) for (const svTop of [0, 10, 40]) for (const y of [0, 20]) {
    const g = roseNarrowGeom(0, y, w, h, sv, svTop);
    const at = `w${w} h${h} y${y} sv${sv} top${svTop}`;
    assert.ok(g.R >= 0, `r ${g.R} at ${at}`);
    assert.ok(g.lr >= 0, `label r ${g.lr} at ${at}`);
    assert.ok(g.clipH >= 0, `clip height ${g.clipH} at ${at}`);
    assert.ok(Number.isFinite(g.R) && Number.isFinite(g.clipH), at);
  }
  // a roomy cell is unchanged by the clamp
  const g = roseNarrowGeom(0, 0, 200, 400, 0.5, 0);
  assert.equal(g.R, 200 * 0.46);
  assert.equal(g.clipH, 400 - g.band);
  assert.match(parts, /height=\{clipH\}/);
});
