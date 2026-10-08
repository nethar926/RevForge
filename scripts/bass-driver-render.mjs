/**
 * Bass-driver offline renders through the real engine path: createEngineSynth → CharacterEngine
 * (with the bass-driver master bus) → EngineSynthImpl (+ pulse worklet for ICE packs).
 *
 * Seeded: Math.random is replaced (main thread and worklet) with a fixed-seed PRNG and
 * performance.now() follows the offline clock, so a render is repeatable byte for byte.
 * Control frames run at 60 Hz via OfflineAudioContext.suspend(t) → setDriving → resume().
 * Avoids stop() right after a shutdown cue (node-web-audio-api mis-renders that sequence).
 *
 *   node scripts/bass-driver-render.mjs [outDir] [engineId ...]
 * writes <engine>-off.wav / -50.wav / -100.wav (12 s run-up) and prints LUFS / peak / <80 Hz share.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integratedLufs, lowBandShare, peakDbfs, toWav16 } from './audio-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_SRC = `
var __bdSeed = 0;
function __bdReseed() { __bdSeed = 0x2f6b9d1 >>> 0; }
__bdReseed();
Math.random = function () {
  __bdSeed = (__bdSeed + 0x6d2b79f5) >>> 0;
  var t = __bdSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Re-seed per processor instance (the worklet scope may outlive one OfflineAudioContext).
var __bdRegister = globalThis.registerProcessor;
globalThis.registerProcessor = function (name, Cls) {
  class Seeded extends Cls {
    constructor(options) {
      __bdReseed();
      super(options);
    }
  }
  if (Cls.parameterDescriptors) Object.defineProperty(Seeded, 'parameterDescriptors', { get: () => Cls.parameterDescriptors });
  return __bdRegister(name, Seeded);
};
`;

/** Re-seed the main-thread PRNG (call before each render for repeatable output). */
export function seedRandom(seed = 0x2f6b9d1) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded copy of the pulse worklet (same source, deterministic Math.random in the worklet scope).
const tmp = mkdtempSync(join(tmpdir(), 'bass-driver-'));
const workletFile = join(tmp, 'pulse-engine-processor.seeded.js');
writeFileSync(workletFile, SEED_SRC + readFileSync(join(ROOT, 'src/audio/worklets/pulse-engine-processor.js'), 'utf8'));
const urlStub = join(tmp, 'worklet-url.mjs');
writeFileSync(urlStub, `export default ${JSON.stringify(workletFile)};\n`);

const wa = await import('node-web-audio-api');
const { OfflineAudioContext } = wa;
globalThis.AudioWorkletNode ??= wa.AudioWorkletNode;
globalThis.window ??= { location: { href: 'file:///' }, setInterval, clearInterval, setTimeout, clearTimeout };

/** Offline clock: the frame time the renderer is suspended at (exact render-quantum multiples). */
let clock = null;
const realNow = performance.now.bind(performance);
performance.now = () => (clock ? clock.t * 1000 : realNow());

const { createJiti } = await import('jiti');
const jiti = createJiti(join(ROOT, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': urlStub },
  moduleCache: true,
});
const impl = await jiti.import(join(ROOT, 'src/audio/EngineSynthImpl.ts'));
const builtins = await jiti.import(join(ROOT, 'src/audio/builtins.ts'));
if (process.env.BD_CAL) Object.assign((await jiti.import(join(ROOT, 'src/audio/bassDriver.ts'))).BASS_CAL, JSON.parse(process.env.BD_CAL));

/**
 * node-web-audio-api still enforces the old "WaveShaper curve can only be set once" rule; browsers
 * allow re-assignment (EngineSynthImpl re-sets the osc-path ICE shaper in applyAllParams). Offline we
 * keep the first curve (that shaper is muted once the pulse worklet runs).
 */
function allowShaperReassign(ctx) {
  const mk = ctx.createWaveShaper.bind(ctx);
  ctx.createWaveShaper = () => {
    const node = mk();
    let proto = Object.getPrototypeOf(node);
    let desc;
    while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, 'curve'))) proto = Object.getPrototypeOf(proto);
    let set = false;
    Object.defineProperty(node, 'curve', {
      configurable: true,
      get: () => desc.get.call(node),
      set: (v) => {
        if (!set) {
          desc.set.call(node, v);
          set = v != null;
        }
      },
    });
    return node;
  };
  return ctx;
}

export const ENGINES = [
  { id: 'chrono-coupe', title: 'Chrono Coupe' },
  { id: 'night-pursuit', title: 'Night Pursuit' },
  { id: 'stellar-helm', title: 'Stellar Helm' },
  { id: 'aerospace-f14', title: 'Tomcat slot (aerospace-f14)' },
];

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a));

/** ~12 s run-up: idle → pull-away → cruise → full throttle → lift-off. */
export function runUpProfile(t) {
  if (t < 2) return { speed: 0, throttle: 0, load: 0 };
  if (t < 4.5) return { speed: 0.32 * ramp(t, 2, 4.5), throttle: 0.55, load: 0.35 };
  if (t < 7) return { speed: 0.32 + 0.04 * ramp(t, 4.5, 7), throttle: 0.22, load: 0.1 };
  if (t < 10) return { speed: 0.36 + 0.44 * ramp(t, 7, 10), throttle: 1, load: 0.8 };
  return { speed: 0.8 - 0.14 * ramp(t, 10, 12), throttle: 0, load: -0.4, overrun: true };
}
export const RUN_UP_SECONDS = 12;
export const RUN_UP_SECTIONS = [
  { name: 'idle', from: 0, to: 2 },
  { name: 'pull-away', from: 2, to: 4.5 },
  { name: 'cruise', from: 4.5, to: 7 },
  { name: 'full throttle', from: 7, to: 10 },
  { name: 'lift-off', from: 10, to: 12 },
];

/**
 * Render one engine. opts.bass = {enabled, amount} applied before start (or null = never touched);
 * opts.events = [{t, bass:{...}} | {t, cue:'starter'|'shutdown'}]; returns the AudioBuffer.
 */
export async function renderEngine(engineId, opts = {}) {
  // Suspend registration is asynchronous in node-web-audio-api; under heavy load a late one can be
  // rejected. Renders are deterministic, so simply retry.
  for (let attempt = 1; ; attempt++) {
    try {
      return await renderEngineOnce(engineId, opts);
    } catch (err) {
      if (attempt >= 4 || !String(err?.message).startsWith('offline suspend failed')) throw err;
    }
  }
}

async function renderEngineOnce(engineId, opts) {
  const sr = opts.sampleRate ?? 44100;
  const dur = opts.duration ?? RUN_UP_SECONDS;
  const profile = opts.profile ?? runUpProfile;
  seedRandom(opts.seed ?? 0x2f6b9d1);
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);
  // Offline contexts cannot resume() before rendering: report 'running' so start() skips it.
  Object.defineProperty(ctx, 'state', { get: () => 'running', configurable: true });
  allowShaperReassign(ctx);
  // Pin currentTime to the suspended frame time so automation start times never race the renderer.
  const frameClock = { t: 0 };
  Object.defineProperty(ctx, 'currentTime', { get: () => frameClock.t, configurable: true });
  clock = frameClock;
  const patch = builtins.getBuiltin(engineId);
  if (!patch) throw new Error(`unknown engine ${engineId}`);
  const eng = impl.createEngineSynth(ctx, patch);
  if (opts.bass) eng.setBassDriver(opts.bass);
  eng.setDriving(profile(0));
  await eng.start();
  if (process.env.BD_DIAG) console.error("diag", JSON.stringify(eng.getDiag()));
  // Control frames every 6 render quanta (768 samples ≈ 17.4 ms @ 44.1 kHz ≈ 57 Hz) on exact
  // boundaries. All suspends are registered before rendering (this renderer cannot chain them).
  const dt = (6 * 128) / sr;
  const frames = Math.floor(dur / dt);
  const events = [...(opts.events ?? [])].sort((a, b) => a.t - b.t);
  const failures = [];
  for (let i = 1; i < frames; i++) {
    const t = i * dt;
    // Request just before the boundary: the renderer rounds suspend times up to the next quantum.
    ctx.suspend(t - 32 / sr).then(
      () => {
        frameClock.t = t;
        while (events.length && events[0].t <= t + 1e-9) {
          const ev = events.shift();
          if (ev.bass) eng.setBassDriver(ev.bass);
          if (ev.cue) eng.triggerUiCue(ev.cue);
        }
        eng.setDriving(profile(t));
        ctx.resume();
      },
      (err) => failures.push([i, String(err)]),
    );
  }
  // Let the (asynchronous) suspend registrations land before the renderer starts.
  await new Promise((r) => setTimeout(r, 30));
  const buf = await ctx.startRendering();
  if (failures.length) throw new Error(`offline suspend failed at frames ${failures.map((f) => f[0]).join(',')}: ${failures[0][1]}`);
  clock = null;
  try {
    eng.dispose();
  } catch {
    /* ignore */
  }
  return buf;
}

export function metrics(buf, from = 0, to = buf.length / buf.sampleRate) {
  const a = Math.floor(from * buf.sampleRate);
  const b = Math.floor(to * buf.sampleRate);
  const ch = [];
  for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c).subarray(a, b));
  return {
    lufs: integratedLufs(ch, buf.sampleRate),
    peak: peakDbfs(ch),
    low80: lowBandShare(ch, buf.sampleRate, 80),
  };
}

export const STATES = [
  { key: 'off', label: 'OFF', bass: null },
  { key: '50', label: '50%', bass: { enabled: true, amount: 0.5 } },
  { key: '100', label: '100%', bass: { enabled: true, amount: 1 } },
];

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const out = process.argv[2] ?? join(ROOT, '.tmp', 'bass-driver-clips');
  const only = process.argv.slice(3);
  mkdirSync(out, { recursive: true });
  const rows = [];
  const states = process.env.BD_STATES ? STATES.filter((s) => process.env.BD_STATES.split(',').includes(s.key)) : STATES;
  for (const e of ENGINES) {
    if (only.length && !only.includes(e.id)) continue;
    for (const s of states) {
      const buf = await renderEngine(e.id, { bass: s.bass });
      writeFileSync(join(out, `${e.id}-${s.key}.wav`), toWav16(buf));
      const m = metrics(buf);
      rows.push({ engine: e.id, state: s.label, ...m });
      console.log(
        `${e.id.padEnd(14)} ${s.label.padEnd(5)} LUFS ${m.lufs.toFixed(2)}  peak ${m.peak.toFixed(2)} dBFS  <80Hz ${(m.low80 * 100).toFixed(1)}%`,
      );
    }
  }
  writeFileSync(join(out, 'metrics.json'), JSON.stringify(rows, null, 2));
  process.exit(0);
}
