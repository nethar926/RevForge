/**
 * VDI bank (deg, + right) from the app's one GPS watch: the ACCEL ball's state (accelStep: v · ω / g), bankTarget
 * (atan, ±30°, 0 below 3 mph / stale). 1 Hz fixes eased at 10 Hz; Reduce Motion snaps (the value, no easing).
 */
import { useEffect, useRef, useState } from 'react';
import { latestGpsFix, subscribeGpsFixes } from '../../hooks/gpsFixes';
import { ACCEL_INIT, accelStep, type AccelState } from '../carrier-jet/accelBall';
import { bankEase, bankTarget } from '../carrier-jet/bankAngle';

export function useCjBank(on: boolean, demo: boolean, reduced: boolean): number {
  const st = useRef<AccelState>(ACCEL_INIT);
  const [bank, setBank] = useState(0);
  useEffect(() => {
    if (!on) return;
    const feed = (f: { speed: number | null; heading: number | null; timestamp: number }) => {
      st.current = accelStep(st.current, { speed: f.speed, heading: f.heading, timestamp: f.timestamp });
    };
    const off = subscribeGpsFixes(feed);
    const f0 = latestGpsFix();
    if (f0) feed(f0);
    let last = performance.now(), b = 0;
    const t = setInterval(() => {
      const now = performance.now();
      b = bankEase(b, demo ? 0 : bankTarget(st.current, Date.now()), (now - last) / 1000, reduced);
      last = now;
      setBank((p) => (Math.abs(p - b) < 0.05 ? p : b));
    }, 100);
    return () => {
      off();
      clearInterval(t);
    };
  }, [on, demo, reduced]);
  return on ? bank : 0;
}
