export type {
  DrivingInput,
  EngineDiag,
  EngineStateSnapshot,
  EngineId,
  EngineKind,
  EngineParams,
  EnginePatch,
  EngineSynth,
  IceMode,
  LockStage,
  ParamMeta,
  IonTwinLayerConfig,
  SynthNodeDesc,
  SynthNodeType,
  TopologyId,
} from './types';
export {
  BUILTIN_PATCHES,
  LEGACY_PACK_IDS,
  defaultPatchIdForKind,
  defaultsForKind,
  defaultsForTopology,
  getBuiltin,
  paramMetaForKind,
  paramMetaForNodeType,
  resolveLegacyPackId,
  resolveLegacyTopology,
  migrateEnginePatch,
} from './builtins';
export { createEngineSynth, EngineSynthImpl } from './EngineSynthImpl';
export { nextLockStage, packSupportsLockLadder } from './lockStage';
export { clamp, kphToMph, lerp, mphToSpeed, rpmCurve } from './utils';
export {
  clampIdleBand,
  DEFAULT_IDLE_BAND,
  DEFAULT_IDLE_RPM_MAX,
  DEFAULT_IDLE_RPM_MIN,
  iceFiringHzFromRpm,
  idleRpmToHz,
  readIdleBandFromStorage,
} from './idleBand';
export type { IdleBand } from './idleBand';

export {
  EngineStateBridge,
  ICE_PACK_SCHEDULES,
  crossPlaneBankAAnglesDeg,
  estimateNextPulseDt,
  isSlotDisabled,
  mapRevforgeFiringToFamily,
  nextEventAnglesDeg,
  rotaryEventAnglesDeg,
  physicsJitterToWorklet,
  resolveIcePackSchedule,
  workletJitterToPhysics,
} from './engineStateBridge';
export type {
  EngineStatePackHints,
  EngineStateRawInput,
  IcePackSchedule,
  WorkletParamPush,
} from './engineStateBridge';
export {
  playEngineStarter,
  playEngineShutoff,
  starterDuration,
  shutoffDuration,
} from './engineStartShutdown';
export {
  ION_TWIN_LAYER_IDS,
  applyIonTwinLayersToParams,
  combineIonTwinLayers,
  ionTwinContinuousLayers,
  ionTwinFullStackLayers,
  layerFromParams,
} from './ionTwinLayers';
export type { IonTwinLayerId } from './ionTwinLayers';
export { TIE_FULL_STACK } from './builtins';


export type { ScannerEdge } from './types';
export {
  NIGHT_PURSUIT_PACK_ID,
  NIGHT_PURSUIT_TOPOLOGY_ID,
  NIGHT_PURSUIT_SKIN_ID,
  NIGHT_PURSUIT_DISPLAY_NAME,
  NIGHT_PURSUIT_EXPERIMENTAL,
  NIGHT_PURSUIT_DEFAULTS,
  NIGHT_PURSUIT_PARAM_IDS,
  isNightPursuitPack,
  isNightPursuitTopology,
  nightPursuitBuiltinPatch,
} from './nightPursuitPack';
export { NIGHT_PURSUIT_PARAM_META } from './builtins';
export { nightPursuitBoostForMode } from './nightPursuitVoice';
export {
  CHRONO_COUPE,
  CHRONO_COUPE_ID,
  CHRONO_COUPE_TOPOLOGY_ID,
  CHRONO_COUPE_DISPLAY_NAME,
  CHRONO_COUPE_EXPERIMENTAL,
  CHRONO_COUPE_DEFAULTS,
  CHRONO_COUPE_PARAM_IDS,
  CHRONO_COUPE_FIRING_FAMILY,
  isChronoCoupePack,
  isChronoCoupeTopology,
  chronoCoupeBuiltinPatch,
  type ChronoCoupeId,
} from './chronoCoupePack';
export { CHRONO_COUPE_PARAM_META } from './builtins';
export { chronoCoupeChargeIntensity, CC_DISCHARGE_COOLDOWN_S } from './chronoCoupeVoice';
export { EnvelopeMeter } from './envelopeMeter';
export {
  STELLAR_HELM_PACK,
  STELLAR_HELM_EXPERIMENTAL,
  STELLAR_HELM_DEFAULTS,
  STELLAR_HELM_PARAM_IDS,
  STELLAR_HELM_PARAM_META,
  isStellarHelmPack,
  isStellarHelmTopology,
  stellarHelmBuiltinPatch,
} from './stellarHelmPack';
export type { StellarHelmId } from './stellarHelmPack';
