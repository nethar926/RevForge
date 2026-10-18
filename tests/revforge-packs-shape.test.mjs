// Dribe cleanup v2 (Oct 18 2026): scene audio is owned by src/audio/sceneEngines.ts, so the scene
// catalogue JSON keeps only what the art (forge/scenes.js) and the scene lookup read: id, scene, palette.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const packs = JSON.parse(read('src/forge/revforge-packs.json'));

const SOUND_FIELDS = ['voice', 'cylinders', 'firing', 'idleRpm', 'redline', 'rumble', 'growl', 'metallic', 'air', 'exhaust', 'rasp', 'body', 'turbo', 'turboPitch', 'blowoff', 'crackle', 'distortion'];
const GEAR_FIELDS = ['gears', 'shiftRpm', 'finalDrive', 'hasManual'];

/** Every key at any depth of a JSON value. */
function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  return out;
}

test('revforge-packs.json: no sound field remains at any depth', () => {
  assert.equal(packs.length, 13);
  const keys = keysDeep(packs);
  for (const field of SOUND_FIELDS) assert.equal(keys.has(field), false, `sound field "${field}" is back in revforge-packs.json`);
});

test('revforge-packs.json: no engine block or gear fields; only id, scene, palette', () => {
  const keys = keysDeep(packs);
  for (const field of ['engine', ...GEAR_FIELDS]) assert.equal(keys.has(field), false, `"${field}" is back in revforge-packs.json`);
  for (const p of packs) {
    assert.deepEqual(Object.keys(p).sort(), ['id', 'palette', 'scene'], p.id);
    assert.equal(typeof p.scene, 'string', p.id);
    for (const [k, v] of Object.entries(p.palette)) assert.match(v, /^#[0-9a-f]{6}$/i, `${p.id} palette.${k}`);
  }
});

test('every scene in the JSON has an audio-owned scene engine', () => {
  const specs = new Set([...read('src/audio/sceneEngines.ts').matchAll(/sceneId: '([a-z0-9-]+)'/g)].map((m) => m[1]));
  assert.deepEqual(new Set(packs.map((p) => p.id)), specs);
});

test('forge/catalog.ts no longer builds scene patches from the JSON', () => {
  const src = read('src/forge/catalog.ts');
  assert.doesNotMatch(src, /REVFORGE_PATCHES/);
  assert.doesNotMatch(src, /function scenePatch\b/);
  assert.doesNotMatch(src, /\.engine\b/);
});
