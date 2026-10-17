// SEAT BELT lamp v2 (Johnson): its own dock spot whenever the cold start is on — pre-start, during the start and
// running, Park and Drive — unlit when the sign is off, backlit when on; cold start off keeps the guarded SHUTDOWN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sbLampAria, sbLampShown, sdGuardShown } from '../src/packs/carrier-jet/seatbeltLamp.ts';

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
  assert.match(mount, /\{sbLamp && vp\.dock && createPortal\(sbLamp, vp\.dock\)\}/);
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
  assert.match(concept, /\.sbl\[data-on\] \.sbl-lens \{[^}]*color: #f4f1e6/);
});

test('spot: dock row 2 between the SHELF key and the Shutdown slot, clear of both at 1256 (board) and 773 (window)', () => {
  assert.match(css, /> \.cjm-sbl \{\s*position: absolute; left: calc\(var\(--cjv3-plate\) \+ 8px \+ var\(--cjv3-shelf\) \+ \(var\(--cjv3-guard\) - var\(--cjv3-shelf\) - 108\.67px - 104px\) \/ 2\);\s*bottom: -3px;/);
  for (const [name, plate] of [['1256 board', 107], ['773 window', 89]] as const) {
    const guard = 343, shelf = 88, key = 80, stopW = 108.67, lamp = 104;
    const left = plate + 8 + shelf + (guard - shelf - stopW - lamp) / 2;
    const keyRight = plate + 8 + key, stopLeft = plate + 8 + guard - stopW;
    assert.ok(left - keyRight >= 16, `${name}: ${left - keyRight}px clear of SHELF`);
    assert.ok(stopLeft - (left + lamp) >= 16, `${name}: ${stopLeft - left - lamp}px clear of the Shutdown slot`);
  }
  // Shutdown chip hidden only where panel 6 removes it (running); stopped it stays the Ignition / Resume path
  assert.match(css, /\.rev-dock:has\(> \.cjm-sbl\[data-sd-off\]\) > \.rev-stop \{ visibility: hidden !important; \}/);
  assert.doesNotMatch(css, /\.rev-dock:has\(> \.cjm-sbl\) > \.rev-stop/);
  // a host chip in the gap (demo Hold to rev): the Shutdown slot while running, else after the EMER STOP group
  assert.match(css, /:has\(> \.rev-chip:not\(\.rev-stop\)\) > \.cjm-sbl\[data-sd-off\] \{\s*left: calc\(var\(--cjv3-plate\) \+ 8px \+ var\(--cjv3-guard\)\); translate: -100% 0;/);
  assert.match(css, /:has\(> \.rev-chip:not\(\.rev-stop\)\) > \.cjm-sbl:not\(\[data-sd-off\]\) \{\s*position: relative;[^}]*order: 4;/);
});
