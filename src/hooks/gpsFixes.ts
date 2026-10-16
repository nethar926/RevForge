/**
 * Raw GPS fix feed (framework). useGeolocation — the app's ONE geolocation watch — publishes every
 * position it receives here, so consumers that need more than speed (e.g. the Carrier Jet heading,
 * packs/heading.ts) read the same fixes instead of opening a second watchPosition.
 * Pure module (no React / DOM), safe to import from node tests.
 */
export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  /** coords.heading in degrees from true north; null / NaN when unknown or stopped. */
  heading: number | null;
  /** coords.speed in m/s; null when unknown. */
  speed: number | null;
  /** Fix time (ms), wall-corrected by useGeolocation when the device clock is skewed. */
  timestamp: number;
}

type Listener = (fix: GpsFix) => void;
const listeners = new Set<Listener>();
let latest: GpsFix | null = null;

export function publishGpsFix(fix: GpsFix): void {
  latest = fix;
  for (const l of [...listeners]) {
    try {
      l(fix);
    } catch {
      /* a consumer must never break the GPS feed */
    }
  }
}

/** Subscribe to fixes; returns the unsubscribe function. */
export function subscribeGpsFixes(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Most recent fix published this session (null before the first). */
export function latestGpsFix(): GpsFix | null {
  return latest;
}

/*
 * GPS status feed (framework): useGeolocation publishes its status here so pack HUDs (the Carrier Jet GPS plate)
 * read the same state as the Drive screen's input check without a second watch. 'idle' until the watch runs.
 */
type StatusListener = () => void;
const statusListeners = new Set<StatusListener>();
let status = 'idle';
export function publishGpsStatus(next: string): void {
  if (next === status) return;
  status = next;
  for (const l of [...statusListeners]) l();
}
export function getGpsStatus(): string {
  return status;
}
export function subscribeGpsStatus(l: StatusListener): () => void {
  statusListeners.add(l);
  return () => {
    statusListeners.delete(l);
  };
}
