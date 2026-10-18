/**
 * Beat Box: six original procedural ICE engine voices for RevForge (Web Audio, AudioWorklet).
 *
 *   await loadBeatboxWorklet(ctx);                 // optional; createBeatboxEngine does it too
 *   const eng = await createBeatboxEngine(ctx, ctx.destination, 'crossplane-v8');
 *   eng.setDrive(0.7); eng.setTone(0.5); eng.setPops(0.6); eng.setVolume(-6);
 *   eng.start();
 *   eng.update({ rpm: 3200, throttle: 0.8 });       // every frame (or from createTestDrive)
 *
 * Fully procedural; never touches localStorage / sessionStorage / IndexedDB.
 * Param ranges: docs/beatbox-audio.md.
 */
import { BEATBOX_ENGINES, getBeatboxEngine, type BeatboxEngineId, type BeatboxEngineInfo } from './engines.ts';

export { BEATBOX_ENGINES, getBeatboxEngine };
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

export interface BeatboxEngine {
  readonly id: BeatboxEngineId;
  readonly info: BeatboxEngineInfo;
  /** Final output node (volume stage), already connected to the destination. */
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
  /** Fade in (~150 ms). */
  start(when?: number): void;
  /** Fade out (~250 ms); the voice keeps running silently until dispose(). */
  stop(when?: number): void;
  /** Disconnect and free the worklet node. */
  dispose(): void;
}

export interface BeatboxCreateOptions {
  /** Override the worklet module URL (bundlers / tests). */
  workletUrl?: string;
  /** PRNG seed for deterministic renders. */
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

export async function createBeatboxEngine(
  ctx: BaseAudioContext,
  destination: AudioNode,
  engineId: BeatboxEngineId,
  opts: BeatboxCreateOptions = {},
): Promise<BeatboxEngine> {
  const info = getBeatboxEngine(engineId);
  if (!info) throw new Error(`unknown Beat Box engine: ${engineId}`);
  await loadBeatboxWorklet(ctx, opts.workletUrl);
  const seed = (opts.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0 || 0x5eed;
  const node = new AudioWorkletNode(ctx, BEATBOX_PROCESSOR, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { spec: info.voice, seed },
  });
  const output = ctx.createGain();
  node.connect(output);
  output.connect(destination);
  const param = (name: string) => {
    const p = node.parameters.get(name);
    if (!p) throw new Error(`beatbox param ${name} missing`);
    return p;
  };
  const pRpm = param('rpm'), pThr = param('throttle'), pSpd = param('speed');
  const pDrive = param('drive'), pTone = param('tone'), pPops = param('pops'), pLevel = param('level');
  const now = () => ctx.currentTime;
  const set = (p: AudioParam, v: number, when?: number) => p.setValueAtTime(v, when ?? now());
  set(pDrive, clip(opts.drive ?? 0.7));
  set(pTone, clip(opts.tone ?? 0.5));
  set(pPops, clip(opts.pops ?? 0));
  output.gain.value = Math.pow(10, clip(opts.volumeDb ?? 0, -60, 6) / 20);
  let disposed = false;

  const eng: BeatboxEngine = {
    id: info.id,
    info,
    output,
    update(state, when) {
      if (disposed) return;
      if (state.rpm !== undefined) set(pRpm, clip(state.rpm, 0, 12000), when);
      if (state.throttle !== undefined) set(pThr, clip(state.throttle), when);
      if (state.speed !== undefined) set(pSpd, clip(state.speed, 0, 400), when);
    },
    setRpm: (rpm, when) => eng.update({ rpm }, when),
    setThrottle: (throttle, when) => eng.update({ throttle }, when),
    setDrive: (d) => set(pDrive, clip(d)),
    setTone: (t) => set(pTone, clip(t)),
    setPops: (c) => set(pPops, clip(c)),
    setVolume(db) {
      const g = Math.pow(10, clip(db, -60, 6) / 20);
      output.gain.setTargetAtTime(g, now(), 0.03);
    },
    start(when) {
      const t = when ?? now();
      pLevel.cancelScheduledValues(t);
      pLevel.setValueAtTime(pLevel.value, t);
      pLevel.linearRampToValueAtTime(1, t + 0.15);
    },
    stop(when) {
      const t = when ?? now();
      pLevel.cancelScheduledValues(t);
      pLevel.setValueAtTime(pLevel.value, t);
      pLevel.linearRampToValueAtTime(0, t + 0.25);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { node.disconnect(); } catch { /* already disconnected */ }
      try { output.disconnect(); } catch { /* already disconnected */ }
      node.port.close();
    },
  };
  return eng;
}
