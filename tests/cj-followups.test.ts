// Follow-ups on frontend/cj-board-batch (45ee8d9). Tesla input check: 'Enable controls / recheck' is a >= 44px tap
// target (Apple HIG 44pt), only its floor moves (the base .forge-text-button keeps 40px everywhere else). CjLiveMap: the
// contour start values are synced in an effect, never written to a ref during render. Rendered checks:
// frontend-handoff/cj-followups/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('Tesla input check: Enable controls / recheck is >= 44px tall, layout otherwise unchanged', () => {
  const page = src('forge/ForgePage.tsx');
  // the button lives in the compatibility box and keeps the shared text-button class
  assert.match(page, /<div className="compatibility-box"><h3>Tesla input check<\/h3>[\s\S]*?<button className="forge-text-button"[^>]*onClick=\{media\.arm\}>Enable controls \/ recheck<\/button>/);
  const css = src('forge/forge.css');
  assert.match(css, /\.compatibility-box \.forge-text-button \{\s*min-height: 44px;\s*\}/);
  // the scoped rule only sets the floor: no padding / font / display / margin change
  const rule = css.match(/\.compatibility-box \.forge-text-button \{([^}]*)\}/)![1];
  assert.deepEqual(rule.split(';').map((d) => d.trim()).filter(Boolean), ['min-height: 44px']);
  // the base text button is untouched (40px floor, inline-flex centring)
  assert.match(css, /\.forge-text-button \{\s*display: inline-flex;\s*align-items: center;\s*gap: 8px;\s*min-height: 40px;/);
});

test('CjLiveMap: contour start values synced in an effect, not written to the ref during render', () => {
  const m = src('packs/mounts/CjLiveMap.tsx');
  assert.match(m, /useEffect\(\(\) => \{\s*contourInit\.current = \{ rangeMi: contourInitRange, dim: contourInitDim \};\s*\}, \[contourInitRange, contourInitDim\]\);/);
  // the only write to contourInit.current is that effect's
  assert.equal(m.match(/contourInit\.current =/g)!.length, 1);
  // and it is declared before the create effect that reads it (so it runs first in the same commit)
  assert.ok(m.indexOf('contourInit.current = {') < m.indexOf('...contourInit.current'));
});
