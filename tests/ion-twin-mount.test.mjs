// Twin Ion CJ-grid mount (frontend/twin-ion): routing, lock-stage mapping, hidden flag, layout pick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const requireFromRoot = createRequire(join(root, 'package.json'));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const ENGINES = ['ion-twin', 'night-pursuit', 'chrono-coupe', 'stellar-helm', 'aerospace-f14', 'v8-rumble'];
const STUBS = {
  'audio/builtins': `export const BUILTIN_PATCHES = ${JSON.stringify(ENGINES.map((id) => ({ id, name: id, params: {} })))};\nexport const getBuiltin = (id) => BUILTIN_PATCHES.find((p) => p.id === id);`,
  'packs/mounts/NightPursuitMount': 'export function NightPursuitMount() { return null; }',
  'packs/mounts/IonTwinMount': 'export function IonTwinMount() { return null; }',
  'skins/ion-twin/IonTwinBoard': `export function IonTwinBoard(props) { (globalThis.__ionBoardCalls ??= []).push(props); return null; }`,
  'skins/ion-twin/assets/scope-1280.png': 'export default "scope-1280.png";',
  'skins/ion-twin/assets/scope-773.png': 'export default "scope-773.png";',
  'skins/ion-twin/assets/map.png': 'export default "map.png";',
};

let n = 0;
async function load(entry, env = {}, stubs = STUBS) {
  const key = `__RF_ION_ENV_${n++}__`;
  globalThis[key] = env;
  const out = mkdtempSync(join(tmpdir(), 'rf-ion-'));
  const done = new Set();
  const emit = (rel) => {
    if (done.has(rel)) return;
    done.add(rel);
    const dest = join(out, `${rel}.mjs`);
    mkdirSync(dirname(dest), { recursive: true });
    if (stubs[rel] != null) return writeFileSync(dest, stubs[rel]);
    if (rel.endsWith('.css') || rel.endsWith('.png') || rel.endsWith('.webp') || rel.endsWith('.woff2')) {
      return writeFileSync(dest, rel.endsWith('.png') || rel.endsWith('.webp') || rel.endsWith('.woff2') ? 'export default "";' : '');
    }
    const file = ['.ts', '.tsx'].map((x) => join(src, rel + x)).find(existsSync);
    assert.ok(file, `missing ${rel}`);
    let js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false },
      fileName: file,
    }).outputText;
    js = js.replace(/import\.meta\.glob\('\.\/\*\.pack\.ts', \{ eager: true \}\)/, "{ './ion-twin.pack.ts': __ionTwinPack }");
    if (js.includes('__ionTwinPack')) js = `import * as __ionTwinPack from './ion-twin.pack.mjs';\n${js}`;
    js = js.replace(/import\.meta\.env/g, `globalThis.${key}`);
    js = js.replace(/(from\s+|import\s*\(\s*|import\s+)['"](\.\.?\/[^'"]+)['"]/g, (full, kw, spec) => {
      if (String(kw).includes('import(')) return full;
      const abs = resolve(dirname(join(src, rel)), spec);
      const clean = relative(src, abs).replace(/\.(tsx?|mjs)$/, '');
      emit(clean);
      const target = relative(dirname(join(out, rel)), join(out, `${clean}.mjs`)).replace(/\\/g, '/');
      const prefix = String(kw).trim() === 'import' ? 'import ' : kw;
      return `${prefix}'${target.startsWith('.') ? target : `./${target}`}'`;
    });
    js = js.replace(/(from\s+|import\s+)['"](react[^'"]*)['"]/g, (_, kw, spec) => `${kw}'${pathToFileURL(requireFromRoot.resolve(spec)).href}'`);
    writeFileSync(dest, js);
  };
  emit(entry);
  return import(pathToFileURL(join(out, `${entry}.mjs`)).href);
}

const FORCED = { VITE_PREVIEW_SLUG: 'ion-twin', VITE_FORCE_VISIBLE: 'ion-twin' };
const normal = await load('packs/registry', {});
const forced = await load('packs/registry', FORCED);
const nVis = await load('themes/visibility', {});
const fVis = await load('themes/visibility', FORCED);
const helper = await load('packs/ionTwin', {});
const layouts = await load('packs/ion-twin/layouts', {});
const cells = await load('packs/ion-twin/cells', {});

test('hidden flag: normal build is unchanged (theme hidden, engine unbound, still 3 listed engines)', () => {
  assert.equal(nVis.isThemeListed('ion-twin'), false);
  assert.equal(nVis.isEngineListed('ion-twin'), false);
  assert.deepEqual([...nVis.VISIBLE_ENGINE_IDS].sort(), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
  assert.deepEqual(ENGINES.filter((id) => normal.isEngineIdVisible(id)).sort(), ['chrono-coupe', 'night-pursuit', 'stellar-helm']);
  const pack = normal.getPack('ion-twin');
  assert.ok(pack, 'pack registered');
  assert.equal(pack.ownsEngine, false);
  assert.equal(normal.packForEngineId('ion-twin'), undefined, 'picking the engine never switches theme');
  assert.equal(normal.isThemeIdVisible('ion-twin'), false);
  assert.equal(normal.packForEngineId('night-pursuit')?.id, 'night-pursuit');
});

test('hidden flag: VITE_FORCE_VISIBLE=ion-twin lists the theme and binds the engine to the pack', () => {
  assert.equal(fVis.isThemeListed('ion-twin'), true);
  assert.equal(fVis.isEngineListed('ion-twin'), true);
  const pack = forced.packForEngineId('ion-twin');
  assert.equal(pack?.id, 'ion-twin');
  assert.equal(pack.themeId, 'ion-twin');
  assert.equal(pack.displayName, 'Twin Ion');
  assert.equal(pack.ownsEngine, true);
  assert.equal(pack.experimental, true);
  assert.equal(pack.reducedMotion, 'freeze');
  assert.equal(forced.packForEngineId('night-pursuit')?.id, 'night-pursuit');
});

test('routing: the ion-twin theme mounts IonTwinMount through ThemeStage (ForgePage)', () => {
  const pack = forced.packForThemeId('ion-twin');
  assert.equal(pack.Hud.name, 'IonTwinMount');
  const stage = read('src/themes/ThemeStage.tsx');
  assert.match(stage, /lockStage=\{packEngine\?\.lockStage\} engineState=\{packEngine\?\.engineState\} demoThrottle=\{packEngine\?\.demoThrottle\} stale=\{packEngine\?\.stale\}/);
  const forge = read('src/forge/ForgePage.tsx');
  assert.match(forge, /packWantsEngineTelemetry\(activePackId\)\?\{\.\.\.readIonEngine\(audio\.getEngine\(\)\),demoThrottle:source==='demo'\?pedal:undefined,stale:source==='gps'&&gps\.status!=='live'\}/);
  const mount = read('src/packs/mounts/IonTwinMount.tsx');
  assert.match(mount, /from '\.\.\/\.\.\/skins\/ion-twin\/IonTwinBoard'/);
  for (const banned of ['DriveSkinSlot', 'DrivePage', 'RevPad', 'nextIonLockStage', 'nextLockStage', 'backdrop-filter', '<canvas']) {
    assert.ok(!mount.includes(banned), `IonTwinMount must not use ${banned}`);
  }
  assert.ok(!read('src/packs/mounts/ion-twin-mount.css').includes('backdrop-filter:'), 'no backdrop-filter in mount CSS');
  assert.equal(helper.packWantsEngineTelemetry('ion-twin'), true);
  for (const id of ['night-pursuit', 'carrier-jet', 'stellar-helm', 'chrono-coupe', undefined]) {
    assert.equal(helper.packWantsEngineTelemetry(id), false, String(id));
  }
});

test('lock-stage mapping: ionLockStage / ionRpmNorm / ionLadderLit', () => {
  assert.equal(helper.ionLockStage('lock', true), 'lock');
  assert.equal(helper.ionLockStage('lock', false), 'none');
  assert.equal(helper.ionLockStage('nope', true), 'none');
  assert.equal(helper.ionRpmNorm(0.55, { rpmNorm: 0.8 }), 0.8);
  assert.equal(helper.ionRpmNorm(0.55, {}), 0.55);
  assert.equal(helper.ionRpmNorm(0.55, null), 0.55);
  assert.equal(helper.ionLadderLit('none'), 'scan');
  assert.equal(helper.ionLadderLit('identified'), 'ident');
  assert.equal(helper.ionLadderLit('lock'), 'lock');
  assert.equal(helper.ionLadderLit('kill'), 'lock');
});

test('readIonEngine: lockStage from getHud, engineState optional', () => {
  const a = helper.readIonEngine({
    getHud: () => ({ lockStage: 'identified', rpmNorm: 0.6 }),
    getEngineState: () => ({ rpm: 5000, throttle: 0.4, load: 0.5, rpmNorm: 0.61 }),
  });
  assert.equal(a.lockStage, 'identified');
  assert.equal(a.engineState.rpmNorm, 0.61);
  assert.deepEqual(helper.readIonEngine(null), { lockStage: 'none' });
  assert.equal(helper.readIonEngine({ getHud: () => ({ lockStage: 'bogus' }) }).lockStage, 'none');
});

test('layout: pickTiSize + grid cells for board/window', () => {
  assert.equal(layouts.pickTiSize(1280, 800, false), 'd1280');
  assert.equal(layouts.pickTiSize(1024, 705, false), 'd1024');
  assert.equal(layouts.pickTiSize(773, 601, true), 'd773');
  assert.equal(layouts.pickTiSize(844, 390, true), 'd773', '844 falls to window; out of scope for dedicated layout');
  assert.equal(cells.TI_GRID.id, 'ion-twin');
  assert.equal(cells.TI_GRID.layouts.board.kind, 'rects');
  assert.equal(cells.TI_GRID.layouts.window.kind, 'rects');
  assert.equal(cells.TI_GRID.layouts.portrait, null);
  assert.equal(layouts.TI_CELLS.d1024.map.width, 382);
  assert.equal(layouts.TI_CELLS.d1024.map.height, 382);
  assert.equal(layouts.TI_SCOPE.d1280.asset, '1280');
  assert.equal(layouts.TI_SCOPE.d773.asset, '773');
});

test('scope assets present (v3.2 pixel-identical crops)', () => {
  for (const f of [
    'src/skins/ion-twin/assets/scope-1280.png',
    'src/skins/ion-twin/assets/scope-773.png',
    'src/skins/ion-twin/assets/scope-original-1280.png',
    'src/skins/ion-twin/assets/scope-original-773.png',
    'src/skins/ion-twin/assets/map.png',
  ]) {
    assert.ok(existsSync(join(root, f)), f);
  }
});

test('mount renders IonTwinBoard with lock stage and labelled controls', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const stubs = { ...STUBS };
  delete stubs['packs/mounts/IonTwinMount'];
  const { IonTwinMount } = await load('packs/mounts/IonTwinMount', {}, stubs);
  globalThis.__ionBoardCalls = [];
  const html = renderToStaticMarkup(
    React.createElement(IonTwinMount, {
      rpmNorm: 0.75,
      rpm: 7200,
      speedNorm: 0.5,
      speed: 57,
      unit: 'mph',
      load: 0.8,
      throttle: 1,
      gear: 6,
      distanceM: 0,
      shifting: false,
      overrun: false,
      running: true,
      demo: true,
      redlineRpm: 9000,
      motion: true,
      lockStage: 'lock',
      engineState: { rpm: 7200, throttle: 1, load: 0.9 },
    }),
  );
  assert.match(html, /data-skin="ion-twin"/);
  assert.match(html, /data-lock-stage="lock"/);
  assert.ok(globalThis.__ionBoardCalls.length >= 1);
  const props = globalThis.__ionBoardCalls.at(-1);
  assert.equal(props.lockStage, 'lock');
  assert.equal(props.power, 'on');
  assert.equal(props.speed, 57);
});
