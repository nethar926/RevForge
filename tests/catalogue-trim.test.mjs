// Catalogue trim (Oct 8 2026): visible allowlist + hidden → Night Pursuit migration.
// Same loader as pack-migrations.test.mjs (Node 20 has no TS stripping): transpile the
// pure-data modules with the project's `typescript` into a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'rf-trim-'));
for (const rel of ['packs/migrations', 'packs/stellar-helm.identity', 'packs/chrono-coupe.identity', 'packs/carrier-jet.identity', 'themes/visibility', 'lib/storageKey']) {
  const src = readFileSync(join(root, 'src', `${rel}.ts`), 'utf8');
  let js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'");
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, `${rel}.mjs`), js);
}
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const m = await import(pathToFileURL(join(out, 'packs/migrations.mjs')).href);
const v = await import(pathToFileURL(join(out, 'themes/visibility.mjs')).href);
const rev = (s) => s.split('').reverse().join('');
const THEME = 'drivesynth.theme.v2';
const PREFS = 'drivesynth.ui.v1';
const RETIRED = { ...m.THEME_ID_MIGRATIONS, ...m.PACK_THEME_MIGRATIONS };
const HIDDEN = ['road-road-66', 'galactic-enforcer', 'custom-grid', 'minimal-numeric', 'epoch-banks', 'cobalt-vane', 'gradient', 'sweep', 'twin-dial', 'ion-twin', 'road-trenchlight'];

test('allowlist is exactly the three packs', () => {
  assert.deepEqual([...v.VISIBLE_THEME_IDS].sort(), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
  assert.equal(v.FALLBACK_THEME_ID, 'night-pursuit');
});

test('resolve: visible ids pass through unchanged', () => {
  for (const id of v.VISIBLE_THEME_IDS) assert.equal(v.resolveListedThemeId(id, RETIRED), id);
});

test('resolve: hidden skins → night-pursuit', () => {
  for (const id of HIDDEN) assert.equal(v.resolveListedThemeId(id, RETIRED), 'night-pursuit', id);
});

test('resolve: saffron (and its legacy ids) → stellar-helm, not night-pursuit', () => {
  for (const id of ['saffron-console', 'saffron-command', rev('sdlrow-wen'), rev('esirpretne')]) assert.equal(v.resolveListedThemeId(id, RETIRED), 'stellar-helm', id);
});

test('resolve: unknown / empty → night-pursuit; retired renames to hidden themes → night-pursuit', () => {
  for (const id of ['', null, undefined, 'no-such-theme']) assert.equal(v.resolveListedThemeId(id, RETIRED), 'night-pursuit');
  for (const id of Object.keys(m.THEME_ID_MIGRATIONS)) assert.equal(v.resolveListedThemeId(id, RETIRED), 'night-pursuit');
  assert.equal(v.resolveListedThemeId(rev('redir-thgin'), RETIRED), 'night-pursuit');
});

test('boot migration: saved hidden pick is rewritten to night-pursuit; engine pref untouched', () => {
  for (const id of HIDDEN) {
    store.clear();
    localStorage.setItem(THEME, id);
    localStorage.setItem(PREFS, JSON.stringify({ selectedEngineId: 'ion-twin' }));
    assert.equal(m.runPackPrefMigrations(), '');
    assert.equal(localStorage.getItem(THEME), 'night-pursuit', id);
    assert.equal(JSON.parse(localStorage.getItem(PREFS)).selectedEngineId, 'ion-twin');
  }
});

test('boot migration: saffron keeps winning (stellar-helm + select), visible unchanged, unknown → night-pursuit', () => {
  store.clear();
  localStorage.setItem(THEME, 'saffron-console');
  assert.equal(m.runPackPrefMigrations(), 'stellar-helm');
  assert.equal(localStorage.getItem(THEME), 'stellar-helm');
  for (const id of v.VISIBLE_THEME_IDS) {
    localStorage.setItem(THEME, id);
    m.runPackPrefMigrations();
    assert.equal(localStorage.getItem(THEME), id);
  }
  localStorage.setItem(THEME, 'no-such-theme');
  m.runPackPrefMigrations();
  assert.equal(localStorage.getItem(THEME), 'night-pursuit');
});

test('boot migration: saved combinations on hidden skins → night-pursuit, saffron → stellar-helm', () => {
  store.clear();
  localStorage.setItem('drivesynth.combinations.v1', JSON.stringify([
    { id: 'a', name: 'A', skinId: 'galactic-enforcer', sound: { params: {} } },
    { id: 'b', name: 'B', skinId: 'saffron-command', sound: { params: {} } },
    { id: 'c', name: 'C', skinId: 'chrono-coupe', sound: { params: {} } },
    { id: 'd', name: 'D', skinId: rev('omortson'), sound: { params: {} } },
  ]));
  m.runPackPrefMigrations();
  const combos = JSON.parse(localStorage.getItem('drivesynth.combinations.v1'));
  assert.deepEqual(combos.map((c) => c.skinId), ['night-pursuit', 'stellar-helm', 'chrono-coupe', 'night-pursuit']);
});

// Engine allowlist (Oct 8 2026): only the three pack engines are listed; every other built-in moves to Night Pursuit's engine.
const HIDDEN_ENGINES = ['v8-rumble', 'i4-zip', 'i6-silk', 'rotary-hum', 'ev-whine', 'ev-inverter-climb', 'ev-regen-howl', 'ev-dual-motor', 'aerospace-f14', 'ion-twin', 'revforge-road-66', 'revforge-apex-v8', 'revforge-neon-drive', 'revforge-italia', 'revforge-miami', 'revforge-autobahn', 'revforge-dual-surge', 'revforge-dune-runner', 'revforge-alpine', 'revforge-starliner', 'revforge-sakura-gtr', 'revforge-trenchlight', 'revforge-light-grid'];
const BUILTINS = new Set([...HIDDEN_ENGINES, 'night-pursuit']); // this branch: chrono-coupe / stellar-helm audio not merged yet
const isBuiltin = (id) => BUILTINS.has(id);

test('engine allowlist is exactly the three pack engines (by id), all listed without opt-in', () => {
  assert.deepEqual([...v.VISIBLE_ENGINE_IDS].sort(), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
  assert.equal(v.FALLBACK_ENGINE_ID, 'night-pursuit');
  for (const id of v.VISIBLE_ENGINE_IDS) assert.equal(v.isEngineListed(id), true, id);
  for (const id of ['', null, undefined, ...HIDDEN_ENGINES]) assert.equal(v.isEngineListed(id), false, String(id));
});

test('engine resolve: hidden built-ins → night-pursuit; listed, user synths and unknown ids pass through', () => {
  for (const id of HIDDEN_ENGINES) assert.equal(v.resolveListedEngineId(id, isBuiltin), 'night-pursuit', id);
  for (const id of v.VISIBLE_ENGINE_IDS) assert.equal(v.resolveListedEngineId(id, isBuiltin), id, id);
  for (const id of ['user-1730000000000', 'user-combination-abc', 'not-registered-yet', '']) assert.equal(v.resolveListedEngineId(id, isBuiltin), id, id);
  // Once Audio registers the pack engines they stay listed.
  const withAudio = (id) => isBuiltin(id) || id === 'chrono-coupe' || id === 'stellar-helm';
  for (const id of ['chrono-coupe', 'stellar-helm']) assert.equal(v.resolveListedEngineId(id, withAudio), id, id);
});

test('boot migration: saved hidden engine → night-pursuit; visible and user synths unchanged', () => {
  const run = (engine, theme = 'night-pursuit') => {
    store.clear();
    localStorage.setItem(THEME, theme);
    localStorage.setItem(PREFS, JSON.stringify({ selectedEngineId: engine, keep: 1 }));
    const select = m.runPackPrefMigrations(isBuiltin);
    return { select, theme: localStorage.getItem(THEME), prefs: JSON.parse(localStorage.getItem(PREFS)) };
  };
  for (const id of HIDDEN_ENGINES) {
    const r = run(id);
    assert.equal(r.prefs.selectedEngineId, 'night-pursuit', id);
    assert.equal(r.prefs.keep, 1);
  }
  for (const id of ['night-pursuit', 'chrono-coupe', 'stellar-helm', 'user-1730000000000']) assert.equal(run(id).prefs.selectedEngineId, id, id);
  // Legacy engine renames still run first, then the allowlist.
  assert.equal(run(rev('dialp-egrofver')).prefs.selectedEngineId, 'night-pursuit');
  // Saffron → Stellar Helm theme (select); the saved hidden engine lands on night-pursuit.
  const s = run('ion-twin', 'saffron-console');
  assert.deepEqual([s.select, s.theme, s.prefs.selectedEngineId], ['stellar-helm', 'stellar-helm', 'night-pursuit']);
  // Fresh profile (no prefs) writes nothing.
  store.clear();
  m.runPackPrefMigrations(isBuiltin);
  assert.equal(localStorage.getItem(PREFS), null);
});

test('wiring: every engine list / picker / load path goes through the allowlist', () => {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const reg = read('src/packs/registry.ts');
  const fn = reg.slice(reg.indexOf('export function isEngineIdVisible'), reg.indexOf('const isBuiltinEngine'));
  assert.match(fn, /return isEngineListed\(engineId\);/);
  assert.match(read('src/forge/ForgePage.tsx'), /BUILTIN_PATCHES\.filter\(p=>isEngineIdVisible\(p\.id\)/);
  assert.match(read('src/forge/ForgePage.tsx'), /onSavePatch\(resolveVisibleEnginePatch\(c\.sound\)\)/);
  assert.match(read('src/pages/EnginesPage.tsx'), /if \(!isEngineIdVisible\(p\.id\)/);
  assert.match(read('src/themes/ExperienceBuilder.tsx'), /const options=\[\.\.\.BUILTIN_PATCHES\.filter\(p=>isEngineIdVisible\(p\.id\)\),\.\.\.userPatches\]/);
  assert.match(read('src/forge/soundSources.ts'), /\.\.\.BUILTIN_PATCHES\.filter\(p=>isEngineListed\(p\.id\)\)/);
  assert.match(read('src/main.tsx'), /runPackPrefMigrations\(\(id\) => !!getBuiltin\(id\)\)/);
  assert.match(read('src/hooks/useUiPrefs.ts'), /selectedEngineId: FALLBACK_ENGINE_ID,/);
  assert.match(read('src/hooks/useUiPrefs.ts'), /resolveListedEngineId\(resolveLegacyPackId\(merged\.selectedEngineId\)/);
  assert.match(read('src/themes/useThemes.ts'), /\.map\(visibleSound\)/);
});
