/**
 * Geolocation start sequence (pure; no React). Used by useGeolocation.
 *
 * Tesla browser: a watchPosition opened without a prior getCurrentPosition can be denied silently,
 * so ask once first, then open the continuous watch. The watch must ALWAYS open, as it did before
 * the pre-ask existed (ee00dd1):
 *  - getCurrentPosition success → fix handled, watch opens;
 *  - ANY getCurrentPosition error (incl. PERMISSION_DENIED) → error reported, watch opens anyway
 *    (if the watch also denies, its own error reports 'denied' as before);
 *  - no callback within GCP_FALLBACK_MS → watch opens;
 *  - getCurrentPosition throws → watch opens (no page error).
 * openWatch is idempotent: exactly one watchPosition per start, even if a late callback arrives
 * after the fallback fired. cancel() clears the timer and the watch and ignores later callbacks.
 */
export const GCP_FALLBACK_MS = 3000;

export interface GeoLike {
  getCurrentPosition(ok: PositionCallback, err?: PositionErrorCallback | null, options?: PositionOptions): void;
  watchPosition(ok: PositionCallback, err?: PositionErrorCallback | null, options?: PositionOptions): number;
  clearWatch(id: number): void;
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function startGeolocation(
  geo: GeoLike,
  onFix: PositionCallback,
  onError: PositionErrorCallback,
  options: PositionOptions,
  timers: Timers = defaultTimers,
  fallbackMs: number = GCP_FALLBACK_MS,
): { cancel: () => void } {
  let cancelled = false;
  let watchId: number | null = null;
  let watching = false;
  let timer: unknown = null;
  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const openWatch = () => {
    clearTimer();
    if (watching || cancelled) return;
    watching = true;
    watchId = geo.watchPosition(
      (pos) => {
        if (!cancelled) onFix(pos);
      },
      (err) => {
        if (!cancelled) onError(err);
      },
      options,
    );
  };
  timer = timers.setTimeout(() => {
    timer = null;
    openWatch();
  }, fallbackMs);
  try {
    geo.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        onFix(pos);
        openWatch();
      },
      (err) => {
        if (cancelled) return;
        onError(err);
        openWatch();
      },
      options,
    );
  } catch {
    openWatch();
  }
  return {
    cancel: () => {
      cancelled = true;
      clearTimer();
      if (watchId !== null) geo.clearWatch(watchId);
      watchId = null;
    },
  };
}
