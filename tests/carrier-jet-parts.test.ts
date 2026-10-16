import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ACQ_TROUGH, ACQ_LIT, acqLitColor, CJ_SHELF_BOTTOM_ROW_IDS, gpsView, labelLines, nextToggle, pullView, shelfGroups, shelfMetrics, shelfScale,
  SHELF_SLOTS, TOGGLE_MIN, APU_BLOCK_MIN, GND_AIR_MIN, PLATE_MIN, PLATE_MIN_NARROW, RADAR_MIN, RADAR_MIN_NARROW, PULL_MIN, PULL_MIN_NARROW,
  QUICK_START_MIN, BEZEL_KEY_MIN, GPS_RADAR_PLATE_MIN, GPS_RADAR_PLATE_MIN_NARROW,
} from '../src/skins/carrier-jet/parts/tokens.ts';
import { jetSystemListFixture, shelfStateApuStep5, shelfStateCartB4 } from '../src/skins/carrier-jet/parts/gallery/fixtures.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = join(root, 'src/skins/carrier-jet/parts');
const CSS = readFileSync(join(PARTS, 'parts.css'), 'utf8');

// Bundle the real parts for node (rolldown ships with vite), then render with react-dom/server.
let loaded: Promise<{ mod: Record<string, unknown>; render: (C: unknown, p: object) => string; React: typeof import('react') }> | undefined;
function load() {
  loaded ??= (async () => {
    const { rolldown } = await import('rolldown');
    const bundle = await rolldown({
      input: join(PARTS, 'index.ts'),
      external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
      plugins: [{ name: 'empty-css', resolveId: (id: string) => (/\.(css|woff2|svg)$/.test(id) ? '\0cjp-empty' : null), load: (id: string) => (id === '\0cjp-empty' ? 'export default ""' : null) }],
      transform: { jsx: 'react-jsx' },
      logLevel: 'silent',
    } as never);
    const { output } = await bundle.generate({ format: 'esm' });
    const dir = mkdtempSync(join(root, 'node_modules/.cjp-test-'));
    const file = join(dir, 'parts.mjs');
    writeFileSync(file, output[0].code);
    const mod = await import(pathToFileURL(file).href);
    rmSync(dir, { recursive: true, force: true });
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { mod, React, render: (C: unknown, p: object) => renderToStaticMarkup(React.createElement(C as never, p as never)) };
  })();
  return loaded;
}
const noop = () => {};
const tag = (h: string, re: RegExp) => h.match(re)?.[0] ?? '';
const fontSizes = (h: string) => [...h.matchAll(/font-size="([\d.]+)"/g)].map((m) => +m[1]);

/* ------------------------------------------------------------------ GPS */

test('GPS state → bulbs, ACQ and VoiceOver label', () => {
  assert.deepEqual(gpsView('none'), { red: 'off', green: 'off', acq: 'unlit', label: 'GPS off' });
  assert.deepEqual(gpsView('fail'), { red: 'lit', green: 'off', acq: 'unlit', label: 'GPS unavailable' });
  assert.deepEqual(gpsView('acq'), { red: 'off', green: 'pulse', acq: 'lit', label: 'GPS searching' });
  assert.deepEqual(gpsView('live'), { red: 'off', green: 'lit', acq: 'unlit', label: 'GPS live' });
});

test('GpsPlate renders each state: red on top, green below, ACQ always present', async () => {
  const { mod, render } = await load();
  const labels = { none: 'GPS off', fail: 'GPS unavailable', acq: 'GPS searching', live: 'GPS live' } as const;
  for (const gps of ['none', 'fail', 'acq', 'live'] as const) {
    for (const size of ['wide', 'narrow'] as const) {
      const h = render(mod.GpsPlate, { gps, size });
      assert.match(h, new RegExp(`role="img" aria-label="${labels[gps]}"`));
      const red = h.indexOf('data-bulb="red"'), green = h.indexOf('data-bulb="green"');
      assert.ok(red > 0 && green > red, 'red bulb is drawn before (above) green');
      const redLens = tag(h.slice(red), /data-lens="[a-z]+"/), greenLens = tag(h.slice(green), /data-lens="[a-z]+"/);
      assert.equal(redLens, `data-lens="${gps === 'fail' ? 'red' : 'off'}"`, `${gps} red`);
      assert.equal(greenLens, `data-lens="${gps === 'acq' || gps === 'live' ? 'green' : 'off'}"`, `${gps} green`);
      assert.equal(h.includes('cjp-gps-pulse'), gps === 'acq', 'only searching pulses');
      assert.match(h, />ACQ</);
      assert.equal(h.includes('data-acq="lit"'), gps === 'acq');
      assert.equal(h.includes('data-acq="unlit"'), gps !== 'acq');
      if (gps !== 'acq') assert.match(h, /fill="#1f3619"[^>]*filter="url\(#/, 'unlit ACQ is the engraved #1f3619 fill');
      assert.match(h, new RegExp(`viewBox="0 0 ${(size === 'wide' ? PLATE_MIN : PLATE_MIN_NARROW).w} 118"`));
    }
  }
});

test('ACQ lit mix stays >= 4.5:1 on the plate at the pulse trough', () => {
  const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.equal(ACQ_TROUGH, '#88d99e');
  assert.equal(acqLitColor(1), ACQ_LIT);
  assert.ok(cr(ACQ_TROUGH, '#4a5055') >= 4.5, `trough ${cr(ACQ_TROUGH, '#4a5055')}`);
  assert.ok(cr(ACQ_LIT, '#4a5055') >= 6.5);
  // CSS keyframes use the same trough / peak
  assert.match(CSS, /@keyframes cjp-gps-acq \{ from \{ fill: #88d99e; \} to \{ fill: #8dffad; \} \}/);
  assert.match(CSS, /@keyframes cjp-gps-bulb \{ from \{ opacity: 0\.35; \} to \{ opacity: 1; \} \}/);
  assert.match(CSS, /\.cjp-gps-pulse \{ animation: cjp-gps-bulb 500ms cubic-bezier\([^)]*\) infinite alternate; \}/, '1 s period soft fade, no steps');
});

/* ------------------------------------------------------------------ Reduce Motion */

test('Reduce Motion: media query AND [data-rf-reduce-motion] make every part static', () => {
  const media = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce) {'));
  const block = media.slice(0, media.indexOf('\n}\n'));
  for (const sel of ['.cjp-gps-pulse { animation: none; opacity: 0.5; }', '.cjp-acq-fill { animation: none; fill: #8dffad; }', ".cjp-shelf[data-open='opening'] { animation: none; transform: none; }"]) {
    assert.ok(block.includes(sel), `media: ${sel}`);
    assert.ok(CSS.includes(`[data-rf-reduce-motion] ${sel}`), `attr: ${sel}`);
  }
  assert.match(block, /\.cjp-lid, \.cjp-under, \.cjp \.cjp-pull-grip[^{]*\{ transition: none; \}/);
  assert.match(CSS, /\[data-rf-reduce-motion\] \.cjp-lid[^{]*\{ transition: none; \}/);
  // nothing in the parts uses a step / strobe timing, backdrop-filter or a CSS filter that animates
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /steps\(|backdrop-filter|animation:[^;]*\bfilter\b/);
  for (const m of CSS.matchAll(/animation: ([a-z-]+) (\d+)ms/g)) assert.ok(+m[2] >= 300, `${m[1]} slower than 300ms half-period`);
});

/* ------------------------------------------------------------------ toggles */

test('BatToggle: role=switch, aria-checked, lever, lamp and legends per state', async () => {
  const { mod, render } = await load();
  const base = { id: 'batt', label: 'BATT', ariaLabel: 'Battery', onToggle: noop };
  const off = render(mod.BatToggle, { ...base, state: 'off', lit: false });
  assert.match(off, /role="switch" aria-checked="false" aria-label="Battery"/);
  assert.match(off, /data-lever="down"/);
  assert.match(off, /data-lens="off"/);
  assert.match(off, />OFF</);
  const on = render(mod.BatToggle, { ...base, state: 'on', lit: true, step: 1 });
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /data-lever="up"/);
  assert.match(on, /data-lens="green"/);
  assert.match(on, />ON</);
  assert.match(on, />1</);
  assert.match(render(mod.BatToggle, { ...base, state: 'on', lit: false }), /data-lens="off"/, 'unlit on = smoked lamp');
  const mom = render(mod.BatToggle, { ...base, state: 'momentary', lit: true, cue: 'busy' });
  assert.match(mom, /aria-checked="true"/);
  assert.match(mom, /data-lens="amber"/);
  assert.match(mom, />HOLD</);
  assert.match(mom, /data-cue="busy"/);
  const dis = render(mod.BatToggle, { ...base, state: 'off', lit: false, disabled: true, disabledReason: 'Battery first' });
  assert.match(dis, /aria-disabled="true"/);
  const desc = tag(dis, /aria-describedby="([^"]+)"/).split('"')[1];
  assert.ok(desc && dis.includes(`id="${desc}" class="cjp-sr">Battery first<`), 'disabledReason is the description');
  assert.match(dis, />LOCKED</);
  assert.match(dis, /viewBox="0 0 60 96"/, 'disabled still draws the full 60×96 cell');
  assert.doesNotMatch(dis, / disabled=""/, 'focusable: aria-disabled, not disabled');
  assert.equal(nextToggle('off'), 'on');
  assert.equal(nextToggle('on'), 'off');
  assert.equal(nextToggle('momentary'), 'off');
  assert.deepEqual(labelLines('Seat belt sign'), ['SEAT', 'BELT SIGN']);
  assert.deepEqual(labelLines('L ENG'), ['L ENG']);
});

test('GuardedCover: closed = child inert under the lid; open = child live, cover is the band', async () => {
  const { mod, render, React } = await load();
  const child = React.createElement(mod.BatToggle as never, { id: 'engL', label: 'L ENG', ariaLabel: 'L engine start', state: 'off', lit: false, onToggle: noop } as never);
  const closed = render(mod.GuardedCover, { id: 'engL', name: 'L ENG', guardOpen: false, onGuardToggle: noop, children: child });
  assert.match(closed, /<div class="cjp-guarded-child" inert="">/);
  assert.match(closed, /aria-expanded="false" aria-label="L ENG guard, closed"/);
  assert.match(closed, /data-stripe="red-yellow"/);
  assert.match(closed, />LIFT ▲</);
  const open = render(mod.GuardedCover, { id: 'engL', name: 'L ENG', guardOpen: true, onGuardToggle: noop, children: child });
  assert.match(open, /<div class="cjp-guarded-child">/);
  assert.match(open, /aria-expanded="true" aria-label="L ENG guard, open"/);
  const locked = render(mod.GuardedCover, { id: 'engR', name: 'R ENG', guardOpen: false, onGuardToggle: noop, disabled: true, disabledReason: 'Left first', children: child });
  assert.match(locked, /aria-disabled="true"/);
  assert.match(locked, />LOCKED</);
  assert.match(render(mod.GuardedCover, { id: 'x', name: 'X', guardOpen: false, onGuardToggle: noop, stripe: 'yellow-black', children: child }), /data-stripe="yellow-black"/);
  assert.equal(mod.GuardedToggle, mod.GuardedCover);
});

test('ApuBlock: ARM = cover, START lever, READY lamp off / amber / green', async () => {
  const { mod, render } = await load();
  const p = { onArmToggle: noop, onStartToggle: noop };
  const cold = render(mod.ApuBlock, { ...p, arm: false, start: false, ready: 'off' });
  assert.match(cold, /aria-label="APU guard, closed"/);
  assert.match(cold, /inert=""/);
  assert.match(cold, /aria-label="APU not ready"/);
  const spool = render(mod.ApuBlock, { ...p, arm: true, start: true, ready: 'spooling' });
  assert.match(spool, /aria-label="APU guard, open"/);
  assert.match(spool, /data-sys="apu" data-state="on"/);
  assert.match(spool, /aria-label="APU spooling"/);
  assert.match(spool, /data-lens="amber"/);
  assert.match(spool, />SPOOL</);
  const ready = render(mod.ApuBlock, { ...p, arm: true, start: true, ready: 'ready' });
  assert.match(ready, /aria-label="APU ready"/);
  assert.equal((ready.match(/data-lens="green"/g) ?? []).length, 2, 'START lamp + READY lamp');
});

test('GndAirBlock: GND AIR + X-BLEED with the side lamp lit', async () => {
  const { mod, render } = await load();
  for (const side of ['L', 'R', null] as const) {
    const h = render(mod.GndAirBlock, { aircart: side === 'R', crossbleed: side === 'L', side, onToggle: noop });
    assert.match(h, /data-sys="aircart"/);
    assert.match(h, /data-sys="crossbleed"/);
    assert.match(h, new RegExp(`data-side="${side ?? 'none'}"`));
    assert.match(h, new RegExp(`aria-label="Crossbleed, air to ${side === 'L' ? 'left engine' : side === 'R' ? 'right engine' : 'no engine'}"`));
  }
  const locked = render(mod.GndAirBlock, { aircart: false, crossbleed: false, side: null, onToggle: noop, disabledReasons: { crossbleed: 'Right engine first' } });
  assert.match(locked, /aria-disabled="true" aria-describedby="[^"]+" data-sys="crossbleed"/);
  assert.match(locked, />Right engine first</);
});

/* ------------------------------------------------------------------ shelf */

test('SwitchShelf groups the host list (no hard-coded switches) and swaps in the start block', async () => {
  const { mod, render, React } = await load();
  const apu = jetSystemListFixture('apu');
  const groupsA = shelfGroups(apu, { mode: 'apu', hasBlock: true });
  assert.deepEqual(groupsA.map((g) => g.group), ['POWER', 'FUEL', 'ENGINES', 'SYSTEMS', 'LIGHTS']);
  const ids = groupsA.flatMap((g) => g.items.map((i) => i.id));
  for (const id of CJ_SHELF_BOTTOM_ROW_IDS) assert.ok(!ids.includes(id), `${id} stays in the bottom bank`);
  assert.deepEqual(groupsA.find((g) => g.group === 'ENGINES')!.items.map((i) => i.id), ['ignL', 'engL', 'throttleL', 'ignR', 'engR', 'throttleR']);
  assert.equal(groupsA.find((g) => g.group === 'POWER')!.items.find((i) => i.kind === 'block')!.id, 'apu');
  // cart list: R first in Dan's order, but L before R on the panel; aircart + crossbleed become one block
  const cart = jetSystemListFixture('aircart');
  const groupsB = shelfGroups(cart, { mode: 'gndAir', hasBlock: true });
  assert.deepEqual(groupsB.find((g) => g.group === 'FUEL')!.items.map((i) => i.id), ['fuelPumpL', 'fuelPumpR']);
  assert.equal(groupsB.flatMap((g) => g.items).filter((i) => i.kind === 'block').length, 1);
  assert.ok(!groupsB.flatMap((g) => g.items).some((i) => i.id === 'crossbleed'));

  const block = React.createElement(mod.ApuBlock as never, { arm: true, start: true, ready: 'ready', onArmToggle: noop, onStartToggle: noop } as never);
  const h = render(mod.SwitchShelf, { systems: apu, switches: shelfStateApuStep5(apu), onToggle: noop, guards: { engL: true, engR: false }, onGuardToggle: noop, mode: 'apu', block, open: 'open' });
  assert.match(h, /<section class="cjp-shelf" data-open="open" data-mode="apu" aria-label="Switch shelf"/);
  for (const g of ['POWER', 'FUEL', 'ENGINES', 'SYSTEMS', 'LIGHTS']) assert.match(h, new RegExp(`role="group" aria-label="${g}"`));
  assert.match(h, /aria-label="L engine start guard, open"/);
  assert.match(h, /aria-label="R engine start guard, closed"/);
  assert.match(h, /aria-label="APU guard, open"/);
  assert.doesNotMatch(h, /data-sys="emergencyStop"|data-sys="quickStart"/);
  assert.match(h, /aria-disabled="true" aria-describedby="[^"]+" data-sys="ignR"/);
  // any list: a host-only id renders, no switch list is baked in
  const custom = render(mod.SwitchShelf, { systems: [{ id: 'landingLight', label: 'Landing light', group: 'LIGHTS', kind: 'toggle', order: 1 }], switches: {}, onToggle: noop, mode: 'apu', open: 'open' });
  assert.match(custom, /data-sys="landingLight"/);
  assert.match(custom, /aria-label="Landing light"/);
  // closed: hidden + inert; opening keeps it live
  const closed = render(mod.SwitchShelf, { systems: apu, switches: {}, onToggle: noop, mode: 'apu', open: 'closed' });
  assert.match(closed, /data-open="closed"[^>]*aria-hidden="true" inert=""/);
  assert.doesNotMatch(render(mod.SwitchShelf, { systems: apu, switches: {}, onToggle: noop, mode: 'apu', open: 'opening' }), /inert=""[^>]*data-min/);
  const b = render(mod.SwitchShelf, { systems: cart, switches: shelfStateCartB4(cart), onToggle: noop, mode: 'gndAir', open: 'open',
    block: React.createElement(mod.GndAirBlock as never, { aircart: false, crossbleed: true, side: 'L', onToggle: noop } as never) });
  assert.match(b, /data-mode="gndAir"/);
  assert.match(b, /aria-label="Crossbleed, air to left engine"/);
});

test('shelf fills both board boxes at >= 1x (text >= 11px, targets >= 44px)', () => {
  for (const [variant, mode] of [['apu', 'apu'], ['aircart', 'gndAir']] as const) {
    const m = shelfMetrics(shelfGroups(jetSystemListFixture(variant), { mode, hasBlock: true, guards: { engL: false, engR: false } }));
    for (const slot of [SHELF_SLOTS.w773, SHELF_SLOTS.w1280]) {
      const s = shelfScale(m, slot.w, slot.h);
      assert.ok(s >= 1, `${variant} at ${slot.w}×${slot.h}: scale ${s.toFixed(3)}`);
    }
    assert.ok(m.min.w <= SHELF_SLOTS.w773.w && m.min.h <= SHELF_SLOTS.w773.h, `${variant} min ${m.min.w}×${m.min.h}`);
  }
});

/* ------------------------------------------------------------------ bank */

test('PullHandle: visual only (forwardRef grip, no click), phase legends and travel', async () => {
  const { mod, render } = await load();
  assert.equal((mod.PullHandle as { $$typeof: symbol }).$$typeof, Symbol.for('react.forward_ref'));
  const rest = render(mod.PullHandle, { phase: 'rest', progress: 0 });
  assert.match(rest, /<button type="button" class="cjp-pull-grip" aria-label="Emergency stop" aria-describedby="[^"]+" data-phase="rest"/);
  assert.match(rest, />PULL ▼</);
  assert.match(rest, /--travel:0/);
  assert.match(rest, /width:84\.2\d*%[^"]*height:37\.2\d*%/, '64×44 grip in a 76×118 plate');
  const pulling = render(mod.PullHandle, { phase: 'pulling', progress: 0.6 });
  assert.match(pulling, />24 \/ 40</);
  assert.match(pulling, /--travel:24/);
  const fired = render(mod.PullHandle, { phase: 'fired', progress: 1 });
  assert.match(fired, />STOPPED</);
  assert.match(fired, /--travel:44/);
  assert.match(render(mod.PullHandle, { phase: 'rest', progress: 0, size: 'narrow' }), />EMER</);
  assert.match(render(mod.PullHandle, { phase: 'rest', progress: 0, gripProps: { 'aria-roledescription': 'pull handle' } }), /aria-roledescription="pull handle"/);
  assert.deepEqual(pullView('pulling', 9), { travel: 40, legend: '40 / 40', tone: 'amber' });
  assert.deepEqual(pullView('pulling', Number.NaN), { travel: 0, legend: '0 / 40', tone: 'amber' });
});

test('QuickStartGuard: guarded START push-light, plate legend per state', async () => {
  const { mod, render } = await load();
  const p = { onGuardToggle: noop, onStart: noop };
  const closed = render(mod.QuickStartGuard, { ...p, guardOpen: false, running: false });
  assert.match(closed, /aria-label="Quick start guard, closed"/);
  assert.match(closed, /inert=""/);
  assert.match(closed, />1 TAP · LIFT</);
  const open = render(mod.QuickStartGuard, { ...p, guardOpen: true, running: false });
  assert.match(open, /aria-label="Quick start" aria-pressed="false"/);
  assert.match(open, />PRESS START</);
  const running = render(mod.QuickStartGuard, { ...p, guardOpen: true, running: true });
  assert.match(running, /aria-label="Quick start, running" aria-pressed="true"/);
  assert.match(running, />RUNNING</);
  const locked = render(mod.QuickStartGuard, { ...p, guardOpen: false, running: false, disabled: true, disabledReason: 'Park to cold start' });
  assert.match(locked, />LOCKED</);
  assert.match(locked, /aria-disabled="true"/);
});

test('RadarToggle, GpsRadarPlate and BezelKey: labels, sizes, inert keys', async () => {
  const { mod, render } = await load();
  const off = render(mod.RadarToggle, { on: false, onToggle: noop });
  assert.match(off, /role="switch" aria-checked="false" aria-label="Radar"/);
  assert.match(off, new RegExp(`viewBox="0 0 ${RADAR_MIN.w} ${RADAR_MIN.h}"`));
  assert.match(render(mod.RadarToggle, { on: true, onToggle: noop, size: 'narrow' }), new RegExp(`aria-checked="true"[\\s\\S]*viewBox="0 0 ${RADAR_MIN_NARROW.w} 118"`));
  const plate = render(mod.GpsRadarPlate, { gps: 'acq', radarOn: true, onRadarToggle: noop, size: 'narrow' });
  assert.match(plate, /role="group" aria-label="GPS and radar"/);
  assert.match(plate, /aria-label="GPS searching"/);
  assert.match(plate, new RegExp(`aspect-ratio:${GPS_RADAR_PLATE_MIN_NARROW.w} / 118`));
  assert.match(render(mod.GpsRadarPlate, { gps: 'live', radarOn: false, onRadarToggle: noop }), new RegExp(`aspect-ratio:${GPS_RADAR_PLATE_MIN.w} / 118`));
  const key = render(mod.BezelKey, { legend: 'RNG +', active: true, onPress: noop });
  assert.match(key, /aria-label="RNG \+" aria-pressed="true"/);
  assert.match(key, />RNG \+</);
  const inert = render(mod.BezelKey, { active: false });
  assert.match(inert, /data-inert="true" disabled="" aria-hidden="true" tabindex="-1"/);
  assert.match(render(mod.BezelKey, { legend: '', active: false, onPress: noop }), /data-inert="true"/, 'empty legend = inert');
});

/* ------------------------------------------------------------------ floors */

test('every viewBox is its *_MIN and no text is drawn under 11 units', async () => {
  const { mod, render, React } = await load();
  const cases: [unknown, object, { w: number; h: number }][] = [
    [mod.BatToggle, { id: 'a', label: 'A', ariaLabel: 'A', state: 'off', lit: false, onToggle: noop }, TOGGLE_MIN],
    [mod.PullHandle, { phase: 'rest', progress: 0 }, PULL_MIN],
    [mod.PullHandle, { phase: 'rest', progress: 0, size: 'narrow' }, PULL_MIN_NARROW],
    [mod.QuickStartGuard, { guardOpen: false, running: false, onGuardToggle: noop, onStart: noop }, QUICK_START_MIN],
    [mod.GpsPlate, { gps: 'live' }, PLATE_MIN],
    [mod.BezelKey, { legend: 'MODE', active: false, onPress: noop }, BEZEL_KEY_MIN],
  ];
  for (const [C, p, m] of cases) {
    const h = render(C, p);
    assert.match(h, new RegExp(`viewBox="0 0 ${m.w} ${m.h}"`));
    assert.match(h, new RegExp(`min-width:${m.w}px`));
  }
  assert.match(render(mod.ApuBlock, { arm: false, start: false, ready: 'off', onArmToggle: noop, onStartToggle: noop }), new RegExp(`aspect-ratio:${APU_BLOCK_MIN.w} / ${APU_BLOCK_MIN.h}`));
  assert.match(render(mod.GndAirBlock, { aircart: false, crossbleed: false, side: null, onToggle: noop }), new RegExp(`aspect-ratio:${GND_AIR_MIN.w} / ${GND_AIR_MIN.h}`));
  const apu = jetSystemListFixture('apu');
  const all = [
    render(mod.SwitchShelf, { systems: apu, switches: shelfStateApuStep5(apu), onToggle: noop, guards: { engL: false }, mode: 'apu', open: 'open', annunciators: [{ id: 'a', label: 'APU READY', tone: 'green' }],
      block: React.createElement(mod.ApuBlock as never, { arm: false, start: false, ready: 'off', onArmToggle: noop, onStartToggle: noop } as never) }),
    ...(['none', 'fail', 'acq', 'live'] as const).map((gps) => render(mod.GpsPlate, { gps })),
    render(mod.PullHandle, { phase: 'fired', progress: 1 }),
    render(mod.QuickStartGuard, { guardOpen: true, running: true, onGuardToggle: noop, onStart: noop }),
    render(mod.RadarToggle, { on: true, onToggle: noop, size: 'narrow' }),
  ].join('');
  const sizes = fontSizes(all);
  assert.ok(sizes.length > 100);
  assert.ok(Math.min(...sizes) >= 11, `smallest text ${Math.min(...sizes)}`);
  // every live control is a real button with a name
  for (const b of all.match(/<button[^>]*>/g) ?? []) assert.match(b, /aria-label="[^"]+"|aria-hidden="true"/, b);
});
