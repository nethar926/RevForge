/**
 * HIG floors as checks (framework; pure). Text renders at 11 px or more, hit targets at 44×44 or more, measured
 * AFTER the fit scale (a 44 px design target at scale 0.8 is a 35 px target on screen). GridLayer runs checkGrid in
 * dev builds and warns; tests run it on every declared layout.
 */
import { requiredCells, type CellRects, type GridLayout, type GridSpec, type Rect } from './contract.ts';

export const HIG_MIN_TEXT_PX = 11;
export const HIG_MIN_TARGET_PX = 44;

export type GridRule = 'target' | 'text' | 'rail' | 'min-size' | 'missing' | 'decoration-over-target';
export interface GridIssue { cell: string; rule: GridRule; message: string }

const r2 = (n: number) => Math.round(n * 100) / 100;
const overlaps = (a: Rect, b: Rect) => Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) && Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top);

/**
 * Check one resolved layout. `scale` = design px → rendered CSS px (useFitBox fit.s; 1 for measured rects).
 * Rails count only cells that carry one (`rail: true`, or `railCells` when the theme decides per layout).
 */
export function checkGrid<Id extends string>(
  spec: GridSpec<Id, never>,
  cells: Partial<CellRects<Id>>,
  opts: { layout: GridLayout; scale?: number; railCells?: readonly Id[] },
): GridIssue[] {
  const k = opts.scale ?? 1;
  const out: GridIssue[] = [];
  const required = new Set(requiredCells(spec, opts.layout));
  for (const c of spec.cells) {
    const r = cells[c.id];
    if (!r) {
      if (required.has(c.id) && spec.layouts[opts.layout]) out.push({ cell: c.id, rule: 'missing', message: `${c.name}: no rect in ${opts.layout}` });
      continue;
    }
    const w = r.width * k, h = r.height * k;
    if (c.role === 'target' && (w < HIG_MIN_TARGET_PX || h < HIG_MIN_TARGET_PX)) out.push({ cell: c.id, rule: 'target', message: `${c.name}: target renders ${r2(w)}×${r2(h)} px in ${opts.layout} (floor ${HIG_MIN_TARGET_PX}×${HIG_MIN_TARGET_PX})` });
    for (const t of c.targets ?? []) {
      if (t.w * k < HIG_MIN_TARGET_PX || t.h * k < HIG_MIN_TARGET_PX) out.push({ cell: c.id, rule: 'target', message: `${c.name} › ${t.name}: target renders ${r2(t.w * k)}×${r2(t.h * k)} px (floor ${HIG_MIN_TARGET_PX})` });
    }
    if (c.minText != null && c.minText * k < HIG_MIN_TEXT_PX) out.push({ cell: c.id, rule: 'text', message: `${c.name}: text renders ${r2(c.minText * k)} px (floor ${HIG_MIN_TEXT_PX})` });
    if (c.minSize && (r.width < c.minSize.w || r.height < c.minSize.h)) out.push({ cell: c.id, rule: 'min-size', message: `${c.name}: ${r2(r.width)}×${r2(r.height)} is under its min ${c.minSize.w}×${c.minSize.h} in ${opts.layout}` });
  }
  const rail = spec.rail;
  if (rail) {
    const withRail = opts.railCells ?? spec.cells.filter((c) => c.rail).map((c) => c.id);
    if (withRail.length && (rail.hit.w * k < HIG_MIN_TARGET_PX || rail.hit.h * k < HIG_MIN_TARGET_PX)) {
      out.push({ cell: String(withRail[0]), rule: 'rail', message: `edge keys: cap renders ${r2(rail.hit.w * k)}×${r2(rail.hit.h * k)} px (floor ${HIG_MIN_TARGET_PX})` });
    }
  }
  // decoration above a target it overlaps would cover it visually (hit areas are safe: decoration is pointer-events: none)
  for (const d of spec.cells) {
    if (d.role !== 'decoration' || !cells[d.id]) continue;
    for (const t of spec.cells) {
      if (t.role === 'decoration' || !cells[t.id]) continue;
      if ((d.z ?? 0) > (t.z ?? 0) && overlaps(cells[d.id]!, cells[t.id]!)) out.push({ cell: d.id, rule: 'decoration-over-target', message: `${d.name} (decoration, z ${d.z ?? 0}) sits above ${t.name} (z ${t.z ?? 0})` });
    }
  }
  return out;
}

/** Warn once per distinct message (dev / test). Returns the messages it logged. */
const seen = new Set<string>();
export function warnGridIssues(themeId: string, issues: readonly GridIssue[], log: (m: string) => void = (m) => console.warn(m)): string[] {
  const logged: string[] = [];
  for (const i of issues) {
    const m = `[grid:${themeId}] ${i.rule}: ${i.message}`;
    if (seen.has(m)) continue;
    seen.add(m);
    log(m);
    logged.push(m);
  }
  return logged;
}
