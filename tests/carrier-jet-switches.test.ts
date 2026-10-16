import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CJ_SWITCH_ITEMS, CJ_SWITCH_OVERFLOW, guardView, switchView, type CjSwitchItem } from '../src/skins/carrier-jet/switches.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');

// Bundle the real components for node (rolldown ships with vite), then render with react-dom/server.
async function load() {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: join(SKIN, 'switch-exports.test-entry.ts'),
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [
      { name: 'entry', resolveId: (id: string) => (id.endsWith('switch-exports.test-entry.ts') ? '\0cjs-entry' : /\.(css|woff2)$/.test(id) ? '\0cjs-empty' : null),
        load: (id: string) => (id === '\0cjs-entry' ? `export * from ${JSON.stringify(join(SKIN, 'SwitchPanel.tsx'))}; export * from ${JSON.stringify(join(SKIN, 'AfterburnerGuard.tsx'))};` : id === '\0cjs-empty' ? 'export default ""' : null) },
    ],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await bundle.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.cjs-test-'));
  const file = join(dir, 'sw.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  return { mod, render: (C: unknown, p: object) => renderToStaticMarkup(React.createElement(C as never, p as never)) };
}
const noop = () => {};
const armTag = (h: string) => h.match(/<button[^>]*class="cjg-arm"[^>]*>/)?.[0] ?? '';
const slotTag = (h: string) => h.match(/<div class="cjg-arm-slot"[^>]*>/)?.[0] ?? '';
const guardTag = (h: string) => h.match(/<button[^>]*class="cjg-guard"[^>]*>/)?.[0] ?? '';

test('guard logic: aria-expanded + label; ARM unreachable (inert, tabIndex -1) while closed', () => {
  for (const armed of [true, false]) {
    const c = guardView(armed, false);
    assert.deepEqual(c.guard, { 'aria-expanded': false, 'aria-label': 'Afterburner guard, closed' });
    assert.equal(c.arm.inert, true);
    assert.equal(c.arm.tabIndex, -1);
    const o = guardView(armed, true);
    assert.deepEqual(o.guard, { 'aria-expanded': true, 'aria-label': 'Afterburner guard, open' });
    assert.equal(o.arm.inert, false);
    assert.equal(o.arm.tabIndex, 0);
    assert.equal(o.arm.role, 'switch');
    assert.equal(o.arm['aria-checked'], armed);
    assert.equal(o.arm['aria-label'], 'Afterburner armed');
  }
  assert.equal(guardView(false, false).keyLegend, 'SAFE');
  assert.equal(guardView(false, true).plate, 'AB SAFE');
  assert.equal(guardView(true, false).plate, 'AB ARMED');
});

test('guard rendered: closed = inert ARM out of the tab order; open = reachable switch', async () => {
  const { mod, render } = await load();
  for (const armed of [true, false]) {
    const closed = render(mod.CarrierJetAfterburnerGuard, { armed, guardOpen: false, onArm: noop, onGuardToggle: noop });
    assert.match(guardTag(closed), /aria-expanded="false"/);
    assert.match(guardTag(closed), /aria-label="Afterburner guard, closed"/);
    assert.match(slotTag(closed), /\binert=""/, 'ARM slot inert while closed');
    assert.match(armTag(closed), /tabindex="-1"/);
    const open = render(mod.CarrierJetAfterburnerGuard, { armed, guardOpen: true, onArm: noop, onGuardToggle: noop });
    assert.match(guardTag(open), /aria-expanded="true"/);
    assert.match(guardTag(open), /aria-label="Afterburner guard, open"/);
    assert.doesNotMatch(slotTag(open), /inert/, 'ARM slot not inert while open');
    const arm = armTag(open);
    assert.match(arm, /role="switch"/);
    assert.match(arm, new RegExp(`aria-checked="${armed}"`));
    assert.match(arm, /aria-label="Afterburner armed"/);
    assert.match(arm, /tabindex="0"/);
    const ctl = guardTag(open).match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(ctl && open.includes(`id="${ctl}"`), 'guard aria-controls the ARM slot');
    assert.match(open, armed ? />AB ARMED</ : />AB SAFE</);
    if (!armed) assert.match(open, />SAFE</, 'disarmed key shows the SAFE legend');
  }
});

test('switch logic: page = aria-current, toggle = switch, more = aria-expanded, compass denied', () => {
  const by = (id: string) => CJ_SWITCH_ITEMS.find((i) => i.id === id)!;
  assert.deepEqual(CJ_SWITCH_ITEMS.map((i) => i.label), ['Drive', 'Garage', 'Visuals', 'Options', 'Sound Builder', 'Compass', 'Mute', 'More']);
  assert.deepEqual(CJ_SWITCH_OVERFLOW.map((i) => i.label), ['Pro Builder', 'Lab', 'Diagnostics', 'Account']);
  assert.equal(switchView(by('drive')).a11y['aria-current'], 'page');
  assert.equal(switchView(by('garage')).a11y['aria-current'], undefined);
  assert.deepEqual(switchView(by('mute')).a11y, { role: 'switch', 'aria-checked': false, 'aria-label': 'Mute' });
  assert.equal(switchView(by('more'), 4).a11y['aria-expanded'], false);
  const compass: CjSwitchItem = { id: 'compass', label: 'Compass', kind: 'toggle', state: 'denied', on: true };
  const d = switchView(compass);
  assert.equal(d.denied, true);
  assert.deepEqual(d.a11y, { role: 'switch', 'aria-checked': false, 'aria-label': 'Compass denied, tap to retry' });
  assert.equal(switchView({ ...compass, state: 'on' }).a11y['aria-checked'], true, 'state wins over on');
});

test('switch panel rendered: visible labels, tray only when MORE is on, denied compass stays a live button', async () => {
  const { mod, render } = await load();
  const items = CJ_SWITCH_ITEMS.map((i) => (i.id === 'compass' ? { ...i, state: 'denied' } : i));
  const closed = render(mod.CarrierJetSwitchPanel, { items, overflow: CJ_SWITCH_OVERFLOW, onSelect: noop });
  for (const i of items) assert.match(closed, new RegExp(`class="cjs-label"[^>]*>${i.label}<`), `${i.label} visible label`);
  assert.doesNotMatch(closed, /cjs-tray"/);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /aria-current="page"[^>]*aria-label="Drive"|aria-label="Drive"[^>]*aria-current="page"/);
  const comp = closed.match(/<button[^>]*data-sw-id="compass"[^>]*>/)?.[0] ?? '';
  assert.match(comp, /data-denied="true"/);
  assert.match(comp, /aria-label="Compass denied, tap to retry"/);
  assert.doesNotMatch(comp, /disabled|tabindex="-1"/);
  const open = render(mod.CarrierJetSwitchPanel, { items: items.map((i) => (i.kind === 'more' ? { ...i, on: true } : i)), overflow: CJ_SWITCH_OVERFLOW, onSelect: noop });
  const ctl = open.match(/aria-expanded="true"[^>]*aria-controls="([^"]+)"|aria-controls="([^"]+)"[^>]*aria-expanded="true"/);
  const trayId = ctl?.[1] ?? ctl?.[2];
  assert.ok(trayId && open.includes(`id="${trayId}"`), 'MORE controls the tray');
  for (const i of CJ_SWITCH_OVERFLOW) assert.match(open, new RegExp(`>${i.label}<`));
});

test('switch CSS: 44px targets, >= 11px text, flip is transform/opacity only and off under Reduce Motion', () => {
  const css = readFileSync(join(SKIN, 'switches.css'), 'utf8');
  for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, `font ${m[1]}px`);
  assert.match(css, /\.cjs \.cjs-sw \{[^}]*min-width: 44px[^}]*min-height: 144px/);
  assert.match(css, /\.cjg\[data-open='true'\] \.cjg-guard \{ height: 52px; \}/, 'open guard hit area >= 44px tall');
  for (const m of css.matchAll(/transition:\s*([^;]+);/g)) for (const part of m[1].split(',')) assert.match(part.trim(), /^(none|(transform|opacity) \d+ms\b.*)$/, part);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.cjg-lid, \.cjg-strip \{ transition: none; \}/);
  assert.doesNotMatch(css, /animation|@keyframes/);
});
