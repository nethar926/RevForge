// Two fixes from the 83d58c7 steering: (1) in Drive the APU START lock reads PARK (not START) while an APU step is
// still ahead, as the switches do; (2) the checklist card counts the badge sequence (step 14 of 21 when the board
// cues 14), not Dan's 15-line startup list ("step 12 of 15").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getJetChecklist, getJetSystemList } from '../src/audio/jetColdStart.js';
import { CS_DARK, CS_PARK_REASON, csSequence, csVariant, csView, type CsInput, type CsMode } from '../src/packs/carrier-jet/coldStart.ts';

function after(mode: CsMode, n: number, park = true): CsInput {
  const list = getJetSystemList(csVariant(mode));
  const seq = csSequence(list, mode);
  const on: Record<string, boolean> = {};
  let cautionReset = false;
  for (const s of seq.slice(0, n)) {
    if (s.act === 'arm') continue;
    if (s.act === 'press') { cautionReset = true; continue; }
    on[s.id] = s.on;
  }
  const engRun = (k: 'engL' | 'engR') => (seq.slice(0, n).some((s) => s.id === k && s.on) ? 'run' : 'off') as 'run' | 'off';
  return {
    list, checklist: getJetChecklist(csVariant(mode)).startup, mode,
    sys: { ...CS_DARK, on, engines: { L: engRun('engL'), R: engRun('engR') }, apuReady: !!on.apu, cartReady: !!on.aircart },
    guards: { apuGuard: !!on.apu || seq.slice(0, n).some((s) => s.act === 'arm'), engL: true, engR: true }, held: null, park, cautionReset,
  };
}
const N = (mode: CsMode) => csSequence(getJetSystemList(csVariant(mode)), mode).length;

test('fix 1: APU START reads PARK in Drive while the APU-off step (14) is ahead; START / OFF otherwise', () => {
  const seq = csSequence(getJetSystemList('apu'), 'apu');
  const apuOff = seq.findIndex((s) => s.key === 'apu:off');
  assert.equal(apuOff + 1, 14);
  for (let n = 0; n <= N('apu'); n++) {
    const drive = csView(after('apu', n, false));
    assert.equal(drive.apu.disabled, true);
    assert.equal(drive.apu.disabledReason, CS_PARK_REASON);
    assert.equal(!!drive.apu.parkLegend, n <= apuOff, `Drive after ${n} steps`);
    assert.equal(csView(after('apu', n, true)).apu.parkLegend, undefined, `never in Park (${n})`);
  }
  // the screenshot case: step 14 next, driving, APU running → lock + PARK (was lock + START)
  const v = csView(after('apu', apuOff, false));
  assert.equal(v.cursor, apuOff);
  assert.equal(v.apu.start, true);
  assert.equal(v.apu.parkLegend, true);
});

test('fix 1: the mount marks the shelf and the CSS swaps the APU START word for PARK at the legend size', () => {
  const tsx = readFileSync(new URL('../src/packs/mounts/CjColdStart.tsx', import.meta.url), 'utf8');
  assert.match(tsx, /data-apu-park=\{mode === 'apu' && view\.apu\.parkLegend/);
  const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-v2.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-apu-park\] \.cjp-apu \.cjp-toggle\[data-sys='apu'\] g\.cjp-unlit text \{ fill: transparent; \}/);
  assert.match(css, /\[data-apu-park\][^{]*::after \{\s*content: 'PARK';[^}]*font: 700 calc\(11 \/ 60 \* 100cqw\)/);
});

for (const mode of ['apu', 'gndAir'] as const) {
  test(`fix 2 (${mode}): card index / total = the badge sequence at every step`, () => {
    for (let n = 0; n < N(mode); n++) {
      const v = csView(after(mode, n));
      assert.ok(v.checklist, `card at ${n}`);
      assert.equal(v.checklist!.index, v.cursor + 1);
      assert.equal(v.checklist!.total, v.seq.length);
      assert.ok(v.checklist!.text.length > 0);
    }
    assert.equal(csView(after(mode, N(mode))).checklist, null);
    // the reported case: board cues 14 → card says 14 of N (was 12 of 15)
    const v13 = csView(after(mode, 13));
    assert.equal(v13.checklist!.index, 14);
    assert.equal(v13.checklist!.total, N(mode));
  });
}
