/**
 * EMER STOP PULL gesture (pure; the mount feeds it pointer events from the grip, see ColdStart.tsx).
 * Fires only after a deliberate PULL_FIRE_PX pull down / outward (away from the panel = down the screen), with the
 * pointer captured on the grip; releasing (or cancelling) short of it springs back. Taps and clicks never fire —
 * there is no click path at all. The only non-pull path is the VoiceOver custom action (csPullAction).
 * Detent tick at PULL_DETENT_PX (once per pull).
 */
export const PULL_FIRE_PX = 40;
export const PULL_DETENT_PX = 20;

export type PullPhase = 'rest' | 'pulling' | 'fired';
export interface PullState {
  phase: PullPhase;
  /** 0..1 of PULL_FIRE_PX. */
  progress: number;
  pointerId: number | null;
  startY: number;
  detent: boolean;
}
export const PULL_REST: PullState = { phase: 'rest', progress: 0, pointerId: null, startY: 0, detent: false };

export type PullEffect = 'capture' | 'release' | 'detent' | 'fire';
export interface PullResult { state: PullState; effects: PullEffect[] }

const same = (state: PullState): PullResult => ({ state, effects: [] });

/** Primary pointer down on the grip. */
export function pullDown(st: PullState, pointerId: number, y: number, primary = true): PullResult {
  if (st.phase === 'fired' || st.pointerId !== null || !primary) return same(st);
  return { state: { phase: 'pulling', progress: 0, pointerId, startY: y, detent: false }, effects: ['capture'] };
}

/** Pointer move (captured). Only downward travel counts; fires at PULL_FIRE_PX. */
export function pullMove(st: PullState, pointerId: number, y: number): PullResult {
  if (st.phase !== 'pulling' || st.pointerId !== pointerId) return same(st);
  const travel = Math.max(0, y - st.startY);
  if (travel >= PULL_FIRE_PX) return { state: { ...PULL_REST, phase: 'fired', progress: 1 }, effects: ['fire', 'release'] };
  const effects: PullEffect[] = [];
  let detent = st.detent;
  if (!detent && travel >= PULL_DETENT_PX) {
    detent = true;
    effects.push('detent');
  }
  return { state: { ...st, progress: travel / PULL_FIRE_PX, detent }, effects };
}

/** Pointer up / cancel / lost capture: short of the threshold → spring back, nothing fires. */
export function pullUp(st: PullState, pointerId: number, y?: number): PullResult {
  if (st.phase !== 'pulling' || st.pointerId !== pointerId) return same(st);
  if (y !== undefined && y - st.startY >= PULL_FIRE_PX) return { state: { ...PULL_REST, phase: 'fired', progress: 1 }, effects: ['fire', 'release'] };
  return { state: PULL_REST, effects: ['release'] };
}

/** VoiceOver custom action "Emergency stop" (the only non-pull path). */
export function pullAction(st: PullState): PullResult {
  if (st.phase === 'fired') return same(st);
  return { state: { ...PULL_REST, phase: 'fired', progress: 1 }, effects: ['fire'] };
}

/** Explicit RESET after a fire. */
export function pullReset(): PullState {
  return PULL_REST;
}
