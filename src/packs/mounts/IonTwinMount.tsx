import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { IonTwinBoard, type TiPower } from '../../skins/ion-twin/IonTwinBoard';
import {
  ionLockStage,
  ionRpmNorm,
  pickTiSize,
  readDriveMode,
  readGlyphsOn,
  readMapOrient,
  readMapZoom,
  writeDriveMode,
  writeGlyphsOn,
  writeMapOrient,
  writeMapZoom,
  type IonDriveMode,
  type IonMapOrient,
} from '../ionTwin';
import { TI_BOX, type TiSize } from '../ion-twin/layouts';
import type { PackHudProps } from '../types';
import './ion-twin-mount.css';

/**
 * Twin Ion on the Carrier Jet shared grid (Meghan ti-cj-grid-v1).
 * Framework adapter: ThemeStage telemetry + engine lockStage/state → Cold Glass board.
 * Native design boxes (1280 / 1024 / 773) scaled uniformly; no canvas, no live backdrop filters, no rAF.
 */
export function IonTwinMount({
  rpmNorm,
  rpm,
  speed,
  unit,
  load,
  throttle,
  gear,
  running,
  motion,
  driveWindow = false,
  lockStage,
  engineState,
  demoThrottle,
  stale: staleProp = false,
}: PackHudProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<TiSize>('d1280');
  const [scale, setScale] = useState(1);
  const [mode, setMode] = useState<IonDriveMode>(readDriveMode);
  const [glyphsOn, setGlyphsOn] = useState(readGlyphsOn);
  const [mapOrient, setMapOrient] = useState<IonMapOrient>(readMapOrient);
  const [mapZoom, setMapZoom] = useState(readMapZoom);
  // Deterministic stale proof: #/drive?pack=ion-twin&tiStale=1 (capture / review).
  const [urlStale] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
      return q.get('tiStale') === '1';
    } catch {
      return false;
    }
  });
  const stale = urlStale || staleProp;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Prefer the Drive scene (full viewport). Twin Ion's mock design boxes include host chrome
    // gutters, so fitting to padded .skin-body alone under-scales the board (esp. at 773).
    const host = (el.closest('.rev-scene') as HTMLElement | null) ?? el.parentElement;
    if (!host) return;
    const measure = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      const next = pickTiSize(w, h, driveWindow || h <= 640 || w < 900);
      const box = TI_BOX[next];
      const s = Math.max(0.35, Math.min(1, Math.min(w / box.w, h / box.h)));
      setSize((prev) => (prev === next ? prev : next));
      setScale((prev) => (Math.abs(prev - s) < 0.002 ? prev : s));
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

  const box = TI_BOX[size];

  const stage = ionLockStage(lockStage, running);
  const rpmN = ionRpmNorm(rpmNorm, engineState);
  // Circuit power: running → full; parked → battery-only blank glass (CJ lit=powered).
  // Full power-off (no battery) is not reachable without a pack switch — see BUILD.md.
  const power: TiPower = running ? 'on' : 'batt';
  // THR readout must match the demo slider (pedal). Prefer demoThrottle; fall back to ThemeStage throttle.
  const thr01 = running
    ? (typeof demoThrottle === 'number' && Number.isFinite(demoThrottle)
        ? Math.max(0, Math.min(1, demoThrottle))
        : Math.max(0, Math.min(1, throttle)))
    : 0;
  const load01 = running
    ? (typeof engineState?.load === 'number' ? Math.max(0, Math.min(1, engineState.load)) : Math.max(0, Math.min(1, load)))
    : 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vp = el.closest('.rev-viewport') as HTMLElement | null;
    if (!vp) return;
    vp.style.setProperty('--ti-thr', `${Math.round(thr01 * 100)}%`);
    return () => {
      vp.style.removeProperty('--ti-thr');
    };
  }, [thr01]);

  return (
    <div
      ref={ref}
      className="itm-cj"
      data-skin="ion-twin"
      data-ti-size={size}
      data-lock-stage={stage}
      data-running={running ? 'true' : 'false'}
      data-motion={motion ? 'on' : 'off'}
      data-drive-window={driveWindow ? 'true' : undefined}
      data-fit-box={`${box.w},${box.h},${box.h}`}
      style={{ '--itm-w': `${box.w}px`, '--itm-h': `${box.h}px`, '--itm-s': scale } as CSSProperties}
    >
      <div className="itm-cj-box">
        <IonTwinBoard
          size={size}
          power={power}
          motion={motion}
          glyphsOn={glyphsOn}
          onToggleGlyphs={() => {
            const next = !glyphsOn;
            setGlyphsOn(next);
            writeGlyphsOn(next);
          }}
          mode={mode}
          onMode={(m) => {
            setMode(m);
            writeDriveMode(m);
          }}
          mapOrient={mapOrient}
          onMapOrient={(o) => {
            setMapOrient(o);
            writeMapOrient(o);
          }}
          mapZoom={mapZoom}
          onMapZoom={(z) => {
            setMapZoom(z);
            writeMapZoom(z);
          }}
          speed={speed}
          unit={unit}
          gear={gear}
          rpm={running ? rpm : 0}
          rpmNorm={running ? rpmN : 0}
          throttle={thr01}
          load={load01}
          lockStage={stage}
          stale={stale}
        />
      </div>
    </div>
  );
}

