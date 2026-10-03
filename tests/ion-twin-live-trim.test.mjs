/**
 * Twin Ion −2 dB LIVE level (HIG loudness; preview/hig only, pending Wilson A/B).
 * Post-dynamics trim on CharacterEngine.output: level only, timbre/dynamics untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { OfflineAudioContext } from 'node-web-audio-api';
import { allowShaperReassign } from './fixtures/reassignable-shaper.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': join(root, 'tests/fixtures/worklet-url-stub.mjs') },
});
globalThis.window ??= globalThis;
const audio = await jiti.import(join(root, 'src/audio/index.ts'));
const trim = await jiti.import(join(root, 'src/audio/liveTrim.ts'));
const { CharacterEngine, CHARACTER_OUTPUT_GAIN } = await jiti.import(join(root, 'src/audio/CharacterEngine.ts'));

const outGain = (id) => {
  const ctx = allowShaperReassign(new OfflineAudioContext(2, 128, 44100));
  const eng = audio.createEngineSynth(ctx, audio.getBuiltin(id));
  const g = eng.output.gain.value;
  eng.dispose();
  return g;
};

test('ion-twin live output is exactly −2 dB; other packs unchanged', () => {
  assert.equal(trim.liveTrimDb({ topology: 'ion-twin' }), -2);
  assert.equal(trim.liveTrimDb({ topology: 'tie-fighter' }), -2, 'legacy topology id');
  assert.ok(Math.abs(outGain('ion-twin') - CHARACTER_OUTPUT_GAIN * 10 ** (-2 / 20)) < 1e-6);
  for (const id of ['v8-rumble', 'ev-whine', 'aerospace-f14', 'night-pursuit', 'revforge-apex-v8'])
    assert.ok(Math.abs(outGain(id) - CHARACTER_OUTPUT_GAIN) < 1e-6, id);
});

test('a Twin Ion voice used as a layer inside another pack is not trimmed', () => {
  const ctx = allowShaperReassign(new OfflineAudioContext(2, 128, 44100));
  const patch = audio.getBuiltin('ion-twin');
  const base = new audio.EngineSynthImpl(ctx, patch);
  const layer = new CharacterEngine(base, patch, () => { throw new Error('unused'); }, { layer: true });
  assert.ok(Math.abs(layer.output.gain.value - CHARACTER_OUTPUT_GAIN) < 1e-6);
  layer.dispose();
});

test('trim sits after every dynamics stage (output gain), not on masterGain', () => {
  const p = audio.getBuiltin('ion-twin');
  assert.equal(p.params.masterGain, audio.defaultsForTopology('ion-twin').masterGain, 'voice params untouched');
});
