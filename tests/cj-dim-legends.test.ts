// Disabled Carrier Jet cold-start parts: no 'LOCKED' word, normal legend drawn unlit (no glow), aria-disabled +
// reason kept, contrast >= 4.5:1, text >= 11. Plus the CjHeadingLegend ariaLabel override.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { toggleLegend } from '../src/skins/carrier-jet/parts/tokens.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = join(root, 'src/skins/carrier-jet/parts');

async function bundle(input: string) {
  const { rolldown } = await import('rolldown');
  const b = await rolldown({
    input,
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [{ name: 'empty-css', resolveId: (id: string) => (/\.(css|woff2|svg)$/.test(id) ? '\0cjd-empty' : null), load: (id: string) => (id === '\0cjd-empty' ? 'export default ""' : null) }],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await b.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.cjd-test-'));
  const file = join(dir, 'm.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  return mod as Record<string, unknown>;
}
let env: Promise<{ parts: Record<string, unknown>; map: Record<string, unknown>; render: (C: unknown, p: object) => string; React: typeof import('react') }> | undefined;
function load() {
  env ??= (async () => {
    const [parts, map] = await Promise.all([bundle(join(PARTS, 'index.ts')), bundle(join(root, 'src/skins/carrier-jet/map/HeadingLegend.tsx'))]);
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { parts, map, React, render: (C: unknown, p: object) => renderToStaticMarkup(React.createElement(C as never, p as never)) };
  })();
  return env;
}
const noop = () => {};
const lum = (h: string) => {
  const c = [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** The unlit legend groups: <g class="cjp-unlit" ...>…</g> (Eng renders 1-3 <text> children, no nested <g>). */
const unlitGroups = (h: string) => [...h.matchAll(/<g class="cjp-unlit"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => m[0]);
const reasonOf = (h: string, owner: RegExp) => {
  const tagStr = h.match(owner)?.[0] ?? '';
  const id = tagStr.match(/aria-describedby="([^"]+)"/)?.[1];
  return id ? h.match(new RegExp(`id="${id}" class="cjp-sr">([^<]*)<`))?.[1] : undefined;
};

function assertUnlit(h: string, text: string, what: string) {
  const g = unlitGroups(h).find((x) => x.includes(`>${text}<`));
  assert.ok(g, `${what}: "${text}" drawn as an unlit legend`);
  assert.match(g!, /data-eng="grey"/, `${what}: unlit tone`);
  assert.doesNotMatch(g!, /stroke="rgba/, `${what}: no backlight halo`);
  const sizes = [...g!.matchAll(/font-size="([\d.]+)"/g)].map((m) => +m[1]);
  assert.ok(sizes.length && sizes.every((s) => s >= 11), `${what}: text >= 11 (${sizes})`);
  const fill = g!.match(/fill="(#[0-9a-f]{6})" data-text-floor/)?.[1];
  assert.ok(fill, `${what}: solid fill`);
  // Gunmetal plate: base #4a5055, gradient #51585d..#43494e (lightest stop is the worst case). Guard tab #17191a.
  for (const plate of ['#51585d', '#4a5055', '#43494e', '#17191a']) assert.ok(cr(fill!, plate) >= 4.5, `${what}: ${fill} on ${plate} = ${cr(fill!, plate).toFixed(2)}`);
}

test('toggleLegend: same legend whatever the lock state', () => {
  assert.equal(toggleLegend('off'), 'OFF');
  assert.equal(toggleLegend('on'), 'ON');
  assert.equal(toggleLegend('momentary'), 'HOLD');
});

test('no LOCKED word anywhere in the Carrier Jet sources', () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(tsx?|css|md)$/.test(e.name) ? [join(d, e.name)] : []));
  for (const f of walk(join(root, 'src/skins/carrier-jet'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /LOCKED/, f);
});

test('BatToggle disabled: normal legend unlit, aria-disabled + reason, no LOCKED', async () => {
  const { parts, render } = await load();
  const base = { id: 'batt', label: 'BATT', ariaLabel: 'Battery', onToggle: noop, disabled: true, disabledReason: 'Battery first' };
  for (const [state, lit, legend, want] of [['off', false, undefined, 'OFF'], ['on', true, undefined, 'ON'], ['momentary', true, undefined, 'HOLD'], ['off', false, 'auto', 'AUTO']] as const) {
    const h = render(parts.BatToggle, { ...base, state, lit, legend });
    assert.doesNotMatch(h, /LOCKED/);
    assert.match(h, /aria-disabled="true"/);
    assert.equal(reasonOf(h, /<button[^>]*>/), 'Battery first');
    assertUnlit(h, want, `BatToggle ${state}${legend ? ` ${legend}` : ''}`);
    assert.doesNotMatch(h, /data-lens="(green|amber)"/, 'lamp dark while disabled');
    assert.doesNotMatch(h, /stroke="rgba\((126,247,161|255,181,74|255,246,220)/, 'nothing glows');
  }
  const live = render(parts.BatToggle, { ...base, disabled: false, state: 'on', lit: true });
  assert.equal(unlitGroups(live).length, 0, 'enabled legends are not marked unlit');
});

test('GuardedCover disabled: LIFT tab unlit, aria-disabled + reason, no LOCKED', async () => {
  const { parts, render, React } = await load();
  const child = React.createElement(parts.BatToggle as never, { id: 'engR', label: 'R ENG', ariaLabel: 'R engine start', state: 'off', lit: false, disabled: true, onToggle: noop } as never);
  const h = render(parts.GuardedCover, { id: 'engR', name: 'R ENG', guardOpen: false, onGuardToggle: noop, disabled: true, disabledReason: 'Start the left engine first', children: child });
  assert.doesNotMatch(h, /LOCKED/);
  assert.match(h, /class="cjp-cover"[^>]*aria-disabled="true"/);
  assert.equal(reasonOf(h, /<button[^>]*class="cjp-cover"[^>]*>/), 'Start the left engine first');
  assertUnlit(h, 'LIFT ▲', 'GuardedCover tab');
});

test('ApuBlock disabled: no LOCKED', async () => {
  const { parts, render } = await load();
  const h = render(parts.ApuBlock, { arm: false, start: false, ready: 'off', onArmToggle: noop, onStartToggle: noop, disabled: true, disabledReason: 'Battery first' });
  assert.doesNotMatch(h, /LOCKED/);
  assert.match(h, /aria-disabled="true"/);
  assert.ok(unlitGroups(h).length >= 1);
});

test('GndAirBlock disabled: X-BLEED shows OFF / OPEN unlit, aria-disabled + reason, no LOCKED', async () => {
  const { parts, render } = await load();
  for (const [crossbleed, want] of [[false, 'OFF'], [true, 'OPEN']] as const) {
    const h = render(parts.GndAirBlock, { aircart: false, crossbleed, side: null, onToggle: noop, disabledReasons: { aircart: 'Battery first', crossbleed: 'Right engine first' } });
    assert.doesNotMatch(h, /LOCKED/);
    const xb = h.match(/<button[^>]*data-sys="crossbleed"[^>]*>/)?.[0] ?? '';
    assert.match(xb, /aria-disabled="true"/);
    assert.equal(reasonOf(h, /<button[^>]*data-sys="crossbleed"[^>]*>/), 'Right engine first');
    assert.equal(reasonOf(h, /<button[^>]*data-sys="aircart"[^>]*>/), 'Battery first');
    const xbSvg = h.slice(h.indexOf('data-sys="crossbleed"'));
    assertUnlit(xbSvg, want, `X-BLEED ${want}`);
    assertUnlit(h, 'OFF', 'GND AIR');
  }
});

test('QuickStartGuard disabled: status plate keeps its legend unlit, aria-disabled + reason, no LOCKED', async () => {
  const { parts, render } = await load();
  const p = { onGuardToggle: noop, onStart: noop, disabled: true, disabledReason: 'Park to cold start' };
  for (const [guardOpen, running, want] of [[false, false, '1 TAP · LIFT'], [true, false, 'PRESS START'], [false, true, 'RUNNING']] as const) {
    for (const size of ['wide', 'narrow'] as const) {
      const h = render(parts.QuickStartGuard, { ...p, guardOpen, running, size });
      assert.doesNotMatch(h, /LOCKED/);
      assert.match(h, /data-disabled="true"/);
      assert.match(h, /class="cjp-cover"[^>]*aria-disabled="true"/);
      assert.equal(reasonOf(h, /<button[^>]*class="cjp-cover"[^>]*>/), 'Park to cold start');
      assert.equal(reasonOf(h, /<button[^>]*class="cjp cjp-key"[^>]*>/), 'Park to cold start');
      assertUnlit(h, want, `QuickStart plate ${want} ${size}`);
    }
  }
});

test('no flashing: disabled legends carry no animation hooks', () => {
  const css = readFileSync(join(PARTS, 'parts.css'), 'utf8');
  assert.doesNotMatch(css, /cjp-unlit[^{]*\{[^}]*animation/);
});

test('CjHeadingLegend: ariaLabel overrides the root aria-label; default unchanged', async () => {
  const { map, render } = await load();
  const def = render(map.CjHeadingLegend, { trueHdg: 40, magHdg: 47 });
  const root0 = def.match(/^<div[^>]*>/)?.[0] ?? '';
  assert.match(root0, /data-cj-el="heading-legend"/);
  assert.doesNotMatch(root0, /aria-label=/, 'default: no aria-label (text content is read)');
  assert.doesNotMatch(root0, /role=/);
  assert.match(def, />HDG 047 M</);
  const lab = render(map.CjHeadingLegend, { trueHdg: 40, magHdg: 47, lead: 'T', ariaLabel: 'Heading 040 true, 047 magnetic' });
  const root1 = lab.match(/^<div[^>]*>/)?.[0] ?? '';
  assert.match(root1, /aria-label="Heading 040 true, 047 magnetic"/);
  assert.match(root1, /role="group"/);
  assert.match(root1, /data-lead="T"/);
  assert.match(lab, />HDG 040 T</, 'visible legend unchanged');
  assert.doesNotMatch(render(map.CjHeadingLegend, { trueHdg: 40, magHdg: 47, ariaLabel: '' }).match(/^<div[^>]*>/)?.[0] ?? '', /aria-label=/, 'empty string = default');
});
