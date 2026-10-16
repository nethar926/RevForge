/**
 * Stellar Helm light-speed readouts, from road speed only (no new sensors).
 * WARP FACTOR = mph ÷ 10 · LIGHT SPEED % = mph ÷ jump speed (placeholder 70 mph).
 */
export const LIGHT_SPEED_MPH_DEFAULT = 70;

/** Warp factor: mph ÷ 10, one decimal (from the whole mph shown), capped at 9.9. */
export function warpFactor(mph: number): string {
  const v = Number.isFinite(mph) ? Math.max(0, mph) : 0;
  return Math.min(9.9, Math.round(v) / 10).toFixed(1);
}

/** Light speed: mph ÷ jump speed, clamped 0–100, whole percent (100 only once mph ≥ jump speed). */
export function lightSpeedPct(mph: number, jumpMph: number = LIGHT_SPEED_MPH_DEFAULT): number {
  const jump = Number.isFinite(jumpMph) && jumpMph > 0 ? jumpMph : LIGHT_SPEED_MPH_DEFAULT;
  const v = Number.isFinite(mph) ? Math.max(0, mph) : 0;
  if (v >= jump) return 100;
  return Math.min(99, Math.round((v / jump) * 100));
}
