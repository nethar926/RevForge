import type { DrivingInput, EngineParams } from './types';

export type TomcatPhase = 'off' | 'starting' | 'run' | 'shutdown';

export interface TomcatEngineState {
  n2: number;
  n1: number;
  comb: number;
  lit: boolean;
  litAt: number;
  starter: number;
  wander: number;
  nextTick: number;
  /** Cold start only (absent otherwise): this engine's own phase / phase time / next igniter tick. */
  cold?: TomcatPhase;
  coldT?: number;
  coldTick?: number;
  /** Cold start light-off gates (undefined = not gated). */
  coldFuel?: boolean;
  coldIgn?: boolean;
}
export interface TomcatDriveState {
  phase: TomcatPhase;
  time: number;
  phaseTime: number;
  a: TomcatEngineState;
  b: TomcatEngineState;
  speed: number;
  thrCmd: number;
  abDemand: number;
  /** Speed engage state (on at ≥ 75 mph, off below 72 mph). */
  abEngaged: boolean;
  /** Frontend arm switch; default true. */
  abArmed: boolean;
  /** Frontend launch flag (absent = false). */
  abLaunch?: boolean;
  /** Normalised AB engage / disengage speeds (absent = 80 / 77 mph defaults). */
  abOnSpeed?: number;
  abOffSpeed?: number;
  /** Lit afterburner zone 0..5 (0 = off). */
  abZone: number;
  abTimer: number;
  abLevel: number;
  stallCooldown: number;
  prevSpool: number;
  rate: number;
  /** Cold start (per-engine control) — absent by default. */
  cold?: boolean;
}
export type TomcatEvent =
  | { type: 'lightoff'; engine: number }
  | { type: 'igniter'; engine: number }
  | { type: 'abLight'; zone: number }
  | { type: 'abDestage'; zone: number }
  | { type: 'stall'; amount: number }
  /** Cold start only: engine reached idle / finished its rundown. */
  | { type: 'engineRun'; engine: number }
  | { type: 'engineOff'; engine: number };
export interface TomcatDrive {
  phase: TomcatPhase;
  n2a: number;
  n2b: number;
  n1a: number;
  n1b: number;
  combA: number;
  combB: number;
  starterA: number;
  starterB: number;
  sA: number;
  sB: number;
  /** Mean spool 0 (ground idle) … 1 (military). */
  spool: number;
  n1: number;
  idleN1: number;
  speed: number;
  thr: number;
  demand: number;
  abArmed: boolean;
  abEngaged: boolean;
  abZone: number;
  abTarget: number;
  abLevel: number;
  rate: number;
  events: TomcatEvent[];
  settled: boolean;
  /** Cold start only. */
  cold?: boolean;
  coldA?: TomcatPhase;
  coldB?: TomcatPhase;
}

export const TC_IDLE_N2: number;
export const TC_MIL_THROTTLE: number;
export const TC_SPEED_FULL_MPH: number;
export const TC_AB_ENGAGE_MPH: number;
export const TC_AB_DISENGAGE_MPH: number;
export const TC_AB_ENGAGE_SPEED: number;
export const TC_AB_DISENGAGE_SPEED: number;
export const TC_AB_ZONE_ON: readonly number[];
export const TC_AB_HYSTERESIS: number;
export const TC_AB_ZONE_LEVEL: readonly number[];
export const TC_AB_FIRST_DELAY: number;
export const TC_AB_ZONE_DELAY: number;
export const TC_AB_DESTAGE_DELAY: number;
export const TC_AB_LIGHT_SPOOL: number;
export const TC_AB_HOLD_SPOOL: number;
export const TC_ENGINE_B_START_OFFSET: number;
export const TC_STARTER_SECONDS: number;
export const TC_SHUTOFF_SECONDS: number;
export const TC_N2_HZ: number;
export const TC_N1_HZ: number;
export const TC_RATIOS: Readonly<Record<'comp1' | 'comp1h' | 'comp2' | 'fan' | 'gear' | 'mesh', number>>;
export const TC_OUT_TRIM: number;

export function createTomcatDriveState(phase?: TomcatPhase): TomcatDriveState;
export function tomcatN1FromN2(n2: number): number;
export function tomcatSpoolNorm(n2: number): number;
export function tomcatSetRunning(s: TomcatDriveState): void;
export function tomcatBeginStart(s: TomcatDriveState): boolean;
export function tomcatBeginShutdown(s: TomcatDriveState): boolean;
export function tomcatAbDemand(input: Partial<DrivingInput> | null | undefined): number;
export function tomcatAbEngaged(speed: number, engaged: boolean, on?: number, off?: number): boolean;
export const TC_AB_LEGACY_MPH: Readonly<{ abEngageMph: number; abDisengageMph: number }>;
/** Per-state AB engage / disengage speeds (mph). Returns the applied pair. */
export function tomcatSetAbSpeeds(state: TomcatDriveState, engageMph?: number, disengageMph?: number): { abEngageMph: number; abDisengageMph: number };
/** Frontend launch flag (AB engaged at any speed while armed). Returns true on a change. */
export function tomcatSetAfterburnerLaunch(state: TomcatDriveState, launch: boolean): boolean;
export const TC_LAUNCH_ON_MPHS: number;
export const TC_LAUNCH_OFF_MPHS: number;
export const TC_LAUNCH_HOLD_S: number;
export const TC_LAUNCH_DROP_S: number;
export const TC_LAUNCH_WINDOW_S: number;
export interface LaunchDetector { t: number; hist: [number, number][]; on: boolean; holdFrom: number; dropFrom: number; accel: number; }
export function createLaunchDetector(): LaunchDetector;
export function resetLaunchDetector(det: LaunchDetector): void;
/** GPS-speed carrier-launch detector step; returns whether a launch is active. */
export function stepLaunchDetector(det: LaunchDetector, speedNorm: number, nowS: number): boolean;
export const TC_FLIGHT_PHASES: readonly ('TAXI' | 'TAKEOFF_ROLL' | 'AIRBORNE' | 'APPROACH' | 'ROLLOUT' | 'TOUCH_AND_GO')[];
export const TC_PHASE_SHAPE: Readonly<{ taxiMax: number; cruiseBase: number; cruiseSpan: number; approachMax: number; rolloutMax: number }>;
export function tomcatPhaseInput(phase: string | null | undefined, input: Partial<DrivingInput>): { input: Partial<DrivingInput>; fast: boolean };
/** Arm / disarm AB. Returns true when the value changed. Same-value calls are no-ops. */
export function tomcatSetAfterburnerArmed(state: TomcatDriveState, armed: boolean): boolean;
/** Heavy-bass lift (full power + afterburner): sub layer gains, low-pass corners, saturator drive. */
export const TC_HEAVY: {
  readonly sub: number;
  readonly abSub: number;
  readonly subHz: number;
  readonly subHzAb: number;
  readonly drive: number;
  readonly sat: number;
  readonly glide: number;
};
/** Spool gate for the heavy bass: 0 up to spool 0.75, 1 at military. */
export function tomcatHeavyGate(spool: number): number;
/** Odd-symmetric soft-saturation curve of the heavy sub. */
export function tomcatHeavyCurve(n?: number, sat?: number): Float32Array;
export function tomcatZoneTarget(demand: number, zone: number, spool: number): number;
export function tomcatTimeScale(params?: Partial<EngineParams>): number;
/** Cold-start spool constants (crank, igniters, light-off → idle). */
export const TC_COLD: Readonly<{ crankTc: number; crankTo: number; igniteN2: number; tickEvery: number; tickAfterLit: number; accelScale: number; rundownTc: number; soloTrim: number }>;
/** Enter / leave per-engine cold-start control. Returns true when the mode changed. */
export function tomcatSetColdMode(state: TomcatDriveState, on: boolean): boolean;
/** Cold mode: fuel on (start) / fuel cut (rundown) for engine 0 (left) / 1 (right). */
/** Cold mode light-off gates (throttle at idle / igniters armed); undefined = not gated. */
export function tomcatColdGate(state: TomcatDriveState, engine: 0 | 1, gate: { fuel?: boolean; ign?: boolean }): void;
export function tomcatColdEngine(state: TomcatDriveState, engine: 0 | 1, on: boolean): boolean;
export function stepTomcatDrive(
  state: TomcatDriveState,
  input: Partial<DrivingInput>,
  dt: number,
  params?: Partial<EngineParams>,
): TomcatDrive;
export function tomcatLayerGains(params?: Partial<EngineParams>): Record<
  'idle' | 'whine' | 'fan' | 'roar' | 'rumble' | 'ab' | 'crackle' | 'mech' | 'ram' | 'starter',
  number
>;
export function tomcatTargets(params: Partial<EngineParams> | undefined, drv: Partial<TomcatDrive>): Record<string, any>;

export class TomcatVoice {
  constructor(ctx: BaseAudioContext, dest: AudioNode, opts?: { whiteBuf?: AudioBuffer; pinkBuf?: AudioBuffer });
  shaftHz(): number;
  update(params: Partial<EngineParams>, drv: TomcatDrive, tc?: number, when?: number): void;
  dispose(): void;
}

/** Wind / air-rush trims (1 = the ef4021e mix). */
export const TC_AIR: Readonly<{ ramWind: number; ramBuffet: number; hot: number; bed: number; bedLpHz: number; bodyLpHz: number }>;
