import type { RevForgeVoiceConfig } from '../forge/voiceTypes';
import type { ChronoCoupeId } from './chronoCoupePack';
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
  | ChronoCoupeId
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
  /** Tomcat: lit afterburner zone 0..5 (0 = off), read-only — same state that drives the AB sound. */
  getAfterburnerZone?(): number;
  /** Tomcat: subscribe to afterburner zone changes; returns an unsubscribe function. */
  onAfterburnerZoneChange?(cb: (zone: number) => void): () => void;
  /** Tomcat: arm / disarm the afterburner (Frontend switch). Default armed; no-op on other packs. */
  setAfterburnerArmed?(armed: boolean): void;
  /** Tomcat: whether the afterburner is armed (default true). true on other packs. */
  getAfterburnerArmed?(): boolean;
  /**
   * Tomcat cold start (opt-in, default OFF — when off the quick Start is unchanged). While on,
   * start() only unlocks audio: the engines stay dark until switched on with setJetSystem.
   */
  setJetColdStart?(enabled: boolean): void;
  getJetColdStart?(): boolean;
  /** Which recommended sequence jetAutoStart() runs (default 'apu'). Does not gate anything. */
  setJetStartMode?(mode: JetStartMode): void;
  getJetStartMode?(): JetStartMode;
  /**
   * Permissive: does exactly what it is called with (any order, no interlocks) and returns true
   * while cold start is on (false: cold start off / other pack / unknown id). Plays the switch
   * foley on a change (default per JET_DEFAULT_FOLEY; opts.foley overrides, false = silent).
   */
  setJetSystem?(system: JetSystem, on: boolean, opts?: { foley?: JetSwitchFoley | false }): boolean;
  getJetSystems?(): JetSystemsState;
  /** Switch sound (setJetSystem foley) on / off; default true. System sounds keep playing. */
  setJetSwitchSound?(enabled: boolean): void;
  getJetSwitchSound?(): boolean;
  /** Panel description (labels, groups, kinds, advisory requires, order). */
  getJetSystemList?(variant?: JetVariant): JetSystemEntry[];
  /** Our own short plain-words startup / shutdown checklist. */
  getJetChecklist?(variant?: JetVariant): JetChecklist;
  /** Fires on every switch change and engine phase change; returns an unsubscribe function. */
  onJetSystemChange?(cb: (state: JetSystemsState, change: JetSystemChange) => void): () => void;
  /** PULL: handle foley + short warning tone, then fuel cut / everything off and spools down. */
  jetEmergencyStop?(): boolean;
  /** Runs the recommended sequence for `mode` (default getJetStartMode()). */
  jetAutoStart?(mode?: JetStartMode): boolean;
  /** Convenience: BATT → L ENG → R ENG straight away (no APU / cart). */
  jetQuickStart?(): boolean;
  /** One-shot switch foley / cue (works on the Tomcat pack with cold start on or off). */
  playJetCue?(cue: JetCue, opts?: { pan?: number; level?: number }): boolean;
  /** Tomcat flight phase from Frontend's detector (null = no shaping, compat). Shapes thrust; gear info runs gear cues. */
  setFlightPhase?(phase: JetFlightPhase | null, info?: JetFlightInfo): void;
  getFlightPhase?(): JetFlightPhase | null;
  /** Frontend's afterburnerLit: while true and armed, the afterburner is live at any speed. */
  setAfterburnerLaunch?(lit: boolean): void;
  getAfterburnerLaunch?(): boolean;
  /** Callout: voice (speechSynthesis) / tone / mechanical (gear); per-id cooldown, never stacked. */
  playFlightCallout?(id: JetCalloutId): JetCalloutResult;
  /** String: 'voice' (warnings speak, cautions tone unless setCautionVoice(true)) | 'tone' | 'off'; or per level. */
  setCalloutMode?(mode: JetCalloutMode | Partial<JetCalloutModes>): void;
  getCalloutMode?(): JetCalloutModes;
  setCautionVoice?(on: boolean): void;
  /** Speed callouts (overspeedCaution / overspeedWarning). Default off — mirror Frontend's highSpeedCallouts. */
  setHighSpeedCallouts?(on: boolean): void;
  getHighSpeedCallouts?(): boolean;
  getCautionVoice?(): boolean;
  /** Original alert tone; 'note' is a silent no-op (returns false). */
  playAlertTone?(level: JetAlertLevel): boolean;
  getAudioSpeedConfig?(): AudioSpeedConfig;
  setAudioSpeedConfig?(partial: Partial<AudioSpeedConfig>): AudioSpeedConfig;
  /** Optional cabin low-pass hint (Hz) for the CharacterEngine wrapper; undefined = default mapping. */
  getAcousticCutoffHint?(): number | undefined;
  /** Night Pursuit: soft original electronic tick at a scanner sweep edge (level = params.scannerTick). */
  scannerTick?(edge: ScannerEdge): void;
  /** Night Pursuit: PURSUIT seasoning 0..1 (PURSUIT 1 · POWER 0.5 · AUTO/NORM 0). */
  setPursuitBoost?(amount: number): void;
  /** Chrono Coupe: 0..1 charge level (speed ÷ jump threshold). Safe no-op on other packs / stopped. */
  setChargeLevel?(level: number): void;
  /** Chrono Coupe: one-shot discharge (rate-limited). Safe no-op on other packs / stopped. */
  triggerDischarge?(): void;
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

/* ── Tomcat cold start (see docs/cj-cold-start.md) ── */
/** Switchable systems: battery, seat-belt sign, APU, external ground air cart, crossbleed valve, engines. */
export type JetSystem =
  | 'batt'
  | 'seatbelt'
  | 'apu'
  | 'aircart'
  | 'crossbleed'
  | 'engL'
  | 'engR'
  | 'fuelPumpL'
  | 'fuelPumpR'
  | 'ignL'
  | 'ignR'
  /** true = idle, false = cutoff */
  | 'throttleL'
  | 'throttleR'
  | 'avionics'
  | 'anticollision'
  | 'navLights'
  | 'hydraulics'
  /** true = closed */
  | 'canopy'
  | 'oxygen'
  | 'inertialNav'
  /** momentary (fires on true, state stays false) */
  | 'masterCaution'
  | 'quickStartGuard'
  /** momentary; runs jetQuickStart only while quickStartGuard is open */
  | 'quickStart'
  /** momentary; same as jetEmergencyStop() */
  | 'emergencyStop';
/** getJetSystemList / getJetChecklist variant ('groundcart' accepted as an alias of 'aircart'). */
export type JetVariant = 'apu' | 'aircart' | 'groundcart';
export interface JetSystemEntry {
  id: JetSystem;
  /** Neutral panel label. */
  label: string;
  group: 'POWER' | 'FUEL' | 'ENGINES' | 'SYSTEMS' | 'LIGHTS';
  kind: 'toggle' | 'guarded' | 'hold' | 'pull';
  /** Advisory only — the audio layer never refuses a call. */
  requires: string[];
  side?: 'L' | 'R';
  /** 1-based startup order on the panel. */
  order: number;
  /** Part of the minimum start. */
  required: boolean;
}
export interface JetChecklist {
  startup: string[];
  shutdown: string[];
}
/** Recommended start sequence for jetAutoStart. */
export type JetStartMode = 'apu' | 'groundcart';
/** Switch foley kinds. */
export type JetSwitchFoley = 'toggle' | 'guardOpen' | 'guardClose' | 'hold' | 'pull' | 'detent';
/** playJetCue cues: switch foley + afterburner guard cover + chime + warning tone. */
export type JetCue =
  | JetSwitchFoley
  | 'abGuardOpen'
  | 'abGuardClose'
  | 'chime'
  | 'warning'
  /** cockpit display config menu (bezel buttons) */
  | 'bezelPress'
  | 'cursorStep'
  | 'selectConfirm'
  | 'pageChange'
  | 'pamphletLift'
  | 'pamphletOpen'
  | 'pamphletClose';
/** Engine phase in cold start. */
export type JetEnginePhase = 'off' | 'starting' | 'run' | 'shutdown';
export interface JetSystemsState extends Record<JetSystem, boolean> {
  coldStart: boolean;
  mode: JetStartMode;
  engines: { L: JetEnginePhase; R: JetEnginePhase };
  /** APU spool 0..1 / ready (≥ 95 %). */
  apuSpool: number;
  apuReady: boolean;
  /** Air cart spool 0..1 / ready. */
  cartSpool: number;
  cartReady: boolean;
  /** jetAutoStart / jetQuickStart sequence in progress. */
  autoRunning: boolean;
  /** Emergency stop pending (warning tone playing, fuel cut follows). */
  emergency: boolean;
  /** Hydraulic pressure 0..1 (engine-driven). */
  hydPressure: number;
  /** setJetSwitchSound state. */
  switchSound: boolean;
}
export interface JetSystemChange {
  /** null for mode / reset changes. */
  system: JetSystem | null;
  on: boolean;
  source: 'api' | 'auto' | 'emergency' | 'engine' | 'mode' | 'stop' | 'shutdown';
}

/* ── Tomcat flight phases (Frontend detects; audio consumes) — see docs/cj-cold-start.md ── */
/** Frontend's regime strings, unchanged. 'TOUCH_AND_GO' is an optional extra (fast re-spool). */
export type JetFlightPhase = 'TAXI' | 'TAKEOFF_ROLL' | 'AIRBORNE' | 'APPROACH' | 'ROLLOUT' | 'TOUCH_AND_GO';
export interface JetFlightInfo {
  /** Gear position. A transition INTO 'up' / 'down' plays the gearUp / gearDown cue; 'transit' plays nothing. */
  gear?: 'down' | 'up' | 'transit';
  /** Frontend's hard-launch flag: while true and armed the AB is live (adds to afterburnerLit, never clears it). */
  launch?: boolean;
}
/** 'touchAndGo' / 'goAround' / 'launch' are accepted as a harmless no-op (touch-and-go / go-around / launch have no callout). */
export type JetCalloutId = 'abUnarmed' | 'overspeedCaution' | 'overspeedWarning' | 'gpsFail' | 'gearUp' | 'gearDown' | 'touchAndGo' | 'goAround' | 'launch';
export type JetCalloutMode = 'voice' | 'tone' | 'off';
export interface JetCalloutModes {
  warning: JetCalloutMode;
  caution: JetCalloutMode;
}
/** 'note' is silent (kept for the API); caution / warning have original tones. */
export type JetAlertLevel = 'note' | 'caution' | 'warning';
export type JetCalloutResult = 'voice' | 'tone' | 'mechanical' | 'suppressed';
export interface AudioSpeedConfig {
  /** AB auto-engage (armed) at ≥ this speed; default 80. */
  abEngageMph: number;
  /** …and out again below this; default 77. */
  abDisengageMph: number;
}
