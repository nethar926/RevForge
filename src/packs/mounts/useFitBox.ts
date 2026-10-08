import { useLayoutEffect, useRef, useState } from 'react';

export interface FitBox {
  /** Uniform scale applied to the design box. */
  s: number;
  /** Design box size in CSS px (pre-scale). Width fixed, height adapts to the stage aspect. */
  w: number;
  h: number;
}

/**
 * Scale-to-fill for pack HUDs. The design box keeps a fixed width and picks a
 * height between `minH` and `maxH` that matches the available stage aspect, so
 * a CSS-grid HUD fills 1280×800, Tesla 1255×784@1.53 and ~1024×600 without
 * letterboxing. Measures on ResizeObserver only (nothing per frame).
 */
export function useFitBox(designW: number, minH: number, maxH: number, fallbackH: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<FitBox>({ s: 1, w: designW, h: fallbackH });
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const drive = !!host.closest('.rev-scene');
    // Advertise the elastic design box so the Drive stage (useDriveWindow) can pick the free rect it fills best.
    el.dataset.fitBox = `${designW},${minH},${maxH}`;
    const measure = () => {
      const cs = getComputedStyle(host);
      const w = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w <= 0) return;
      let boxH = fallbackH;
      let s = w / designW;
      if (drive && h > 0) {
        boxH = Math.round(Math.max(minH, Math.min(maxH, (designW * h) / w)));
        s = Math.min(w / designW, h / boxH);
      }
      s = Math.max(0.3, s);
      setFit((prev) => (prev.h === boxH && Math.abs(prev.s - s) < 0.002 ? prev : { s, w: designW, h: boxH }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [designW, minH, maxH, fallbackH]);
  return { ref, fit };
}

/** prefers-reduced-motion as live state (CSS handles most cases; rAF loops need it in JS). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
