// Meghan's concept sheet panels 4, 5 and 8, ported: pamphlet section codes cover every step in both start modes and
// agree with the switch badges and the checklist card; the host pamphlet renders her markup exactly (APU); MASTER
// CAUTION is lit with power until pressed (press to reset); SEAT BELT lamp; named cue hooks for Dan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getJetChecklist, getJetSystemList } from '../src/audio/jetColdStart.js';
import { CS_DARK, csSequence, csTap, csVariant, csView, type CsInput, type CsMode } from '../src/packs/carrier-jet/coldStart.ts';
import { CJ_CHECKLIST_PLAN, ckItems } from '../src/packs/carrier-jet/checklistPlan.ts';
import { ckAlign, ckPlan, ckTitle } from '../src/packs/carrier-jet/checklistModes.ts';
import { CJ_HOST_CUES, hostCueFor } from '../src/packs/carrier-jet/hostCues.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

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
const BLOCK: Record<CsMode, string[]> = { apu: ['apu', 'apuGuard'], gndAir: ['aircart', 'crossbleed'] };

for (const mode of ['apu', 'gndAir'] as const) {
  test(`${mode}: pamphlet codes cover every step exactly once, in order, 9 sections in 3 phases`, () => {
    const seq = csSequence(getJetSystemList(csVariant(mode)), mode);
    const items = ckAlign(mode, seq.map((s) => s.key));
    assert.ok(items, `${mode}: plan matches Dan's sequence 1:1`);
    assert.equal(items!.length, seq.length);
    assert.equal(new Set(items!.map((i) => i.code)).size, seq.length, 'codes unique');
    const plan = ckPlan(mode);
    assert.deepEqual(plan.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(plan.map((s) => s.phase), ['PRE-START', 'PRE-START', 'START', 'START', 'START', 'START', 'BEFORE TAXI', 'BEFORE TAXI', 'BEFORE TAXI']);
    for (const it of items!) {
      assert.match(it.code, /^[1-9][a-z]$/);
      assert.ok(['ON', 'OFF', 'HOLD TO RUN', 'IDLE', 'PRESS', 'LIFT', 'CLOSE'].includes(it.action), it.action);
    }
    assert.equal(ckTitle(mode), `NORMAL PROCEDURES · COLD START (${mode === 'apu' ? 'APU' : 'GND AIR'})`);
  });

  test(`${mode}: at every step the current code is on its control's badge, the card and the pamphlet agree`, () => {
    const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
    for (let n = 0; n < N; n++) {
      const v = csView(after(mode, n));
      const st = v.next!;
      const code = v.codes[n];
      const badge = BLOCK[mode].includes(st.id) ? (mode === 'apu' ? v.apu.step : v.gndAir.steps[st.id as 'aircart' | 'crossbleed']) : v.switches[st.id]?.step;
      assert.equal(badge, code, `${mode} step ${n + 1} (${st.key})`);
      assert.equal(v.checklist?.code, code, 'card = badge');
      assert.equal(ckItems(ckPlan(mode))[n].code, code, 'pamphlet line = badge');
      if (!BLOCK[mode].includes(st.id) && st.id !== 'masterCaution') assert.match(v.switches[st.id].ariaLabel, new RegExp(`, step ${code[0]} ${code[1]}, next$`));
    }
  });
}

test('APU plan is Meghan\'s plan unchanged; switch VoiceOver reads the sheet lines', () => {
  assert.equal(ckPlan('apu'), CJ_CHECKLIST_PLAN);
  const v = csView(after('apu', 6));
  assert.equal(v.apu.step, '3b');
  assert.equal(csView(after('apu', 1)).switches.batt.ariaLabel, 'Battery switch, step 1 a, done');
  assert.equal(csView(after('apu', 13)).apu.step, '6a');
});

async function bundle() {
  const { rolldown } = await import('rolldown');
  const entry = `export { ChecklistPamphlet } from ${JSON.stringify(join(root, 'src/skins/carrier-jet/concept/ChecklistPamphlet.tsx'))};
export { MasterCaution } from ${JSON.stringify(join(root, 'src/skins/carrier-jet/concept/MasterCaution.tsx'))};
export { SeatBeltLamp } from ${JSON.stringify(join(root, 'src/skins/carrier-jet/concept/SeatBeltLamp.tsx'))};
export { CjPamphlet } from ${JSON.stringify(join(root, 'src/packs/mounts/CjPamphlet.tsx'))};`;
  const b = await rolldown({
    input: 'cjp-entry',
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [{
      name: 'entry-and-empty-css',
      resolveId: (id: string) => (id === 'cjp-entry' ? '\0cjp-entry' : /\.(css|woff2|svg)$/.test(id) ? '\0so-empty' : null),
      load: (id: string) => (id === '\0cjp-entry' ? entry : id === '\0so-empty' ? 'export default ""' : null),
    }],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await b.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.cjp-test-'));
  const file = join(dir, 'm.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  return mod as Record<string, (p: unknown) => unknown>;
}

test('host pamphlet = Meghan\'s ChecklistPamphlet markup (APU, every step, both sizes); GND AIR draws its own sections', async () => {
  const m = await bundle();
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const r = (c: unknown, p: object) => renderToStaticMarkup(React.createElement(c as never, p as never));
  for (let cursor = 0; cursor < 21; cursor++) for (const size of ['wide', 'narrow'] as const) {
    assert.equal(r(m.CjPamphlet, { plan: CJ_CHECKLIST_PLAN, title: ckTitle('apu'), cursor, size }), r(m.ChecklistPamphlet, { cursor, size }), `cursor ${cursor} ${size}`);
  }
  // GND AIR mid-sequence (crossbleed open = 4a): START phase sections, done lines checked, current backlit
  const h = r(m.CjPamphlet, { plan: ckPlan('gndAir'), title: ckTitle('gndAir'), cursor: 8, size: 'narrow' });
  assert.match(h, /COLD START \(GND AIR\)/);
  assert.match(h, /aria-label="Step 4 a, Crossbleed valve, ON, current step" aria-current="step"/);
  assert.match(h, /aria-label="Step 3 d, Right throttle, IDLE, done"/);
  assert.match(h, /GND AIR SECURE/);
  assert.doesNotMatch(h, /POWER<\/h4>/, 'pre-start sections are on their own tab');
  assert.match(h, /<span class="ckp-dots"><\/span>/);
  // dot leaders sit inside the aria-hidden line
  assert.ok([...h.matchAll(/<div class="ckp-line" aria-hidden="true">/g)].length >= 10);
  // narrow size: actions at 11px (concept.css), the 773 floor
  assert.match(src('src/skins/carrier-jet/concept/concept.css'), /\.ckp\[data-size='narrow'\] \.ckp-line, \.ckp\[data-size='narrow'\] \.ckp-act \{ font-size: 11px;/);
  assert.match(src('src/packs/mounts/CjColdStart.tsx'), /<CjPamphlet plan=\{plan\} title=\{ckTitle\(mode\)\} cursor=\{view\.cursor\} size=\{size\} \/>/);
  assert.match(src('src/packs/mounts/CarrierJetMount.tsx'), /cold\.render\.shelf\(layout === 'board' \? 'wide' : 'narrow'\)/);

  // MASTER CAUTION and SEAT BELT parts as the mount passes them
  const lit = r(m.MasterCaution, { lit: true, step: '9a' });
  assert.match(lit, /data-lit="true"/);
  assert.match(lit, /aria-label="Master caution, lit, press to reset, step 9 a"/);
  assert.match(r(m.MasterCaution, { lit: false }), /aria-label="Master caution, no cautions"/);
  assert.match(r(m.SeatBeltLamp, { on: true }), /aria-label="Seat belt sign, on"/);
  assert.match(r(m.SeatBeltLamp, { on: false }), /aria-label="Seat belt sign, off"/);
});

test('MASTER CAUTION: dark without power, lit with power, press resets it (step 9a done, light out)', () => {
  for (const mode of ['apu', 'gndAir'] as const) {
    const N = csSequence(getJetSystemList(csVariant(mode)), mode).length;
    assert.equal(csView(after(mode, 0)).caution.lit, false, 'no power, dark');
    assert.equal(csView(after(mode, 1)).caution.lit, true, 'battery on: lit');
    const pre = after(mode, N - 1);
    const v = csView(pre);
    assert.equal(v.next?.key, 'masterCaution');
    assert.equal(v.caution.lit, true);
    assert.equal(v.caution.step, '9a');
    assert.equal(v.switches.masterCaution.cue, 'next');
    // press → the host's onToggle(masterCaution, momentary) → csTap → set + cautionReset
    const it = csTap('masterCaution', true, pre);
    assert.deepEqual(it.type, 'set');
    const reset = csView({ ...pre, cautionReset: true });
    assert.equal(reset.caution.lit, false, 'light out');
    assert.equal(reset.caution.step, undefined);
    assert.equal(reset.complete, true);
  }
  const tsx = src('src/packs/mounts/CjColdStart.tsx');
  assert.match(tsx, /<MasterCaution lit=\{view\.caution\.lit\} step=\{view\.caution\.step\} onPress=\{\(\) => onToggle\('masterCaution', 'momentary'\)\} \/>/);
  assert.match(tsx, /if \(it\.system === 'masterCaution'\) setCautionReset\(true\);/);
  const css = src('src/packs/mounts/carrier-jet-v2.css');
  assert.match(css, /\.cjcs-shelf\[data-mc\] \.cjp-cell:has\(> \.cjp-toggle\[data-sys='masterCaution'\]\) > \* \{ visibility: hidden; \}/);
});

test('SEAT BELT lamp takes the guarded SHUTDOWN slot with the cold start on (panel 6); cue hooks for Dan', () => {
  const mount = src('src/packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /const sbLamp = sdShow && vp\.dock && spds && coldOn \?/);
  assert.match(mount, /<SeatBeltLamp on=\{cold\.seatbelt\} \/>/);
  assert.match(mount, /const shutdownGuard = sdShow && vp\.dock && !sbLamp \?/);
  assert.match(src('src/packs/mounts/carrier-jet-v2.css'), /\.rev-dock:has\(> \.cjm-sbl\) > \.rev-stop \{ visibility: hidden !important; \}/);
  assert.deepEqual(CJ_HOST_CUES, { seatbelt: 'seatbeltTone', oxygen: 'o2Chimes' });
  assert.equal(hostCueFor('seatbelt', true), 'seatbeltTone');
  assert.equal(hostCueFor('oxygen', true), 'o2Chimes');
  assert.equal(hostCueFor('seatbelt', false), null);
  assert.equal(hostCueFor('batt', true), null);
  assert.match(src('src/packs/mounts/CjColdStart.tsx'), /const hc = hostCueFor\(id, v\);\s*if \(hc\) cue\(hc as unknown as JetCue\);/);
});
