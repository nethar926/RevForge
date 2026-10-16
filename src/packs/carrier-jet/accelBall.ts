/**
 * ACCEL BALL from GPS (framework; pure). The Tesla has no accelerometer, so (as the launch detector does):
 *  - longitudinal = change of the smoothed GPS speed (coords.speed) per second,
 *  - lateral      = speed × heading change per second (rad/s) — the centripetal term.
 * Fixes come ~1 Hz, so the raw values are smoothed per fix and the drawn ball eases toward them between fixes.
 * No fix for STALE_MS, or slower than MOVING_MS: no motion → the ball parks centred and dimmed (like the stale COMPASS).
 * Units: g (9.81 m/s²); lateral + = right turn (heading increasing).
 */
export const G = 9.81;
export const ACCEL_STALE_MS = 3000;
export const ACCEL_MOVING_MS = 1;
/** Per-fix smoothing (0..1 weight of the new sample). */
export const ACCEL_SMOOTH = 0.5;
/** Display ease time constant (s) toward the latest estimate. */
export const ACCEL_EASE_S = 0.6;
/** Full-scale lateral g for the ball travel (±1 at the tube ends). */
export const ACCEL_FULL_G = 0.5;

export interface AccelFix { speed: number | null; heading: number | null; timestamp: number }
export interface AccelState {
  last: AccelFix | null;
  /** Smoothed speed (m/s). */
  v: number | null;
  lon: number;
  lat: number;
}
export const ACCEL_INIT: AccelState = { last: null, v: null, lon: 0, lat: 0 };

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Feed one GPS fix. */
export function accelStep(st: AccelState, fix: AccelFix): AccelState {
  const sp = typeof fix.speed === 'number' && Number.isFinite(fix.speed) ? Math.max(0, fix.speed) : null;
  if (sp === null) return { ...st, last: fix };
  const v = st.v === null ? sp : st.v + (sp - st.v) * ACCEL_SMOOTH;
  const prev = st.last;
  if (!prev || st.v === null) return { last: fix, v, lon: 0, lat: 0 };
  const dt = (fix.timestamp - prev.timestamp) / 1000;
  if (!(dt > 0.05) || dt > 5) return { last: fix, v, lon: 0, lat: 0 };
  const lonRaw = (v - st.v) / dt / G;
  let latRaw = 0;
  if (typeof fix.heading === 'number' && typeof prev.heading === 'number' && Number.isFinite(fix.heading) && Number.isFinite(prev.heading)) {
    const rate = (wrap(fix.heading - prev.heading) * Math.PI) / 180 / dt;
    latRaw = (v * rate) / G;
  }
  return {
    last: fix,
    v,
    lon: st.lon + (lonRaw - st.lon) * ACCEL_SMOOTH,
    lat: st.lat + (latRaw - st.lat) * ACCEL_SMOOTH,
  };
}

/** Moving with a fresh fix? (else the ball parks centred + dimmed) */
export function accelLive(st: AccelState, now: number): boolean {
  return !!st.last && st.v !== null && st.v >= ACCEL_MOVING_MS && now - st.last.timestamp <= ACCEL_STALE_MS && now >= st.last.timestamp - ACCEL_STALE_MS;
}

/** Ball target: x −1..1 (lateral), plus the values for VoiceOver. Parked → centred. */
export function accelTarget(st: AccelState, now: number): { x: number; lat: number; lon: number; live: boolean } {
  const live = accelLive(st, now);
  if (!live) return { x: 0, lat: 0, lon: 0, live: false };
  const x = Math.max(-1, Math.min(1, st.lat / ACCEL_FULL_G));
  return { x, lat: st.lat, lon: st.lon, live: true };
}

/** One display ease step (dt s); Reduce Motion snaps. */
export function accelEase(cur: number, target: number, dt: number, snap = false): number {
  if (snap || !(dt > 0)) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / ACCEL_EASE_S));
}

/** VoiceOver text. */
export function accelText(t: { lat: number; lon: number; live: boolean }): string {
  if (!t.live) return 'Accel ball, no motion';
  const side = Math.abs(t.lat) < 0.02 ? 'centred' : `${Math.abs(t.lat).toFixed(2)} g ${t.lat > 0 ? 'right' : 'left'}`;
  const lon = Math.abs(t.lon) < 0.02 ? 'steady' : `${Math.abs(t.lon).toFixed(2)} g ${t.lon > 0 ? 'accelerating' : 'braking'}`;
  return `Accel ball, ${side}, ${lon}`;
}
