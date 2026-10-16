import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARRIER_JET_VARIANTS } from '../src/skins/carrier-jet/model.ts';
import { PALETTES } from '../src/skins/carrier-jet/palettes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');

// Bundle the real HUD for node (rolldown ships with vite), as tests/carrier-jet.test.ts does.
let modP: Promise<{ render: (p: Record<string, unknown>) => string }> | null = null;
function hud() {
  modP ??= (async () => {
    const { rolldown } = await import('rolldown');
    const bundle = await rolldown({
      input: join(SKIN, 'CarrierJetHud.tsx'),
      external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
      plugins: [{ name: 'no-assets', resolveId: (id: string) => (/\.(css|woff2)$/.test(id) ? '\0cj-empty' : null), load: (id: string) => (id === '\0cj-empty' ? 'export default ""' : null) }],
      transform: { jsx: 'react-jsx' },
      logLevel: 'silent',
    } as never);
    const { output } = await bundle.generate({ format: 'esm' });
    const dir = mkdtempSync(join(root, 'node_modules/.cj-hs-test-'));
    const file = join(dir, 'hud.mjs');
    writeFileSync(file, output[0].code);
    const mod = await import(pathToFileURL(file).href);
    rmSync(dir, { recursive: true, force: true });
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { render: (p: Record<string, unknown>) => renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 45, rpm: 2150, load: 0.34, onVariantChange: () => {}, ...p })) };
  })();
  return modP;
}

const CAPTION = /data-cj-el="heading-stale"[^>]*>NEEDS MOTION</g;
const headingGroups = (h: string) => [...h.matchAll(/<g data-cj-el="heading"([^>]*)>([\s\S]*?)<\/g>\s*(?=<\/svg>)/g)].map((m) => ({ attrs: m[1], body: m[2] }));
const boxDigits = (h: string) => headingGroups(h).map((g) => [...g.body.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).filter((t) => /^(\d{3}|---)$/.test(t)));
const layouts = [{}, { compact: true }, { compact: true, driveWindow: true }];

test('headingStale: NEEDS MOTION caption in every look and layout, heading digits still shown (dimmed)', async () => {
  const { render } = await hud();
  for (const v of CARRIER_JET_VARIANTS) for (const l of layouts) {
    const k = `${v.id} ${JSON.stringify(l)}`;
    const h = render({ variant: v.id, heading: 47, headingStale: true, ...l });
    assert.equal((h.match(CAPTION) ?? []).length, 1, `${k}: one caption`);
    const groups = headingGroups(h);
    assert.ok(groups.length >= 1, `${k}: heading readout`);
    for (const g of groups) assert.match(g.attrs, /data-stale="true"/, `${k}: heading marked stale`);
    assert.ok(boxDigits(h).every((d) => d.includes('047')), `${k}: digits 047 still shown`);
    const P = PALETTES[v.id];
    // digits in the dim text tone, ticks in the (dimmer) ghost tone; neither in the live symbol colour
    assert.match(h, new RegExp(`<text[^>]*fill="${P.winText}"[^>]*>047</text>`), `${k}: dim digits`);
    for (const g of groups) assert.doesNotMatch(g.body, new RegExp(`<line[^>]*stroke="${P.sym}"`), `${k}: no live-colour ticks`);
    for (const g of groups) assert.match(g.body, new RegExp(`<line[^>]*stroke="${P.ghost}"`), `${k}: ghost ticks`);
  }
});

test('headingStale false / undefined: no caption, markup identical to the prop being absent', async () => {
  const { render } = await hud();
  for (const v of CARRIER_JET_VARIANTS) for (const l of layouts) for (const heading of [47, undefined]) {
    const k = `${v.id} ${JSON.stringify(l)} heading=${heading}`;
    const none = render({ variant: v.id, heading, ...l });
    assert.equal((none.match(CAPTION) ?? []).length, 0, `${k}: no caption`);
    assert.doesNotMatch(none, /data-stale=/, `${k}: not marked stale`);
    assert.equal(render({ variant: v.id, heading, headingStale: false, ...l }), none, `${k}: false == absent`);
    assert.ok(boxDigits(none).length >= 1 && boxDigits(none).every((d) => d.length >= 1), `${k}: heading box found`);
    for (const d of boxDigits(none)) assert.ok(d.includes(heading === undefined ? '---' : '047'), `${k}: digits`);
  }
});

test('headingStale with no heading: keeps "---" undimmed, caption still shown', async () => {
  const { render } = await hud();
  for (const v of CARRIER_JET_VARIANTS) {
    const h = render({ variant: v.id, headingStale: true });
    assert.equal((h.match(CAPTION) ?? []).length, 1, `${v.id}: caption`);
    assert.ok(boxDigits(h).length >= 1, `${v.id}: heading box found`);
    for (const d of boxDigits(h)) assert.ok(d.includes('---'), `${v.id}: ---`);
    assert.doesNotMatch(h, /data-stale=/, `${v.id}: nothing to dim`);
  }
});

test('stale caption CSS: static (no animation / transition), >= 11px floors', () => {
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]*cj-hstale[^{]*)\{([^}]*)\}/g)];
  assert.ok(rules.length >= 5, 'caption placement rules');
  for (const m of rules) assert.doesNotMatch(m[2], /animation|transition/, `static: ${m[1].trim()}`);
  for (const m of rules) for (const f of m[2].matchAll(/font-size:\s*max\((\d+(?:\.\d+)?)px/g)) assert.ok(Number(f[1]) >= 11, `floor ${f[1]}px`);
  const hud = readFileSync(join(SKIN, 'CarrierJetHud.tsx'), 'utf8');
  assert.match(hud, /headingStale: p\.headingStale === true/, 'view model takes the prop');
  assert.equal((hud.match(/stale=\{v\.headingStale\}/g) ?? []).length, 6, 'every Rose / HeadingTape gets stale');
});
