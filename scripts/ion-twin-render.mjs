/**
 * Twin Ion offline renderer — runs the SHIPPED live voice (createEngineSynth → CharacterEngine
 * wrapping EngineSynthImpl.buildScifi / applyScifiDriving) in an OfflineAudioContext, driven
 * through setDriving at 60 Hz like the app's rAF loop. Math.random is seeded (noise buffers +
 * living-drive jitter) → byte-deterministic renders. Fully procedural: nothing is loaded but code.
 *
 * node-web-audio-api refuses a second WaveShaper.curve assignment (browsers allow it and the
 * voice re-drives its shapers per frame), so every WaveShaper here is a swap-on-write wrapper:
 * a new curve rebuilds the inner shaper between the same input/output gains — same audible
 * result as the browser, offline.
 *
 * Used by render-snippets.mjs (Twin Ion preview), ion-twin-qa.mjs (live loudness) and tests.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';
import { mulberry32 } from './seeded-random.mjs';

if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    return { resolve, reject, promise };
  };
}
// EngineSynthImpl imports the pulse worklet module; stub its worklet-scope globals for node.
globalThis.AudioWorkletProcessor ??= class {};
globalThis.registerProcessor ??= () => {};
globalThis.sampleRate ??= 44100;
const { OfflineAudioContext } = await import('node-web-audio-api');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Vite '?url' import of the pulse worklet → plain string module (Twin Ion never loads the worklet)
const urlStub = join(tmpdir(), 'revforge-ion-twin-worklet-url.mjs');
writeFileSync(urlStub, "export default '/worklets/pulse-engine-processor.js';\n");
const jiti = createJiti(join(ROOT, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': urlStub },
});
globalThis.window ??= globalThis;
globalThis.location ??= { href: pathToFileURL(join(ROOT, 'index.html')).href };
const audio = await jiti.import(join(ROOT, 'src/audio/index.ts'));

export const ION_TWIN_ID = 'ion-twin';
export const ION_TWIN_LAYER_IDS = audio.ION_TWIN_LAYER_IDS;

/**
 * Browser-like WaveShaper: curve may be re-assigned. Offline, each distinct curve (keyed by its
 * value at x = 0.5, 1e-3 resolution) gets one inner shaper between fixed in/out gains and a
 * re-assignment just re-routes — no per-frame node churn.
 */
export function swappableShapers(ctx) {
  const mk = ctx.createWaveShaper.bind(ctx);
  ctx.createWaveShaper = () => {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const inConnect = input.connect.bind(input);
    const inDisconnect = input.disconnect.bind(input);
    const cache = new Map();
    let inner = null;
    let curve = null;
    let oversample = 'none';
    Object.defineProperty(input, 'curve', {
      configurable: true,
      get: () => curve,
      set: (v) => {
        if (v == null) return;
        const key = Math.round(v[Math.floor(v.length * 0.75)] * 1000);
        let next = cache.get(key);
        if (!next) {
          next = mk();
          next.oversample = oversample;
          next.curve = v;
          next.connect(output);
          cache.set(key, next);
        }
        if (next !== inner) {
          if (inner) inDisconnect(inner);
          inConnect(next);
          inner = next;
        }
        curve = v;
      },
    });
    Object.defineProperty(input, 'oversample', {
      configurable: true,
      get: () => oversample,
      set: (v) => {
        oversample = v;
        for (const n of cache.values()) n.oversample = v;
      },
    });
    input.connect = (...a) => output.connect(...a);
    input.disconnect = (...a) => output.disconnect(...a);
    return input;
  };
  return ctx;
}

/**
 * Patch for a layer subset: 'default' (the shipped pack), 'full-stack' (ionTwinFullStackLayers)
 * or an array of layer ids (the default rows for those ids, everything else off).
 */
export function ionTwinPatch(layers = 'default') {
  if (layers === 'default') return audio.getBuiltin(ION_TWIN_ID);
  if (layers === 'full-stack') return audio.combineIonTwinLayers(audio.ionTwinFullStackLayers(), { fullStack: true });
  const rows = audio.ionTwinContinuousLayers().filter((l) => layers.includes(l.id));
  return audio.combineIonTwinLayers(rows);
}

/**
 * profile(t) → DrivingInput { speed, throttle, load? }. opts: { layers, params (overrides),
 * seed, sampleRate, fadeOut, preroll (s, cut from the output) }.
 * Returns the stereo AudioBuffer of the wrapper output (pre master-bus trim).
 */
export async function renderIonTwin(profile, dur, opts = {}) {
  // node-web-audio-api occasionally rejects a suspend() under load; renders are seeded, so a
  // retry is byte-identical to a clean first pass.
  let err;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await renderOnce(profile, dur, opts);
    } catch (e) {
      if (!String(e?.message).includes('control frames rejected')) throw e;
      err = e;
    }
  }
  throw err;
}

async function renderOnce(profile, dur, opts) {
  const SR = opts.sampleRate ?? 44100;
  // Pre-roll: run the voice at the gesture's opening state first (start-up cue + spool settle),
  // then cut it — the gesture is heard mid-drive, as in the car.
  const pre = Math.max(0, opts.preroll ?? 0);
  if (pre > 0) {
    const inner = profile;
    profile = (t) => inner(Math.max(0, t - pre));
    dur += pre;
  }
  const prevRandom = Math.random;
  const prevNow = performance.now.bind(performance);
  Math.random = mulberry32(opts.seed ?? ION_TWIN_ID);
  let tNow = 0;
  performance.now = () => tNow * 1000;
  try {
    const ctx = swappableShapers(new OfflineAudioContext(2, Math.ceil(SR * dur), SR));
    Object.defineProperty(ctx, 'state', { get: () => 'running', configurable: true });
    const base = ionTwinPatch(opts.layers);
    const patch = opts.params ? { ...base, params: { ...base.params, ...opts.params } } : base;
    const eng = audio.createEngineSynth(ctx, patch);
    await eng.start();
    delete ctx.state;
    opts.onEngine?.(eng);
    // Control frames on exact render-quantum boundaries (128 samples) at ~60 Hz
    const Q = 128 / SR;
    const missed = [];
    for (let k = 1; k * (1 / 60) < dur - 0.02; k++) {
      const at = Math.round(k / 60 / Q) * Q;
      ctx.suspend(at).then(
        () => {
          tNow = at;
          eng.setDriving(profile(at));
          ctx.resume();
        },
        (e) => missed.push([at, e?.message]),
      );
    }
    eng.setDriving(profile(0));
    let buf = await ctx.startRendering();
    eng.dispose?.();
    if (pre > 0) {
      const skip = Math.round(pre * SR);
      const out = new OfflineAudioContext(buf.numberOfChannels, buf.length - skip, SR).createBuffer(
        buf.numberOfChannels,
        buf.length - skip,
        SR,
      );
      for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(skip));
      buf = out;
    }
    if (missed.length) throw new Error(`ion-twin-render: ${missed.length} control frames rejected (t=${missed[0][0]}: ${missed[0][1]})`);
    if (opts.fadeOut) {
      const n = Math.floor(opts.fadeOut * SR);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const x = buf.getChannelData(c);
        for (let i = 0; i < n; i++) x[x.length - 1 - i] *= i / n;
      }
    }
    return buf;
  } finally {
    Math.random = prevRandom;
    performance.now = prevNow;
  }
}

/** Piecewise-linear breakpoints [[t, value], …] → f(t). */
export function pw(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) {
        const [t0, v0] = points[i - 1];
        return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
      }
    }
    return points[points.length - 1][1];
  };
}
const drive = (speed, throttle) => (t) => ({ speed: speed(t), throttle: throttle(t) });

/**
 * Steady live-loudness states (integrated LUFS over the settled tail; see ion-twin-qa.mjs).
 * idle = parked, cruise = mid speed light throttle, full = top speed full throttle.
 */
export const ION_TWIN_LOUDNESS_STATES = {
  idle: { speed: 0, throttle: 0 },
  cruise: { speed: 0.5, throttle: 0.35 },
  full: { speed: 1, throttle: 1 },
};

/**
 * Drive gestures used for the listening A/B renders (docs/ion-twin-closer-match.md). Each one
 * is a handful of breakpoints for the gesture the matching reference performs (swell timing,
 * stab, cruise, arc) plus the layer subset that reference is the target for.
 */
export const ION_TWIN_GESTURES = {
  ref1: {
    label: 'formant howl swell (cruise, throttle swell then lift)',
    layers: ['motorBed', 'formantHowl'],
    dur: 4.1,
    profile: drive(pw([[0, 0.45]]), pw([[0, 0.12], [2.7, 0.85], [3.6, 0.05], [4.1, 0]])),
  },
  ref2: {
    label: 'twin motor bed (parked / taxi idle)',
    layers: ['motorBed'],
    dur: 7.6,
    profile: drive(pw([[0, 0.02]]), pw([[0, 0.08]])),
  },
  ref3: {
    label: 'scream burst (high speed, held full throttle)',
    layers: ['motorBed', 'screamBurst'],
    dur: 2.18,
    profile: drive(pw([[0, 0.75]]), pw([[0, 0.95]])),
  },
  ref4: {
    label: 'power surge (throttle stab, coast-down)',
    layers: ['formantHowl', 'surge', 'airSwoosh'],
    dur: 2.93,
    profile: drive(
      pw([[0, 0.3], [0.8, 0.7], [2.93, 0.55]]),
      pw([[0, 0.1], [0.15, 1], [0.55, 1], [0.8, 0.25], [1.8, 0], [2.93, 0]]),
    ),
  },
  ref5: {
    label: 'full stack arc (rumbling pull-away, stabs, cruise, decel)',
    layers: 'full-stack',
    dur: 11.66,
    profile: drive(
      pw([[0, 0.12], [0.8, 0.15], [2.5, 0.5], [5.5, 0.62], [9.5, 0.62], [11.66, 0.4]]),
      pw([
        [0, 0.6], [0.8, 0.6], [1.0, 0.7], [2.5, 0.7], [2.7, 1], [3.2, 1], [3.6, 0.4], [5.6, 0.4], [5.8, 1], [6.2, 0.4],
        [7.2, 0.4], [7.4, 1], [7.8, 0.35], [9.5, 0.35], [9.8, 0.9], [10.0, 0.35], [11.66, 0.3],
      ]),
    ),
  },
  ref6: {
    label: 'sustained formant howl (cruise, slow swell-in, hold, lift)',
    layers: ['formantHowl'],
    dur: 5.69,
    profile: drive(pw([[0, 0.6]]), pw([[0, 0.1], [2.4, 0.7], [4.5, 0.7], [5.6, 0], [5.69, 0]])),
  },
};
