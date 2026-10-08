/**
 * Carrier Jet skin model: pure data + maths shared by the HUD, the preview harness and the
 * node tests (no React, no DOM). Tune the wing-sweep schedule with the constants below.
 */

/** Variant ids (internal, persisted) in tab order. */
export type CarrierJetVariant = 'carrier-jet' | 'tomcat' | 'swing-wing';

/**
 * One label per variant: the header label AND the tab label (they must match, see tests).
 * Sentence case in the DOM so screen readers say words; CSS uppercases it on screen.
 * carrier-jet = concept A (faithful cockpit), tomcat = B (modern glass), swing-wing = C (carrier-deck night).
 */
export const CARRIER_JET_VARIANTS: readonly { readonly id: CarrierJetVariant; readonly label: string; readonly concept: 'A' | 'B' | 'C' }[] = [
  { id: 'carrier-jet', label: 'Carrier Jet', concept: 'A' },
  { id: 'tomcat', label: 'Tomcat', concept: 'B' },
  { id: 'swing-wing', label: 'Swing Wing', concept: 'C' },
];
/** Fresh-profile default. */
export const CARRIER_JET_DEFAULT_VARIANT: CarrierJetVariant = 'swing-wing';
/** Small designation chip shown next to every header label. */
export const CARRIER_JET_DESIGNATION = 'F-14';
/** Pack id used for the persisted variant key (matches Frontend's catalog id). */
export const CARRIER_JET_ID = 'carrier-jet';
/** Same shape as Stellar Helm's `revforge.pack.<id>.frame`; wrapped by storageKey() at runtime. */
export const CARRIER_JET_VARIANT_KEY = `revforge.pack.${CARRIER_JET_ID}.variant`;

export const isCarrierJetVariant = (v: unknown): v is CarrierJetVariant => v === 'carrier-jet' || v === 'tomcat' || v === 'swing-wing';
export const variantLabel = (v: CarrierJetVariant): string => CARRIER_JET_VARIANTS.find((o) => o.id === v)?.label ?? '';

// ---------------------------------------------------------------- wing sweep schedule
/** Wings fully forward (deg) at and below SWEEP_KNEE_MPH. */
export const SWEEP_MIN_DEG = 20;
/** Wings fully aft (deg) at and above SWEEP_FULL_MPH. */
export const SWEEP_MAX_DEG = 68;
/** Parked / deck position (deg), OVER window lit. */
export const SWEEP_DECK_DEG = 75;
/** Speed where the schedule starts to sweep (mph). */
export const SWEEP_KNEE_MPH = 25;
/** Speed where the schedule reaches SWEEP_MAX_DEG (mph). */
export const SWEEP_FULL_MPH = 90;
/** Max drawn wing rate (deg/s). */
export const SWEEP_RATE_DEG_S = 7.5;
/** Tape range (deg). */
export const SWEEP_TAPE_LO = 15;
export const SWEEP_TAPE_HI = 80;
/** Parked = speed below this (mph) ... */
export const PARK_SPEED_MPH = 0.5;
/** ... held for this long (ms). */
export const PARK_HOLD_MS = 2000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const toMph = (speed: number, unit: 'mph' | 'kph' = 'mph') => (unit === 'kph' ? speed / 1.609344 : speed);

/**
 * Commanded sweep (deg) from car speed in mph.
 * t = clamp((mph − 25) / 65, 0, 1); CMD = 20 + 48 · (1 − cos(πt)) / 2; parked → 75.
 */
export function scheduledSweep(mph: number, parked = false): number {
  if (parked) return SWEEP_DECK_DEG;
  const t = clamp(((finite(mph) ? mph : 0) - SWEEP_KNEE_MPH) / (SWEEP_FULL_MPH - SWEEP_KNEE_MPH), 0, 1);
  return SWEEP_MIN_DEG + ((SWEEP_MAX_DEG - SWEEP_MIN_DEG) * (1 - Math.cos(Math.PI * t))) / 2;
}

/** One rate-limited step of the drawn sweep toward CMD (dt in seconds). `snap` = Reduce Motion / motion off. */
export function stepSweep(actual: number, cmd: number, dt: number, snap = false): number {
  if (snap || !finite(actual)) return cmd;
  const max = SWEEP_RATE_DEG_S * clamp(finite(dt) ? dt : 0, 0, 0.25);
  return actual + clamp(cmd - actual, -max, max);
}

/** 'AUTO' while scheduled, 'OVER' when parked on deck. */
export type SweepMode = 'AUTO' | 'OVER';

// ---------------------------------------------------------------- afterburner zone
/**
 * AB zone 0..5 straight from Audio's `abZone` (getAfterburnerZone / onAfterburnerZoneChange): rounded and
 * clamped, used in the same render, no smoothing. The skin has no AB thresholds of its own (Audio decides
 * when the burner engages, e.g. by speed); no Audio zone → 0 (AB OFF).
 */
export function resolveAbZone(abZone: number | undefined): number {
  return finite(abZone) ? clamp(Math.round(abZone), 0, 5) : 0;
}

// ---------------------------------------------------------------- Mach readout
/** Display Mach band (the old gear slot): M 1.00 at 75 mph (where Audio engages the burner), M 2.30 cap at 120 mph. */
export const MACH_ONE_MPH = 75;
export const MACH_CAP_MPH = 120;
export const MACH_MAX = 2.3;
/** Piecewise linear: 0..75 mph → M = mph / 75; 75..120 mph → M 1.00..2.30; clamped at 2.30 (and at 0). Number only; the SUPERSONIC tag follows abZone. */
export function mphToMach(mph: number): number {
  const v = finite(mph) ? Math.max(0, mph) : 0;
  if (v <= MACH_ONE_MPH) return v / MACH_ONE_MPH;
  return Math.min(MACH_MAX, 1 + ((v - MACH_ONE_MPH) / (MACH_CAP_MPH - MACH_ONE_MPH)) * (MACH_MAX - 1));
}
/** Readout text, two decimals: `M 0.85`. */
export const machText = (mach: number) => `M ${mach.toFixed(2)}`;
/** Screen-reader label: `Mach 0.85`, plus `, supersonic` while the afterburner zone is on. */
export const machLabel = (mach: number, supersonic: boolean) => `Mach ${mach.toFixed(2)}${supersonic ? ', supersonic' : ''}`;

/** Secondary cues (decorative, aria-hidden). AoA 0..30 = load × 30; on-speed 15. */
export const aoaUnits = (load: number) => Math.round(clamp(finite(load) ? load : 0, 0, 1) * 300) / 10;
export type IndexerState = 'off' | 'high' | 'on' | 'low';
export const indexerState = (aoa: number, active: boolean): IndexerState => (!active ? 'off' : aoa > 17 ? 'high' : aoa >= 13 ? 'on' : 'low');

/** The single drive-window status pill (AB zone survives as text). */
export function statusText(parked: boolean, ab: number): string {
  if (parked) return `ON DECK · WINGS ${SWEEP_DECK_DEG}°`;
  return `AB ${ab > 0 ? ab : 'OFF'} · SWEEP AUTO`;
}

/** Spoken value for the sweep meter. */
export const sweepValueText = (deg: number, mode: SweepMode) =>
  `Wing sweep ${Math.round(deg)} degrees, ${mode === 'OVER' ? 'over-swept deck position' : 'auto schedule'}`;
export const speedValueText = (speed: number, unit: 'mph' | 'kph') =>
  `${Math.round(speed)} ${unit === 'kph' ? 'kilometres per hour' : 'miles per hour'}`;

/** Accel ball cell 0..4 (top = accelerating) + word, from longitudinal accel (m/s²-ish units). */
export const accelCell = (accel: number) => (accel > 1 ? 1 : accel < -1 ? 3 : 2);
export const accelWord = (accel: number, parked: boolean) => (parked ? 'STBY' : accel > 1 ? 'ACCEL' : accel < -1 ? 'DECEL' : 'STEADY');

/** Demo/preview presets (also used by tests): parked, cruise 45 mph, high 90 mph AB 4. */
export const CARRIER_JET_DEMO_STATES = {
  parked: { speed: 0, rpm: 780, gear: 0, load: 0, throttle: 0, abZone: 0 },
  cruise: { speed: 45, rpm: 2150, gear: 4, load: 0.34, throttle: 0.34, abZone: 0 },
  high: { speed: 90, rpm: 5650, gear: 6, load: 0.9, throttle: 0.9, abZone: 4 },
} as const;
export type CarrierJetDemoState = keyof typeof CARRIER_JET_DEMO_STATES;
