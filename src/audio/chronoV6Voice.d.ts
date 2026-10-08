export declare const CHRONO_V6_PROCESSOR: 'chrono-v6-processor';
export declare const V6_STARTUP_SECONDS: number;
export declare const V6_TAKEOVER_THROTTLE: number;
export declare const V6_TAKEOVER_TC: number;
export declare const V6_IGNITION_WAIT_S: number;
export interface V6PlanPoint {
  rpm: number;
  fire: number;
  comp: number;
  starter: number;
  throttle: number;
}
export interface V6Targets extends V6PlanPoint {
  load: number;
  overrun: number;
  rasp: number;
  lump: number;
  level: number;
}
export declare function v6RundownSeconds(r0: number, idleRpm?: number): number;
export declare function v6ShutdownSeconds(r0: number, idleRpm?: number): number;
export declare function v6StartupAt(t: number, idleRpm?: number): V6PlanPoint;
export declare function v6ShutdownAt(t: number, r0: number, idleRpm?: number): V6PlanPoint;
export declare function chronoV6Targets(
  params: Record<string, unknown> | undefined,
  drive: { rpm?: number; rpmNorm?: number; overrun?: number } | null | undefined,
  thr: number,
  load?: number,
): V6Targets;
export declare function ensureChronoV6Module(ctx: BaseAudioContext, url: string): Promise<void>;
export declare class ChronoV6Voice {
  readonly ctx: BaseAudioContext;
  readonly node: AudioWorkletNode;
  awaitSince: number;
  live: V6Targets | null;
  constructor(ctx: BaseAudioContext, node: AudioWorkletNode);
  static create(ctx: BaseAudioContext, dest: AudioNode, seed?: number): ChronoV6Voice;
  param(name: string): AudioParam | undefined;
  cueActive(now?: number): boolean;
  combustion(now?: number): number;
  readonly cueType: 'startup' | 'shutdown' | null;
  setLive(t: V6Targets, tc?: number, now?: number): void;
  armIgnition(now?: number, waitS?: number): void;
  checkIgnitionWait(now?: number): void;
  startup(idleRpm: number, now?: number): number;
  shutdown(idleRpm: number, now?: number): number;
  takeOver(now?: number, tc?: number): void;
  dispose(): void;
}
