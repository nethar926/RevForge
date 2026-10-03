import type { DrivingInput, EngineParams } from './types';

export interface StellarHelmDriveState {
  speed: number;
  thr: number;
  rev: number;
  boost: number;
  time: number;
}
export interface StellarHelmDrive {
  speed: number;
  /** Shaped drive amount 0..1: s·(1.5 − 0.5·s) of the lagged speed. */
  x: number;
  thr: number;
  rev: number;
  boost: number;
}
export interface StellarHelmTargets {
  coreHz: number;
  subHz: number;
  beatHz: number;
  cutoff: number;
  coreGain: number;
  powerGain: number;
  shelfDb: number;
  subGain: number;
  shimmerGain: number;
  shimmerHz: number;
  glassGain: number;
  breathRate: number;
  breathDepth: number;
  level: number;
}
export function createStellarHelmDriveState(): StellarHelmDriveState;
export function stepStellarHelmDrive(
  state: StellarHelmDriveState,
  input: Partial<DrivingInput>,
  dt: number,
  params?: Partial<EngineParams>,
): StellarHelmDrive;
export function stellarHelmTargets(params: Partial<EngineParams> | undefined, drv: Partial<StellarHelmDrive>): StellarHelmTargets;
export function setStellarHelmOfflineScheduling(on: boolean): void;

export class StellarHelmVoice {
  constructor(ctx: BaseAudioContext, dest: AudioNode, opts?: { noiseBuffer?: AudioBuffer });
  readonly powerTarget: number;
  coreHz(): number;
  update(params: Partial<EngineParams>, drv: StellarHelmDrive, tc?: number, when?: number): void;
  powerUp(dur?: number, when?: number, from?: number): void;
  powerDown(dur?: number, when?: number): void;
  dispose(): void;
}

export const SH_STARTER_SECONDS: number;
export const SH_SHUTOFF_SECONDS: number;
export function playStellarHelmStarter(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: Partial<EngineParams> | undefined,
  noiseBuf: AudioBuffer | null | undefined,
  settleHz?: number,
  /** Start time (ctx seconds); default now. */
  when?: number,
): number;
export function playStellarHelmShutoff(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params: Partial<EngineParams> | undefined,
  noiseBuf: AudioBuffer | null | undefined,
  fromHz?: number,
  /** Start time (ctx seconds); default now. */
  when?: number,
): number;
