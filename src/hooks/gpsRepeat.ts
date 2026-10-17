/**
 * Repeated-fix gate for watchPosition: a callback whose position.timestamp equals the last accepted one is the same
 * fix delivered again (getCurrentPosition + the watch's first callback, cached maximumAge replays) and is dropped.
 * Everything else passes unchanged; no time window (the audio already folds fixes < 0.3 s apart).
 */
export function createRepeatGate() {
  let last: number | null = null;
  return {
    /** true = new fix, pass it on; false = same timestamp as the last accepted fix, drop it. */
    accept(ts: number): boolean {
      if (last !== null && ts === last) return false;
      last = ts;
      return true;
    },
    reset(): void {
      last = null;
    },
  };
}
