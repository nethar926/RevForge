/*
 * Sizes, floors and pure view helpers for the Carrier Jet cold-start parts. No React here, so tests and the
 * host can import it directly.
 *
 * Every part is a fixed-viewBox SVG that scales to its container width. One viewBox unit = 1 CSS px at the
 * minimum size, and the smallest text in any viewBox is 11 units and the smallest target 44 units, so
 * rendering at or above the *_MIN size keeps text >= 11px and targets >= 44x44 CSS px.
 */
import type { CjGps, CjStartMode, CjSystemEntry, CjSystemGroup, CjToggleState } from '../types';

export interface CjSize { readonly w: number; readonly h: number }

/** Smallest text in any part (viewBox units = CSS px at *_MIN). */
export const TEXT_MIN_UNITS = 11;
/** Smallest hit target side in any part (viewBox units = CSS px at *_MIN). */
export const TARGET_MIN_UNITS = 44;

/** Bat toggle cell. */
export const TOGGLE_MIN: CjSize = { w: 60, h: 96 };
/** Hinge band a guard adds above its child. */
export const GUARD_BAND = 44;
/** Toggle under a guard. */
export const GUARDED_TOGGLE_MIN: CjSize = { w: 60, h: 96 + GUARD_BAND };
/** APU block (guarded START 64 + gap 4 + READY 60). */
export const APU_BLOCK_MIN: CjSize = { w: 128, h: 96 + GUARD_BAND };
/** GND AIR (60) + gap 4 + X-BLEED (76). */
export const GND_AIR_MIN: CjSize = { w: 140, h: 96 };
/** EMER STOP plate. */
export const PULL_MIN: CjSize = { w: 76, h: 118 };
export const PULL_MIN_NARROW: CjSize = { w: 66, h: 118 };
/** PULL grip hit area (moves with the handle). */
export const PULL_GRIP: CjSize = { w: 64, h: 44 };
/** Handle travel to fire, in units (= CSS px at PULL_MIN). Detent tick at half. */
export const PULL_TRAVEL = 40;
/** QUICK START plate. */
export const QUICK_START_MIN: CjSize = { w: 118, h: 118 };
export const QUICK_START_MIN_NARROW: CjSize = { w: 96, h: 118 };
/** GPS plate (two bulbs + ACQ). */
export const PLATE_MIN: CjSize = { w: 50, h: 118 };
export const PLATE_MIN_NARROW: CjSize = { w: 44, h: 118 };
/** RADAR toggle plate. */
export const RADAR_MIN: CjSize = { w: 56, h: 118 };
export const RADAR_MIN_NARROW: CjSize = { w: 44, h: 118 };
/** GPS + RADAR shared plate: 50 + 1 divider + 56 at 1280, 44 + 1 + 44 = 89 at 773 (sheet). */
export const GPS_RADAR_PLATE_MIN: CjSize = { w: 107, h: 118 };
export const GPS_RADAR_PLATE_MIN_NARROW: CjSize = { w: 89, h: 118 };
/** MFD edge key frame: 18-unit legend slot + 2 gap + 44×44 key, 4 units of side margin. */
export const BEZEL_KEY_MIN: CjSize = { w: 52, h: 66 };

/** Bottom-row ids the shelf leaves out by default (they live in the bank, always live). */
export const CJ_SHELF_BOTTOM_ROW_IDS: readonly string[] = ['quickStartGuard', 'quickStart', 'emergencyStop'];
/** Ids a start block replaces on the shelf. */
export const CJ_SHELF_BLOCK_IDS: Readonly<Record<CjStartMode, readonly string[]>> = {
  apu: ['apu'],
  gndAir: ['aircart', 'crossbleed'],
};
/** Group order on the panel and the two-row layout (POWER · FUEL · LIGHTS over ENGINES · SYSTEMS). */
export const CJ_SHELF_GROUPS: readonly CjSystemGroup[] = ['POWER', 'FUEL', 'ENGINES', 'SYSTEMS', 'LIGHTS'];
export const CJ_SHELF_ROWS: readonly (readonly CjSystemGroup[])[] = [['POWER', 'FUEL', 'LIGHTS'], ['ENGINES', 'SYSTEMS']];

/* ------------------------------------------------------------------ toggle */

/** Next position a tap asks for. */
export function nextToggle(state: CjToggleState): CjToggleState {
  return state === 'off' ? 'on' : 'off';
}

/** Default throw legend. */
export function toggleLegend(state: CjToggleState, disabled?: boolean): string {
  if (disabled) return 'LOCKED';
  return state === 'on' ? 'ON' : state === 'momentary' ? 'HOLD' : 'OFF';
}

/** Lamp colour of a toggle: green on+lit, amber momentary+lit, else dark. */
export function toggleLamp(state: CjToggleState, lit: boolean, disabled?: boolean): 'off' | 'green' | 'amber' {
  if (disabled || !lit) return 'off';
  return state === 'on' ? 'green' : state === 'momentary' ? 'amber' : 'off';
}

/**
 * Split an engraved label into at most 2 lines of <= maxChars (greedy on spaces). Labels are uppercased.
 * A single word longer than maxChars stays whole on its own line (the art condenses it to fit).
 */
export function labelLines(label: string, maxChars = 7): string[] {
  const words = label.toUpperCase().trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + w.length <= maxChars) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  if (lines.length <= 2) return lines;
  return [lines[0], lines.slice(1).join(' ')];
}

/* ------------------------------------------------------------------ GPS */

export interface CjGpsView {
  /** Top bulb. */
  red: 'off' | 'lit';
  /** Bottom bulb. 'pulse' = ~1 Hz soft cosine 35→100% (Reduce Motion: steady 50%). */
  green: 'off' | 'lit' | 'pulse';
  /** ACQ legend: unlit engraving, or lit green following the pulse (Reduce Motion: steady lit). */
  acq: 'unlit' | 'lit';
  /** VoiceOver label. */
  label: 'GPS off' | 'GPS unavailable' | 'GPS searching' | 'GPS live';
}

/** GPS state → bulbs, ACQ and VoiceOver label (sheet NOTES §6). */
export function gpsView(gps: CjGps): CjGpsView {
  switch (gps) {
    case 'fail':
      return { red: 'lit', green: 'off', acq: 'unlit', label: 'GPS unavailable' };
    case 'acq':
      return { red: 'off', green: 'pulse', acq: 'lit', label: 'GPS searching' };
    case 'live':
      return { red: 'off', green: 'lit', acq: 'unlit', label: 'GPS live' };
    default:
      return { red: 'off', green: 'off', acq: 'unlit', label: 'GPS off' };
  }
}

/** ACQ unlit engraving fill (Wilson's #152411 lightened on the same hue) and its 1px light catch. */
export const ACQ_UNLIT_FILL = '#1f3619';
export const ACQ_EDGE = '#b4bbbf';
/** ACQ lit colour (peak) and the base it mixes from (sheet parts.js). */
export const ACQ_LIT = '#8dffad';
const ACQ_MIX_BASE = [130, 179, 143] as const;
const ACQ_MIX_LIT = [141, 255, 173] as const;
/** Green bulb pulse range and the ACQ legend's own mix range (never below 50% lit → >= 4.5:1). */
export const GPS_PULSE = { bulbMin: 0.35, bulbMax: 1, acqMin: 0.5, acqMax: 1, periodMs: 1000, reduceMotionBulb: 0.5 } as const;

/** Lit ACQ colour for a bulb brightness 0.35..1 (mix 50..100% lit). */
export function acqLitColor(bulb: number): string {
  const b = Math.max(GPS_PULSE.bulbMin, Math.min(1, bulb));
  const ph = GPS_PULSE.acqMin + (GPS_PULSE.acqMax - GPS_PULSE.acqMin) * ((b - GPS_PULSE.bulbMin) / (1 - GPS_PULSE.bulbMin));
  const c = ACQ_MIX_BASE.map((u, i) => Math.round(u + (ACQ_MIX_LIT[i] - u) * ph));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
/** ACQ at the dim trough of the pulse. */
export const ACQ_TROUGH = acqLitColor(GPS_PULSE.bulbMin);

/* ------------------------------------------------------------------ PULL */

export interface CjPullView {
  /** Handle travel in units, 0..44 (fired latches past the 40 line). */
  travel: number;
  legend: string;
  /** Legend tone. */
  tone: 'plain' | 'amber';
}

export function pullView(phase: 'rest' | 'pulling' | 'fired', progress: number): CjPullView {
  if (phase === 'fired') return { travel: PULL_TRAVEL + 4, legend: 'STOPPED', tone: 'amber' };
  if (phase === 'pulling') {
    const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
    return { travel: p * PULL_TRAVEL, legend: `${Math.round(p * PULL_TRAVEL)} / ${PULL_TRAVEL}`, tone: 'amber' };
  }
  return { travel: 0, legend: 'PULL ▼', tone: 'plain' };
}

/* ------------------------------------------------------------------ shelf layout */

export interface CjShelfItem {
  kind: 'toggle' | 'block';
  /** First system id (the block's anchor id for blocks). */
  id: string;
  entry?: CjSystemEntry;
  /** Size in units. */
  w: number;
  h: number;
}
export interface CjShelfGroupLayout { group: CjSystemGroup; items: CjShelfItem[] }

const sideRank = (e: CjSystemEntry) => (e.side === 'L' ? 1 : e.side === 'R' ? 2 : 0);

/**
 * Groups the host's list for the shelf: drops `exclude`, swaps the mode's block ids for one block item placed at
 * the first of them, keeps L before R within a group (stable). Empty groups are dropped.
 */
export function shelfGroups(
  systems: readonly CjSystemEntry[],
  opts: { mode: CjStartMode; hasBlock: boolean; exclude?: readonly string[]; guards?: Readonly<Record<string, boolean>> },
): CjShelfGroupLayout[] {
  const exclude = new Set(opts.exclude ?? CJ_SHELF_BOTTOM_ROW_IDS);
  const blockIds = new Set(opts.hasBlock ? CJ_SHELF_BLOCK_IDS[opts.mode] : []);
  const blockSize = opts.mode === 'apu' ? APU_BLOCK_MIN : GND_AIR_MIN;
  let blockPlaced = false;
  const out: CjShelfGroupLayout[] = [];
  for (const group of CJ_SHELF_GROUPS) {
    const entries = systems
      .filter((e) => e.group === group && !exclude.has(e.id))
      .map((e, i) => ({ e, i }))
      .sort((a, b) => sideRank(a.e) - sideRank(b.e) || a.i - b.i)
      .map((x) => x.e);
    const items: CjShelfItem[] = [];
    for (const e of entries) {
      if (blockIds.has(e.id)) {
        if (!blockPlaced) items.push({ kind: 'block', id: e.id, w: blockSize.w, h: blockSize.h });
        blockPlaced = true;
        continue;
      }
      const guarded = opts.guards ? Object.prototype.hasOwnProperty.call(opts.guards, e.id) : false;
      items.push({ kind: 'toggle', id: e.id, entry: e, w: TOGGLE_MIN.w, h: guarded ? GUARDED_TOGGLE_MIN.h : TOGGLE_MIN.h });
    }
    if (items.length) out.push({ group, items });
  }
  return out;
}

/** Shelf chrome in CSS px (fixed, not scaled). */
export const SHELF_CHROME = { padX: 8, padTop: 34, padBottom: 8, groupPadX: 6, groupPadTop: 16, groupPadBottom: 6, groupGap: 8, rowGap: 8, cellGap: 3 } as const;

export interface CjShelfMetrics {
  rows: CjShelfGroupLayout[][];
  /** Per row: fixed px and scalable units, so cell scale s = min over rows of (W - fixed) / units. */
  rowFixed: number[];
  rowUnits: number[];
  /** Height: fixed px + units (sum of each row's tallest item). */
  heightFixed: number;
  heightUnits: number;
  /** Smallest box that keeps scale >= 1 (text >= 11px, targets >= 44px). */
  min: CjSize;
}

/** Two-row layout metrics for a grouped list. */
export function shelfMetrics(groups: CjShelfGroupLayout[]): CjShelfMetrics {
  const C = SHELF_CHROME;
  const byName = new Map(groups.map((g) => [g.group, g]));
  const rows = CJ_SHELF_ROWS.map((r) => r.map((n) => byName.get(n)).filter((g): g is CjShelfGroupLayout => !!g)).filter((r) => r.length);
  const rowFixed = rows.map((r) => 2 * C.padX + (r.length - 1) * C.groupGap + r.reduce((a, g) => a + 2 * C.groupPadX + (g.items.length - 1) * C.cellGap, 0));
  const rowUnits = rows.map((r) => r.reduce((a, g) => a + g.items.reduce((b, it) => b + it.w, 0), 0));
  const heightFixed = C.padTop + C.padBottom + (rows.length - 1) * C.rowGap + rows.length * (C.groupPadTop + C.groupPadBottom);
  const heightUnits = rows.reduce((a, r) => a + Math.max(...r.flatMap((g) => g.items.map((it) => it.h))), 0);
  const w = Math.ceil(Math.max(...rowFixed.map((f, i) => f + rowUnits[i])));
  return { rows, rowFixed, rowUnits, heightFixed, heightUnits, min: { w, h: Math.ceil(heightFixed + heightUnits) } };
}

/** Largest cell scale (1 = *_MIN) that fits a w×h box. */
export function shelfScale(m: CjShelfMetrics, w: number, h: number): number {
  const sw = Math.min(...m.rowFixed.map((f, i) => (w - f) / m.rowUnits[i]));
  const sh = (h - m.heightFixed) / m.heightUnits;
  return Math.min(sw, sh);
}

/** Shelf slot boxes from the placement sheets (the reflow board box). */
export const SHELF_SLOTS = { w1280: { w: 1248, h: 641 }, w773: { w: 757, h: 376 } } as const;
