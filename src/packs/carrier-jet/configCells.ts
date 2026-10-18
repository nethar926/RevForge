/**
 * CONFIG tile placement on Board 2 (framework; pure). SPEED stays live (its K1 is CONFIG / RTN); the other seven
 * cells take tiles in reading order: slot 0 (MACH) = RTN, then the page's tiles (configTable.pageTiles).
 */
import type { CellId } from './geometry.ts';
export const CELL_ORDER: readonly CellId[] = ['mach', 'accel', 'vdi', 'sweep', 'eng', 'map', 'compass'];
export const TILE_SLOTS = CELL_ORDER.length;
/** Map-first (COMPASS ⇄ ACCEL swap, Oct 17): COMPASS sits in ACCEL's old narrow bottom cell, ACCEL in the wide bottom-right.
 * Tiles stay by position, so CONFIG is unchanged on screen: the narrow bottom cell (now COMPASS) keeps slot 1 (PLT on
 * home), the bottom-right (now ACCEL) keeps slot 6. */
export const CELL_ORDER_MAP_FIRST: readonly CellId[] = ['mach', 'compass', 'vdi', 'sweep', 'eng', 'map', 'accel'];
export const cellOrderFor = (mapFirst: boolean | undefined): readonly CellId[] => (mapFirst ? CELL_ORDER_MAP_FIRST : CELL_ORDER);
