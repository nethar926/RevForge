import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { ChronoCoupeHud, type RailMode } from '../../skins/chrono-coupe/ChronoCoupeHud';
import ID from '../chrono-coupe.identity';
import type { PackHudProps } from '../types';
import { storageKey } from '../../lib/storageKey';
import { useFitBox } from './useFitBox';
import { usePackShell } from './usePackShell';
import { getPackMode, onPackMode, readPackEnvelope, requestPackShell, sendPackEngineCommand, setPackMode, type PackMode } from '../runtime';
import './pack-fit.css';
import './chrono-coupe-mount.css';

/** Rail ↔ runtime pack mode (Audio's setPursuitBoost follows it via audioBridge). */
const toRail = (m: PackMode): RailMode => (m === 'pursuit' ? 'jump' : m === 'auto' ? 'off' : 'cruise');
const toPack = (m: RailMode): PackMode => (m === 'jump' ? 'pursuit' : m === 'off' ? 'auto' : 'norm');


/**
 * Drive-window box for the FULL layout (chrono-coupe-mount.css reflows it; nothing swapped).
 * The free area is the Drive stage between the top bar and the dock; the demo Throttle card
 * sits in its bottom-right corner, so the HUD takes an L: the full-width strip above the card
 * (date banks | velocity + engine, then the rail) plus the column left of it (the charge and
 * core-output panels beside the card). Uniform scale = the largest that keeps every element at
 * its full-layout minimum, so 12px captions render >= 11px; below S_MIN the window can't hold
 * the full layout and the skin's own compact fallback stays in charge.
 */
const DW_GAP = 8; // same gap useDriveWindow keeps to the top bar / dock / throttle card / edges
const DW_PAD = 4; // HUD inner padding in drive-window mode (design px)
const DW_COL_A = 450; // date banks column (min-content with the drive-window cell gaps)
const DW_COL_B = 280; // velocity column (JUMP THRESHOLD label row + panel padding)
const DW_ROW1 = 250; // banks / velocity + engine row
const DW_ROW3 = 80; // charge + core-output row (gauge + 12px readout)
const DW_TAP = 48; // rail height in screen px
const S_MIN = 0.92; // 12px captions x 0.92 = 11.04px
const S_MAX = 1.25;

interface DriveBox {
  s: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** strip height (top of HUD to the gap above the Throttle card), design px */
  sh: number;
  /** notch x (gap left of the Throttle card), design px; = w when there is no card */
  nx: number;
  /** charge + core-output row height, design px */
  r3: number;
  notch: boolean;
}

function useDriveBox(ref: RefObject<HTMLDivElement | null>, active: boolean): DriveBox | null {
  const [box, setBox] = useState<DriveBox | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const body = el?.parentElement;
    const stage = el?.closest<HTMLElement>('.theme-stage');
    const viewport = el?.closest<HTMLElement>('.rev-viewport');
    if (!active || !el || !body || !stage || !viewport || !el.closest('.rev-scene')) {
      setBox(null);
      return;
    }
    const shown = (e: Element) => (e as HTMLElement).offsetParent !== null;
    const rects = (sel: string) => [...viewport.querySelectorAll(sel)].filter(shown).map((e) => e.getBoundingClientRect());
    const measure = () => {
      const sr = stage.getBoundingClientRect();
      const br = body.getBoundingClientRect();
      const topR = rects('.rev-topbar > *');
      const dockR = rects('.rev-dock > *');
      const top = (topR.length ? Math.max(...topR.map((r) => r.bottom)) - sr.top : 0) + DW_GAP;
      const bottom = (dockR.length ? Math.min(...dockR.map((r) => r.top)) - sr.top : sr.height) - DW_GAP;
      const left = DW_GAP;
      const fw = sr.width - 2 * DW_GAP;
      const fh = bottom - top;
      if (fw <= 0 || fh <= 0) return setBox(null);
      const t = rects('.rev-throttle')[0];
      const tx = t ? t.left - sr.left - DW_GAP - left : fw;
      const ty = t ? t.top - sr.top - DW_GAP - top : fh;
      const notch = !!t && tx > 0 && ty > 0 && tx < fw && ty < fh;
      const stripH = notch ? ty : fh;
      const notchX = notch ? tx : fw;
      // Largest uniform scale that keeps each region at its full-layout minimum.
      let s = Math.min(
        S_MAX,
        notchX / (DW_COL_A + DW_PAD),
        fw / (DW_COL_A + DW_COL_B + 2 * DW_PAD + DW_GAP),
        notch ? (stripH - DW_TAP) / (DW_ROW1 + DW_PAD + DW_GAP) : (fh - DW_TAP) / (DW_ROW1 + DW_ROW3 + 2 * DW_PAD + 2 * DW_GAP),
      );
      if (notch) s = Math.min(s, (fh - stripH) / (DW_ROW3 + DW_PAD + DW_GAP));
      if (!(s >= S_MIN)) return setBox(null);
      const w = fw / s;
      const h = fh / s;
      const sh = notch ? stripH / s : h - Math.max(DW_ROW3 + DW_PAD + DW_GAP, Math.round(h * 0.3));
      const next: DriveBox = { s, x: left + sr.left - br.left, y: top + sr.top - br.top, w, h, sh, nx: notchX / s, r3: h - sh - DW_GAP - DW_PAD, notch };
      setBox((prev) =>
        prev && prev.notch === next.notch && (['s', 'x', 'y', 'w', 'h', 'sh', 'nx'] as const).every((k) => Math.abs(prev[k] - next[k]) < (k === 's' ? 0.001 : 0.25)) ? prev : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    const watch = () => {
      ro.disconnect();
      ro.observe(body);
      for (const e of viewport.querySelectorAll('.rev-topbar, .rev-dock, .rev-throttle')) ro.observe(e);
    };
    watch();
    const mo = new MutationObserver(() => {
      watch();
      measure();
    });
    mo.observe(viewport, { childList: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, active]);
  return active ? box : null;
}

/**
 * Framework adapter: ThemeStage telemetry + pack runtime bus → Chrono Coupe HUD.
 * Fixed-width design box (1280) whose height follows the stage aspect, then
 * uniform scale. Re-renders only on the existing HUD publish.
 */
export function ChronoCoupeMount(props: PackHudProps) {
  // Design box 1240 wide (min 500 tall) so the full layout reaches scale ≥ 1.0 at a
  // 1280×800 Drive stage (1248 × 518 with the demo throttle card): 11px captions stay
  // ≥ 11px and the skin's 'auto' compact (scale × 11 < 11) stays off at 1280.
  const { ref, fit } = useFitBox(1240, 500, 740, 720);
  // Drive-window mode: the full layout in its drive box (null = parked, or too small → compact fallback).
  const dw = useDriveBox(ref, !!props.driveWindow);
  const shell = usePackShell();
  const [mode, setMode] = useState<RailMode>(() => toRail(getPackMode(ID.id, 'norm')));
  useEffect(
    () =>
      onPackMode((id, next) => {
        if (id === ID.id) setMode(toRail(next));
      }),
    [],
  );
  return (
    <div
      ref={ref}
      className="rf-pack-fit"
      data-pack={ID.id}
      data-cc-box={dw ? 'drive' : undefined}
      data-cc-notch={dw ? String(dw.notch) : undefined}
      style={
        (dw
          ? {
              '--pf-s': dw.s,
              '--pf-w': `${dw.w}px`,
              '--pf-h': `${dw.h}px`,
              '--ccd-x': `${dw.x}px`,
              '--ccd-y': `${dw.y}px`,
              '--ccd-sh': `${dw.sh}px`,
              '--ccd-nx': `${dw.nx}px`,
              '--ccd-r3': `${dw.r3}px`,
            }
          : { '--pf-s': fit.s, '--pf-w': `${fit.w}px`, '--pf-h': `${fit.h}px` }) as CSSProperties
      }
    >
      <div className="rf-pack-box">
        <ChronoCoupeHud
          {...props}
          // Drive window with a drive box: always the FULL layout (explicit false, so the skin's
          // 'auto' threshold can't swap in the compact variant). Otherwise the skin self-detects.
          compact={dw ? false : 'auto'}
          storageKey={storageKey(`revforge.pack.${ID.id}`)}
          shellConnected={shell.connected}
          muted={shell.muted}
          mode={mode}
          onModeChange={(m) => setPackMode(ID.id, toPack(m))}
          envelope={props.running ? readPackEnvelope() : 0}
          onToggleSound={() => requestPackShell({ type: 'toggle-mute' })}
          onCharge={(level) => sendPackEngineCommand(ID.id, { type: 'charge', level })}
          onDischarge={() => sendPackEngineCommand(ID.id, { type: 'discharge' })}
        />
      </div>
    </div>
  );
}
