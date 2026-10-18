/**
 * Edge-key rail slots (framework; pure). A rail is one strip of keys under a cell, centred on it; narrow cells get
 * fewer keys, never 0. Carrier Jet's geometry.keyCount / keyXs are these with its 52×66 BezelKey frame.
 */
import type { Rect, RailSpec } from './contract.ts';

/** Keys that fit a cell's width (1..max). */
export function railCount(width: number, key: RailSpec['key'], max = 4): number {
  return Math.max(1, Math.min(max, Math.floor((width + key.gap) / (key.w + key.gap))));
}
/** Left x of each key, centred under the cell (whole px). */
export function railXs(cell: Rect, n: number, key: RailSpec['key']): number[] {
  const total = n * key.w + (n - 1) * key.gap;
  const x0 = cell.left + (cell.width - total) / 2;
  return Array.from({ length: n }, (_, i) => Math.round(x0 + i * (key.w + key.gap)));
}
/** Top of the rail: `gap` under the cell's bottom edge. */
export const railTop = (cell: Rect, gap: number): number => cell.top + cell.height + gap;
/** Every key box of a rail (for checks and layout tests). */
export function railSlots(cell: Rect, n: number, key: RailSpec['key'], gap: number): Rect[] {
  const top = railTop(cell, gap);
  return railXs(cell, n, key).map((left) => ({ left, top, width: key.w, height: key.h }));
}
