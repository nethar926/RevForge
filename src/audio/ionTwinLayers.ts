import type { EngineParams, EnginePatch, IonTwinLayerConfig } from './types';

/** Minimal continuous-roar defaults (mirrors CONTINUOUS; avoids builtins cycle). */
const CONTINUOUS: EngineParams = {
  masterGain: 0.72,
  stereoWidth: 0.28,
  limiterCeiling: 0.95,
  corePitch: 62,
  pulseRate: 0.36,
  motorDetune: 0.55,
  motorMix: 0.58,
  motorEnable: 1,
  resonance: 0.62,
  formantQ: 0.62,
  noiseBody: 0.62,
  body: 0.5,
  carrierBite: 0.44,
  doppler: 0.2,
  wetDry: 0.2,
  stereoTwin: 0.35,
  spoolLag: 0.58,
  engineHowl: 0.9,
  formantHowl: 0.92,
  howlMix: 0.92,
  howlEnable: 1,
  formantSpread: 0.52,
  formantShift: 0.5,
  phraseRate: 0.28,
  phraseDepth: 0.18,
  screamEnable: 1,
  screamMix: 0.35,
  screamBright: 0.55,
  surgeEnable: 1,
  surgeMix: 0.7,
  grit: 0.42,
  gritMix: 0.42,
  gritEnable: 1,
  wetHiss: 0.78,
  air: 0.78,
  airMix: 0.78,
  airEnable: 1,
  afterburn: 0.3,
  ionSpark: 0.3,
  hum: 0.42,
  ionHum: 0.42,
  digitalCueLevel: 0,
};

const FULL_STACK: EngineParams = {
  ...CONTINUOUS,
  // Stack keeps the twin low hum level with the howl (ref-E LTAS is flat 30 Hz–1 kHz)
  motorMix: 1,
  noiseBody: 0.75,
  howlMix: 0.55,
  formantHowl: 0.55,
  screamMix: 0.15,
  screamBright: 0.5,
  surgeMix: 0.75,
  airMix: 0.95,
  wetHiss: 0.95,
  air: 0.95,
  gritMix: 0.5,
  grit: 0.5,
  formantSpread: 0.48,
  formantShift: 0.52,
  phraseDepth: 0.16,
  body: 0.7,
  wetDry: 0.22,
};

/** Canonical Ion Twin layer ids (Frontend / Pro Builder). */
export const ION_TWIN_LAYER_IDS = [
  'motorBed',
  'formantHowl',
  'screamBurst',
  'surge',
  'airSwoosh',
  'grit',
] as const;

export type IonTwinLayerId = (typeof ION_TWIN_LAYER_IDS)[number];

const LAYER_ENABLE_KEY: Record<IonTwinLayerId, keyof EngineParams> = {
  motorBed: 'motorEnable',
  formantHowl: 'howlEnable',
  screamBurst: 'screamEnable',
  surge: 'surgeEnable',
  airSwoosh: 'airEnable',
  grit: 'gritEnable',
};

const LAYER_MIX_KEY: Record<IonTwinLayerId, keyof EngineParams> = {
  motorBed: 'motorMix',
  formantHowl: 'howlMix',
  screamBurst: 'screamMix',
  surge: 'surgeMix',
  airSwoosh: 'airMix',
  grit: 'gritMix',
};

/** Default continuous-roar pack — all layers on, current Twin Ion feel. */
export function ionTwinContinuousLayers(params: EngineParams = CONTINUOUS): IonTwinLayerConfig[] {
  return ION_TWIN_LAYER_IDS.map((id) => layerFromParams(id, params));
}

/** Optional full-stack preset (ref-E balanced combination). */
export function ionTwinFullStackLayers(): IonTwinLayerConfig[] {
  return ionTwinContinuousLayers(FULL_STACK);
}

export function layerFromParams(id: IonTwinLayerId, params: EngineParams): IonTwinLayerConfig {
  const enableKey = LAYER_ENABLE_KEY[id];
  const mixKey = LAYER_MIX_KEY[id];
  const enabled = Number(params[enableKey] ?? 1) >= 0.5;
  const gain = Number(params[mixKey] ?? 0.5);
  const character = characterParamsFor(id, params);
  return {
    id,
    name: LAYER_NAMES[id],
    enabled,
    gain,
    params: character,
  };
}

const LAYER_NAMES: Record<IonTwinLayerId, string> = {
  motorBed: 'Motor Bed',
  formantHowl: 'Formant Howl',
  screamBurst: 'Scream Burst',
  surge: 'Surge',
  airSwoosh: 'Air Swoosh',
  grit: 'Grit',
};

function characterParamsFor(id: IonTwinLayerId, p: EngineParams): Record<string, number> {
  switch (id) {
    case 'motorBed':
      return pick(p, ['corePitch', 'pulseRate', 'motorDetune', 'noiseBody', 'body', 'spoolLag', 'stereoTwin']);
    case 'formantHowl':
      return pick(p, ['formantShift', 'formantSpread', 'resonance', 'formantQ', 'phraseRate', 'phraseDepth']);
    case 'screamBurst':
      return pick(p, ['screamBright']);
    case 'surge':
      return {};
    case 'airSwoosh':
      return pick(p, ['wetDry', 'wetHiss', 'air']);
    case 'grit':
      return pick(p, ['grit']);
  }
}

function pick(p: EngineParams, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Merge IonTwinLayerConfig enable/gain (+ character) into flat EngineParams.
 * Missing layers leave existing params unchanged (combinable subsets).
 */
export function applyIonTwinLayersToParams(
  base: EngineParams,
  layers: IonTwinLayerConfig[],
): EngineParams {
  const next: EngineParams = { ...base };
  for (const layer of layers) {
    const id = layer.id as IonTwinLayerId;
    if (!LAYER_ENABLE_KEY[id]) continue;
    next[LAYER_ENABLE_KEY[id]] = layer.enabled ? 1 : 0;
    next[LAYER_MIX_KEY[id]] = clamp01(layer.gain);
    // Keep legacy aliases in sync for howl/air/grit
    if (id === 'formantHowl') {
      next.formantHowl = clamp01(layer.gain);
      next.engineHowl = clamp01(layer.gain);
    }
    if (id === 'airSwoosh') {
      next.wetHiss = clamp01(layer.gain);
      next.air = clamp01(layer.gain);
    }
    if (id === 'grit') {
      next.grit = clamp01(layer.gain);
    }
    if (id === 'motorBed') {
      next.carrierBite = clamp01(layer.gain);
    }
    if (layer.params) {
      for (const [k, v] of Object.entries(layer.params)) {
        if (typeof v === 'number' && Number.isFinite(v)) next[k] = v;
      }
    }
  }
  return next;
}

/** Build a scifi EnginePatch from an arbitrary layer subset (combine). */
export function combineIonTwinLayers(
  layers: IonTwinLayerConfig[],
  opts?: { id?: string; name?: string; fullStack?: boolean },
): EnginePatch {
  const base = opts?.fullStack ? { ...FULL_STACK } : { ...CONTINUOUS };
  // Start with all layers off, then enable the provided subset
  for (const id of ION_TWIN_LAYER_IDS) {
    base[LAYER_ENABLE_KEY[id]] = 0;
    base[LAYER_MIX_KEY[id]] = 0;
  }
  const params = applyIonTwinLayersToParams(base, layers);
  return {
    version: 0,
    id: opts?.id ?? 'ion-twin-custom',
    name: opts?.name ?? 'Ion Twin Custom',
    kind: 'scifi',
    topology: 'ion-twin',
    params: params as Record<string, number | string>,
    ionLayers: layers.map((l) => ({ ...l, params: l.params ? { ...l.params } : undefined })),
    meta: {
      author: 'DriveSynth',
      tags: ['scifi', 'ion', 'layers'],
      blurb: 'Combinable Ion Twin procedural layers — original synthesis, no samples.',
    },
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
