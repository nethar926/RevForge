import type { JetAlertLevel, JetCalloutId, JetCalloutMode, JetCalloutModes, JetCalloutResult } from './types';

export const JET_CALLOUTS: Readonly<Record<JetCalloutId, { level: 'caution' | 'warning' | 'mechanical' | 'none'; text?: string }>>;
export const JET_ALERT_LEVELS: readonly JetAlertLevel[];
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
  readonly cautionVoice: boolean;
  callout(id: JetCalloutId | string): JetCalloutResult;
  alertTone(level: JetAlertLevel): boolean;
  reset(): void;
}
