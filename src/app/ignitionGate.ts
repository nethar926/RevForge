/**
 * IGNITION splash gate (pure, node-testable). Wilson (Oct 16): the splash is hidden by default. UiPrefs
 * `showIgnitionOnLaunch` (Customize › "Ignition screen on launch"; default false, also for saved prefs without the key)
 * decides only whether Drive starts behind the splash; the splash itself is unchanged.
 * With it off, the first tap / key anywhere unlocks audio (the same AudioContext resume the IGNITION CTA does, without
 * starting the engine); a tap on a start control still starts in that same gesture.
 */
export const SHOW_IGNITION_DEFAULT = false;
/** Saved value → pref: only an explicit `true` shows the splash. */
export const parseShowIgnition = (v: unknown): boolean => v === true;
/** Drive starts past the splash (ignited) unless the pref asks for the splash. */
export const launchIgnited = (showIgnitionOnLaunch: boolean): boolean => !showIgnitionOnLaunch;

const EVENTS = ['pointerdown', 'keydown'] as const;
/**
 * One-time capture-phase pointerdown / keydown on `root` → `unlock()`. Listeners go once an unlock succeeds (resolves
 * truthy); a failed or refused unlock keeps listening for the next gesture. Returns a disposer.
 */
export function installFirstGestureUnlock(root: EventTarget, unlock: () => Promise<boolean> | boolean): () => void {
  let done = false;
  let busy = false;
  const off = () => {
    for (const t of EVENTS) root.removeEventListener(t, on, true);
  };
  function on() {
    if (done || busy) return;
    busy = true;
    let r: Promise<boolean> | boolean;
    try {
      r = unlock(); // called synchronously inside the gesture (user activation)
    } catch {
      busy = false;
      return;
    }
    void Promise.resolve(r).then(
      (ok) => {
        busy = false;
        if (ok && !done) {
          done = true;
          off();
        }
      },
      () => {
        busy = false;
      },
    );
  }
  for (const t of EVENTS) root.addEventListener(t, on, true);
  return () => {
    done = true;
    off();
  };
}
