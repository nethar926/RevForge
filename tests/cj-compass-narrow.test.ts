import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Narrow compass (COMPASS / ACCEL swap). Layout is pinned by the browser sweep (compass-narrow/compass.json:
// no overlaps or clipping at 773 / 1256 / 1280, Drive and Park); these pin the contract in source.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const parts = readFileSync(join(root, 'src/skins/carrier-jet/parts.tsx'), 'utf8');
const legend = readFileSync(join(root, 'src/skins/carrier-jet/map/HeadingLegend.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/skins/carrier-jet/carrier-jet.css'), 'utf8');

test('Rose switches to the narrow layout below 0.6 rendered px per unit; full rose untouched otherwise', () => {
  assert.match(parts, /export const ROSE_NARROW_SCALE = 0\.6;/);
  assert.match(parts, /if \(sv < ROSE_NARROW_SCALE\) return <RoseNarrow/);
  assert.match(parts, /export const SvgScale = createContext<SvgFit>\(\{ s: 1, top: 0 \}\)/, 'server / unmeasured = full rose');
});

test('narrow rose: cardinals always, 30s only when >= 20px apart, centre on the cell floor', () => {
  assert.match(parts, /const lab = d % 90 === 0 \|\| \(showNums && d % 30 === 0\);/);
  assert.match(parts, /\* sv >= 20;/);
  assert.match(parts, /R = Math\.min\(w \* 0\.46, y \+ h - top - 2 \* u\)/);
  assert.match(parts, /data-cj-rose="narrow"/);
  assert.match(parts, /className="cj-rose-box"/);
});

test('HDG chip steps 18 -> 13px (>= 11px floor) in cells under 130px and is tagged for the rose box hide', () => {
  assert.match(legend, /host\.clientWidth < 130 \? 13 : 18\)/);
  assert.match(legend, /data-cj-hdg-chip=""/);
  assert.match(css, /:root:has\(\[data-cj-hdg-chip\]\) \[data-cj-rose='narrow'\] \.cj-rose-box \{ visibility: hidden; \}/);
});
