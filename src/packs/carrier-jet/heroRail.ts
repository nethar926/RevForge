/**
 * Carrier Jet hero v2 (Meghan's cj-hero-2026/v2 mock, layout from rail v2; Wilson approved Oct 18). Pure model for the
 * host-drawn parts (packs/mounts/CjHeroV2.tsx): the 8-cap annunciator plate in the top bar, the bottom start rail
 * (RADAR 3-pos · AFTERBURNER guard + AB ARMED · START bank · QUICK START · EMER STOP · HOLD TO REV / SHUTDOWN) and the
 * Korry split caps on the upper-board edge keys. No React / DOM, so node tests import it.
 *
 * Lamp colours (Scott's spec, MIL convention): amber = caution, red = MASTER WARNING only, green ONLY for L ENG RUN,
 * R ENG RUN and APU READY. Every lamp is steady: there is no flashing state in this model at all.
 */
import type { Box } from './geometry.ts';

/* ------------------------------------------------------------------ annunciator lamps */

export type LampId = 'seatbelt' | 'masterCaution' | 'masterWarning' | 'engRunL' | 'engRunR' | 'engWarnL' | 'engWarnR' | 'apuReady';
export type LampColor = 'amber' | 'red' | 'green';
/** Shape mark beside the legend, so colour is never the only cue (Meghan: bar / circle / triangle / ring / x / square). */
export type LampMark = 'bar' | 'circle' | 'triangle' | 'ring' | 'x' | 'square';
export interface LampDecl { id: LampId; top: string; bottom: string; color: LampColor; mark: LampMark; spoken: string; /** tap clears it */ clearable?: boolean }

/** The plate, left to right (rail v2 / hero v2 order). */
export const HV_LAMPS: readonly LampDecl[] = [
  { id: 'seatbelt', top: 'FASTEN', bottom: 'SEAT BELT', color: 'amber', mark: 'bar', spoken: 'Fasten seat belt', clearable: true },
  { id: 'masterCaution', top: 'MASTER', bottom: 'CAUTION', color: 'amber', mark: 'circle', spoken: 'Master caution', clearable: true },
  { id: 'masterWarning', top: 'MASTER', bottom: 'WARNING', color: 'red', mark: 'triangle', spoken: 'Master warning', clearable: true },
  { id: 'engRunL', top: 'L ENG', bottom: 'RUN', color: 'green', mark: 'ring', spoken: 'Left engine run' },
  { id: 'engRunR', top: 'R ENG', bottom: 'RUN', color: 'green', mark: 'ring', spoken: 'Right engine run' },
  { id: 'engWarnL', top: 'L ENG', bottom: 'WARN', color: 'amber', mark: 'x', spoken: 'Left engine warning' },
  { id: 'engWarnR', top: 'R ENG', bottom: 'WARN', color: 'amber', mark: 'x', spoken: 'Right engine warning' },
  { id: 'apuReady', top: 'APU', bottom: 'READY', color: 'green', mark: 'square', spoken: 'A P U ready' },
];
/** The only lamps allowed to light green (good status). */
export const GREEN_LAMPS: readonly LampId[] = ['engRunL', 'engRunR', 'apuReady'];
/** The only lamp allowed to light red. */
export const RED_LAMPS: readonly LampId[] = ['masterWarning'];

/** Lit colour of a lamp: the rule, not the table (a table typo can never light a caution green). */
export function lampColor(id: LampId): LampColor {
  if (RED_LAMPS.includes(id)) return 'red';
  if (GREEN_LAMPS.includes(id)) return 'green';
  return 'amber';
}

/**
 * Lit legend colours (Meghan's measure.json → annunciatorColours). MASTER WARNING is the tightest cap (4.80 with the
 * shifted glint, 5.08 baked): its lens wash and legend are locked together, so the wash can only get brighter if the
 * legend is lifted toward #FFB3A8 (HV_RED_LEGEND_LIFT) in the same change.
 */
export const HV_LEGEND: Readonly<Record<LampColor | 'unlit', string>> = { amber: '#FFD07A', red: '#FFA497', green: '#A6FFBF', unlit: '#A9AFB4' };
export const HV_WASH_ALPHA: Readonly<Record<LampColor, number>> = { amber: 0.22, red: 0.22, green: 0.2 };
export const HV_RED_LEGEND_LIFT = '#FFB3A8';
/** Measured worst case per lit colour (shift frame, measure.json): the floor this build must not drop under. */
export const HV_CONTRAST_TARGET: Readonly<Record<LampColor | 'unlit', number>> = { amber: 5.71, red: 4.8, green: 6.49, unlit: 6.18 };

/** What the lamps read from (the cold-start snapshot, or the plain engine state when there is no cold start). */
export interface LampInput {
  /** Cold start available (Tomcat with Dan's systems). false: RUN / READY follow `running`, cautions stay out. */
  cold: boolean;
  running: boolean;
  batt: boolean;
  seatbelt: boolean;
  engines: { L: 'off' | 'starting' | 'run' | string; R: 'off' | 'starting' | 'run' | string };
  apuOn: boolean;
  apuReady: boolean;
  /** MASTER CAUTION lit by the cold start (power on, not yet reset). */
  caution: boolean;
  emergency: boolean;
  /** Lamps the driver tapped to clear (seat belt reminder, master caution, master warning). */
  cleared?: Partial<Record<LampId, boolean>>;
}
export type LampState = Record<LampId, boolean>;
export const LAMPS_DARK: LampState = { seatbelt: false, masterCaution: false, masterWarning: false, engRunL: false, engRunR: false, engWarnL: false, engWarnR: false, apuReady: false };

/** Lit / unlit per lamp. All steady: a lamp is a boolean, there is nothing that could blink. */
export function lampStates(i: LampInput): LampState {
  const c = i.cleared ?? {};
  if (!i.cold) return { ...LAMPS_DARK, engRunL: i.running, engRunR: i.running, apuReady: i.running };
  const run = (s: string) => s === 'run';
  const warnL = i.batt && !run(i.engines.L), warnR = i.batt && !run(i.engines.R);
  return {
    seatbelt: i.seatbelt && !c.seatbelt,
    masterCaution: i.caution && !c.masterCaution,
    masterWarning: (i.emergency || warnL || warnR) && !c.masterWarning,
    engRunL: run(i.engines.L),
    engRunR: run(i.engines.R),
    engWarnL: warnL,
    engWarnR: warnR,
    apuReady: i.apuOn && i.apuReady,
  };
}

/** Lamps lit now that were not lit before: a NEW warning re-lights a cleared MASTER WARNING (clear = this occurrence). */
export function clearsAfter(prev: LampState, next: LampState, cleared: Partial<Record<LampId, boolean>>): Partial<Record<LampId, boolean>> {
  const out: Partial<Record<LampId, boolean>> = {};
  for (const id of Object.keys(cleared) as LampId[]) if (cleared[id] && !(next[id] && !prev[id])) out[id] = true;
  return out;
}

/** `?lamps=cw` (Meghan's colour-check state): the five caution / warning caps lit, RUN / READY out. Anything else: null. */
export function forcedLamps(search: string): LampState | null {
  const v = new URLSearchParams(search).get('lamps');
  if (v !== 'cw') return null;
  return { ...LAMPS_DARK, seatbelt: true, masterCaution: true, masterWarning: true, engWarnL: true, engWarnR: true };
}

export const lampAria = (d: LampDecl, lit: boolean): string => `${d.spoken}, ${lit ? `lit ${lampColor(d.id)}` : 'off'}${d.clearable && lit ? '. Tap to clear' : ''}`;

/* ------------------------------------------------------------------ Korry split caps (upper-board keys) */

export interface SplitCap { top: string; bottom: string; /** lower field lit cyan (Korry type C: black letters on cyan) */ lit: boolean }
export interface CapCtx { zoom: number; range: number; northUp: boolean; terr: boolean; radar: boolean; wx: boolean; driveActive: boolean }

/** N/TRK-UP is a split cap like MAP/TERR: ORIENT on top, the CURRENT state in the lit field below. */
export function orientCap(northUp: boolean): SplitCap {
  return { top: 'ORIENT', bottom: northUp ? 'N-UP' : 'TRK-UP', lit: true };
}

/**
 * Backlit legend box on the edge key in hero v2 (Scott, Oct 18): N/TRK-UP is always a LIT split button, styled and
 * backlit like MAP/TERR (both orientations are a selected mode, the lit field says which). Other keys keep their state.
 */
export function heroKeyActive(id: string, active: boolean): boolean {
  return id === 'orient' ? true : active;
}

/** Split legend for an edge key id (null: leave the cap blank, e.g. an inert key). */
export function splitCap(id: string, c: CapCtx): SplitCap | null {
  switch (id) {
    case 'config': return { top: 'SET', bottom: '', lit: false };
    case 'zoomIn': return { top: '+', bottom: `${c.zoom} MI`, lit: false };
    case 'zoomOut': return { top: '\u2212', bottom: `${c.zoom} MI`, lit: false };
    case 'rngUp': return { top: '+', bottom: `${c.range} MI`, lit: false };
    case 'rngDown': return { top: '\u2212', bottom: `${c.range} MI`, lit: false };
    case 'orient': return orientCap(c.northUp);
    case 'mode': return c.radar ? { top: 'MODE', bottom: c.terr ? 'TERR' : 'MAP', lit: true } : { top: 'MAP', bottom: c.terr ? 'TERR' : 'OFF', lit: c.terr };
    case 'wx': return { top: 'WX', bottom: c.wx ? 'ON' : 'OFF', lit: c.wx };
    case 'drive': return { top: 'DRV', bottom: 'BOARD', lit: c.driveActive };
    case 'more': return { top: '\u2022\u2022\u2022', bottom: '', lit: false };
    case 'rtn': return { top: 'RTN', bottom: '', lit: false };
    case 'prev': return { top: '\u25C4', bottom: '', lit: false };
    case 'next': return { top: '\u25BA', bottom: '', lit: false };
    case 'sel': return { top: 'SEL', bottom: '', lit: false };
    default: return null;
  }
}

/* ------------------------------------------------------------------ RADAR 3-position lever lock */

/** Legends (Wilson): MX = up = radar scope on · WX = mid = scope with weather returns (rail v2: "weather on the scope only") ·
 *  OFF = down = radar off. The position ids stay up / mid / dn. */
export type RadarPos = 'up' | 'mid' | 'dn';
export function radarPos(radar: boolean, wx: boolean): RadarPos {
  return !radar ? 'dn' : wx ? 'mid' : 'up';
}
export function radarApply(pos: RadarPos): { radar: boolean; wx: boolean } {
  return { radar: pos !== 'dn', wx: pos === 'mid' };
}
/** One lever step up or down (clamped: a tap past the end stop says why instead of doing nothing silently). */
export function radarStep(pos: RadarPos, dir: 1 | -1): { pos: RadarPos; reason?: string } {
  const order: RadarPos[] = ['dn', 'mid', 'up'];
  const i = order.indexOf(pos) + dir;
  if (i < 0) return { pos, reason: 'Radar already at OFF' };
  if (i > 2) return { pos, reason: 'Radar already at MX' };
  return { pos: order[i] };
}
export const RADAR_SPOKEN: Readonly<Record<RadarPos, string>> = { up: 'MX, scope on', mid: 'WX, weather on the scope', dn: 'OFF' };

/* ------------------------------------------------------------------ START bank */

export type StartId = 'batt' | 'apu' | 'engL' | 'engR' | 'gen' | 'nav';
export interface StartDecl { id: StartId; label: string; spoken: string; /** Dan's system id it switches (gen: none, it follows the engines) */ system: string | null }
export const HV_START: readonly StartDecl[] = [
  { id: 'batt', label: 'BATT', spoken: 'Battery', system: 'batt' },
  { id: 'apu', label: 'APU', spoken: 'A P U', system: 'apu' },
  { id: 'engL', label: 'L ENG', spoken: 'Left engine', system: 'engL' },
  { id: 'engR', label: 'R ENG', spoken: 'Right engine', system: 'engR' },
  { id: 'gen', label: 'GEN', spoken: 'Generators', system: null },
  { id: 'nav', label: 'NAV', spoken: 'Nav platform', system: 'inertialNav' },
];
export interface StartInput { cold: boolean; running: boolean; on: Partial<Record<string, boolean>>; engines: { L: string; R: string } }
/** Toggle position per START switch. Without a cold start the bank mirrors the engine (all ON while running). */
export function startPositions(i: StartInput): Record<StartId, boolean> {
  if (!i.cold) return { batt: i.running, apu: i.running, engL: i.running, engR: i.running, gen: i.running, nav: i.running };
  const eng = (s: string) => s !== 'off';
  return {
    batt: !!i.on.batt,
    apu: !!i.on.apu,
    engL: eng(i.engines.L) || !!i.on.engL,
    engR: eng(i.engines.R) || !!i.on.engR,
    gen: i.engines.L === 'run' || i.engines.R === 'run',
    nav: !!i.on.inertialNav,
  };
}

/* ------------------------------------------------------------------ geometry (cells on CJ_GRID) */

export type HeroLayout = 'board' | 'window';
/** Annunciator caps: 104×44 at 1280 (rail v2 targets), 70×44 in the 773 drive window. */
export const HV_ANN_CAP: Readonly<Record<HeroLayout, { w: number; h: number; gap: number; pad: number }>> = {
  board: { w: 104, h: 44, gap: 8, pad: 4 },
  window: { w: 70, h: 44, gap: 4, pad: 4 },
};
export const annSize = (l: HeroLayout) => {
  const c = HV_ANN_CAP[l];
  return { w: 8 * c.w + 7 * c.gap + 2 * c.pad, h: c.h + 2 * c.pad };
};
/** Rail modules share the 118 px part height (Meghan's PULL / QUICK START / GPS plate minimum). */
export const HV_RAIL_H = 118;
/** Smallest rail width that holds every module at its minimum (design px). */
export const HV_RAIL_MIN_W: Readonly<Record<HeroLayout, number>> = { board: 1040, window: 660 };

/**
 * The hero's two cells for CJ_GRID: the measured plate / rail boxes once they are on screen, else their reserved
 * slots (top-right above the board, and the dock band under it) so the board never half-draws before IGNITION
 * puts the dock on screen.
 */
export function heroCells(cells: { speed: Box; sweep: Box; eng: Box; compass: Box }, hero: { ann?: Box | null; rail?: Box | null; layout?: HeroLayout } = {}): { ann: Box; rail: Box } {
  const l = hero.layout ?? 'board';
  const left = cells.speed.left, right = cells.sweep.left + cells.sweep.width;
  const top = cells.speed.top, bottom = Math.max(cells.eng.top + cells.eng.height, cells.compass.top + cells.compass.height);
  const a = annSize(l);
  const ann = hero.ann ?? { left: right - a.w, top: top - a.h - 72, width: a.w, height: a.h };
  const rail = hero.rail ?? { left, top: bottom + 12, width: Math.max(HV_RAIL_MIN_W[l], right - left), height: HV_RAIL_H };
  return { ann, rail };
}

/** Hit targets the hero declares (design px, the smallest size each one renders at). */
export const HV_ANN_TARGETS = HV_LAMPS.filter((d) => d.clearable).map((d) => ({ name: `${d.spoken}, clear`, w: HV_ANN_CAP.window.w, h: HV_ANN_CAP.window.h }));
export const HV_RAIL_TARGETS: readonly { name: string; w: number; h: number }[] = [
  { name: 'Radar up one position', w: 44, h: 50 },
  { name: 'Radar down one position', w: 44, h: 50 },
  { name: 'Afterburner guard', w: 44, h: 50 },
  { name: 'Afterburner ARM / SAFE', w: 44, h: 50 },
  ...HV_START.flatMap((s) => [{ name: `${s.label} on`, w: 44, h: 50 }, { name: `${s.label} off`, w: 44, h: 50 }]),
  { name: 'Quick start guard', w: 88, h: 64 },
  { name: 'Emergency stop handle', w: 56, h: 44 },
  { name: 'Hold to rev', w: 64, h: 48 },
  { name: 'Shutdown', w: 64, h: 48 },
];
