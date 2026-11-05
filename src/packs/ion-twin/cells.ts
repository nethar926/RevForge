/**
 * Twin Ion cell declaration on the shared grid (packs/grid/contract.ts).
 * Board = 1280 Cold Glass fill; window = 773 drive window. 1024 board-fill is selected
 * inside the mount (same board layout family; different absolute rects from Meghan's sheet).
 * 844 is out of scope. Phones stay null (no approved phone sheet).
 */
import type { GridSpec } from '../grid/contract';
import { TI_BOX, TI_CELLS, type TiCellId } from './layouts';

const board = TI_CELLS.d1280;
const win = TI_CELLS.d773;

export const TI_GRID: GridSpec<TiCellId> = {
  id: 'ion-twin',
  fit: { w: TI_BOX.d1280.w, minH: TI_BOX.d1280.h, maxH: TI_BOX.d1280.h, fallbackH: TI_BOX.d1280.h },
  fitFor: {
    window: { w: TI_BOX.d773.w, minH: TI_BOX.d773.h, maxH: TI_BOX.d773.h, fallbackH: TI_BOX.d773.h },
  },
  rail: { key: { w: 48, h: 44, gap: 8 }, hit: { w: 44, h: 44 }, max: 4 },
  cells: [
    { id: 'speed', name: 'VELOCITY', role: 'readout', drawnBy: 'skin', minText: 11 },
    { id: 'mach', name: 'TACH', role: 'readout', drawnBy: 'skin', minText: 11 },
    { id: 'vdi', name: 'SCOPE', role: 'readout', drawnBy: 'skin', minText: 11 },
    { id: 'compass', name: 'SENSOR / LOCK', role: 'readout', drawnBy: 'skin', minText: 11 },
    { id: 'map', name: 'MAP', role: 'readout', drawnBy: 'skin', minText: 11, targets: [{ name: 'map ZM+', w: 48, h: 44 }, { name: 'map ZM−', w: 48, h: 44 }, { name: 'map N-UP', w: 48, h: 44 }] },
    { id: 'accel', name: 'INERTIA', role: 'readout', drawnBy: 'skin', minText: 11 },
    { id: 'power', name: 'ION CELLS / CAUTION', role: 'readout', drawnBy: 'skin', minText: 11 },
    { id: 'modes', name: 'DRIVE MODE', role: 'readout', drawnBy: 'skin', minText: 11, targets: [{ name: 'SURGE', w: 72, h: 44 }, { name: 'PILOT', w: 72, h: 44 }, { name: 'CRUISE', w: 72, h: 44 }, { name: 'HUNT', w: 72, h: 44 }] },
    { id: 'mapKeys', name: 'MAP KEYS', role: 'decoration', drawnBy: 'skin', z: 0, minText: 11 },
    { id: 'glyphs', name: 'GLYPHS', role: 'target', drawnBy: 'skin', minText: 11, minSize: { w: 156, h: 44 } },
    { id: 'title', name: 'TITLE', role: 'decoration', drawnBy: 'skin', z: 0, minText: 11 },
  ],
  layouts: {
    board: { kind: 'rects', rects: board },
    window: { kind: 'rects', rects: win },
    portrait: null,
    'phone-landscape': null,
  },
};
