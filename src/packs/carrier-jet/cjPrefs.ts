/**
 * Carrier Jet CONFIG settings that have no home in the app yet (framework; pure store, persisted under storageKey).
 * The engine gets each change as a guarded 'jet-prefs' pack engine command (audioBridge: e.setX?.() — the base
 * engine has none of these methods yet, so today they are stored-only; Dan's audio wires them).
 *  - calloutMode voice | tone | off (default voice; VOICE falls back to speechSynthesis TTS where recorded voice
 *    is missing — the fallback is the engine's, kept)
 *  - highSpeedCallouts (default OFF; shown with the "Obey speed limits" note)
 *  - abUnarmedCall silent | tone | voice (default SILENT)
 *  - switchSound (default on)
 *  - startMode apu | gndAir (default apu; Park only; same key the cold-start branch uses)
 *  - motion auto | reduced | full (Reduce Motion override; AUTO follows the system)
 *  - distUnit mi | km, tempUnit f | c, pressUnit psi | bar (TLM › UNITS; FLAGGED: no readout uses them yet)
 */
import { storageKey } from '../../lib/storageKey.ts';
import type { KV } from '../abArmed.ts';

export interface CjPrefs {
  calloutMode: 'voice' | 'tone' | 'off';
  highSpeedCallouts: boolean;
  abUnarmedCall: 'silent' | 'tone' | 'voice';
  switchSound: boolean;
  startMode: 'apu' | 'gndAir';
  motion: 'auto' | 'reduced' | 'full';
  distUnit: 'mi' | 'km';
  tempUnit: 'f' | 'c';
  pressUnit: 'psi' | 'bar';
}
export const CJ_PREFS_DEFAULT: Readonly<CjPrefs> = Object.freeze({
  calloutMode: 'voice', highSpeedCallouts: false, abUnarmedCall: 'silent', switchSound: true, startMode: 'apu', motion: 'auto', distUnit: 'mi', tempUnit: 'f', pressUnit: 'psi',
});
export const CJ_PREFS_KEY = 'revforge.pack.carrier-jet.config';
/** Shared with frontend/cj-cold-start's prefs.ts. */
export const START_MODE_KEY = 'revforge.pack.carrier-jet.startMode';

const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
export function parseCjPrefs(raw: string | null, startRaw: string | null = null): CjPrefs {
  let o: Partial<CjPrefs> = {};
  try {
    o = raw ? (JSON.parse(raw) as Partial<CjPrefs>) : {};
  } catch {
    o = {};
  }
  const d = CJ_PREFS_DEFAULT;
  return {
    calloutMode: pick(o.calloutMode, ['voice', 'tone', 'off'] as const, d.calloutMode),
    highSpeedCallouts: o.highSpeedCallouts === true,
    abUnarmedCall: pick(o.abUnarmedCall, ['silent', 'tone', 'voice'] as const, d.abUnarmedCall),
    switchSound: o.switchSound !== false,
    startMode: startRaw === 'gndAir' ? 'gndAir' : 'apu',
    motion: pick(o.motion, ['auto', 'reduced', 'full'] as const, d.motion),
    distUnit: pick(o.distUnit, ['mi', 'km'] as const, d.distUnit),
    tempUnit: pick(o.tempUnit, ['f', 'c'] as const, d.tempUnit),
    pressUnit: pick(o.pressUnit, ['psi', 'bar'] as const, d.pressUnit),
  };
}

/** Effective Reduce Motion: the override wins, else the system setting. */
export const reducedMotion = (p: CjPrefs, system: boolean) => (p.motion === 'auto' ? system : p.motion === 'reduced');

const local = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const read = (kv: KV | null, k: string) => {
  try {
    return kv?.getItem(storageKey(k)) ?? null;
  } catch {
    return null;
  }
};
let cur: CjPrefs | null = null;
const subs = new Set<() => void>();
export const getCjPrefs = (): CjPrefs => (cur ??= parseCjPrefs(read(local(), CJ_PREFS_KEY), read(local(), START_MODE_KEY)));
export const subscribeCjPrefs = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
export function setCjPrefs(partial: Partial<CjPrefs>, kv: KV | null = local()): CjPrefs {
  const next = { ...getCjPrefs(), ...partial };
  cur = next;
  try {
    const { startMode, ...rest } = next;
    kv?.setItem(storageKey(CJ_PREFS_KEY), JSON.stringify(rest));
    kv?.setItem(storageKey(START_MODE_KEY), startMode);
  } catch {
    /* session only */
  }
  for (const f of [...subs]) f();
  return next;
}
export const resetCjPrefsCache = () => {
  cur = null;
};
