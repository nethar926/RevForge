import type { JetChecklist, JetCue, JetStartMode, JetSwitchFoley, JetSystem, JetSystemEntry, JetVariant } from './types';

export interface JetColdState {
  systems: Record<JetSystem, boolean>;
  /** APU spool 0..1. */
  apuN: number;
  apuLit: boolean;
  /** Ground air cart spool 0..1. */
  cartN: number;
  /** Cart diesel run 0..1. */
  cartEng: number;
  gyro: number;
  hum: number;
  xbFlow: number;
  pumpL: number;
  pumpR: number;
  avion: number;
  oxy: number;
  ins: number;
  /** Hydraulic pressure 0..1 (engine-driven). */
  hyd: number;
  strobeT: number;
  time: number;
}
export type JetAutoStep =
  | { system: JetSystem; on: boolean }
  | { wait: number }
  | { until: 'apuReady' | 'cartReady' | 'engLRun' | 'engRRun' };

export const JET_SYSTEMS: readonly JetSystem[];
export const JET_CUES: readonly JetCue[];
export const JET_MOMENTARY: readonly JetSystem[];
export const JET_POWERED: readonly JetSystem[];
export function getJetSystemList(variant?: JetVariant): JetSystemEntry[];
export function getJetChecklist(variant?: JetVariant): JetChecklist;
export const JET_DEFAULT_FOLEY: Readonly<Record<JetSystem, JetSwitchFoley>>;
export const JET_ENGINE_PAN: number;
export const JET_CART_PAN: number;
export const JET_ESTOP_DELAY: number;
export const JET_GEAR_RUN: number;
export const JET_COLD_TRIM: number;
export const JET_COLD_LEVEL: Readonly<Record<string, number>>;

export function createJetColdState(): JetColdState;
export function jetSystemsOf(st: JetColdState): Record<JetSystem, boolean>;
export function stepJetCold(st: JetColdState, dt: number, eng?: { n2a?: number; n2b?: number }): { type: 'apuLightoff' | 'strobe' }[];
export function jetApuReady(st: JetColdState): boolean;
export function jetCartReady(st: JetColdState): boolean;
export function jetAutoStartSteps(mode?: JetStartMode): JetAutoStep[];

export class JetColdStartVoice {
  constructor(ctx: BaseAudioContext, dest: AudioNode, opts?: { whiteBuf?: AudioBuffer; pinkBuf?: AudioBuffer });
  update(st: JetColdState, eng?: { starterA?: number; starterB?: number; n2a?: number; n2b?: number }, when?: number): void;
  /** Foley / one-shot. Extra internal cues: relay, cartClunk, xbValve, apuLightoff, lightoff, igniter. */
  cue(name: JetCue | string, opts?: { when?: number; pan?: number; level?: number; down?: boolean }): boolean;
  /** Original caution / warning alert tone on its own gain (cancel with cancelAlert). */
  alertTone(level: 'caution' | 'warning', t: number, level2?: number): { gain: GainNode; seconds: number };
  cancelAlert(h: { gain: GainNode } | null | undefined, t: number): void;
  dispose(): void;
}
