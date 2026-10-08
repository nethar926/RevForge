/**
 * Tiny pack runtime bus between the Drive shell (ForgePage owns the audio
 * engine) and pack HUDs (mounted inside ThemeStage). Keeps HUD ↔ audio wiring
 * out of ThemeStage props and away from the locked IGNITION splash markup.
 */
import { storageKey } from '../lib/storageKey';
import { NIGHT_PURSUIT_ID } from './migrations';

/** 'power' stays in the union so old saves still parse; Night Pursuit retires it (see RETIRED_MODES). */
export type PackMode = 'power' | 'auto' | 'norm' | 'pursuit';
export type ScannerEdge = 'left' | 'right';

type ModeListener = (packId: string, mode: PackMode) => void;
type ScannerListener = (packId: string, edge: ScannerEdge) => void;

const modeListeners = new Set<ModeListener>();
const scannerListeners = new Set<ScannerListener>();
const modes = new Map<string, PackMode>();
let envelopeSource: (() => number | undefined) | null = null;

const modeKey = (packId: string) => `revforge.pack.${packId}.mode`;
const isMode = (v: unknown): v is PackMode => v === 'power' || v === 'auto' || v === 'norm' || v === 'pursuit';

/**
 * Per-pack retired modes → replacement. Night Pursuit's rail is Auto / Cruise
 * (norm) / Pursuit (Wilson, Oct 8 2026): a saved or requested POWER becomes
 * Cruise. Other packs are untouched.
 */
const RETIRED_MODES: Record<string, Partial<Record<PackMode, PackMode>>> = {
  [NIGHT_PURSUIT_ID]: { power: 'norm' },
};
const liveMode = (packId: string, mode: PackMode): PackMode => RETIRED_MODES[packId]?.[mode] ?? mode;

export function getPackMode(packId: string, fallback: PackMode = 'norm'): PackMode {
  const cached = modes.get(packId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(storageKey(modeKey(packId)));
    if (isMode(raw)) {
      const mode = liveMode(packId, raw);
      modes.set(packId, mode);
      // Write the migration back so the retired value never resurfaces.
      if (mode !== raw) localStorage.setItem(storageKey(modeKey(packId)), mode);
      return mode;
    }
  } catch {
    /* session only */
  }
  return liveMode(packId, fallback);
}

export function setPackMode(packId: string, requested: PackMode): void {
  if (!isMode(requested)) return;
  const mode = liveMode(packId, requested);
  modes.set(packId, mode);
  try {
    localStorage.setItem(storageKey(modeKey(packId)), mode);
  } catch {
    /* session only */
  }
  for (const l of modeListeners) l(packId, mode);
}

export function onPackMode(listener: ModeListener): () => void {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

/* ------------------------------------------------------------------------ *
 * AUTO engage signal (Night Pursuit). The pack mount runs the auto-pursuit
 * state machine and publishes engaged/disengaged here; audioBridge listens
 * and retargets the boost. Session-only: never written to the stored mode.
 * ------------------------------------------------------------------------ */
type AutoEngagedListener = (packId: string, engaged: boolean) => void;
const autoEngagedListeners = new Set<AutoEngagedListener>();
const autoEngaged = new Map<string, boolean>();

export const getPackAutoEngaged = (packId: string): boolean => autoEngaged.get(packId) === true;

export function setPackAutoEngaged(packId: string, engaged: boolean): void {
  if (getPackAutoEngaged(packId) === engaged) return;
  if (engaged) autoEngaged.set(packId, true);
  else autoEngaged.delete(packId);
  for (const l of autoEngagedListeners) l(packId, engaged);
}

export function onPackAutoEngaged(listener: AutoEngagedListener): () => void {
  autoEngagedListeners.add(listener);
  return () => autoEngagedListeners.delete(listener);
}

export function emitScannerPass(packId: string, edge: ScannerEdge): void {
  for (const l of scannerListeners) l(packId, edge);
}

export function onScannerPass(listener: ScannerListener): () => void {
  scannerListeners.add(listener);
  return () => scannerListeners.delete(listener);
}

/** Drive shell registers an audio-envelope reader (0..1) or null when unavailable. */
export function setPackEnvelopeSource(source: (() => number | undefined) | null): void {
  envelopeSource = source;
}

/** 0..1 audio envelope, or undefined so HUDs fall back to telemetry. */
export function readPackEnvelope(): number | undefined {
  if (!envelopeSource) return undefined;
  try {
    const v = envelopeSource();
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------------ *
 * Optional engine commands from pack HUDs (Audio Synth owns the hooks).
 * audioBridge forwards them to the live engine with optional chaining, so a
 * stock engine without the hooks simply ignores them.
 * ------------------------------------------------------------------------ */
export type PackEngineCommand = { type: 'charge'; level: number } | { type: 'discharge' };
type EngineCommandListener = (packId: string, cmd: PackEngineCommand) => void;
const engineCommandListeners = new Set<EngineCommandListener>();

export function sendPackEngineCommand(packId: string, cmd: PackEngineCommand): void {
  for (const l of engineCommandListeners) l(packId, cmd);
}

export function onPackEngineCommand(listener: EngineCommandListener): () => void {
  engineCommandListeners.add(listener);
  return () => engineCommandListeners.delete(listener);
}

/* ------------------------------------------------------------------------ *
 * Drive shell bridge: lets a pack HUD reach existing Drive actions (Shutdown,
 * mute, menu panels) without new ThemeStage props. ForgePage connects a
 * handler; elsewhere (Theme Lab previews) `connected` is false and pack
 * controls render inert.
 * ------------------------------------------------------------------------ */
export type PackShellPanel = 'tuner' | 'tune' | 'scenes' | 'garage';
export type PackShellAction =
  | { type: 'shutdown' }
  | { type: 'toggle-mute' }
  | { type: 'open-panel'; panel: PackShellPanel };
export interface PackShellState {
  connected: boolean;
  muted: boolean;
  engineName: string;
}
type ShellListener = (state: PackShellState) => void;
let shellHandler: ((action: PackShellAction) => void) | null = null;
let shellState: PackShellState = { connected: false, muted: false, engineName: '' };
const shellListeners = new Set<ShellListener>();

function publishShell(next: PackShellState) {
  shellState = next;
  for (const l of shellListeners) l(shellState);
}

/** ForgePage registers the handler for pack actions. Returns a disposer. */
export function connectPackShell(handler: (action: PackShellAction) => void): () => void {
  shellHandler = handler;
  publishShell({ ...shellState, connected: true });
  return () => {
    if (shellHandler !== handler) return;
    shellHandler = null;
    publishShell({ ...shellState, connected: false });
  };
}

export function setPackShellState(partial: Partial<Omit<PackShellState, 'connected'>>): void {
  const next = { ...shellState, ...partial };
  if (next.muted === shellState.muted && next.engineName === shellState.engineName) return;
  publishShell(next);
}

export const getPackShellState = (): PackShellState => shellState;

export function onPackShellState(listener: ShellListener): () => void {
  shellListeners.add(listener);
  return () => shellListeners.delete(listener);
}

/** Returns false when no Drive shell is connected (action ignored). */
export function requestPackShell(action: PackShellAction): boolean {
  if (!shellHandler) return false;
  shellHandler(action);
  return true;
}
