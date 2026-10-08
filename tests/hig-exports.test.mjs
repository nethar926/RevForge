/**
 * HIG playback port: the exact names / API shapes Frontend's wiring detects, and the audio
 * layer stays storage-free (the host hook supplies the legacy media flag).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': join(root, 'tests/fixtures/worklet-url-stub.mjs') },
});
globalThis.window ??= globalThis;
const src = (p) => readFileSync(join(root, p), 'utf8');

test('cuePrefs exports get/set/onTimeJumpCueChange (in-memory, notifies, unsubscribes)', async () => {
  const prefs = await jiti.import(join(root, 'src/audio/cuePrefs.ts'));
  for (const k of ['getTimeJumpCueEnabled', 'setTimeJumpCueEnabled', 'onTimeJumpCueChange']) assert.equal(typeof prefs[k], 'function', k);
  const seen = [];
  const off = prefs.onTimeJumpCueChange((on) => seen.push(on));
  const was = prefs.getTimeJumpCueEnabled();
  prefs.setTimeJumpCueEnabled(!was);
  off();
  prefs.setTimeJumpCueEnabled(was);
  assert.deepEqual(seen, [!was]);
  assert.equal(prefs.getTimeJumpCueEnabled(), was);
});

test('TIME_JUMP_CUE_SECONDS = 2 exported from ProceduralCharacter.js and .d.ts', async () => {
  const pc = await import('../src/audio/ProceduralCharacter.js');
  assert.equal(pc.TIME_JUMP_CUE_SECONDS, 2);
  assert.match(src('src/audio/ProceduralCharacter.d.ts'), /export const TIME_JUMP_CUE_SECONDS\s*:\s*number/);
});

test('setTimeJumpCueEnabled on the engine type, CharacterEngine and PlaybackSession', async () => {
  assert.match(src('src/audio/types.ts'), /setTimeJumpCueEnabled\?\(on: boolean\): void/);
  const { CharacterEngine } = await jiti.import(join(root, 'src/audio/CharacterEngine.ts'));
  assert.equal(typeof CharacterEngine.prototype.setTimeJumpCueEnabled, 'function');
  const PS = await jiti.import(join(root, 'src/audio/playbackSession.ts'));
  assert.equal(typeof PS.PlaybackSession.prototype.setTimeJumpCueEnabled, 'function');
  assert.equal(typeof PS.PlaybackSession.prototype.setLegacyMediaFlagReader, 'function');
});

test('useAudioEngine exposes timeJumpCue, setTimeJumpCueEnabled and subscribes to onTimeJumpCueChange', () => {
  const hook = src('src/hooks/useAudioEngine.ts');
  assert.match(hook, /\btimeJumpCue,/);
  assert.match(hook, /\bsetTimeJumpCueEnabled,/);
  assert.match(hook, /onTimeJumpCueChange\(/);
  assert.match(hook, /setLegacyMediaFlagReader\(/, 'legacy media flag supplied by the hook');
});

test('HIG playback files never touch storage; no Twin Ion live trim', () => {
  for (const f of ['playbackSession.ts', 'previewPlayer.ts', 'previewTrims.ts', 'cuePrefs.ts', 'CharacterEngine.ts', 'MediaOutput.ts']) {
    const code = src(`src/audio/${f}`).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/i, f);
  }
  assert.doesNotMatch(src('src/audio/previewTrims.ts'), /ion-twin/);
  assert.doesNotMatch(src('src/audio/playbackSession.ts') + src('src/audio/previewPlayer.ts'), new RegExp(['ion', 'twin', 'live', 'trim'].join('-')));
});
