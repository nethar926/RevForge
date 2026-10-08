import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { NightPursuitOverlay, type NightPursuitMode } from '../../skins/night-pursuit/NightPursuitOverlay';
import { NIGHT_PURSUIT_ID } from '../migrations';
import { emitScannerPass, getPackMode, onPackMode, readPackEnvelope, setPackMode } from '../runtime';
import type { PackHudProps } from '../types';
import './night-pursuit-mount.css';

/**
 * Design boxes the overlay is laid out in before uniform scale-to-fit.
 * 'wide' matches the overlay's 4-column grid; 'stack' its ≤900px 2-column grid.
 * 'drive' is drive-window mode only: the FULL design (not the compact variant) in its original
 * 4-column arrangement (night-pursuit-mount.css). w×h is the smallest box that arrangement fits
 * at 1:1; the box takes the free rect's aspect (elastic both ways) and the scale is the largest
 * that keeps it at least w×h, so labels (11.25px in the skin) never render under 11px.
 */
const BOX = {
  wide: { w: 880, h: 400, minH: 400, maxH: 400 },
  stack: { w: 600, h: 640, minH: 640, maxH: 640 },
  drive: { w: 740, h: 304, minH: 304, maxH: 304 },
} as const;
/** Drive-window upscale cap (matches useDriveWindow's DRIVE_WINDOW_MAX_UPSCALE). */
const DRIVE_MAX_SCALE = 1.4;
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
  const [fit, setFit] = useState({ s: 1, box: 'wide' as BoxKind, w: BOX.wide.w as number, h: BOX.wide.h as number });
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
      let bw: number;
      let bh: number;
      let s: number;
      if (drive && driveWindow && h > 0) {
        // Drive window: the stage hands us the free rect (useDriveWindow, from data-fit-box) —
        // the full-width strip above the Throttle card. Full design, uniform scale = the largest
        // that keeps the design box at least 740×304; the box then takes the rect's exact size
        // (÷ scale), so the HUD meets the rect edge to edge and the pods absorb the extra room.
        box = 'drive';
        const d = BOX.drive;
        s = Math.max(0.5, Math.min(DRIVE_MAX_SCALE, w / d.w, h / d.h));
        bw = w / s;
        bh = h / s;
      } else {
        box = window.innerWidth <= 900 ? 'stack' : 'wide';
        const d = BOX[box];
        bw = d.w;
        bh = d.h;
        s = Math.max(0.5, drive && h > 0 ? Math.min(w / d.w, h / d.h) : w / d.w);
      }
      setFit((prev) =>
        prev.box === box && Math.abs(prev.w - bw) < 0.5 && Math.abs(prev.h - bh) < 0.5 && Math.abs(prev.s - s) < 0.002 ? prev : { s, box, w: bw, h: bh },
      );
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
  // Advertised to useDriveWindow straight from the prop (not the measured box) so the stage
  // picks the full-width strip above the Throttle card on the very first drive-window pass.
  const spec = driveWindow ? BOX.drive : BOX[fit.box];
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
      style={{ '--np-fit': fit.s, '--np-box-w': `${fit.w}px`, '--np-box-h': `${fit.h}px` } as CSSProperties}
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
        // Drive-window mode: always the FULL design (explicit false, so neither the host's
        // compact request nor the skin's 'auto' threshold swaps in the compact variant); the
        // mount's 'drive' box lays it out to fit. Elsewhere an explicit host request forces
        // compact, otherwise the skin self-detects from its rendered scale (off at 1280×800).
        compact={driveWindow ? false : compact === true ? true : 'auto'}
      />
      </div>
    </div>
  );
}
