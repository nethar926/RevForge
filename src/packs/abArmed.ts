/**
 * Carrier Jet afterburner ARM switch state (framework). Audio's Tomcat engine (a599712) starts armed
 * and stores nothing; Frontend persists the switch under storageKey(AB_ARMED_KEY) and pushes it to
 * the engine over the pack runtime bus (sendPackEngineCommand → audioBridge →
 * engine.setAfterburnerArmed). No saved value → the engine is never called (default armed).
 */
import { storageKey } from '../lib/storageKey.ts';

export const AB_ARMED_KEY = 'revforge.pack.carrier-jet.abArmed';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
const local = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Saved choice, or null when the user never touched ARM. */
export function readAbArmed(kv: KV | null = local()): boolean | null {
  try {
    const v = kv?.getItem(storageKey(AB_ARMED_KEY));
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function writeAbArmed(armed: boolean, kv: KV | null = local()): void {
  try {
    kv?.setItem(storageKey(AB_ARMED_KEY), String(armed));
  } catch {
    /* session only */
  }
}

/** Engine side: apply the saved choice if there is one; never calls when none. Returns whether it called. */
export function applySavedAbArmed(engine: { setAfterburnerArmed?(armed: boolean): void } | null | undefined, kv: KV | null = local()): boolean {
  const saved = readAbArmed(kv);
  if (saved === null || !engine || typeof engine.setAfterburnerArmed !== 'function') return false;
  engine.setAfterburnerArmed(saved);
  return true;
}

// Tiny external store so the guard re-renders when ARM flips (useSyncExternalStore).
const listeners = new Set<() => void>();
let current: boolean | null = null;
/** Displayed armed state: saved value, else the engine default (armed). */
export function getAbArmed(): boolean {
  if (current === null) current = readAbArmed() ?? true;
  return current;
}
export function subscribeAbArmed(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
/** User flipped ARM: persist + notify (the caller sends the engine command). */
export function setAbArmed(armed: boolean, kv: KV | null = local()): void {
  current = armed;
  writeAbArmed(armed, kv);
  for (const l of [...listeners]) l();
}
