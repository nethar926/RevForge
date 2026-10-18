/**
 * SlideConfirm logic (pure, node-testable).
 *  - drag mode: slide the thumb horizontally; releasing at ≥ SLIDE_CONFIRM_AT (85 %) of the travel confirms,
 *    anything less springs back (jumps back under Reduce Motion).
 *  - tap mode: TWO taps. The first arms (label → SLIDE_ARMED_LABEL); a second tap within ARM_TIMEOUT_MS confirms;
 *    after ARM_TIMEOUT_MS it disarms by itself. A single tap never confirms. Keyboard / VoiceOver activation uses the
 *    same two-step path in both modes.
 */
export const SLIDE_CONFIRM_AT = 0.85;
export const ARM_TIMEOUT_MS = 3000;
export const SLIDE_ARMED_LABEL = 'Tap again to confirm';

export interface ArmState { armedAt: number | null }
export const ARM_IDLE: Readonly<ArmState> = Object.freeze({ armedAt: null });

/** Armed right now (an arm older than ARM_TIMEOUT_MS has lapsed even if no timer fired yet). */
export const isArmed = (s: ArmState, now: number): boolean => s.armedAt !== null && now - s.armedAt < ARM_TIMEOUT_MS && now >= s.armedAt;

/** One tap: arms when idle (or lapsed), confirms when armed. Disabled → nothing. */
export function tapConfirm(s: ArmState, now: number, disabled = false): { state: ArmState; confirmed: boolean } {
  if (disabled) return { state: ARM_IDLE, confirmed: false };
  if (isArmed(s, now)) return { state: ARM_IDLE, confirmed: true };
  return { state: { armedAt: now }, confirmed: false };
}

/** Timer tick: disarm once the window has passed. */
export const expireArm = (s: ArmState, now: number): ArmState => (s.armedAt !== null && !isArmed(s, now) ? ARM_IDLE : s);

/** ms left before an arm lapses (0 when idle). */
export const armRemaining = (s: ArmState, now: number): number => (isArmed(s, now) ? s.armedAt! + ARM_TIMEOUT_MS - now : 0);

/** Thumb travel fraction 0..1 for a horizontal offset (px) along a track of `travel` px. */
export function slideFraction(dx: number, travel: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(travel) || travel <= 0) return 0;
  return Math.min(1, Math.max(0, dx / travel));
}

/** Release outcome. */
export const slideReleased = (fraction: number): 'confirm' | 'reset' => (fraction >= SLIDE_CONFIRM_AT ? 'confirm' : 'reset');

/** Visible / spoken label for the current state. */
export function slideLabel(o: { label: string; mode: 'drag' | 'tap'; armed: boolean; armedLabel?: string; dragHint?: string }): string {
  if (o.armed) return o.armedLabel ?? SLIDE_ARMED_LABEL;
  if (o.mode === 'drag') return o.dragHint ?? `Slide to ${o.label.toLowerCase()}`;
  return o.label;
}
