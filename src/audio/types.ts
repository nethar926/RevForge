import type { RevForgeVoiceConfig } from '../forge/voiceTypes';
import type { STELLAR_HELM_PACK } from './stellarHelmPack';
export type EngineId = string;

export type TopologyId =
  | 'v8-rumble'
  | 'i4-zip'
  | 'i6-silk'
  | 'rotary-hum'
  | 'ev-whine'
  | 'ev-inverter-climb'
  | 'ev-regen-howl'
  | 'ev-dual-motor'
  | 'ion-twin'
  | 'aerospace-f14'
  | 'night-pursuit'
  | typeof STELLAR_HELM_PACK.id
  | 'custom';

/** Pack / builder categories. Old kinds map 1:1 (ice, ev-whine, scifi); aerospace is new. */
export type EngineKind = 'ice' | 'ev-whine' | 'aerospace' | 'scifi';

/** Ion Twin targeting ladder (rpmNorm + hysteresis). */
export type LockStage = 'none' | 'identified' | 'lock' | 'kill';

export type IceMode = 'worklet' | 'osc' | 'n/a';

/** Scanner sweep edge reported by pack HUDs (Night Pursuit). */
export type ScannerEdge = 'left' | 'right';

export interface EngineDiag {
  /** AudioContext.state */
  contextState: AudioContextState | string;
  /** ICE synthesis path; 'n/a' for non-ICE packs */
  iceMode: IceMode;
  /** True after start() until stop()/dispose() */
  running: boolean;
  engineId: EngineId;
  /** Present when AudioWorklet load/init failed */
  workletError?: string;
}

/** ICE EngineState snapshot from Audio Physics bridge (HUD / QA). */
export interface EngineStateSnapshot {
  rpm: number;
  throttle: number;
  load: number;
  /** bit i SET = slot i disabled */
  firingMask: number;
  misfireAmount: number;
  firingFamily: number;
  bankSchedule: string;
  cylinders: number;
  crankAngleDeg: number;
  manifoldNorm: number;
  exhaustOpenness: number;
  pulseJitter: number;
  /** Rotary: chambers per rotor (default 3). */
  chambersPerRotor?: number;
  /** Rotary: rotor count 1|2. */
  rotors?: number;
}

export interface DrivingInput {
  /** Normalized vehicle speed 0..1 */
  speed: number;
  /** Accelerator / regen 0..1 (parked Rev when speed≈0) */
  throttle: number;
  /** Load lean -1..1 */
  load?: number;
  reverse?: boolean;
  /** Physical drivetrain RPM, supplied by the merged simulator. Legacy callers may omit it. */
  rpm?: number;
  rpmNorm?: number;
  acceleration?: number;
  shifting?: boolean;
  overrun?: boolean;
}

export interface EngineParams {
  roarDepth?:number;roarAir?:number;roarWidth?:number;roarLevel?:number; roarVariant?:number; roarPitch?:number; roarThroat?:number; roarRasp?:number; roarPulse?:number; roarAttack?:number; roarRelease?:number;
  interiorNoise?:number; interiorLevel?:number; targetingNoise?:number; targetingLevel?:number; gearingNoise?:number; gearingLevel?:number; blasterLevel?:number; lifecycleSounds?:number; lifecycleLevel?:number;
  gearCount?:number;maxRpm?:number;autoShiftRpm?:number;redlinePercent?:number;topSpeedKph?:number;graphEnabled?:number;
  jetSimulation?: number;
  tieSignature?: number;
  masterGain: number;
  stereoWidth: number;
  limiterCeiling: number;
  // ICE
  rpmIdle?: number;
  rpmRedline?: number;
  cylinders?: 3 | 4 | 6 | 8 | 10 | 12;
  roughness?: number;
  growl?: number;
  presence?: number;
  intake?: number;
  exhaust?: number;
  ignitionNoise?: number;
  muffling?: number;
  rpmCurve?: number;
  /** Pulse width 0..1 (worklet ICE) */
  pulseWidth?: number;
  /** Combustion timing jitter 0..1 */
  pulseJitter?: number;
  /** Exhaust waveguide length 0..1 */
  exhaustLength?: number;
  /** Waveguide feedback 0..1 */
  exhaustFeedback?: number;
  /** Overrun crackle amount 0..1 */
  crackle?: number;
  /** Stochastic misfire amount 0..1 (RES: changes lope) */
  misfire?: number;
  /** 0=auto 1=crossplane 2=flatplane 3=even 4=rotary chamber-pulse */
  firingFamily?: number;
  /** Rotary: chambers per eccentric rotor (default 3). */
  chambersPerRotor?: number;
  /** Rotary: 1 or 2 rotors (2 stacks cadence). */
  rotors?: number;
  /**
   * ICE drop-cyl bitfield 0–255 (worklet AudioParam).
   * Convention: bit i set = slot i disabled; 0 = all enabled (mask-none).
   */
  firingMask?: number;
  /** QA: drop this cylinder slot (0–7); Synth maps to firingMask bit */
  dropCyl?: number;
  /** Dual-collector L/R delay ms (pack schedule). Synth may map to stereo delay. */
  collectorDelayMs?: number;
  /** Bank B offset degrees (typical 90 for V8). */
  bankOffsetDeg?: number;
  /** Manifold fill lag τ seconds (EngineState). */
  tauManifold?: number;
  /** Exhaust openness lag τ seconds (EngineState). */
  tauExhaust?: number;
  // Sci-fi / Ion Twin
  corePitch?: number;
  pulseRate?: number;
  resonance?: number;
  noiseBody?: number;
  carrierBite?: number;
  doppler?: number;
  engineHowl?: number;
  afterburn?: number;
  hum?: number;
  /** Multi-formant howl intensity 0..1 */
  formantHowl?: number;
  /** Wet-road hiss layer 0..1 */
  wetHiss?: number;
  /** Formant sweep rate / spread 0..1 */
  formantSpread?: number;
  /** Twin motor detune / beat 0..1 */
  motorDetune?: number;
  /** Twin motor mix 0..1 */
  motorMix?: number;
  /** Formant CF scale 0..1 (~0.7–1.4×) */
  formantShift?: number;
  /** Formant Q alias 0..1 */
  formantQ?: number;
  /** Phrase AM rate 0..1 */
  phraseRate?: number;
  /** Phrase AM depth 0..1 */
  phraseDepth?: number;
  /** Grit / saturation × load 0..1 */
  grit?: number;
  /** Short cabin body 0..1 */
  body?: number;
  /** Wet vs dry crossfade 0..1 (dry-leaning default) */
  wetDry?: number;
  /** Subtle L/R twin motor delay 0..1 */
  stereoTwin?: number;
  /** Motor+howl spool inertia 0..1 */
  spoolLag?: number;
  /** Air / slipstream alias for wetHiss */
  air?: number;
  /** Ion spark alias for afterburn */
  ionSpark?: number;
  /** Ion hum alias for hum */
  ionHum?: number;
  // Ion Twin layer enables (0=off, 1=on) — combinable configs
  /** Twin motor bed enable 0|1 */
  motorEnable?: number;
  /** Formant howl (ref-A/F) enable 0|1 */
  howlEnable?: number;
  /** Howl mix alias (maps onto formantHowl) 0..1 */
  howlMix?: number;
  /** Brighter scream burst (ref-C) enable 0|1 */
  screamEnable?: number;
  /** Scream burst mix 0..1 */
  screamMix?: number;
  /** Scream brightness / CF lift 0..1 */
  screamBright?: number;
  /** Rising CF surge gesture (ref-D) enable 0|1 */
  surgeEnable?: number;
  /** Surge gesture mix 0..1 */
  surgeMix?: number;
  /** Air / wet swoosh enable 0|1 */
  airEnable?: number;
  /** Air mix alias (maps onto wetHiss/air) 0..1 */
  airMix?: number;
  /** Grit bus enable 0|1 */
  gritEnable?: number;
  /** Grit mix alias 0..1 */
  gritMix?: number;
  // EV
  whinePitch?: number;
  gearSteps?: number;
  inverterBuzz?: number;
  // Aerospace / jet (organic 4-bus)
  /** Spool / blade-pass reference Hz */
  spoolPitch?: number;
  /** Mild compressor whine under noise 0..1 */
  intakeWhine?: number;
  /** Spool / compressor noise bed 0..1 */
  compressor?: number;
  /** Core mid/low roar level 0..1 (param id kept as turbine) */
  turbine?: number;
  /** Exhaust low roar 0..1 */
  jetRoar?: number;
  /** Nozzle hiss / thin AB hiss 0..1 (was jet scream) */
  jetScream?: number;
  /** Idle spool presence at speed≈0 0..1 */
  idleSpool?: number;
  /** Spool inertia / lag behind throttle 0..1 */
  spoolInertia?: number;
  /** Airframe buffet / rumble 0..1 */
  airframe?: number;
  // EV extras
  /** Gear mesh / mechanical grit 0..1 */
  gearMesh?: number;
  /** Regen / decel whistle bloom 0..1 */
  regenHowl?: number;
  /** Dual-motor L/R beat amount 0..1 */
  dualBeat?: number;
  /** Dense mid motor roar (EV) 0..1 */
  motorRoar?: number;
  [paramId: string]: number | string | undefined;
}

export type SynthNodeType =
  | 'EngineInput'
  | 'Output'
  | 'osc'
  | 'noise'
  | 'gain'
  | 'biquad'
  | 'waveshaper'
  | 'delay'
  | 'panner'
  | 'merge'
  | 'split'
  | 'constant'
  | 'PulseTrain'
  | 'ExhaustWaveguide'
  | 'IntakeNoise'
  | 'Mechanical'
  | 'FormantHowl'
  | 'WetRoadNoise'
  | 'TurbineSpool'
  | 'IntakeWhine'
  | 'Afterburner'
  | 'CompressorStage'
  | 'Filter'
  | 'Gain'
  | 'Mix'
  | 'Osc'
  | 'Noise';

export interface SynthNodeDesc {
  id: string;
  type: SynthNodeType;
  params: Record<string, number | string>;
  outs: Array<{ to: string; input?: number | string }>;
  /** Builder canvas position */
  x?: number;
  y?: number;
}

export interface SoundLayer {id:string;name:string;patch:EnginePatch;level:number;pitch:number;pan:number;depth?:number;cutoff:number;response:"load"|"rpm"|"steady";muted:boolean;solo:boolean;}
/** Ion Twin procedural layer config (enable + gain + character) for save/combine. */
export interface IonTwinLayerConfig {
  id: string;
  name: string;
  /** When false, layer contributes silence regardless of mix. */
  enabled: boolean;
  /** Layer bus gain 0..1 */
  gain: number;
  /** Optional character knobs merged into EngineParams when applied */
  params?: Record<string, number>;
}

export interface EnginePatch {
  version: 0;
  id: EngineId;
  name: string;
  kind: EngineKind;
  topology: TopologyId;
  params: Record<string, number | string>;
  graph?: SynthNodeDesc[];
  /** Optional stackable layers (Sound Lab / character stacks) */
  layers?: SoundLayer[];
  /** Ion Twin bus configs (motor/howl/scream/surge/air/grit) for save/combine */
  ionLayers?: IonTwinLayerConfig[];
  /** Native RevForge parameters; persisted with custom presets. */
  revforge?: RevForgeVoiceConfig;
  meta?: { author?: string; createdAt?: string; tags?: string[]; blurb?: string };
}

export interface EngineSynth {
  readonly id: EngineId;
  readonly context: AudioContext;
  readonly output: GainNode;

  start(): Promise<void>;
  stop(): void;
  dispose(): void;

  setDriving(d: DrivingInput): void;
  setParams(p: Partial<EngineParams>): void;
  getParams(): EngineParams;

  toPatch(): EnginePatch;
  fromPatch(patch: EnginePatch): void;

  /** Map builder node graph onto live params (v1). */
  applyGraphToParams?(graph: SynthNodeDesc[]): void;

  /** Derived HUD values for gauges (+ optional driveMood commentary hint) */
  getHud(): {
    rpmNorm: number;
    loadFeel: number;
    fundamentalHz: number;
    rpm?: number;
    driveMood?: string;
    /** Ion Twin lock ladder; always 'none' for non-scifi packs */
    lockStage?: LockStage;
  };

  /** Ion Twin lock ladder stage from rpmNorm + hysteresis; 'none' for other packs. */
  getLockStage(): LockStage;

  /** Optional lock-confirm chirp; default false. Frontend owns UI prefs; this API is the audio gate. */
  setLockSfxEnabled(enabled: boolean): void;
  getLockSfxEnabled(): boolean;

  /**
   * Soft-cue: optional callback on lock-stage change (Frontend may instead poll getHud().lockStage).
   */
  onLockStageChange?: (stage: LockStage) => void;

  /**
   * Soft UI cue (Frontend-driven). Does not alter setDriving.
   * - 'upshift': short procedural mechanical bark (gated by setUpshiftSfxEnabled)
   * - 'starter' | 'ignition': per-engine Ignition one-shot from active pack params
   * - 'shutdown' | 'shutoff': per-engine Shutdown one-shot (call before stop() for full tail)
   */
  triggerUiCue?(cue: 'upshift' | 'starter' | 'shutdown' | 'shutoff' | string): void;

  /** Procedural Ignition starter from active pack (alias of triggerUiCue('starter')). */
  playStarter?(): void;

  /** Procedural Shutdown shutoff from active pack (alias of triggerUiCue('shutdown')). */
  playShutoff?(): void;

  /** Optional MANUAL upshift bark; default false. Persists to localStorage `ds-upshift-sfx`. */
  setUpshiftSfxEnabled(enabled: boolean): void;
  getUpshiftSfxEnabled(): boolean;

  /** Frontend /diag snapshot — field names stable for iceMode consumers */
  getDiag(): EngineDiag;

  /** Audio Physics ICE bridge snapshot (optional). */
  getEngineState?(): EngineStateSnapshot;

  /** QA / pack: set firingMask (bit SET = disabled). */
  setFiringMask?(mask: number): void;

  /** QA §2.5 drop-cylinder: disable slot (sets bit). */
  dropCylinder?(slot: number): void;

  /** 0..1 post-gain loudness envelope (per-frame poll; HUD voice box / power ladder). */
  getEnvelope?(): number;
  /** Alias of getEnvelope(). */
  getVoiceEnvelope?(): number;
  /** Night Pursuit: soft original electronic tick at a scanner sweep edge (level = params.scannerTick). */
  scannerTick?(edge: ScannerEdge): void;
  /** Night Pursuit: PURSUIT seasoning 0..1 (PURSUIT 1 · POWER 0.5 · AUTO/NORM 0). */
  setPursuitBoost?(amount: number): void;
}

export interface ParamMeta {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  kind?: 'slider' | 'segmented';
  options?: number[];
  /** Pro Builder group label (Ion Twin layers, etc.) */
  group?: string;
}
