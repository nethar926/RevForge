// Pack pref migrations (src/packs/migrations.ts). Node 20 has no TS stripping, so the
// pure-data modules are transpiled with the project's `typescript` into a temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'rf-mig-'));
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
const rev = (s) => s.split('').reverse().join('');
const RETIRED = ['saffron-console', 'saffron-command', rev('sdlrow-wen'), rev('esirpretne')];
const THEME = 'drivesynth.theme.v2';
const EXP = 'revforge.packs.experimental';

test('retired saffron themes + legacy ids map straight to stellar-helm (no chains)', () => {
  for (const id of RETIRED) {
    assert.equal(m.PACK_THEME_MIGRATIONS[id], 'stellar-helm', id);
    assert.equal(m.THEME_ID_MIGRATIONS[id], undefined, `${id} must not also be a plain theme rename`);
  }
  const all = { ...m.THEME_ID_MIGRATIONS, ...m.PACK_THEME_MIGRATIONS };
  for (const [from, to] of Object.entries(all)) assert.equal(all[to], undefined, `chain ${from} → ${to} → ${all[to]}`);
});

for (const id of RETIRED) {
  test(`saved theme ${id.includes('saffron') ? id : '(legacy id)'} → stellar-helm, opt-in on, selection returned`, () => {
    store.clear();
    localStorage.setItem(THEME, id);
    localStorage.setItem(EXP, JSON.stringify(['night-pursuit']));
    const select = m.runPackPrefMigrations();
    assert.equal(localStorage.getItem(THEME), 'stellar-helm');
    assert.deepEqual(JSON.parse(localStorage.getItem(EXP)), ['night-pursuit', 'stellar-helm']);
    assert.equal(select, 'stellar-helm');
    assert.equal(localStorage.getItem('revforge.pack.stellar-helm.frame'), null, 'frame stays at its default');
  });
}

test('idempotent; visible themes untouched; hidden road theme → Night Pursuit; Night Pursuit legacy unchanged (no select)', () => {
  store.clear();
  localStorage.setItem(THEME, 'stellar-helm');
  assert.equal(m.runPackPrefMigrations(), '');
  assert.equal(localStorage.getItem(THEME), 'stellar-helm');
  localStorage.setItem(THEME, 'chrono-coupe');
  assert.equal(m.runPackPrefMigrations(), '');
  assert.equal(localStorage.getItem(THEME), 'chrono-coupe');
  // Catalogue trim (Oct 8 2026): road-road-66 is hidden → Night Pursuit (was: left untouched).
  localStorage.setItem(THEME, 'road-road-66');
  assert.equal(m.runPackPrefMigrations(), '');
  assert.equal(localStorage.getItem(THEME), 'night-pursuit');
  localStorage.setItem(THEME, rev('redir-thgin'));
  assert.equal(m.runPackPrefMigrations(), '');
  assert.equal(localStorage.getItem(THEME), 'night-pursuit');
});

test('saved combinations on retired saffron themes move to stellar-helm', () => {
  store.clear();
  localStorage.setItem('drivesynth.combinations.v1', JSON.stringify([
    { id: 'a', name: 'A', skinId: 'saffron-command', sound: { params: {} } },
    { id: 'b', name: 'B', skinId: rev('sdlrow-wen'), sound: { params: {} } },
    { id: 'c', name: 'C', skinId: 'road-road-66', sound: { params: {} } },
  ]));
  m.runPackPrefMigrations();
  const combos = JSON.parse(localStorage.getItem('drivesynth.combinations.v1'));
  // Catalogue trim (Oct 8 2026): the hidden road theme combination now loads Night Pursuit.
  assert.deepEqual(combos.map((c) => c.skinId), ['stellar-helm', 'stellar-helm', 'night-pursuit']);
  assert.deepEqual(JSON.parse(localStorage.getItem(EXP)), ['stellar-helm']);
});
