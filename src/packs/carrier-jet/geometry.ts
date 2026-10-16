/**
 * Carrier Jet v2 board geometry (framework; pure). The skin's cells are re-gridded by host CSS (carrier-jet-v2.css);
 * the host layer draws ACCEL, MAP, the edge keys and CONFIG over them, positioned from the measured skin cells.
 */
export interface Box { left: number; top: number; width: number; height: number }
export type CellId = 'speed' | 'mach' | 'accel' | 'vdi' | 'sweep' | 'eng' | 'map' | 'compass';
export const TOP_CELLS: readonly CellId[] = ['speed', 'mach', 'accel', 'vdi', 'sweep'];
export const BOTTOM_CELLS: readonly CellId[] = ['eng', 'map', 'compass'];

/** Raw skin rects (relative to the board) → Board 2 cells. ACCEL and MAP are the empty grid areas between them. */
export function board2Cells(r: {
  speed: Box; rpm: Box; mach: Box; vdi: Box; sweep: Box; eng: Box; compass: Box;
}): Record<CellId, Box> {
  // the ACCEL column sits between MACH and VDI: that span = ACCEL width + one column gap each side
  const col = (r.vdi.left - (r.mach.left + r.mach.width));
  const cg = Math.max(0, r.mach.left - (r.speed.left + r.speed.width));
  const accel: Box = { left: r.mach.left + r.mach.width + cg, top: r.mach.top, width: Math.max(0, col - 2 * cg), height: r.mach.height };
  return {
    speed: { left: r.speed.left, top: r.speed.top, width: r.speed.width, height: r.rpm.top + r.rpm.height - r.speed.top },
    mach: r.mach,
    accel,
    vdi: r.vdi,
    sweep: r.sweep,
    eng: r.eng,
    map: { left: r.vdi.left, top: r.compass.top, width: r.vdi.width, height: r.compass.height },
    compass: r.compass,
  };
}

/** Meghan's BezelKey frame: 52×66 (18px legend slot + 44×44 cap). */
export const KEY_W = 52;
export const KEY_H = 66;
export const KEY_GAP = 4;
/** Keys per cell by width (up to 4; narrow cells get fewer, never 0). */
export function keyCount(width: number): number {
  return Math.max(1, Math.min(4, Math.floor((width + KEY_GAP) / (KEY_W + KEY_GAP))));
}
/** Left x of each key, centred under the cell. */
export function keyXs(cell: Box, n: number): number[] {
  const total = n * KEY_W + (n - 1) * KEY_GAP;
  const x0 = cell.left + (cell.width - total) / 2;
  return Array.from({ length: n }, (_, i) => Math.round(x0 + i * (KEY_W + KEY_GAP)));
}

/** Overlap area of two boxes (gate helper). */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}
