export const LIFT_THR_MIN: number;
export const LIFT_THR_CLOSED: number;
export const LIFT_DROP_MIN: number;
export const LIFT_PEAK_TC: number;
export const BURST_TC_S: number;
export const BURST_HOLD_S: number;
export const BURST_MAX_S: number;
export interface OverrunBurstState {
  thrPeak: number;
  armed: boolean;
  age: number;
  liftRpm: number;
  amp: number;
  env: number;
  bursts: number;
}
export function liftMinRpm(idleRpm: number, redlineRpm: number): number;
export function popFloorRpm(idleRpm: number): number;
export function createOverrunBurstState(): OverrunBurstState;
export function stepOverrunBurst(
  state: OverrunBurstState,
  input: { throttle: number; rpm: number },
  dt: number,
  opts?: { idleRpm?: number; redlineRpm?: number },
): number;
export function gatedCrackle(baseCrackle: number, burstEnv: number): number;
