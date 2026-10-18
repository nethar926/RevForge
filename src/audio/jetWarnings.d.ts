import type { JetWarningId } from './types';

export const JET_WARNINGS: readonly JetWarningId[];
export const JET_WARNING_LEVEL: Readonly<{ stall: number; chime: number }>;
export const STALL_HI: number;
export const STALL_LO: number;
export const STALL_RATE: number;
export const STALL_ATTACK: number;
export const STALL_RELEASE: number;
export const CHIME_HZ: number;
export const CHIME_STRIKES: ReadonlyArray<readonly [number, number, number]>;

export class JetWarningVoice {
  constructor(ctx: BaseAudioContext, dest: AudioNode);
  readonly out: GainNode;
  readonly stallActive: boolean;
  startStall(t?: number): void;
  stopStall(t?: number, release?: number): void;
  /** One double chime; returns its length in seconds. */
  chime(t?: number): number;
  silence(t?: number): void;
  dispose(): void;
}
