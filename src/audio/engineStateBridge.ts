/**
 * Audio Physics — thin ICE EngineState smooth → worklet bridge (§1 / §2).
 * firingMask: uint8; bit i SET → cylinder/slot i disabled. Default 0 = all fire.
 * Worklet owns sample-accurate crank schedule; bridge is HUD/QA + param push helper.
 *
 * Canonical schedules: product-research/ice-pack-firing-schedules-v1.md
 * (exclude sakura-gtr). Family 4 = rotary chamber-pulse (docs/rotary-chamber-pulse-v1.md).
 */
import type { EngineStateSnapshot } from './types';

export type FiringFamilyName =
  | 'crossPlane'
  | 'flatPlane'
  | 'i6'
  | 'i6Even'
  | 'evenI4'
  | 'even'
  | 'rotary'
  | 'auto';

export interface EngineStatePackHints {
  packId?: string;
  cylinders?: number;
  firingFamily?: number | FiringFamilyName;
  firingMask?: number;
  dropCyl?: number;
  misfireAmount?: number;
  /** Physics fraction 0…0.03 (living-drive). */
  pulseJitter?: number;
  tauMan?: number;
  tauExhaust?: number;
  mufflerClosed?: number;
  mufflerOpen?: number;
  collectorDelayMs?: number;
  bankOffsetDeg?: number;
  chambersPerRotor?: number;
  rotors?: number;
}

export interface EngineStateRawInput {
  speed?: number;
  throttle: number;
  load?: number;
  rpmHint?: number;
}

export interface WorkletParamPush {
  rpm: number;
  throttle: number;
  load: number;
  firingMask: number;
  misfire: number;
  firingFamily: number;
  cylinders: number;
  pulseJitter: number;
  mufflerMixHint: number;
  intakeScaleHint: number;
  growlScaleHint: number;
  manifoldNorm: number;
  exhaustOpenness: number;
  collectorDelayMs: number;
  chambersPerRotor: number;
  rotors: number;
}

/** Pack physics constants from ice-pack-firing-schedules-v1.md (sakura excluded). */
export interface IcePackSchedule {
  cylinders: number;
  firingFamily: number;
  bankSchedule: string;
  eventAnglesDeg: number[];
  bankOffsetDeg: number;
  collectorDelayMs: number;
  tauManifold: number;
  tauExhaust: number;
  /** Preferred living-drive jitter fraction 0.005…0.03. */
  pulseJitterFrac: number;
  misfireDefault: number;
  /** Rotary only: chambers per rotor (default 3). */
  chambersPerRotor?: number;
  /** Rotary only: 1 or 2 rotors. */
  rotors?: number;
}

const CROSS_BANK_A = [0, 180, 270, 450] as const;
const FLAT_V8 = [0, 90, 180, 270, 360, 450, 540, 630] as const;
const EVEN_I4 = [0, 180, 360, 540] as const;
const I6_EVEN = [0, 120, 240, 360, 480, 600] as const;
/** Twin-rotor 3-chamber eccentric: rotor-B offset half chamber → 60° stack. */
const ROTARY_TWIN = [0, 60, 120, 180, 240, 300] as const;
/** Single-rotor 3-chamber eccentric. */
const ROTARY_SINGLE = [0, 120, 240] as const;

export const ICE_PACK_SCHEDULES: Record<string, IcePackSchedule> = {
  'v8-rumble': {
    cylinders: 8,
    firingFamily: 1,
    bankSchedule: 'crossPlaneV8',
    eventAnglesDeg: [...CROSS_BANK_A],
    bankOffsetDeg: 90,
    collectorDelayMs: 1.8,
    tauManifold: 0.12,
    tauExhaust: 0.22,
    pulseJitterFrac: 0.02,
    misfireDefault: 0.05,
  },
  'i4-zip': {
    cylinders: 4,
    firingFamily: 3,
    bankSchedule: 'evenI4',
    eventAnglesDeg: [...EVEN_I4],
    bankOffsetDeg: 0,
    collectorDelayMs: 0.4,
    tauManifold: 0.07,
    tauExhaust: 0.1,
    pulseJitterFrac: 0.008,
    misfireDefault: 0.01,
  },
  'i6-silk': {
    cylinders: 6,
    firingFamily: 3,
    bankSchedule: 'i6Even',
    eventAnglesDeg: [...I6_EVEN],
    bankOffsetDeg: 0,
    collectorDelayMs: 0.5,
    tauManifold: 0.09,
    tauExhaust: 0.14,
    pulseJitterFrac: 0.007,
    misfireDefault: 0,
  },
  'road-66': {
    cylinders: 8,
    firingFamily: 1,
    bankSchedule: 'crossPlaneV8',
    eventAnglesDeg: [...CROSS_BANK_A],
    bankOffsetDeg: 90,
    collectorDelayMs: 2.0,
    tauManifold: 0.14,
    tauExhaust: 0.26,
    pulseJitterFrac: 0.022,
    misfireDefault: 0.06,
  },
  'apex-v8': {
    cylinders: 8,
    firingFamily: 2,
    bankSchedule: 'flatPlaneV8',
    eventAnglesDeg: [...FLAT_V8],
    bankOffsetDeg: 90,
    collectorDelayMs: 0.7,
    tauManifold: 0.08,
    tauExhaust: 0.12,
    pulseJitterFrac: 0.01,
    misfireDefault: 0.02,
  },
  'neon-drive': {
    cylinders: 8,
    firingFamily: 2,
    bankSchedule: 'flatPlaneV8',
    eventAnglesDeg: [...FLAT_V8],
    bankOffsetDeg: 90,
    collectorDelayMs: 0.5,
    tauManifold: 0.06,
    tauExhaust: 0.09,
    pulseJitterFrac: 0.009,
    misfireDefault: 0.015,
  },
  italia: {
    cylinders: 8,
    firingFamily: 2,
    bankSchedule: 'flatPlaneV8',
    eventAnglesDeg: [...FLAT_V8],
    bankOffsetDeg: 90,
    collectorDelayMs: 0.8,
    tauManifold: 0.08,
    tauExhaust: 0.13,
    pulseJitterFrac: 0.011,
    misfireDefault: 0.02,
  },
  miami: {
    cylinders: 8,
    firingFamily: 1,
    bankSchedule: 'crossPlaneV8',
    eventAnglesDeg: [...CROSS_BANK_A],
    bankOffsetDeg: 90,
    collectorDelayMs: 2.4,
    tauManifold: 0.15,
    tauExhaust: 0.28,
    pulseJitterFrac: 0.024,
    misfireDefault: 0.07,
  },
  autobahn: {
    cylinders: 8,
    firingFamily: 2,
    bankSchedule: 'flatPlaneV8',
    eventAnglesDeg: [...FLAT_V8],
    bankOffsetDeg: 90,
    collectorDelayMs: 0.9,
    tauManifold: 0.09,
    tauExhaust: 0.15,
    pulseJitterFrac: 0.01,
    misfireDefault: 0.02,
  },
  'dune-runner': {
    cylinders: 8,
    firingFamily: 1,
    bankSchedule: 'crossPlaneV8',
    eventAnglesDeg: [...CROSS_BANK_A],
    bankOffsetDeg: 90,
    collectorDelayMs: 2.2,
    tauManifold: 0.16,
    tauExhaust: 0.32,
    pulseJitterFrac: 0.023,
    misfireDefault: 0.055,
  },
  alpine: {
    cylinders: 6,
    firingFamily: 3,
    bankSchedule: 'i6Even',
    eventAnglesDeg: [...I6_EVEN],
    bankOffsetDeg: 0,
    collectorDelayMs: 0.55,
    tauManifold: 0.08,
    tauExhaust: 0.12,
    pulseJitterFrac: 0.007,
    misfireDefault: 0.01,
  },
  // Night Pursuit: deep 5.0-class cross-plane V8, long dual-collector burble
  'night-pursuit': {
    cylinders: 8,
    firingFamily: 1,
    bankSchedule: 'crossPlaneV8',
    eventAnglesDeg: [...CROSS_BANK_A],
    bankOffsetDeg: 90,
    collectorDelayMs: 2.5,
    tauManifold: 0.15,
    tauExhaust: 0.3,
    pulseJitterFrac: 0.022,
    misfireDefault: 0.035,
  },
  'rotary-hum': {
    cylinders: 6,
    firingFamily: 4,
    bankSchedule: 'rotaryTwin',
    eventAnglesDeg: [...ROTARY_TWIN],
    bankOffsetDeg: 60,
    collectorDelayMs: 0.7,
    tauManifold: 0.08,
    tauExhaust: 0.13,
    pulseJitterFrac: 0.012,
    misfireDefault: 0.02,
    chambersPerRotor: 3,
    rotors: 2,
  },
};

const FAMILY_NUM: Record<string, number> = {
  auto: 0,
  crossPlane: 1,
  flatPlane: 2,
  i6: 3,
  i6Even: 3,
  evenI4: 3,
  even: 3,
  rotary: 4,
};

/** Physics jitter fraction (0…0.03) → worklet AudioParam (0…0.5). */
export function physicsJitterToWorklet(frac: number): number {
  return Math.min(0.5, Math.max(0, frac) * (0.5 / 0.03));
}

/** Worklet AudioParam (0…0.5) → physics fraction (0…0.03). */
export function workletJitterToPhysics(w: number): number {
  return Math.min(0.03, Math.max(0, w) * (0.03 / 0.5));
}

/**
 * Map revforge JSON firing → worklet firingFamily int.
 * crossplane→1 · V8 even→2 flatPlane · I6 smooth / i4→3
 */
export function mapRevforgeFiringToFamily(
  firing: string | undefined,
  cylinders: number,
): number {
  const f = (firing ?? '').toLowerCase();
  if (f === 'crossplane') return 1;
  if (f === 'even' && cylinders >= 8) return 2;
  if (f === 'smooth' || f === 'even' || cylinders === 6 || cylinders === 4) return 3;
  return cylinders === 8 ? 1 : 3;
}

export function resolveIcePackSchedule(
  packId: string | undefined,
): IcePackSchedule | undefined {
  if (!packId) return undefined;
  const raw = packId.startsWith('revforge-') ? packId.slice('revforge-'.length) : packId;
  if (raw === 'sakura-gtr') return undefined;
  return ICE_PACK_SCHEDULES[raw];
}

export function isSlotDisabled(mask: number, slot: number): boolean {
  if (slot < 0 || slot > 7) return false;
  return (mask & (1 << slot)) !== 0;
}

/** Bank-A dump angles for crossPlane (intervals 180/90/180/270). */
export function crossPlaneBankAAnglesDeg(): number[] {
  return [...CROSS_BANK_A];
}

/**
 * Explicit eventAnglesDeg per family (§2.2 / schedules v1).
 * crossPlane/flatPlane return the global 8-slot collector table (matches worklet);
 * bank-A potato character is in bank tags + crossPlaneBankAAnglesDeg().
 */
export function nextEventAnglesDeg(
  family: number,
  cylinders: number,
  chambersPerRotor = 3,
  rotors = 1,
): number[] {
  let fam = family | 0;
  if (fam === 0) fam = cylinders === 8 ? 1 : 3;
  if (fam === 4) return rotaryEventAnglesDeg(chambersPerRotor, rotors);
  if (fam === 1 || fam === 2) return [...FLAT_V8];
  if (cylinders === 6) return [...I6_EVEN];
  if (cylinders === 4) return [...EVEN_I4];
  const n = Math.max(3, Math.min(12, cylinders | 0));
  return Array.from({ length: n }, (_, i) => (i / n) * 720);
}

/** Eccentric-shaft chamber angles (360° cycle). 2-rotor stacks with half-step offset. */
export function rotaryEventAnglesDeg(chambersPerRotor = 3, rotors = 1): number[] {
  const chambers = Math.max(2, Math.min(4, Math.round(chambersPerRotor) || 3));
  const rot = Math.max(1, Math.min(2, Math.round(rotors) || 1));
  if (chambers === 3 && rot === 2) return [...ROTARY_TWIN];
  if (chambers === 3 && rot === 1) return [...ROTARY_SINGLE];
  const step = 360 / chambers;
  const rotorOff = rot === 2 ? step * 0.5 : 0;
  const raw: number[] = [];
  for (let r = 0; r < rot; r++) {
    for (let c = 0; c < chambers; c++) {
      let deg = c * step + r * rotorOff;
      while (deg >= 360) deg -= 360;
      raw.push(deg);
    }
  }
  return raw.sort((a, b) => a - b);
}

/** Estimate seconds to next event from crank ° and rpm (§2.1). */
export function estimateNextPulseDt(
  crankAngleDeg: number,
  nextEventDeg: number,
  rpm: number,
): number {
  const degPerSec = Math.max(200, rpm) * 6;
  let d = nextEventDeg - (crankAngleDeg % 720);
  if (d <= 0) d += 720;
  return d / degPerSec;
}

export class EngineStateBridge {
  rpm = 800;
  throttle = 0;
  load = 0;
  firingMask = 0;
  misfireAmount = 0;
  firingFamily = 0;
  cylinders = 8;
  crankAngleDeg = 0;
  manifoldNorm = 0;
  exhaustOpenness = 0.35;
  pulseJitter = 0.015;
  collectorDelayMs = 1.0;
  bankOffsetDeg = 90;
  chambersPerRotor = 3;
  rotors = 1;
  private tauMan = 0.12;
  private tauExhaust = 0.2;
  private packId: string | undefined;

  get bankSchedule(): FiringFamilyName {
    const f = this.firingFamily | 0;
    if (f === 1) return 'crossPlane';
    if (f === 2) return 'flatPlane';
    if (f === 4) return 'rotary';
    if (f === 3 && this.cylinders === 6) return 'i6Even';
    if (f === 3 && this.cylinders === 4) return 'evenI4';
    if (f === 3) return 'even';
    return 'auto';
  }

  setFiringMask(mask: number): void {
    this.firingMask = Math.max(0, Math.min(255, Math.round(mask))) & 255;
  }

  dropCylinder(slot: number): void {
    const s = Math.max(0, Math.min(7, Math.round(slot)));
    this.firingMask = (this.firingMask | (1 << s)) & 255;
  }

  /** Apply pack-id schedule defaults (sakura-gtr → no-op). */
  applyPackId(packId: string | undefined): void {
    this.packId = packId;
    const sched = resolveIcePackSchedule(packId);
    if (!sched) return;
    this.cylinders = sched.cylinders;
    this.firingFamily = sched.firingFamily;
    this.tauMan = sched.tauManifold;
    this.tauExhaust = sched.tauExhaust;
    this.collectorDelayMs = sched.collectorDelayMs;
    this.bankOffsetDeg = sched.bankOffsetDeg;
    this.pulseJitter = sched.pulseJitterFrac;
    this.misfireAmount = sched.misfireDefault;
    if (sched.chambersPerRotor != null) this.chambersPerRotor = sched.chambersPerRotor;
    if (sched.rotors != null) this.rotors = sched.rotors;
  }

  tick(dt: number, raw: EngineStateRawInput, hints: EngineStatePackHints = {}): void {
    const d = Math.max(0.001, Math.min(0.25, dt));

    if (hints.packId != null && hints.packId !== this.packId) {
      this.applyPackId(hints.packId);
    }

    if (hints.cylinders != null) this.cylinders = hints.cylinders;
    if (hints.firingFamily != null) {
      const f = hints.firingFamily;
      this.firingFamily = typeof f === 'string' ? (FAMILY_NUM[f] ?? 0) : f;
    }
    if (hints.firingMask != null) this.setFiringMask(hints.firingMask);
    if (hints.dropCyl != null) this.dropCylinder(hints.dropCyl);
    if (hints.misfireAmount != null) {
      this.misfireAmount = Math.max(0, Math.min(1, hints.misfireAmount));
    }
    if (hints.pulseJitter != null) {
      this.pulseJitter = Math.max(0, Math.min(0.03, hints.pulseJitter));
    }
    if (hints.tauMan != null) this.tauMan = hints.tauMan;
    if (hints.tauExhaust != null) this.tauExhaust = hints.tauExhaust;
    if (hints.collectorDelayMs != null) this.collectorDelayMs = hints.collectorDelayMs;
    if (hints.bankOffsetDeg != null) this.bankOffsetDeg = hints.bankOffsetDeg;
    if (hints.chambersPerRotor != null) {
      this.chambersPerRotor = Math.max(2, Math.min(4, Math.round(hints.chambersPerRotor)));
    }
    if (hints.rotors != null) {
      this.rotors = Math.max(1, Math.min(2, Math.round(hints.rotors)));
    }

    const thr = Math.max(0, Math.min(1, raw.throttle));
    const load = Math.max(-1, Math.min(1, raw.load ?? 0));
    this.throttle += (thr - this.throttle) * Math.min(1, d * 12);
    this.load += (load - this.load) * Math.min(1, d * 10);
    const rpmTarget = raw.rpmHint != null ? raw.rpmHint : 800 + thr * 4000;
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, d * 8);

    const aMan = 1 - Math.exp(-d / Math.max(0.05, this.tauMan));
    this.manifoldNorm += (thr - this.manifoldNorm) * aMan;

    const muffClosed = hints.mufflerClosed ?? 0.25;
    const muffOpen = hints.mufflerOpen ?? 0.9;
    const openT = 0.35 * Math.max(0, this.load) + 0.65 * this.throttle;
    const openTarget = muffClosed + (muffOpen - muffClosed) * openT;
    const aEx = 1 - Math.exp(-d / Math.max(0.05, this.tauExhaust));
    this.exhaustOpenness += (openTarget - this.exhaustOpenness) * aEx;

    const cycle = (this.firingFamily | 0) === 4 ? 360 : 720;
    this.crankAngleDeg = (this.crankAngleDeg + this.rpm * 6 * d) % cycle;
  }

  toWorkletParams(): WorkletParamPush {
    const open = this.exhaustOpenness;
    return {
      rpm: this.rpm,
      throttle: this.throttle,
      load: this.load,
      firingMask: this.firingMask,
      misfire: this.misfireAmount,
      firingFamily: this.firingFamily,
      cylinders: this.cylinders,
      pulseJitter: physicsJitterToWorklet(this.pulseJitter),
      mufflerMixHint: 1 - open * 0.55,
      intakeScaleHint: this.manifoldNorm * (0.3 + 0.7 * this.throttle),
      growlScaleHint: 0.85 + open * 0.25,
      manifoldNorm: this.manifoldNorm,
      exhaustOpenness: this.exhaustOpenness,
      collectorDelayMs: this.collectorDelayMs,
      chambersPerRotor: this.chambersPerRotor,
      rotors: this.rotors,
    };
  }

  snapshot(): EngineStateSnapshot {
    return {
      rpm: this.rpm,
      throttle: this.throttle,
      load: this.load,
      firingMask: this.firingMask,
      misfireAmount: this.misfireAmount,
      firingFamily: this.firingFamily,
      bankSchedule: this.bankSchedule,
      cylinders: this.cylinders,
      crankAngleDeg: this.crankAngleDeg,
      manifoldNorm: this.manifoldNorm,
      exhaustOpenness: this.exhaustOpenness,
      pulseJitter: this.pulseJitter,
      chambersPerRotor: this.chambersPerRotor,
      rotors: this.rotors,
    };
  }
}
