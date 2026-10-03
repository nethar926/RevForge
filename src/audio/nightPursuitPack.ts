/**
 * Night Pursuit — flagship experimental ICE pack (single identity hub).
 *
 * Pack id = topology id = skin id = `night-pursuit`. Display name "Night Pursuit".
 * Acoustic target (Product Research brief §3, public/observable only):
 * - Early-80s pony-car class ~5.0 L cross-plane V8 — deep lumpy idle, load-rich mids,
 *   dual-exhaust burble from the collector delay, waveguide body.
 * - PURSUIT mode = optional light turbo whistle + intake whoosh seasoning (never a jet).
 * - Optional soft original electronic scanner tick (default off).
 * - Pack-specific crank→catch starter and lumpy rundown shutoff.
 * Fully procedural Web Audio / AudioWorklet — no samples, no show audio, no voice.
 *
 * See docs/night-pursuit-audio-v1.md for the Frontend / Visual contract.
 */
import type { EngineParams, EnginePatch } from './types';

export const NIGHT_PURSUIT_PACK_ID = 'night-pursuit' as const;
export const NIGHT_PURSUIT_TOPOLOGY_ID = NIGHT_PURSUIT_PACK_ID;
export const NIGHT_PURSUIT_SKIN_ID = NIGHT_PURSUIT_PACK_ID;
export const NIGHT_PURSUIT_DISPLAY_NAME = 'Night Pursuit';
/** Experimental flag (pack framework + builtin patch field). */
export const NIGHT_PURSUIT_EXPERIMENTAL = true;

export type NightPursuitPackId = typeof NIGHT_PURSUIT_PACK_ID;

export function isNightPursuitPack(id: string | undefined | null): boolean {
  return id === NIGHT_PURSUIT_PACK_ID;
}

/** True when topology is the dedicated Night Pursuit ICE path. */
export function isNightPursuitTopology(topology: string | undefined | null): boolean {
  return topology === NIGHT_PURSUIT_TOPOLOGY_ID;
}

/**
 * Deep cross-plane V8 defaults + Night Pursuit opt-ins.
 * rpmIdle/rpmRedline are firing Hz (N·rpm/120): 44 → 660 rpm idle, 340 → 5100 rpm redline.
 * gearCount/autoShiftRpm/maxRpm feed Frontend's drivetrainFor() (4-speed automatic feel).
 */
export const NIGHT_PURSUIT_DEFAULTS: EngineParams = {
  masterGain: 0.76,
  stereoWidth: 0.5,
  limiterCeiling: 0.95,
  rpmIdle: 44,
  rpmRedline: 340,
  cylinders: 8,
  roughness: 0.58,
  growl: 0.8,
  presence: 0.3,
  intake: 0.55,
  exhaust: 0.86,
  ignitionNoise: 0.18,
  muffling: 0.36,
  rpmCurve: 0.55,
  pulseWidth: 0.6,
  pulseJitter: 0.36,
  exhaustLength: 0.74,
  exhaustFeedback: 0.8,
  crackle: 0.3,
  misfire: 0.035,
  // Cross-plane V8: bank A [0,180,270,450] → 180/90/180/270 per-bank intervals
  firingFamily: 1,
  firingMask: 0,
  collectorDelayMs: 2.5,
  bankOffsetDeg: 90,
  tauManifold: 0.15,
  tauExhaust: 0.3,
  // Night Pursuit worklet opt-ins (0..1)
  camLope: 0.82,
  bankSplit: 0.8,
  overrunBurble: 0.6,
  // Post-chain character (0..1)
  loadRich: 0.7,
  bodyDepth: 0.65,
  // PURSUIT seasoning (pursuitBoost 0 = NORM / off)
  pursuitBoost: 0,
  turboWhistle: 0.5,
  intakeWhoosh: 0.6,
  wastegate: 0.35,
  // Soft original scanner tick level (0 = off; hook: triggerScannerTick)
  scannerTick: 0,
  // Frontend drivetrain hints (forge/catalog drivetrainFor)
  gearCount: 4,
  autoShiftRpm: 4300,
  maxRpm: 5200,
  redlinePercent: 92,
  topSpeedKph: 200,
};

/** Night Pursuit param ids that are not part of the shared ICE slider set. */
export const NIGHT_PURSUIT_PARAM_IDS = [
  'camLope',
  'bankSplit',
  'overrunBurble',
  'loadRich',
  'bodyDepth',
  'pursuitBoost',
  'turboWhistle',
  'intakeWhoosh',
  'wastegate',
  'scannerTick',
] as const;

export function nightPursuitBuiltinPatch(): EnginePatch {
  return {
    version: 0,
    id: NIGHT_PURSUIT_PACK_ID,
    name: NIGHT_PURSUIT_DISPLAY_NAME,
    kind: 'ice',
    topology: NIGHT_PURSUIT_TOPOLOGY_ID,
    params: { ...NIGHT_PURSUIT_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Experimental flagship: deep cross-plane V8 with a lumpy cam idle, true dual-exhaust burble, load-rich mids and lift-off overrun pops. PURSUIT adds a light turbo whistle + intake whoosh. Original procedural synthesis only.',
      tags: ['ice', 'v8', 'crossplane', 'pursuit', 'experimental', 'free'],
      author: 'DriveSynth',
    },
  };
}
