// Shelf reachable at all times (Wilson): after both engines run (step 12) the shelf stays open so steps 13..N (incl.
// the step-14 APU-off cue) can be reached; SHELF toggles in Park and Drive, before or after the start; the only
// auto-close is the edge into a completed sequence, and SHELF reopens it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getJetChecklist, getJetSystemList } from '../src/audio/jetColdStart.js';
import { CS_DARK, csSequence, csVariant, csView, shelfAutoClose, shelfToggle, type CsInput, type CsMode } from '../src/packs/carrier-jet/coldStart.ts';

type Shelf = 'closed' | 'opening' | 'open';
/** Inputs with the first `n` steps of `mode` done (n = seq length → complete). */
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
/** The mount's shelf host, reduced to the pure pieces it calls (shelfAutoClose on every change, shelfToggle on SHELF). */
function host(shelf: Shelf = 'closed') {
  let prev: { park: boolean; complete: boolean } | null = null;
  return {
    get shelf() { return shelf; },
    tick(inp: CsInput) {
      const cur = { park: inp.park, complete: csView(inp).complete, on: true };
      if (shelfAutoClose(prev ?? cur, cur)) shelf = 'closed';
      prev = { park: cur.park, complete: cur.complete };
      if (shelf === 'opening') shelf = 'open';
    },
    press() { shelf = shelfToggle(shelf); if (shelf === 'opening') shelf = 'open'; },
  };
}

for (const mode of ['apu', 'gndAir'] as const) {
  test(`${mode}: shelf stays open after step 12 (both engines running) through the remaining steps, step-14 cue reachable`, () => {
    const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
    const h = host('open');
    for (let n = 0; n <= 12; n++) h.tick(after(mode, n));
    const v12 = csView(after(mode, 12));
    assert.equal(v12.live, true, 'both engines running after step 12');
    assert.equal(v12.complete, false);
    assert.equal(h.shelf, 'open', 'no auto-close at step 12');
    for (let n = 13; n < N; n++) {
      h.tick(after(mode, n));
      assert.equal(h.shelf, 'open', `still open with step ${n + 1} next`);
    }
    // step 14 is current right after 13 and its block is cued
    const v13 = csView(after(mode, 13));
    assert.equal(v13.cursor + 1, 14);
    if (mode === 'apu') assert.equal(v13.apu.cue, 'next');
    else assert.equal(v13.gndAir.cues.crossbleed, 'next');
    // SHELF still toggles mid-sequence after step 12
    h.press(); assert.equal(h.shelf, 'closed');
    h.press(); assert.equal(h.shelf, 'open');
    h.tick(after(mode, 13)); assert.equal(h.shelf, 'open');
  });

  test(`${mode}: after completion SHELF reopens the shelf and it stays open, in Park and while driving`, () => {
    const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
    const h = host('open');
    h.tick(after(mode, N - 1));
    h.tick(after(mode, N));
    assert.equal(csView(after(mode, N)).complete, true);
    assert.equal(h.shelf, 'closed', 'the one auto-close: on completion');
    h.press(); assert.equal(h.shelf, 'open', 'SHELF reopens after completion');
    for (let i = 0; i < 5; i++) h.tick(after(mode, N));
    assert.equal(h.shelf, 'open', 'and it stays open');
    // drive away: the Park → Drive edge after completion closes once…
    h.tick(after(mode, N, false));
    assert.equal(h.shelf, 'closed');
    // …and SHELF reopens it while driving, where it stays
    h.press(); assert.equal(h.shelf, 'open', 'SHELF reopens while driving');
    for (let i = 0; i < 5; i++) h.tick(after(mode, N, false));
    assert.equal(h.shelf, 'open');
    h.press(); assert.equal(h.shelf, 'closed', 'and closes it again');
  });

  test(`${mode}: driving before / mid start: SHELF toggles and nothing auto-closes while steps are left`, () => {
    for (const n of [0, 5, 12]) {
      const h = host();
      h.tick(after(mode, n, true));
      h.tick(after(mode, n, false)); // Park → Drive mid-sequence: no close
      h.press(); assert.equal(h.shelf, 'open', `SHELF opens in Drive at step ${n + 1}`);
      h.tick(after(mode, n, false)); h.tick(after(mode, n, true)); h.tick(after(mode, n, false));
      assert.equal(h.shelf, 'open');
    }
  });
}

test('shelfAutoClose: never with steps left; only the completion / Park→Drive-after-completion edges, or no cold start', () => {
  for (const park of [true, false]) for (const pp of [true, false]) for (const pc of [true, false]) {
    assert.equal(shelfAutoClose({ park: pp, complete: pc }, { park, complete: false, on: true }), false);
  }
  assert.equal(shelfAutoClose({ park: true, complete: false }, { park: true, complete: true, on: true }), true);
  assert.equal(shelfAutoClose({ park: true, complete: true }, { park: true, complete: true, on: true }), false);
  assert.equal(shelfAutoClose({ park: true, complete: true }, { park: false, complete: true, on: true }), true);
  assert.equal(shelfAutoClose({ park: false, complete: true }, { park: false, complete: true, on: true }), false);
  assert.equal(shelfAutoClose({ park: false, complete: true }, { park: true, complete: true, on: true }), false);
  assert.equal(shelfAutoClose({ park: true, complete: false }, { park: true, complete: false, on: false }), true);
  assert.equal(shelfToggle('closed'), 'opening');
  assert.equal(shelfToggle('open'), 'closed');
  assert.equal(shelfToggle('opening'), 'closed');
});

test('mount: SHELF has no Park gate, the level-triggered close is gone, the key never reads PARK', () => {
  const src = readFileSync(new URL('../src/packs/mounts/CjColdStart.tsx', import.meta.url), 'utf8');
  const toggle = src.slice(src.indexOf('const toggleShelf'), src.indexOf('const onToggle'));
  assert.doesNotMatch(toggle, /park/);
  assert.match(toggle, /setShelf\(shelfToggle\)/);
  assert.doesNotMatch(src, /!park \|\| live/);
  assert.match(src, /shelfAutoClose\(prev, \{ park, complete: view\.complete, on \}\)/);
  assert.doesNotMatch(src, /'PARK' :/);
  assert.doesNotMatch(src, /aria-disabled=\{!park/);
});

test('APU START step label lifted clear of the lever ball (mount CSS, same size)', () => {
  const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-v2.css', import.meta.url), 'utf8');
  assert.match(css, /\.cjp-apu \.cjp-toggle\[data-sys='apu'\] svg g\[data-eng\]:has\(> text\[y='36'\]\) \{ transform: translateY\(-6px\); \}/);
  // geometry: ball up at cy 36 r 4.6 → top 31.4; label baseline 36-6 = 30 sits above it; START label baseline 16
  const base = 36 - 6, ballTop = 30 + 21 - 15 - 4.6; // Bat at y 30: cy 21, L 15
  assert.ok(base < ballTop, `label baseline ${base} above ball top ${ballTop}`);
  assert.ok(base - 8 > 16, 'cap height clear of the START label');
});
