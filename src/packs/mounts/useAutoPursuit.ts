import { useEffect, useState } from 'react';
import { createAutoPursuit, type Clock } from '../autoPursuit';

/** Last throttle-driven AUTO transition (for the mount's live region), or null. */
export type AutoTransition = 'engaged' | 'disengaged' | null;

/** How long a transition stays reported before it clears (stale live-region text). */
export const AUTO_TRANSITION_CLEAR_MS = 5000;

/**
 * React wrapper around the pure auto-pursuit state machine (../autoPursuit).
 * Samples on every input change (the existing HUD publish), plus one timeout at
 * the pending deadline so a held throttle still completes its hold even if no
 * new telemetry arrives. Resets when `active` drops and on unmount.
 *
 * `transition` reports only throttle-driven changes made while active; a reset
 * (mode change / engine stop) clears it silently instead of reporting "disengaged".
 */
export function useAutoPursuit(active: boolean, throttle: number, clock?: Clock): { engaged: boolean; transition: AutoTransition } {
  const [ctl] = useState(() => createAutoPursuit(clock));
  const [engaged, setEngaged] = useState(false);
  const [transition, setTransition] = useState<AutoTransition>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      timer = undefined;
      const was = ctl.engaged;
      const now = ctl.sample(active, throttle);
      setEngaged(now);
      if (!active) setTransition(null);
      else if (now !== was) setTransition(now ? 'engaged' : 'disengaged');
      const due = ctl.msUntilDue();
      // +1 ms so the re-sample lands at/after the deadline, never just before it.
      if (due !== null) timer = setTimeout(tick, due + 1);
    };
    tick();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [ctl, active, throttle]);
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), AUTO_TRANSITION_CLEAR_MS);
    return () => clearTimeout(t);
  }, [transition]);
  useEffect(() => () => ctl.reset(), [ctl]);
  return { engaged: active && engaged, transition: active ? transition : null };
}
