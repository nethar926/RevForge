/**
 * Chrono Coupe — experimental ICE pack (single identity hub).
 *
 * RENAME = edit CHRONO_COUPE below (one line each for id / display name). Every other module
 * (builtins, topology switch, bridge schedule, engine routing, Engines preview map, tests)
 * derives from it. Only the preview WAV, docs page and test *file names* carry the id literally.
 *
 * Acoustic target (original, procedural only):
 * - 2.85 L rear-mounted 90° V6 on a common-pin crank → odd firing (150°/90° alternating):
 *   uneven, slightly wheezy, modest power; continuous mechanical-injection hiss; mild
 *   stainless body-shell resonance; gentle overrun pops; continuous mapping (no cliffs).
 * - Charge mode: electrical whine + crackle that builds with the charge level, then a
 *   discharge event (bright release crack / sweep, short shimmer tail, brief engine dip).
 *   Loudness-safe: own compressor, ramped envelopes, rate-limited discharge.
 * - Pack-specific starter (fuel-pump prime → odd-fire crank → catch) and shutoff.
 * No samples, no decoded/fetched audio — Web Audio + the pulse AudioWorklet only.
 *
 * See docs/chrono-coupe-audio-v1.md for the Frontend / Visual contract.
 */
import type { EngineParams, EnginePatch } from './types';

export const CHRONO_COUPE = {
  id: 'chrono-coupe',
  displayName: 'Chrono Coupe',
} as const;

export type ChronoCoupeId = typeof CHRONO_COUPE.id;
export const CHRONO_COUPE_ID: ChronoCoupeId = CHRONO_COUPE.id;
export const CHRONO_COUPE_TOPOLOGY_ID: ChronoCoupeId = CHRONO_COUPE.id;
export const CHRONO_COUPE_DISPLAY_NAME = CHRONO_COUPE.displayName;
export const CHRONO_COUPE_EXPERIMENTAL = true;
/** Worklet firing family 5 = odd-fire 90° V6 (angles 0/150/240/390/480/630). */
export const CHRONO_COUPE_FIRING_FAMILY = 5;

export function isChronoCoupePack(id: string | undefined | null): boolean {
  return id === CHRONO_COUPE.id;
}

export function isChronoCoupeTopology(topology: string | undefined | null): boolean {
  return topology === CHRONO_COUPE.id;
}

/**
 * Odd-fire V6 defaults. rpmIdle / rpmRedline are firing Hz (N·rpm/120):
 * 43 → 860 rpm idle, 300 → 6000 rpm redline. Drivetrain hints = 5-speed manual feel.
 */
export const CHRONO_COUPE_DEFAULTS: EngineParams = {
  masterGain: 0.74,
  stereoWidth: 0.4,
  limiterCeiling: 0.95,
  rpmIdle: 43,
  rpmRedline: 300,
  cylinders: 6,
  roughness: 0.5,
  growl: 0.52,
  presence: 0.42,
  intake: 0.62,
  exhaust: 0.55,
  ignitionNoise: 0.2,
  muffling: 0.42,
  rpmCurve: 0.55,
  pulseWidth: 0.42,
  pulseJitter: 0.22,
  exhaustLength: 0.52,
  exhaustFeedback: 0.74,
  crackle: 0.22,
  misfire: 0.015,
  firingFamily: CHRONO_COUPE_FIRING_FAMILY,
  firingMask: 0,
  collectorDelayMs: 1.4,
  bankOffsetDeg: 90,
  tauManifold: 0.11,
  tauExhaust: 0.22,
  // Worklet opt-ins (shared with Night Pursuit; 0 elsewhere)
  camLope: 0.16,
  bankSplit: 0.35,
  overrunBurble: 0.32,
  // Post-chain character (0..1)
  injectionHiss: 0.5,
  shellResonance: 0.45,
  wheeze: 0.55,
  // Rear V6 voice (worklets/chrono-v6-processor.js): rasp, idle lump, loudness trim
  v6Rasp: 0.55,
  v6Lump: 0.6,
  v6Level: 1,
  // The V6 plays its own startup / shutdown (no generic lifecycle sweep on top)
  lifecycleSounds: 0,
  // Charge mode
  chargeIntensity: 0.75,
  chargeLevel: 0,
  pursuitBoost: 0,
  // Frontend drivetrain hints
  gearCount: 5,
  autoShiftRpm: 5400,
  maxRpm: 6200,
  redlinePercent: 92,
  topSpeedKph: 210,
};

/** Chrono Coupe param ids that are not part of the shared ICE slider set. */
export const CHRONO_COUPE_PARAM_IDS = [
  'camLope',
  'bankSplit',
  'overrunBurble',
  'injectionHiss',
  'shellResonance',
  'wheeze',
  'chargeIntensity',
  'chargeLevel',
  'pursuitBoost',
] as const;

export function chronoCoupeBuiltinPatch(): EnginePatch {
  return {
    version: 0,
    id: CHRONO_COUPE.id,
    name: CHRONO_COUPE.displayName,
    kind: 'ice',
    topology: CHRONO_COUPE.id,
    params: { ...CHRONO_COUPE_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Experimental: rear-mounted 2.85 L odd-fire 90° V6 — uneven, slightly wheezy, injection hiss and a mild stainless-shell ring. Charge mode builds an electrical whine + crackle, then a bright discharge. Original procedural synthesis only.',
      tags: ['ice', 'v6', 'odd-fire', 'charge', 'experimental', 'free'],
      author: 'DriveSynth',
    },
  };
}
