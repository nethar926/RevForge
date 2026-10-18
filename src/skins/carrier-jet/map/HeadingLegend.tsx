import { useLayoutEffect, useRef, useState } from 'react';
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
  /** Accessible name for the legend root. Given → `aria-label` (with `role="group"` so the name is exposed). Omitted → no label (default). */
  ariaLabel?: string;
  /** Show only the lead reference (one heading readout, sheet panel 7). Default false keeps both lines. */
  single?: boolean;
};

/** Compass-cell heading legend: lead value large (18px), the other small (11px floor; HTML, no viewBox scaling). */
export function CjHeadingLegend({ trueHdg, magHdg, lead = 'M', stale = false, ariaLabel, single = false }: CjHeadingLegendProps) {
  const [primary, secondary] = headingLegendLines(trueHdg, magHdg, lead);
  const ref = useRef<HTMLDivElement>(null);
  const [lead18, setSize] = useState(18);
  // Narrow compass: the chip must fit inside its cell (about 99px at 773). Measure the host cell (the chip wrapper's
  // parent) and step the lead value 18 -> 13px under 130px (>= 11px floor; ~84px chip incl. padding).
  useLayoutEffect(() => {
    const host = ref.current?.parentElement?.parentElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const fit = () => setSize(host.clientWidth > 0 && host.clientWidth < 130 ? 13 : 18);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-cj-hdg-chip=""
      className="cj-hdg-legend"
      data-cj-el="heading-legend"
      data-lead={lead}
      data-stale={stale || undefined}
      data-single={single || undefined}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel || undefined}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: FONT, fontWeight: 700, lineHeight: 1.15, opacity: stale ? CJ_HEADING_STALE_OPACITY : 1 }}
    >
      <span style={{ fontSize: lead18, color: PRIMARY }}>{primary}</span>
      {single ? null : <span style={{ fontSize: 11, color: SECONDARY }}>{secondary}</span>}
    </div>
  );
}
