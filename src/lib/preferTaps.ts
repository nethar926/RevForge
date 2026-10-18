/**
 * Prefer Taps (accessibility; framework store, pure, node-testable). Default OFF.
 * ON = every drag or slide control (src/controls) runs in tap mode, whatever the speed.
 * Persisted under storageKey(PREFER_TAPS_KEY) as 'true' / 'false'; one module-level value shared by every surface
 * (Tuner › Options › ACCESS and the pack CONFIG › OPT › ACCESS tile) so they never disagree.
 */
import { storageKey } from './storageKey.ts';

export const PREFER_TAPS_KEY = 'revforge.a11y.preferTaps';
export const PREFER_TAPS_DEFAULT = false;
export const PREFER_TAPS_LABEL = 'Prefer Taps';
export const PREFER_TAPS_DESCRIPTION = 'Turns every drag or slide control into taps.';

export interface PreferTapsKV { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Saved text → value. Anything but 'true' is the default (OFF). */
export const parsePreferTaps = (raw: string | null | undefined): boolean => raw === 'true';

const local = (): PreferTapsKV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

let cur: boolean | null = null;
const subs = new Set<() => void>();

export function getPreferTaps(): boolean {
  if (cur === null) {
    try {
      cur = parsePreferTaps(local()?.getItem(storageKey(PREFER_TAPS_KEY)));
    } catch {
      cur = PREFER_TAPS_DEFAULT;
    }
  }
  return cur;
}

export function subscribePreferTaps(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}

export function setPreferTaps(on: boolean, kv: PreferTapsKV | null = local()): boolean {
  const next = on === true;
  const changed = next !== getPreferTaps();
  cur = next;
  try {
    kv?.setItem(storageKey(PREFER_TAPS_KEY), String(next));
  } catch {
    /* session only */
  }
  if (changed) for (const f of [...subs]) f();
  return next;
}

/** Tests: forget the cached value (the next read goes back to storage). */
export const resetPreferTapsCache = () => {
  cur = null;
};
