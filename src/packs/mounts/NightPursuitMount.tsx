import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { NightPursuitOverlay, type NightPursuitMode } from '../../skins/night-pursuit/NightPursuitOverlay';
import { NIGHT_PURSUIT_ID } from '../migrations';
import { emitScannerPass, getPackMode, onPackMode, readPackEnvelope, setPackMode } from '../runtime';
import type { PackHudProps } from '../types';
import './night-pursuit-mount.css';

/**
 * Design boxes the overlay is laid out in before uniform scale-to-fit.
 * 'wide' matches the overlay's 4-column grid; 'stack' its ≤900px 2-column grid.
 * 'flex' is drive-window mode only: 600 wide, height elastic between minH and maxH, so the
 * HUD spans the full-width strip above the Throttle card (the skin's container queries go
 * two-column at that size) instead of a 600×640 box squeezed beside it.
 */
const BOX = {
  wide: { w: 880, h: 400, minH: 400, maxH: 400 },
  stack: { w: 600, h: 640, minH: 640, maxH: 640 },
  flex: { w: 600, h: 640, minH: 280, maxH: 640 },
} as const;
type BoxKind = keyof typeof BOX;

/**
 * Framework adapter: telemetry from ThemeStage + pack runtime bus →
 * Visual Skins' NightPursuitOverlay (which owns all HUD art).
 * Re-renders only on the existing 80 ms HUD publish; no extra loops.
 */
export function NightPursuitMount({ rpmNorm, rpm, redlineRpm, gear, speedNorm, speed, unit, load, throttle, running, compact, driveWindow = false }: PackHudProps) {
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
  const [fit, setFit] = useState({ s: 1, box: 'wide' as BoxKind, h: BOX.wide.h as number });
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
      let box: BoxKind;
      let bh: number;
      let s: number;
      if (drive && driveWindow && h > 0) {
        // Drive window: the stage hands us the free rect (useDriveWindow, from data-fit-box).
        // Fixed 600 design width; height follows the rect's aspect within 280..640 (unrounded,
        // so the box meets the rect edge to edge), then the largest uniform scale that fits both ways.
        box = 'flex';
        const d = BOX.flex;
        bh = Math.max(d.minH, Math.min(d.maxH, (d.w * h) / w));
        s = Math.min(w / d.w, h / bh);
      } else {
        box = window.innerWidth <= 900 ? 'stack' : 'wide';
        const d = BOX[box];
        bh = d.h;
        s = drive && h > 0 ? Math.min(w / d.w, h / d.h) : w / d.w;
      }
      s = Math.max(0.5, s);
      setFit((prev) => (prev.box === box && Math.abs(prev.h - bh) < 0.5 && Math.abs(prev.s - s) < 0.002 ? prev : { s, box, h: bh }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [driveWindow]);
  const d = BOX[fit.box];
  // Advertised to useDriveWindow straight from the prop (not the measured box) so the stage
  // picks the full-width strip above the Throttle card on the very first drive-window pass.
  const spec = driveWindow ? BOX.flex : d;
  const mph = unit === 'kph' ? speed / 1.609344 : speed;
  return (
    <div
      ref={hostRef}
      className="np-pack-mount"
      data-skin="night-pursuit"
      data-box={fit.box}
      data-drive-window={driveWindow ? 'true' : undefined}
      data-fit-box={`${spec.w},${spec.minH},${spec.maxH}`}
      data-running={running ? 'true' : 'false'}
      style={{ '--np-fit': fit.s, '--np-box-w': `${d.w}px`, '--np-box-h': `${fit.h}px` } as CSSProperties}
    >
      <div className="np-pack-box">
      <NightPursuitOverlay
        rpmNorm={running ? rpmNorm : 0}
        rpm={running ? rpm : 0}
        redlineRpm={redlineRpm}
        gear={gear}
        speedNorm={speedNorm}
        throttle={running ? throttle : 0}
        loadFeel={running ? load : 0}
        speedMph={Math.round(mph)}
        mode={mode}
        onModeChange={(next) => setPackMode(NIGHT_PURSUIT_ID, next)}
        voiceEnvelope={running ? readPackEnvelope() : 0}
        onScannerPass={(edge) => emitScannerPass(NIGHT_PURSUIT_ID, edge)}
        // Drive-window mode (or an explicit host request) forces the compact layout; otherwise
        // the skin self-detects from its rendered scale (scale × 9px < 11px), like Chrono Coupe /
        // Stellar Helm. Off at 1280×800 (@1 and @1.53).
        compact={driveWindow || compact === true ? true : 'auto'}
      />
      </div>
    </div>
  );
}
