import { useCallback, useSyncExternalStore } from 'react';
import { STELLAR_HELM_FRAME, STELLAR_HELM_FRAME_KEY, type StellarHelmFrame } from './stellar-helm.identity';

/**
 * Stellar Helm frame preference (pack-scoped localStorage key). Fresh profile →
 * STELLAR_HELM_FRAME ('classic'). Same-tab changes broadcast via a window event;
 * other tabs sync through the native `storage` event.
 */
const EVT = 'revforge:stellar-helm-frame';
let memory: StellarHelmFrame | null = null; // storage blocked → session-only

const isFrame = (v: unknown): v is StellarHelmFrame => v === 'classic' || v === 'helm';

export function readStellarHelmFrame(): StellarHelmFrame {
  try {
    const v = localStorage.getItem(STELLAR_HELM_FRAME_KEY);
    if (isFrame(v)) return v;
  } catch {
    /* fall through */
  }
  return memory ?? STELLAR_HELM_FRAME;
}

export function writeStellarHelmFrame(frame: StellarHelmFrame): void {
  memory = frame;
  snapshot = frame;
  try {
    localStorage.setItem(STELLAR_HELM_FRAME_KEY, frame);
  } catch {
    /* session-only */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: frame }));
  } catch {
    /* non-DOM */
  }
}

// Snapshot cache: the HUD re-renders on every telemetry tick; storage is read only on change.
let snapshot: StellarHelmFrame | null = null;
const getSnapshot = () => (snapshot ??= readStellarHelmFrame());

function subscribe(cb: () => void): () => void {
  const changed = () => {
    snapshot = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STELLAR_HELM_FRAME_KEY) changed();
  };
  window.addEventListener(EVT, changed);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVT, changed);
    window.removeEventListener('storage', onStorage);
  };
}

/** Live frame preference + setter (persists and updates every mounted HUD instantly). */
export function useStellarHelmFrame(): [StellarHelmFrame, (frame: StellarHelmFrame) => void] {
  const frame = useSyncExternalStore(subscribe, getSnapshot, () => STELLAR_HELM_FRAME);
  const set = useCallback((f: StellarHelmFrame) => writeStellarHelmFrame(f), []);
  return [frame, set];
}
