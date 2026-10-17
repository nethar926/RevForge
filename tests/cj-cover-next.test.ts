// Pamphlet cover "NEXT <code>" (William's gate): shown ONLY while the next step's badge is hidden under a closed guard.
// Root cause of "NEXT 1b" at step 2: the cover printed `step && !live`, i.e. any pre-start step, guard or not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getJetChecklist, getJetSystemList } from '../src/audio/jetColdStart.js';
import { CS_DARK, csCoverNext, csSequence, csVariant, csView, type CsGuardId, type CsInput, type CsMode } from '../src/packs/carrier-jet/coldStart.ts';

/** After the first n steps, guards as given (missing = never touched = down). */
function at(mode: CsMode, n: number, guards: Partial<Record<CsGuardId, boolean>>): CsInput {
  const list = getJetSystemList(csVariant(mode));
  const seq = csSequence(list, mode);
  const on: Record<string, boolean> = {};
  for (const s of seq.slice(0, n)) if (s.act !== 'arm' && s.act !== 'press') on[s.id] = s.on;
  const run = (k: 'engL' | 'engR') => (seq.slice(0, n).some((s) => s.id === k && s.on) ? 'run' : 'off') as 'run' | 'off';
  return {
    list, checklist: getJetChecklist(csVariant(mode)).startup, mode,
    sys: { ...CS_DARK, on, engines: { L: run('engL'), R: run('engR') }, apuReady: !!on.apu, cartReady: !!on.aircart },
    guards, held: null, park: true, cautionReset: false,
  };
}
const cover = (inp: CsInput) => { const v = csView(inp); return { v, next: csCoverNext(v, inp) }; };
const idx = (mode: CsMode, id: string) => csSequence(getJetSystemList(csVariant(mode)), mode).findIndex((s) => s.id === id && s.on);

for (const mode of ['apu', 'gndAir'] as const) {
  test(`${mode}: step 2 (1b) shows no NEXT, guards untouched or lifted`, () => {
    for (const g of [{}, { engL: false, engR: false }, { engL: true, engR: true, apuGuard: true }]) {
      const { v, next } = cover(at(mode, 1, g));
      assert.equal(v.checklist?.index, 2);
      assert.equal(v.checklist?.code, '1b');
      assert.equal(v.live, false, 'engines not live yet');
      assert.equal(next, null, JSON.stringify(g));
    }
  });

  test(`${mode}: L ENG guard closed with L ENG next shows NEXT ${mode === 'apu' ? '4b' : '5c'}; lifted shows none`, () => {
    const n = idx(mode, 'engL');
    for (const g of [{}, { engL: false }]) {
      const { v, next } = cover(at(mode, n, { ...g, apuGuard: true, engR: true }));
      assert.equal(v.next?.id, 'engL');
      const code = mode === 'apu' ? '4b' : '5c';
      assert.equal(v.checklist?.code, code);
      assert.equal(next, code);
    }
    assert.equal(cover(at(mode, n, { engL: true })).next, null, 'guard up: the badge is in the open');
  });

  test(`${mode}: no pre-start step outside a guard ever names NEXT; complete board names nothing`, () => {
    const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
    const guarded = new Set(['engL', 'engR', ...(mode === 'apu' ? ['apu', 'apuGuard'] : [])]);
    for (let n = 0; n <= N; n++) {
      const { v, next } = cover(at(mode, n, {}));
      if (!v.next || !guarded.has(v.next.id)) assert.equal(next, null, `step ${n + 1} ${v.next?.id}`);
      else assert.equal(next, v.checklist?.code);
    }
  });
}

test('apu: APU ARM next with its cover down shows the code on the cover', () => {
  const n = csSequence(getJetSystemList(csVariant('apu')), 'apu').findIndex((s) => s.act === 'arm');
  const { v, next } = cover(at('apu', n, {}));
  assert.equal(v.next?.id, 'apuGuard');
  assert.equal(next, v.checklist?.code);
  assert.equal(cover(at('apu', n, { apuGuard: true })).next, null);
});
