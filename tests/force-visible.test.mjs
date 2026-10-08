// VITE_FORCE_VISIBLE (Oct 8 2026): a single preview build can force hidden themes / engines visible.
// Same transpile loader as catalogue-trim.test.mjs; `import.meta.env` is swapped for a per-build env
// object so each variant gets its own module instances (root, unset, forced, unknown).
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
  const key = `__RF_ENV_${n++}__`;
  globalThis[key] = env;
  const out = mkdtempSync(join(tmpdir(), 'rf-force-'));
  for (const rel of ['packs/migrations', 'packs/stellar-helm.identity', 'packs/chrono-coupe.identity', 'packs/carrier-jet.identity', 'themes/visibility', 'lib/storageKey']) {
    let js = ts.transpileModule(readFileSync(join(root, 'src', `${rel}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    js = js.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'").replace(/import\.meta\.env/g, `globalThis.${key}`);
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, `${rel}.mjs`), js);
  }
  const v = await import(pathToFileURL(join(out, 'themes/visibility.mjs')).href);
  const m = await import(pathToFileURL(join(out, 'packs/migrations.mjs')).href);
  return { v, m };
}
// Built-in engines on this branch (src/audio/builtins.ts order) and theme ids (src/themes/catalog.ts).
const BUILTINS = ['v8-rumble', 'i4-zip', 'i6-silk', 'rotary-hum', 'ev-whine', 'ev-inverter-climb', 'ev-regen-howl', 'ev-dual-motor', 'aerospace-f14', 'ion-twin', 'night-pursuit', 'revforge-road-66', 'revforge-apex-v8', 'revforge-neon-drive', 'revforge-italia', 'revforge-miami', 'revforge-autobahn', 'revforge-dual-surge', 'revforge-dune-runner', 'revforge-alpine', 'revforge-starliner', 'revforge-sakura-gtr', 'revforge-trenchlight', 'revforge-light-grid'];
const THEME_IDS = ['custom-grid', 'lightbike', 'galactic-enforcer', 'minimal-numeric', 'f14', 'f22', 'night-pursuit', 'chrono-coupe', 'stellar-helm', 'road-road-66', 'road-trenchlight'];
const isBuiltin = (id) => BUILTINS.includes(id);
const revs = (v) => BUILTINS.filter((id) => v.isEngineListed(id)); // ForgePage: BUILTIN_PATCHES.filter(isEngineIdVisible → isEngineListed)
const picker = (v) => THEME_IDS.filter((id) => v.isThemeListed(id)); // catalog LISTED_THEMES = THEMES.filter(isThemeListed)
const boot = (m, prefix, theme, engine) => {
  store.clear();
  localStorage.setItem(`${prefix}drivesynth.theme.v2`, theme);
  localStorage.setItem(`${prefix}drivesynth.ui.v1`, JSON.stringify({ selectedEngineId: engine }));
  m.runPackPrefMigrations(isBuiltin);
  return { theme: localStorage.getItem(`${prefix}drivesynth.theme.v2`), engine: JSON.parse(localStorage.getItem(`${prefix}drivesynth.ui.v1`)).selectedEngineId };
};

const unset = await build({});
const empty = await build({ VITE_FORCE_VISIBLE: ' , ,' });
const ion = await build({ VITE_PREVIEW_SLUG: 'ion-twin', VITE_FORCE_VISIBLE: 'ion-twin' });
const theme = await build({ VITE_FORCE_VISIBLE: 'f14, aerospace-f14' });
const unknown = await build({ VITE_FORCE_VISIBLE: 'no-such-id,carrier-jet' });

test('unset / empty VITE_FORCE_VISIBLE = exactly the base allowlists and migrations', () => {
  for (const { v, m } of [unset, empty]) {
    assert.deepEqual(v.FORCED_VISIBLE_IDS, []);
    assert.deepEqual(v.VISIBLE_THEME_IDS, v.BASE_VISIBLE_THEME_IDS);
    assert.deepEqual(v.VISIBLE_ENGINE_IDS, v.BASE_VISIBLE_ENGINE_IDS);
    assert.deepEqual([...v.VISIBLE_THEME_IDS].sort(), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
    assert.deepEqual([...v.VISIBLE_ENGINE_IDS].sort(), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
    assert.deepEqual(revs(v), ['night-pursuit']);
    assert.deepEqual(picker(v), ['night-pursuit', 'chrono-coupe', 'stellar-helm']);
    assert.deepEqual(boot(m, '', 'f14', 'ion-twin'), { theme: 'night-pursuit', engine: 'night-pursuit' });
  }
  assert.deepEqual(unset.v.parseForcedIds(' a, b ,,a '), ['a', 'b']);
});

test('forced engine (ion-twin preview): listed in Revs, saved ion-twin under rf.preview.ion-twin.* stays', () => {
  const { v, m } = ion;
  assert.deepEqual(v.FORCED_VISIBLE_IDS, ['ion-twin']);
  assert.deepEqual(revs(v), ['ion-twin', 'night-pursuit']);
  assert.equal(v.resolveListedEngineId('ion-twin', isBuiltin), 'ion-twin');
  assert.deepEqual(boot(m, 'rf.preview.ion-twin.', 'night-pursuit', 'ion-twin'), { theme: 'night-pursuit', engine: 'ion-twin' });
  assert.deepEqual(boot(m, 'rf.preview.ion-twin.', 'night-pursuit', 'v8-rumble').engine, 'night-pursuit');
  assert.deepEqual(picker(v), ['night-pursuit', 'chrono-coupe', 'stellar-helm']);
});

test('forced theme (f14) + engine (aerospace-f14): in picker / Revs and not migrated', () => {
  const { v, m } = theme;
  assert.deepEqual(v.FORCED_VISIBLE_IDS, ['f14', 'aerospace-f14']);
  assert.deepEqual(picker(v), ['f14', 'night-pursuit', 'chrono-coupe', 'stellar-helm']);
  assert.deepEqual(revs(v), ['aerospace-f14', 'night-pursuit']);
  assert.deepEqual(boot(m, '', 'f14', 'aerospace-f14'), { theme: 'f14', engine: 'aerospace-f14' });
  assert.deepEqual(boot(m, '', 'galactic-enforcer', 'ion-twin'), { theme: 'night-pursuit', engine: 'night-pursuit' });
  assert.equal(v.resolveListedThemeId('f14'), 'f14');
});

test('unknown forced ids are ignored (lists and migrations unchanged; non-themes never resolve as themes)', () => {
  const { v, m } = unknown;
  assert.deepEqual(revs(v), ['night-pursuit']);
  assert.deepEqual(picker(v), ['night-pursuit', 'chrono-coupe', 'stellar-helm']);
  assert.deepEqual(boot(m, '', 'galactic-enforcer', 'v8-rumble'), { theme: 'night-pursuit', engine: 'night-pursuit' });
  const cat = readFileSync(join(root, 'src/themes/catalog.ts'), 'utf8');
  assert.match(cat, /return THEMES\.some\(\(t\) => t\.id === resolved\) \? resolved : FALLBACK_THEME_ID;/);
  assert.match(cat, /export const FORCED_THEME_IDS[^\n]*FORCED_VISIBLE_IDS\.filter\(\(id\) => THEMES\.some/);
  assert.match(readFileSync(join(root, 'src/packs/registry.ts'), 'utf8'), /export const FORCED_ENGINE_IDS[^\n]*FORCED_VISIBLE_IDS\.filter\(isBuiltinEngine\)/);
});

test('deep links (?pack=) and the theme picker go through the effective allowlist', () => {
  assert.match(readFileSync(join(root, 'src/packs/deepLink.ts'), 'utf8'), /isThemeListed\(p\.themeId\)/);
  assert.match(readFileSync(join(root, 'src/themes/catalog.ts'), 'utf8'), /LISTED_THEMES[^\n]*THEMES\.filter\(\(t\) => isThemeListed\(t\.id\)\)/);
});
