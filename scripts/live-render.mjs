/**
 * Live-engine offline renderer: the SHIPPED createEngineSynth graph (CharacterEngine wrapping
 * EngineSynthImpl / RevForgeSynth, real pulse worklet for ICE) driven at 60 Hz through
 * setDriving, exactly like the app. Math.random is seeded per pack on the main thread AND in the
 * pulse worklet (seeded temp copy via seededWorkletModule) → byte-deterministic renders.
 * Optional HIG master bus (src/audio/playbackSession.ts) on the output.
 * Used by scripts/hig-level-check.mjs. Fully procedural — nothing is loaded except code.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { allowShaperReassign } from '../tests/fixtures/reassignable-shaper.mjs';
import { seededWorkletModule } from './seeded-random.mjs';

if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { resolve, reject, promise };
  };
}
const { OfflineAudioContext, AudioWorkletNode } = await import('node-web-audio-api');
globalThis.AudioWorkletNode ??= AudioWorkletNode;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKLET = join(ROOT, 'src/audio/worklets/pulse-engine-processor.js');
const jiti = createJiti(join(ROOT, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': join(ROOT, 'tests/fixtures/worklet-url-stub.mjs') },
});
globalThis.window ??= globalThis;
globalThis.location ??= { href: pathToFileURL(join(ROOT, 'public', 'index.html')).href };
const audio = await jiti.import(join(ROOT, 'src/audio/index.ts'));
const PS = await jiti.import(join(ROOT, 'src/audio/playbackSession.ts'));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * profile(t) → DrivingInput. opts.master: insert the HIG master bus (already at unity).
 * Returns the stereo AudioBuffer.
 */
export async function renderLive(id, profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const patch = audio.getBuiltin(id);
  if (!patch) throw new Error(`no builtin ${id}`);
  const prevRandom = Math.random;
  const prevNow = performance.now.bind(performance);
  Math.random = mulberry32(seedOf(opts.seed ?? id));
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  let tNow = 0;
  performance.now = () => tNow * 1000;
  try {
    Object.defineProperty(ctx, 'state', { get: () => 'running', configurable: true });
    allowShaperReassign(ctx);
    // Pulse worklet runs in its own realm: load a seeded copy of the shipped processor.
    const worklet = ctx.audioWorklet;
    const addModule = worklet.addModule.bind(worklet);
    worklet.addModule = () => addModule(seededWorkletModule(WORKLET, opts.seed ?? id));
    const eng = audio.createEngineSynth(ctx, patch);
    let bus = null;
    if (opts.master) {
      bus = PS.createMasterBus(ctx);
      bus.fade.gain.value = 1;
      eng.output.disconnect();
      eng.output.connect(bus.input);
    }
    await eng.start();
    delete ctx.state;
    const dt = 1 / 60;
    const missed = [];
    for (let t = dt; t < dur - 0.02; t += dt) {
      const at = t;
      ctx.suspend(at).then(() => {
        tNow = at;
        eng.setDriving(profile(at));
        ctx.resume();
      }, (e) => { missed.push([at, e.message]); });
    }
    eng.setDriving(profile(0));
    const buf = await ctx.startRendering();
    if (missed.length) console.error(`[live-render] ${id}: ${missed.length} control frames rejected (first t=${missed[0][0].toFixed(3)} ${missed[0][1]})`);
    eng.dispose?.();
    return buf;
  } finally {
    Math.random = prevRandom;
    performance.now = prevNow;
  }
}

let latency = null;
/** Master-bus latency in samples (DynamicsCompressor look-ahead), measured with a single-sample click. */
export async function masterLatency(sr = 44100) {
  if (latency !== null) return latency;
  const ctx = new OfflineAudioContext(1, 4096, sr);
  const b = ctx.createBuffer(1, 4096, sr);
  b.getChannelData(0)[0] = 0.1;
  const src = ctx.createBufferSource();
  src.buffer = b;
  const bus = PS.createMasterBus(ctx);
  bus.fade.gain.value = 1;
  src.connect(bus.input);
  src.start();
  const y = (await ctx.startRendering()).getChannelData(0);
  let m = 0;
  latency = 0;
  for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > m) { m = Math.abs(y[i]); latency = i; }
  return latency;
}

/** Pass an existing buffer through the HIG master bus (unity, no ramp), latency-aligned. */
export async function throughMaster(buf) {
  const lat = await masterLatency(buf.sampleRate);
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length + lat, buf.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bus = PS.createMasterBus(ctx);
  bus.fade.gain.value = 1;
  src.connect(bus.input);
  src.start();
  const out = await ctx.startRendering();
  const aligned = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate).createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) aligned.getChannelData(c).set(out.getChannelData(c).subarray(lat, lat + buf.length));
  return aligned;
}

export const channels = (buf, from = 0, to = buf.length) =>
  Array.from({ length: buf.numberOfChannels }, (_, c) => Float64Array.from(buf.getChannelData(c).subarray(from, to)));
