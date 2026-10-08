import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MAX_CONTACTS,
  RADAR_SEED,
  SLICES,
  STATIC_BLIP_ENERGY,
  afterglow,
  contactLife,
  contactTarget,
  createRadarLoop,
  createRadarState,
  stepRadar,
  type RadarInputs,
  type RadarState,
} from './radarModel';

export interface NightPursuitRadarProps {
  rpmNorm: number;
  speedNorm: number;
  loadFeel: number;
  /** In-app motion flag. `false` → static scope (same as OS reduced motion). */
  motion?: boolean;
  seed?: number;
}

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches;
}

function rgbOf(css: string, fallback: string): string {
  const m = css.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

interface Geo {
  /** Scope radius and face margin, layout (pre-transform) css px. */
  R: number;
  m: number;
  /** Blip radius. */
  br: number;
}

/** Range rings, crosshair, bearing ticks and own-car chevron in a 200×100 half-moon (origin 100,100; R 100). */
function Grid() {
  const ticks = [];
  for (let d = 0; d <= 180; d += 10) {
    const a = Math.PI + (d * Math.PI) / 180;
    const long = d % 30 === 0;
    const r0 = long ? 92 : 96;
    ticks.push(
      <line
        key={d}
        className={long ? 'np-radar-tick long' : 'np-radar-tick'}
        x1={100 + Math.cos(a) * r0}
        y1={100 + Math.sin(a) * r0}
        x2={100 + Math.cos(a) * 100}
        y2={100 + Math.sin(a) * 100}
      />,
    );
  }
  return (
    <>
      <path className="np-radar-ring" d="M66.67 100 A33.33 33.33 0 0 1 133.33 100" />
      <path className="np-radar-ring" d="M33.33 100 A66.67 66.67 0 0 1 166.67 100" />
      <path className="np-radar-spoke" d="M100 100 L29.29 29.29 M100 100 L170.71 29.29" />
      <path className="np-radar-bore" d="M100 100 V0" />
      <path className="np-radar-base" d="M0 100 H200" />
      <path className="np-radar-edge" d="M0 100 A100 100 0 0 1 200 100" />
      {ticks}
      <path className="np-radar-own" d="M100 91 L104.5 100 L100 97 L95.5 100 Z" />
    </>
  );
}

/**
 * Night Pursuit sensor-pod radar. Lives entirely inside the green CRT screen (`.np-crt-a`) and is
 * sized from that box (ResizeObserver, once per resize). No canvas: an SVG grid, one CSS
 * conic-gradient afterglow wedge, a beam and a few blip dots, all painted in the pod's own layer,
 * so the rest of the HUD keeps its exact layering and pixels.
 * Live: sector sweep + afterglow + persistent blips; rAF only while on screen and the tab is shown,
 * and each frame only writes styles (no layout reads).
 * Reduced motion (OS, `motion={false}`, or a `.motion-off` stage): static scope, no rAF.
 */
export function NightPursuitRadar({ rpmNorm, speedNorm, loadFeel, motion, seed = RADAR_SEED }: NightPursuitRadarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wedgeRef = useRef<HTMLDivElement>(null);
  const beamRef = useRef<HTMLDivElement>(null);
  const blipRefs = useRef<(HTMLElement | null)[]>([]);
  const inputs = useRef<RadarInputs>({ rpmNorm, speedNorm, load: loadFeel });
  useLayoutEffect(() => {
    inputs.current = { rpmNorm, speedNorm, load: loadFeel };
  }, [rpmNorm, speedNorm, loadFeel]);

  const [mediaReduced, setMediaReduced] = useState(prefersReducedMotion);
  const [stageOff, setStageOff] = useState(false);
  const staticMode = motion === false || mediaReduced || stageOff;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCE_QUERY);
    const on = () => setMediaReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // In-app motion toggle: ThemeStage puts `.motion-off` on the stage. Watch only that attribute.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const check = () => setStageOff(!!el.closest('.motion-off'));
    check();
    const stage = el.closest('.theme-stage');
    if (!stage) return;
    const mo = new MutationObserver(check);
    mo.observe(stage, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const stateRef = useRef<RadarState | null>(null);
  const drawStaticRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const face = faceRef.current;
    const svg = svgRef.current;
    const wedge = wedgeRef.current;
    const beam = beamRef.current;
    if (!root || !face || !svg || !wedge || !beam) return;
    if (!stateRef.current) {
      // Deterministic warm-up so the first frame already has persistence on screen.
      const s = createRadarState(seed, inputs.current);
      for (let i = 0; i < 180; i++) stepRadar(s, 1 / 60, inputs.current);
      stateRef.current = s;
    }
    const state = stateRef.current;
    const blips = blipRefs.current;
    let geo: Geo | null = null;
    let green = '0,200,83';
    const last = { wedge: '', beam: '', blip: blips.map(() => ({ t: '', o: '' })) };

    const placeBlips = (frozen: boolean) => {
      if (!geo) return;
      const { R, m, br } = geo;
      state.contacts.forEach((c, i) => {
        const el = blips[i];
        if (!el) return;
        const a = frozen ? c.presence : c.presence * contactLife(c.range);
        const e = frozen ? STATIC_BLIP_ENERGY : c.energy;
        const ang = Math.PI + c.bearing;
        const x = m + R + Math.cos(ang) * c.range * R - br;
        const y = m + R + Math.sin(ang) * c.range * R - br;
        const t = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
        const o = a < 0.01 ? '0' : Math.min(1, a * (0.16 + 0.84 * e)).toFixed(3);
        if (last.blip[i].t !== t) el.style.transform = last.blip[i].t = t;
        if (last.blip[i].o !== o) el.style.opacity = last.blip[i].o = o;
      });
    };

    const drawStatic = () => {
      // Frozen contacts follow the current traffic level; no sweep, no afterglow.
      const target = contactTarget(inputs.current.speedNorm, inputs.current.load);
      state.contacts.forEach((c, i) => (c.presence = Math.max(0, Math.min(1, target - i))));
      placeBlips(true);
    };
    drawStaticRef.current = staticMode ? drawStatic : null;

    const drawLive = () => {
      if (!geo) return;
      // Afterglow wedge: one conic gradient across the half-moon (CSS 0deg = up; left horizon = -90deg).
      let g = 'conic-gradient(from -90deg';
      for (let i = 0; i < SLICES; i++) {
        const a = afterglow(state.t - state.lastHit[i]);
        g += `,rgba(${green},${a.toFixed(3)}) ${(((i + 0.5) / SLICES) * 180).toFixed(2)}deg`;
      }
      g += `,rgba(${green},0) 180deg)`;
      if (g !== last.wedge) wedge.style.backgroundImage = last.wedge = g;
      const deg = 180 + (state.bearing * 180) / Math.PI;
      const b = `rotate(${deg.toFixed(2)}deg)`;
      if (b !== last.beam) beam.style.transform = last.beam = b;
      placeBlips(false);
    };

    const loop = createRadarLoop(
      (cb) => requestAnimationFrame(cb),
      (id) => cancelAnimationFrame(id),
      (dt) => {
        stepRadar(state, dt, inputs.current);
        drawLive();
      },
    );

    // Size from the scope's own box. Measured only on resize, never per frame.
    const measure = () => {
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      if (!w || !h) return;
      const hostScale = root.getBoundingClientRect().width / w || 1;
      const px = 1 / hostScale; // layout px per on-screen px
      const pad = Math.max(3 * px, Math.min(w / 2, h) * 0.07);
      const R = Math.max(4, Math.min(w / 2 - pad, h - pad * 2));
      const m = Math.max(2 * px, R * 0.05);
      const br = Math.max(2.5 * px, R * 0.045);
      const cy = (h + R) / 2;
      geo = { R, m, br };
      green = rgbOf(getComputedStyle(root).getPropertyValue('--skin-green'), '0,200,83');
      const fs = face.style;
      fs.left = `${w / 2 - R - m}px`;
      fs.top = `${cy - R - m}px`;
      fs.width = `${2 * (R + m)}px`;
      fs.height = `${R + 2 * m}px`;
      root.style.setProperty('--np-radar-px', `${px}px`);
      const mu = (m / R) * 100;
      svg.setAttribute('viewBox', `${-mu} ${-mu} ${200 + 2 * mu} ${100 + 2 * mu}`);
      Object.assign(wedge.style, { left: `${m}px`, top: `${m}px`, width: `${2 * R}px`, height: `${2 * R}px` });
      const bh = 6 * px;
      Object.assign(beam.style, { left: `${m + R}px`, top: `${m + R - bh / 2}px`, width: `${R}px`, height: `${bh}px` });
      for (const el of blips) if (el) Object.assign(el.style, { width: `${2 * br}px`, height: `${2 * br}px` });
      last.blip.forEach((l) => (l.t = ''));
      if (staticMode) drawStatic();
      else drawLive();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener('resize', measure);

    let io: IntersectionObserver | null = null;
    const onVis = () => loop.set({ hidden: document.hidden });
    if (!staticMode) {
      document.addEventListener('visibilitychange', onVis);
      io = new IntersectionObserver((es) => loop.set({ visible: es[es.length - 1].isIntersecting }));
      io.observe(root);
      loop.set({ staticMode: false, hidden: document.hidden });
    }
    return () => {
      loop.stop();
      ro.disconnect();
      io?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', onVis);
      drawStaticRef.current = null;
    };
  }, [staticMode, seed]);

  // Static scope: re-place frozen blips only when the traffic level changes (not per publish).
  const bucket = Math.round(contactTarget(speedNorm, loadFeel) * 4);
  useEffect(() => {
    drawStaticRef.current?.();
  }, [bucket, staticMode]);

  return (
    <div ref={rootRef} className="np-radar" aria-hidden="true" data-radar={staticMode ? 'static' : 'live'}>
      <div ref={faceRef} className="np-radar-face">
        <div className="np-radar-glow" />
        <div ref={wedgeRef} className="np-radar-wedge" />
        <svg ref={svgRef} className="np-radar-grid" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <Grid />
        </svg>
        {Array.from({ length: MAX_CONTACTS }, (_, i) => (
          <i key={i} ref={(el) => void (blipRefs.current[i] = el)} className="np-radar-blip" />
        ))}
        <div ref={beamRef} className="np-radar-beam" />
      </div>
    </div>
  );
}
