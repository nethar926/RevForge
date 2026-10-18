/**
 * Carrier Jet v2 edge keys (framework; pure, node-testable). One strip of Meghan's BezelKeys under each Board 2 cell
 * (legend on the CRT edge slot, blank 44×44 cap). Narrow cells get fewer keys (geometry.keyCount). A key without a
 * legend is inert (darker, disabled, hidden from VoiceOver). Phones: no edge keys (direct tap only). PULL, SPEED's
 * readout, the AB guard and SHUTDOWN are never on an edge key.
 *   Board:  SPEED K1 = CONFIG · MAP keys follow RADAR (ZM+ ZM− N/TRK-UP ↔ RNG+ RNG− MODE) · others inert.
 *   CONFIG: SPEED K1 = RTN, K2/K3 = ◄ ► when the page has more tiles than cells · each tile cell K1 = SEL.
 *   NAV → SPDS (Meghan, Oct 16; CJ v3): the bottom-row NAV panel is gone. Right bank (the keys under COMPASS, board
 *   and CONFIG): K1 DRIVE (legend lit on the board, unlit inside CONFIG; press = RTN to the board), K2 MORE (the MORE
 *   sheet), K3 inert spare (data-reason=spare). OPTIONS = CONFIG › OPT, MUTE = CONFIG › SND › AUDIO MUTE. The COMPASS
 *   tile in CONFIG is tapped directly (its K1 is DRIVE).
 */
import { CELL_ORDER } from './configCells.ts';
import type { CellId } from './geometry.ts';
import { mapKeys, type MapKeyId, type MapView } from './mapView.ts';

export type EdgeKeyId = 'config' | 'rtn' | 'prev' | 'next' | 'sel' | 'drive' | 'more' | MapKeyId;
export interface EdgeKey {
  id: EdgeKeyId;
  legend: string;
  ariaLabel: string;
  active?: boolean;
  /** Pressable but can't act right now (end stop / Park only): announced, no effect. */
  reason?: string;
}
export interface EdgeCtx {
  map: MapView;
  /** MORE sheet open (MORE key boxed). */
  moreOpen?: boolean;
  /** null = board; else the open CONFIG page's tiles per cell (label or null) and its sub-page count. */
  config: null | { tiles: Partial<Record<CellId, { label: string; reason?: string } | null>>; subs: number };
  /** The cell under the bottom-right strip (the right bank); default RIGHT_BANK. Map-first: ACCEL (rightBankFor). */
  bank?: CellId;
}

export function cellKeys(cell: CellId, n: number, c: EdgeCtx): (EdgeKey | null)[] {
  const keys: (EdgeKey | null)[] = [];
  if (cell === (c.bank ?? RIGHT_BANK)) {
    keys.push(
      { id: 'drive', legend: 'DRIVE', ariaLabel: c.config ? 'Drive, return to the board' : 'Drive, board showing', active: !c.config },
      { id: 'more', legend: 'MORE', ariaLabel: c.moreOpen ? 'More, open' : 'More', active: !!c.moreOpen },
    );
  } else if (!c.config) {
    if (cell === 'speed') keys.push({ id: 'config', legend: 'CONFIG', ariaLabel: 'Open config' });
    if (cell === 'map') for (const k of mapKeys(c.map)) keys.push({ id: k.id, legend: k.legend, ariaLabel: k.disabledReason ? `${k.ariaLabel}. ${k.disabledReason}` : k.ariaLabel, reason: k.disabledReason, active: k.id === 'mode' ? c.map.mode === 'terr' : k.id === 'orient' ? !c.map.northUp : false });
  } else if (cell === 'speed') {
    keys.push({ id: 'rtn', legend: 'RTN', ariaLabel: 'Return' });
    if (c.config.subs > 1 && n >= 3) {
      keys.push({ id: 'prev', legend: '◄', ariaLabel: 'Previous tiles' }, { id: 'next', legend: '►', ariaLabel: 'Next tiles' });
    }
  } else {
    const t = c.config.tiles[cell];
    if (t) keys.push({ id: 'sel', legend: 'SEL', ariaLabel: t.reason ? `Select ${t.label}. ${t.reason}` : `Select ${t.label}`, reason: t.reason });
  }
  const out = keys.slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

/** The right bank (NAV → SPDS): the keys under COMPASS; K3 is the inert spare. */
export const RIGHT_BANK: CellId = 'compass';
export const SPARE_INDEX = 2;
/** The right bank is positional (the bottom-right strip): map-first swaps COMPASS ⇄ ACCEL, so ACCEL's cell carries it
 * there (DRIVE / MORE stay bottom-right with a full strip; COMPASS's narrow cell would fit one key at 773). */
export const rightBankFor = (mapFirst: boolean | undefined): CellId => (mapFirst ? 'accel' : RIGHT_BANK);
/** Old NAV switch → where it lives now (every function stays reachable; tests check each one). */
export const NAV_HOMES = {
  drive: { key: 'drive', cell: RIGHT_BANK },
  more: { key: 'more', cell: RIGHT_BANK },
  options: { page: 'options' },
  mute: { page: 'sound', item: 'mute' },
} as const;

/** Every cell that gets a strip, in reading order. */
export const KEY_CELLS: readonly CellId[] = ['speed', ...CELL_ORDER];
