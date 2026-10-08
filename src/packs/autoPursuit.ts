/**
 * Night Pursuit AUTO drive mode: a pure, clock-injectable state machine.
 *
 * AUTO rides in Cruise and engages Pursuit on sustained hard throttle, then
 * falls back to Cruise after a sustained lift. Between the two thresholds the
 * current state is held (hysteresis), so throttle hovering mid-range never
 * flickers the boost.
 *
 *   engage:    throttle ≥ 0.80 held continuously for ≥ 400 ms
 *   disengage: throttle ≤ 0.35 held continuously for ≥ 2000 ms
 *
 * Only active while the pack mode is `auto` AND the engine is running; any
 * other input (mode change, engine stop, unmount → reset()) drops straight to
 * disengaged with no pending timer.
 *
 * No React, no DOM, no audio imports: node tests drive it with a fake clock.
 */
export const AUTO_ENGAGE_THROTTLE = 0.8;
export const AUTO_ENGAGE_HOLD_MS = 400;
export const AUTO_DISENGAGE_THROTTLE = 0.35;
export const AUTO_DISENGAGE_HOLD_MS = 2000;

export interface AutoPursuitState {
  engaged: boolean;
  /** Clock time the pending transition's condition first held, or null when none is pending. */
  since: number | null;
}

export interface AutoPursuitInput {
  /** Mode is `auto` and the engine is running. */
  active: boolean;
  /** Driver throttle 0..1 (non-finite reads as 0). */
  throttle: number;
  /** Clock time in ms. */
  now: number;
}

export const AUTO_PURSUIT_IDLE: AutoPursuitState = Object.freeze({ engaged: false, since: null });

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * One step. Throttle is treated as held at its sampled value until the next
 * sample, so callers must also step at `deadline()` when inputs are quiet.
 */
export function stepAutoPursuit(state: AutoPursuitState, input: AutoPursuitInput): AutoPursuitState {
  if (!input.active) return AUTO_PURSUIT_IDLE;
  const thr = clamp01(input.throttle);
  const toward = state.engaged ? thr <= AUTO_DISENGAGE_THROTTLE : thr >= AUTO_ENGAGE_THROTTLE;
  if (!toward) return state.since === null ? state : { engaged: state.engaged, since: null };
  const since = state.since ?? input.now;
  const hold = state.engaged ? AUTO_DISENGAGE_HOLD_MS : AUTO_ENGAGE_HOLD_MS;
  if (input.now - since >= hold) return { engaged: !state.engaged, since: null };
  return state.since === since ? state : { engaged: state.engaged, since };
}

/** Clock time at which the pending transition completes, or null when none is pending. */
export function autoPursuitDeadline(state: AutoPursuitState): number | null {
  if (state.since === null) return null;
  return state.since + (state.engaged ? AUTO_DISENGAGE_HOLD_MS : AUTO_ENGAGE_HOLD_MS);
}

export type Clock = () => number;
const defaultClock: Clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface AutoPursuit {
  /** Feed the latest inputs; returns the engaged state after this sample. */
  sample(active: boolean, throttle: number): boolean;
  /** ms until the pending transition is due (≥ 0), or null when nothing is pending. */
  msUntilDue(): number | null;
  readonly engaged: boolean;
  /** Back to disengaged, nothing pending (mode left auto / engine stop / unmount). */
  reset(): void;
}

/** Stateful wrapper around stepAutoPursuit with an injectable clock. */
export function createAutoPursuit(clock: Clock = defaultClock): AutoPursuit {
  let state: AutoPursuitState = AUTO_PURSUIT_IDLE;
  return {
    sample(active, throttle) {
      state = stepAutoPursuit(state, { active, throttle, now: clock() });
      return state.engaged;
    },
    msUntilDue() {
      const due = autoPursuitDeadline(state);
      return due === null ? null : Math.max(0, due - clock());
    },
    get engaged() {
      return state.engaged;
    },
    reset() {
      state = AUTO_PURSUIT_IDLE;
    },
  };
}
