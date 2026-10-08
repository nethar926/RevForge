/**
 * time-jump cue: total length ≤ 2.0 s including release (clean fade, no step) and an
 * enable/disable preference (default on; off = never fires, rest of the voice unchanged).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { ProceduralCharacter, TIME_JUMP_CUE_SECONDS } = await import('../src/audio/ProceduralCharacter.js');
const prefs = await jiti.import(join(root, 'src/audio/cuePrefs.ts'));
const audio = await jiti.import(join(root, 'src/audio/index.ts'));

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
async function render(withCue) {
  const prev = Math.random;
  Math.random = seeded(42);
  try {
    const sr = 44100;
    const ctx = new OfflineAudioContext(1, sr * 3, sr);
    const fx = new ProceduralCharacter(ctx, ctx.destination);
    fx.configure({ lifecycleLevel: 1 }, 'scifi');
    if (withCue) fx.cue('time-jump');
    return (await ctx.startRendering()).getChannelData(0);
  } finally {
    Math.random = prev;
  }
}

test('time-jump cue lasts ≤ 2.0 s including release, ends in a fade (no click)', async () => {
  assert.equal(TIME_JUMP_CUE_SECONDS, 2);
  const [a, b] = [await render(true), await render(false)];
  const sr = 44100;
  const d = Float64Array.from(a, (v, i) => v - b[i]);
  const peak = (from, to) => { let p = 0; for (let i = Math.round(from * sr); i < Math.round(to * sr); i++) p = Math.max(p, Math.abs(d[i])); return p; };
  const body = peak(0, 1.5);
  assert.ok(body > 1e-3, `cue audible (${body})`);
  assert.ok(peak(2.0, 3.0) < 1e-6, `nothing after 2.0 s (${peak(2.0, 3.0)})`);
  assert.ok(peak(1.9, 2.0) < body * 1e-3, 'release fades to silence (no step at the end)');
  const src = readFileSync(join(root, 'src/audio/ProceduralCharacter.js'), 'utf8');
  assert.doesNotMatch(src, /time-jump'\?2\.4/);
});

test('time-jump enable/disable: default on, off never fires, in memory only (no storage)', () => {
  const touched = [];
  const spy = new Proxy({}, { get: (_, k) => { touched.push(String(k)); return () => null; } });
  globalThis.localStorage = spy;
  globalThis.sessionStorage = spy;
  try {
    assert.equal(prefs.getTimeJumpCueEnabled(), true);
    const changes = [];
    const off = prefs.onTimeJumpCueChange((on) => changes.push(on));
    const ctx = allowShaperReassign(new OfflineAudioContext(2, 128, 44100));
    const eng = audio.createEngineSynth(ctx, audio.getBuiltin('v8-rumble'));
    const cues = [];
    const realCue = eng.fx.cue.bind(eng.fx);
    eng.fx.cue = (t) => { cues.push(t); realCue(t); };
    eng.triggerUiCue('time-jump');
    eng.setTimeJumpCueEnabled(false);
    assert.equal(eng.getTimeJumpCueEnabled(), false);
    assert.equal(prefs.getTimeJumpCueEnabled(), false);
    eng.triggerUiCue('time-jump');
    eng.triggerUiCue('ion-cannon'); // other cues unaffected (routed as before)
    prefs.setTimeJumpCueEnabled(true);
    eng.triggerUiCue('time-jump');
    assert.deepEqual(cues.filter((c) => c === 'time-jump').length, 2);
    assert.ok(cues.includes('ion-cannon'));
    assert.deepEqual(changes, [false, true], 'change listener for Frontend persistence');
    off();
    eng.dispose();
    const cueSrc = readFileSync(join(root, 'src/audio/cuePrefs.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(cueSrc, /localStorage|sessionStorage|indexedDB/);
    assert.deepEqual(touched.filter((k) => /cue|time/i.test(k)), [], 'no cue storage access');
  } finally {
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  }
});

test('time-jump API is exposed on the hook and the non-React session', () => {
  const hook = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(hook, /setTimeJumpCueEnabled,\s*\n\s*getTimeJumpCueEnabled,/);
  const ps = readFileSync(join(root, 'src/audio/playbackSession.ts'), 'utf8');
  assert.match(ps, /setTimeJumpCueEnabled\(on: boolean\): void/);
  assert.match(ps, /getTimeJumpCueEnabled\(\): boolean/);
});
