// Follow-ups on frontend/cj-board-batch (45ee8d9). CjLiveMap: the contour start values are synced in an effect, never
// written to a ref during render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('CjLiveMap: contour start values synced in an effect, not written to the ref during render', () => {
  const m = src('packs/mounts/CjLiveMap.tsx');
  assert.match(m, /useEffect\(\(\) => \{\s*contourInit\.current = \{ rangeMi: contourInitRange, dim: contourInitDim \};\s*\}, \[contourInitRange, contourInitDim\]\);/);
  // the only write to contourInit.current is that effect's
  assert.equal(m.match(/contourInit\.current =/g)!.length, 1);
  // and it is declared before the create effect that reads it (so it runs first in the same commit)
  assert.ok(m.indexOf('contourInit.current = {') < m.indexOf('...contourInit.current'));
});
