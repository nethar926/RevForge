import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AB_THRESHOLDS,
  CARRIER_JET_DEFAULT_VARIANT,
  CARRIER_JET_VARIANTS,
  CARRIER_JET_VARIANT_KEY,
  SWEEP_DECK_DEG,
  SWEEP_FULL_MPH,
  SWEEP_KNEE_MPH,
  SWEEP_MAX_DEG,
  SWEEP_MIN_DEG,
  SWEEP_RATE_DEG_S,
  abZoneFromLoad,
  resolveAbZone,
  scheduledSweep,
  statusText,
  stepSweep,
  toMph,
} from '../src/skins/carrier-jet/model.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const TEXT_EXT = new Set(['.ts', '.tsx', '.css', '.html', '.md', '.json', '.svg']);
const skinText = () => walk(SKIN).filter((f) => TEXT_EXT.has(extname(f))).map((f) => ({ f: f.slice(root.length + 1), s: readFileSync(f, 'utf8') }));

test('sweep schedule: 20° to 25 mph, raised-cosine ease to 68° at 90 mph, parked 75°', () => {
  assert.equal(SWEEP_MIN_DEG, 20);
  assert.equal(SWEEP_MAX_DEG, 68);
  assert.equal(SWEEP_DECK_DEG, 75);
  assert.equal(SWEEP_KNEE_MPH, 25);
  assert.equal(SWEEP_FULL_MPH, 90);
  assert.equal(scheduledSweep(0), 20);
  assert.equal(scheduledSweep(25), 20);
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.05, `${a} ≈ ${b}`);
  near(scheduledSweep(35), 22.7);
  near(scheduledSweep(45), 30.4);
  near(scheduledSweep(55), 41.1);
  near(scheduledSweep(65), 52.5);
  near(scheduledSweep(75), 62.0);
  assert.equal(scheduledSweep(90), 68);
  assert.equal(scheduledSweep(140), 68);
  assert.equal(scheduledSweep(0, true), 75);
  assert.equal(scheduledSweep(NaN), 20);
  // formula check at an arbitrary speed
  const mph = 61.3, t = (mph - 25) / 65;
  near(scheduledSweep(mph), 20 + 48 * (1 - Math.cos(Math.PI * t)) / 2);
  near(scheduledSweep(toMph(72.4, 'kph')), scheduledSweep(45));
});

test('drawn sweep is rate limited to 7.5°/s and snaps under Reduce Motion', () => {
  assert.equal(SWEEP_RATE_DEG_S, 7.5);
  assert.equal(stepSweep(20, 68, 0.2), 21.5);
  assert.equal(stepSweep(68, 20, 0.2), 66.5);
  assert.equal(stepSweep(30, 30.05, 0.1), 30.05);
  assert.equal(stepSweep(20, 68, 2), 21.875, 'frame gaps (hidden tab) are capped at 0.25 s');
  assert.equal(stepSweep(20, 68, 0.016, true), 68);
  // 75 → 20 unfold takes ~7.3 s at 60 fps
  let a = 75, n = 0;
  while (a > 20 + 1e-9 && n < 10000) { a = stepSweep(a, 20, 1 / 60); n++; }
  assert.ok(Math.abs(n / 60 - 55 / 7.5) < 0.05);
});

test('AB zone: abZone prop wins as-is; else load thresholds; else throttle', () => {
  assert.deepEqual([...AB_THRESHOLDS], [0.6, 0.7, 0.8, 0.88, 0.95]);
  assert.equal(abZoneFromLoad(0.9), 4);
  assert.equal(abZoneFromLoad(0.59), 0);
  assert.equal(resolveAbZone(3, 0, 0), 3);
  assert.equal(resolveAbZone(0, 0.99, 0.99), 0, 'Audio Synth zone is not overridden by load');
  assert.equal(resolveAbZone(7, 0, 0), 5);
  assert.equal(resolveAbZone(undefined, 0.9, 0), 4);
  assert.equal(resolveAbZone(undefined, undefined, 0.72), 2);
  assert.equal(resolveAbZone(undefined, undefined, undefined), 0);
  assert.equal(statusText(false, 4), 'AB 4 · SWEEP AUTO');
  assert.equal(statusText(false, 0), 'AB OFF · SWEEP AUTO');
  assert.equal(statusText(true, 0), 'ON DECK · WINGS 75°');
});

test('variants: ids, labels (tab = header), default swing-wing, storage key shape', () => {
  assert.deepEqual(CARRIER_JET_VARIANTS.map((v) => v.id), ['carrier-jet', 'tomcat', 'swing-wing']);
  assert.deepEqual(CARRIER_JET_VARIANTS.map((v) => v.label), ['Carrier Jet', 'Tomcat', 'Swing Wing']);
  assert.equal(CARRIER_JET_DEFAULT_VARIANT, 'swing-wing');
  assert.equal(CARRIER_JET_VARIANT_KEY, 'revforge.pack.carrier-jet.variant');
  const store = readFileSync(join(SKIN, 'variantStore.ts'), 'utf8');
  assert.match(store, /import \{ storageKey \} from '\.\.\/\.\.\/lib\/storageKey'/);
  assert.match(store, /storageKey\(CARRIER_JET_VARIANT_KEY\)/);
});

// Bundle the real component for node (rolldown ships with vite) and render every variant.
async function renderVariants(): Promise<Record<string, string>> {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: join(SKIN, 'CarrierJetHud.tsx'),
    external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
    plugins: [{ name: 'no-assets', resolveId: (id: string) => (/\.(css|woff2)$/.test(id) ? '\0cj-empty' : null), load: (id: string) => (id === '\0cj-empty' ? 'export default ""' : null) }],
    transform: { jsx: 'react-jsx' },
    logLevel: 'silent',
  } as never);
  const { output } = await bundle.generate({ format: 'esm' });
  const dir = mkdtempSync(join(root, 'node_modules/.cj-test-'));
  const file = join(dir, 'hud.mjs');
  writeFileSync(file, output[0].code);
  const mod = await import(pathToFileURL(file).href);
  rmSync(dir, { recursive: true, force: true });
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const out: Record<string, string> = {};
  for (const v of CARRIER_JET_VARIANTS) {
    out[v.id] = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 45, rpm: 2150, gear: 4, load: 0.34, variant: v.id, onVariantChange: () => {} }));
  }
  out.dw = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 90, rpm: 5650, gear: 6, load: 0.9, abZone: 4, driveWindow: true, variant: 'swing-wing', onVariantChange: () => {} }));
  out.explicitFalse = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 45, rpm: 2150, load: 0.34, compact: false, driveWindow: true, variant: 'carrier-jet', onVariantChange: () => {} }));
  for (const v of CARRIER_JET_VARIANTS) {
    out[`compact:${v.id}`] = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 45, rpm: 2150, gear: 4, load: 0.34, compact: true, variant: v.id, onVariantChange: () => {} }));
    out[`dwc:${v.id}`] = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 45, rpm: 2150, gear: 4, load: 0.34, compact: true, driveWindow: true, variant: v.id, onVariantChange: () => {} }));
  }
  out.ab3 = renderToStaticMarkup(React.createElement(mod.CarrierJetHud, { speed: 90, rpm: 5650, gear: 6, load: 0.1, abZone: 3, variant: 'swing-wing', onVariantChange: () => {} }));
  return out;
}

test('rendered: each tab label equals its variant header label; radiogroup semantics; meters', async () => {
  const html = await renderVariants();
  for (const v of CARRIER_JET_VARIANTS) {
    const h = html[v.id];
    const header = h.match(/data-cj-label=""[^>]*>([^<]*)</)?.[1];
    const checked = h.match(/<button[^>]*role="radio"[^>]*aria-checked="true"[^>]*>([^<]*)<\/button>/)?.[1];
    assert.equal(header, v.label, `${v.id} header`);
    assert.equal(checked, header, `${v.id}: selected tab reads the header label`);
    const tabs = [...h.matchAll(/<button[^>]*data-variant-option="([^"]+)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(tabs, CARRIER_JET_VARIANTS.map((o) => [o.id, o.label]), 'every tab = that variant’s header label');
    assert.match(h, /role="radiogroup"/);
    assert.equal((h.match(/role="radio"/g) ?? []).length, 3);
    assert.equal((h.match(/aria-checked="true"/g) ?? []).length, 1);
    assert.match(h, /role="meter" aria-label="Speed"[^>]*aria-valuetext="45 miles per hour"/);
    assert.match(h, /role="meter" aria-label="Wing sweep"[^>]*aria-valuetext="Wing sweep 30 degrees, auto schedule"/);
    assert.match(h, /F-14/);
  }
});

// Wilson's reflow rule: compact = the full board reflowed (same elements, same look), tabs in every layout.
const elements = (h: string) => [...h.matchAll(/data-cj-el="([^"]+)"/g)].map((m) => m[1]).sort();
test('rendered: tabs in every layout (full, compact, drive window); compact keeps every element of the full board', async () => {
  const html = await renderVariants();
  for (const k of ['dw', ...CARRIER_JET_VARIANTS.flatMap((v) => [`compact:${v.id}`, `dwc:${v.id}`])]) {
    const h = html[k];
    assert.match(h, /role="radiogroup"/, `${k}: tab group`);
    assert.equal((h.match(/role="radio"/g) ?? []).length, 3, `${k}: three tabs`);
    assert.equal((h.match(/aria-checked="true"/g) ?? []).length, 1, `${k}: one checked`);
    assert.match(h, /data-cj-el="gps-pill"/, `${k}: GPS pill kept`);
    assert.doesNotMatch(h, /data-layout="dw"/, `${k}: no separate essential layout`);
  }
  assert.match(html.dw, /data-layout="full"/, 'drive window alone renders the full board');
  assert.match(html.explicitFalse, /data-layout="full"/, 'explicit compact={false} wins over the drive-window flag');
  assert.doesNotMatch(html.explicitFalse, /data-compact=/);
  assert.equal((html.explicitFalse.match(/role="radio"/g) ?? []).length, 3);
  const hudSrc = readFileSync(join(SKIN, 'CarrierJetHud.tsx'), 'utf8');
  assert.match(hudSrc, /const compact = compactReq === true \|\| \(compactReq === 'auto' && small\);/, 'only true / auto turn compact on');
  assert.doesNotMatch(hudSrc, /ancestorDw \|\| compact|\|\| ancestorDw\)?;?\s*\n\s*const compact/, 'ancestor flag never forces compact');
  for (const v of CARRIER_JET_VARIANTS) {
    const full = elements(html[v.id]);
    for (const k of [`compact:${v.id}`, `dwc:${v.id}`]) {
      assert.match(html[k], /data-layout="reflow"/);
      assert.deepEqual(elements(html[k]), full, `${k}: same elements (and counts) as the full ${v.id} board`);
      for (const el of ['speed', 'gear', 'rpm', 'rpm-bar', 'sweep-digits', 'planform', 'sweep-tape', 'mode-windows', 'ladder', 'heading', 'aoa', 'indexer', 'accel', 'engines', 'ab-ladder', 'tabs', 'label', 'designation', 'gps-pill', 'status-pill'])
        assert.ok(elements(html[k]).includes(el), `${k}: ${el}`);
      assert.equal((html[k].match(/class="cj-ab" data-lit="/g) ?? []).length, 5, `${k}: five AB lights`);
    }
  }
  assert.match(html.dw, /AB 4 · SWEEP AUTO/);
  // secondary blocks stay aria-hidden in every layout
  for (const h of Object.values(html)) for (const m of h.matchAll(/<div class="cj-sec[^"]*"([^>]*)>/g)) assert.match(m[1], /aria-hidden="true"/);
});

test('compact CSS: container units, >= 11px floors, >= 44px tabs, no transform scale', () => {
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  const compact = css.slice(css.indexOf('/* ---------------- compact:'));
  assert.match(compact, /\.cj\[data-layout='reflow'\] \.cj-tab \{[^}]*min-height: 44px[^}]*min-width: 44px/);
  assert.match(compact, /calc\(11\.2px \/ var\(--cj-sv, 1\)\)/, 'SVG text floor 11px after the viewBox shrink');
  assert.match(compact, /container-type: size/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /transform:\s*scale|scale\(/, 'no transform scale');
  for (const m of compact.matchAll(/max\((\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, `floor ${m[1]}px`);
  for (const m of compact.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, `font ${m[1]}px`);
  assert.doesNotMatch(css, /data-layout='dw'/, 'old essential layout removed');
  assert.doesNotMatch(css, /@media[^{]*max-width/, 'no width-only media rules');
});

test('rendered: AB lights follow the abZone prop in the same render (no smoothing)', async () => {
  const html = await renderVariants();
  assert.match(html.ab3, /data-ab="3"/);
  assert.equal((html.ab3.match(/class="cj-ab" data-lit="true"/g) ?? []).length, 3);
  assert.match(html.ab3, /AB 3 · SWEEP AUTO/);
  // no transition / animation on lit states anywhere in the skin CSS
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  assert.doesNotMatch(css, /\.cj-ab[^{]*\{[^}]*transition/);
  assert.doesNotMatch(css, /transition:(?!\s*none)/);
});

// Banned in the skin folder (case-insensitive): makers' marks, unit insignia, film / call signs, old label.
const BANNED: RegExp[] = [
  /grumman/i, /northrop/i, /\bVF-?\s?\d+/i, /squadron/i, /insignia(?!,)/i, /top\s*gun/i, /maverick/i, /\bgoose\b/i, /iceman/i, /jester/i, /viper/i, /\bmerlin\b/i,
  /\bhollywood\b/i, /danger\s*zone/i, /jolly\s*rogers?/i, /aerospace\s*f-?14/i,
];
test('banned strings: none in src/skins/carrier-jet (incl. "AEROSPACE F14")', () => {
  for (const { f, s } of skinText()) {
    // The test itself lists the patterns; only the skin folder is scanned.
    for (const re of BANNED) assert.doesNotMatch(s, re, `${f} contains ${re}`);
  }
});

// Tailwind turns a bare "out"+"line" word into a stray utility class, so comments must not carry it.
const BARE_OL = new RegExp('\\b' + 'out' + 'line' + '\\b');
test('skin hygiene: no SMIL, no backdrop-filter, no bare o-line word in comments, OFL fonts shipped', () => {
  const files = skinText();
  for (const { f, s } of files) {
    assert.doesNotMatch(s, /<animate|<animateTransform|<animateMotion|<set\s/i, `${f}: SMIL`);
    assert.doesNotMatch(s, /backdrop-filter\s*:|backdropFilter/i, `${f}: backdrop-filter`);
    const comments = (s.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|\{\/\*[\s\S]*?\*\/\}|<!--[\s\S]*?-->/g) ?? []).join('\n');
    assert.doesNotMatch(comments, BARE_OL, `${f}: bare o-line word in a comment`);
  }
  const fonts = readdirSync(join(SKIN, 'fonts'));
  for (const fam of ['B612', 'VT323', 'BarlowSemiCondensed']) {
    assert.ok(fonts.some((x) => x.startsWith(fam) && x.endsWith('.woff2')), `${fam} woff2`);
    const ofl = readFileSync(join(SKIN, 'fonts', `OFL-${fam}.txt`), 'utf8');
    assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/i);
    assert.equal(readFileSync(join(root, 'public/fonts', `OFL-${fam}.txt`), 'utf8'), ofl, `public/fonts/OFL-${fam}.txt`);
  }
  assert.ok(readFileSync(join(root, 'public/fonts/OFL-Oswald.txt'), 'utf8').length > 1000, 'Oswald licence ships');
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  for (const m of css.matchAll(/font-family:\s*'([^']+)';\s*src/g)) assert.ok(['B612', 'VT323', 'Barlow Semi Condensed'].includes(m[1]), m[1]);
});

test('aerospace-f14 skin left untouched', () => {
  const f14 = readdirSync(join(root, 'src/skins/aerospace-f14')).sort();
  assert.deepEqual(f14, ['AerospaceF14Overlay.tsx', 'aerospace-f14.css']);
});
