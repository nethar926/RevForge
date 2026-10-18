/**
 * Effective interaction mode for drag-style controls (framework; pure, node-testable).
 *
 *   tapMode = preferTaps OR moving
 *
 * "Moving" is anything that is not KNOWN stopped: drags unlock only after the GPS speed has read 0 (≤ STOPPED_MPH,
 * GPS standstill noise) continuously for STOP_DWELL_MS while the fix is live and fresh. Any movement, any
 * non-live status (idle / demo / requesting / waiting / stale / denied / unavailable / error) or a reading older
 * than GPS_STALE_MS drops back to tap mode at once. Nothing here reads the HUD/demo speed: the app has no
 * user-declared "I'm parked" state, and the CJ Park detector (coldStart.parkStep) treats an unknown speed as 0,
 * which is the wrong way round for this gate.
 */
import type { GpsMotion } from '../hooks/gpsFixes.ts';

export type InteractionMode = 'drag' | 'tap';

/** Speed must have read 0 for this long, continuously, before drags unlock. */
export const STOP_DWELL_MS = 3000;
/** "0 mph" with GPS standstill noise (the same 0.5 mph the CJ Park detector enters at). */
export const STOPPED_MPH = 0.5;
/** A reading older than this is stale (matches useGeolocation's own STALE_MS). */
export const GPS_STALE_MS = 10000;

/** Continuous-stop tracker. stoppedSince = wall clock of the first stopped reading in the current run. */
export interface StopWatch { stoppedSince: number | null }
export const STOPWATCH_START: Readonly<StopWatch> = Object.freeze({ stoppedSince: null });

/** True when this reading is a trusted, fresh "stopped". */
export function readingStopped(m: GpsMotion, now: number): boolean {
  if (m.status !== 'live' || m.at === null) return false;
  if (!Number.isFinite(m.mph) || !Number.isFinite(m.at)) return false;
  if (now - m.at > GPS_STALE_MS || now < m.at - GPS_STALE_MS) return false;
  return Math.abs(m.mph) <= STOPPED_MPH;
}

/** One step: keep the run going while stopped, reset it on movement / unknown. */
export function stepStopWatch(prev: StopWatch, m: GpsMotion, now: number): StopWatch {
  if (!readingStopped(m, now)) return prev.stoppedSince === null ? prev : { stoppedSince: null };
  if (prev.stoppedSince !== null) return prev;
  return { stoppedSince: now };
}

/** Known stopped for at least STOP_DWELL_MS. */
export const knownStopped = (w: StopWatch, now: number): boolean => w.stoppedSince !== null && now - w.stoppedSince >= STOP_DWELL_MS;

/** The rule itself: tap when Prefer Taps is on OR we are not known stopped. */
export function resolveInteractionMode(preferTaps: boolean, stopped: boolean): InteractionMode {
  return preferTaps || !stopped ? 'tap' : 'drag';
}

/** Pure convenience for tests / one-off reads. */
export function interactionModeAt(preferTaps: boolean, w: StopWatch, now: number): InteractionMode {
  return resolveInteractionMode(preferTaps, knownStopped(w, now));
}

/* ------------------------------------------------------------------ the shared store */

export interface InteractionModeDeps {
  getPreferTaps(): boolean;
  subscribePreferTaps(f: () => void): () => void;
  getMotion(): GpsMotion;
  subscribeMotion(f: () => void): () => void;
  now?: () => number;
  setTimer?: (f: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}
export interface InteractionModeStore {
  get(): InteractionMode;
  subscribe(f: () => void): () => void;
  /** Re-read the feeds now (also runs on every feed change and when the dwell elapses). */
  refresh(): void;
  dispose(): void;
}

/**
 * One tracker for the whole app (a control mounted after 10 s at a standstill is in drag mode straight away).
 * The feeds are subscribed from the first read on (so no movement is ever missed between reads); one timer runs
 * only while a stopped run is open: it flips to 'drag' when the dwell completes, then re-checks staleness
 * (no fix for GPS_STALE_MS → tap).
 */
export function createInteractionModeStore(deps: InteractionModeDeps): InteractionModeStore {
  const now = deps.now ?? (() => Date.now());
  const setT = deps.setTimer ?? ((f: () => void, ms: number) => setTimeout(f, ms));
  const clearT = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let watch: StopWatch = STOPWATCH_START;
  let mode: InteractionMode = 'tap';
  let timer: unknown = null;
  const subs = new Set<() => void>();
  let unsub: (() => void)[] = [];

  const schedule = (t: number) => {
    if (timer !== null) clearT(timer);
    timer = null;
    const m = deps.getMotion();
    if (watch.stoppedSince === null) return;
    const dwellLeft = watch.stoppedSince + STOP_DWELL_MS - t;
    const staleLeft = m.at === null ? 0 : m.at + GPS_STALE_MS - t;
    const wait = dwellLeft > 0 ? Math.min(dwellLeft, staleLeft) : staleLeft;
    timer = setT(() => {
      timer = null;
      refresh();
    }, Math.max(0, wait) + 1);
  };
  function refresh() {
    const t = now();
    watch = stepStopWatch(watch, deps.getMotion(), t);
    const next = interactionModeAt(deps.getPreferTaps(), watch, t);
    schedule(t);
    if (next !== mode) {
      mode = next;
      for (const f of [...subs]) f();
    }
  }
  const attach = () => {
    unsub = [deps.subscribePreferTaps(refresh), deps.subscribeMotion(refresh)];
    refresh();
  };
  const detach = () => {
    for (const u of unsub) u();
    unsub = [];
    if (timer !== null) clearT(timer);
    timer = null;
  };
  let attached = false;
  const ensure = () => {
    if (attached) return;
    attached = true;
    attach();
  };
  return {
    get: () => {
      ensure();
      return mode;
    },
    subscribe(f) {
      ensure();
      subs.add(f);
      return () => void subs.delete(f);
    },
    refresh,
    dispose() {
      subs.clear();
      detach();
      attached = false;
    },
  };
}
