import { useCallback, useSyncExternalStore } from 'react';
import { storageKey } from '../../lib/storageKey';
import { CARRIER_JET_DEFAULT_VARIANT, CARRIER_JET_VARIANT_KEY, isCarrierJetVariant, type CarrierJetVariant } from './model';

/**
 * Carrier Jet variant preference: the same pattern as Stellar Helm's frame preference
 * (src/packs/stellar-helm.frame.ts), kept skin-local so the skin can persist on its own
 * when the host passes no `onVariantChange`.
 * Key: `revforge.pack.carrier-jet.variant` on root; `rf.preview.<slug>.revforge.pack.carrier-jet.variant`
 * on preview builds (storageKey). Fresh profile → 'swing-wing'. Same-tab changes broadcast via a
 * window event; other tabs sync through the native `storage` event.
 */
const EVT = 'revforge:carrier-jet-variant';
export const CARRIER_JET_STORAGE_KEY = storageKey(CARRIER_JET_VARIANT_KEY);
let memory: CarrierJetVariant | null = null; // storage blocked → session-only

export function readCarrierJetVariant(): CarrierJetVariant {
  try {
    const v = localStorage.getItem(CARRIER_JET_STORAGE_KEY);
    if (isCarrierJetVariant(v)) return v;
  } catch {
    /* fall through */
  }
  return memory ?? CARRIER_JET_DEFAULT_VARIANT;
}

export function writeCarrierJetVariant(v: CarrierJetVariant): void {
  memory = v;
  snapshot = v;
  try {
    localStorage.setItem(CARRIER_JET_STORAGE_KEY, v);
  } catch {
    /* session-only */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: v }));
  } catch {
    /* non-DOM */
  }
}

// Snapshot cache: the HUD re-renders on every telemetry tick; storage is read only on change.
let snapshot: CarrierJetVariant | null = null;
const getSnapshot = () => (snapshot ??= readCarrierJetVariant());

function subscribe(cb: () => void): () => void {
  const changed = () => {
    snapshot = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === CARRIER_JET_STORAGE_KEY) changed();
  };
  window.addEventListener(EVT, changed);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVT, changed);
    window.removeEventListener('storage', onStorage);
  };
}

/** Live persisted variant + setter (updates every mounted Carrier Jet HUD instantly). */
export function useCarrierJetVariant(): [CarrierJetVariant, (v: CarrierJetVariant) => void] {
  const v = useSyncExternalStore(subscribe, getSnapshot, () => CARRIER_JET_DEFAULT_VARIANT);
  const set = useCallback((next: CarrierJetVariant) => writeCarrierJetVariant(next), []);
  return [v, set];
}
