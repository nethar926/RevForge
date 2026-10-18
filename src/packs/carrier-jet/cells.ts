/**
 * Carrier Jet's cell declaration on the shared grid (packs/grid/contract.ts). CJ is the first theme on it.
 * Board 2 is laid out by the skin's CSS grid (re-gridded by carrier-jet-v2.css), so CJ's board / window rects are a
 * `derive` rule: the host measures seven skin anchors and geometry.ts turns them into the eight cells (board2Cells,
 * or board2CellsMapFirst with MAP spanning both rows). Phones keep the skin's own full-board CSS: those layouts are
 * null (no host cells, no edge keys; every function is a direct tap there).
 */
import type { GridSpec } from '../grid/contract.ts';
import { board2Cells, board2CellsMapFirst, KEY_GAP, KEY_H, KEY_W, type Box, type CellId } from './geometry.ts';

/** The skin rects the host measures (relative to the .cjm host). */
export interface CjAnchors { speed: Box; rpm: Box; mach: Box; vdi: Box; sweep: Box; eng: Box; compass: Box }
export interface CjGridCtx { anchors: CjAnchors; mapFirst: boolean }

const derive = ({ anchors, mapFirst }: CjGridCtx) => (mapFirst ? board2CellsMapFirst : board2Cells)(anchors);

export const CJ_GRID: GridSpec<CellId, CjGridCtx> = {
  id: 'carrier-jet',
  // CarrierJetMount's useFitBox box (the HUD fills it unscaled; the skin sizes itself from container units)
  fit: { w: 1280, minH: 520, maxH: 740, fallbackH: 720 },
  // Meghan's BezelKey frame: 52×66 (18 px legend slot + a 44×44 cap), 4 px apart, up to 4 per strip (MAP: 5 with WX)
  rail: { key: { w: KEY_W, h: KEY_H, gap: KEY_GAP }, hit: { w: 44, h: 44 }, max: 4 },
  cells: [
    { id: 'speed', name: 'SPEED', role: 'readout', drawnBy: 'skin', rail: true, minText: 11 },
    { id: 'mach', name: 'MACH + RPM', role: 'readout', drawnBy: 'skin', rail: true, minText: 11 },
    { id: 'accel', name: 'ACCEL', role: 'readout', drawnBy: 'host', rail: true, minText: 11 },
    { id: 'vdi', name: 'VDI', role: 'readout', drawnBy: 'skin', rail: true, minText: 11 },
    { id: 'sweep', name: 'WING SWEEP', role: 'readout', drawnBy: 'skin', rail: true, minText: 11 },
    { id: 'eng', name: 'AOA / ENG', role: 'readout', drawnBy: 'skin', rail: true, minText: 11 },
    { id: 'map', name: 'MAP / RADAR', role: 'readout', drawnBy: 'host', rail: true, minText: 11, targets: [{ name: 'map credit (i)', w: 44, h: 44 }] },
    { id: 'compass', name: 'COMPASS', role: 'readout', drawnBy: 'skin', rail: true, minText: 11 },
  ],
  layouts: {
    board: { kind: 'derive', derive },
    window: { kind: 'derive', derive },
    portrait: null,
    'phone-landscape': null,
  },
};
