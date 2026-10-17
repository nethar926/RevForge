import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cjRadarScopeAria } from '../src/skins/carrier-jet/map/radarAria.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS = join(root, 'src/skins/carrier-jet/parts');

let loaded: Promise<{ mod: Record<string, unknown>; render: (C: unknown, p: object) => string }> | undefined;
function load() {
  loaded ??= (async () => {
    const { rolldown } = await import('rolldown');
    const bundle = await rolldown({
      input: join(PARTS, 'index.ts'),
      external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
      plugins: [{ name: 'empty-css', resolveId: (id: string) => (/\.(css|woff2|svg)$/.test(id) ? '\0cjpp-empty' : null), load: (id: string) => (id === '\0cjpp-empty' ? 'export default ""' : null) }],
      transform: { jsx: 'react-jsx' },
      logLevel: 'silent',
    } as never);
    const { output } = await bundle.generate({ format: 'esm' });
    const dir = mkdtempSync(join(root, 'node_modules/.cjpp-test-'));
    const file = join(dir, 'parts.mjs');
    writeFileSync(file, output[0].code);
    const mod = await import(pathToFileURL(file).href);
    rmSync(dir, { recursive: true, force: true });
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { mod, render: (C: unknown, p: object) => renderToStaticMarkup(React.createElement(C as never, p as never)) };
  })();
  return loaded;
}
const noop = () => {};
/** The APU START switch button only (the READY lamp has its own OFF legend). */
const startBtn = (h: string) => h.match(/<button[^>]*data-sys="apu"[\s\S]*?<\/button>/)?.[0] ?? '';
const base = { arm: false, start: false, ready: 'off', onArmToggle: noop, onStartToggle: noop };

/* ------------------------------------------------------------------ (a) RADAR scope label: no heading */

test('RADAR scope aria names range, mode, returns and the map, never the heading', () => {
  assert.equal(cjRadarScopeAria({ range: 5, mode: 'map' }, '', true), 'Radar scope over map, 5 mile range, map mode, no returns. Map track up, dimmed');
  assert.equal(cjRadarScopeAria({ range: 2, mode: 'terr' }, 'GPS ACQ', true), 'Radar scope over map, 2 mile range, terrain mode, no returns. Map track up, dimmed, acquiring GPS');
  assert.equal(cjRadarScopeAria({ range: 10, mode: 'map' }, 'NO TILES', false), 'Radar scope, 10 mile range, map mode, no returns. Map unavailable, no tiles, offline');
  assert.equal(cjRadarScopeAria({ range: 5, mode: 'map' }, 'DEMO', true), 'Radar scope over map, 5 mile range, map mode, no returns. Map track up, dimmed, demo');
  for (const r of [2, 5, 10] as const) for (const m of ['map', 'terr'] as const) for (const s of ['', 'GPS ACQ', 'DEMO', 'NO TILES', 'NO MAP DATA'] as const) for (const shown of [true, false]) {
    const a = cjRadarScopeAria({ range: r, mode: m }, s, shown);
    assert.doesNotMatch(a, /heading|\bhdg\b|\d{3}\b|magnetic|true\b/i, a);
    assert.match(a, /^Radar scope/);
  }
});

test('radarAria.ts is pure (no React, no DOM, no host import)', () => {
  const src = readFileSync(join(root, 'src/skins/carrier-jet/map/radarAria.ts'), 'utf8');
  assert.doesNotMatch(src, /from 'react'|document\.|window\.|\/packs\//);
  assert.equal(cjRadarScopeAria.length, 3, '(view, status, mapShown): no heading argument');
});

/* ------------------------------------------------------------------ (b) ApuBlock legend */

test('ApuBlock legend omitted: START switch reads OFF / START as before', async () => {
  const { mod, render } = await load();
  assert.match(startBtn(render(mod.ApuBlock, base)), />OFF<\/text>/);
  assert.match(startBtn(render(mod.ApuBlock, { ...base, arm: true, start: true, ready: 'ready' })), />START<\/text>/);
  assert.match(startBtn(render(mod.ApuBlock, { ...base, legend: '' })), />OFF<\/text>/, "'' falls back too");
});

test("ApuBlock legend 'PARK' + disabled: lock + PARK engraved unlit grey, START / OFF gone, no glow", async () => {
  const { mod, render } = await load();
  const h = render(mod.ApuBlock, { ...base, legend: 'PARK', disabled: true, disabledReason: 'Available in Park' });
  const b = startBtn(h);
  assert.ok(b, 'START button rendered');
  assert.match(b, /aria-disabled="true"/);
  assert.match(b, /<path d="M2\.5 5V3\.5a2\.5 2\.5 0 0 1 5 0V5"/, 'lock drawn');
  const legend = b.match(/<g class="cjp-unlit"[^>]*>[\s\S]*?<\/g>/)?.[0] ?? '';
  assert.ok(legend, 'locked legend group (cjp-unlit)');
  assert.match(legend, /data-eng="grey"/, 'unlit grey');
  assert.match(legend, /x="14" y="88" text-anchor="start"[^>]*fill="#dfe3e6"[^>]*>PARK<\/text>/, 'beside the lock, unlit grey (ENG.grey #dfe3e6)');
  assert.doesNotMatch(legend, />(START|OFF)</);
  assert.equal((b.match(/>START<\/text>/g) ?? []).length, 2, 'only the engraved START label (+ its shadow) above the lever');
  assert.doesNotMatch(b, />OFF<\/text>/);
  assert.doesNotMatch(legend, /filter=/, 'no glow');
  // the same locked look as any shelf switch with the same legend
  const tog = render(mod.BatToggle, { id: 'x', label: 'START', state: 'off', lit: false, disabled: true, legend: 'PARK', onToggle: noop });
  const engr = (s: string) => s.match(/<text[^>]*>PARK<\/text>/)?.[0].replace(/ id="[^"]*"/g, '');
  assert.equal(engr(b), engr(tog), 'PARK engraving identical to the shelf locked style');
  assert.match(h, /aria-label="APU not ready"/, 'READY lamp unchanged');
});

test('ApuBlock legend is upper-cased; prop typed on CjApuBlockProps', async () => {
  const { mod, render } = await load();
  assert.match(startBtn(render(mod.ApuBlock, { ...base, legend: 'park', disabled: true })), />PARK<\/text>/);
  const src = readFileSync(join(PARTS, 'ApuBlock.tsx'), 'utf8');
  assert.match(src, /legend=\{legend \|\| \(start \? 'START' : 'OFF'\)\}/);
  const types = readFileSync(join(root, 'src/skins/carrier-jet/types.ts'), 'utf8');
  assert.match(types, /interface CjApuBlockProps \{[\s\S]*?legend\?: string;[\s\S]*?\n\}/);
});
