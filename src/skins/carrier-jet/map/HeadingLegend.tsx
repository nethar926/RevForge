import { CJ_HEADING_STALE_OPACITY, headingLegendLines, type HeadingRef } from './heading';

/** CJ green (MATRIX palette): primary `#8dffad`, secondary `winText` `#6fe593`, both on the #041009 CRT ground. */
const PRIMARY = '#8dffad';
const SECONDARY = '#6fe593';
const FONT = "'B612', system-ui, sans-serif";

export type CjHeadingLegendProps = {
  trueHdg: number;
  magHdg: number;
  /** Which reference is the large value. Default 'M'. */
  lead?: HeadingRef;
  /** Heading held (below ~3 mph, `headingStale`): dims both values to 0.45. */
  stale?: boolean;
};

/** Compass-cell heading legend: lead value large (18px), the other small (11px floor; HTML, no viewBox scaling). */
export function CjHeadingLegend({ trueHdg, magHdg, lead = 'M', stale = false }: CjHeadingLegendProps) {
  const [primary, secondary] = headingLegendLines(trueHdg, magHdg, lead);
  return (
    <div
      className="cj-hdg-legend"
      data-cj-el="heading-legend"
      data-lead={lead}
      data-stale={stale || undefined}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT, fontWeight: 700, lineHeight: 1.15, opacity: stale ? CJ_HEADING_STALE_OPACITY : 1 }}
    >
      <span style={{ fontSize: 18, color: PRIMARY }}>{primary}</span>
      <span style={{ fontSize: 11, color: SECONDARY }}>{secondary}</span>
    </div>
  );
}
