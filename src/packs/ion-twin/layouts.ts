/**
 * Twin Ion Cold Glass layouts on the CJ shared grid (Meghan ti-cj-grid-v1 Fix 1).
 * Absolute CSS-px rects match the approved mock HTML; no global scale between sizes.
 * 844 is out of scope.
 */
import type { Rect } from '../grid/contract';

export type TiSize = 'd1280' | 'd1024' | 'd773';
export type TiCellId =
  | 'speed'
  | 'mach'
  | 'vdi'
  | 'compass'
  | 'map'
  | 'accel'
  | 'power'
  | 'modes'
  | 'mapKeys'
  | 'glyphs'
  | 'title';

export interface TiBox {
  w: number;
  h: number;
}

export const TI_BOX: Record<TiSize, TiBox> = {
  d1280: { w: 1280, h: 800 },
  d1024: { w: 1024, h: 705 },
  d773: { w: 773, h: 601 },
};

/** Scope art: native DPR crops. 1280 uses 1280 source; 1024/773 share the 773 source. */
export const TI_SCOPE: Record<TiSize, { left: number; top: number; size: number; asset: '1280' | '773' }> = {
  d1280: { left: 332, top: 138, size: 360, asset: '1280' },
  d1024: { left: 313, top: 134, size: 218, asset: '773' },
  d773: { left: 226, top: 108, size: 218, asset: '773' },
};

const R = (left: number, top: number, width: number, height: number): Rect => ({ left, top, width, height });

export const TI_CELLS: Record<TiSize, Record<TiCellId, Rect>> = {
  d1280: {
    map: R(748, 126, 460, 460),
    speed: R(28, 126, 250, 224),
    mach: R(28, 362, 250, 224),
    vdi: R(332, 138, 360, 360),
    compass: R(300, 524, 424, 62),
    accel: R(28, 648, 336, 49),
    power: R(372, 598, 616, 99),
    modes: R(28, 598, 336, 44),
    mapKeys: R(1036, 532, 160, 44),
    glyphs: R(970, 22, 156, 44),
    title: R(145, 22, 810, 48),
  },
  d1024: {
    map: R(616, 122, 382, 382),
    speed: R(24, 122, 204, 185),
    mach: R(24, 319, 204, 185),
    vdi: R(313, 134, 218, 218),
    compass: R(252, 378, 340, 126),
    accel: R(24, 566, 336, 49),
    power: R(368, 516, 364, 99),
    modes: R(24, 516, 336, 44),
    mapKeys: R(826, 450, 160, 44),
    glyphs: R(714, 22, 156, 44),
    title: R(145, 22, 554, 48),
  },
  d773: {
    map: R(483, 126, 272, 272),
    speed: R(18, 126, 168, 130),
    mach: R(18, 268, 168, 130),
    vdi: R(226, 108, 218, 218),
    compass: R(204, 352, 261, 54),
    accel: R(18, 460, 210, 52),
    power: R(236, 460, 211, 52),
    modes: R(18, 410, 312, 44),
    mapKeys: R(583, 344, 160, 44),
    glyphs: R(463, 22, 156, 44),
    title: R(120, 22, 330, 48),
  },
};

/** Mode key positions (SURGE/PILOT/CRUISE/HUNT) relative to the modes strip origin. */
export const TI_MODE_KEYS: Record<TiSize, { w: number; gap: number }> = {
  d1280: { w: 78, gap: 8 },
  d1024: { w: 78, gap: 8 },
  d773: { w: 72, gap: 8 },
};

export const TI_MAP_KEYS: Record<TiSize, { w: number; gap: number; labels: readonly string[] }> = {
  d1280: { w: 48, gap: 8, labels: ['ZM+', 'ZM−', 'N-UP'] },
  d1024: { w: 48, gap: 8, labels: ['ZM+', 'ZM−', 'N-UP'] },
  d773: { w: 48, gap: 8, labels: ['ZM+', 'ZM−', 'N-UP'] },
};

/** 773 host-control foot under the throttle bay (mock lower rail; no overlap after throttle at y410). */
export const TI_HOST_FOOT = R(449, 484, 300, 28);


/**
 * Pick the native mock size from the stage. Drive-window / narrow → 773;
 * mid board fill → 1024; otherwise 1280. Spec: no 844.
 */
export function pickTiSize(stageW: number, stageH: number, driveWindow: boolean): TiSize {
  if (driveWindow || stageW < 900 || stageH < 640) return 'd773';
  if (stageW < 1152) return 'd1024';
  return 'd1280';
}
