/**
 * React side of the interaction mode + the shared accessibility reads every control uses.
 *  - useInteractionMode(): 'drag' | 'tap' (Prefer Taps OR not known stopped for 3 s; see interactionMode.ts)
 *  - usePreferTaps(): [on, set] for the Options setting
 *  - useReducedMotion(): the OS setting or the app's MOTION override (CONFIG › OPT › ACCESS › MOTION)
 */
import { useCallback, useSyncExternalStore } from 'react';
import { getGpsMotion, subscribeGpsMotion } from '../hooks/gpsFixes.ts';
import { getPreferTaps, setPreferTaps, subscribePreferTaps } from '../lib/preferTaps.ts';
import { getCjPrefs, reducedMotion, subscribeCjPrefs } from '../packs/carrier-jet/cjPrefs.ts';
import { createInteractionModeStore, type InteractionMode } from './interactionMode.ts';

let store: ReturnType<typeof createInteractionModeStore> | null = null;
const shared = () =>
  (store ??= createInteractionModeStore({
    getPreferTaps,
    subscribePreferTaps,
    getMotion: getGpsMotion,
    subscribeMotion: subscribeGpsMotion,
  }));
const subMode = (f: () => void) => shared().subscribe(f);
const getMode = () => shared().get();
/** Server render / first paint: tap (the safe mode). */
const serverMode = (): InteractionMode => 'tap';

/** 'drag' only when Prefer Taps is off AND GPS has read 0 mph for 3 s; 'tap' otherwise. */
export function useInteractionMode(): InteractionMode {
  return useSyncExternalStore(subMode, getMode, serverMode);
}

export function usePreferTaps(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribePreferTaps, getPreferTaps, () => false);
  const set = useCallback((v: boolean) => void setPreferTaps(v), []);
  return [on, set];
}

const RM_QUERY = '(prefers-reduced-motion: reduce)';
const readSys = () => typeof matchMedia !== 'undefined' && matchMedia(RM_QUERY).matches;
const subSys = (f: () => void) => {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia(RM_QUERY);
  mq.addEventListener?.('change', f);
  return () => mq.removeEventListener?.('change', f);
};

/** Reduce Motion: the app's MOTION override wins (AUTO follows the system). `force` (a prop) wins over both. */
export function useReducedMotion(force?: boolean): boolean {
  const sys = useSyncExternalStore(subSys, readSys, () => false);
  const prefs = useSyncExternalStore(subscribeCjPrefs, getCjPrefs, getCjPrefs);
  return force ?? reducedMotion(prefs, sys);
}
