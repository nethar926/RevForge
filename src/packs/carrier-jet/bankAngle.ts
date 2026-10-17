/**
 * VDI bank angle from GPS (framework; pure). The Tesla has no gyro, so bank is the coordinated-turn angle for the
 * turn the car is making: bank = atan(v · ω / g), with v and ω exactly as the ACCEL ball takes them (accelBall.ts:
 * smoothed GPS speed × heading change per second, lateral g = v·ω/g), so the ball and the VDI always agree:
 *   bank = atan(lateral g). No exaggeration.
 *  - Clamped to ±BANK_MAX_DEG (30°).
 *  - Below BANK_MIN_MPS (3 mph) GPS course is noise → 0. Stale / no fix (accelLive false) → 0.
 *  - Display eases toward the target (BANK_EASE_S); Reduce Motion snaps (data shown, no easing).
 * Sign: + = right bank (heading increasing), the same as the ball's lateral +.
 */
import { accelLive, type AccelState } from './accelBall.ts';

export const BANK_MAX_DEG = 30;
/** 3 mph in m/s. */
export const BANK_MIN_MPS = 3 * 0.44704;
export const BANK_EASE_S = 0.6;
/** Bank scale ticks at the top of the VDI (deg; 0 = wings level). */
export const BANK_TICKS = [-30, -20, -10, 0, 10, 20, 30] as const;

export const bankFromLateralG = (latG: number) => Math.max(-BANK_MAX_DEG, Math.min(BANK_MAX_DEG, (Math.atan(latG) * 180) / Math.PI));

/** Target bank (deg) for the current ACCEL state. */
export function bankTarget(st: AccelState, now: number): number {
  if (!accelLive(st, now) || st.v === null || st.v < BANK_MIN_MPS) return 0;
  return bankFromLateralG(st.lat);
}

/** One display step (dt s); `snap` under Reduce Motion. */
export const bankEase = (cur: number, target: number, dt: number, snap = false) => {
  const b = snap || !(dt > 0) ? target : cur + (target - cur) * (1 - Math.exp(-dt / BANK_EASE_S));
  return Math.abs(b) < 0.05 ? 0 : b;
};

/** VoiceOver: "wings level" / "bank 15 degrees right". */
export function bankText(deg: number): string {
  const d = Math.round(Math.abs(deg));
  return d === 0 ? 'wings level' : `bank ${d} degrees ${deg > 0 ? 'right' : 'left'}`;
}
