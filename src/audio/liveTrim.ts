/**
 * Per-pack LIVE output trim (dB), applied by the HIG master bus AFTER the limiter and soft
 * ceiling (MasterBus.setLiveTrimDb), so it is an exact level change at every operating point —
 * idle, cruise and full throttle — even when the pack drives the limiter. Timbre and dynamics
 * are untouched. Keyed by the ACTIVE pack id (legacy ids resolved); a voice used as a layer
 * inside another pack, or another pack sharing the topology (e.g. revforge-trenchlight), is
 * never trimmed. Only ever attenuates (values > 0 are clamped to 0 by the master bus).
 *
 * ion-twin −2 dB: HIG loudness (Chief of Staff approved for preview/hig only, pending
 * Wilson's A/B). Drop this entry to revert.
 */
import type { EnginePatch } from './types';

export const LIVE_TRIM_DB: Readonly<Record<string, number>> = {
  'ion-twin': -2,
};

/**
 * Build marker for each active trim. Read at runtime (CharacterEngine.getDiag().liveTrim), so the
 * literal survives minification: `grep -r 'ion-twin-live-trim:-2dB' dist` proves the cut shipped.
 */
export const LIVE_TRIM_MARKERS: Readonly<Record<string, string>> = {
  'ion-twin': 'ion-twin-live-trim:-2dB',
};

/** Same mapping as builtins.LEGACY_PACK_IDS for trimmed packs (kept local: no import cycle). */
const packKey = (id: string) => (id === 'tie-fighter' ? 'ion-twin' : id);

type TrimKey = Pick<EnginePatch, 'id'> | null | undefined;

export function liveTrimDb(patch: TrimKey): number {
  if (!patch?.id) return 0;
  return LIVE_TRIM_DB[packKey(String(patch.id))] ?? 0;
}

export function liveTrimMarker(patch: TrimKey): string | undefined {
  if (!patch || !liveTrimDb(patch)) return undefined;
  return LIVE_TRIM_MARKERS[packKey(String(patch.id))];
}

export function liveTrimGain(patch: TrimKey): number {
  return Math.pow(10, liveTrimDb(patch) / 20);
}
