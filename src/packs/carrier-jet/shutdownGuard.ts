/**
 * Guarded SHUTDOWN wiring (pure; Frontend, on Meghan's ShutdownGuard 4207fad). The cover is mount UI state, closed on
 * load, never persisted. Lift → Dan's 'guardOpen' cue, close → 'guardClose' (same path as the cold-start guards and the
 * QUICK START cover: playJetCue, only with SW SND on). The lever with the cover up = the existing Shutdown
 * (requestPackShell 'shutdown'); after any shutdown the cover drops again with 'guardClose'. The part shows only
 * while the engine runs (CJ v2, Tesla board / window); otherwise the host chip (Ignition / Resume) is the start path.
 */
export type GuardCue = 'guardOpen' | 'guardClose';
export interface ShutdownGuardDeps {
  cue(c: GuardCue): void;
  /** The existing Shutdown (requestPackShell({ type: 'shutdown' })). */
  shutdown(): void;
}
/** Cover tap: cue, return the new cover state. */
export function sdCoverTap(open: boolean, d: ShutdownGuardDeps): boolean {
  d.cue(open ? 'guardClose' : 'guardOpen');
  return !open;
}
/** Lever tap: only with the cover up and the engine running → shutdown, cover closes with 'guardClose'. */
export function sdLever(open: boolean, running: boolean, d: ShutdownGuardDeps): { open: boolean; shut: boolean } {
  if (!open || !running) return { open, shut: false };
  d.shutdown();
  d.cue('guardClose');
  return { open: false, shut: true };
}
/** Engine stopped some other way (EMER STOP, host) while the cover was up → drop it with 'guardClose'. */
export function sdEngineStopped(open: boolean, running: boolean, d: ShutdownGuardDeps): boolean {
  if (open && !running) {
    d.cue('guardClose');
    return false;
  }
  return open;
}
/** Where the part replaces the host Shutdown chip. */
export const sdShown = (s: { v2: boolean; tesla: boolean; docked: boolean; running: boolean }) => s.v2 && s.tesla && s.docked && s.running;
/** Dan's cue through the jet bridge, as the cold-start guards do (SW SND off → silent; engine not ready → ignored). */
export function playGuardCue(api: { playJetCue?(c: string): unknown } | null | undefined, switchSound: boolean, c: GuardCue): void {
  if (!switchSound) return;
  try {
    api?.playJetCue?.(c);
  } catch {
    /* engine not ready */
  }
}
