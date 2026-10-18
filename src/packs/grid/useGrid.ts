import { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { resolveCells, type CellRects, type GridLayout, type GridSpec, type Rect } from './contract';
import { railSlots } from './rail';

/** Hooks and helpers for GridLayer.tsx (kept apart so the component file only exports components). */

export const rectStyle = (b: Rect): CSSProperties => ({ left: b.left, top: b.top, width: b.width, height: b.height });

/* ------------------------------------------------------------------ Reduce Motion pass-through */
const RM = '(prefers-reduced-motion: reduce)';
const readSys = () => typeof matchMedia !== 'undefined' && matchMedia(RM).matches;
const subSys = (f: () => void) => {
  if (typeof matchMedia === 'undefined') return () => undefined;
  const m = matchMedia(RM);
  m.addEventListener?.('change', f);
  return () => m.removeEventListener?.('change', f);
};
/** prefers-reduced-motion as live state (false on the server). */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(subSys, readSys, () => false);
}

/* ------------------------------------------------------------------ measuring */
/**
 * Measure the layer's host (`selfRef`'s parent: a parent's ref is not attached yet when a child's layout effect first
 * runs). `read` must be stable (useCallback); it re-runs on host resize, window resize and the listed attribute /
 * child mutations under the host, on a microtask (works under paused animation clocks). Equal results (JSON) keep
 * the previous object, so dependants do not re-render.
 */
export function useGridMeasure<M>(selfRef: RefObject<HTMLElement | null>, read: (host: HTMLElement) => M | null, observe: { attributeFilter: string[] }): M | null {
  const [m, setM] = useState<M | null>(null);
  const filter = observe.attributeFilter.join('\n');
  useLayoutEffect(() => {
    const host = selfRef.current?.parentElement ?? null;
    if (!host) return;
    let queued = false;
    let dead = false;
    const run = () => {
      queued = false;
      if (dead) return;
      const n = read(host);
      setM((p) => (p && n && JSON.stringify(p) === JSON.stringify(n) ? p : n));
    };
    const sched = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(run);
    };
    run();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sched);
    ro?.observe(host);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sched);
    mo?.observe(host, { subtree: true, attributes: true, attributeFilter: filter.split('\n'), childList: true });
    window.addEventListener('resize', sched);
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', sched);
      dead = true;
    };
  }, [selfRef, read, filter]);
  return m;
}

/** The live layout's rects (null: layout not drawn by the grid, or no anchors yet). */
export function useGrid<Id extends string, Ctx>(spec: GridSpec<Id, Ctx>, layout: GridLayout, ctx: Ctx | null): CellRects<Id> | null {
  return useMemo(() => resolveCells(spec, layout, ctx), [spec, layout, ctx]);
}

/* ------------------------------------------------------------------ layer */
export interface GridState<Id extends string = string> {
  themeId: string;
  layout: GridLayout;
  cells: CellRects<Id> | null;
  reduced: boolean;
  scale: number;
}
export const GridCtx = createContext<GridState | null>(null);
/** The enclosing GridLayer's state (null outside one). */
export const useGridState = <Id extends string = string>() => useContext(GridCtx) as GridState<Id> | null;
/** Reduce Motion as the enclosing GridLayer resolved it (system setting or the theme's own off switch). */
export const useGridMotion = (): boolean => useContext(GridCtx)?.reduced ?? false;

/** Rail key boxes under a cell (n keys, `gap` below it), from the spec's rail frame. */
export function useRailSlots<Id extends string>(spec: GridSpec<Id, never>, id: Id, n: number, gap: number): Rect[] {
  const g = useGridState<Id>();
  const r = g?.cells?.[id];
  return r && spec.rail ? railSlots(r, n, spec.rail.key, gap) : [];
}

