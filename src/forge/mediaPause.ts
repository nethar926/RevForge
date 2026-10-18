/**
 * Transient car / outside media pause mute (Bug 2, William on 0e9c3cd). A car media-session pause mutes the engine
 * output for this session only: in memory, never written to the saved UI prefs (masterMuted is the user's own Mute
 * control, the only mute that persists). Ignition and Shutdown clear it; a reload starts with it clear.
 * The output gain (App.tsx) uses effectiveMuted(prefs.masterMuted, getMediaPaused()). React-free; useMediaPaused()
 * lives in the components that need a re-render (useSyncExternalStore over subscribeMediaPaused).
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let paused = false;

export function getMediaPaused(): boolean {
  return paused;
}
export function setMediaPaused(next: boolean): void {
  if (paused === next) return;
  paused = next;
  for (const f of [...listeners]) f();
}
export function subscribeMediaPaused(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
/** Engine output muted: the user's saved Mute or a transient car-pause mute. */
export const effectiveMuted = (savedMuted: boolean, mediaPaused: boolean): boolean => savedMuted || mediaPaused;

/** The Muted key next to Shutdown: shown whenever the engine is muted for any reason. */
export function mutedKey(savedMuted: boolean, mediaPaused: boolean, running: boolean): { text: string; aria: string } | null {
  if (!effectiveMuted(savedMuted, mediaPaused)) return null;
  const why = !savedMuted && mediaPaused ? ' by car pause' : '';
  return { text: 'Muted', aria: `Engine sound muted${why}${running ? ', engine still running' : ''}. Unmute` };
}
