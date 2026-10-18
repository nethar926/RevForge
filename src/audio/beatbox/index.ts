/**
 * Beat Box: six original procedural ICE engine voices for RevForge (Web Audio, AudioWorklet).
 *
 *   await loadBeatboxWorklet(ctx);                 // optional; createBeatboxEngine does it too
 *   const eng = await createBeatboxEngine(ctx, ctx.destination, 'crossplane-v8');
 *   eng.setDrive(0.7); eng.setTone(0.5); eng.setPops(0.6); eng.setVolume(-6);
 *   eng.start();
 *   eng.update({ rpm: 3200, throttle: 0.8 });       // every frame (or from createTestDrive)
 *   await eng.setEngine('turbo-i6');                 // swap live: ~300 ms equal-power crossfade
 *
 * Fully procedural; uses no browser storage of any kind.
 * Param ranges: docs/beatbox-audio.md.
 */
import {
  BEATBOX_DEFAULT_ENGINE_ID,
  BEATBOX_ENGINES,
  BEATBOX_FALLBACK_ENGINE_ID,
  getBeatboxEngine,
  type BeatboxEngineId,
  type BeatboxEngineInfo,
} from './engines.ts';
import { createNpOriginalVoice, loadNpPulseWorklet } from './npOriginal.ts';
import type { BeatboxVoice, VoiceState } from './voice.ts';

export { BEATBOX_DEFAULT_ENGINE_ID, BEATBOX_ENGINES, BEATBOX_FALLBACK_ENGINE_ID, getBeatboxEngine };
export type { BeatboxEngineId, BeatboxEngineInfo, BeatboxVoiceSpec, FireSlot } from './engines.ts';
export { createTestDrive } from './testDrive.ts';
export type { TestDrive, TestDriveOptions, TestDriveState } from './testDrive.ts';

export const BEATBOX_PROCESSOR = 'beatbox-processor';

export interface BeatboxUpdate {
  /** Engine speed, rpm (0 = stopped, clamped to 0..12000). */
  rpm?: number;
  /** Throttle / load 0..1. */
  throttle?: number;
  /** Road speed km/h (reserved for road / wind layers). */
  speed?: number;
}

export interface BeatboxSetEngineOptions {
  /** Equal-power crossfade length in ms (default 300, clamped 0…2000; below 5 ms a 5 ms de-click fade is used). */
  crossfadeMs?: number;
}

export interface BeatboxEngine {
  /** Current engine id (the latest swap target once its voice is built). */
  readonly id: BeatboxEngineId;
  readonly info: BeatboxEngineInfo;
  /** Final output node (volume stage), already connected to the destination. Stable across swaps. */
  readonly output: GainNode;
  /** Set rpm / throttle / speed. `when` (context time) defaults to now (for offline scheduling). */
  update(state: BeatboxUpdate, when?: number): void;
  setRpm(rpm: number, when?: number): void;
  setThrottle(throttle: number, when?: number): void;
  /** 0..1 overall drive: loudness (−9 dB … 0 dB) and how hard it sounds under load. Default 0.7. */
  setDrive(drive: number): void;
  /** 0..1 tone: smooth & muffled (0) → raw, lumpy & open (1). Default 0.5. */
  setTone(tone: number): void;
  /** 0..1 overrun pops on a lift at revs; scales rate and level. 0 = off. Default 0. */
  setPops(pops: number): void;
  /** Output volume in dB (−60 … +6). Default 0. */
  setVolume(db: number): void;
  /**
   * Swap the engine voice live. Builds the new voice with the current rpm / throttle / speed /
   * drive / tone / pops / running state (and seed policy) and equal-power crossfades into it on
   * the same `output`; the old voice is disconnected when its fade ends. Resolves once the new
   * voice is playing (the fade is scheduled), not when the fade ends. Same id → no-op. Unknown id
   * → rejects and the current voice keeps playing. Rapid calls: the last call wins.
   */
  setEngine(id: BeatboxEngineId, opts?: BeatboxSetEngineOptions): Promise<void>;
  /** Fade in (~150 ms). */
  start(when?: number): void;
  /** Fade out (~250 ms); the voice keeps running silently until dispose(). */
  stop(when?: number): void;
  /** Disconnect and free every node (current voice, any voice still fading out). */
  dispose(): void;
}

export interface BeatboxCreateOptions {
  /** Override the Beat Box worklet module URL (bundlers / tests). */
  workletUrl?: string;
  /** Override the pulse worklet URL used by `np-original` (bundlers / tests). */
  npWorkletUrl?: string;
  /** PRNG seed for deterministic renders (reused by every voice built later by setEngine). */
  seed?: number;
  drive?: number;
  tone?: number;
  pops?: number;
  volumeDb?: number;
}

const clip = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));

/** Default worklet URL (Vite turns this into an emitted asset; node gets a file path). */
export function beatboxWorkletUrl(): string {
  const u = new URL('./beatbox-processor.js', import.meta.url);
  return u.protocol === 'file:' ? decodeURIComponent(u.pathname) : u.href;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Load the Beat Box worklet once per context. */
export function loadBeatboxWorklet(ctx: BaseAudioContext, url: string = beatboxWorkletUrl()): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(url);
    loaded.set(ctx, p);
    p.catch(() => loaded.delete(ctx));
  }
  return p;
}

const DEFAULT_XFADE_MS = 300;
const MIN_XFADE_S = 0.005;
const CURVE_N = 129;
/** Equal-power curves: in = sin, out = cos over a quarter period (Σ gain² = 1 throughout). */
const FADE_IN = Float32Array.from({ length: CURVE_N }, (_, i) => Math.sin((Math.PI / 2) * (i / (CURVE_N - 1))));
const FADE_OUT = Float32Array.from({ length: CURVE_N }, (_, i) => Math.cos((Math.PI / 2) * (i / (CURVE_N - 1))));
FADE_IN[CURVE_N - 1] = 1;
FADE_OUT[CURVE_N - 1] = 0;

/** One Beat Box worklet voice (beatbox-processor + a spec), warm-started at `init`. */
function createWorkletVoice(ctx: BaseAudioContext, info: BeatboxEngineInfo, init: VoiceState, seed: number): BeatboxVoice {
  if (!info.voice) throw new Error(`Beat Box engine ${info.id} has no worklet spec`);
  const node = new AudioWorkletNode(ctx, BEATBOX_PROCESSOR, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { spec: info.voice, seed, init },
  });
  const param = (name: string) => {
    const p = node.parameters.get(name);
    if (!p) throw new Error(`beatbox param ${name} missing`);
    return p;
  };
  const pRpm = param('rpm'), pThr = param('throttle'), pSpd = param('speed');
  const pDrive = param('drive'), pTone = param('tone'), pPops = param('pops'), pLevel = param('level');
  const t0 = ctx.currentTime;
  pRpm.setValueAtTime(clip(init.rpm, 0, 12000), t0);
  pThr.setValueAtTime(clip(init.throttle), t0);
  pSpd.setValueAtTime(clip(init.speed, 0, 400), t0);
  pDrive.setValueAtTime(clip(init.drive), t0);
  pTone.setValueAtTime(clip(init.tone), t0);
  pPops.setValueAtTime(clip(init.pops), t0);
  pLevel.setValueAtTime(clip(init.level, 0, 4), t0);
  let disposed = false;
  return {
    info,
    out: node,
    update(s, when) {
      if (disposed) return;
      if (s.rpm !== undefined) pRpm.setValueAtTime(clip(s.rpm, 0, 12000), when);
      if (s.throttle !== undefined) pThr.setValueAtTime(clip(s.throttle), when);
      if (s.speed !== undefined) pSpd.setValueAtTime(clip(s.speed, 0, 400), when);
    },
    setDrive: (x, when) => { if (!disposed) pDrive.setValueAtTime(clip(x), when); },
    setTone: (x, when) => { if (!disposed) pTone.setValueAtTime(clip(x), when); },
    setPops: (x, when) => { if (!disposed) pPops.setValueAtTime(clip(x), when); },
    rampLevel(target, seconds, when) {
      if (disposed) return;
      pLevel.cancelScheduledValues(when);
      pLevel.setValueAtTime(pLevel.value, when);
      pLevel.linearRampToValueAtTime(clip(target, 0, 4), when + seconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { node.disconnect(); } catch { /* already disconnected */ }
      node.port.close();
    },
  };
}

/** A live voice plus its crossfade gain stages (voice.out → stages[0] → … → output). */
interface Slot {
  voice: BeatboxVoice;
  stages: GainNode[];
  timers: ConstantSourceNode[];
  dead: boolean;
}

export async function createBeatboxEngine(
  ctx: BaseAudioContext,
  destination: AudioNode,
  engineId: BeatboxEngineId,
  opts: BeatboxCreateOptions = {},
): Promise<BeatboxEngine> {
  const info0 = getBeatboxEngine(engineId);
  if (!info0) throw new Error(`unknown Beat Box engine: ${engineId}`);
  const fixedSeed = opts.seed !== undefined ? (opts.seed >>> 0) || 0x5eed : undefined;
  const nextSeed = () => fixedSeed ?? ((Math.floor(Math.random() * 0xffffffff) >>> 0) || 0x5eed);
  const ensureLoaded = (info: BeatboxEngineInfo) =>
    info.backend === 'np-pulse' ? loadNpPulseWorklet(ctx, opts.npWorkletUrl) : loadBeatboxWorklet(ctx, opts.workletUrl);
  await ensureLoaded(info0);

  const live: VoiceState = {
    rpm: 0,
    throttle: 0,
    speed: 0,
    drive: clip(opts.drive ?? 0.7),
    tone: clip(opts.tone ?? 0.5),
    pops: clip(opts.pops ?? 0),
    level: 0,
  };
  const output = ctx.createGain();
  output.gain.value = Math.pow(10, clip(opts.volumeDb ?? 0, -60, 6) / 20);
  output.connect(destination);
  const now = () => ctx.currentTime;

  const build = (info: BeatboxEngineInfo, init: VoiceState): BeatboxVoice =>
    info.backend === 'np-pulse' ? createNpOriginalVoice(ctx, info, init) : createWorkletVoice(ctx, info, init, nextSeed());

  /** Wrap a voice in one gain stage (initial gain `g`) feeding the output. */
  const mount = (voice: BeatboxVoice, g: number): Slot => {
    const stage = ctx.createGain();
    stage.gain.value = g;
    voice.out.connect(stage);
    stage.connect(output);
    return { voice, stages: [stage], timers: [], dead: false };
  };
  const kill = (s: Slot) => {
    if (s.dead) return;
    s.dead = true;
    s.voice.dispose();
    for (const n of [...s.stages, ...s.timers]) {
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
    for (const t of s.timers) t.onended = null;
  };
  /**
   * Fade a slot out from its current gain: append a fresh stage with a cos curve (a new node, so
   * an in-flight curve on an earlier stage is never cancelled or re-scheduled → no jumps; the
   * product of continuous curves stays continuous). Dispose when the curve reaches 0.
   */
  const fadeOut = (s: Slot, t: number, dur: number) => {
    const last = s.stages[s.stages.length - 1];
    const stage = ctx.createGain();
    stage.gain.value = 1;
    stage.gain.setValueCurveAtTime(FADE_OUT, t, dur);
    last.disconnect(output);
    last.connect(stage);
    stage.connect(output);
    s.stages.push(stage);
    // Audio-clock timer (works in realtime and offline contexts): a silent source ending at the
    // end of the fade. Connected (offset 0) so every engine keeps pulling it.
    const timer = ctx.createConstantSource();
    timer.offset.value = 0;
    timer.connect(output);
    timer.onended = () => {
      if (cur !== s) kill(s);
      fading.delete(s);
    };
    timer.start(t);
    timer.stop(t + dur + 0.01);
    s.timers.push(timer);
  };

  let cur: Slot = mount(build(info0, live), 1);
  const fading = new Set<Slot>();
  let gen = 0;
  let disposed = false;

  const eachVoice = (f: (v: BeatboxVoice) => void) => {
    f(cur.voice);
    for (const s of fading) if (!s.dead) f(s.voice);
  };

  const eng: BeatboxEngine = {
    get id() { return cur.voice.info.id; },
    get info() { return cur.voice.info; },
    output,
    update(state, when) {
      if (disposed) return;
      if (state.rpm !== undefined) live.rpm = clip(state.rpm, 0, 12000);
      if (state.throttle !== undefined) live.throttle = clip(state.throttle);
      if (state.speed !== undefined) live.speed = clip(state.speed, 0, 400);
      const t = when ?? now();
      eachVoice((v) => v.update(state, t));
    },
    setRpm: (rpm, when) => eng.update({ rpm }, when),
    setThrottle: (throttle, when) => eng.update({ throttle }, when),
    setDrive(d) {
      if (disposed) return;
      live.drive = clip(d);
      eachVoice((v) => v.setDrive(live.drive, now()));
    },
    setTone(t) {
      if (disposed) return;
      live.tone = clip(t);
      eachVoice((v) => v.setTone(live.tone, now()));
    },
    setPops(c) {
      if (disposed) return;
      live.pops = clip(c);
      eachVoice((v) => v.setPops(live.pops, now()));
    },
    setVolume(db) {
      const g = Math.pow(10, clip(db, -60, 6) / 20);
      output.gain.setTargetAtTime(g, now(), 0.03);
    },
    async setEngine(id, o = {}) {
      if (disposed) throw new Error('Beat Box engine disposed');
      const info = getBeatboxEngine(id);
      if (!info) throw new Error(`unknown Beat Box engine: ${id}`);
      const my = ++gen; // any older pending call is now superseded
      if (info.id === cur.voice.info.id) return;
      await ensureLoaded(info);
      if (my !== gen || disposed) return; // a later call (or dispose) won
      const ms = o.crossfadeMs ?? DEFAULT_XFADE_MS;
      const dur = Math.max(MIN_XFADE_S, clip(Number.isFinite(ms) ? ms : DEFAULT_XFADE_MS, 0, 2000) / 1000);
      const t = now();
      const voice = build(info, { ...live });
      const next = mount(voice, 0);
      next.stages[0].gain.setValueCurveAtTime(FADE_IN, t, dur);
      for (const s of [cur, ...fading]) {
        if (s.dead) continue;
        fadeOut(s, t, dur);
        fading.add(s);
      }
      cur = next;
    },
    start(when) {
      if (disposed) return;
      const t = when ?? now();
      live.level = 1;
      eachVoice((v) => v.rampLevel(1, 0.15, t));
    },
    stop(when) {
      if (disposed) return;
      const t = when ?? now();
      live.level = 0;
      eachVoice((v) => v.rampLevel(0, 0.25, t));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gen++;
      for (const s of fading) kill(s);
      fading.clear();
      kill(cur);
      try { output.disconnect(); } catch { /* already disconnected */ }
    },
  };
  return eng;
}
