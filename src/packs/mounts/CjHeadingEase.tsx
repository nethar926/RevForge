import { useEffect, useRef, useState, type ReactNode } from 'react';
import { easeHeading, norm360, tauFor } from '../carrier-jet/headingEase';

/**
 * CJ v3: eases the heading for its subtree only (HUD compass / heading tape, radar + map heading, readout), so the rAF
 * frames re-render just these children. `ease` false (root build, Reduce Motion) = the raw value, no loop.
 */
export function CjHeadingEase({ heading, ease, children }: { heading: number | undefined; ease: boolean; children: (h: number | undefined) => ReactNode }) {
  const [shown, setShown] = useState(heading);
  const cur = useRef(heading);
  const lastFix = useRef<{ at: number; interval?: number }>({ at: 0 });
  useEffect(() => {
    const now = performance.now();
    if (lastFix.current.at) lastFix.current.interval = now - lastFix.current.at;
    lastFix.current.at = now;
    if (!ease || heading == null || cur.current == null) {
      cur.current = heading;
      setShown(heading);
      return;
    }
    const tau = tauFor(lastFix.current.interval);
    let raf = 0;
    let prev = now;
    const step = (t: number) => {
      const next = easeHeading(cur.current, heading, t - prev, tau, false);
      prev = t;
      cur.current = next;
      setShown(next == null ? next : Math.round(next * 10) / 10);
      if (next !== norm360(heading)) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [heading, ease]);
  return <>{children(ease ? shown : heading)}</>;
}
