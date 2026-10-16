import type { JetAbUnarmedCall, JetAlertLevel, JetCalloutId, JetCalloutMode, JetCalloutModes, JetCalloutResult } from './types';

export const JET_CALLOUTS: Readonly<Record<JetCalloutId, { level: 'caution' | 'warning' | 'mechanical' | 'none'; text?: string }>>;
export const JET_ALERT_LEVELS: readonly JetAlertLevel[];
export const JET_HIGH_SPEED_IDS: readonly JetCalloutId[];
export const JET_VOICE: Readonly<{ volume: number; pitch: number; rate: number; seconds: number }>;
export const JET_CALLOUT_COOLDOWN: Readonly<{ alert: number; mechanical: number }>;
export function speakPhrase(text: string, opts?: { volume?: number; pitch?: number; rate?: number; onend?: () => void }): boolean;
export function cancelSpeech(): void;
export class FlightCallouts {
  constructor(deps: {
    now(): number;
    tone(level: 'caution' | 'warning'): { seconds: number; cancel(): void } | null;
    mechanical(id: JetCalloutId): boolean;
    canPlay(): boolean;
  });
  setMode(mode: JetCalloutMode | Partial<JetCalloutModes>): JetCalloutModes;
  getMode(): JetCalloutModes;
  setCautionVoice(on: boolean): void;
  /** Speed callouts (overspeedCaution / overspeedWarning); default off. */
  setHighSpeed(on: boolean): void;
  /** AB UNARMED call; default 'silent'. */
  setAbUnarmedCall(mode: JetAbUnarmedCall): JetAbUnarmedCall;
  readonly abUnarmedCall: JetAbUnarmedCall;
  readonly highSpeed: boolean;
  readonly cautionVoice: boolean;
  callout(id: JetCalloutId | string): JetCalloutResult;
  alertTone(level: JetAlertLevel): boolean;
  reset(): void;
}
