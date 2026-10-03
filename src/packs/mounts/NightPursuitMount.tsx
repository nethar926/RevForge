import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { NightPursuitOverlay, type NightPursuitMode } from '../../skins/night-pursuit/NightPursuitOverlay';
import { NIGHT_PURSUIT_ID } from '../migrations';
import { emitScannerPass, getPackMode, onPackMode, readPackEnvelope, setPackMode } from '../runtime';
import type { PackHudProps } from '../types';
import './night-pursuit-mount.css';

/**
 * Design boxes the overlay is laid out in before uniform scale-to-fit.
 * 'wide' matches the overlay's 4-column grid; 'stack' its ≤900px 2-column grid.
 */
const BOX = { wide: { w: 880, h: 400 }, stack: { w: 600, h: 640 } } as const;

/**
 * Framework adapter: telemetry from ThemeStage + pack runtime bus →
 * Visual Skins' NightPursuitOverlay (which owns all HUD art).
 * Re-renders only on the existing 80 ms HUD publish; no extra loops.
 */
export function NightPursuitMount({ rpmNorm, speedNorm, speed, unit, load, throttle, running }: PackHudProps) {
  const [mode, setMode] = useState<NightPursuitMode>(() => getPackMode(NIGHT_PURSUIT_ID));
  useEffect(
    () =>
      onPackMode((id, next) => {
        if (id === NIGHT_PURSUIT_ID) setMode(next);
      }),
    [],
  );
  // Uniform scale-to-fit (ResizeObserver only; nothing measured per frame).
  const hostRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ s: 1, box: 'wide' as keyof typeof BOX });
  useLayoutEffect(() => {
    const el = hostRef.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const drive = !!host.closest('.rev-scene');
    const measure = () => {
      const cs = getComputedStyle(host);
      const w = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w <= 0) return;
      const box: keyof typeof BOX = window.innerWidth <= 900 ? 'stack' : 'wide';
      const d = BOX[box];
      const s = Math.max(0.5, drive && h > 0 ? Math.min(w / d.w, h / d.h) : w / d.w);
      setFit((prev) => (prev.box === box && Math.abs(prev.s - s) < 0.002 ? prev : { s, box }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const d = BOX[fit.box];
  const mph = unit === 'kph' ? speed / 1.609344 : speed;
  return (
    <div
      ref={hostRef}
      className="np-pack-mount"
      data-skin="night-pursuit"
      data-box={fit.box}
      data-running={running ? 'true' : 'false'}
      style={{ '--np-fit': fit.s, '--np-box-w': `${d.w}px`, '--np-box-h': `${d.h}px` } as CSSProperties}
    >
      <div className="np-pack-box">
      <NightPursuitOverlay
        rpmNorm={running ? rpmNorm : 0}
        speedNorm={speedNorm}
        throttle={running ? throttle : 0}
        loadFeel={running ? load : 0}
        speedMph={Math.round(mph)}
        mode={mode}
        onModeChange={(next) => setPackMode(NIGHT_PURSUIT_ID, next)}
        voiceEnvelope={running ? readPackEnvelope() : 0}
        onScannerPass={(edge) => emitScannerPass(NIGHT_PURSUIT_ID, edge)}
      />
      </div>
    </div>
  );
}
