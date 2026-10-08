/**
 * Stellar Helm — experimental starship drive hum pack (single identity hub).
 *
 * The pack id, builtin id, topology id and snippet name all come from STELLAR_HELM_PACK,
 * so a future rename is a one-line change here (plus re-rendering the preview WAV).
 *
 * Sound: a smooth, deep, calm drive hum that follows speed continuously — sub-bass bed with
 * slow beating, a harmonic core tone that rises gently with speed/throttle, an airy shimmer
 * and slow breathing. Original procedural Web Audio synthesis only: no samples, no loops,
 * no decoded or fetched audio. See docs/stellar-helm-audio-v1.md.
 */
import type { EngineParams, EnginePatch, ParamMeta } from './types';

/** THE identity constant — id + display name in one place. */
export const STELLAR_HELM_PACK = { id: 'stellar-helm', name: 'Stellar Helm' } as const;

export type StellarHelmId = typeof STELLAR_HELM_PACK.id;
export const STELLAR_HELM_EXPERIMENTAL = true;

export function isStellarHelmPack(id: string | undefined | null): boolean {
  return id === STELLAR_HELM_PACK.id;
}

/** True when topology selects the dedicated Stellar Helm voice graph. */
export function isStellarHelmTopology(topology: string | undefined | null): boolean {
  return topology === STELLAR_HELM_PACK.id;
}

/**
 * Defaults. Engine kind is 'ev-whine' (continuous electric drive, no gears, no worklet), but the
 * EV whine graph is replaced entirely by the Stellar Helm voice for this topology.
 */
export const STELLAR_HELM_DEFAULTS: EngineParams = {
  masterGain: 0.72,
  stereoWidth: 0.45,
  limiterCeiling: 0.95,
  rpmCurve: 0.5,
  // Voice character (0..1 unless noted)
  helmSubHz: 38, // sub-bass bed fundamental at rest (Hz)
  helmCoreHz: 73.4, // harmonic core fundamental at rest (Hz)
  helmRise: 0.85, // core pitch rise across the speed range (octaves)
  helmSub: 0.8,
  helmBeat: 0.6, // detune → slow beating between bed partials
  helmCore: 0.7,
  helmBright: 0.55, // how far the core opens with speed/throttle
  helmWarmth: 0.6, // throttle warmth (low shelf + power partials)
  helmShimmer: 0.45,
  helmBreath: 0.5, // slow breathing modulation depth
  helmReverse: 0.7, // how much reverse lowers + softens the hum
  // Boost (setPursuitBoost / pursuitBoost) 0..1 — adds intensity + brightness, smoothed
  pursuitBoost: 0,
  // Suppress the generic lifecycle chirps; the pack has its own power-up / power-down
  lifecycleSounds: 0,
  // Frontend drivetrain hints: one continuous ratio (no shift cliffs)
  gearCount: 1,
  topSpeedKph: 200,
};

export const STELLAR_HELM_PARAM_IDS = [
  'helmSubHz',
  'helmCoreHz',
  'helmRise',
  'helmSub',
  'helmBeat',
  'helmCore',
  'helmBright',
  'helmWarmth',
  'helmShimmer',
  'helmBreath',
  'helmReverse',
  'pursuitBoost',
] as const;

/** Builder sliders for this topology (paramMetaForKind('ev-whine', STELLAR_HELM_PACK.id)). */
export const STELLAR_HELM_PARAM_META: ParamMeta[] = [
  { id: 'masterGain', label: 'Master', min: 0, max: 1, step: 0.01 },
  { id: 'stereoWidth', label: 'Width', min: 0, max: 1, step: 0.01 },
  { id: 'helmSubHz', label: 'Bed Hz', min: 28, max: 60, step: 0.5, unit: 'Hz', group: 'helm' },
  { id: 'helmCoreHz', label: 'Core Hz', min: 45, max: 130, step: 0.5, unit: 'Hz', group: 'helm' },
  { id: 'helmRise', label: 'Pitch Rise', min: 0, max: 1.5, step: 0.01, group: 'helm' },
  { id: 'helmSub', label: 'Sub Bed', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmBeat', label: 'Beating', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmCore', label: 'Core Tone', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmBright', label: 'Brightness', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmWarmth', label: 'Warmth', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmShimmer', label: 'Shimmer', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmBreath', label: 'Breathing', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'helmReverse', label: 'Reverse Depth', min: 0, max: 1, step: 0.01, group: 'helm' },
  { id: 'pursuitBoost', label: 'Boost', min: 0, max: 1, step: 0.01, group: 'helmBoost' },
];

export function stellarHelmBuiltinPatch(): EnginePatch {
  return {
    version: 0,
    id: STELLAR_HELM_PACK.id,
    name: STELLAR_HELM_PACK.name,
    kind: 'ev-whine',
    topology: STELLAR_HELM_PACK.id,
    params: { ...STELLAR_HELM_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Experimental: a deep, calm starship drive hum. Sub-bass bed with slow beating, a harmonic core that rises gently with speed, an airy shimmer and slow breathing. Boost adds intensity. Original procedural synthesis only.',
      tags: ['ev', 'starship', 'hum', 'experimental', 'free'],
      author: 'RevForge',
    },
  };
}
