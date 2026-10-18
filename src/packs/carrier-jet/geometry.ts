/**
 * Carrier Jet v2 board geometry (framework; pure). The skin's cells are re-gridded by host CSS (carrier-jet-v2.css);
 * the host layer draws ACCEL, MAP, the edge keys and CONFIG over them, positioned from the measured skin cells.
 */
import { railCount, railXs } from '../grid/rail.ts';

/** Same shape as the shared grid's Rect (packs/grid/contract.ts). */
export interface Box { left: number; top: number; width: number; height: number }
export type CellId = 'speed' | 'mach' | 'accel' | 'vdi' | 'sweep' | 'eng' | 'map' | 'compass';
export const TOP_CELLS: readonly CellId[] = ['speed', 'mach', 'accel', 'vdi', 'sweep'];
export const BOTTOM_CELLS: readonly CellId[] = ['eng', 'map', 'compass'];

/** Raw skin rects (relative to the board) → Board 2 cells. ACCEL and MAP are the empty grid areas between them.
 * SPEED has the whole first column; RPM sits under MACH, so the MACH cell runs down to RPM's bottom. */
export function board2Cells(r: {
  speed: Box; rpm: Box; mach: Box; vdi: Box; sweep: Box; eng: Box; compass: Box;
}): Record<CellId, Box> {
  // the ACCEL column sits between MACH and VDI: that span = ACCEL width + one column gap each side
  const col = (r.vdi.left - (r.mach.left + r.mach.width));
  const cg = Math.max(0, r.mach.left - (r.speed.left + r.speed.width));
  const accel: Box = { left: r.mach.left + r.mach.width + cg, top: r.mach.top, width: Math.max(0, col - 2 * cg), height: r.mach.height };
  return {
    speed: r.speed,
    mach: { left: r.mach.left, top: r.mach.top, width: r.mach.width, height: r.rpm.top + r.rpm.height - r.mach.top },
    accel,
    vdi: r.vdi,
    sweep: r.sweep,
    eng: r.eng,
    map: { left: r.vdi.left, top: r.compass.top, width: r.vdi.width, height: r.compass.height },
    compass: r.compass,
  };
}

/** Map-first gate: v2 board on the Tesla layouts (board 1280/1256 · window 773), in Drive AND Park (Wilson's square-map
 * rule, Meghan Oct 17: Park is laid out like Drive, MAP spanning both instrument rows; one design, no Board 2 in Park). */
export const cjMapFirst = (s: { v2: boolean; tesla: boolean }): boolean => s.v2 && s.tesla;

/**
 * Square MAP (Wilson's rule): the map-first MAP cell is as wide as its two-row span is tall. The span (MACH's top to
 * COMPASS's bottom) comes from the body's rows alone (fixed px + fr of the body height), so it does not move when the
 * columns change: the host sets the MAP column to this many px (--cjv2-map-side, carrier-jet-v2.css) and the other
 * columns (fr) give way. Never shrunk to fit. Rounded to 1/100 px.
 */
export function mapSquareSide(r: { mach: Box; compass: Box }): number {
  return Math.max(0, Math.round((r.compass.top + r.compass.height - r.mach.top) * 100) / 100);
}

/**
 * Map-first DRIVE (Meghan's mock, ported). Host CSS (carrier-jet-v2.css, .cjm[data-cj-mapfirst='drive'])
 * moves the skin's VDI into column 3 of the top row (beside MACH); ACCEL goes under it in the second row (column 3,
 * beside a narrower AOA/ENG in columns 1-2; since Oct 17 COMPASS takes that narrow cell and ACCEL the wide bottom-right one). MAP then spans the centre column over both rows (VDI's old cell + its own,
 * including the top key row it no longer needs). ACCEL is measured from VDI's column and COMPASS's row.
 */
export function board2CellsMapFirst(r: {
  speed: Box; rpm: Box; mach: Box; vdi: Box; sweep: Box; eng: Box; compass: Box;
}): Record<CellId, Box> {
  const cg = Math.max(0, r.mach.left - (r.speed.left + r.speed.width));
  const mapLeft = r.vdi.left + r.vdi.width + cg, mapRight = r.sweep.left - cg;
  return {
    speed: r.speed,
    mach: { left: r.mach.left, top: r.mach.top, width: r.mach.width, height: r.rpm.top + r.rpm.height - r.mach.top },
    // COMPASS ⇄ ACCEL swap (Oct 17): the skin's COMPASS is moved (CSS) into column 3 of the bottom row; ACCEL (host)
    // takes the bottom-right cell under WING SWEEP (WING SWEEP's column, COMPASS's row)
    accel: { left: r.sweep.left, top: r.compass.top, width: r.sweep.width, height: r.compass.height },
    vdi: r.vdi,
    sweep: r.sweep,
    eng: r.eng,
    map: { left: mapLeft, top: r.mach.top, width: Math.max(0, mapRight - mapLeft), height: r.compass.top + r.compass.height - r.mach.top },
    compass: r.compass,
  };
}
/** Map-first: the cells whose key strip sits under the top row (ACCEL is a bottom-row cell there). */
export const TOP_CELLS_MAP_FIRST: readonly CellId[] = ['speed', 'mach', 'vdi', 'sweep'];

/** Meghan's BezelKey frame: 52×66 (18px legend slot + 44×44 cap). */
export const KEY_W = 52;
export const KEY_H = 66;
export const KEY_GAP = 4;
/** Keys per cell by width (up to 4, or `max`; narrow cells get fewer, never 0). */
const KEY = { w: KEY_W, h: KEY_H, gap: KEY_GAP };
export function keyCount(width: number, max = 4): number {
  return railCount(width, KEY, max);
}
/** Left x of each key, centred under the cell (the shared grid's rail slots). */
export function keyXs(cell: Box, n: number): number[] {
  return railXs(cell, n, KEY);
}

/** Overlap area of two boxes (gate helper). */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}
