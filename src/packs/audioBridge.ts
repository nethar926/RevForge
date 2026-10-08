import type { EngineParams, EngineSynth } from '../audio/types';
import { NIGHT_PURSUIT_ID } from './migrations';
import type { PackIdentity } from './types';
import { getPackMode, onPackEngineCommand, onPackMode, onScannerPass, setPackAbZoneSource, setPackEnvelopeSource, type PackMode, type ScannerEdge } from './runtime';

/**
 * Optional audio hooks a pack engine may expose (Audio Synth owns them).
 * Every call is guarded — the pack works on a stock synth with UI-only modes.
 */
export interface PackAudioHooks {
  /** 0..1 post-gain loudness envelope for the voice/power ladder. */
  getEnvelope?(): number;
  getVoiceEnvelope?(): number;
  /** Soft original electronic tick when the scanner eye reaches an edge. */
  scannerTick?(edge: ScannerEdge): void;
  /** Direct boost toggle if Audio prefers a method over the param. */
  setPursuitBoost?(amount: number): void;
  /** Chrono pack: 0..1 charge (speed / jump threshold). */
  setChargeLevel?(level: number): void;
  /** Chrono pack: one-shot discharge when the jump threshold is crossed / JUMP SEQUENCE armed. */
  triggerDischarge?(): void;
  /** Jet engines: current afterburner zone 0..5 (Carrier Jet HUD). */
  getAfterburnerZone?(): number;
  /** Jet engines: zone change subscription; returns an unsubscribe. */
  onAfterburnerZoneChange?(listener: () => void): (() => void) | void;
}

type PackEngine = EngineSynth & PackAudioHooks;

/** PURSUIT → full boost; POWER → partial seasoning; AUTO/NORM → stock. */
export const boostForMode = (mode: PackMode) => (mode === 'pursuit' ? 1 : mode === 'power' ? 0.5 : 0);

function applyBoost(eng: PackEngine | null, mode: PackMode) {
  if (!eng) return;
  const amount = boostForMode(mode);
  if (typeof eng.setPursuitBoost === 'function') {
    eng.setPursuitBoost(amount);
    return;
  }
  try {
    const params = eng.getParams() as EngineParams & Record<string, unknown>;
    if ('pursuitBoost' in params) eng.setParams({ pursuitBoost: amount } as Partial<EngineParams>);
  } catch {
    /* engine not ready */
  }
}

/**
 * Engine id → pack id whose envelope + mode boost are wired. Glob-registered packs
 * (src/packs/<id>.identity.ts) match on their preferred engine id string (Audio's
 * engine constant), so this compiles and no-ops whether or not Audio's engine
 * commit is merged, and adding a pack never edits this file. Shared fallback
 * presets are never boosted.
 */
const MODE_PACKS: Record<string, string> = { [NIGHT_PURSUIT_ID]: NIGHT_PURSUIT_ID };
for (const m of Object.values(import.meta.glob<{ default: PackIdentity }>('./*.identity.ts', { eager: true }))) {
  const p = m.default;
  if (p?.engine?.preferred && !(p.engine.preferred in MODE_PACKS)) MODE_PACKS[p.engine.preferred] = p.id;
}

/**
 * Connect the pack runtime bus to the live engine. Returns a disposer.
 * `getEngine` is read lazily so engine swaps (loadPatch) are picked up.
 */
export function connectPackAudio(getEngine: () => EngineSynth | null, engineId: string): () => void {
  const eng = () => getEngine() as PackEngine | null;
  // Optional pack → engine commands (any engine; no-ops when the hooks are absent).
  const offCommands = onPackEngineCommand((_packId, cmd) => {
    try {
      const e = eng();
      if (!e) return;
      if (cmd.type === 'charge') e.setChargeLevel?.(Math.max(0, Math.min(1, cmd.level)));
      else if (cmd.type === 'discharge' && e.getDiag().running) e.triggerDischarge?.();
    } catch {
      /* engine not ready */
    }
  });
  // Afterburner zone (any engine that has both methods; feature-detected, else HUDs derive it).
  const live = eng();
  if (live && typeof live.getAfterburnerZone === 'function' && typeof live.onAfterburnerZoneChange === 'function') {
    setPackAbZoneSource({ get: () => live.getAfterburnerZone?.(), subscribe: (cb) => live.onAfterburnerZoneChange?.(cb) });
  } else {
    setPackAbZoneSource(null);
  }
  const packId = MODE_PACKS[engineId];
  if (!packId) {
    setPackEnvelopeSource(null);
    return () => {
      offCommands();
      setPackAbZoneSource(null);
    };
  }
  applyBoost(eng(), getPackMode(packId));
  setPackEnvelopeSource(() => {
    const e = eng();
    if (!e) return undefined;
    if (typeof e.getEnvelope === 'function') return e.getEnvelope();
    if (typeof e.getVoiceEnvelope === 'function') return e.getVoiceEnvelope();
    return undefined;
  });
  const offMode = onPackMode((id, mode) => {
    if (id === packId) applyBoost(eng(), mode);
  });
  const offScan = onScannerPass((id, edge) => {
    if (id !== NIGHT_PURSUIT_ID) return;
    const e = eng();
    if (e && e.getDiag().running && typeof e.scannerTick === 'function') e.scannerTick(edge);
  });
  return () => {
    offCommands();
    offMode();
    offScan();
    setPackEnvelopeSource(null);
    setPackAbZoneSource(null);
  };
}
