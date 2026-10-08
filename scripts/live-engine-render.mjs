/**
 * Live-chain offline renderer: runs the REAL shipped engine (createEngineSynth → CharacterEngine
 * wrapper → EngineSynthImpl, incl. the pulse worklet for ICE packs) in an OfflineAudioContext.
 * Time is stepped with ctx.suspend(t) every frame (default 60 Hz), so setDriving / cues land at
 * the right audio time exactly like the car's rAF loop; performance.now() follows audio time.
 *
 * Used by tomcat-render.mjs (A/B + level measurements) and the Tomcat tests. `opts.root` lets the
 * same harness render an older checkout (e.g. the e2ace06 baseline) for before/after comparisons.
 * Deterministic: Math.random (main thread + worklet) is seeded. Nothing is loaded except code.
 */
import { createJiti } from 'jiti';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mulberry32, seededWorkletModule } from './seeded-random.mjs';

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

const HERE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nwa = await import('node-web-audio-api');
const { OfflineAudioContext } = nwa;
globalThis.AudioWorkletNode ??= nwa.AudioWorkletNode;
// Browsers allow re-assigning WaveShaperNode.curve; node-web-audio-api throws "cannot assign curve
// twice". Offline shim only: keep the first curve and ignore later assignments (the legacy
// aerospace graph re-assigns its AB shaper curve per frame; the Tomcat voice never does).
{
  const proto = nwa.WaveShaperNode?.prototype;
  const desc = proto && Object.getOwnPropertyDescriptor(proto, 'curve');
  if (desc?.set && !proto.__rfCurveShim) {
    Object.defineProperty(proto, 'curve', {
      ...desc,
      set(v) {
        try {
          desc.set.call(this, v);
        } catch {
          /* already set — ignored offline */
        }
      },
    });
    proto.__rfCurveShim = true;
  }
}

const loaded = new Map();
/** jiti-load a checkout's audio modules (cached per root + seed so the worklet URL is seeded). */
async function loadRoot(root, seed) {
  const key = `${root}::${seed}`;
  if (loaded.has(key)) return loaded.get(key);
  const worklet = seededWorkletModule(join(root, 'src/audio/worklets/pulse-engine-processor.js'), seed);
  const dir = mkdtempSync(join(tmpdir(), 'rf-wurl-'));
  const urlMod = join(dir, 'worklet-url.mjs');
  writeFileSync(urlMod, `export default ${JSON.stringify(pathToFileURL(worklet).href)};\n`);
  const jiti = createJiti(join(root, 'package.json'), {
    moduleCache: false,
    alias: { './worklets/pulse-engine-processor.js?url': urlMod },
  });
  const impl = await jiti.import(join(root, 'src/audio/EngineSynthImpl.ts'));
  const builtins = await jiti.import(join(root, 'src/audio/builtins.ts'));
  const mods = { impl, builtins, worklet };
  loaded.set(key, mods);
  return mods;
}

/**
 * Render `dur` seconds of a builtin (or given) patch through the live chain.
 * profile(t) → DrivingInput. opts: { root, patchId | patch, params, cues: [{t, cue}], stopAt,
 * sampleRate, fps, seed, tap ('base' = EngineSynthImpl output, default = car wrapper output),
 * noLimit (neutralise both limiters; note Web Audio compressors add automatic makeup gain, so
 * compare against a quiet case to estimate gain reduction),
 * startAt (default 0), driveBeforeStart (call setDriving before start() too), onFrame(engine, t),
 * static (steady-state: profile(0) settled before render) }.
 */
export async function renderLive(profile, dur, opts = {}) {
  const root = opts.root ?? HERE_ROOT;
  const seed = opts.seed ?? opts.patchId ?? 'live';
  const prevRandom = Math.random;
  Math.random = mulberry32(seed);
  const realNow = performance.now.bind(performance);
  const realSetTimeout = globalThis.setTimeout;
  const hadWindow = 'window' in globalThis;
  try {
    const { impl, builtins } = await loadRoot(root, seed);
    const SR = opts.sampleRate ?? 44100;
    const fps = opts.fps ?? 60;
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    let fakeMs = 0;
    performance.now = () => fakeMs;
    if (!hadWindow) globalThis.window = { location: { href: 'file:///' } };
    const base = opts.patch ?? builtins.getBuiltin(opts.patchId ?? 'aerospace-f14');
    const patch = structuredClone(base);
    if (opts.params) patch.params = { ...patch.params, ...opts.params };
    const engine = impl.createEngineSynth(ctx, patch);
    if (opts.muteFx && engine.fx?.trim) engine.fx.trim.disconnect();
    if (opts.tap === 'base' && engine.base) {
      // Engine-level tap (EngineSynthImpl master → limiter → output), before the wrapper stage
      engine.output.disconnect();
      engine.base.output.connect(ctx.destination);
    }
    // Engine settle timers are wall-clock; the harness calls setDriving every frame instead, so
    // timers created inside engine calls are no-ops (node-web-audio-api itself needs real timers).
    const quiet = (fn) => {
      globalThis.setTimeout = () => 0;
      try {
        return fn();
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
    };
    const neutralise = () => {
      if (!opts.noLimit) return;
      const lims = [engine.mixLimiter, engine.base?.g?.limiter].filter(Boolean);
      for (const l of lims) {
        l.threshold.value = 0;
        l.ratio.value = 1;
        l.knee.value = 0;
      }
    };
    const resume = ctx.resume.bind(ctx);
    ctx.resume = async () => {};
    const startAt = opts.startAt ?? 0;
    const cues = [...(opts.cues ?? [])].sort((a, b) => a.t - b.t);
    let started = false;
    let stopped = false;
    const frame = async (t) => {
      fakeMs = ctx.currentTime * 1000;
      if (!started && t >= startAt - 1e-9) {
        started = true;
        await engine.start();
        neutralise();
      }
      if (started && !stopped) {
        quiet(() => engine.setDriving(profile(t)));
        opts.onFrame?.(engine, t);
      } else if (!started && opts.driveBeforeStart) {
        // Car loop already running but no user gesture yet: setDriving must stay silent
        quiet(() => engine.setDriving(profile(t)));
        opts.onFrame?.(engine, t);
      }
      while (cues.length && cues[0].t <= t + 1e-9) {
        const c = cues.shift();
        quiet(() => engine.triggerUiCue(c.cue));
      }
      if (!stopped && opts.stopAt !== undefined && t >= opts.stopAt - 1e-9) {
        stopped = true;
        quiet(() => engine.stop());
      }
    };
    const quantum = 128 / SR;
    const step = 1 / fps;
    if (opts.static) {
      // Steady-state mode (needed for AudioWorklet packs: node-web-audio-api deadlocks on suspend
      // with a worklet): settle the JS drive models with simulated time before rendering; every
      // AudioParam target is then scheduled at t=0 and the render is measured after it converges.
      const settle = opts.settleSeconds ?? 6;
      await engine.start();
      neutralise();
      for (let i = 0; i * step <= settle; i++) {
        fakeMs = i * step * 1000;
        quiet(() => engine.setDriving(profile(0)));
      }
      const buf = await ctx.startRendering();
      try {
        engine.dispose();
      } catch {
        /* ignore */
      }
      return buf;
    }
    // Frame 0 runs before rendering starts (suspend(0) is not allowed)
    await frame(0);
    for (let i = 1; i * step < dur - quantum; i++) {
      ctx.suspend(i * step).then(
        async () => {
          await frame(ctx.currentTime);
          resume();
        },
        (err) => {
          if (process.env.RF_DEBUG) console.warn('suspend failed', i, i * step, err?.message);
        },
      );
    }
    const buf = await ctx.startRendering();
    try {
      engine.dispose();
    } catch {
      /* ignore */
    }
    return buf;
  } finally {
    Math.random = prevRandom;
    performance.now = realNow;
    globalThis.setTimeout = realSetTimeout;
    if (!hadWindow) delete globalThis.window;
  }
}

/** AudioBuffer → Float64Array channels, optionally trimmed [from, to) seconds. */
export function channelsOf(buf, from = 0, to = buf.duration) {
  const a = Math.max(0, Math.floor(from * buf.sampleRate));
  const b = Math.min(buf.length, Math.floor(to * buf.sampleRate));
  const out = [];
  for (let c = 0; c < buf.numberOfChannels; c++) out.push(Float64Array.from(buf.getChannelData(c).subarray(a, b)));
  return out;
}
