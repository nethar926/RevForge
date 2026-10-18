/**
 * RangeDial logic (pure, node-testable): clamping, stepping, keyboard, rotation and tap-to-cycle stops.
 * The dial's sweep is centred on 12 o'clock: angle −sweep/2 = min, +sweep/2 = max (degrees, clockwise).
 */
export interface RangeSpec { min: number; max: number; step: number }
export const DIAL_SWEEP_DEG = 270;
/** PageUp / PageDown move this many steps. */
export const PAGE_STEPS = 10;
/** Default number of tap-to-cycle stops across the range (min … max). */
export const CYCLE_STOPS = 5;

const decimals = (n: number) => {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
/** Repair the spec: min ≤ max, step > 0 (falls back to 1). */
export function normalizeSpec(s: RangeSpec): RangeSpec {
  const min = Math.min(s.min, s.max);
  const max = Math.max(s.min, s.max);
  const step = Number.isFinite(s.step) && s.step > 0 ? s.step : 1;
  return { min, max, step };
}
export function clampValue(v: number, s: RangeSpec): number {
  const { min, max } = normalizeSpec(s);
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
/** Snap to the step grid anchored at min, then clamp; float noise trimmed to the step's decimals. */
export function snapValue(v: number, s: RangeSpec): number {
  const n = normalizeSpec(s);
  const c = clampValue(v, n);
  // the ends are always valid values, even when (max − min) is not a multiple of step
  if (c >= n.max) return n.max;
  if (c <= n.min) return n.min;
  const k = Math.round((c - n.min) / n.step);
  const d = Math.max(decimals(n.step), decimals(n.min));
  const snapped = Number((n.min + k * n.step).toFixed(d));
  // the last grid point may overshoot max when (max-min) is not a multiple of step
  return snapped > n.max ? n.max : snapped < n.min ? n.min : snapped;
}
/** ±steps from v (snapped + clamped). */
export function stepValue(v: number, dir: number, s: RangeSpec, steps = 1): number {
  const n = normalizeSpec(s);
  return snapValue(snapValue(v, n) + Math.sign(dir) * steps * n.step, n);
}
export const atMin = (v: number, s: RangeSpec) => snapValue(v, s) <= normalizeSpec(s).min;
export const atMax = (v: number, s: RangeSpec) => snapValue(v, s) >= normalizeSpec(s).max;

/** Keyboard (WAI-ARIA slider pattern). null = not a slider key. */
export function keyValue(key: string, v: number, s: RangeSpec): number | null {
  const n = normalizeSpec(s);
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return stepValue(v, 1, n);
    case 'ArrowLeft':
    case 'ArrowDown':
      return stepValue(v, -1, n);
    case 'PageUp':
      return stepValue(v, 1, n, PAGE_STEPS);
    case 'PageDown':
      return stepValue(v, -1, n, PAGE_STEPS);
    case 'Home':
      return n.min;
    case 'End':
      return snapValue(n.max, n);
    default:
      return null;
  }
}

/** Tap-to-cycle stops: `count` evenly spaced values min … max on the step grid (deduped). */
export function cycleStops(s: RangeSpec, count = CYCLE_STOPS): number[] {
  const n = normalizeSpec(s);
  const c = Math.max(2, Math.floor(count));
  const out: number[] = [];
  for (let i = 0; i < c; i++) {
    const v = snapValue(n.min + ((n.max - n.min) * i) / (c - 1), n);
    if (!out.includes(v)) out.push(v);
  }
  return out;
}
/** Next stop above v, wrapping to the first. */
export function nextStop(v: number, stops: readonly number[]): number {
  if (stops.length === 0) return v;
  const sorted = [...stops].sort((a, b) => a - b);
  return sorted.find((x) => x > v + 1e-9) ?? sorted[0];
}

/** Angle (deg, clockwise from 12 o'clock, −180..180] of a point relative to the dial centre (screen y down). */
export function pointerAngle(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}
/** Shortest signed difference b − a in degrees (−180..180]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
/** Value change for a rotation of `deg` degrees (the full range spans `sweep` degrees). */
export function rotationToDelta(deg: number, s: RangeSpec, sweep = DIAL_SWEEP_DEG): number {
  const n = normalizeSpec(s);
  return ((n.max - n.min) * deg) / sweep;
}
/** Indicator angle for a value (−sweep/2 … +sweep/2). */
export function valueToAngle(v: number, s: RangeSpec, sweep = DIAL_SWEEP_DEG): number {
  const n = normalizeSpec(s);
  const span = n.max - n.min;
  const f = span === 0 ? 0 : (clampValue(v, n) - n.min) / span;
  return -sweep / 2 + f * sweep;
}
/** 0..1 position of a value in the range. */
export function valueFraction(v: number, s: RangeSpec): number {
  const n = normalizeSpec(s);
  const span = n.max - n.min;
  return span === 0 ? 0 : (clampValue(v, n) - n.min) / span;
}
