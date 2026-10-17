/**
 * Tucked pamphlet tag ("MATRIX PILOT CHECKLIST / STEP 7b · 17/22", the cover's title) on the switch shelf: where it may lie. Pure, no
 * DOM (node-testable); the mount (CjColdStart.tsx) measures the rects and calls this.
 * Rule: the tag never covers a switch, guard, key, lamp, badge, annunciator or the MASTER CAUTION key, in any start
 * mode, look, viewport or shelf state, Park or Drive. Meghan's shelf lays its groups out from the list, so the free
 * space moves with the mode and the box; fixed corners can't hold it (the old `right: 14px; bottom: 14px` fallback
 * landed on SYSTEMS › OXY 7d and MASTER CAUTION 9a in GND AIR at 773).
 * Order: the preferred anchors (row 1's right-hand bay, the strip beside the header annunciators), then the first free
 * spot top-down, left-to-right. Group frames (POWER, FUEL, LIGHTS, ENGINES, SYSTEMS…) count as obstacles everywhere,
 * so the tag always lies fully inside a gutter, never across a frame line (Meghan's polish pass on 6f778b7).
 */
export interface TagRect { x: number; y: number; w: number; h: number }
export interface TagSpotInput {
  /** Where the tag may go at all (visible shelf panel, clipped to the viewport). */
  area: TagRect;
  /** Never covered: switches, guards, keys, lamps, badges, annunciators, MASTER CAUTION, the dock bank over the shelf. */
  obstacles: readonly TagRect[];
  /** Group frames: never crossed (the tag sits fully in a gutter). */
  frames: readonly TagRect[];
  /** Tried first, in order (top-left corners). */
  anchors?: readonly { x: number; y: number }[];
  w: number;
  h: number;
  /** Clearance around obstacles (covers the tag's slight tilt). */
  margin?: number;
  step?: number;
}
/** Tag sizes: full title on one line (MATRIX PILOT CHECKLIST, 12 px B612 + padding), the 136 px tag (PILOT CHECKLIST), 44 px-tall minimum. */
export const TAG_W_FULL = 192;
export const TAG_W = 136;
export const TAG_H = 54;
export const TAG_H_MIN = 44;
/** Clearance to every obstacle and frame: 6 px, so the tilted tag (±3.4 px at 192 px, -2°) still clears a frame line visibly. */
export const TAG_MARGIN = 6;

export const tagHits = (a: TagRect, b: TagRect, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

export function pickTagSpot({ area, obstacles, frames, anchors = [], w, h, margin = TAG_MARGIN, step = 4 }: TagSpotInput): TagRect | null {
  const inside = (r: TagRect) => r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h;
  const clear = (r: TagRect, list: readonly TagRect[]) => inside(r) && !list.some((o) => tagHits(r, o, margin));
  const all = [...obstacles, ...frames];
  for (const a of anchors) { const r = { x: a.x, y: a.y, w, h }; if (clear(r, all)) return r; }
  for (let y = area.y; y + h <= area.y + area.h; y += step) for (let x = area.x; x + w <= area.x + area.w; x += step) {
    const r = { x, y, w, h };
    if (clear(r, all)) return r;
  }
  return null;
}
