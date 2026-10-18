/**
 * Soft-cue preferences shared by every engine instance and the non-React API.
 * time-jump cue (automatic at its speed threshold): on by default, ≤ 2.0 s.
 *
 * In memory only — the audio layer never touches localStorage / sessionStorage / IndexedDB.
 * Frontend owns persistence (its storage keys are prefixed per preview slug): restore with
 * setTimeJumpCueEnabled(saved) at boot, and save from onTimeJumpCueChange.
 */
let timeJumpEnabled = true;
const listeners = new Set<(on: boolean) => void>();

export function getTimeJumpCueEnabled(): boolean {
  return timeJumpEnabled;
}

export function setTimeJumpCueEnabled(on: boolean): void {
  const next = !!on;
  if (next === timeJumpEnabled) return;
  timeJumpEnabled = next;
  for (const fn of [...listeners]) {
    try {
      fn(next);
    } catch {
      /* a broken subscriber must not break audio */
    }
  }
}

/** Notified on every change (Frontend persists here). Returns an unsubscribe function. */
export function onTimeJumpCueChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
