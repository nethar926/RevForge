import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/forge/ForgePage.tsx', import.meta.url), 'utf8');

test('Tuner panels: breadcrumb names the parent and the panel; back key names and returns to the parent', () => {
  assert.match(page, /panel==="tuner"\?"REVFORGE \/ TUNE":`REVFORGE \/ TUNE \/ \$\{panelTitle\.toUpperCase\(\)\}`/);
  assert.match(page, /aria-label="Back to Tune" onClick=\{\(\)=>setPanel\("tuner"\)\}>← TUNE<\/button>/);
  assert.doesNotMatch(page, /<span className="forge-eyebrow">REVFORGE \/ TUNE<\/span>\{panel!=="tuner"/, 'the old "TUNE ← TUNE" form is gone');
});
