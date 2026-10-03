/**
 * Quiet Current — experimental EV pack (single identity hub).
 *
 * RENAME = edit QUIET_CURRENT below (one line each for id / display name). Every other module
 * (builtins, topology switch, engine routing, power cues, Engines preview map, tests) derives
 * from it. Only the preview WAVs, docs page and test *file names* carry the id literally.
 *
 * Acoustic target (original, procedural only): a subtle, refined, premium electric-motor voice,
 * quiet by default — soft inverter tone rising with speed (gentle switching-carrier steps at low
 * speed), warm motor / gear hum with a light gear-mesh partial, a little road / tyre noise and
 * wind, throttle presence, softer lower regen on lift-off, softer lower reverse. Cyber variant =
 * the same voice, brighter and more metallic (chamfered-steel ring), tighter response.
 * Power-on chime-tone and falling power-off tone. No samples, no decoded/fetched audio.
 *
 * See docs/quiet-current-audio-v1.md for the Frontend contract.
 */
import type { EngineParams, EnginePatch } from './types';

export const QUIET_CURRENT = {
  id: 'quiet-current',
  displayName: 'Quiet Current',
} as const;

export type QuietCurrentId = typeof QUIET_CURRENT.id;
export const QUIET_CURRENT_ID: QuietCurrentId = QUIET_CURRENT.id;
export const QUIET_CURRENT_TOPOLOGY_ID: QuietCurrentId = QUIET_CURRENT.id;
export const QUIET_CURRENT_DISPLAY_NAME = QUIET_CURRENT.displayName;
export const QUIET_CURRENT_EXPERIMENTAL = true;

/** Voice variants. `setVariant('cyber')` ≡ setParams({ cyber: 1 }); numbers 0..1 blend. */
export type QuietCurrentVariant = 'standard' | 'cyber';
export const QUIET_CURRENT_VARIANTS: readonly QuietCurrentVariant[] = ['standard', 'cyber'] as const;
/** Frontend persistence key for the variant toggle (Product Research brief §8). */
export const QUIET_CURRENT_VARIANT_STORAGE_KEY = `revforge.pack.${QUIET_CURRENT.id}.variant`;
/** Preview map key for the Cyber preview WAV (EnginesPage SNIPPET_BY_ID). */
export const QUIET_CURRENT_CYBER_PREVIEW_ID = `${QUIET_CURRENT.id}-cyber`;

export function isQuietCurrentPack(id: string | undefined | null): boolean {
  return id === QUIET_CURRENT.id;
}

export function isQuietCurrentTopology(topology: string | undefined | null): boolean {
  return topology === QUIET_CURRENT.id;
}

export function isQuietCurrentVariant(v: unknown): v is QuietCurrentVariant {
  return v === 'standard' || v === 'cyber';
}

/** Quiet-by-default EV defaults (kind 'ev-whine'). Character params are 0..1. */
export const QUIET_CURRENT_DEFAULTS: EngineParams = {
  masterGain: 0.62,
  stereoWidth: 0.25,
  limiterCeiling: 0.9,
  rpmCurve: 0.5,
  inverterTone: 0.55,
  motorHum: 0.5,
  gearMesh: 0.35,
  roadNoise: 0.45,
  windNoise: 0.4,
  regenTone: 0.6,
  lowSpeedHum: 0.5,
  steelRing: 0.6,
  cyber: 0,
  pursuitBoost: 0,
  // Generic lifecycle one-shots off: this pack's own power-on / power-off cues play instead
  lifecycleSounds: 0,
  // Frontend drivetrain hints (single-speed reduction)
  gearCount: 1,
  maxRpm: 16000,
  topSpeedKph: 200,
};

/** Quiet Current param ids that are not part of the shared EV slider set. */
export const QUIET_CURRENT_PARAM_IDS = [
  'inverterTone',
  'motorHum',
  'gearMesh',
  'roadNoise',
  'windNoise',
  'regenTone',
  'lowSpeedHum',
  'steelRing',
  'cyber',
  'pursuitBoost',
] as const;

export function quietCurrentBuiltinPatch(): EnginePatch {
  return {
    version: 0,
    id: QUIET_CURRENT.id,
    name: QUIET_CURRENT.displayName,
    kind: 'ev-whine',
    topology: QUIET_CURRENT.id,
    params: { ...QUIET_CURRENT_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Experimental: a subtle, refined electric-motor voice — soft inverter tone that rises with speed, warm motor hum, a little road and wind. Gentle regen on lift-off. Cyber variant: brighter, machined-steel edge. Original procedural synthesis only.',
      tags: ['ev', 'refined', 'cyber', 'experimental', 'free'],
      author: 'DriveSynth',
    },
  };
}
