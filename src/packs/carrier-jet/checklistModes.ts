/**
 * Pamphlet plans per start mode (host side of Meghan's checklistPlan.ts, which carries the APU plan only). Pure.
 * GND AIR is derived the same way as her APU plan (her concept sheet draws APU only): csSequence('gndAir') — 22 steps,
 * off steps included — grouped into 9 numbered sections in the same three phases, same item / action / Verify style:
 *   1 POWER · 2 GND AIR · 3 R ENGINE · 4 CROSSBLEED · 5 L ENGINE · 6 GND AIR SECURE · 7 SYSTEMS · 8 LIGHTS · 9 MASTER CAUTION
 * All wording is ours.
 */
import { CJ_CHECKLIST_PLAN, ckItems, spokenCode, type CkAction, type CkItem, type CkPhase, type CkSection } from './checklistPlan.ts';

type Row = [key: string, item: string, spoken: string, action: CkAction, extra?: Partial<Pick<CkItem, 'verify' | 'callout'>>];
const S = (n: number, title: string, phase: CkPhase, rows: Row[]): CkSection => ({
  n, title, phase,
  items: rows.map(([key, item, spoken, action, extra], i) => ({ key, code: `${n}${String.fromCharCode(97 + i)}`, item, spoken, action, ...extra })),
});
const apuSec = (n: number) => CJ_CHECKLIST_PLAN.find((s) => s.n === n)!;

export const CJ_CHECKLIST_PLAN_GND_AIR: readonly CkSection[] = [
  apuSec(1), // POWER: same three switches
  S(2, 'GND AIR', 'PRE-START', [
    ['aircart', 'GND AIR Switch', 'Ground air switch', 'ON', { verify: ['Verify GND AIR light green'], callout: { kind: 'NOTE', text: 'Cart air starts the right engine first.' } }],
  ]),
  S(3, 'R ENGINE', 'START', [
    ['fuelPumpR', 'R FUEL PUMP', 'Right fuel pump', 'ON'],
    ['ignR', 'R IGNITION', 'Right ignition', 'ON'],
    ['engR', 'R ENGINE START', 'Right engine start', 'HOLD TO RUN', { callout: { kind: 'CAUTION', text: 'Throttle at IDLE before start.' } }],
    ['throttleR', 'R THROTTLE', 'Right throttle', 'IDLE', { verify: ['Verify R RPM steady at idle'] }],
  ]),
  S(4, 'CROSSBLEED', 'START', [
    ['crossbleed', 'X-BLEED Valve', 'Crossbleed valve', 'ON', { verify: ['Verify R engine running'] }],
  ]),
  S(5, 'L ENGINE', 'START', [
    ['fuelPumpL', 'L FUEL PUMP', 'Left fuel pump', 'ON'],
    ['ignL', 'L IGNITION', 'Left ignition', 'ON'],
    ['engL', 'L ENGINE START', 'Left engine start', 'HOLD TO RUN'],
    ['throttleL', 'L THROTTLE', 'Left throttle', 'IDLE', { verify: ['Verify L RPM steady at idle'] }],
  ]),
  S(6, 'GND AIR SECURE', 'START', [
    ['crossbleed:off', 'X-BLEED Valve', 'Crossbleed valve', 'CLOSE'],
    ['aircart:off', 'GND AIR Switch', 'Ground air switch', 'OFF'],
  ]),
  apuSec(7), // SYSTEMS
  apuSec(8), // LIGHTS
  apuSec(9), // MASTER CAUTION
];

export type CkMode = 'apu' | 'gndAir';
export const ckPlan = (mode: CkMode): readonly CkSection[] => (mode === 'apu' ? CJ_CHECKLIST_PLAN : CJ_CHECKLIST_PLAN_GND_AIR);
/**
 * Pamphlet name, printed on the cover and on the tucked tag (one source). The tag drops the MATRIX brand word only
 * where the full title doesn't fit its width (never clipped, no ellipsis); VoiceOver always gets the full name.
 */
export const CK_BOOK_BRAND = 'MATRIX';
export const CK_BOOK_SHORT = 'PILOT CHECKLIST';
export const CK_BOOK_TITLE = `${CK_BOOK_BRAND} ${CK_BOOK_SHORT}`;
export const CK_BOOK_SPOKEN = 'MATRIX pilot checklist';
/** Tag / card VoiceOver name: "MATRIX pilot checklist, step 7 b, 17 of 22: HYD, OFF" (code spelled "7 b", not "7b"). */
export const ckBookAria = (step: { code: string; index: number; total: number; text: string } | null) =>
  `${CK_BOOK_SPOKEN}${step ? `, step ${step.code.replace(/^(\d+)([a-z])$/, '$1 $2')}, ${step.index} of ${step.total}: ${step.text}` : ''}`;
export const ckTitle = (mode: CkMode) => `NORMAL PROCEDURES · COLD START (${mode === 'apu' ? 'APU' : 'GND AIR'})`;

/** Plan items aligned to a step-key sequence, or null if the plan doesn't cover it 1:1 (then the host keeps numbers). */
export function ckAlign(mode: CkMode, keys: readonly string[]): CkItem[] | null {
  const items = ckItems(ckPlan(mode));
  return items.length === keys.length && items.every((it, i) => it.key === keys[i]) ? items : null;
}
/** Switch name + code for VoiceOver: "APU switch, step 3 b, next" / "…, done" / "…, step 6 a". */
export const ckBadgeLabel = (spoken: string, code: string, state: 'next' | 'done' | 'todo') =>
  `${spoken}, step ${spokenCode(code)}${state === 'next' ? ', next' : state === 'done' ? ', done' : ''}`;

/** SHELF key suffix while the tucked tag is hidden (no clear spot): ", checklist step 7 b, 17 of 22"; "" with no step. Never PARK. */
export const shelfStepAria = (step: { code: string; index: number; total: number } | null) =>
  step ? `, checklist step ${step.code.replace(/^(\d+)([a-z])$/, '$1 $2')}, ${step.index} of ${step.total}` : '';
