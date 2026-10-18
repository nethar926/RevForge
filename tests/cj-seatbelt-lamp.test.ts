// SEAT BELT lamp v2 (Johnson): its own dock spot whenever the cold start is on — pre-start, during the start and
// running, Park and Drive — unlit when the sign is off, backlit when on; cold start off keeps the guarded SHUTDOWN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bankRowOn, sbLampAria, sbLampShown, sdGuardShown } from '../src/packs/carrier-jet/seatbeltLamp.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const mount = src('src/packs/mounts/CarrierJetMount.tsx');
const css = src('src/packs/mounts/carrier-jet-v2.css');

async function lampPart() {
  const { rolldown } = await import('rolldown');
  const b = await rolldown({
    input: join(root, 'src/skins/carrier-jet/concept/SeatBeltLamp.tsx'),
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await b.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.sbl-test-'));
  const file = join(dir, 'm.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  return mod.SeatBeltLamp as (p: { on: boolean }) => unknown;
}
async function renderLamp(on: boolean) {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const SeatBeltLamp = await lampPart();
  // the mount's wrapper, as in CarrierJetMount (role img + our label; Meghan's part inside, aria-hidden)
  return renderToStaticMarkup(
    React.createElement('div', { className: 'cjm-sbl', role: 'img', 'aria-label': sbLampAria(on) },
      React.createElement('div', { 'aria-hidden': 'true' }, React.createElement(SeatBeltLamp as never, { on } as never))),
  );
}

test('shown on every cold-start dock: no engine-running or Park input; guarded SHUTDOWN only with the cold start off', () => {
  assert.equal(sbLampShown({ coldOn: true, spds: true, docked: true }), true);
  assert.equal(sbLampShown({ coldOn: false, spds: true, docked: true }), false, 'cold start off: today\'s behaviour');
  assert.equal(sbLampShown({ coldOn: true, spds: true, docked: false }), false);
  assert.equal(sdGuardShown(true, { coldOn: true, spds: true, docked: true }), false, 'panel 6');
  assert.equal(sdGuardShown(true, { coldOn: false, spds: true, docked: true }), true);
  assert.equal(sdGuardShown(false, { coldOn: false, spds: true, docked: true }), false);
  // wiring: the lamp condition is the cold-start dock only (not props.running / sdShow / park)
  assert.match(mount, /const sbCtx = \{ coldOn, spds, docked: !!vp\.dock \};\s*const sbLamp = sbLampShown\(sbCtx\) \?/);
  assert.match(mount, /<div className="cjm-bank-ab">\{guard\}<\/div>\s*\{row && sbLamp\}/, 'in the bottom row, right of AFTERBURNER');
  assert.doesNotMatch(mount, /createPortal\(sbLamp/);
  assert.equal(bankRowOn({ coldOn: true, spds: true, docked: true }), true, 'row exactly where the lamp shows');
  assert.equal(bankRowOn({ coldOn: false, spds: true, docked: true }), false);
  assert.equal(bankRowOn({ coldOn: true, spds: false, docked: true }), false, 'phones: the old bank');
  assert.match(mount, /data-sd-off=\{sdShow \|\| undefined\} role="img" aria-label=\{sbLampAria\(cold\.seatbelt\)\}/);
  assert.match(src('src/packs/mounts/CjColdStart.tsx'), /seatbelt: !!sys\.on\.seatbelt,/);
});

test('pre-start: dark when the sign is off; lit when on; VoiceOver "Seat belt light, off / on"', async () => {
  const off = await renderLamp(false);
  assert.match(off, /^<div class="cjm-sbl" role="img" aria-label="Seat belt light, off"><div aria-hidden="true"><div class="sbl" role="img"/);
  assert.doesNotMatch(off, /data-on/);
  const on = await renderLamp(true);
  assert.match(on, /aria-label="Seat belt light, on"/);
  assert.match(on, /<div class="sbl" data-on="true"/);
  assert.match(on, /FASTEN<\/span><span>SEAT BELT/);
  // legend ≥ 11px (Meghan's concept.css), backlit only when on
  const concept = src('src/skins/carrier-jet/concept/concept.css');
  assert.match(concept, /\.sbl-lens \{[^}]*font: 700 11px\/14px/);
  // Meghan's 71b887a: lit reads as backlit (warm lens glow, legend bloom), unlit unchanged
  assert.match(concept, /\.sbl\[data-on\] \.sbl-lens \{[^}]*color: #fff6dc;[^}]*text-shadow: 0 0 3px/);
});

test('spot: the one bottom row, between AFTERBURNER and SHELF (Meghan, Oct 18); Shutdown chip out of the row while running', () => {
  assert.doesNotMatch(css, /\.cjm-sbl \{\s*position: absolute/, 'a row item, not an absolute overlay');
  assert.match(css, /\.rev-dock > \.cjm-bank\[data-cjm-v2\]\[data-cjm-row\]:is\(\[data-rf-layout='board'\], \[data-rf-layout='window'\]\) > \*,/);
  // Shutdown chip hidden only where panel 6 removes it (running) and with no hole in the row; stopped it stays the
  // Ignition / Resume path, a row item
  assert.match(css, /\.rev-dock:has\(> \.cjm-bank > \.cjm-sbl\[data-sd-off\]\) > \.rev-stop \{ display: none !important; \}/);
  assert.doesNotMatch(css, /\.rev-dock:has\(> \.cjm-sbl/, 'no dead rule for the old dock-child lamp (William gate)');
  assert.doesNotMatch(css, /\.cjm-sbl:not\(\[data-sd-off\]\)/, 'no dead stopped-position rule (William gate)');
});

test('EMER STOP: the lamp stays visible in its spot and goes dark (EMER STOP switches the seat belt off)', async () => {
  const { JET_POWERED } = await import('../src/audio/jetColdStart.js');
  assert.ok((JET_POWERED as readonly string[]).includes('seatbelt'), 'emergency stop powers the seat belt sign down');
  // shown does not depend on the engine running or the seat belt: still on the dock after the stop
  assert.equal(sbLampShown({ coldOn: true, spds: true, docked: true }), true);
  assert.equal(sbLampAria(false), 'Seat belt light, off');
  // the mount keys lit / dark on cold.seatbelt only, and keeps data-sd-off on sdShow (host running) → same CSS spot
  const mount = readFileSync(join(root, 'src/packs/mounts/CarrierJetMount.tsx'), 'utf8');
  assert.match(mount, /<SeatBeltLamp on=\{cold\.seatbelt\} \/>/);
  assert.match(mount, /const sdShow = sdShown\(\{ v2, tesla, docked: !!vp\.dock, running: props\.running \}\);/);
  // no stopped-position CSS: the lamp keeps the spot it had before the stop (preview: cj-port-polish/emer-stop-seatbelt-*.png)
  const css = readFileSync(join(root, 'src/packs/mounts/carrier-jet-v2.css'), 'utf8');
  assert.doesNotMatch(css, /\.cjm-sbl:not\(\[data-sd-off\]\)/);
});
