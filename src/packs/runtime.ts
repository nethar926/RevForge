/**
 * Tiny pack runtime bus between the Drive shell (ForgePage owns the audio
 * engine) and pack HUDs (mounted inside ThemeStage). Keeps HUD ↔ audio wiring
 * out of ThemeStage props and away from the locked IGNITION splash markup.
 */
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

export function getPackMode(packId: string, fallback: PackMode = 'norm'): PackMode {
  const cached = modes.get(packId);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(modeKey(packId));
    if (isMode(raw)) {
      modes.set(packId, raw);
      return raw;
    }
  } catch {
    /* session only */
  }
  return fallback;
}

export function setPackMode(packId: string, mode: PackMode): void {
  if (!isMode(mode)) return;
  modes.set(packId, mode);
  try {
    localStorage.setItem(modeKey(packId), mode);
  } catch {
    /* session only */
  }
  for (const l of modeListeners) l(packId, mode);
}

export function onPackMode(listener: ModeListener): () => void {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
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
