/*
 * Dev-only fixtures for the parts gallery and tests: a copy of the shape `getJetSystemList(variant)` returns
 * on audio/cj-cold-start @ 65a210c (src/audio/jetColdStart.js), plus example host state. Not used by the app.
 */
import type { CjShelfSwitch, CjSystemEntry } from '../../types';

type E = Omit<CjSystemEntry, 'order'>;
const e = (id: string, label: string, group: CjSystemEntry['group'], kind: CjSystemEntry['kind'], extra: Partial<E> = {}): E => ({ id, label, group, kind, ...extra });

/** Same entries, order and groups as Dan's getJetSystemList (variant 'apu' | 'aircart'). */
export function jetSystemListFixture(variant: 'apu' | 'aircart' = 'apu'): CjSystemEntry[] {
  const cart = variant === 'aircart';
  const list: E[] = [
    e('batt', 'Battery', 'POWER', 'toggle', { required: true }),
    e('seatbelt', 'Seat belt sign', 'SYSTEMS', 'toggle', { required: false }),
    e('avionics', 'Avionics', 'POWER', 'toggle', { required: false }),
    e('inertialNav', 'Nav platform', 'POWER', 'toggle', { required: false }),
    e('navLights', 'Position lights', 'LIGHTS', 'toggle', { required: false }),
    e('anticollision', 'Beacon', 'LIGHTS', 'toggle', { required: false }),
    cart ? e('aircart', 'Ground air', 'POWER', 'toggle', { required: true }) : e('apu', 'APU', 'POWER', 'toggle', { required: true }),
  ];
  const engine = (s: 'L' | 'R'): E[] => [
    e(`fuelPump${s}`, `${s} fuel pump`, 'FUEL', 'toggle', { side: s, required: true }),
    e(`ign${s}`, `${s} ignition`, 'ENGINES', 'toggle', { side: s, required: true }),
    e(`eng${s}`, `${s} engine start`, 'ENGINES', 'hold', { side: s, required: true }),
    e(`throttle${s}`, `${s} throttle idle`, 'ENGINES', 'toggle', { side: s, required: true }),
  ];
  if (cart) list.push(...engine('R'), e('crossbleed', 'Crossbleed', 'FUEL', 'toggle', { required: true }), ...engine('L'));
  else list.push(...engine('L'), ...engine('R'));
  list.push(
    e('hydraulics', 'Hydraulics', 'SYSTEMS', 'toggle', { required: false }),
    e('canopy', 'Canopy', 'SYSTEMS', 'hold', { required: false }),
    e('oxygen', 'Oxygen', 'SYSTEMS', 'toggle', { required: false }),
    e('masterCaution', 'Caution reset', 'SYSTEMS', 'hold', { required: false }),
    e('quickStartGuard', 'Quick start cover', 'ENGINES', 'guarded', { required: false }),
    e('quickStart', 'Quick start', 'ENGINES', 'hold', { required: false }),
    e('emergencyStop', 'Emergency stop', 'ENGINES', 'pull', { required: false }),
  );
  return list.map((x, i) => ({ ...x, order: i + 1 }));
}

/** Example engraved short labels a host might pass (<= 7 chars a line). */
export const SHORT_LABELS: Record<string, string> = {
  batt: 'BATT', seatbelt: 'SEAT BELT', avionics: 'AVION', inertialNav: 'INS', navLights: 'POS LT', anticollision: 'BEACON',
  apu: 'APU', aircart: 'GND AIR', fuelPumpL: 'L PUMP', fuelPumpR: 'R PUMP', ignL: 'L IGN', ignR: 'R IGN', engL: 'L ENG', engR: 'R ENG',
  throttleL: 'L IDLE', throttleR: 'R IDLE', crossbleed: 'X-BLEED', hydraulics: 'HYD', canopy: 'CANOPY', oxygen: 'OXY', masterCaution: 'CAUT RST',
};

/** Option A around step 5 (FUEL + GEN on, L ENG cranking), as on the sheet. */
export function shelfStateApuStep5(list: CjSystemEntry[]): Record<string, CjShelfSwitch> {
  const out: Record<string, CjShelfSwitch> = {};
  for (const s of list) out[s.id] = { label: SHORT_LABELS[s.id], state: 'off', lit: false, disabled: true, disabledReason: 'Battery first' };
  const on = (id: string, extra: Partial<CjShelfSwitch> = {}) => { out[id] = { ...out[id], state: 'on', lit: true, disabled: false, disabledReason: undefined, ...extra }; };
  on('batt'); on('avionics'); on('inertialNav', { lit: false }); on('fuelPumpL'); on('fuelPumpR'); on('ignL'); on('seatbelt', { legend: 'ON' }); on('navLights');
  out.engL = { ...out.engL, state: 'momentary', lit: true, disabled: false, legend: 'CRANK', cue: 'busy' };
  out.throttleL = { ...out.throttleL, state: 'off', disabled: false, cue: 'next' };
  out.anticollision = { ...out.anticollision, state: 'off', disabled: false };
  out.ignR = { ...out.ignR, disabled: true, disabledReason: 'Start the left engine first' };
  return out;
}

/** Option B at B4 (R running on cart air, crossbleed open, L cranking). */
export function shelfStateCartB4(list: CjSystemEntry[]): Record<string, CjShelfSwitch> {
  const out: Record<string, CjShelfSwitch> = {};
  for (const s of list) out[s.id] = { label: SHORT_LABELS[s.id], state: 'off', lit: false };
  for (const id of ['batt', 'avionics', 'fuelPumpR', 'fuelPumpL', 'ignR', 'throttleR', 'ignL', 'navLights', 'anticollision', 'hydraulics']) out[id] = { ...out[id], state: 'on', lit: true };
  out.engR = { ...out.engR, state: 'on', lit: true, legend: 'RUN' };
  out.engL = { ...out.engL, state: 'momentary', lit: true, legend: 'CRANK', cue: 'busy' };
  out.seatbelt = { ...out.seatbelt, disabled: true, disabledReason: 'After both engines run' };
  return out;
}
