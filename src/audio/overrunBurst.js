// Overrun pop gate — shared by every ICE engine (Night Pursuit, Chrono Coupe, generic packs).
// Plain JS so EngineSynthImpl (browser) and the offline renderers / QA (node) run the SAME logic.
//
// Exhaust pops / crackle are a lift-off event, not a coasting state. The gate opens ONLY on a
// genuine throttle lift-off from high rpm:
//   * the driver was pulling (throttle peak-hold ≥ LIFT_THR_MIN within the last ~0.8 s),
//   * the throttle closed quickly (now < 0.1 and ≥ 0.25 below that peak),
//   * rpm at the lift is at least liftMinRpm() (≈ 2.8k+, scaled to the engine's range),
//   * the gate has been re-armed by pulling again since the previous burst.
// The burst then decays with time (0.8 s hold, then τ ≈ 1.4 s; tapered hard end at BURST_MAX_S = 3.2 s) AND with rpm (falls to 0
// by popFloorRpm()), so it is bounded and dies away naturally as the revs drop. Back on the
// throttle ends it at once. Steady cruise, GPS speed noise, low-rpm coasting and idle can never
// open it. Frontend's `overrun` flag (decel & load < 0.15) is deliberately NOT a trigger: with GPS
// speed noise it flickers at steady speed, which is what produced pops at cruise.

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));

/** The driver must have been at least this far into the throttle for a lift to count. */
export const LIFT_THR_MIN = 0.3;
/** Throttle below this = closed (lift complete). */
export const LIFT_THR_CLOSED = 0.1;
/** Minimum drop from the recent peak (fast lift, not a gentle ease-off). */
export const LIFT_DROP_MIN = 0.25;
/** Throttle peak-hold decay (s): a lift slower than ~1 s never qualifies. */
export const LIFT_PEAK_TC = 0.8;
/** Burst time constant (s) and hard maximum (s). */
export const BURST_TC_S = 1.4;
/** Full-strength hold right after the lift (s) before the time decay starts. */
export const BURST_HOLD_S = 0.8;
export const BURST_MAX_S = 3.2;

export function liftMinRpm(idleRpm, redlineRpm) {
  const idle = Number.isFinite(idleRpm) ? idleRpm : 800;
  const red = Number.isFinite(redlineRpm) ? redlineRpm : 6000;
  return Math.max(2800, idle + 0.4 * (red - idle));
}

export function popFloorRpm(idleRpm) {
  const idle = Number.isFinite(idleRpm) ? idleRpm : 800;
  return Math.max(1150, idle * 1.6);
}

export function createOverrunBurstState() {
  return { thrPeak: 0, armed: false, age: BURST_MAX_S, liftRpm: 0, amp: 0, env: 0, bursts: 0 };
}

/**
 * Advance the gate one control step. input = { throttle 0..1, rpm }, dt seconds,
 * opts = { idleRpm, redlineRpm }. Returns the burst envelope 0..1 (0 = no pops).
 */
export function stepOverrunBurst(state, input, dt, opts = {}) {
  const s = state;
  const h = clip(Number(dt), 0, 0.25);
  const thr = clip(Number(input?.throttle));
  const rpm = Number.isFinite(Number(input?.rpm)) ? Number(input.rpm) : 0;
  const idle = Number(opts.idleRpm);
  const red = Number(opts.redlineRpm);
  const minRpm = liftMinRpm(idle, red);
  const floor = popFloorRpm(idle);

  s.thrPeak = Math.max(thr, s.thrPeak * Math.exp(-h / LIFT_PEAK_TC));
  if (thr >= LIFT_THR_MIN) s.armed = true;

  const active = s.age < BURST_MAX_S;
  if (
    !active &&
    s.armed &&
    thr < LIFT_THR_CLOSED &&
    s.thrPeak >= LIFT_THR_MIN &&
    s.thrPeak - thr >= LIFT_DROP_MIN &&
    rpm >= minRpm
  ) {
    s.age = 0;
    s.liftRpm = rpm;
    s.amp = clip(0.6 + 0.4 * ((rpm - minRpm) / Math.max(1, (Number.isFinite(red) ? red : 6000) - minRpm)));
    s.armed = false;
    s.bursts += 1;
  }

  let target = 0;
  if (s.age < BURST_MAX_S) {
    if (thr > 0.2) {
      s.age = BURST_MAX_S; // back on the throttle: burst over
    } else {
      const rpmK = clip((rpm - floor) / Math.max(1, s.liftRpm - floor));
      const timeK = s.age < BURST_HOLD_S ? 1 : Math.exp(-(s.age - BURST_HOLD_S) / BURST_TC_S);
      // taper the last 0.4 s to zero so the hard end is never a step
      const endK = clip((BURST_MAX_S - s.age) / 0.4);
      target = s.amp * Math.pow(rpmK, 0.2) * timeK * endK;
      s.age += h;
    }
  }
  // quick but click-free attack, slightly slower release
  s.env = lag(s.env, target, h, target > s.env ? 0.03 : 0.06);
  if (s.env < 1e-4 && target === 0) s.env = 0;
  return s.env;
}

/** Worklet `crackle` amount: pack crackle only while a lift-off burst is open. */
export function gatedCrackle(baseCrackle, burstEnv) {
  return clip(Number(baseCrackle)) * clip(Number(burstEnv) * 2.5);
}
