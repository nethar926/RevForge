/**
 * Chrono Coupe 88 mph time-jump light: pure edge + timeout logic (no React, no DOM),
 * shared by ThemeStage (crossing detection) and ForgePage (light timer). Unit-tested.
 */
export const TIME_JUMP_MPH = 88;
export const MPS_TO_MPH = 2.236936;

/**
 * Rising-edge detector at `threshold` mph. The first sample is only a baseline (mounting or
 * switching theme while already above 88 is not a crossing); after a rise it re-arms only once
 * the speed has dropped back below the threshold.
 */
export function createTimeJumpEdge(threshold = TIME_JUMP_MPH) {
  let above: boolean | null = null;
  return {
    step(mph: number): boolean {
      const now = Number.isFinite(mph) && mph >= threshold;
      const rose = above === false && now;
      above = now;
      return rose;
    },
    reset(): void {
      above = null;
    },
  };
}

export interface TimeJumpTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/**
 * One-shot light: trigger() turns it on for `durationMs` and returns true; while it is on,
 * trigger() is ignored (returns false). cancel() clears the timer and turns it off now
 * (unmount / theme change).
 */
export function createTimeJumpLight(onChange: (active: boolean) => void, durationMs: number, timers: TimeJumpTimers) {
  let timer: unknown = null;
  return {
    get active(): boolean {
      return timer !== null;
    },
    trigger(): boolean {
      if (timer !== null) return false;
      onChange(true);
      timer = timers.setTimeout(() => {
        timer = null;
        onChange(false);
      }, durationMs);
      return true;
    },
    cancel(): void {
      if (timer === null) return;
      timers.clearTimeout(timer);
      timer = null;
      onChange(false);
    },
  };
}
