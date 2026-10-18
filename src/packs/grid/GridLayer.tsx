import { useEffect, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { useFitBox, type FitBox } from '../mounts/useFitBox';
import { useRfLayout } from '../layout';
import { gridFitArgs, type CellRects, type GridLayout, type GridSpec } from './contract';
import { checkGrid, warnGridIssues } from './hig';
import { GridCtx, rectStyle, useGridState, type GridState } from './useGrid';
import '../mounts/pack-fit.css';

/**
 * Headless, theme-agnostic cell grid (framework). Three pieces:
 *  - useGridMeasure: re-reads anchors from the layer's host (ResizeObserver + MutationObserver + resize, settled on a
 *    microtask, equal results keep their identity). For themes whose skin lays the board out in CSS (Carrier Jet).
 *  - useGrid: resolves the spec's rects for the live layout (contract.resolveCells).
 *  - GridLayer: the layer root. Positions nothing itself (children place their cells with rectStyle / GridCell),
 *    passes Reduce Motion through (data-motion + useGridMotion), and in dev warns on a HIG floor miss
 *    (text < 11 px, target < 44 px) for the declared cells.
 * GridFrame wraps it in the shared fit scaler (useFitBox + pack-fit.css) and pickRfLayout for themes that declare
 * fixed rects. Styling stays the theme's: no colours, fonts or art here.
 */

const DEV = !!import.meta.env?.DEV;

export interface GridLayerProps<Id extends string> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  ref?: Ref<HTMLDivElement>;
  spec: GridSpec<Id, never>;
  layout: GridLayout;
  cells: CellRects<Id> | null;
  /** false: nothing measured yet; the root renders bare (className only) so it can be measured. */
  ready: boolean;
  /** Reduce Motion (system OR the theme's own setting); exposed as data-motion="static|live" and useGridMotion(). */
  reduced: boolean;
  /** Design px → rendered px (GridFrame's fit.s; 1 for measured rects). Used by the dev HIG check. */
  scale?: number;
  /** Cells that carry a rail in this layout (default: the spec's rail: true cells). Dev HIG check only. */
  railCells?: readonly Id[];
  children?: ReactNode;
}

export function GridLayer<Id extends string>({ ref, spec, layout, cells, ready, reduced, scale = 1, railCells, className, children, ...rest }: GridLayerProps<Id>) {
  const railKey = railCells?.join(',');
  useEffect(() => {
    if (!DEV || !cells) return;
    warnGridIssues(spec.id, checkGrid(spec, cells, { layout, scale, railCells: railKey === undefined ? undefined : (railKey.split(',').filter(Boolean) as Id[]) }));
  }, [spec, cells, layout, scale, railKey]);
  const state = useMemo<GridState<Id>>(() => ({ themeId: spec.id, layout, cells, reduced, scale }), [spec.id, layout, cells, reduced, scale]);
  // one tree shape either way (the root div keeps its identity when measuring settles)
  return (
    <GridCtx value={state as GridState}>
      {ready ? (
        <div ref={ref} className={className} {...rest} data-motion={reduced ? 'static' : 'live'}>
          {children}
        </div>
      ) : (
        <div ref={ref} className={className} />
      )}
    </GridCtx>
  );
}

/**
 * One declared cell, absolutely placed from the enclosing GridLayer. Decoration is pointer-events: none (it never
 * changes a hit area); z comes from the declaration. Renders nothing when the layout has no rect for it.
 */
export function GridCell<Id extends string>({ id, spec, className, style, children, ...rest }: { id: Id; spec: GridSpec<Id, never>; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const g = useGridState<Id>();
  const r = g?.cells?.[id];
  if (!r) return null;
  const decl = spec.cells.find((c) => c.id === id);
  const deco = decl?.role === 'decoration';
  return (
    <div className={className} data-grid-cell={id} data-grid-role={decl?.role} style={{ position: 'absolute', ...rectStyle(r), zIndex: decl?.z, ...(deco ? { pointerEvents: 'none' } : null), ...style }} aria-hidden={deco || undefined} {...rest}>
      {children}
    </div>
  );
}

/**
 * Fit scaler + layout picker for a fixed-rect theme: useFitBox(spec.fit) sizes the box (pack-fit.css scales it),
 * useRfLayout picks the layout, `children` gets both. The box is the coordinate space of the spec's rects.
 */
export function GridFrame<Id extends string>({ spec, driveWindow, className, children }: { spec: GridSpec<Id, never>; driveWindow: boolean; className?: string; children: (g: { layout: GridLayout; fit: FitBox }) => ReactNode }) {
  const [w, minH, maxH, fallbackH] = gridFitArgs(spec);
  const { ref, fit } = useFitBox(w, minH, maxH, fallbackH);
  const layout = useRfLayout(driveWindow);
  return (
    <div ref={ref} className={`rf-pack-fit${className ? ` ${className}` : ''}`} data-rf-layout={layout} data-grid={spec.id} style={{ '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` } as CSSProperties}>
      <div className="rf-pack-box">{children({ layout, fit })}</div>
    </div>
  );
}
