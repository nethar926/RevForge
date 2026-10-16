// Fit measurement for the CJ switch row (CjNavRow). Plain .ts so the node tests can import it.
interface BoxLike { getBoundingClientRect(): { left: number }; scrollWidth: number }
export interface CjPanelLike extends BoxLike { querySelector(sel: string): unknown; children: ArrayLike<unknown> & Iterable<unknown> }
const padRight = (panel: CjPanelLike) =>
  typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(panel as unknown as Element).paddingRight || '0') || 0 : 0;

/**
 * Width the switch row itself needs. The open MORE tray is absolutely positioned inside the panel, but it still
 * counts in panel.scrollWidth, so a tray wider than the row used to demote every switch into MORE ("collapse to
 * MORE alone"). The tray is ignored here: it overlays the board and never takes row width.
 */
export function cjPanelNeed(panel: CjPanelLike): number {
  const tray = panel.querySelector(':scope > .cjs-tray');
  if (!tray) return panel.scrollWidth;
  const left = panel.getBoundingClientRect().left;
  let right = 0;
  for (const c of panel.children as Iterable<BoxLike>) {
    if (c === tray) continue;
    right = Math.max(right, c.getBoundingClientRect().left - left + c.scrollWidth);
  }
  return Math.ceil(right + padRight(panel));
}

