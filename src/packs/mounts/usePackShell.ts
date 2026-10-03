import { useSyncExternalStore } from 'react';
import { getPackShellState, onPackShellState, type PackShellState } from '../runtime';

const subscribe = (cb: () => void) => onPackShellState(cb);

/** Live Drive-shell state for pack HUD controls (connected / muted / engine name). */
export function usePackShell(): PackShellState {
  return useSyncExternalStore(subscribe, getPackShellState, getPackShellState);
}
