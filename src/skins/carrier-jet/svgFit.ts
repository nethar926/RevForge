/** Shared SVG-fit context + narrow-rose geometry for the Carrier Jet parts (kept out of parts.tsx so that file only
 * exports components: react-refresh / only-export-components). */
import { createContext } from 'react';

/** Nearest <Svg>'s rendered px per viewBox unit (`s`) and the px from its parent cell's top edge to the drawing's top
 * (`top`, the svg's own offset plus the meet letterbox). s = 1 / top = 0 until measured and on the server. For parts
 * that change their layout, not just their text size, when the cell is small (the narrow compass rose). */
export type SvgFit = { s: number; top: number };
export const SvgScale = createContext<SvgFit>({ s: 1, top: 0 });

/** Cell-top px the host HDG chip can reach (4px inset + chip + 4px gap): 18px lead in wide cells, 13px under 130px. */
export const chipFloor = (cellW: number) => (cellW < 130 ? 28 : 34);

/**
 * Narrow-rose geometry in viewBox units (u = viewBox units per rendered px). A cell shorter than the chip band (a
 * phone landscape board, e.g. 844x390) leaves no room for the ring: the radius, inner label radius and clip height
 * clamp to 0 (nothing drawn, never a negative SVG r / height).
 */
export function roseNarrowGeom(x: number, y: number, w: number, h: number, sv: number, svTop: number) {
  const u = 1 / sv;
  // band: from the drawing's top down to just under the chip (less the letterbox above the drawing), never under 26px
  const band = Math.max(26, chipFloor(w * sv) - svTop - y * sv) * u, top = y + band + 4 * u;
  // the ring's centre sits on the cell floor, so the whole upper half (and its labels) is in view
  const cx = x + w / 2, R = Math.max(0, Math.min(w * 0.46, y + h - top - 2 * u)), cy = top + R;
  const inset = 17 * u, lr = Math.max(0, R - inset);
  const clipH = Math.max(0, h - band);
  return { u, band, top, cx, cy, R, inset, lr, clipH };
}
