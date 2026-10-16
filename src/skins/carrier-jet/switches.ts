/**
 * Carrier Jet switch panel + afterburner guard: pure view logic (no React, no DOM).
 * The components in SwitchPanel.tsx / AfterburnerGuard.tsx only draw what these functions return,
 * so the a11y contract is testable in plain node. Nothing here keeps state; the host owns it.
 */

export type CjSwitchKind = 'page' | 'toggle' | 'more';
export type CjSwitchState = 'off' | 'on' | 'denied';

export interface CjSwitchItem {
  id: string;
  /** Visible stencil label (drawn upper case). Also the accessible name. */
  label: string;
  /** page = navigates (aria-current), toggle = role="switch", more = opens the overflow tray (aria-expanded). */
  kind: CjSwitchKind;
  /** page: current page · toggle: on · more: tray open. */
  on?: boolean;
  /** Toggles only (e.g. COMPASS). Wins over `on`; 'denied' = permission refused, still tappable to retry. */
  state?: CjSwitchState;
}

/** Wilson's option A row (tray closed) and the MORE tray contents. Ids are suggestions; Frontend may rename. */
export const CJ_SWITCH_ITEMS: CjSwitchItem[] = [
  { id: 'drive', label: 'Drive', kind: 'page', on: true },
  { id: 'garage', label: 'Garage', kind: 'page' },
  { id: 'visuals', label: 'Visuals', kind: 'page' },
  { id: 'options', label: 'Options', kind: 'page' },
  { id: 'sound-builder', label: 'Sound Builder', kind: 'page' },
  { id: 'compass', label: 'Compass', kind: 'toggle', state: 'off' },
  { id: 'mute', label: 'Mute', kind: 'toggle', on: false },
  { id: 'more', label: 'More', kind: 'more', on: false },
];
export const CJ_SWITCH_OVERFLOW: CjSwitchItem[] = [
  { id: 'pro-builder', label: 'Pro Builder', kind: 'page' },
  { id: 'lab', label: 'Lab', kind: 'page' },
  { id: 'diagnostics', label: 'Diagnostics', kind: 'page' },
  { id: 'account', label: 'Account', kind: 'page' },
];

export interface CjSwitchView {
  /** Lever up = on / current / open. */
  up: boolean;
  /** Green jewel lit. */
  lamp: boolean;
  denied: boolean;
  /** Position legend under the lever (visible). */
  legend: string;
  /** Second legend line (denied only). */
  hint?: string;
  /** Props for the <button>. */
  a11y: {
    role?: 'switch';
    'aria-checked'?: boolean;
    'aria-current'?: 'page';
    'aria-expanded'?: boolean;
    'aria-label': string;
  };
}

export function toggleState(item: CjSwitchItem): CjSwitchState {
  return item.state ?? (item.on ? 'on' : 'off');
}

export function switchView(item: CjSwitchItem, overflowCount = 0): CjSwitchView {
  const on = !!item.on;
  if (item.kind === 'page') {
    return { up: on, lamp: on, denied: false, legend: on ? 'HERE' : 'GO ▲', a11y: { 'aria-current': on ? 'page' : undefined, 'aria-label': item.label } };
  }
  if (item.kind === 'more') {
    return { up: on, lamp: on, denied: false, legend: on ? 'OPEN' : overflowCount ? `${overflowCount} INSIDE` : 'CLOSED', a11y: { 'aria-expanded': on, 'aria-label': item.label } };
  }
  const st = toggleState(item);
  if (st === 'denied') {
    return {
      up: false, lamp: false, denied: true, legend: 'DENIED', hint: 'TAP TO RETRY',
      a11y: { role: 'switch', 'aria-checked': false, 'aria-label': `${item.label} denied, tap to retry` },
    };
  }
  return { up: st === 'on', lamp: st === 'on', denied: false, legend: st === 'on' ? 'ON' : 'OFF', a11y: { role: 'switch', 'aria-checked': st === 'on', 'aria-label': item.label } };
}

export interface CjGuardView {
  guard: { 'aria-expanded': boolean; 'aria-label': string };
  /** ARM reachable only while the guard is open: not inert, tabIndex 0. */
  arm: { role: 'switch'; 'aria-checked': boolean; 'aria-label': 'Afterburner armed'; tabIndex: 0 | -1; inert: boolean };
  keyLegend: 'ON' | 'SAFE';
  plate: 'AB ARMED' | 'AB SAFE';
  status: 'Afterburner armed' | 'Afterburner safe';
}

export function guardView(armed: boolean, guardOpen: boolean): CjGuardView {
  return {
    guard: { 'aria-expanded': guardOpen, 'aria-label': `Afterburner guard, ${guardOpen ? 'open' : 'closed'}` },
    arm: { role: 'switch', 'aria-checked': armed, 'aria-label': 'Afterburner armed', tabIndex: guardOpen ? 0 : -1, inert: !guardOpen },
    keyLegend: armed ? 'ON' : 'SAFE',
    plate: armed ? 'AB ARMED' : 'AB SAFE',
    status: armed ? 'Afterburner armed' : 'Afterburner safe',
  };
}
