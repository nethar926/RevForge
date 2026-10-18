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
 *   WX (weather radar overlay, board only): a 5th MAP key when the MAP cell is wide enough (1256/1280: ZM+ ZM−
 *   N/TRK-UP MAP/TERR WX), else the right bank's K3 spare (773: the key directly right of the MAP strip).
 */
import { CELL_ORDER } from './configCells.ts';
import type { CellId } from './geometry.ts';
import { keyCount } from './geometry.ts';
import { mapKeys, type MapKeyId, type MapView } from './mapView.ts';

export type EdgeKeyId = 'config' | 'rtn' | 'prev' | 'next' | 'sel' | 'drive' | 'more' | 'wx' | MapKeyId;
export interface EdgeKey {
  id: EdgeKeyId;
  legend: string;
  ariaLabel: string;
  active?: boolean;
  /** Toggle that is off: legend drawn in the unlit grey (cjp-unlit), not the phosphor green. */
  unlit?: boolean;
  /** Pressable but can't act right now (end stop / Park only): announced, no effect. */
  reason?: string;
}
export interface EdgeCtx {
  map: MapView;
  /** MORE sheet open (MORE key boxed). */
  moreOpen?: boolean;
  /** null = board; else the open CONFIG page's tiles per cell (label or null) and its sub-page count. */
  config: null | { tiles: Partial<Record<CellId, { label: string; reason?: string } | null>>; subs: number };
  /** WX radar toggle: on/off and which strip carries it (see wxSlot). Absent = no WX key. */
  wx?: { on: boolean; slot: WxSlot };
  /** The cell under the bottom-right strip (the right bank); default RIGHT_BANK. Map-first: ACCEL (rightBankFor). */
  bank?: CellId;
}

export type WxSlot = 'map' | 'bank';
/** Where WX goes: a 5th key under MAP if the MAP strip fits one more key than it uses, else the right bank's K3. */
export function wxSlot(mapWidth: number, map: MapView): WxSlot {
  return keyCount(mapWidth, 5) > Math.min(keyCount(mapWidth), mapKeys(map).length) ? 'map' : 'bank';
}
/** Keys in a cell's strip (MAP grows to 5 when it carries WX). */
export function stripCount(cell: CellId, width: number, c: Pick<EdgeCtx, 'map' | 'config' | 'wx'>): number {
  if (cell === 'map' && !c.config && c.wx?.slot === 'map') return Math.min(keyCount(width, 5), mapKeys(c.map).length + 1);
  return keyCount(width);
}
export const wxKey = (on: boolean): EdgeKey => ({
  id: 'wx',
  legend: 'WX',
  ariaLabel: on ? 'Weather radar, on' : 'Weather radar, off',
  active: on,
  unlit: !on,
});

export function cellKeys(cell: CellId, n: number, c: EdgeCtx): (EdgeKey | null)[] {
  const keys: (EdgeKey | null)[] = [];
  if (cell === (c.bank ?? RIGHT_BANK)) {
    keys.push(
      { id: 'drive', legend: 'DRIVE', ariaLabel: c.config ? 'Drive, return to the board' : 'Drive, board showing', active: !c.config },
      { id: 'more', legend: 'MORE', ariaLabel: c.moreOpen ? 'More, open' : 'More', active: !!c.moreOpen },
    );
    if (!c.config && c.wx?.slot === 'bank') keys.push(wxKey(c.wx.on));
  } else if (!c.config) {
    if (cell === 'speed') keys.push({ id: 'config', legend: 'CONFIG', ariaLabel: 'Open config' });
    if (cell === 'map') for (const k of mapKeys(c.map)) keys.push({ id: k.id, legend: k.legend, ariaLabel: k.disabledReason ? `${k.ariaLabel}. ${k.disabledReason}` : k.ariaLabel, reason: k.disabledReason, active: k.id === 'mode' ? c.map.mode === 'terr' : k.id === 'orient' ? !c.map.northUp : false });
    if (cell === 'map' && c.wx?.slot === 'map') {
      // WX is always the strip's last key (never pushed off by the cap)
      keys.length = Math.min(keys.length, n - 1);
      keys.push(wxKey(c.wx.on));
    }
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
