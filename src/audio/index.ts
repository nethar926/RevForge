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
  QUIET_CURRENT,
  QUIET_CURRENT_ID,
  QUIET_CURRENT_TOPOLOGY_ID,
  QUIET_CURRENT_DISPLAY_NAME,
  QUIET_CURRENT_EXPERIMENTAL,
  QUIET_CURRENT_DEFAULTS,
  QUIET_CURRENT_PARAM_IDS,
  QUIET_CURRENT_VARIANTS,
  QUIET_CURRENT_VARIANT_STORAGE_KEY,
  QUIET_CURRENT_CYBER_PREVIEW_ID,
  isQuietCurrentPack,
  isQuietCurrentTopology,
  isQuietCurrentVariant,
  quietCurrentBuiltinPatch,
  type QuietCurrentId,
  type QuietCurrentVariant,
} from './quietCurrentPack';
export { QUIET_CURRENT_PARAM_META } from './builtins';
export { quietCurrentCyberAmount } from './quietCurrentVoice';
export { EnvelopeMeter } from './envelopeMeter';
