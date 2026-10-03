/**
 * Per-voice LIVE output trim (dB), applied post-dynamics on CharacterEngine.output so the
 * voice's timbre and dynamics are untouched — only its level moves. Keyed by topology
 * (legacy ids resolved). Not applied to a voice used as a layer inside another pack.
 *
 * ion-twin −2 dB: HIG loudness (Chief of Staff approved for preview/hig only, pending
 * Wilson's A/B). Drop this entry to revert.
 */
import type { EnginePatch } from './types';

export const LIVE_TRIM_DB: Readonly<Record<string, number>> = {
  'ion-twin': -2,
};

/** Same mapping as builtins.resolveLegacyTopology (kept local: no import cycle via CharacterEngine). */
const topologyKey = (t: string) => (t === 'tie-fighter' ? 'ion-twin' : t);

export function liveTrimDb(patch: Pick<EnginePatch, 'topology'> | null | undefined): number {
  if (!patch) return 0;
  return LIVE_TRIM_DB[topologyKey(String(patch.topology))] ?? 0;
}

/**
 * Build marker for each active trim. Read at runtime (CharacterEngine.getDiag().liveTrim), so the
 * literal survives minification: `grep -r 'ion-twin-live-trim:-2dB' dist` proves the cut shipped.
 */
export const LIVE_TRIM_MARKERS: Readonly<Record<string, string>> = {
  'ion-twin': 'ion-twin-live-trim:-2dB',
};

export function liveTrimMarker(patch: Pick<EnginePatch, 'topology'> | null | undefined): string | undefined {
  if (!patch || !liveTrimDb(patch)) return undefined;
  return LIVE_TRIM_MARKERS[topologyKey(String(patch.topology))];
}

export function liveTrimGain(patch: Pick<EnginePatch, 'topology'> | null | undefined): number {
  return Math.pow(10, liveTrimDb(patch) / 20);
}
