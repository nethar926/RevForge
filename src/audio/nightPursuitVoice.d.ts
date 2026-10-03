import type { EngineParams, DrivingInput } from './types';
export const NP_GEAR_RATIOS: number[];
export const NP_FINAL_DRIVE: number;
export const NP_TIRE_CIRC_M: number;
export const NP_SPEED_FULL_MPH: number;
export const NP_STALL_RPM: number;
export const NP_STARTER_SECONDS: number;
export const NP_SHUTOFF_SECONDS: number;
export interface NightPursuitDriveState {
  rpm: number;
  gear: number;
  overrun: number;
  spool: number;
  blowoff: number;
  loadRich: number;
  modelled: boolean;
  [k: string]: number | boolean;
}
export interface NightPursuitDrive {
  rpm: number;
  rpmNorm: number;
  gear: number;
  overrun: number;
  spool: number;
  blowoff: number;
  loadRich: number;
  modelled: boolean;
}
export interface NightPursuitWorkletTargets {
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
export function npIdleRpm(params: Partial<EngineParams>): number;
export function npRedlineRpm(params: Partial<EngineParams>): number;
export function createNightPursuitDriveState(idleRpm?: number): NightPursuitDriveState;
export function stepNightPursuitDrive(
  state: NightPursuitDriveState,
  input: DrivingInput,
  dt: number,
  params?: Partial<EngineParams>,
): NightPursuitDrive;
export function nightPursuitWorkletTargets(
  params: Partial<EngineParams>,
  drive: NightPursuitDrive,
  thr: number,
  base?: { growl?: number; intake?: number; mufflerMix?: number; exhaustFeedback?: number },
): NightPursuitWorkletTargets;
export function setNightPursuitOfflineScheduling(on: boolean): void;
export class NightPursuitBus {
  constructor(ctx: BaseAudioContext, dest: AudioNode);
  readonly input: GainNode;
  readonly pink: AudioBuffer;
  readonly white: AudioBuffer;
  start(): void;
  update(params: Partial<EngineParams>, drive: NightPursuitDrive, thr: number, tc?: number): void;
  scannerTick(level?: number, pan?: number): void;
  dispose(): void;
}
export function playNightPursuitStarter(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: Partial<EngineParams>,
  whiteBuf: AudioBuffer,
  pinkBuf: AudioBuffer,
): number;
export function playNightPursuitShutoff(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: Partial<EngineParams>,
  whiteBuf: AudioBuffer,
  pinkBuf: AudioBuffer,
): number;
export function nightPursuitBoostForMode(mode: string): number;
