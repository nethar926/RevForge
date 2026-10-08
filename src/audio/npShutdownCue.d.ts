import type { EngineParams } from './types';

export const NP_SHUTDOWN_BANKS: number[];
export const NP_SHUTDOWN_FIRE_S: number;
export const NP_SHUTDOWN_TAIL_S: number;
export const NP_SHUTDOWN_LEVEL: number;
export function npRundownSeconds(r0: number, idle?: number): number;
export function npShutdownSeconds(r0: number, idle?: number): number;
export function npRundownRpm(t: number, r0: number, T: number): number;

export interface NpShutdownEvent {
  t: number;
  kind: 'fire' | 'pulse';
  bank: number;
  amp: number;
}
export interface NpShutdownRender {
  data: Float32Array;
  events: NpShutdownEvent[];
  stopAt: number;
  shudderAt: number;
  duration: number;
  rundown: number;
}
export function renderNightPursuitShutdown(
  sr: number,
  opts?: { rpm?: number; idleRpm?: number; growl?: number; tick?: number },
  rand?: () => number,
): NpShutdownRender;
export function npShutdownRand(seed: number): () => number;

export interface NpShutdownPrepared {
  sr: number;
  o: { rpm: number; idleRpm: number; growl: number; tick: number; seed: number };
  r: NpShutdownRender;
}
export interface NpShutdownOptions {
  rpm?: number;
  idleRpm?: number;
  seed?: number;
  delay?: number;
  prepared?: NpShutdownPrepared | null;
}
export function prepareNightPursuitShutdown(
  sampleRate: number,
  params?: Partial<EngineParams>,
  opts?: NpShutdownOptions,
): NpShutdownPrepared;

export interface NpShutdownHandle {
  at: number;
  end: number;
  duration: number;
  stopAt: number;
  events: NpShutdownEvent[];
  active(now: number): boolean;
  cancel(now: number, seconds?: number): void;
  dispose(): void;
}
export function startNightPursuitShutdown(
  ctx: BaseAudioContext,
  dest: AudioNode,
  params?: Partial<EngineParams>,
  opts?: NpShutdownOptions,
): NpShutdownHandle;
