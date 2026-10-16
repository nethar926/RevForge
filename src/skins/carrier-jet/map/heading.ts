// Carrier Jet heading helpers (no React, no DOM): import on their own, e.g. `import { smoothHeading } from '.../map/heading'`.

/** Wrap any angle into [0, 360). */
export const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * One easing step from `prev` toward `next` along the shortest arc (359 → 0 goes +1°, not −359°).
 * `alpha` in [0, 1]: 0 holds `prev`, 1 jumps to `next`. Result is wrapped into [0, 360).
 */
export function smoothHeading(prev: number, next: number, alpha: number): number {
  const a = Math.max(0, Math.min(1, alpha));
  const delta = ((wrap360(next) - wrap360(prev) + 540) % 360) - 180; // signed shortest arc in [-180, 180)
  return wrap360(prev + delta * a);
}

export type HeadingRef = 'T' | 'M';

/** '040 T' / '047 M': rounded, wrapped, zero-padded to 3 digits (360 shows as 000). */
export function formatHeading(deg: number, ref: HeadingRef): string {
  return `${String(Math.round(wrap360(deg)) % 360).padStart(3, '0')} ${ref}`;
}

/** Lines for CjHeadingLegend: `lead` ref is primary. e.g. lead 'M' → ['HDG 047 M', 'HDG 040 T']. */
export function headingLegendLines(trueHdg: number, magHdg: number, lead: HeadingRef = 'M'): [primary: string, secondary: string] {
  const t = `HDG ${formatHeading(trueHdg, 'T')}`;
  const m = `HDG ${formatHeading(magHdg, 'M')}`;
  return lead === 'M' ? [m, t] : [t, m];
}

/** Opacity for both legend values when the heading is held (below ~3 mph, the HUD's `headingStale`). */
export const CJ_HEADING_STALE_OPACITY = 0.45;
