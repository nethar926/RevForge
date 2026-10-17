/**
 * Named UI cue hooks for Dan's audio (Meghan's sheet: SEAT BELT "single low tone", O2 "3 hi-lo chimes"). The host
 * fires them through the jet bridge (api.playJetCue) when the pilot switches the system ON from the shelf, gated by
 * SW SND like the other switch cues. Dan's jet voice returns false for a cue name it doesn't know, so until his side
 * implements them they are silent no-ops (no throw, no fallback sound).
 */
export const CJ_HOST_CUES = { seatbelt: 'seatbeltTone', oxygen: 'o2Chimes' } as const;
export type CjHostCue = (typeof CJ_HOST_CUES)[keyof typeof CJ_HOST_CUES];
/** The cue for a shelf switch change, or null: only seat belt ON and oxygen ON. */
export function hostCueFor(system: string, on: boolean): CjHostCue | null {
  if (!on) return null;
  return system === 'seatbelt' || system === 'oxygen' ? CJ_HOST_CUES[system] : null;
}
