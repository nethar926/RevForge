/** Ion Twin rpmNorm lock ladder (~4% hysteresis, smoothed input, minimum dwell). */

import type { LockStage } from './types';

export type { LockStage };

/** Falling exit = enter − LOCK_HYSTERESIS (0.46 / 0.66 / 0.82). */
export const LOCK_HYSTERESIS = 0.04;
/** Every stage holds at least this long (s) before it may change again (≈ at most 1 change / s). */
export const LOCK_MIN_HOLD_S = 1.0;
/** KILL holds at least this long (s) once entered. */
export const LOCK_KILL_HOLD_S = 1.5;
/** One-pole time constant (s) of the drive value the ladder reads (rejects rev / sim jitter). */
export const LOCK_INPUT_TAU_S = 0.25;
/** Throttle at or below this counts as a full release (step-down skips the below-for-dwell wait). */
export const LOCK_RELEASE_THROTTLE = 0.02;
/** Below this speed (0..1) the ladder reads parked Rev throttle directly (fades out by this speed). */
export const LOCK_PARKED_SPEED = 0.04;

const STAGE_ORDER: LockStage[] = ['none', 'identified', 'lock', 'kill'];

/** Rising enter thresholds (rpmNorm). Falling exits at enter − hysteresis. */
const ENTER: Record<Exclude<LockStage, 'none'>, number> = {
  identified: 0.5,
  lock: 0.7,
  kill: 0.86,
};

function stageIndex(stage: LockStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * Next lock stage from rpmNorm with hysteresis so edges don’t flicker.
 * Rising: enter at 0.50 / 0.70 / 0.86 (none→identified→lock→kill).
 * Falling: leave at enter − h (default h≈0.04 → 0.46 / 0.66 / 0.82).
 */
export function nextLockStage(
  rpmNorm: number,
  prev: LockStage,
  hysteresis = LOCK_HYSTERESIS,
): LockStage {
  const r = Math.max(0, Math.min(1, Number.isFinite(rpmNorm) ? rpmNorm : 0));
  const h = Math.max(0, hysteresis);
  let idx = stageIndex(prev);
  if (idx < 0) idx = 0;

  while (idx < STAGE_ORDER.length - 1) {
    const next = STAGE_ORDER[idx + 1] as Exclude<LockStage, 'none'>;
    if (r >= ENTER[next]) idx += 1;
    else break;
  }

  while (idx > 0) {
    const cur = STAGE_ORDER[idx] as Exclude<LockStage, 'none'>;
    if (r < ENTER[cur] - h) idx -= 1;
    else break;
  }

  return STAGE_ORDER[idx]!;
}

/** Minimum dwell (s) of a stage before it may change: KILL 1.5 s, every other stage 1.0 s. */
export function lockDwellSeconds(stage: LockStage): number {
  return stage === 'kill' ? LOCK_KILL_HOLD_S : LOCK_MIN_HOLD_S;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * Raw (unsmoothed) lock drive value 0..1.
 * - Frontend rpmNorm when supplied (Forge sim / GPS+Rev).
 * - Otherwise the engine's own rpmNorm fallback, raised toward the Rev throttle while parked
 *   (speed < LOCK_PARKED_SPEED, linear fade) — the parked 0.55·throttle fallback is an acoustic
 *   pitch scale and would cap the ladder at 'identified'; parked Rev intent is the throttle itself
 *   (same value Forge's neutral sim sends as rpmNorm).
 */
export function lockDriveRaw(input: {
  speed: number;
  throttle: number;
  rpmNorm?: number;
  /** Engine rpmNorm used when no Frontend rpmNorm was supplied. */
  fallbackRpmNorm: number;
}): number {
  if (input.rpmNorm !== undefined && Number.isFinite(input.rpmNorm)) return clamp01(input.rpmNorm);
  const parkedW = clamp01(1 - clamp01(input.speed) / LOCK_PARKED_SPEED);
  return clamp01(Math.max(clamp01(input.fallbackRpmNorm), clamp01(input.throttle) * parkedW));
}

/**
 * Stateful Ion Twin lock ladder: one-pole smoothed drive value + hysteresis + minimum dwell.
 * - Escalation: one stage per step, as soon as the smoothed value crosses the next enter threshold
 *   and LOCK_MIN_HOLD_S has passed since the last change.
 * - Step-down: only after the smoothed value stayed below the current stage's exit (enter − h)
 *   continuously for the stage's dwell (1.0 s; KILL 1.5 s) AND the stage has held that long.
 *   A full release (throttle ≤ LOCK_RELEASE_THROTTLE) skips the below-for-dwell wait (target from
 *   min(smoothed, raw)), but still respects the hold. Step-down goes straight to the hysteresis
 *   target in one transition.
 * Pure: no timers, no storage; time only advances through step(dt).
 */
export class LockLadder {
  private stageValue: LockStage = 'none';
  private x = 0;
  private clock = 0;
  private lastChange = -Infinity;
  private belowSince: number | null = null;

  get stage(): LockStage {
    return this.stageValue;
  }

  /** Smoothed drive value 0..1 the stage logic reads (always finite). */
  get input(): number {
    return this.x;
  }

  reset(): void {
    this.stageValue = 'none';
    this.x = 0;
    this.clock = 0;
    this.lastChange = -Infinity;
    this.belowSince = null;
  }

  /** Advance by dtS seconds with raw drive value `raw`; returns the (possibly new) stage. */
  step(raw: number, dtS: number, opts: { released?: boolean } = {}): LockStage {
    const dt = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
    const r = clamp01(raw);
    if (dt > 0) {
      this.clock += dt;
      this.x += (r - this.x) * (1 - Math.exp(-dt / LOCK_INPUT_TAU_S));
    }
    this.x = clamp01(this.x);
    const cur = this.stageValue;
    const ci = stageIndex(cur);
    const t = this.clock;
    const held = t - this.lastChange;
    const eps = 1e-9;

    const below = ci > 0 && this.x < ENTER[cur as Exclude<LockStage, 'none'>] - LOCK_HYSTERESIS;
    if (!below) this.belowSince = null;
    else if (this.belowSince === null) this.belowSince = t;

    // Full release: resolve the step-down target from min(smoothed, raw) so a parked release
    // drops kill → none in ONE transition instead of trailing the smoothing tail stage by stage.
    const released = !!opts.released;
    const target = nextLockStage(this.x, cur, LOCK_HYSTERESIS);
    const releaseTarget = released ? nextLockStage(Math.min(this.x, r), cur, LOCK_HYSTERESIS) : target;
    const ti = stageIndex(target);
    if (ti > ci) {
      if (held + eps >= LOCK_MIN_HOLD_S) this.change(STAGE_ORDER[ci + 1]!);
    } else if (released && stageIndex(releaseTarget) < ci) {
      if (held + eps >= lockDwellSeconds(cur)) this.change(releaseTarget);
    } else if (ti < ci) {
      const dwell = lockDwellSeconds(cur);
      const belowLongEnough = this.belowSince !== null && t - this.belowSince + eps >= dwell;
      if (held + eps >= dwell && belowLongEnough) this.change(target);
    }
    return this.stageValue;
  }

  private change(next: LockStage): void {
    this.stageValue = next;
    this.lastChange = this.clock;
    this.belowSince = null;
  }
}

/** True for packs that use the Ion Twin lock ladder (scifi / ion-twin). */
export function packSupportsLockLadder(
  kind: string,
  topology?: string,
  id?: string,
): boolean {
  if (kind === 'scifi') return true;
  if (topology === 'ion-twin' || topology === 'tie-fighter') return true;
  if (id === 'ion-twin' || id === 'tie-fighter') return true;
  return false;
}
