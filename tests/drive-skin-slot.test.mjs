/**
 * DriveSkinSlot: scene patches from src/audio/sceneEngines.ts must resolve to their scene skin
 * (by engine kind), not 'default'. Scene patches no longer carry a `revforge` voice config, so
 * the slot keys off the patch's 'scene' tag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

// Skin overlays import their CSS; stub it so the module loads under node.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'commonjs', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'), { moduleCache: false, jsx: true });
globalThis.AudioWorkletProcessor ??= class {};
globalThis.registerProcessor ??= () => {};
const scenes = await jiti.import(join(root, 'src/audio/sceneEngines.ts'));
const { getBuiltin } = await jiti.import(join(root, 'src/audio/builtins.ts'));
const { skinIdForEngine } = await jiti.import(join(root, 'src/skins/DriveSkinSlot.tsx'));

const SKIN_FOR_KIND = { ice: 'ice-v8', 'ev-whine': 'ev-inverter', aerospace: 'aerospace-f14', scifi: 'ion-twin' };

test('every scene engine patch resolves to its scene skin, not the default', () => {
  assert.equal(scenes.SCENE_ENGINE_SPECS.length, 13);
  for (const spec of scenes.SCENE_ENGINE_SPECS) {
    const id = scenes.scenePatchId(spec.sceneId);
    const patch = getBuiltin(id);
    assert.ok(patch, `missing builtin ${id}`);
    assert.equal(patch.revforge, undefined, `${id} should carry no revforge config`);
    assert.ok(patch.meta?.tags?.includes('scene'), `${id} should be tagged 'scene'`);
    const skin = skinIdForEngine(id);
    assert.notEqual(skin, 'default', `${id} fell back to the default skin`);
    assert.equal(skin, SKIN_FOR_KIND[spec.kind], `${id} (${spec.kind})`);
  }
});

test('spot checks: V8, EV, turbine and Twin Ion scenes', () => {
  assert.equal(skinIdForEngine('revforge-copper-mile'), 'ice-v8');
  assert.equal(skinIdForEngine('revforge-lightline'), 'ev-inverter');
  assert.equal(skinIdForEngine('revforge-deep-transit'), 'aerospace-f14');
  assert.equal(skinIdForEngine('revforge-trenchlight'), 'ion-twin');
});

test('non-scene engines keep their existing mapping', () => {
  assert.equal(skinIdForEngine('night-pursuit'), 'night-pursuit');
  assert.equal(skinIdForEngine('v8-rumble'), 'ice-v8');
  assert.equal(skinIdForEngine('tie-fighter'), 'ion-twin');
  assert.equal(skinIdForEngine('no-such-engine'), 'default');
});
