/**
 * RevForge playback session — Apple HIG "Playing audio" for the Web Audio engine.
 *
 *  - Master bus: every engine voice → fade gain → safety limiter (DynamicsCompressor, hard knee,
 *    makeup gain cancelled) → soft ceiling (WaveShaper, −1 dBFS sample peak) → speakers / media
 *    element. Unity below −3 dBFS, never above unity: no surprise loudness, system volume rules.
 *  - Ramps: every start, resume and pack switch enters from silence over RAMP_IN_S.
 *  - Interruptions: AudioContext 'interrupted' / unexpected 'suspended', page hidden, pagehide →
 *    fade to silence over FADE_OUT_S and go 'paused'. Never auto-resumes: only resume(), called
 *    from a user tap (or a hardware play button where the browser grants it).
 *  - Media Session: metadata + playbackState + play/pause/stop always on (feature-detected).
 *    Chromium only surfaces Media Session for an HTMLMediaElement, never for bare Web Audio,
 *    so the session keeps a media element active: the real mix via MediaOutput when Background
 *    audio is on, otherwise a silent procedural MediaStream carrier (no file, no fetch).
 *
 * Nothing here creates or resumes an AudioContext on import, construction or mount. The host
 * (useAudioEngine) creates the context inside the Ignition tap and calls attach().
 * Fully procedural — no samples. See docs/hig-playing-audio.md.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getTimeJumpCueEnabled, setTimeJumpCueEnabled } from './cuePrefs';

/* ------------------------------------------------------------------ constants */

/** Soft-ceiling sample peak (dBFS). */
export const LIMITER_CEILING_DB = -1;
/** Compressor threshold / soft-ceiling knee start (dBFS). Signals below are bit-for-bit unity. */
export const LIMITER_THRESHOLD_DB = -3;
export const LIMITER_RATIO = 20;
export const LIMITER_ATTACK_S = 0.002;
export const LIMITER_RELEASE_S = 0.2;
/** Ramp-in from silence on start / resume / pack switch. */
export const RAMP_IN_S = 0.25;
/** Fade to silence on interruption / backgrounding. */
export const FADE_OUT_S = 0.15;
/** De-click fade used before a ramp when something is still sounding. */
export const DECLICK_S = 0.01;
/** Short dip before a pack switch ramps back in. */
export const SWITCH_DIP_S = 0.03;
/** Give up on a resume() the browser leaves pending (no user activation). */
export const RESUME_TIMEOUT_MS = 1500;
/** Hardware media buttons often double-fire (steering wheels). */
export const MEDIA_ACTION_DEBOUNCE_MS = 300;
/** Legacy experimental media-button flag (src/forge/useVehicleMedia.ts owns the session while on). */
export const LEGACY_MEDIA_FLAG = 'revforge.media.experimental';

const dbToGain = (db: number) => Math.pow(10, db / 20);

/**
 * Makeup gain (dB) a Web Audio DynamicsCompressorNode applies on its own, per the spec
 * ("computing the makeup gain": (1 / fullRangeGain) ^ 0.6) for a hard knee (knee = 0).
 * Chromium, WebKit, Gecko and node-web-audio-api all implement it; we cancel it so the
 * limiter never raises normal levels.
 */
export function compressorMakeupDb(thresholdDb: number, ratio: number): number {
  const fullRangeDb = thresholdDb >= 0 ? 0 : thresholdDb + (0 - thresholdDb) / ratio;
  return 0.6 * -fullRangeDb;
}

/** Soft ceiling transfer: identity up to the knee, tanh into the ceiling, never above it. */
export function softCeiling(x: number, kneeDb = LIMITER_THRESHOLD_DB, ceilingDb = LIMITER_CEILING_DB): number {
  const t = dbToGain(kneeDb), c = dbToGain(ceilingDb), a = Math.abs(x);
  if (a <= t) return x;
  const y = t + (c - t) * Math.tanh((a - t) / (c - t));
  return Math.sign(x) * Math.min(c, y);
}

/** WaveShaper curve for softCeiling over [−1, 1] (odd length → 0 maps to exactly 0). */
export function softCeilingCurve(points = 8193, kneeDb = LIMITER_THRESHOLD_DB, ceilingDb = LIMITER_CEILING_DB): Float32Array<ArrayBuffer> {
  const n = points % 2 ? points : points + 1;
  const curve = new Float32Array(n) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < n; i++) curve[i] = softCeiling((2 * i) / (n - 1) - 1, kneeDb, ceilingDb);
  return curve;
}

/* ------------------------------------------------------------------ master bus */

export interface MasterBus {
  /** Engines connect here (the fade gain). */
  readonly input: GainNode;
  /** Post-limiter output (unity gain node). Connected to ctx.destination on creation. */
  readonly output: GainNode;
  readonly limiter: DynamicsCompressorNode | null;
  readonly ceiling: WaveShaperNode | null;
  /** Immediately silent (only use while nothing is audible, e.g. before a start). */
  silence(): void;
  /** Ramp from silence to unity over `seconds` (default RAMP_IN_S). */
  rampIn(seconds?: number): void;
  /** Fade from the current level to silence; returns the context time the fade ends. */
  fadeOut(seconds?: number): number;
  /** Pack switch: short dip to silence, then ramp in. */
  switchRamp(dipSeconds?: number, rampSeconds?: number): void;
  /** Current fade gain value (0..1). Never above 1. */
  level(): number;
  dispose(): void;
}

function holdParam(p: AudioParam, now: number): number {
  const v = Math.max(0, Math.min(1, p.value));
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyP.cancelAndHoldAtTime === 'function') {
    try {
      anyP.cancelAndHoldAtTime(now);
      p.setValueAtTime(v, now);
      return v;
    } catch {
      /* fall through */
    }
  }
  p.cancelScheduledValues(now);
  p.setValueAtTime(v, now);
  return v;
}

/** Build the master bus. Safe on any BaseAudioContext; falls back to a pass-through. */
export function createMasterBus(ctx: BaseAudioContext, opts: { connect?: boolean } = {}): MasterBus {
  const input = ctx.createGain();
  input.gain.value = 0;
  const output = ctx.createGain();
  output.gain.value = 1;
  let limiter: DynamicsCompressorNode | null = null;
  let ceiling: WaveShaperNode | null = null;
  let trim: GainNode | null = null;
  try {
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER_THRESHOLD_DB;
    limiter.knee.value = 0;
    limiter.ratio.value = LIMITER_RATIO;
    limiter.attack.value = LIMITER_ATTACK_S;
    limiter.release.value = LIMITER_RELEASE_S;
    trim = ctx.createGain();
    trim.gain.value = dbToGain(-compressorMakeupDb(LIMITER_THRESHOLD_DB, LIMITER_RATIO));
  } catch {
    limiter = null;
    trim = null;
  }
  try {
    ceiling = ctx.createWaveShaper();
    ceiling.curve = softCeilingCurve();
    ceiling.oversample = 'none';
  } catch {
    ceiling = null;
  }
  let node: AudioNode = input;
  if (limiter && trim) {
    node.connect(limiter);
    limiter.connect(trim);
    node = trim;
  }
  if (ceiling) {
    node.connect(ceiling);
    node = ceiling;
  }
  node.connect(output);
  if (opts.connect !== false) output.connect(ctx.destination);

  const g = input.gain;
  return {
    input,
    output,
    limiter,
    ceiling,
    silence() {
      // 10 ms de-click fade (a shutoff tail may still be sounding), then held at 0.
      const now = ctx.currentTime;
      const v = holdParam(g, now);
      if (v > 0.001) g.linearRampToValueAtTime(0, now + DECLICK_S);
      else g.setValueAtTime(0, now);
    },
    rampIn(seconds = RAMP_IN_S) {
      const now = ctx.currentTime;
      const v = holdParam(g, now);
      let t = now;
      if (v > 0.001) {
        t = now + DECLICK_S;
        g.linearRampToValueAtTime(0, t);
      } else g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(1, t + Math.max(0.005, seconds));
    },
    fadeOut(seconds = FADE_OUT_S) {
      const now = ctx.currentTime;
      holdParam(g, now);
      const end = now + Math.max(0.005, seconds);
      g.linearRampToValueAtTime(0, end);
      return end;
    },
    switchRamp(dipSeconds = SWITCH_DIP_S, rampSeconds = RAMP_IN_S) {
      const now = ctx.currentTime;
      holdParam(g, now);
      const dipEnd = now + Math.max(0.005, dipSeconds);
      g.linearRampToValueAtTime(0, dipEnd);
      g.linearRampToValueAtTime(1, dipEnd + Math.max(0.005, rampSeconds));
    },
    level() {
      return Math.max(0, Math.min(1, g.value));
    },
    dispose() {
      for (const n of [input, limiter, trim, ceiling, output]) {
        try {
          n?.disconnect();
        } catch {
          /* already gone */
        }
      }
    },
  };
}

/* ------------------------------------------------------------------ session */

export type PlaybackState = 'idle' | 'running' | 'paused';
export type PauseReason = 'hidden' | 'pagehide' | 'interrupted' | 'suspended' | 'media-pause' | 'user';

export interface PlaybackSnapshot {
  state: PlaybackState;
  /** Why we paused (null unless paused). */
  reason: PauseReason | null;
  /** True when paused and a tap on resume() can bring sound back. */
  canResume: boolean;
  /** Page visibility as last observed. */
  pageVisible: boolean;
}

export interface MediaInfo {
  /** Pack display name (MediaMetadata.title). */
  title?: string;
  /** MediaMetadata.album, e.g. 'Automatic gearbox'. */
  album?: string;
  /** Defaults to 'RevForge'. */
  artist?: string;
  artwork?: MediaImage[];
}

export type MediaAction = 'play' | 'pause' | 'stop' | 'nexttrack' | 'previoustrack';
export type MediaActionHandlers = Partial<Record<MediaAction, (() => void) | null>>;

/** Host callbacks used by the default Media Session actions (no Frontend hook mounted). */
export interface PlaybackHost {
  /** Hardware play while idle → start the engine (host must stay gesture-safe). */
  start?: () => void;
  /** Hardware stop → stop the engine. */
  stop?: () => void;
  /** The routed media element failed to play() on resume — fall back to direct output. */
  onMediaBlocked?: () => void;
}

interface EventTargetLike {
  addEventListener(type: string, fn: (e?: unknown) => void): void;
  removeEventListener(type: string, fn: (e?: unknown) => void): void;
}
interface DocumentLike extends EventTargetLike {
  visibilityState?: string;
}
interface MediaSessionLike {
  metadata: unknown;
  playbackState: string;
  setActionHandler(action: string, handler: (() => void) | null): void;
}
interface NavigatorLike {
  mediaSession?: MediaSessionLike;
}
interface StorageLike {
  getItem(key: string): string | null;
}
export interface ContextLike extends EventTargetLike {
  readonly state: string;
  readonly currentTime: number;
  resume(): Promise<void>;
  suspend?(): Promise<void>;
  createMediaStreamDestination?(): MediaStreamAudioDestinationNode;
}
interface MediaElementLike {
  play(): Promise<void>;
  pause(): void;
  readonly paused?: boolean;
  srcObject?: unknown;
  setAttribute?(k: string, v: string): void;
}

export interface PlaybackEnv {
  document: DocumentLike | null;
  window: EventTargetLike | null;
  navigator: NavigatorLike | null;
  storage: StorageLike | null;
  MediaMetadata: (new (init: MediaMetadataInit) => unknown) | null;
  createAudioElement: (() => MediaElementLike) | null;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  now: () => number;
}

function defaultEnv(): PlaybackEnv {
  const g = globalThis as unknown as Record<string, unknown>;
  let storage: StorageLike | null = null;
  try {
    storage = (g.localStorage as StorageLike) ?? null;
  } catch {
    storage = null;
  }
  return {
    document: (g.document as DocumentLike) ?? null,
    window: typeof g.addEventListener === 'function' ? (g as unknown as EventTargetLike) : null,
    navigator: (g.navigator as NavigatorLike) ?? null,
    storage,
    MediaMetadata: (g.MediaMetadata as PlaybackEnv['MediaMetadata']) ?? null,
    createAudioElement: typeof g.Audio === 'function' ? () => new (g.Audio as new () => MediaElementLike)() : null,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}

export interface PlaybackSessionOptions {
  env?: Partial<PlaybackEnv>;
  /** Pause when the page is hidden (default true, HIG). */
  pauseWhenHidden?: boolean;
  fadeOutSeconds?: number;
  rampInSeconds?: number;
}

let cachedArtwork: MediaImage[] | null = null;
/** Procedural artwork (tach arc + needle). PNG via canvas where available, else SVG data URL. */
export function revforgeArtwork(): MediaImage[] {
  if (cachedArtwork) return cachedArtwork;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='112' fill='#0b0d12'/>" +
    "<path d='M120 352a150 150 0 1 1 272 0' fill='none' stroke='#2a3140' stroke-width='34' stroke-linecap='round'/>" +
    "<path d='M120 352a150 150 0 0 1 214-196' fill='none' stroke='#ff6a2b' stroke-width='34' stroke-linecap='round'/>" +
    "<path d='M256 300L352 196' stroke='#f4f4f6' stroke-width='18' stroke-linecap='round'/><circle cx='256' cy='300' r='26' fill='#f4f4f6'/></svg>";
  const svgUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const art: MediaImage[] = [{ src: svgUrl, sizes: '512x512', type: 'image/svg+xml' }];
  try {
    const dom = (globalThis as { document?: Document }).document;
    const canvas = dom?.createElement?.('canvas');
    const c = canvas?.getContext?.('2d');
    if (canvas && c) {
      canvas.width = canvas.height = 512;
      c.fillStyle = '#0b0d12';
      c.beginPath();
      c.roundRect?.(0, 0, 512, 512, 112);
      if (!c.roundRect) c.rect(0, 0, 512, 512);
      c.fill();
      c.lineCap = 'round';
      c.lineWidth = 34;
      c.strokeStyle = '#2a3140';
      c.beginPath();
      c.arc(256, 280, 150, Math.PI * 0.8, Math.PI * 2.2);
      c.stroke();
      c.strokeStyle = '#ff6a2b';
      c.beginPath();
      c.arc(256, 280, 150, Math.PI * 0.8, Math.PI * 1.7);
      c.stroke();
      c.strokeStyle = '#f4f4f6';
      c.lineWidth = 18;
      c.beginPath();
      c.moveTo(256, 300);
      c.lineTo(352, 196);
      c.stroke();
      c.fillStyle = '#f4f4f6';
      c.beginPath();
      c.arc(256, 300, 26, 0, Math.PI * 2);
      c.fill();
      const png = canvas.toDataURL('image/png');
      if (png.startsWith('data:image/png')) art.unshift({ src: png, sizes: '512x512', type: 'image/png' });
    }
  } catch {
    /* SVG only */
  }
  cachedArtwork = art;
  return art;
}

export function albumForMode(mode?: string): string {
  if (!mode) return 'Automatic gearbox';
  if (mode === 'manual') return 'Manual gearbox';
  if (mode === 'auto' || mode === 'automatic') return 'Automatic gearbox';
  return mode;
}

/**
 * Playback state machine + lifecycle listeners + Media Session bridge.
 * idle ──markRunning──▶ running ──pause(reason)──▶ paused ──resume() [tap]──▶ running
 *   ▲                      │                          │
 *   └──────markStopped─────┴──────────markStopped─────┘
 */
export class PlaybackSession {
  private env: PlaybackEnv;
  private opts: Required<Omit<PlaybackSessionOptions, 'env'>>;
  private ctx: ContextLike | null = null;
  private master: MasterBus | null = null;
  private getRoutedElement: () => MediaElementLike | null = () => null;
  private host: PlaybackHost = {};
  private carrier: { el: MediaElementLike; dest: MediaStreamAudioDestinationNode } | null = null;
  private snap: PlaybackSnapshot = { state: 'idle', reason: null, canResume: false, pageVisible: true };
  private listeners = new Set<(s: PlaybackSnapshot) => void>();
  private info: MediaInfo = {};
  private overrides: MediaActionHandlers = {};
  private claimed = 0;
  private everRan = false;
  private selfSuspending = false;
  private suspendTimer: unknown = null;
  private resuming: Promise<boolean> | null = null;
  private lastAction = -Infinity;
  private elementWasPlaying: MediaElementLike | null = null;
  private registered = new Set<string>();
  private bound = false;

  constructor(options: PlaybackSessionOptions = {}) {
    this.env = { ...defaultEnv(), ...(options.env ?? {}) };
    this.opts = {
      pauseWhenHidden: options.pauseWhenHidden ?? true,
      fadeOutSeconds: options.fadeOutSeconds ?? FADE_OUT_S,
      rampInSeconds: options.rampInSeconds ?? RAMP_IN_S,
    };
    this.snap.pageVisible = this.env.document?.visibilityState !== 'hidden';
  }

  /* ---- wiring (host) ---- */

  /** Attach the (already gesture-created) context + master bus. Registers lifecycle listeners. */
  attach(ctx: ContextLike, master: MasterBus | null, opts: { getMediaElement?: () => MediaElementLike | null; host?: PlaybackHost } = {}): void {
    if (this.ctx && this.ctx !== ctx) this.detach();
    this.ctx = ctx;
    this.master = master;
    if (opts.getMediaElement) this.getRoutedElement = opts.getMediaElement;
    if (opts.host) this.host = opts.host;
    if (!this.bound) {
      this.env.document?.addEventListener('visibilitychange', this.onVisibility);
      this.env.window?.addEventListener('pagehide', this.onPageHide);
      this.bound = true;
    }
    ctx.addEventListener('statechange', this.onContextState);
    this.applyMediaSession();
  }

  /** time-jump cue on/off for non-React callers (shared with the hook / engine; default on). */
  setTimeJumpCueEnabled(on: boolean): void {
    setTimeJumpCueEnabled(on);
  }

  getTimeJumpCueEnabled(): boolean {
    return getTimeJumpCueEnabled();
  }

  /** HIG default true. false = keep sounding while hidden (only if Wilson opts in). */
  setPauseWhenHidden(value: boolean): void {
    this.opts.pauseWhenHidden = value;
  }

  setHost(host: PlaybackHost): void {
    this.host = host;
  }

  detach(): void {
    this.ctx?.removeEventListener('statechange', this.onContextState);
    if (this.bound) {
      this.env.document?.removeEventListener('visibilitychange', this.onVisibility);
      this.env.window?.removeEventListener('pagehide', this.onPageHide);
      this.bound = false;
    }
    this.clearSuspendTimer();
    this.stopCarrier(true);
    this.ctx = null;
    this.master = null;
  }

  dispose(): void {
    this.markStopped();
    this.detach();
    const ms = this.mediaSession();
    if (ms && this.ownsMediaSession()) {
      for (const a of this.registered) this.trySetHandler(ms, a, null);
      try {
        ms.metadata = null;
        ms.playbackState = 'none';
      } catch {
        /* ignore */
      }
    }
    this.registered.clear();
    this.listeners.clear();
  }

  /** The engine is audible after a gesture start (Ignition / Audition). */
  markRunning(): void {
    this.clearSuspendTimer();
    this.everRan = true;
    this.set({ state: 'running', reason: null, canResume: false });
    this.ensureCarrier();
  }

  /** The user (or host) stopped the engine. */
  markStopped(): void {
    this.clearSuspendTimer();
    if (this.snap.state === 'idle') return;
    this.set({ state: 'idle', reason: null, canResume: false });
    this.stopCarrier(false);
  }

  /**
   * Fade to silence and go paused. No-op unless running. OS-level reasons (hidden, pagehide,
   * interrupted, suspended) also suspend the context after the fade.
   */
  pause(reason: PauseReason = 'user'): boolean {
    if (this.snap.state !== 'running') return false;
    this.master?.fadeOut(this.opts.fadeOutSeconds);
    this.set({ state: 'paused', reason, canResume: true });
    const osLevel = reason === 'hidden' || reason === 'pagehide' || reason === 'interrupted' || reason === 'suspended';
    this.clearSuspendTimer();
    const after = () => {
      this.suspendTimer = null;
      if (this.snap.state !== 'paused') return;
      this.pauseElements();
      const ctx = this.ctx;
      if (osLevel && ctx && ctx.state === 'running' && ctx.suspend) {
        this.selfSuspending = true;
        void ctx
          .suspend()
          .catch(() => undefined)
          .finally(() => {
            this.selfSuspending = false;
          });
      }
    };
    // pagehide may be the last chance to run; act now there (the fade is already scheduled).
    if (reason === 'pagehide') after();
    else this.suspendTimer = this.env.setTimeout(after, Math.round(this.opts.fadeOutSeconds * 1000) + 20);
    return true;
  }

  /**
   * Resume after an interruption. Call ONLY from a user gesture (tap, or a hardware play
   * button routed by the browser). Never called automatically. Resolves true when audible.
   */
  resume(): Promise<boolean> {
    if (this.snap.state !== 'paused') return Promise.resolve(this.snap.state === 'running');
    if (this.resuming) return this.resuming;
    this.resuming = (async () => {
      try {
        this.clearSuspendTimer();
        const ctx = this.ctx;
        if (!ctx) return false;
        if (ctx.state !== 'running') {
          // Without a user activation some browsers leave resume() pending forever: give up
          // after RESUME_TIMEOUT_MS and stay paused (the next tap tries again).
          let timer: unknown = null;
          const granted = await Promise.race([
            ctx.resume().then(
              () => true,
              () => false,
            ),
            new Promise<boolean>((r) => {
              timer = this.env.setTimeout(() => r(false), RESUME_TIMEOUT_MS);
            }),
          ]);
          if (timer !== null) this.env.clearTimeout(timer);
          if (!granted) return false;
        }
        if (ctx.state !== 'running' || this.snap.state !== 'paused') return false;
        this.master?.silence();
        await this.playElementsAfterResume();
        this.master?.rampIn(this.opts.rampInSeconds);
        this.set({ state: 'running', reason: null, canResume: false });
        return true;
      } finally {
        this.resuming = null;
      }
    })();
    return this.resuming;
  }

  getSnapshot = (): PlaybackSnapshot => this.snap;

  subscribe = (fn: (s: PlaybackSnapshot) => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /* ---- Media Session ---- */

  setMediaInfo(info: MediaInfo): void {
    this.info = { ...this.info, ...info };
    this.applyMediaSession();
  }

  /** Frontend hook overrides (usePlaybackSession). Claimed sessions ignore the legacy flag. */
  setActionHandlers(handlers: MediaActionHandlers): void {
    this.overrides = { ...handlers };
    this.applyMediaSession();
  }

  claim(): () => void {
    this.claimed++;
    this.applyMediaSession();
    return () => {
      this.claimed = Math.max(0, this.claimed - 1);
      if (!this.claimed) this.overrides = {};
      this.applyMediaSession();
    };
  }

  /** Dispatch a media action as if the OS sent it (also used by tests). */
  dispatch(action: MediaAction): void {
    const now = this.env.now();
    if (now - this.lastAction < MEDIA_ACTION_DEBOUNCE_MS) return;
    this.lastAction = now;
    const o = this.overrides[action];
    if (action === 'play' && this.snap.state === 'paused') {
      void this.resume();
      return;
    }
    if (o) {
      o();
      return;
    }
    this.defaultAction(action);
  }

  /** Built-in behaviour for a media action (no Frontend override). */
  defaultAction(action: MediaAction): void {
    if (action === 'play' && this.snap.state === 'paused') {
      void this.resume();
      return;
    }
    if (action === 'play') {
      if (this.snap.state === 'idle') this.host.start?.();
    } else if (action === 'pause') {
      this.pause('media-pause');
    } else if (action === 'stop') {
      if (this.host.stop) this.host.stop();
      else this.pause('media-pause');
    }
  }

  /** True while the session (not the legacy experimental hook) drives navigator.mediaSession. */
  ownsMediaSession(): boolean {
    if (this.claimed > 0) return true;
    try {
      return this.env.storage?.getItem(LEGACY_MEDIA_FLAG) !== 'true';
    } catch {
      return true;
    }
  }

  /* ---- internals ---- */

  private set(patch: Partial<PlaybackSnapshot>): void {
    const next = { ...this.snap, ...patch };
    if (
      next.state === this.snap.state &&
      next.reason === this.snap.reason &&
      next.canResume === this.snap.canResume &&
      next.pageVisible === this.snap.pageVisible
    )
      return;
    this.snap = next;
    this.applyMediaSession();
    for (const fn of [...this.listeners]) {
      try {
        fn(next);
      } catch {
        /* a broken subscriber must not break playback */
      }
    }
  }

  private onVisibility = () => {
    const hidden = this.env.document?.visibilityState === 'hidden';
    this.set({ pageVisible: !hidden });
    if (hidden && this.opts.pauseWhenHidden) this.pause('hidden');
    else this.applyMediaSession(); // visible again: re-assert handlers, stay paused
  };

  private onPageHide = () => {
    this.pause('pagehide');
  };

  private onContextState = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'closed') {
      this.markStopped();
      return;
    }
    if (this.snap.state !== 'running' || this.selfSuspending) return;
    if (ctx.state === 'interrupted') this.pause('interrupted');
    else if (ctx.state === 'suspended') this.pause('suspended');
  };

  private clearSuspendTimer(): void {
    if (this.suspendTimer !== null) this.env.clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
  }

  private activeElement(): MediaElementLike | null {
    return this.getRoutedElement() ?? this.carrier?.el ?? null;
  }

  private pauseElements(): void {
    const el = this.activeElement();
    this.elementWasPlaying = el && el.paused !== true ? el : null;
    try {
      el?.pause();
    } catch {
      /* ignore */
    }
  }

  private async playElementsAfterResume(): Promise<void> {
    const routed = this.getRoutedElement();
    const el = routed ?? this.carrier?.el ?? null;
    if (!el) return;
    if (!routed && !this.elementWasPlaying) return;
    try {
      await el.play();
    } catch {
      if (routed) this.host.onMediaBlocked?.();
    }
    this.elementWasPlaying = null;
  }

  /** Silent procedural carrier so Chromium surfaces Media Session when the mix isn't routed. */
  private ensureCarrier(): void {
    if (!this.ownsMediaSession() || !this.mediaSession()) return;
    if (this.getRoutedElement()) {
      this.stopCarrier(true);
      return;
    }
    const ctx = this.ctx;
    if (!ctx?.createMediaStreamDestination || !this.env.createAudioElement) return;
    try {
      if (!this.carrier) {
        const dest = ctx.createMediaStreamDestination();
        const el = this.env.createAudioElement();
        el.setAttribute?.('playsinline', '');
        el.srcObject = dest.stream;
        this.carrier = { el, dest };
      }
      void this.carrier.el.play().catch(() => undefined);
    } catch {
      this.carrier = null;
    }
  }

  private stopCarrier(release: boolean): void {
    const c = this.carrier;
    if (!c) return;
    try {
      c.el.pause();
    } catch {
      /* ignore */
    }
    if (!release) return;
    try {
      c.el.srcObject = null;
      c.dest.stream.getTracks().forEach((t) => t.stop());
      c.dest.disconnect();
    } catch {
      /* ignore */
    }
    this.carrier = null;
  }

  private mediaSession(): MediaSessionLike | null {
    const ms = this.env.navigator?.mediaSession;
    return ms && typeof ms.setActionHandler === 'function' ? ms : null;
  }

  private trySetHandler(ms: MediaSessionLike, action: string, fn: (() => void) | null): boolean {
    try {
      ms.setActionHandler(action, fn);
      return true;
    } catch {
      return false;
    }
  }

  private applyMediaSession(): void {
    const ms = this.mediaSession();
    if (!ms || !this.ctx || !this.ownsMediaSession()) return;
    const actions: MediaAction[] = ['play', 'pause', 'stop'];
    if (this.overrides.nexttrack) actions.push('nexttrack');
    if (this.overrides.previoustrack) actions.push('previoustrack');
    for (const a of actions) if (this.trySetHandler(ms, a, () => this.dispatch(a))) this.registered.add(a);
    for (const a of ['nexttrack', 'previoustrack'] as const)
      if (!actions.includes(a) && this.registered.has(a)) {
        this.trySetHandler(ms, a, null);
        this.registered.delete(a);
      }
    try {
      const s = this.snap.state;
      ms.playbackState = s === 'running' ? 'playing' : s === 'paused' ? 'paused' : 'none';
      if (this.env.MediaMetadata && (s !== 'idle' || this.everRan)) {
        ms.metadata = new this.env.MediaMetadata({
          title: this.info.title || 'RevForge',
          artist: this.info.artist || 'RevForge',
          album: this.info.album || albumForMode(),
          artwork: this.info.artwork ?? revforgeArtwork(),
        });
      }
    } catch {
      /* metadata unsupported */
    }
  }

  /** Registered action names (diagnostics / legacy `accepted`). */
  acceptedActions(): string[] {
    return [...this.registered];
  }
}

/* ------------------------------------------------------------------ singleton + hook */

let shared: PlaybackSession | null = null;
/** Page-wide session (one Media Session per page). Lazily constructed; touches no audio. */
export function getPlaybackSession(): PlaybackSession {
  if (!shared) shared = new PlaybackSession();
  return shared;
}

/** Replace the shared session (tests). */
export function setPlaybackSessionForTests(s: PlaybackSession | null): void {
  shared = s;
}

export interface PlaybackEngineHandle {
  patchName?: string;
  running?: boolean;
  playback?: PlaybackSession;
}

/**
 * Frontend hook. Canonical options plus useVehicleMedia-compatible aliases, so the
 * experimental checkbox swap is a one-line rename (see docs/hig-playing-audio.md).
 */
export interface UsePlaybackSessionOptions {
  engine?: PlaybackEngineHandle;
  packName?: string;
  /** 'auto' | 'manual' → album 'Automatic gearbox' / 'Manual gearbox'. */
  mode?: string;
  album?: string;
  running?: boolean;
  /** Hardware play while idle. Default: host start (useAudioEngine). Paused → always resume(). */
  onPlay?: () => void;
  /** Hardware pause. Default: fade + paused (resumable). */
  onPause?: () => void;
  onStop?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  // useVehicleMedia aliases (ignored when the canonical field is given):
  name?: string;
  start?: () => void;
  stop?: () => void;
  manual?: boolean;
  pauseShifts?: boolean;
  shift?: (direction: number) => void;
  blasters?: boolean;
  fire?: () => void;
  /** Ignored: the session is always on. */
  enabled?: boolean;
  /** Ignored: the engine host provides the routed element. */
  getMediaElement?: () => HTMLAudioElement | null;
}

export interface UsePlaybackSessionResult extends PlaybackSnapshot {
  paused: boolean;
  resume: () => Promise<boolean>;
  pause: () => boolean;
  /** useVehicleMedia compatibility: no-op (the session arms itself on Ignition). */
  arm: () => void;
  accepted: string[];
  lastEvent: string;
  carrier: string;
}

export function usePlaybackSession(options: UsePlaybackSessionOptions = {}): UsePlaybackSessionResult {
  const session = options.engine?.playback ?? getPlaybackSession();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [lastEvent, setLastEvent] = useState('No media-button event received');

  useEffect(() => session.claim(), [session]);

  const title = options.packName ?? options.name ?? options.engine?.patchName;
  const manual = options.mode ? options.mode === 'manual' : options.manual;
  const album = options.album ?? albumForMode(options.mode ?? (manual ? 'manual' : 'auto'));
  useEffect(() => {
    session.setMediaInfo({ title, album });
  }, [session, title, album]);

  const hasShift = !!options.shift || !!options.onNextTrack || !!options.onPreviousTrack;
  useEffect(() => {
    const note = (a: string, what: string) => setLastEvent(`${a} → ${what} · ${new Date().toLocaleTimeString()}`);
    const running = () => latest.current.running ?? latest.current.engine?.running ?? session.getSnapshot().state === 'running';
    const isManual = () => (latest.current.mode ? latest.current.mode === 'manual' : !!latest.current.manual);
    const handlers: MediaActionHandlers = {
      play: () => {
        const o = latest.current;
        if (o.blasters && running() && o.fire) return (o.fire(), note('play', 'blaster'));
        if (running()) return note('play', 'none');
        const fn = o.onPlay ?? o.start;
        if (fn) fn();
        else session.defaultAction('play');
        note('play', 'start');
      },
      pause: () => {
        const o = latest.current;
        if (o.blasters && running() && o.fire) return (o.fire(), note('pause', 'blaster'));
        if (!running()) return note('pause', 'none');
        if (!o.onPause && isManual() && o.pauseShifts && o.shift) return (o.shift(1), note('pause', 'up'));
        const fn = o.onPause ?? o.stop;
        if (fn) return (fn(), note('pause', 'stop'));
        session.defaultAction('pause');
        note('pause', 'paused');
      },
      stop: () => {
        const o = latest.current;
        const fn = o.onStop ?? o.onPause ?? o.stop;
        if (fn) fn();
        else session.defaultAction('stop');
        note('stop', 'stop');
      },
    };
    if (hasShift) {
      handlers.nexttrack = () => {
        const o = latest.current;
        if (!running() || !isManual()) return note('nexttrack', 'none');
        if (o.onNextTrack) o.onNextTrack();
        else o.shift?.(1);
        note('nexttrack', 'up');
      };
      handlers.previoustrack = () => {
        const o = latest.current;
        if (!running() || !isManual()) return note('previoustrack', 'none');
        if (o.onPreviousTrack) o.onPreviousTrack();
        else o.shift?.(-1);
        note('previoustrack', 'down');
      };
    }
    session.setActionHandlers(handlers);
    return () => session.setActionHandlers({});
  }, [session, hasShift]);

  return {
    ...snap,
    paused: snap.state === 'paused',
    resume: () => session.resume(),
    pause: () => session.pause('user'),
    arm: () => undefined,
    accepted: session.acceptedActions(),
    lastEvent,
    carrier: snap.state === 'running' ? 'Active' : snap.state === 'paused' ? 'Paused' : 'Not activated',
  };
}
