// Carrier Jet preview wiring (Oct 8 2026): catalogue entry hidden on root, visible via
// VITE_FORCE_VISIBLE=carrier-jet,aerospace-f14; saved f14 → carrier-jet only where visible;
// the skin owns the look tabs + their persistence (mount passes no variant). Same transpile loader as
// force-visible.test.mjs (per-build import.meta.env swap).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
let n = 0;
async function build(env) {
  const key = `__RF_CJ_ENV_${n++}__`;
  globalThis[key] = env;
  const out = mkdtempSync(join(tmpdir(), 'rf-cj-'));
  for (const rel of ['packs/migrations', 'packs/stellar-helm.identity', 'packs/chrono-coupe.identity', 'packs/carrier-jet.identity', 'packs/runtime', 'themes/visibility', 'lib/storageKey']) {
    let js = ts.transpileModule(readFileSync(join(root, 'src', `${rel}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    js = js.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'").replace(/import\.meta\.env/g, `globalThis.${key}`);
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, `${rel}.mjs`), js);
  }
  const imp = (rel) => import(pathToFileURL(join(out, `${rel}.mjs`)).href);
  return { v: await imp('themes/visibility'), m: await imp('packs/migrations'), id: await imp('packs/carrier-jet.identity'), rt: await imp('packs/runtime') };
}
const BUILTINS = ['v8-rumble', 'ev-inverter-climb', 'aerospace-f14', 'ion-twin', 'night-pursuit'];
const THEME_IDS = ['custom-grid', 'f14', 'carrier-jet', 'chrono-coupe', 'night-pursuit', 'stellar-helm', 'road-road-66'];
const isBuiltin = (id) => BUILTINS.includes(id);
const revs = (v) => BUILTINS.filter((id) => v.isEngineListed(id));
const picker = (v) => THEME_IDS.filter((id) => v.isThemeListed(id));
const boot = (m, prefix, theme, engine, extra = {}) => {
  store.clear();
  localStorage.setItem(`${prefix}drivesynth.theme.v2`, theme);
  localStorage.setItem(`${prefix}drivesynth.ui.v1`, JSON.stringify({ selectedEngineId: engine }));
  for (const [k, val] of Object.entries(extra)) localStorage.setItem(`${prefix}${k}`, val);
  m.runPackPrefMigrations(isBuiltin);
  const get = (k) => localStorage.getItem(`${prefix}${k}`);
  return { theme: get('drivesynth.theme.v2'), engine: JSON.parse(get('drivesynth.ui.v1')).selectedEngineId, experimental: JSON.parse(get('revforge.packs.experimental') ?? '[]'), combos: JSON.parse(get('drivesynth.combinations.v1') ?? '[]') };
};

const rootBuild = await build({});
const preview = await build({ VITE_PREVIEW_SLUG: 'carrier-jet', VITE_FORCE_VISIBLE: 'carrier-jet,aerospace-f14' });
const otherPreview = await build({ VITE_PREVIEW_SLUG: 'ion-twin', VITE_FORCE_VISIBLE: 'ion-twin' });
const P = 'rf.preview.carrier-jet.';

test('identity: carrier-jet / "Carrier Jet" / aerospace-f14, not in the base catalogue', () => {
  const { id, v } = rootBuild;
  assert.equal(id.default.id, 'carrier-jet');
  assert.equal(id.default.displayName, 'Carrier Jet');
  assert.equal(id.default.previewSlug, 'carrier-jet');
  assert.deepEqual(id.default.engine, { preferred: 'aerospace-f14', fallback: 'aerospace-f14', kind: 'aerospace' });
  assert.ok(!v.BASE_VISIBLE_THEME_IDS.includes('carrier-jet'));
  assert.ok(!v.BASE_VISIBLE_ENGINE_IDS.includes('aerospace-f14'));
});

test('root build (no env): picker / Revs unchanged, saved f14 still → Night Pursuit', () => {
  const { v, m } = rootBuild;
  assert.deepEqual(picker(v), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
  assert.deepEqual(revs(v), ['night-pursuit']);
  assert.deepEqual(m.CARRIER_JET_THEME_MIGRATIONS, {});
  assert.equal(m.PACK_THEME_MIGRATIONS.f14, undefined);
  assert.deepEqual(boot(m, '', 'f14', 'aerospace-f14'), { theme: 'night-pursuit', engine: 'night-pursuit', experimental: [], combos: [] });
  assert.equal(boot(m, '', 'carrier-jet', 'night-pursuit').theme, 'night-pursuit');
});

test('other previews (ion-twin): f14 / carrier-jet still → Night Pursuit', () => {
  const { v, m } = otherPreview;
  assert.ok(!v.isThemeListed('carrier-jet'));
  assert.equal(boot(m, 'rf.preview.ion-twin.', 'f14', 'ion-twin').theme, 'night-pursuit');
  assert.equal(boot(m, 'rf.preview.ion-twin.', 'carrier-jet', 'ion-twin').theme, 'night-pursuit');
});

test('carrier-jet preview: listed in picker + Revs, saved f14 → carrier-jet (engine untouched)', () => {
  const { v, m } = preview;
  assert.deepEqual(picker(v), ['carrier-jet', 'chrono-coupe', 'night-pursuit', 'stellar-helm']);
  assert.deepEqual(revs(v), ['aerospace-f14', 'night-pursuit']);
  assert.deepEqual(m.CARRIER_JET_THEME_MIGRATIONS, { f14: 'carrier-jet' });
  const r = boot(m, P, 'f14', 'aerospace-f14');
  assert.equal(r.theme, 'carrier-jet');
  assert.equal(r.engine, 'aerospace-f14');
  assert.ok(r.experimental.includes('carrier-jet'));
  assert.equal(boot(m, P, 'f14', 'v8-rumble').engine, 'night-pursuit'); // hidden built-in engine rule unchanged
  assert.equal(boot(m, P, 'carrier-jet', 'aerospace-f14').theme, 'carrier-jet');
  assert.equal(boot(m, P, 'galactic-enforcer', 'aerospace-f14').theme, 'night-pursuit');
  // Root keys are not touched by the preview build.
  store.clear();
  localStorage.setItem('drivesynth.theme.v2', 'f14');
  m.runPackPrefMigrations(isBuiltin);
  assert.equal(localStorage.getItem('drivesynth.theme.v2'), 'f14');
});

test('carrier-jet preview: saved combinations on f14 → carrier-jet; root build → Night Pursuit', () => {
  const combos = JSON.stringify([{ id: 'c1', name: 'Jet', skinId: 'f14' }]);
  assert.equal(boot(preview.m, P, 'carrier-jet', 'aerospace-f14', { 'drivesynth.combinations.v1': combos }).combos[0].skinId, 'carrier-jet');
  assert.equal(boot(rootBuild.m, '', 'night-pursuit', 'night-pursuit', { 'drivesynth.combinations.v1': combos }).combos[0].skinId, 'night-pursuit');
});

test('afterburner zone source: undefined without Audio API; clamped 0..5; re-subscribes on engine swap', () => {
  const { rt } = rootBuild;
  assert.equal(rt.readPackAbZone(), undefined);
  let seen = 0;
  const off = rt.subscribePackAbZone(() => seen++);
  const mk = (z) => { const subs = new Set(); return { z, subs, src: { get: () => z.v, subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); } } }; };
  const a = mk({ v: 3.6 });
  rt.setPackAbZoneSource(a.src);
  assert.equal(rt.readPackAbZone(), 4);
  assert.equal(a.subs.size, 1);
  const before = seen;
  a.z.v = 9; for (const cb of a.subs) cb();
  assert.equal(seen, before + 1);
  assert.equal(rt.readPackAbZone(), 5);
  const b = mk({ v: -2 });
  rt.setPackAbZoneSource(b.src); // engine swap: old subscription dropped, new one attached
  assert.equal(a.subs.size, 0);
  assert.equal(b.subs.size, 1);
  assert.equal(rt.readPackAbZone(), 0);
  rt.setPackAbZoneSource({ get: () => NaN, subscribe: () => undefined });
  assert.equal(rt.readPackAbZone(), undefined);
  rt.setPackAbZoneSource(null);
  assert.equal(rt.readPackAbZone(), undefined);
  off();
});

test('wiring sources: old jet skin CSS/overlay out of ThemeStage + index.css; mount follows the pack pattern', () => {
  const src = (p) => readFileSync(join(root, 'src', p), 'utf8');
  assert.doesNotMatch(src('themes/ThemeStage.tsx'), /aerospace-f14|AerospaceF14Overlay/);
  assert.doesNotMatch(src('index.css'), /aerospace-f14/);
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /useFitBox\(/);
  // Drive window = the full board (Wilson): explicit compact={false}, never the skin's essential layout.
  assert.match(mount, /fullBoard = driveWindow \|\| layout === 'portrait' \|\| layout === 'phone-landscape'/);
  assert.match(mount, /fullBoard \? false : props\.compact === true \? true : 'auto'/);
  assert.match(mount, /data-rf-layout=\{layout\}/);
  assert.match(mount, /<CarrierJetHud \{\.\.\.props\} compact=\{compact\} driveWindow=\{false\} abZone=\{abZone\} \/>/);
  assert.match(mount, /useSyncExternalStore\(subscribePackAbZone, readPackAbZone/);
  assert.match(mount, /useSyncExternalStore\(subscribePackAbZone, readPackAbZone/);
  // The mount's own drive-window state is data-box="drive" (the skin reads any ancestor data-drive-window).
  assert.match(mount, /data-box=\{driveWindow \? 'drive' : undefined\}/);
  assert.doesNotMatch(mount, /data-drive-window=/);
  // The skin renders the look tabs and persists the look itself: the mount adds neither.
  assert.doesNotMatch(mount, /role="radiogroup"|onVariantChange=\{|\bvariant=\{/);
  // Fill div, no transform scale (the skin sizes from its container).
  assert.doesNotMatch(mount, /rf-pack-box/);
  assert.doesNotMatch(src('packs/mounts/carrier-jet-mount.css'), /transform\s*:/);
  const pack = src('packs/carrier-jet.pack.ts');
  assert.match(pack, /Thumb: CarrierJetThumb/);
  assert.match(pack, /isThemeListed\(ID\.id\)/);
});
