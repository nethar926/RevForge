import type { DrivingInput } from './types';

/** Numeric DrivingInput fields. speed / throttle are required; the rest are optional. */
const OPTIONAL_NUMERIC = ['load', 'rpm', 'rpmNorm', 'acceleration'] as const;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * setDriving entry guard: never let NaN / ±Infinity reach the drive models or an AudioParam.
 * A non-finite numeric field counts as "not supplied" for this frame:
 * - speed / throttle (required): last good value (from `prev`), else 0.
 * - load / rpm / rpmNorm / acceleration: last good value when the previous frame had one (a
 *   glitch frame holds, so stages / pitch don't jump), else omitted → the engine's own fallback.
 * An explicitly omitted (undefined / null) optional field stays omitted. Booleans are coerced only
 * when present. `prev` is the previous return value; the result never contains a non-finite number.
 */
export function sanitizeDrivingInput(d: DrivingInput | null | undefined, prev?: DrivingInput): DrivingInput {
  const src = (d ?? {}) as Partial<DrivingInput>;
  const out: DrivingInput = {
    speed: finite(src.speed) ? src.speed : finite(prev?.speed) ? prev.speed : 0,
    throttle: finite(src.throttle) ? src.throttle : finite(prev?.throttle) ? prev.throttle : 0,
  };
  for (const k of OPTIONAL_NUMERIC) {
    const v = src[k];
    if (v === undefined || v === null) continue;
    if (finite(v)) out[k] = v;
    else if (finite(prev?.[k])) out[k] = prev[k];
  }
  if (src.reverse !== undefined) out.reverse = !!src.reverse;
  if (src.shifting !== undefined) out.shifting = !!src.shifting;
  if (src.overrun !== undefined) out.overrun = !!src.overrun;
  return out;
}
