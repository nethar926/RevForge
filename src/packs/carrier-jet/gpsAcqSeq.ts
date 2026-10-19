import { useEffect, useState } from 'react';
/** GPS ACQ lamp sequence after NAV on: off (NAV off) · yellow (first 1 s) · pulse (to 3 s) · green (steady). */
export type CjGpsSeq = 'off' | 'yellow' | 'pulse' | 'green';

/**
 * GPS ACQ lamp sequence (Wilson, Oct 19): NAV off = off. NAV on: yellow for 1 s, then the green pulse (1 Hz, under
 * 3 flashes a second) until 3 s after NAV on, then steady green. Reduce Motion: yellow 1 s, then steady green (no pulse).
 * Never pulses indefinitely.
 */
export const GPS_SEQ_MS = { yellow: 1000, total: 3000 } as const;

export function gpsSeqAt(navOn: boolean, elapsedMs: number, reduced: boolean): CjGpsSeq {
  if (!navOn) return 'off';
  if (elapsedMs < GPS_SEQ_MS.yellow) return 'yellow';
  if (!reduced && elapsedMs < GPS_SEQ_MS.total) return 'pulse';
  return 'green';
}

/** Amber caution: only while NAV is on, for a GPS error / no fix / stale or acquiring fix (cjGps 'fail' / 'acq'). */
export const gpsCaution = (navOn: boolean, demo: boolean, gps: string): boolean => navOn && !demo && (gps === 'fail' || gps === 'acq');

export function useGpsAcqSeq(navOn: boolean, reduced: boolean): CjGpsSeq {
  const [phase, setPhase] = useState<CjGpsSeq>(() => gpsSeqAt(navOn, 0, reduced));
  useEffect(() => {
    if (!navOn) { setPhase('off'); return; }
    const t0 = performance.now();
    setPhase('yellow');
    const tick = () => setPhase(gpsSeqAt(true, performance.now() - t0, reduced));
    const a = setTimeout(tick, GPS_SEQ_MS.yellow);
    const b = setTimeout(tick, GPS_SEQ_MS.total);
    return () => { clearTimeout(a); clearTimeout(b); };
    // reduced is read at NAV-on time; a later change only shortens the pulse at the next tick
  }, [navOn]); // eslint-disable-line react-hooks/exhaustive-deps
  return phase;
}
