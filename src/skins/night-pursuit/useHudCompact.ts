import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Compact HUD request:
 * - `true`  → host decided the fit would push text under 11px; render the compact layout.
 * - `false` → full layout (default; pixel-identical to the pre-compact skin).
 * - `'auto'`→ skin self-detects from its own rendered scale (fallback when a host can't decide).
 */
export type HudCompact = boolean | 'auto';

/** Dev/test override when the host passes nothing: `?hudCompact=1 | auto | 0`. */
export function hudCompactFromQuery(): HudCompact | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('hudCompact');
  if (v == null) return undefined;
  if (v === 'auto') return 'auto';
  return v === '' || v === '1' || v === 'true';
}

export interface HudCompactState {
  compact: boolean;
  /** CSS px that render as one screen px (1 / ancestor transform scale). */
  unit: number;
  /** Rendered (on-screen) size of the HUD root in CSS px. */
  realW: number;
  realH: number;
}

const OFF: HudCompactState = { compact: false, unit: 1, realW: 0, realH: 0 };

/**
 * Resolves the compact request and, while compact is possible, measures the HUD root's
 * on-screen scale (any ancestor `transform: scale()`), so compact sizes can be authored in
 * real screen px (`calc(11 * var(--u))`). Observers run only when compact is requested —
 * the default path adds no listeners and no styles.
 *
 * @param minDesignPx smallest font-size (CSS px) in the full layout; 'auto' turns compact on
 *                    when that would render under 11px.
 */
export function useHudCompact(
  ref: RefObject<HTMLElement | null>,
  requested: HudCompact | undefined,
  minDesignPx: number,
): HudCompactState {
  const req = requested ?? hudCompactFromQuery() ?? false;
  const [state, setState] = useState<HudCompactState>(OFF);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || req === false) {
      setState(OFF);
      return;
    }
    const measure = () => {
      if (!el.offsetWidth) return;
      const r = el.getBoundingClientRect();
      const scale = r.width / el.offsetWidth || 1;
      const compact = req === true || scale * minDesignPx < 11;
      setState((prev) =>
        prev.compact === compact && Math.abs(prev.unit * scale - 1) < 0.002 && Math.abs(prev.realW - r.width) < 1 && Math.abs(prev.realH - r.height) < 1
          ? prev
          : { compact, unit: 1 / scale, realW: r.width, realH: r.height },
      );
    };
    measure();
    // Host fit changes arrive as a resize of the HUD or one of its first few ancestors.
    const ro = new ResizeObserver(measure);
    for (let a: HTMLElement | null = el, i = 0; a && i < 5; a = a.parentElement, i++) ro.observe(a);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, req, minDesignPx]);
  return req === false ? OFF : state;
}
