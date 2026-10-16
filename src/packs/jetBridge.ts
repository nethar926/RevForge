/**
 * Carrier Jet cold-start bridge (framework): audioBridge registers the live engine's cold-start API (Dan's
 * setJetSystem / getJetSystems / onJetSystemChange / jetEmergencyStop / setJetSwitchSound / playJetCue …) when the
 * engine has it; the CJ mount reads it with useSyncExternalStore(subscribePackJet, getPackJet). null = no engine yet
 * (before IGNITION) or an engine without cold start — the host then shows no cold-start controls.
 */
import type { JetChecklist, JetCue, JetStartMode, JetSwitchFoley, JetSystem, JetSystemChange, JetSystemEntry, JetSystemsState, JetVariant } from '../audio/types.ts';

export interface PackJetApi {
  setJetColdStart(enabled: boolean): void;
  getJetColdStart(): boolean;
  setJetStartMode(mode: JetStartMode): void;
  setJetSystem(system: JetSystem, on: boolean, opts?: { foley?: JetSwitchFoley | false }): boolean;
  getJetSystems(): JetSystemsState;
  onJetSystemChange(cb: (state: JetSystemsState, change: JetSystemChange) => void): () => void;
  jetEmergencyStop(): boolean;
  setJetSwitchSound(enabled: boolean): void;
  playJetCue(cue: JetCue, opts?: { pan?: number; level?: number }): boolean;
  /* optional (feature-detected per call): Dan's panel list / checklist / quick start; add-ons stay guarded */
  getJetSystemList?(variant?: JetVariant): JetSystemEntry[];
  getJetChecklist?(variant?: JetVariant): JetChecklist;
  jetQuickStart?(): boolean;
  getJetStartMode?(): JetStartMode;
  /* Dan's carrier-launch detector (fd583b2): AUTO LAUNCH (CONFIG › SND) and the AB launch light */
  setAutoLaunch?(enabled: boolean): void;
  getAutoLaunch?(): boolean;
  getLaunchActive?(): boolean;
}

const NEEDED = ['setJetColdStart', 'getJetColdStart', 'setJetStartMode', 'setJetSystem', 'getJetSystems', 'onJetSystemChange', 'jetEmergencyStop', 'setJetSwitchSound', 'playJetCue'] as const;

/** The engine as a PackJetApi when it has every method (feature-detected), else null. */
export function asPackJet(engine: unknown): PackJetApi | null {
  if (!engine || typeof engine !== 'object') return null;
  const e = engine as Record<string, unknown>;
  return NEEDED.every((k) => typeof e[k] === 'function') ? (engine as PackJetApi) : null;
}

let api: PackJetApi | null = null;
const listeners = new Set<() => void>();
export function setPackJetSource(next: PackJetApi | null): void {
  if (next === api) return;
  api = next;
  for (const l of [...listeners]) l();
}
export function getPackJet(): PackJetApi | null {
  return api;
}
export function subscribePackJet(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
