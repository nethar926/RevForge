import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const RM_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const snapshot = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(RM_QUERY).matches;

/** OS Reduce Motion (live). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * Smooths a needle value with a time-based exponential ease on rAF.
 * When `jump` is true (Reduce Motion / app motion off) the target is returned
 * as-is — no smoothing, no rAF loop.
 */
export function useSmoothedValue(target: number, jump: boolean, tauMs = 110): number {
  const [display, setDisplay] = useState(target);
  const cur = useRef(target);

  useEffect(() => {
    if (jump) {
      cur.current = target;
      return;
    }
    let raf = 0;
    let last = 0;
    const step = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 16;
      last = t;
      const k = 1 - Math.exp(-dt / tauMs);
      const next = cur.current + (target - cur.current) * k;
      if (Math.abs(target - next) < 0.05) {
        cur.current = target;
        setDisplay(target);
        return;
      }
      cur.current = next;
      setDisplay(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, jump, tauMs]);

  return jump ? target : display;
}
