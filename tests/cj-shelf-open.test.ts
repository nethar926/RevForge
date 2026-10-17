// Shelf reachable at all times (Wilson): after both engines run (step 12) the shelf stays open so steps 13..N (incl.
// the step-14 APU-off cue) can be reached; SHELF toggles in Park and Drive, before or after the start. Auto-close is
// edge-only: once on the shift into Drive (even mid-sequence) and once on completing in Park; SHELF reopens it and it
// stays open. Header reads COLD START; locked-by-Park switches with a step ahead carry a PARK legend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
    // drive away: the shift into Drive closes once…
    h.tick(after(mode, N, false));
    assert.equal(h.shelf, 'closed');
    // …and SHELF reopens it while driving, where it stays
    h.press(); assert.equal(h.shelf, 'open', 'SHELF reopens while driving');
    for (let i = 0; i < 5; i++) h.tick(after(mode, N, false));
    assert.equal(h.shelf, 'open');
    h.press(); assert.equal(h.shelf, 'closed', 'and closes it again');
  });

  test(`${mode}: shift to D mid-sequence tucks the shelf once; SHELF reopens it and it stays open while driving`, () => {
    for (const n of [0, 5, 12, 13]) {
      const h = host('open');
      h.tick(after(mode, n, true));
      assert.equal(h.shelf, 'open', `open in Park at step ${n + 1}`);
      h.tick(after(mode, n, false)); // Park → D
      assert.equal(h.shelf, 'closed', `tucked once on the shift to D at step ${n + 1}`);
      h.press(); assert.equal(h.shelf, 'open', `SHELF reopens in D at step ${n + 1}`);
      for (let i = 0; i < 6; i++) h.tick(after(mode, n, false));
      assert.equal(h.shelf, 'open', 'stays open while driving');
      // a drive-away auto-finish completing while driving doesn't close it either
      const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
      h.tick(after(mode, N, false)); assert.equal(h.shelf, 'open', 'completion while driving: stays open');
      h.press(); assert.equal(h.shelf, 'closed', 'until the user closes it');
    }
    // back in Park with steps left: nothing closes it repeatedly
    const h = host();
    h.tick(after(mode, 5, false)); h.tick(after(mode, 5, true));
    h.press(); for (let i = 0; i < 6; i++) h.tick(after(mode, 5, true));
    assert.equal(h.shelf, 'open');
  });
}

test('shelfAutoClose: edges only (shift into D, completion in Park), or no cold start; never repeatedly', () => {
  for (const pc of [true, false]) for (const c of [true, false]) {
    assert.equal(shelfAutoClose({ park: true, complete: pc }, { park: false, complete: c, on: true }), true, 'shift to D');
    assert.equal(shelfAutoClose({ park: false, complete: pc }, { park: false, complete: c, on: true }), false, 'driving: never');
    assert.equal(shelfAutoClose({ park: false, complete: pc }, { park: true, complete: pc, on: true }), false, 'back in Park: no close');
  }
  assert.equal(shelfAutoClose({ park: true, complete: false }, { park: true, complete: false, on: true }), false, 'steps left in Park');
  assert.equal(shelfAutoClose({ park: true, complete: false }, { park: true, complete: true, on: true }), true, 'completion in Park');
  assert.equal(shelfAutoClose({ park: true, complete: true }, { park: true, complete: true, on: true }), false);
  assert.equal(shelfAutoClose({ park: true, complete: false }, { park: true, complete: false, on: false }), true);
  assert.equal(shelfToggle('closed'), 'opening');
  assert.equal(shelfToggle('open'), 'closed');
  assert.equal(shelfToggle('opening'), 'closed');
});

test('PARK legend: only on a switch locked for Park with its step ahead; CRANK / RUN / CLOSED / OPEN keep priority', () => {
  for (const mode of ['apu', 'gndAir'] as const) {
    const d0 = csView(after(mode, 0, false));
    assert.equal(d0.switches.batt.legend, 'PARK');
    assert.equal(d0.switches.batt.disabledReason, 'Available in Park');
    assert.equal(d0.switches.canopy.legend, 'OPEN', 'canopy keeps OPEN');
    assert.equal(d0.switches.engL.legend, 'PARK');
    const p0 = csView(after(mode, 0, true));
    assert.ok(Object.values(p0.switches).every((v) => v.legend !== 'PARK'), 'never in Park');
    // after step 12: running engines read RUN, done switches keep ON / OFF, switches with steps ahead read PARK
    const d12 = csView(after(mode, 12, false));
    assert.equal(d12.switches.engL.legend, 'RUN');
    assert.equal(d12.switches.engR.legend, 'RUN');
    assert.equal(d12.switches.batt.legend, undefined, 'done switch: ON');
    assert.equal(d12.switches.seatbelt.legend, 'PARK');
    assert.equal(d12.switches.masterCaution.legend, 'PARK');
    const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
    const dn = csView(after(mode, N, false));
    assert.deepEqual(Object.entries(dn.switches).filter(([, v]) => v.legend === 'PARK').map(([k]) => k), [], 'complete: no PARK');
  }
});

async function bundleParts() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { rolldown } = await import('rolldown');
  const b = await rolldown({
    input: join(root, 'src/skins/carrier-jet/parts/index.ts'),
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [{ name: 'empty-css', resolveId: (id: string) => (/\.(css|woff2|svg)$/.test(id) ? '\0so-empty' : null), load: (id: string) => (id === '\0so-empty' ? 'export default ""' : null) }],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await b.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.so-test-'));
  const file = join(dir, 'm.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  return mod as Record<string, unknown>;
}

test('shelf header reads COLD START (amber engraving), and a locked switch draws PARK at the 11-unit floor', async () => {
  const parts = await bundleParts();
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const inp = after('apu', 0, false);
  const v = csView(inp);
  const h = renderToStaticMarkup(React.createElement(parts.SwitchShelf as never, { systems: inp.list, switches: v.switches, onToggle: () => {}, mode: 'apu', open: 'open', guards: { engL: false, engR: false } } as never));
  assert.match(h, /<span class="cjp-eng cjp-eng--amber">COLD START<\/span>/);
  assert.doesNotMatch(h, /PARK ONLY/);
  const batt = h.slice(h.lastIndexOf('<button', h.indexOf('data-sys="batt"')));
  const btn = batt.slice(0, batt.indexOf('</button>'));
  assert.match(btn, /aria-disabled="true"/);
  assert.match(btn, /data-text-floor="11"[^>]*>PARK<\/text>/);
});

test('mount: SHELF has no Park gate, the level-triggered close is gone, the key never reads PARK', () => {
  const src = readFileSync(new URL('../src/packs/mounts/CjColdStart.tsx', import.meta.url), 'utf8');
  const toggle = src.slice(src.indexOf('const toggleShelf'), src.indexOf('const onToggle'));
  assert.doesNotMatch(toggle, /park/);
  assert.match(toggle, /setShelf\(shelfToggle\)/);
  assert.doesNotMatch(src, /!park \|\| live/);
  assert.match(src, /shelfAutoClose\(prev, \{ park, complete: view\.complete, on \}\)/);
  // the SHELF key never reads PARK (the APU START switch legend may: Meghan's ApuBlock legend prop, apu.parkLegend)
  assert.doesNotMatch(src.slice(src.indexOf('const shelfKey'), src.indexOf('const pullQs')), /'PARK'/);
  assert.equal([...src.matchAll(/'PARK'/g)].length, 1);
  assert.match(src, /legend=\{view\.apu\.parkLegend \? 'PARK' : undefined\}/);
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
