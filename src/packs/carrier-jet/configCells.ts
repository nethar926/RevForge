/**
 * CONFIG tile placement on Board 2 (framework; pure). SPEED stays live (its K1 is CONFIG / RTN); the other seven
 * cells take tiles in reading order: slot 0 (MACH) = RTN, then the page's tiles (configTable.pageTiles).
 */
import type { CellId } from './geometry.ts';
export const CELL_ORDER: readonly CellId[] = ['mach', 'accel', 'vdi', 'sweep', 'eng', 'map', 'compass'];
export const TILE_SLOTS = CELL_ORDER.length;
