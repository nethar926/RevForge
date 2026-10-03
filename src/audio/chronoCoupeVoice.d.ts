import type { EngineParams } from './types';

export const CC_GEAR_RATIOS: number[];
export const CC_FINAL_DRIVE: number;
export const CC_TIRE_CIRC_M: number;
export const CC_SPEED_FULL_MPH: number;
export const CC_DISCHARGE_COOLDOWN_S: number;
export const CC_DISCHARGE_SECONDS: number;
export const CC_STARTER_SECONDS: number;
export const CC_SHUTOFF_SECONDS: number;

export interface ChronoCoupeDriveState {
  rpm: number;
  gear: number;
  lastShiftAt: number;
  time: number;
  thrSlow: number;
  prevThr: number;
  overrun: number;
  breath: number;
  modelled: boolean;
}

export interface ChronoCoupeDrive {
  rpm: number;
  rpmNorm: number;
  gear: number;
  overrun: number;
  breath: number;
  shifting: boolean;
  modelled: boolean;
}

export interface ChronoCoupeDriveInput {
  speed: number;
  throttle: number;
  load?: number;
  rpm?: number;
  rpmNorm?: number;
  overrun?: boolean | number;
}

export interface ChronoCoupeWorkletTargets {
  firingFamily: number;
  camLope: number;
  bankSplit: number;
  overrun: number;
  overrunBurble: number;
  dcGuard: number;
  growl: number;
  intake: number;
  mufflerMix: number;
  exhaustFeedback: number;
  collectorDelayMs: number;
}

export function ccIdleRpm(params: Partial<EngineParams>): number;
export function ccRedlineRpm(params: Partial<EngineParams>): number;
export function createChronoCoupeDriveState(idleRpm?: number): ChronoCoupeDriveState;
export function stepChronoCoupeDrive(
  state: ChronoCoupeDriveState,
  input: ChronoCoupeDriveInput,
  dt: number,
  params?: Partial<EngineParams>,
): ChronoCoupeDrive;
export function chronoCoupeWorkletTargets(
  params: Partial<EngineParams>,
  drive: ChronoCoupeDrive,
  thr: number,
  base?: Partial<Record<'growl' | 'intake' | 'mufflerMix' | 'exhaustFeedback', number>>,
): ChronoCoupeWorkletTargets;
export function chronoCoupeChargeIntensity(params: Partial<EngineParams>): number;
export function setChronoCoupeOfflineScheduling(on: boolean): void;
export class ChronoCoupeBus {
  constructor(ctx: BaseAudioContext, dest: AudioNode);
  readonly input: GainNode;
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  chargeSmooth: number;
  setCharge(level: number): void;
  update(params: Partial<EngineParams>, drive: ChronoCoupeDrive, thr: number, tc?: number): void;
  updateCharge(params: Partial<EngineParams>, t?: number, tc?: number): void;
  discharge(params: Partial<EngineParams>): boolean;
  dispose(): void;
}
export function playChronoCoupeStarter(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: Partial<EngineParams>,
  whiteBuf: AudioBuffer,
  pinkBuf: AudioBuffer,
): number;
export function playChronoCoupeShutoff(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: Partial<EngineParams>,
  whiteBuf: AudioBuffer,
  pinkBuf: AudioBuffer,
): number;
