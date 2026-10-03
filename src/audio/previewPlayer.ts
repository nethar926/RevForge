/**
 * Pack previews (public/snippets/<id>.wav) through the HIG master chain.
 *
 * Replaces Frontend's `new Audio()` snippet player so a preview:
 *  - shares the engine's AudioContext, safety limiter and output (incl. the background media
 *    element when Background audio is on) — one audio session, not two competing ones;
 *  - is level-matched to the live engine at cruise (PREVIEW_TRIMS_DB, generated);
 *  - ducks a running engine instead of stacking on top of it, and un-ducks when it ends;
 *  - is one-at-a-time (a new preview stops the previous one with a short fade).
 *
 * Gesture rules: play() must be called from the tap; it calls ctx.resume() synchronously before
 * any await. Decoding uses decodeAudioData (no <audio> element, no HTMLMediaElement autoplay
 * policy). Decoded buffers are cached per URL.
 */
import { resolveLegacyPackId } from './builtins';
import type { MasterBus } from './playbackSession';
import { PREVIEW_TRIMS_DB } from './previewTrims';

export type PreviewState = 'idle' | 'loading' | 'playing';

/** Preview fade-in (s). */
export const PREVIEW_RAMP_IN_S = 0.15;
/** stop() / replace fade-out (s). */
export const PREVIEW_STOP_S = 0.12;
/** Engine duck time while a preview starts (s). */
export const PREVIEW_DUCK_S = 0.15;
/** Engine un-duck time after a preview ends (s). */
export const PREVIEW_UNDUCK_S = 0.25;

const SNIPPET_RE = /(?:^|\/)snippets\/([a-z0-9-]+)\.wav(?:[?#].*)?$/i;

function baseUrl(): string {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || './';
  } catch {
    return './';
  }
}

export interface PreviewTarget {
  /** Canonical pack id when known (trim lookup), else null. */
  id: string | null;
  url: string;
  /** Applied gain in dB (0 when the pack has no generated trim). */
  trimDb: number;
}

/**
 * Accepts a pack id ('v8-rumble', legacy 'tie-fighter'), a relative snippet path
 * ('snippets/v8-rumble.wav' — what EnginesPage's SNIPPETS map holds) or an absolute URL.
 */
export function resolvePreview(packIdOrUrl: string, base = baseUrl()): PreviewTarget {
  const m = SNIPPET_RE.exec(packIdOrUrl);
  if (m) {
    const id = resolveLegacyPackId(m[1]);
    const isAbs = /^(?:[a-z]+:)?\/\//i.test(packIdOrUrl) || packIdOrUrl.startsWith('/') || packIdOrUrl.startsWith('data:') || packIdOrUrl.startsWith('blob:');
    const url = isAbs ? packIdOrUrl : `${base}${packIdOrUrl.replace(/^\.\//, '')}`;
    return { id, url, trimDb: PREVIEW_TRIMS_DB[id] ?? 0 };
  }
  if (/[/.:]/.test(packIdOrUrl)) return { id: null, url: packIdOrUrl, trimDb: 0 };
  const id = resolveLegacyPackId(packIdOrUrl);
  return { id, url: `${base}snippets/${id}.wav`, trimDb: PREVIEW_TRIMS_DB[id] ?? 0 };
}

export interface PreviewPlayOptions {
  /** Extra gain (dB) on top of the generated trim. */
  gainDb?: number;
  /** Duck the engine while the preview plays (default: true when engineAudible()). */
  duckEngine?: boolean;
}

export interface PreviewPlayerDeps {
  ctx: BaseAudioContext & { resume?: () => Promise<void> };
  master: MasterBus;
  /** True while the engine is audible (preview ducks it). */
  engineAudible?: () => boolean;
  /** Injected for tests. Defaults to globalThis.fetch. */
  fetch?: (url: string) => Promise<{ ok: boolean; status?: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  onState?: (state: PreviewState, id: string | null) => void;
}

interface Active {
  token: number;
  target: PreviewTarget;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
  ducked: boolean;
  settle: (ok: boolean, err?: unknown) => void;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

export class PreviewPlayer {
  private deps: PreviewPlayerDeps;
  private cache = new Map<string, Promise<AudioBuffer>>();
  private active: Active | null = null;
  private token = 0;
  private _state: PreviewState = 'idle';

  constructor(deps: PreviewPlayerDeps) {
    this.deps = deps;
  }

  get state(): PreviewState {
    return this._state;
  }

  /** Canonical id of the preview loading / playing, else null. */
  get previewingId(): string | null {
    return this.active ? (this.active.target.id ?? this.active.target.url) : null;
  }

  /**
   * Play a preview (call from the tap). Resolves when it finishes or is stopped / replaced;
   * rejects if it cannot load or decode, or the context cannot start.
   */
  play(packIdOrUrl: string, opts: PreviewPlayOptions = {}): Promise<void> {
    const { ctx, master } = this.deps;
    // Gesture-critical: resume synchronously inside the tap (before any await).
    let resumed: Promise<void> = Promise.resolve();
    if (ctx.state !== 'running' && typeof ctx.resume === 'function') {
      try {
        resumed = ctx.resume();
      } catch (e) {
        resumed = Promise.reject(e);
      }
    }
    this.stop();
    const target = resolvePreview(packIdOrUrl);
    const token = ++this.token;
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const a: Active = {
        token,
        target,
        src: null,
        gain: null,
        ducked: false,
        settle: (ok, err) => {
          if (done) return;
          done = true;
          if (ok) resolve();
          else reject(err instanceof Error ? err : new Error(String(err ?? 'preview failed')));
        },
      };
      this.active = a;
      this.setState('loading');
      void (async () => {
        try {
          const [buffer] = await Promise.all([this.load(target.url), resumed]);
          if (this.active !== a) return a.settle(true);
          const now = ctx.currentTime;
          const gain = ctx.createGain();
          const level = dbToGain(target.trimDb + (opts.gainDb ?? 0));
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(level, now + PREVIEW_RAMP_IN_S);
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.connect(gain);
          gain.connect(master.auxInput);
          a.src = src;
          a.gain = gain;
          const duck = opts.duckEngine ?? !!this.deps.engineAudible?.();
          if (duck) {
            master.duck(PREVIEW_DUCK_S);
            a.ducked = true;
          }
          src.onended = () => {
            if (this.active === a) this.finish(a, 0);
          };
          src.start(now);
          this.setState('playing');
        } catch (err) {
          if (this.active === a) {
            this.active = null;
            this.setState('idle');
          }
          a.settle(false, err);
        }
      })();
    });
  }

  /** Stop the current preview (short fade) and un-duck the engine. No-op when idle. */
  stop(fadeSeconds = PREVIEW_STOP_S): void {
    const a = this.active;
    if (!a) return;
    this.finish(a, fadeSeconds);
  }

  /** Drop decoded buffers (memory). */
  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.stop(0);
    this.cache.clear();
  }

  private finish(a: Active, fadeSeconds: number): void {
    if (this.active === a) this.active = null;
    const { ctx, master } = this.deps;
    const now = ctx.currentTime;
    const fade = Math.max(0, fadeSeconds);
    if (a.gain && a.src) {
      const g = a.gain.gain;
      try {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + Math.max(0.005, fade));
        a.src.onended = null;
        a.src.stop(now + Math.max(0.005, fade) + 0.01);
      } catch {
        /* already stopped */
      }
      const src = a.src, gain = a.gain;
      const cleanup = () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          /* gone */
        }
      };
      src.onended = cleanup;
    }
    if (a.ducked) master.unduck(PREVIEW_UNDUCK_S);
    if (!this.active) this.setState('idle');
    a.settle(true);
  }

  private load(url: string): Promise<AudioBuffer> {
    let p = this.cache.get(url);
    if (!p) {
      const f = this.deps.fetch ?? ((u: string) => (globalThis as unknown as { fetch: PreviewPlayerDeps['fetch'] & object }).fetch(u));
      p = (async () => {
        const res = await f(url);
        if (!res.ok) throw new Error(`preview ${url}: HTTP ${res.status ?? '?'}`);
        const data = await res.arrayBuffer();
        return await this.deps.ctx.decodeAudioData(data);
      })();
      p.catch(() => this.cache.delete(url));
      this.cache.set(url, p);
    }
    return p;
  }

  private setState(s: PreviewState): void {
    this._state = s;
    this.deps.onState?.(s, this.previewingId);
  }
}
