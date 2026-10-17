/**
 * CJ checklist PAMPHLET plan (mock; Scott's data plan, our own wording). Pure: no React, node-testable.
 * The APU start order (csSequence, 21 steps) grouped into 9 numbered sections with lettered items. Every step key
 * maps to one item, off steps included, as in Scott's 6e85d6f (APU START 6·7·14 → 3a·3b·6a; we don't stack on it):
 *   1 POWER · 2 FUEL · 3 APU START · 4 L ENGINE · 5 R ENGINE · 6 APU SECURE · 7 SYSTEMS · 8 LIGHTS · 9 MASTER CAUTION
 * Lines read `ITEM ........ ACTION` (leader decorative, aria-hidden); 'Verify' sub-lines sit under the item they
 * confirm; CAUTION / NOTE boxes sit above the item they apply to, only where they matter.
 * Switch badges show the short code (3b) instead of the step number; VoiceOver: "APU switch, step 3 b, next".
 */
export type CkAction = 'ON' | 'OFF' | 'HOLD TO RUN' | 'IDLE' | 'PRESS' | 'LIFT' | 'CLOSE';
export interface CkItem {
  /** csSequence step key (switch id, `:off` for an off step). */
  key: string;
  code: string;
  item: string;
  /** Spoken switch name ("APU switch"). */
  spoken: string;
  action: CkAction;
  verify?: string[];
  callout?: { kind: 'CAUTION' | 'NOTE'; text: string };
}
export interface CkSection { n: number; title: string; phase: CkPhase; items: CkItem[] }
export type CkPhase = 'PRE-START' | 'START' | 'BEFORE TAXI';
export const CK_PHASES: readonly CkPhase[] = ['PRE-START', 'START', 'BEFORE TAXI'];

type Row = [key: string, item: string, spoken: string, action: CkAction, extra?: Partial<Pick<CkItem, 'verify' | 'callout'>>];
const S = (n: number, title: string, phase: CkPhase, rows: Row[]): CkSection => ({
  n, title, phase,
  items: rows.map(([key, item, spoken, action, extra], i) => ({ key, code: `${n}${String.fromCharCode(97 + i)}`, item, spoken, action, ...extra })),
});

export const CJ_CHECKLIST_PLAN: readonly CkSection[] = [
  S(1, 'POWER', 'PRE-START', [
    ['batt', 'BATT Switch', 'Battery switch', 'ON'],
    ['avionics', 'AVIONICS Switch', 'Avionics switch', 'ON'],
    ['inertialNav', 'INS Switch', 'Nav platform switch', 'ON'],
  ]),
  S(2, 'FUEL', 'PRE-START', [
    ['fuelPumpL', 'L FUEL PUMP', 'Left fuel pump', 'ON'],
    ['fuelPumpR', 'R FUEL PUMP', 'Right fuel pump', 'ON'],
  ]),
  S(3, 'APU START', 'START', [
    ['apuGuard', 'APU Cover', 'APU cover', 'LIFT'],
    ['apu', 'APU Switch', 'APU switch', 'HOLD TO RUN', { verify: ['Verify APU READY light on'], callout: { kind: 'NOTE', text: 'Hold until the hum steadies and READY lights.' } }],
  ]),
  S(4, 'L ENGINE', 'START', [
    ['ignL', 'L IGNITION', 'Left ignition', 'ON'],
    ['engL', 'L ENGINE START', 'Left engine start', 'HOLD TO RUN', { callout: { kind: 'CAUTION', text: 'Throttle at IDLE before start.' } }],
    ['throttleL', 'L THROTTLE', 'Left throttle', 'IDLE', { verify: ['Verify L RPM steady at idle'] }],
  ]),
  S(5, 'R ENGINE', 'START', [
    ['ignR', 'R IGNITION', 'Right ignition', 'ON'],
    ['engR', 'R ENGINE START', 'Right engine start', 'HOLD TO RUN'],
    ['throttleR', 'R THROTTLE', 'Right throttle', 'IDLE', { verify: ['Verify R RPM steady at idle'] }],
  ]),
  S(6, 'APU SECURE', 'START', [
    ['apu:off', 'APU Switch', 'APU switch', 'OFF'],
  ]),
  S(7, 'SYSTEMS', 'BEFORE TAXI', [
    ['seatbelt', 'SEAT BELT Sign', 'Seat belt sign', 'ON', { verify: ['Verify single low tone'] }],
    ['hydraulics', 'HYDRAULICS', 'Hydraulics', 'ON'],
    ['canopy', 'CANOPY', 'Canopy', 'CLOSE'],
    ['oxygen', 'O2', 'Oxygen', 'ON', { verify: ['Verify 3 hi-lo chimes'] }],
  ]),
  S(8, 'LIGHTS', 'BEFORE TAXI', [
    ['navLights', 'POSITION LIGHTS', 'Position lights', 'ON'],
    ['anticollision', 'BEACON', 'Beacon', 'ON'],
  ]),
  S(9, 'MASTER CAUTION', 'BEFORE TAXI', [
    ['masterCaution', 'MASTER CAUTION', 'Master caution', 'PRESS', { verify: ['Verify light out'] }],
  ]),
];

export const ckItems = (plan: readonly CkSection[] = CJ_CHECKLIST_PLAN): CkItem[] => plan.flatMap((s) => s.items);
/** "6b" → "6 b" (VoiceOver reads the letter, not "six-bee" as one word). */
export const spokenCode = (code: string) => code.replace(/^(\d+)([a-z])$/, '$1 $2');
export type CkState = 'done' | 'current' | 'todo';
/** Line read: "Step 6 b, APU switch, OFF" (+ ", done" / ", current step"). */
export function ckLineLabel(it: CkItem, state: CkState): string {
  return `Step ${spokenCode(it.code)}, ${it.spoken}, ${it.action}${state === 'done' ? ', done' : state === 'current' ? ', current step' : ''}`;
}
/** Switch badge codes for a control, in order (APU switch: 3b 6a). */
export function badgeCodes(id: string, plan: readonly CkSection[] = CJ_CHECKLIST_PLAN): string[] {
  return ckItems(plan).filter((i) => i.key === id || i.key === `${id}:off`).map((i) => i.code);
}
/** The badge shows the control's next code still to do (else its last one). */
export function badgeFor(id: string, cursor: number, plan: readonly CkSection[] = CJ_CHECKLIST_PLAN): { code: string; next: boolean } | null {
  const all = ckItems(plan);
  const mine = all.map((it, i) => ({ it, i })).filter(({ it }) => it.key === id || it.key === `${id}:off`);
  if (!mine.length) return null;
  const up = mine.find(({ i }) => i >= cursor) ?? mine[mine.length - 1];
  return { code: up.it.code, next: up.i === cursor };
}
/** Badge VoiceOver: "APU switch, step 3 b, next" / "Battery switch, step 1 a, done" / "…, step 6 a". */
export function badgeLabel(id: string, cursor: number, plan: readonly CkSection[] = CJ_CHECKLIST_PLAN): string | null {
  const b = badgeFor(id, cursor, plan);
  if (!b) return null;
  const all = ckItems(plan);
  const it = all.find((x) => x.code === b.code)!;
  const idx = all.indexOf(it);
  return `${it.spoken}, step ${spokenCode(b.code)}${b.next ? ', next' : idx < cursor ? ', done' : ''}`;
}
