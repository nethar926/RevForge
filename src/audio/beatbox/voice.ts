/**
 * Internal voice contract for the Beat Box engine wrapper (index.ts). One voice = one synth
 * instance for one engine id. The wrapper owns the crossfade stages, the output node and the
 * live state; a voice only renders and accepts parameter changes. Not exported from index.ts.
 */
import type { BeatboxEngineInfo } from './engines.ts';

/** Live state carried from voice to voice on a swap. */
export interface VoiceState {
  rpm: number;
  throttle: number;
  /** km/h */
  speed: number;
  drive: number;
  tone: number;
  pops: number;
  /** start()/stop() target: 1 = running, 0 = stopped. */
  level: number;
}

export interface BeatboxVoice {
  readonly info: BeatboxEngineInfo;
  /** Voice output (not connected; the wrapper connects it into a fade stage). */
  readonly out: AudioNode;
  update(state: { rpm?: number; throttle?: number; speed?: number }, when: number): void;
  setDrive(x: number, when: number): void;
  setTone(x: number, when: number): void;
  setPops(x: number, when: number): void;
  /** Linear ramp of the start/stop level to `target` over `seconds`, from `when`. */
  rampLevel(target: number, seconds: number, when: number): void;
  dispose(): void;
}
