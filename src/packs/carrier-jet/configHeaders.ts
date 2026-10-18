/**
 * CONFIG cell headers (framework; pure). With CONFIG open, a cell's header names the config page its tile opens, not
 * the Drive instrument under it (Meghan, Oct 17: ACCEL over PLT → PILOT, MAP over OPT → OPTIONS, WING SWEEP over SND →
 * SOUND). A tile that isn't a page (RTN, NEXT, a setting) has no sensible page name: the header is blanked but keeps its
 * box (zero shift). A cell without a tile keeps its Drive header. MACH and VDI sit under the CONFIG title bar; ENG has no
 * header; SPEED never takes a tile.
 */
import type { ConfigItem, ConfigPage } from '../configTable.ts';
import type { CellId } from './geometry.ts';

/** The cells whose own header the CONFIG view relabels. */
export const CONFIG_HEADER_CELLS = ['accel', 'map', 'sweep', 'compass'] as const satisfies readonly CellId[];
export type ConfigHeaderCell = (typeof CONFIG_HEADER_CELLS)[number];

/** undefined = no tile (keep the Drive header) · '' = blank (keep the box) · else the page's own title. */
export function configCellHeader(tile: ConfigItem | 'next' | undefined, pages: Record<string, Pick<ConfigPage, 'title'>>): string | undefined {
  if (!tile) return undefined;
  if (tile === 'next') return '';
  const m = /^tab-(.+)$/.exec(tile.id);
  return (m && pages[m[1]]?.title?.toUpperCase()) || '';
}
