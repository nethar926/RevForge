/**
 * CJ v3 heading smoothing (pure, node-testable). In the car the heading is GPS-only at ~1–1.4 Hz (compass and gyro
 * return null), so the displayed heading eases between fixes on the shortest arc (350° → 10° goes through north).
 * Exponential approach with a time constant that tracks the fix interval (clamped 400–600 ms). Reduce Motion: snap.
 * No sensor dependency: it only smooths the value packs/heading.ts already produces (stale / parked hold unchanged).
 */
export const TAU_MIN_MS = 400;
export const TAU_MAX_MS = 600;
/** Converged within this many degrees → output = target (the loop stops; a held heading never jitters). */
export const HEADING_EPS = 0.05;

export const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** Signed shortest turn from → to, in (-180, 180]. */
export function shortestDelta(from: number, to: number): number {
  const d = norm360(to - from);
  return d > 180 ? d - 360 : d;
}
/** Time constant from the last fix interval (≈ half of it), clamped to 400–600 ms. */
export const tauFor = (fixIntervalMs: number | undefined) =>
  Math.min(TAU_MAX_MS, Math.max(TAU_MIN_MS, fixIntervalMs && Number.isFinite(fixIntervalMs) ? fixIntervalMs * 0.45 : 500));

/** One frame: undefined in/out passes through; Reduce Motion or first value snaps. */
export function easeHeading(cur: number | undefined, target: number | undefined, dtMs: number, tauMs: number, reduced: boolean): number | undefined {
  if (target == null) return undefined;
  const t = norm360(target);
  if (reduced || cur == null) return t;
  const d = shortestDelta(cur, t);
  if (Math.abs(d) <= HEADING_EPS) return t;
  const k = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs));
  const next = norm360(cur + d * k);
  return Math.abs(shortestDelta(next, t)) <= HEADING_EPS ? t : next;
}
