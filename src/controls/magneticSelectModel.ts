/**
 * MagneticSelect logic (pure). Options sit evenly along a track (fraction 0 … 1); a drag moves the puck freely and
 * the release snaps to the nearest enabled option. Keyboard: arrows move the selection (radiogroup pattern).
 */
export { nextEnabled } from './radialMenuModel.ts';

/** Track position (0 … 1) of option i of count (a single option sits in the middle). */
export function optionFraction(i: number, count: number): number {
  if (count <= 1) return 0.5;
  return Math.min(1, Math.max(0, i / (count - 1)));
}
/** Nearest enabled option to a track fraction; ties go to the lower index. -1 when none is enabled. */
export function nearestOption(fraction: number, enabled: readonly boolean[]): number {
  const n = enabled.length;
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    if (!enabled[i]) continue;
    const d = Math.abs(optionFraction(i, n) - f);
    if (d < bestD - 1e-9) {
      best = i;
      bestD = d;
    }
  }
  return best;
}
/** Fraction of a pointer x (px) along a track starting at `left` with width `width`. */
export function trackFraction(x: number, left: number, width: number): number {
  if (!Number.isFinite(x) || !(width > 0)) return 0;
  return Math.min(1, Math.max(0, (x - left) / width));
}
