import type { DrivingInput, EngineParams } from './types';

export declare const QC_SPEED_FULL_KPH: number;
export declare const QC_LOW_HUM_FADE_KPH: number;
export declare const QC_LOWPASS_HZ: number;
export declare const QC_CARRIER_STEP: number;
export declare const QC_STEEL_MODES: number[];
export declare const QC_POWER_ON_SECONDS: number;
export declare const QC_POWER_OFF_SECONDS: number;

export interface QuietCurrentDriveState {
  time: number;
  m: number;
  m1: number;
  speed: number;
  thr: number;
  regen: number;
  rev: number;
  cyber: number;
  boost: number;
  stepIdx: number;
  stepHz: number;
  glide: number;
  prevThr: number;
}

export interface QuietCurrentDrive {
  /** All smoothed values reached their targets (no further steps needed). */
  settled: boolean;
  m: number;
  speed: number;
  kph: number;
  presence: number;
  regen: number;
  glide: number;
  reverse: number;
  cyber: number;
  boost: number;
  ratio: number;
  motorHz: number;
  inverterHz: number;
  stepAmt: number;
  lowHum: number;
  mesh: number;
}

type Params = Partial<EngineParams> & Record<string, unknown>;

export declare function quietCurrentCyberAmount(v: 'standard' | 'cyber' | number | null | undefined): number;
export declare function qcMotorHz(m: number): number;
export declare function qcInverterHz(m: number): number;
export declare function createQuietCurrentDriveState(): QuietCurrentDriveState;
export declare function stepQuietCurrentDrive(
  state: QuietCurrentDriveState,
  input: DrivingInput,
  dt: number,
  params?: Params,
): QuietCurrentDrive;
export declare function setQuietCurrentOfflineScheduling(on: boolean): void;

export declare class QuietCurrentBus {
  constructor(ctx: BaseAudioContext, dest: AudioNode);
  readonly out: GainNode;
  start(): void;
  update(params: Params, drive: QuietCurrentDrive, tc?: number): void;
  dispose(): void;
}

export declare function playQuietCurrentPowerOn(ctx: BaseAudioContext, dest: AudioNode, params?: Params): number;
export declare function playQuietCurrentPowerOff(ctx: BaseAudioContext, dest: AudioNode, params?: Params): number;
