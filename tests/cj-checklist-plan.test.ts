/** CJ checklist PAMPHLET (mock): Scott's data plan → 9 sections, lettered items, badges, VoiceOver. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { csSequence } from '../src/packs/carrier-jet/coldStart.ts';
import { getJetSystemList } from '../src/audio/jetColdStart.js';
import { badgeCodes, badgeFor, badgeLabel, CJ_CHECKLIST_PLAN, ckItems, ckLineLabel } from '../src/packs/carrier-jet/checklistPlan.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('sections 1..9 in order; every APU start step is one lettered item, off steps included (as 6e85d6f)', () => {
  assert.deepEqual(CJ_CHECKLIST_PLAN.map((s) => `${s.n} ${s.title}`), ['1 POWER', '2 FUEL', '3 APU START', '4 L ENGINE', '5 R ENGINE', '6 APU SECURE', '7 SYSTEMS', '8 LIGHTS', '9 MASTER CAUTION']);
  const seq = csSequence(getJetSystemList('apu'), 'apu').map((s) => s.key);
  assert.deepEqual(ckItems().map((i) => i.key), seq);
  for (const s of CJ_CHECKLIST_PLAN) s.items.forEach((it, i) => assert.equal(it.code, `${s.n}${'abcdefgh'[i]}`));
  for (const it of ckItems()) assert.ok(['ON', 'OFF', 'HOLD TO RUN', 'IDLE', 'PRESS', 'LIFT', 'CLOSE'].includes(it.action), it.action);
});

test('Verify lines, CAUTION above the start, badges and VoiceOver', () => {
  const by = (k: string) => ckItems().find((i) => i.key === k)!;
  assert.deepEqual(by('seatbelt').verify, ['Verify single low tone']);
  assert.deepEqual(by('oxygen').verify, ['Verify 3 hi-lo chimes']);
  assert.equal(by('oxygen').item, 'O2');
  assert.deepEqual(by('engL').callout, { kind: 'CAUTION', text: 'Throttle at IDLE before start.' });
  assert.equal(ckItems().filter((i) => i.callout).length <= 3, true, 'boxes only where they matter');
  assert.deepEqual(badgeCodes('apu'), ['3b', '6a']);
  const cur3b = ckItems().findIndex((i) => i.code === '3b');
  assert.deepEqual(badgeFor('apu', cur3b), { code: '3b', next: true });
  assert.equal(badgeLabel('apu', cur3b), 'APU switch, step 3 b, next');
  assert.equal(badgeLabel('batt', cur3b), 'Battery switch, step 1 a, done');
  assert.equal(badgeLabel('apu', ckItems().findIndex((i) => i.key === 'apu:off')), 'APU switch, step 6 a, next');
  assert.equal(ckLineLabel(by('apu:off'), 'todo'), 'Step 6 a, APU switch, OFF');
  assert.equal(ckLineLabel(by('batt'), 'done'), 'Step 1 a, Battery switch, ON, done');
});

test('pamphlet: leaders + verify + boxes aria-hidden, one label per line; actions ≥ 11px narrow; no reference image in the repo', () => {
  const tsx = src('skins/carrier-jet/concept/ChecklistPamphlet.tsx');
  assert.match(tsx, /<div className="ckp-line" aria-hidden="true">[\s\S]*<span className="ckp-dots" \/>/);
  assert.match(tsx, /aria-label=\{ckLineLabel\(it, st\)\}/);
  assert.match(tsx, /className="ckp-callout"[^>]*aria-hidden="true"/);
  const css = src('skins/carrier-jet/concept/concept.css');
  assert.match(css, /\.ckp\[data-size='narrow'\] \.ckp-line, \.ckp\[data-size='narrow'\] \.ckp-act \{ font-size: 11px;/);
  const mc = src('skins/carrier-jet/concept/MasterCaution.tsx');
  assert.match(mc, /width: 64px|64×64/);
  assert.doesNotMatch(src('skins/carrier-jet/concept/concept.tsx'), /private-refs|\.jpg/);
});
