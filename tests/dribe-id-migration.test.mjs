// Dribe scene catalogue retired (Oct 18 2026): every old scene / engine / RoadView theme id that a
// saved profile, combination, custom preset or deep link can hold maps to the new original id,
// and nothing else in the profile is lost. Same transpile loader as pack-migrations.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'rf-dribe-'));
for (const rel of ['packs/migrations', 'packs/stellar-helm.identity', 'packs/chrono-coupe.identity', 'themes/visibility', 'lib/storageKey', 'forge/sceneLabels']) {
  let js = ts.transpileModule(readFileSync(join(root, 'src', `${rel}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  js = js.replace(/from '(\.\.?\/[^']+)'/g, "from '$1.mjs'");
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, `${rel}.mjs`), js);
}
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
const m = await import(pathToFileURL(join(out, 'packs/migrations.mjs')).href);
const labels = await import(pathToFileURL(join(out, 'forge/sceneLabels.mjs')).href);
const packs = JSON.parse(readFileSync(join(root, 'src/forge/revforge-packs.json'), 'utf8'));
const read = (k) => JSON.parse(localStorage.getItem(k));

const OLD_TO_NEW = {
  'road-66': 'copper-mile', 'apex-v8': 'ember-dusk', 'neon-drive': 'violet-grid', italia: 'azure-bend',
  miami: 'pink-current', autobahn: 'silver-run', 'dual-surge': 'lightline', 'dune-runner': 'sandwake',
  alpine: 'frostpass', starliner: 'deep-transit', 'sakura-gtr': 'blossom-run',
};

test('RETIRED_SCENE_IDS: all 11 old ids + tie-fighter → existing scenes, no chains', () => {
  assert.deepEqual(m.RETIRED_SCENE_IDS, { 'tie-fighter': 'trenchlight', ...OLD_TO_NEW });
  const ids = new Set(packs.map((p) => p.id));
  for (const [from, to] of Object.entries(m.RETIRED_SCENE_IDS)) {
    assert.ok(ids.has(to), `${from} → ${to} must be a scene in revforge-packs.json`);
    assert.equal(ids.has(from), false, `${from} must no longer be a scene id`);
    assert.equal(m.RETIRED_SCENE_IDS[to], undefined, `chain ${from} → ${to}`);
  }
});

test('engine ids revforge-<old> and theme ids road-<old> map to the new ids (and the older plaid ids skip straight there)', () => {
  for (const [from, to] of Object.entries(OLD_TO_NEW)) {
    assert.equal(m.PACK_ENGINE_MIGRATIONS[`revforge-${from}`], `revforge-${to}`);
    assert.equal(m.THEME_ID_MIGRATIONS[`road-${from}`], `road-${to}`);
  }
  const rev = (s) => s.split('').reverse().join('');
  assert.equal(m.PACK_ENGINE_MIGRATIONS[rev('dialp-egrofver')], 'revforge-lightline');
  assert.equal(m.THEME_ID_MIGRATIONS[rev('dialp-daor')], 'road-lightline');
  for (const to of Object.values(m.PACK_ENGINE_MIGRATIONS)) assert.equal(m.PACK_ENGINE_MIGRATIONS[to], undefined, `engine chain → ${to}`);
  for (const to of Object.values(m.THEME_ID_MIGRATIONS)) assert.equal(m.THEME_ID_MIGRATIONS[to], undefined, `theme chain → ${to}`);
});

test('a saved profile using the old ids loads with every setting carried to the new ids', () => {
  store.clear();
  const prefs = { selectedEngineId: 'revforge-apex-v8', speedUnit: 'kph', gearCount: 5, maxTopSpeedMph: 140, idleRpmMin: 820 };
  localStorage.setItem('drivesynth.ui.v1', JSON.stringify(prefs));
  localStorage.setItem('drivesynth.theme.v2', 'chrono-coupe');
  localStorage.setItem('revforge.atmosphere', 'road-road-66');
  localStorage.setItem('revforge.fonts', JSON.stringify({ 'road-road-66': { numbers: 'oswald', labels: 'default' }, 'chrono-coupe': { numbers: 'default', labels: 'oswald' } }));
  localStorage.setItem('revforge.colors', JSON.stringify({ 'road-sakura-gtr': { accent: '#112233' }, 'road-road-66-scene': { skyTop: '#000011' }, 'night-pursuit': { accent: '#ff0000' } }));
  const combo = {
    id: 'c1', name: 'My mix', skinId: 'night-pursuit', atmosphereId: 'road-alpine',
    widgets: [{ id: 'speed' }],
    fonts: { 'road-miami': { numbers: 'oswald', labels: 'default' } },
    colors: { 'road-alpine-scene': { haze: '#abcdef' }, 'road-miami': { accent: '#445566' } },
    sound: { id: 'user-combination-c1', name: 'Mine', kind: 'ice', params: { growl: 0.5 }, revforge: { idleRpm: 780, gears: 6 } },
  };
  localStorage.setItem('drivesynth.combinations.v1', JSON.stringify([combo]));

  assert.equal(m.runPackPrefMigrations(), '');

  assert.deepEqual(read('drivesynth.ui.v1'), { ...prefs, selectedEngineId: 'revforge-ember-dusk' }, 'last-used engine re-keyed, other prefs untouched');
  assert.equal(localStorage.getItem('drivesynth.theme.v2'), 'chrono-coupe');
  assert.equal(localStorage.getItem('revforge.atmosphere'), 'road-copper-mile');
  assert.deepEqual(read('revforge.fonts'), { 'road-copper-mile': { numbers: 'oswald', labels: 'default' }, 'chrono-coupe': { numbers: 'default', labels: 'oswald' } });
  assert.deepEqual(read('revforge.colors'), { 'road-blossom-run': { accent: '#112233' }, 'road-copper-mile-scene': { skyTop: '#000011' }, 'night-pursuit': { accent: '#ff0000' } });
  const [c] = read('drivesynth.combinations.v1');
  assert.deepEqual(c, {
    ...combo,
    atmosphereId: 'road-frostpass',
    fonts: { 'road-pink-current': { numbers: 'oswald', labels: 'default' } },
    colors: { 'road-frostpass-scene': { haze: '#abcdef' }, 'road-pink-current': { accent: '#445566' } },
  }, 'custom combination keeps its name, widgets and sound');

  // Idempotent: a second boot changes nothing.
  const snapshot = new Map(store);
  m.runPackPrefMigrations();
  assert.deepEqual(new Map(store), snapshot);
});

test('every old engine id a profile can hold as last-used maps forward', () => {
  for (const [from, to] of Object.entries(OLD_TO_NEW)) {
    store.clear();
    localStorage.setItem('drivesynth.ui.v1', JSON.stringify({ selectedEngineId: `revforge-${from}` }));
    m.runPackPrefMigrations();
    assert.equal(read('drivesynth.ui.v1').selectedEngineId, `revforge-${to}`, from);
  }
});

test('a saved old road theme still resolves through the trim rule (hidden → Night Pursuit)', () => {
  store.clear();
  localStorage.setItem('drivesynth.theme.v2', 'road-road-66');
  m.runPackPrefMigrations();
  assert.equal(localStorage.getItem('drivesynth.theme.v2'), 'night-pursuit');
});

test('placeholder labels: one entry per re-keyed scene, in sheet order, no retired copy', () => {
  assert.deepEqual(Object.keys(labels.SCENE_LABELS), Object.values(OLD_TO_NEW));
  const ids = packs.map((p) => p.id);
  for (const id of ids) assert.ok(labels.sceneLabel(id).name, `${id} has a label`);
  for (const p of packs) assert.equal('name' in p || 'tagline' in p, false, `${p.id}: copy lives in sceneLabels.ts, not the JSON`);
  const copy = JSON.stringify(labels.SCENE_LABELS);
  for (const bad of ['Road 66', 'Apex', 'Neon Drive', '458', 'Italia', 'Miami', 'Autobahn', 'Plaid', 'Dune Runner', 'Alpine', 'Starliner', 'Sakura', 'GTR', 'limiter', 'Petals', 'Pagoda', 'Resonance']) {
    assert.equal(copy.includes(bad), false, bad);
  }
});

test('old ids stay out of the shipped sources as plain strings (reversed in migrations.ts)', () => {
  const sources = ['src/packs/migrations.ts', 'src/forge/catalog.ts', 'src/forge/sceneLabels.ts', 'src/themes/catalog.ts', 'src/themes/ThemeStage.tsx', 'src/forge/scenes.js', 'src/forge/revforge-packs.json'];
  for (const rel of sources) {
    const src = readFileSync(join(root, rel), 'utf8');
    for (const old of Object.keys(OLD_TO_NEW)) {
      assert.equal(new RegExp(`['"\`]${old}['"\`]|road-${old}\\b|revforge-${old}\\b`).test(src), false, `${rel} still has ${old}`);
    }
    for (const key of ['route66', 'sakura', 'starliner', 'desert', 'alpine']) assert.equal(new RegExp(`['"\`]${key}['"\`]`).test(src), false, `${rel} still has scene key ${key}`);
  }
});

test('theme RoadView sceneIds all exist; no default scene, no splash backdrop', () => {
  const cat = readFileSync(join(root, 'src/themes/catalog.ts'), 'utf8');
  const ids = new Set(packs.map((p) => p.id));
  const roads = cat.slice(cat.indexOf('const roads = ['), cat.indexOf('for(const [id,name,accent,group] of roads)'));
  const sceneIds = [...roads.matchAll(/\['([a-z0-9-]+)',/g)].map((x) => x[1]);
  assert.equal(sceneIds.length, 13);
  for (const id of sceneIds) assert.ok(ids.has(id), id);
  assert.match(cat, /export const DEFAULT_ATMOSPHERE = '';/);
  assert.match(cat, /export const SPLASH_BACKDROP_THEME: string \| null = null;/);
  for (const rel of ['src/forge/ForgePage.tsx', 'src/forge/NativeStudio.tsx', 'src/forge/EngineSetup.tsx', 'src/themes/ExperienceBuilder.tsx', 'src/themes/ThemeStage.tsx', 'src/themes/ThemeColors.tsx']) {
    assert.equal(/sceneForId\(\s*['"]/.test(readFileSync(join(root, rel), 'utf8')), false, `${rel}: no hard-coded default scene`);
  }
});
