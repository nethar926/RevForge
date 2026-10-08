/**
 * Twin Ion −2 dB LIVE level (HIG loudness; preview/hig only, pending Wilson A/B).
 * Applied by the master bus AFTER the limiter + soft ceiling, so the output is exactly −2 dB vs
 * untrimmed at idle, cruise and full throttle (even when the limiter is engaged). Other packs
 * are bit-identical with or without the trim. The engine voice itself is untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { OfflineAudioContext } from 'node-web-audio-api';
import { allowShaperReassign } from './fixtures/reassignable-shaper.mjs';
import { integratedLufs, samplePeakDb } from '../scripts/loudness.mjs';
import { renderLive, throughMaster } from '../scripts/live-render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': join(root, 'tests/fixtures/worklet-url-stub.mjs') },
});
globalThis.window ??= globalThis;
const audio = await jiti.import(join(root, 'src/audio/index.ts'));
const trim = await jiti.import(join(root, 'src/audio/liveTrim.ts'));
const PS = await jiti.import(join(root, 'src/audio/playbackSession.ts'));
const { CharacterEngine, CHARACTER_OUTPUT_GAIN } = await jiti.import(join(root, 'src/audio/CharacterEngine.ts'));

const FULL = () => ({ speed: 0.9, throttle: 1, load: 1 });
const settled = (buf) => Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).subarray(Math.round(2 * buf.sampleRate)));
const level = (buf) => { const ch = settled(buf); return { lufs: integratedLufs(ch, buf.sampleRate), peak: samplePeakDb(ch) }; };

test('trim table: ion-twin (and legacy tie-fighter id) −2 dB, keyed by active pack id only', () => {
  assert.equal(trim.liveTrimDb({ id: 'ion-twin' }), -2);
  assert.equal(trim.liveTrimDb({ id: 'tie-fighter' }), -2, 'legacy pack id');
  assert.equal(trim.liveTrimDb(audio.getBuiltin('revforge-trenchlight')), 0, 'same topology, different pack: untrimmed');
  for (const p of audio.BUILTIN_PATCHES) if (p.id !== 'ion-twin') assert.equal(trim.liveTrimDb(p), 0, p.id);
});

test('engine voice untouched: CharacterEngine output stays at CHARACTER_OUTPUT_GAIN for every pack', () => {
  for (const id of ['ion-twin', 'v8-rumble', 'ev-whine']) {
    const ctx = allowShaperReassign(new OfflineAudioContext(2, 128, 44100));
    const eng = audio.createEngineSynth(ctx, audio.getBuiltin(id));
    assert.ok(Math.abs(eng.output.gain.value - CHARACTER_OUTPUT_GAIN) < 1e-6, id);
    eng.dispose();
  }
  const ctx = allowShaperReassign(new OfflineAudioContext(2, 128, 44100));
  const patch = audio.getBuiltin('ion-twin');
  const layer = new CharacterEngine(new audio.EngineSynthImpl(ctx, patch), patch, () => { throw new Error('unused'); }, { layer: true });
  assert.equal(layer.getDiag().liveTrim, undefined, 'a Twin Ion layer inside another pack carries no trim');
  layer.dispose();
  assert.equal(patch.params.masterGain, audio.defaultsForTopology('ion-twin').masterGain, 'voice params untouched');
});

test('build marker: ion-twin diag carries the live-trim marker; others do not', () => {
  assert.equal(trim.liveTrimMarker({ id: 'ion-twin' }), 'ion-twin-live-trim:-2dB');
  assert.equal(trim.liveTrimMarker({ id: 'v8-rumble' }), undefined);
  const diag = (id) => {
    const ctx = allowShaperReassign(new OfflineAudioContext(2, 128, 44100));
    const eng = audio.createEngineSynth(ctx, audio.getBuiltin(id));
    const d = eng.getDiag();
    eng.dispose();
    return d;
  };
  assert.equal(diag('ion-twin').liveTrim, 'ion-twin-live-trim:-2dB');
  assert.equal(diag('v8-rumble').liveTrim, undefined);
});

test('Twin Ion at full throttle through the master limiter: −2 dB ±0.3 vs untrimmed (LUFS and peak)', async () => {
  const off = level(await renderLive('ion-twin', FULL, 6, { master: true, liveTrim: false }));
  const on = level(await renderLive('ion-twin', FULL, 6, { master: true }));
  assert.ok(Math.abs(on.lufs - off.lufs + 2) <= 0.3, `ΔLUFS ${(on.lufs - off.lufs).toFixed(2)}`);
  assert.ok(Math.abs(on.peak - off.peak + 2) <= 0.3, `Δpeak ${(on.peak - off.peak).toFixed(2)}`);
});

test('exact even when the limiter is engaged (+8 dB hot drive): post-limiter −2.00 dB, a pre-limiter cut would not be', async () => {
  const dry = await renderLive('ion-twin', FULL, 3);
  const hot = new OfflineAudioContext(dry.numberOfChannels, dry.length, dry.sampleRate).createBuffer(dry.numberOfChannels, dry.length, dry.sampleRate);
  const pre = new OfflineAudioContext(dry.numberOfChannels, dry.length, dry.sampleRate).createBuffer(dry.numberOfChannels, dry.length, dry.sampleRate);
  for (let c = 0; c < dry.numberOfChannels; c++) {
    hot.getChannelData(c).set(dry.getChannelData(c).map((v) => v * 10 ** (8 / 20)));
    pre.getChannelData(c).set(dry.getChannelData(c).map((v) => v * 10 ** (6 / 20)));
  }
  const ref = level(await throughMaster(hot));
  const post = level(await throughMaster(hot, { liveTrimDb: -2 }));
  const preCut = level(await throughMaster(pre));
  assert.ok(ref.peak > PS.LIMITER_THRESHOLD_DB, `limiter engaged (peak ${ref.peak.toFixed(2)})`);
  assert.ok(Math.abs(post.lufs - ref.lufs + 2) < 0.01, `post-limiter ΔLUFS ${(post.lufs - ref.lufs).toFixed(3)}`);
  assert.ok(Math.abs(post.peak - ref.peak + 2) < 0.01, `post-limiter Δpeak ${(post.peak - ref.peak).toFixed(3)}`);
  assert.ok(preCut.peak - ref.peak > -1.5, `pre-limiter −2 dB is absorbed (Δpeak ${(preCut.peak - ref.peak).toFixed(2)})`);
});

test('other packs are bit-identical with and without the trim (same engine render through the bus)', async () => {
  for (const id of ['v8-rumble', 'ev-whine', 'night-pursuit', 'revforge-trenchlight', 'revforge-apex-v8']) {
    const dry = await renderLive(id, FULL, 3);
    const a = await throughMaster(dry);
    const b = await throughMaster(dry, { liveTrimDb: trim.liveTrimDb(audio.getBuiltin(id)) });
    for (let c = 0; c < a.numberOfChannels; c++) {
      const x = a.getChannelData(c), y = b.getChannelData(c);
      let same = x.length === y.length;
      for (let i = 0; same && i < x.length; i++) same = x[i] === y[i];
      assert.ok(same, `${id} ch${c} bit-identical`);
    }
  }
});

test('setLiveTrimDb: click-free ramp, never above unity, held at unity while ducked', async () => {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const bus = PS.createMasterBus(ctx);
  bus.fade.gain.value = 1;
  const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.25; o.connect(g).connect(bus.input); o.start();
  ctx.suspend(0.3).then(() => { bus.setLiveTrimDb(-2, PS.RAMP_IN_S, PS.SWITCH_DIP_S); ctx.resume(); });
  const y = (await ctx.startRendering()).getChannelData(0);
  const pk = (a, b) => { let p = 0; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) p = Math.max(p, Math.abs(y[i])); return p; };
  assert.ok(Math.abs(20 * Math.log10(pk(0.1, 0.3)) - 20 * Math.log10(0.25)) < 0.05, 'unity before');
  assert.ok(Math.abs(20 * Math.log10(pk(0.7, 1)) - 20 * Math.log10(0.25) + 2) < 0.05, '−2 dB after the ramp');
  // a 220 Hz sine at 0.25 moves ≤ 2π·220/sr·0.25 per sample: no step larger than that (+ margin)
  let maxStep = 0; for (let i = 1; i < y.length; i++) maxStep = Math.max(maxStep, Math.abs(y[i] - y[i - 1]));
  assert.ok(maxStep < (2 * Math.PI * 440 / sr) * 0.25 * 1.05, `no click (max step ${maxStep.toFixed(4)})`);
  const c2 = new OfflineAudioContext(1, 128, sr);
  const b2 = PS.createMasterBus(c2);
  b2.setLiveTrimDb(6, 0);
  assert.equal(b2.liveTrimDb(), 0, 'positive trims clamp to 0 dB (no surprise loudness)');
  b2.setLiveTrimDb(-2, 0);
  b2.duck(0.01);
  b2.setLiveTrimDb(-3, 0);
  assert.equal(b2.liveTrimDb(), -3, 'target stored while ducked');
});

test('useAudioEngine applies the active pack trim: immediate on engine creation, ramped from the switch dip', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(src, /setLiveTrimDb\(liveTrimDb\(patch\), 0\)/);
  assert.match(src, /if \(audibleSwitch\) masterRef\.current\?\.setLiveTrimDb\(liveTrimDb\(patch\), RAMP_IN_S, SWITCH_DIP_S\)/);
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const code = strip(readFileSync(join(root, 'src/audio/liveTrim.ts'), 'utf8'));
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/, 'no storage');
});
