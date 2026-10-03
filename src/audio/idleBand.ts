/**
 * Drive Dynamics idle band — consumed by EngineSynth from localStorage
 * (see docs/visual-dynamics-prefs.md). Frontend may also call setIdleBand().
 */
import { storageKey } from '../lib/storageKey';

export interface IdleBand {
  rpmMin: number;
  rpmMax: number;
}

export const DEFAULT_IDLE_RPM_MIN = 700;
export const DEFAULT_IDLE_RPM_MAX = 900;

const MIRROR_MIN = storageKey('revforge.dynamics.idleRpmMin');
const MIRROR_MAX = storageKey('revforge.dynamics.idleRpmMax');
const UI_BLOB = storageKey('drivesynth.ui.v1');

/** Re-read localStorage at most this often (setDriving is high-rate). */
export const IDLE_PREF_REFRESH_MS = 400;

export function clampIdleBand(rpmMin: number, rpmMax: number): IdleBand {
  let min = Number.isFinite(rpmMin) ? rpmMin : DEFAULT_IDLE_RPM_MIN;
  let max = Number.isFinite(rpmMax) ? rpmMax : DEFAULT_IDLE_RPM_MAX;
  min = Math.min(2000, Math.max(400, min));
  max = Math.min(2500, Math.max(400, max));
  if (max < min) max = min;
  return { rpmMin: min, rpmMax: max };
}

export const DEFAULT_IDLE_BAND: IdleBand = clampIdleBand(
  DEFAULT_IDLE_RPM_MIN,
  DEFAULT_IDLE_RPM_MAX,
);

/** Crankshaft Hz approx — docs: idleHz ≈ idleRpm / 60. */
export function idleRpmToHz(rpm: number): number {
  return rpm / 60;
}

/**
 * ICE 4-stroke aggregate firing fundamental from engine RPM.
 * fund ≈ N·rpm/120 → matches EngineSynthImpl worklet rpm back-calc.
 */
export function iceFiringHzFromRpm(engineRpm: number, cylinders: number): number {
  const cyl = Math.max(4, Number.isFinite(cylinders) ? cylinders : 8);
  return (engineRpm * cyl) / 120;
}

function readNumber(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * SSR / no-window → defaults. Prefers dedicated mirrors; falls back to ui blob.
 */
export function readIdleBandFromStorage(): IdleBand {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_IDLE_BAND };

    let min = readNumber(localStorage.getItem(MIRROR_MIN));
    let max = readNumber(localStorage.getItem(MIRROR_MAX));

    if (min === undefined || max === undefined) {
      const blob = localStorage.getItem(UI_BLOB);
      if (blob) {
        try {
          const parsed = JSON.parse(blob) as { idleRpmMin?: unknown; idleRpmMax?: unknown };
          if (min === undefined) min = readNumber(String(parsed.idleRpmMin ?? ''));
          if (max === undefined) max = readNumber(String(parsed.idleRpmMax ?? ''));
        } catch {
          /* ignore bad blob */
        }
      }
    }

    return clampIdleBand(
      min ?? DEFAULT_IDLE_RPM_MIN,
      max ?? DEFAULT_IDLE_RPM_MAX,
    );
  } catch {
    return { ...DEFAULT_IDLE_BAND };
  }
}

/**
 * How strongly we are in the "true idle" region (speed≈0, throttle low).
 * 1 = fully idle, 0 = driving.
 */
export function idleGate(speed: number, throttle: number, rpmNorm: number): number {
  const s = Math.max(0, speed) / 0.06;
  const t = Math.max(0, throttle) / 0.2;
  const r = Math.max(0, rpmNorm) / 0.12;
  return Math.min(1, Math.max(0, 1 - Math.max(s, t, r)));
}

/**
 * Living jitter 0..1 from random-walk pitch (~±0.05) — fills toward idleRpmMax.
 */
export function idleJitter01(livePitch: number): number {
  return Math.min(1, Math.max(0, 0.5 + livePitch * 12));
}
