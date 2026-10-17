/**
 * CJ pamphlet SHUTDOWN page (mock; our own wording, not for real aircraft). Pure: no React, node-testable.
 * Same printed style as the cold-start sections (checklistPlan.ts): numbered sections, lettered items,
 * `ITEM ........ ACTION`, 'Verify' sub-lines, a NOTE / CAUTION box above the item it applies to. Actions come from the
 * pamphlet's set: ON · OFF · HOLD · IDLE · PRESS · CHECK · LIFT · CLOSE. Printed reference only (no cursor): the
 * shutdown runs on the switches in any order, EMER STOP PULL stops everything at once.
 *   1 ENGINES · 2 SYSTEMS · 3 LIGHTS · 4 POWER, then the EMERGENCY box.
 */
import { spokenCode } from './checklistPlan.ts';

export type SdAction = 'ON' | 'OFF' | 'HOLD' | 'IDLE' | 'PRESS' | 'CHECK' | 'LIFT' | 'CLOSE';
export const SD_ACTIONS: readonly SdAction[] = ['ON', 'OFF', 'HOLD', 'IDLE', 'PRESS', 'CHECK', 'LIFT', 'CLOSE'];
export interface SdItem { code: string; item: string; spoken: string; action: SdAction; verify?: string[]; callout?: { kind: 'CAUTION' | 'NOTE'; text: string } }
export interface SdSection { n: number; title: string; items: SdItem[] }

type Row = [item: string, spoken: string, action: SdAction, extra?: Partial<Pick<SdItem, 'verify' | 'callout'>>];
const S = (n: number, title: string, rows: Row[]): SdSection => ({
  n, title,
  items: rows.map(([item, spoken, action, extra], i) => ({ code: `${n}${String.fromCharCode(97 + i)}`, item, spoken, action, ...extra })),
});

export const SD_TITLE = 'NORMAL PROCEDURES · SHUTDOWN';
export const CJ_SHUTDOWN_PLAN: readonly SdSection[] = [
  S(1, 'ENGINES', [
    ['THROTTLES', 'Throttles', 'IDLE', { callout: { kind: 'NOTE', text: 'Let both engines settle at idle first.' } }],
    ['L + R RPM', 'Left and right RPM', 'CHECK', { verify: ['Verify both steady at idle'] }],
    ['L + R IGNITION', 'Left and right ignition', 'OFF'],
    ['L + R FUEL PUMP', 'Left and right fuel pumps', 'OFF', { verify: ['Verify RPM winding down'] }],
  ]),
  S(2, 'SYSTEMS', [
    ['HYDRAULICS', 'Hydraulics', 'OFF'],
    ['O2', 'Oxygen', 'OFF'],
    ['CANOPY', 'Canopy', 'LIFT'],
  ]),
  S(3, 'LIGHTS', [
    ['POSITION LIGHTS', 'Position lights', 'OFF'],
    ['BEACON', 'Beacon', 'OFF'],
  ]),
  S(4, 'POWER', [
    ['INS Switch', 'Nav platform switch', 'OFF'],
    ['AVIONICS Switch', 'Avionics switch', 'OFF'],
    ['SEAT BELT Sign', 'Seat belt sign', 'OFF'],
    ['BATT Switch', 'Battery switch', 'OFF', { verify: ['Verify panel dark'] }],
  ]),
];
/** The EMERGENCY box at the foot of the page. */
export const SD_EMERGENCY = 'Pull the red EMER STOP handle down past the line.';
/** Line read: "Shutdown step 1 a, Throttles, IDLE". */
export const sdLineLabel = (it: SdItem) => `Shutdown step ${spokenCode(it.code)}, ${it.spoken}, ${it.action}`;
