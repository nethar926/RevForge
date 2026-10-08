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
  /** Lit afterburner zone 0..5 (0 = off). */
  abZone: number;
  abTimer: number;
  abLevel: number;
  stallCooldown: number;
  prevSpool: number;
  rate: number;
}
export type TomcatEvent =
  | { type: 'lightoff'; engine: number }
  | { type: 'igniter'; engine: number }
  | { type: 'abLight'; zone: number }
  | { type: 'abDestage'; zone: number }
  | { type: 'stall'; amount: number };
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
  abEngaged: boolean;
  abZone: number;
  abTarget: number;
  abLevel: number;
  rate: number;
  events: TomcatEvent[];
  settled: boolean;
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
export function tomcatAbEngaged(speed: number, engaged: boolean): boolean;
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
