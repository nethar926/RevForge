import type { EngineParams, EngineSynth } from '../audio/types';
import { NIGHT_PURSUIT_ID } from './migrations';
import { getPackMode, onPackMode, onScannerPass, setPackEnvelopeSource, type PackMode, type ScannerEdge } from './runtime';

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
 * Connect the pack runtime bus to the live engine. Returns a disposer.
 * `getEngine` is read lazily so engine swaps (loadPatch) are picked up.
 */
export function connectPackAudio(getEngine: () => EngineSynth | null, engineId: string): () => void {
  const eng = () => getEngine() as PackEngine | null;
  if (engineId !== NIGHT_PURSUIT_ID) {
    setPackEnvelopeSource(null);
    return () => undefined;
  }
  applyBoost(eng(), getPackMode(NIGHT_PURSUIT_ID));
  setPackEnvelopeSource(() => {
    const e = eng();
    if (!e) return undefined;
    if (typeof e.getEnvelope === 'function') return e.getEnvelope();
    if (typeof e.getVoiceEnvelope === 'function') return e.getVoiceEnvelope();
    return undefined;
  });
  const offMode = onPackMode((id, mode) => {
    if (id === NIGHT_PURSUIT_ID) applyBoost(eng(), mode);
  });
  const offScan = onScannerPass((id, edge) => {
    if (id !== NIGHT_PURSUIT_ID) return;
    const e = eng();
    if (e && e.getDiag().running && typeof e.scannerTick === 'function') e.scannerTick(edge);
  });
  return () => {
    offMode();
    offScan();
    setPackEnvelopeSource(null);
  };
}
