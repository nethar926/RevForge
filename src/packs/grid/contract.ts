/**
 * Shared cell-grid contract (framework; pure, node-testable). A theme (skin or pack) declares its cells once:
 * an id, a role, its minimum sizes and depth, whether it carries an edge-key rail, and a rect per layout
 * (board · window · portrait · phone-landscape, the four layouts packs/layout.ts picks). GridLayer
 * (GridLayer.tsx) positions and checks them; nothing here knows any theme.
 *
 * Rects are CSS px in the theme's design box (the useFitBox box). A layout rule is one of:
 *  - { kind: 'rects' }: fixed rects (the plug-and-play form a new theme uses: GridFrame scales them with useFitBox).
 *  - { kind: 'derive' }: rects computed from measured anchors (Carrier Jet: its skin's CSS grid lays the board out,
 *    the host measures it, see carrier-jet/cells.ts).
 *  - null: the grid does not draw this layout (the theme's own CSS owns it; no host cells, no rails).
 * Drop nothing: every cell that is not listed in `optionalIn` must have a rect in every layout the theme handles.
 */
import type { RfLayout } from '../layout.ts';

export type GridLayout = RfLayout;
export const GRID_LAYOUTS: readonly GridLayout[] = ['board', 'window', 'portrait', 'phone-landscape'];

/** Same shape as carrier-jet/geometry Box (left / top / width / height, CSS px). */
export interface Rect { left: number; top: number; width: number; height: number }
export interface Size { w: number; h: number }

/**
 * - 'target': the cell itself is tapped (a key, a tile, a switch): its rendered box must be at least 44×44.
 * - 'readout': shows a value; may hold declared inner targets (`targets`), each at least 44×44.
 * - 'decoration': art only (bezels, screws, glass, glow). Never a hit area: GridCell renders it
 *   pointer-events: none, it may not carry a rail or targets, and moving it never moves a hit area.
 */
export type CellRole = 'target' | 'readout' | 'decoration';

export interface CellDecl<Id extends string = string> {
  id: Id;
  /** Plain name for docs / dev warnings ("SPEED", "MAP"). */
  name: string;
  role: CellRole;
  /** Who paints it: the skin (theme art, the host only measures it) or the pack host (GridLayer children). */
  drawnBy?: 'skin' | 'host';
  /** Stacking depth inside the grid layer (higher = nearer). Default 0. */
  z?: number;
  /** Smallest rect (design px) the cell's content is drawn for; smaller is reported by checkGrid. */
  minSize?: Size;
  /** Smallest font the cell draws (design px); checked against the 11 px floor after scaling. */
  minText?: number;
  /** Fixed-size hit targets inside the cell (design px), e.g. a 44×44 (i) button. */
  targets?: readonly { name: string; w: number; h: number }[];
  /** The cell carries an edge-key rail (spec.rail) under it. */
  rail?: boolean;
  /** Layouts where the theme may leave this cell out (it must still be reachable elsewhere; say where in docs). */
  optionalIn?: readonly GridLayout[];
}

/** Edge-key rail: one strip of keys under a cell. `key` is the key frame, `hit` the pressable cap inside it. */
export interface RailSpec {
  key: Size & { gap: number };
  hit: Size;
  /** Most keys in one strip (default 4). */
  max?: number;
}

export type LayoutRule<Id extends string, Ctx> =
  | { kind: 'rects'; rects: Partial<Record<Id, Rect>> }
  | { kind: 'derive'; derive: (ctx: Ctx) => Partial<Record<Id, Rect>> | null }
  | null;

export interface GridSpec<Id extends string = string, Ctx = unknown> {
  /** Theme id ("carrier-jet"). */
  id: string;
  /** useFitBox design box: fixed width, height between minH and maxH (fallbackH off the Drive stage). */
  fit: { w: number; minH: number; maxH: number; fallbackH: number };
  cells: readonly CellDecl<Id>[];
  layouts: Record<GridLayout, LayoutRule<Id, Ctx>>;
  rail?: RailSpec;
}

export type CellRects<Id extends string> = Record<Id, Rect>;

/** The fit args in useFitBox order (designW, minH, maxH, fallbackH). */
export const gridFitArgs = (s: Pick<GridSpec, 'fit'>): [number, number, number, number] => [s.fit.w, s.fit.minH, s.fit.maxH, s.fit.fallbackH];

/** True when the grid draws this layout (a non-null rule). */
export const gridHandles = (s: Pick<GridSpec, 'layouts'>, layout: GridLayout): boolean => s.layouts[layout] != null;

/** Cells a layout must place (every cell not listing that layout in optionalIn). */
export function requiredCells<Id extends string>(s: Pick<GridSpec<Id, never>, 'cells'>, layout: GridLayout): Id[] {
  return s.cells.filter((c) => !c.optionalIn?.includes(layout)).map((c) => c.id);
}

/**
 * Resolve one layout's rects. null when the layout is not drawn by the grid, the derive rule has no anchors yet
 * (ctx null / derive returns null), or a required cell is missing (a theme never half-draws a board).
 */
export function resolveCells<Id extends string, Ctx>(s: GridSpec<Id, Ctx>, layout: GridLayout, ctx: Ctx | null): CellRects<Id> | null {
  const rule = s.layouts[layout];
  if (!rule) return null;
  let rects: Partial<Record<Id, Rect>> | null;
  if (rule.kind === 'rects') rects = rule.rects;
  else {
    if (ctx == null) return null;
    rects = rule.derive(ctx);
  }
  if (!rects) return null;
  for (const id of requiredCells(s, layout)) if (!rects[id]) return null;
  return rects as CellRects<Id>;
}

/** Contract errors in a declaration (static: what can be known without measuring). Empty = valid. */
export function validateSpec<Id extends string, Ctx>(s: GridSpec<Id, Ctx>): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const c of s.cells) {
    if (ids.has(c.id)) out.push(`${c.id}: duplicate cell id`);
    ids.add(c.id);
    if (c.role === 'decoration' && c.rail) out.push(`${c.id}: decoration cell carries a rail (decoration is never a hit area)`);
    if (c.role === 'decoration' && c.targets?.length) out.push(`${c.id}: decoration cell declares targets (decoration is never a hit area)`);
    if (c.rail && !s.rail) out.push(`${c.id}: rail: true but the spec declares no rail`);
    if (c.minSize && (c.minSize.w < 0 || c.minSize.h < 0)) out.push(`${c.id}: negative minSize`);
  }
  for (const layout of GRID_LAYOUTS) {
    const rule = s.layouts[layout];
    if (!rule || rule.kind !== 'rects') continue;
    for (const id of Object.keys(rule.rects)) if (!ids.has(id)) out.push(`${layout}: rect for undeclared cell "${id}"`);
    for (const id of requiredCells(s, layout)) {
      const r = rule.rects[id];
      if (!r) {
        out.push(`${layout}: cell "${id}" has no rect (drop nothing: give it a rect or list the layout in optionalIn)`);
        continue;
      }
      if (!(r.width > 0 && r.height > 0)) out.push(`${layout}: cell "${id}" has an empty rect`);
    }
  }
  if (s.rail && (s.rail.hit.w > s.rail.key.w || s.rail.hit.h > s.rail.key.h)) out.push('rail: hit area larger than the key frame');
  return out;
}
