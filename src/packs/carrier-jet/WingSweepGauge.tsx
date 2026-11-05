/**
 * WING SWEEP gauge and the map's own-ship marker, both drawn from Wilson's art.
 * The angle is the skin's live sweep (the rAF on [data-cj-rot]): Reduce Motion snaps there,
 * otherwise the wings follow that same rate-limited angle. No second animator.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import {
  ARC_LABELS,
  ARC_LEFT,
  ARC_MIRROR_TICKS,
  ARC_R,
  ARC_RIGHT,
  BODY,
  CANOPY_A,
  CANOPY_B,
  MARKER_CENTER,
  MARKER_VB,
  SWEEP_FULL,
  SWEEP_PARKED,
  SWEEP_SPREAD,
  TAIL_L,
  TAIL_R,
  WING_R,
  arcLabelR,
  dialArc,
  dialPoint,
  gaugeFrame,
  wingSweepLabel,
  wingTransform,
} from './wingSweep';

interface SweepSnap { deg: number; parked: boolean }

const listeners = new Set<() => void>();
let snap: SweepSnap = { deg: SWEEP_SPREAD, parked: false };
let raf = 0;
let users = 0;

function readSkin(): SweepSnap {
  if (typeof document === 'undefined') return snap;
  const meter = document.querySelector<HTMLElement>('.cj-a-sweep[data-cj-meter]');
  if (!meter) return snap;
  const rot = meter.querySelector<SVGElement>('[data-cj-rot="1"]:not([data-max])');
  const m = rot?.getAttribute('transform')?.match(/rotate\(\s*(-?\d+(?:\.\d+)?)/);
  const fromRot = m ? Number(m[1]) : NaN;
  const fromNow = Number(meter.getAttribute('aria-valuenow'));
  const deg = Number.isFinite(fromRot) ? fromRot : fromNow;
  if (!Number.isFinite(deg)) return snap;
  const parked = (meter.getAttribute('aria-valuetext') ?? '').includes('over-swept');
  return { deg, parked };
}

function tick() {
  const next = readSkin();
  if (next.parked !== snap.parked || Math.abs(next.deg - snap.deg) >= 0.02) {
    snap = next;
    for (const l of listeners) l();
  }
  raf = requestAnimationFrame(tick);
}

function subscribe(l: () => void) {
  listeners.add(l);
  users += 1;
  if (users === 1) raf = requestAnimationFrame(tick);
  return () => {
    listeners.delete(l);
    users -= 1;
    if (users === 0) cancelAnimationFrame(raf);
  };
}

function useWingSweep(): SweepSnap {
  return useSyncExternalStore(subscribe, () => snap, () => snap);
}

/** Face size and the art box inside it. A short wide face puts the readout beside the jet. */
function useGaugeBox(face: RefObject<HTMLElement | null>, svg: RefObject<SVGSVGElement | null>) {
  const [box, setBox] = useState({ fw: 0, fh: 0, sw: 0, sh: 0 });
  useLayoutEffect(() => {
    const a = face.current;
    const b = svg.current;
    if (!a || !b) return;
    const measure = () => {
      const fr = a.getBoundingClientRect();
      const sr = b.getBoundingClientRect();
      const n = { fw: fr.width, fh: fr.height, sw: sr.width, sh: sr.height };
      setBox((p) => (Math.abs(p.fw - n.fw) < 0.5 && Math.abs(p.fh - n.fh) < 0.5 && Math.abs(p.sw - n.sw) < 0.5 && Math.abs(p.sh - n.sh) < 0.5 ? p : n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(a);
    ro.observe(b);
    return () => ro.disconnect();
  }, [face, svg]);
  return box;
}

/** SVG user units that render as at least `px` screen pixels inside this viewBox. */
function useUserPx(ref: RefObject<SVGSVGElement | null>, vbW: number, vbH: number, px = 11) {
  const [fs, setFs] = useState(px);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / vbW, r.height / vbH);
      if (s < 0.01) return;
      const n = Math.round((px / s) * 100) / 100;
      setFs((p) => (Math.abs(p - n) < 0.05 ? p : n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, vbW, vbH, px]);
  return fs;
}

function WingPair({ sweep, className }: { sweep: number; className?: string }) {
  return (
    <>
      <path className={className} d={WING_R} transform={wingTransform(sweep, 'r')} />
      <path className={className} d={WING_R} transform={wingTransform(sweep, 'l')} />
    </>
  );
}

/** Wings, then body, then stabilizers. Canopy is the gauge's top layer; the marker is one solid silhouette. */
function Airframe({ sweep, marker }: { sweep: number; marker?: boolean }) {
  const wing = marker ? undefined : 'cjw-wing';
  const body = marker ? undefined : 'cjw-body';
  const tail = marker ? undefined : 'cjw-tail';
  return (
    <>
      <WingPair sweep={sweep} className={wing} />
      <path className={body} d={BODY} />
      <path className={tail} d={TAIL_L} />
      <path className={tail} d={TAIL_R} />
      {!marker && (
        <>
          <path className="cjw-canopy" d={CANOPY_A} />
          <path className="cjw-canopy" d={CANOPY_B} />
        </>
      )}
    </>
  );
}

function Tick({ deg, faint, parked }: { deg: number; faint?: boolean; parked: boolean }) {
  const a0 = dialPoint(deg, ARC_R - 7);
  const a1 = dialPoint(deg, ARC_R + 1.6);
  const amber = faint && parked;
  return <line className={faint ? 'cjv2-wsw-tick cjv2-wsw-tick75' : 'cjv2-wsw-tick'} data-over={amber || undefined} x1={a0.x} y1={a0.y} x2={a1.x} y2={a1.y} />;
}

/** Wide arc under both wings. 75 is always drawn, in the backlight colour, and amber only when parked. */
function Arc({ parked, fs }: { parked: boolean; fs: number }) {
  const lr = arcLabelR(fs);
  return (
    <g className="cjv2-wsw-legend">
      <path className="cjv2-wsw-arc" d={dialArc(ARC_RIGHT.a0, ARC_RIGHT.a1, ARC_R)} />
      <path className="cjv2-wsw-arc" d={dialArc(ARC_LEFT.a0 - 4, ARC_LEFT.a1, ARC_R)} />
      {ARC_LABELS.map((l) => <Tick key={l.text} deg={l.deg} faint={l.faint} parked={parked} />)}
      {ARC_MIRROR_TICKS.map((deg) => <Tick key={deg} deg={deg} parked={parked} />)}
      {ARC_LABELS.map((l) => {
        const p = dialPoint(l.deg, lr);
        const amber = l.faint && parked;
        return (
          <text key={l.text} className={l.faint ? 'cjv2-wsw-lab cjv2-wsw-lab75' : 'cjv2-wsw-lab'} data-over={amber || undefined} x={p.x} y={p.y} fontSize={fs}>
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

function Readout({ deg, parked }: { deg: number; parked: boolean }) {
  return (
    <div className="cjv2-wsw-read">
      <span className="cjv2-wsw-num cjv2-wsw-data" data-over={parked || undefined} aria-hidden="true">{`${Math.round(deg)}°`}</span>
      <span className="cjv2-wsw-cap" aria-hidden="true">WING SWEEP</span>
    </div>
  );
}

/** The CRT face that replaces the skin planform + tape. Positioned on the sweep cell. */
export function WingSweepGauge({ style }: { style: CSSProperties }) {
  const face = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const box = useGaugeBox(face, svg);
  const short = box.fh > 0 && box.fh <= 168 && box.fw / box.fh >= 1.6;
  const aspect = box.sh > 8 ? box.sw / box.sh : 249 / 171;
  const vb = gaugeFrame(aspect, short);
  const fs = useUserPx(svg, vb.w, vb.h, 11);
  const { deg, parked } = useWingSweep();
  const label = wingSweepLabel(deg, parked);
  return (
    <div className="cjv2-cell cjv2-wsw" style={style} data-over={parked || undefined} data-sweep={Math.round(deg)} data-short={short || undefined}>
      <div className="cjv2-crt">
        <div
          ref={face}
          className="cjv2-wsw-face"
          role="meter"
          aria-label="Wing sweep"
          aria-valuemin={SWEEP_SPREAD}
          aria-valuemax={SWEEP_PARKED}
          aria-valuenow={Math.round(deg)}
          aria-valuetext={label}
        >
          {parked && <span className="cjv2-wsw-park cjv2-wsw-data" aria-hidden="true">PARKED · OVERSWEEP</span>}
          <svg ref={svg} className="cjv2-wsw-art" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <Arc parked={parked} fs={fs} />
            <g className="cjv2-wsw-data">
              <WingPair sweep={SWEEP_SPREAD} className="cjw-ghost" />
              <WingPair sweep={SWEEP_FULL} className="cjw-ghost" />
              <Airframe sweep={deg} />
            </g>
          </svg>
          <Readout deg={deg} parked={parked} />
        </div>
      </div>
    </div>
  );
}

/**
 * Map own-ship. One solid fill and a dark outline, wings at the same sweep as the gauge.
 * `rot` is degrees clockwise from nose-up (0 in track-up). `stale` dims the fill to amber.
 */
export function WingSweepMarker({ x, y, rot, stale, px }: { x: number; y: number; rot: number; stale: boolean; px: number }) {
  const { deg } = useWingSweep();
  const s = px / MARKER_VB.w;
  const frame = (tone: 'out' | 'in'): ReactNode => (
    <g className={tone === 'out' ? 'cjv2-marker-out' : 'cjv2-marker-in'}>
      <Airframe sweep={deg} marker />
    </g>
  );
  return (
    <g
      className="cjv2-marker"
      data-stale={stale || undefined}
      data-sweep={Math.round(deg)}
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${s}) translate(${-MARKER_CENTER.x} ${-MARKER_CENTER.y})`}
    >
      {frame('out')}
      {frame('in')}
    </g>
  );
}
