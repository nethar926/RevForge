import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARRIER_JET_VARIANTS, LOOK_LABELS, variantLabel } from '../src/skins/carrier-jet/model.ts';

// Look renames (Oct 16 2026): visible / spoken names MATRIX / VECTOR / HOLO, no F-14 text; ids unchanged.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
// Visible spellings of the old names (ids are lowercase-hyphenated and never match these).
const OLD_VISIBLE = /carrier\s+jet|tomcat|swing[\s-]?wing|\bF-?14\b/i;

test('LOOK_LABELS: exported map, keyed by the unchanged ids, drives every variant label', () => {
  assert.deepEqual({ ...LOOK_LABELS }, { 'carrier-jet': 'MATRIX', tomcat: 'VECTOR', 'swing-wing': 'HOLO' });
  assert.match(readFileSync(join(SKIN, 'index.ts'), 'utf8'), /^export \* from '\.\/model';$/m, 'LOOK_LABELS re-exported from the skin index for Frontend');
  assert.deepEqual(CARRIER_JET_VARIANTS.map((v) => v.id), ['carrier-jet', 'tomcat', 'swing-wing'], 'ids unchanged');
  for (const v of CARRIER_JET_VARIANTS) {
    assert.equal(v.label, LOOK_LABELS[v.id]);
    assert.equal(variantLabel(v.id), LOOK_LABELS[v.id]);
  }
});

async function render(): Promise<Record<string, string>> {
  const { rolldown } = await import('rolldown');
  const entry = `export { CarrierJetHud } from ${JSON.stringify(join(SKIN, 'CarrierJetHud.tsx'))};\nexport { CarrierJetThumb } from ${JSON.stringify(join(SKIN, 'CarrierJetThumb.tsx'))};`;
  const bundle = await rolldown({
    input: '\0cj-entry',
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [{
      name: 'entry-no-assets',
      resolveId: (id: string) => (id === '\0cj-entry' ? id : /\.(css|woff2)$/.test(id) ? '\0cj-empty' : null),
      load: (id: string) => (id === '\0cj-entry' ? entry : id === '\0cj-empty' ? 'export default ""' : null),
    }],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await bundle.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.cj-renames-'));
  const file = join(dir, 'skin.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const out: Record<string, string> = { thumb: renderToStaticMarkup(React.createElement(mod.CarrierJetThumb)) };
  for (const v of CARRIER_JET_VARIANTS) for (const [k, extra] of [['full', {}], ['compact', { compact: true }], ['dw', { driveWindow: true }], ['dwc', { compact: true, driveWindow: true }]] as const) {
    out[`${k}:${v.id}`] = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 45, rpm: 2150, gear: 4, load: 0.34, variant: v.id, onVariantChange: () => {}, ...extra }));
  }
  out.parkedAb = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 0, rpm: 800, abZone: 4, variant: 'tomcat', onVariantChange: () => {} }));
  return out;
}
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
/** What a sighted user reads or VoiceOver speaks: text nodes + naming / value attributes. */
const visible = (h: string) => [
  ...[...h.matchAll(/>([^<]+)</g)].map((m) => decode(m[1])),
  ...[...h.matchAll(/\s(?:aria-label|aria-valuetext|aria-roledescription|aria-description|title|alt|placeholder)="([^"]*)"/g)].map((m) => decode(m[1])),
].filter((s) => s.trim());

test('rendered: no visible or spoken old look name / F-14 in any look, layout or the picker thumbnail', async () => {
  const html = await render();
  for (const [k, h] of Object.entries(html)) for (const s of visible(h)) assert.doesNotMatch(s, OLD_VISIBLE, `${k}: "${s}"`);
  for (const v of CARRIER_JET_VARIANTS) for (const k of ['full', 'compact', 'dw', 'dwc']) {
    const h = html[`${k}:${v.id}`];
    const label = LOOK_LABELS[v.id];
    assert.equal(h.match(/data-cj-label=""[^>]*>([^<]*)</)?.[1], label, `${k}:${v.id} header label`);
    assert.match(h, new RegExp(`aria-label="${label} heads-up display"`), `${k}:${v.id} HUD name`);
    assert.match(h, /role="radiogroup" aria-label="Look"/, `${k}:${v.id} LOOK group name`);
    const tabs = [...h.matchAll(/<button[^>]*data-variant-option="([^"]+)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(tabs, [['carrier-jet', 'MATRIX'], ['tomcat', 'VECTOR'], ['swing-wing', 'HOLO']], `${k}:${v.id} LOOK keys`);
    // internal ids / data attributes untouched
    assert.match(h, new RegExp(`data-skin="carrier-jet" data-variant="${v.id}"`));
  }
  assert.match(html.thumb, />HOLO<\/text>/, 'thumbnail plate reads the default look name');
});

test('source: old names survive only as ids, classes, selectors or comments (no visible strings)', () => {
  const files = walk(SKIN).filter((f) => ['.ts', '.tsx', '.html', '.css', '.svg', '.json'].includes(extname(f)));
  assert.ok(files.length > 10);
  for (const f of files) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|[^:'"`])\/\/[^\n]*/g, '$1');
    // ids are lowercase kebab tokens ('carrier-jet', 'tomcat', 'swing-wing'); strip them, then nothing may remain.
    const rest = code
      .replace(/(['"`=|])(carrier-jet|tomcat|swing-wing)(?=['"`|\]&\s])/g, '$1') // quoted id / selector value / doc list
      .replace(/([{,]\s*|\.)tomcat\b(?=\s*:|[^\w-])/g, '$1'); // bare id as object key or property access
    for (const m of rest.matchAll(new RegExp(OLD_VISIBLE.source, 'gi'))) {
      const at = rest.slice(Math.max(0, m.index - 40), m.index + 40);
      assert.fail(`${f.slice(root.length + 1)}: "${m[0]}" outside an id / comment: …${at}…`);
    }
  }
});
