/**
 * Original SVG parts for the Carrier Jet skin, ported from the concept boards
 * (drivesynth-skins/carrier-jet-concepts/tools/parts.mjs): planform, sweep tape + mode windows,
 * pitch ladder, compass rose, heading tape, AoA tape + indexer, approach lights, engine strips.
 * Every <svg> is a fixed viewBox that scales into its grid cell; `useSvgScale` writes the
 * rendered scale to --cj-sv so SVG text never renders under 12px (see .cj-t in carrier-jet.css).
 * The wing, arc pointer and tape ACT marks carry data-cj-* hooks: the HUD's rAF loop moves
 * them with transform attributes only (no React re-render per frame).
 */
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { SWEEP_TAPE_HI, SWEEP_TAPE_LO, type IndexerState, type SweepMode } from './model';
import type { CjPalette } from './palettes';

const f1 = (n: number) => Math.round(n * 10) / 10;
type Pt = [number, number];

// ------------------------------------------------------------------ SVG frame + text
export function Svg({ w, h, className = '', children, align = 'xMidYMid' }: { w: number; h: number; className?: string; children: ReactNode; align?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Rendered px per user unit (meet), including any ancestor transform.
      const s = Math.min(r.width / w, r.height / h);
      const v = String(Math.round(s * 1000) / 1000);
      if (el.style.getPropertyValue('--cj-sv') !== v) el.style.setProperty('--cj-sv', v);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return (
    <svg ref={ref} className={`cj-svg ${className}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio={`${align} meet`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

interface TOpts { size?: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; ls?: number; cls?: string }
export function T({ x, y, children, size = 13, fill, anchor = 'middle', weight = 600, ls = 0.06, cls = '' }: TOpts & { x: number; y: number; children: ReactNode }) {
  return (
    <text x={f1(x)} y={f1(y)} fill={fill} textAnchor={anchor} fontWeight={weight} letterSpacing={`${ls}em`} className={`cj-t ${cls}`} style={{ '--fs': size } as CSSProperties}>
      {children}
    </text>
  );
}

// ------------------------------------------------------------------ planform (original top-down swing-wing jet, nose up, unit length 200)
const BODY_R: Pt[] = [[0, -100], [4, -88], [7.5, -74], [10, -58], [12, -46], [15, -36], [33, -10], [36, -2], [35, 6], [29, 22], [28, 46], [27, 70], [26, 90], [22, 93], [18, 99], [9, 99], [5, 93], [0, 94]];
/** Leading edge is perpendicular to the body at 0° rotation, so rotation == LE sweep. */
const WING: Pt[] = [[-6, -7], [78, -7], [79, -3], [78, 1], [-6, 19]];
export const PIVOT: Pt = [29, -3];
const STAB: Pt[] = [[23, 60], [58, 82], [60, 88], [58, 95], [24, 90]];
const FIN: Pt[] = [[14, 44], [19, 46], [23, 90], [19, 92]];
const rot = ([x, y]: Pt, th: number): Pt => [x * Math.cos(th) - y * Math.sin(th), x * Math.sin(th) + y * Math.cos(th)];
export function wingPts(sweep: number, side: 1 | -1): Pt[] {
  const th = (sweep * Math.PI) / 180;
  return WING.map((p) => {
    const [x, y] = rot(p, th);
    return [side * (PIVOT[0] + x), PIVOT[1] + y] as Pt;
  });
}
const mirror = (pts: Pt[]): Pt[] => [...pts, ...pts.slice().reverse().map(([x, y]) => [-x, y] as Pt)];
const poly = (pts: Pt[], cx: number, cy: number, s: number) => pts.map(([x, y]) => `${f1(cx + x * s)},${f1(cy + y * s)}`).join(' ');

export function Planform({ cx, cy, s, P, ghosts = false, arc = false, glow = false, cmd }: { cx: number; cy: number; s: number; P: CjPalette; ghosts?: boolean; arc?: boolean; glow?: boolean; cmd: number }) {
  const id = useId().replace(/:/g, '');
  const sw = Math.max(1.5, 1.6 * s);
  const pivR: Pt = [cx + PIVOT[0] * s, cy + PIVOT[1] * s];
  const pivL: Pt = [cx - PIVOT[0] * s, cy + PIVOT[1] * s];
  const R = 92 * s;
  const pt = (a: number, r: number): Pt => [pivR[0] + r * Math.cos((a * Math.PI) / 180), pivR[1] + r * Math.sin((a * Math.PI) / 180)];
  const [ax, ay] = pt(20, R), [bx, by] = pt(68, R), [ox, oy] = pt(75, R);
  return (
    <g className="cj-planform">
      {glow && (
        <defs>
          <filter id={`${id}g`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor={P.glow} floodOpacity="0.55" />
          </filter>
        </defs>
      )}
      <g className={glow ? 'cj-glow' : undefined} style={glow ? ({ '--cj-glow': `url(#${id}g)` } as CSSProperties) : undefined}>
        {ghosts &&
          [20, 68].flatMap((a) =>
            ([1, -1] as const).map((side) => (
              <polygon key={`${a}${side}`} points={poly(wingPts(a, side), cx, cy, s)} fill="none" stroke={P.ghost} strokeWidth={f1(sw * 0.8)} strokeDasharray={`${f1(5 * s)} ${f1(4 * s)}`} />
            )),
          )}
        {([1, -1] as const).map((side) => (
          <polygon key={`st${side}`} points={poly(side === 1 ? STAB : STAB.map(([x, y]) => [-x, y] as Pt), cx, cy, s)} fill={P.jetFill} stroke={P.jetStroke} strokeWidth={f1(sw)} strokeLinejoin="round" />
        ))}
        {/* wings: drawn at 0°, rotated about each pivot by the rAF loop (transform attribute only) */}
        <g data-cj-rot="1" data-px={f1(pivR[0])} data-py={f1(pivR[1])}>
          <polygon className="cj-wing" points={poly(wingPts(0, 1), cx, cy, s)} fill={P.wingFill} stroke={P.wingStroke} strokeWidth={f1(sw)} strokeLinejoin="round" />
        </g>
        <g data-cj-rot="-1" data-px={f1(pivL[0])} data-py={f1(pivL[1])}>
          <polygon className="cj-wing" points={poly(wingPts(0, -1), cx, cy, s)} fill={P.wingFill} stroke={P.wingStroke} strokeWidth={f1(sw)} strokeLinejoin="round" />
        </g>
        <polygon points={poly(mirror(BODY_R), cx, cy, s)} fill={P.jetFill} stroke={P.jetStroke} strokeWidth={f1(sw)} strokeLinejoin="round" />
        {([1, -1] as const).map((side) => (
          <polygon key={`fn${side}`} points={poly(FIN.map(([x, y]) => [side * x, y] as Pt), cx, cy, s)} fill={P.jetStroke} stroke={P.jetStroke} strokeWidth={f1(sw * 0.6)} />
        ))}
        <ellipse cx={f1(cx)} cy={f1(cy - 63 * s)} rx={f1(4.2 * s)} ry={f1(13 * s)} fill={P.canopy} stroke={P.jetStroke} strokeWidth={f1(sw * 0.7)} />
        <circle cx={f1(pivR[0])} cy={f1(pivR[1])} r={f1(2.2 * s)} fill={P.jetStroke} />
        <circle cx={f1(pivL[0])} cy={f1(pivL[1])} r={f1(2.2 * s)} fill={P.jetStroke} />
      </g>
      {arc && (
        <g className="cj-arc">
          <path d={`M${f1(ax)} ${f1(ay)} A${f1(R)} ${f1(R)} 0 0 1 ${f1(bx)} ${f1(by)}`} fill="none" stroke={P.arc} strokeWidth={f1(sw)} />
          <path d={`M${f1(bx)} ${f1(by)} A${f1(R)} ${f1(R)} 0 0 1 ${f1(ox)} ${f1(oy)}`} fill="none" stroke={P.arc} strokeWidth={f1(sw)} strokeDasharray="3 3" />
          {Array.from({ length: 12 }, (_, i) => 20 + i * 5).map((a) => {
            const [x1, y1] = pt(a, R), [x2, y2] = pt(a, R + (a % 10 === 0 || a === 75 ? 9 : 5));
            return <line key={a} x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke={P.arc} strokeWidth={f1(sw * 0.8)} />;
          })}
          {(() => {
            const [x1, y1] = pt(68, R), [x2, y2] = pt(68, R + 12);
            return <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke={P.arc} strokeWidth={f1(sw * 1.4)} />;
          })()}
          {[20, 45, 68].map((a) => {
            const [x, y] = pt(a, R + 30);
            return (
              <g key={`l${a}`}>
                <rect x={f1(x - 19)} y={f1(y - 12)} width="38" height="24" rx="4" fill={P.tapeBg} />
                <T x={x} y={y + 5} fill={P.arcText}>{`${a}°`}</T>
              </g>
            );
          })}
          {/* commanded sweep tick (amber) + live pointer (rotated with ACT) */}
          <g transform={`rotate(${f1(Math.min(cmd, 75))} ${f1(pivR[0])} ${f1(pivR[1])})`}>
            <path d={`M${f1(pivR[0] + R + 2)} ${f1(pivR[1])} l9 -6 v12 z`} fill={P.caret} />
          </g>
          <g data-cj-rot="1" data-max="75" data-px={f1(pivR[0])} data-py={f1(pivR[1])}>
            <line x1={f1(pivR[0] + R - 2)} y1={f1(pivR[1])} x2={f1(pivR[0] + R - 16)} y2={f1(pivR[1])} stroke={P.pointer} strokeWidth={f1(sw * 2)} strokeLinecap="round" />
          </g>
        </g>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ wing-sweep tape: CMD caret + ACT bar, OVER band hatched, mode windows
export function SweepTape({ x, y, w, P, cmd, mode, windows = true, tall = 22, plate = '' }: { x: number; y: number; w: number; P: CjPalette; cmd: number; mode: SweepMode; windows?: boolean; tall?: number; plate?: string }) {
  const id = useId().replace(/:/g, '');
  const lo = SWEEP_TAPE_LO, hi = SWEEP_TAPE_HI;
  const pxDeg = w / (hi - lo);
  const X = (v: number) => x + (v - lo) * pxDeg;
  const ty = y + 16;
  const by = ty + tall;
  const labs = w > 330 ? [20, 30, 40, 50, 60, 68, 75] : [20, 40, 60, 68, 75];
  const ww = (w - 3 * 6) / 4;
  const barX = x + 1.5;
  return (
    <g className="cj-tape">
      {plate && <rect x={f1(x - 14)} y={f1(y - 4)} width={f1(w + 28)} height={windows ? 116 : 84} rx="6" fill={plate} stroke={P.winEdge} strokeWidth="1" />}
      <defs>
        <pattern id={`${id}h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={P.tapeBg} />
          <line x1="0" y1="0" x2="0" y2="6" stroke={P.hatch} strokeWidth="2.4" />
        </pattern>
      </defs>
      <rect x={f1(x)} y={f1(ty)} width={f1(w)} height={tall} fill={P.tapeBg} stroke={P.edge} strokeWidth="1.5" />
      <rect x={f1(X(68))} y={f1(ty)} width={f1(X(75) - X(68))} height={tall} fill={`url(#${id}h)`} stroke={P.edge} strokeWidth="1.5" />
      {/* ACT bar: full-length rect, scaled in x by the rAF loop */}
      <rect data-cj-bar="" data-x0={f1(barX)} data-lo={f1(x)} data-pxdeg={pxDeg} x={f1(barX)} y={f1(ty + 4)} width={f1(X(hi) - barX)} height={tall - 8} fill={P.fill} />
      <line data-cj-line="" data-lo={f1(x)} data-pxdeg={pxDeg} x1={f1(x)} y1={f1(ty - 2)} x2={f1(x)} y2={f1(ty + tall + 2)} stroke={P.pointer} strokeWidth="3" />
      <path d={`M${f1(X(cmd) - 8)} ${f1(ty - 14)} L${f1(X(cmd) + 8)} ${f1(ty - 14)} L${f1(X(cmd))} ${f1(ty - 3)} Z`} fill={P.caret} stroke={P.caret} strokeWidth="1" />
      {Array.from({ length: 14 }, (_, i) => 15 + i * 5).map((v) => {
        const major = v % 10 === 0 || v === 75;
        return <line key={v} x1={f1(X(v))} y1={f1(by)} x2={f1(X(v))} y2={f1(by + (major ? 9 : 5))} stroke={P.tick} strokeWidth="1.5" />;
      })}
      <line x1={f1(X(68))} y1={f1(by)} x2={f1(X(68))} y2={f1(by + 11)} stroke={P.tick} strokeWidth="3" />
      {labs.map((v) => (
        <T key={v} x={X(v) + (v === 68 ? -5 : v === 75 ? 5 : 0)} y={by + 28} fill={P.tapeText} weight={v === 68 || v === 75 ? 700 : 600}>
          {v}
        </T>
      ))}
      {windows &&
        (['AUTO', 'MAN', 'EMER', 'OVER'] as const).map((n, i) => {
          const wx = x + i * (ww + 6), wy = by + 38, lit = n === mode;
          const col = n === 'OVER' ? P.overFill : P.litFill;
          return (
            <g key={n} data-lit={lit ? 'true' : 'false'}>
              <rect x={f1(wx)} y={f1(wy)} width={f1(ww)} height="28" rx={P.winRx} fill={lit ? col : P.winBg} stroke={lit ? col : P.winEdge} strokeWidth="1.5" strokeDasharray={lit ? undefined : '4 3'} />
              <T x={wx + ww / 2} y={wy + 19} fill={lit ? P.litText : P.winText} weight={lit ? 800 : 600} ls={0.12}>
                {n}
              </T>
            </g>
          );
        })}
    </g>
  );
}

// ------------------------------------------------------------------ pitch ladder (VDI-style)
export function Ladder({ x, y, w, h, P, pitch = 0, bank = 0 }: { x: number; y: number; w: number; h: number; P: CjPalette; pitch?: number; bank?: number }) {
  const id = useId().replace(/:/g, '');
  const cx = x + w / 2, cy = y + h / 2, ppd = h / 60;
  const R = Math.min(w, h) * 0.46;
  const bt = ((-bank - 90) * Math.PI) / 180;
  const bx = cx + (R - 2) * Math.cos(bt), byy = cy + (R - 2) * Math.sin(bt);
  return (
    <g>
      <defs>
        <clipPath id={`${id}c`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <g transform={`rotate(${f1(-bank)} ${f1(cx)} ${f1(cy)}) translate(0 ${f1(pitch * ppd)})`}>
          <rect x={x - w} y={f1(cy)} width={w * 3} height={h * 2} fill={P.ground} />
          <line x1={x - w} y1={f1(cy)} x2={x + 2 * w} y2={f1(cy)} stroke={P.sym} strokeWidth="2.5" />
          {[-30, -20, -10, 10, 20, 30].map((d) => {
            const vis = cy - (d - pitch) * ppd;
            if (vis < y + 14 || vis > y + h - 10) return null;
            const ly = cy - d * ppd, half = w * (Math.abs(d) === 10 ? 0.2 : 0.16), gap = w * 0.07;
            const lab = Math.hypot(gap + half + 26, vis - cy) < R - 16 || Math.abs(vis - cy) < R * 0.5;
            return (
              <g key={d}>
                <path d={`M${f1(cx - gap - half)} ${f1(ly)} H${f1(cx - gap)} V${f1(ly + (d > 0 ? 7 : -7))} M${f1(cx + gap + half)} ${f1(ly)} H${f1(cx + gap)} V${f1(ly + (d > 0 ? 7 : -7))}`} fill="none" stroke={P.sym} strokeWidth="2" strokeDasharray={d < 0 ? '7 5' : undefined} />
                {lab && (
                  <>
                    <T x={cx - gap - half - 6} y={ly + 5} fill={P.symText} anchor="end">{Math.abs(d)}</T>
                    <T x={cx + gap + half + 6} y={ly + 5} fill={P.symText} anchor="start">{Math.abs(d)}</T>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </g>
      <path d={`M${f1(cx - 46)} ${f1(cy)} H${f1(cx - 18)} L${f1(cx - 9)} ${f1(cy + 10)} L${f1(cx)} ${f1(cy)} L${f1(cx + 9)} ${f1(cy + 10)} L${f1(cx + 18)} ${f1(cy)} H${f1(cx + 46)}`} fill="none" stroke={P.ref} strokeWidth="3.5" strokeLinejoin="round" />
      {[-45, -30, -10, 0, 10, 30, 45].map((a) => {
        const t = ((a - 90) * Math.PI) / 180, l = a % 30 === 0 ? 12 : 7;
        return <line key={a} x1={f1(cx + R * Math.cos(t))} y1={f1(cy + R * Math.sin(t))} x2={f1(cx + (R + l) * Math.cos(t))} y2={f1(cy + (R + l) * Math.sin(t))} stroke={P.sym} strokeWidth="2" />;
      })}
      <path d={`M${f1(bx)} ${f1(byy)} l-7 13 h14 z`} transform={`rotate(${f1(-bank)} ${f1(bx)} ${f1(byy)})`} fill={P.ref} />
    </g>
  );
}

// ------------------------------------------------------------------ compass rose (HSD-style arc)
const card = (d: number) => ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[d] ?? String(d / 10);
const hdgText = (heading: number | undefined) => (heading === undefined ? '---' : String(Math.round(heading) % 360).padStart(3, '0'));
export function Rose({ x, y, w, h, P, heading }: { x: number; y: number; w: number; h: number; P: CjPalette; heading?: number }) {
  const id = useId().replace(/:/g, '');
  const hd = heading ?? 0;
  const cx = x + w / 2, R = Math.min(w * 0.46, h * 0.9), cy = y + R + 34;
  return (
    <g>
      <defs>
        <clipPath id={`${id}c`}>
          <rect x={x} y={y + 30} width={w} height={h - 30} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <circle cx={f1(cx)} cy={f1(cy)} r={f1(R)} fill="none" stroke={P.sym} strokeWidth="2" />
        {Array.from({ length: 72 }, (_, i) => i * 5).map((d) => {
          const t = ((d - hd - 90) * Math.PI) / 180, l = d % 30 === 0 ? 14 : d % 10 === 0 ? 9 : 5;
          const ty = cy + (R - 34) * Math.sin(t);
          return (
            <g key={d}>
              <line x1={f1(cx + R * Math.cos(t))} y1={f1(cy + R * Math.sin(t))} x2={f1(cx + (R - l) * Math.cos(t))} y2={f1(cy + (R - l) * Math.sin(t))} stroke={P.sym} strokeWidth={d % 30 === 0 ? 2.5 : 1.5} />
              {d % 30 === 0 && ty < y + h - 14 && (
                <T x={cx + (R - 34) * Math.cos(t)} y={ty + 5} size={15} fill={P.symText} weight={700}>
                  {card(d)}
                </T>
              )}
            </g>
          );
        })}
        <path d={`M${f1(cx)} ${f1(cy - 22)} l-6 18 h12 z M${f1(cx - 14)} ${f1(cy - 6)} h28`} fill={P.ref} stroke={P.ref} strokeWidth="2" />
      </g>
      <path d={`M${f1(cx)} ${f1(y + 36)} l-8 -8 h16 z`} fill={P.ref} />
      <rect x={f1(cx - 40)} y={y - 2} width="80" height="30" fill={P.boxBg} stroke={P.sym} strokeWidth="1.5" />
      <T x={cx} y={y + 19} size={16} fill={P.symText} weight={700} ls={0.1}>{hdgText(heading)}</T>
    </g>
  );
}

// ------------------------------------------------------------------ heading tape
export function HeadingTape({ x, y, w, P, heading, span = 60 }: { x: number; y: number; w: number; P: CjPalette; heading?: number; span?: number }) {
  const id = useId().replace(/:/g, '');
  const hd = heading ?? 0;
  const cx = x + w / 2, ppd = w / span;
  const ticks: number[] = [];
  for (let d = Math.floor((hd - span) / 5) * 5; d <= hd + span; d += 5) ticks.push(d);
  return (
    <g>
      <defs>
        <clipPath id={`${id}c`}>
          <rect x={x} y={y} width={w} height="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <line x1={x} y1={y + 36} x2={x + w} y2={y + 36} stroke={P.sym} strokeWidth="1.5" />
        {ticks.map((d) => {
          const xx = cx + (d - hd) * ppd, dd = ((d % 360) + 360) % 360;
          return (
            <g key={d}>
              <line x1={f1(xx)} y1={y + 36} x2={f1(xx)} y2={y + (dd % 10 === 0 ? 24 : 30)} stroke={P.sym} strokeWidth="1.5" />
              {dd % 10 === 0 && Math.abs(d - hd) > 8 && xx > x + 18 && xx < x + w - 18 && (
                <T x={xx} y={y + 13} fill={P.symText}>{String(dd).padStart(3, '0')}</T>
              )}
            </g>
          );
        })}
      </g>
      <rect x={f1(cx - 36)} y={y - 6} width="72" height="30" fill={P.boxBg} stroke={P.sym} strokeWidth="1.5" />
      <T x={cx} y={y + 15} size={15} fill={P.symText} weight={700} ls={0.1}>{hdgText(heading)}</T>
      <path d={`M${f1(cx)} ${y + 38} l-6 9 h12 z`} fill={P.ref} />
    </g>
  );
}

// ------------------------------------------------------------------ AoA tape 0-30 (from load) + indexer
export function AoaTape({ x, y, h, P, aoa, active }: { x: number; y: number; h: number; P: CjPalette; aoa: number; active: boolean }) {
  const top = y + 26, bot = y + h - 8, Y = (v: number) => bot - (v / 30) * (bot - top);
  return (
    <g>
      <T x={x + 22} y={y + 13} fill={P.text} weight={700} ls={0.1}>AOA</T>
      <rect x={x + 14} y={f1(top)} width="14" height={f1(bot - top)} fill={P.tapeBg} stroke={P.edge} strokeWidth="1.5" />
      {active && <rect x={x + 17} y={f1(Y(aoa))} width="8" height={f1(bot - Y(aoa))} fill={P.fill} />}
      {[0, 5, 10, 15, 20, 25, 30].map((v) => (
        <g key={v}>
          <line x1={x + 28} y1={f1(Y(v))} x2={x + 36} y2={f1(Y(v))} stroke={P.tick} strokeWidth="1.5" />
          {v % 10 === 0 && <T x={x + 40} y={Y(v) + 5} fill={P.tapeText} anchor="start">{v}</T>}
        </g>
      ))}
      <rect x={x + 8} y={f1(Y(15) - 3)} width="34" height="6" fill={P.onSpeed} />
      <T x={x + 46} y={Y(15) + 5} fill={P.onSpeed} anchor="start" weight={800}>15</T>
      {active && <path d={`M${x + 2} ${f1(Y(aoa) - 7)} l10 7 l-10 7 z`} fill={P.pointer} />}
    </g>
  );
}

/** top chevron (high AoA) / donut (on speed) / bottom chevron (low): shape differs, not just colour. */
export function Indexer({ x, y, P, state, s = 1 }: { x: number; y: number; P: CjPalette; state: IndexerState; s?: number }) {
  const on = (k: IndexerState) => state === k;
  const c = (k: IndexerState, col: string) => (on(k) ? { fill: col, stroke: col } : { fill: 'none', stroke: P.idxOff });
  return (
    <g data-indexer={state}>
      <path d={`M${x} ${y} l${18 * s} ${14 * s} l${18 * s} ${-14 * s} l0 ${8 * s} l${-18 * s} ${14 * s} l${-18 * s} ${-14 * s} z`} {...c('high', P.idxHigh)} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x + 18 * s} cy={y + 42 * s} r={11 * s} fill="none" stroke={on('on') ? P.idxOn : P.idxOff} strokeWidth={on('on') ? 7 * s : 2} />
      <path d={`M${x} ${y + 84 * s} l${18 * s} ${-14 * s} l${18 * s} ${14 * s} l0 ${-8 * s} l${-18 * s} ${-14 * s} l${-18 * s} ${14 * s} z`} {...c('low', P.idxLow)} strokeWidth="2" strokeLinejoin="round" />
    </g>
  );
}

// ------------------------------------------------------------------ approach lights / accel ball (original lens + datum arms)
export function Approach({ x, y, w, h, P, cell, active, label }: { x: number; y: number; w: number; h: number; P: CjPalette; cell: number; active: boolean; label: string }) {
  const cx = x + w / 2, lensW = 30, cellH = (h - 40) / 5, ly = y + 4;
  const dy = ly + cellH * 2.5;
  return (
    <g>
      <rect x={f1(cx - lensW / 2)} y={f1(ly)} width={lensW} height={f1(cellH * 5)} fill={P.lensBg} stroke={P.edge} strokeWidth="1.5" />
      {[1, 2, 3, 4].map((i) => (
        <line key={i} x1={f1(cx - lensW / 2)} y1={f1(ly + i * cellH)} x2={f1(cx + lensW / 2)} y2={f1(ly + i * cellH)} stroke={P.edge} strokeWidth="1" />
      ))}
      {[0, 1, 2, 3].flatMap((i) =>
        ([-1, 1] as const).map((side) => {
          const dx = cx + side * (lensW / 2 + 14 + i * 16);
          return active ? <circle key={`${i}${side}`} cx={f1(dx)} cy={f1(dy)} r="5.5" fill={P.datum} /> : <circle key={`${i}${side}`} cx={f1(dx)} cy={f1(dy)} r="5.5" fill="none" stroke={P.idxOff} strokeWidth="1.5" />;
        }),
      )}
      {active && <circle cx={f1(cx)} cy={f1(ly + cellH * (cell + 0.5))} r={f1(Math.min(11, cellH * 0.42))} fill={P.ball} stroke={P.ballEdge} strokeWidth="2" />}
      <T x={cx} y={y + h - 8} fill={P.text} weight={700} ls={0.1}>{label}</T>
    </g>
  );
}

// ------------------------------------------------------------------ paired engine strips + AB zones 1-5 (lit in the same render as the abZone prop)
export function Engines({ x, y, w, h, P, rpmN, load, ab, rpm, horizontal = false }: { x: number; y: number; w: number; h: number; P: CjPalette; rpmN: number; load: number; ab: number; rpm: number; horizontal?: boolean }) {
  const abWord = ab ? `AB ${ab}` : 'AB OFF';
  if (!horizontal) {
    const barW = 26, top = y + 26, bot = y + h - 30, bh = bot - top;
    const cols = [
      { x: x + 8, v: rpmN, lab: 'L RPM', val: (rpm / 1000).toFixed(1) },
      { x: x + w - 8 - barW, v: load, lab: 'R LOAD', val: `${Math.round(load * 100)}%` },
    ];
    const lx = x + 8 + barW + 12, lw = w - 2 * (8 + barW + 12), zh = (bh - 4 * 5) / 5;
    return (
      <g data-ab={ab}>
        {cols.map((c) => (
          <g key={c.lab}>
            <T x={c.x + barW / 2} y={y + 13} size={12} fill={P.text} weight={700}>{c.lab}</T>
            <rect x={f1(c.x)} y={f1(top)} width={barW} height={f1(bh)} fill={P.tapeBg} stroke={P.edge} strokeWidth="1.5" />
            <rect x={f1(c.x + 4)} y={f1(bot - c.v * bh)} width={barW - 8} height={f1(c.v * bh)} fill={P.fill} />
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <line key={i} x1={f1(c.x)} y1={f1(bot - (i / 10) * bh)} x2={f1(c.x + (i % 5 ? 5 : 9))} y2={f1(bot - (i / 10) * bh)} stroke={P.tick} strokeWidth="1.2" />
            ))}
            <T x={c.x + barW / 2} y={y + h - 8} size={14} fill={P.text} weight={700}>{c.val}</T>
          </g>
        ))}
        <T x={lx + lw / 2} y={y + 13} size={12} fill={P.text} weight={700} ls={0.1}>AB</T>
        {[1, 2, 3, 4, 5].map((z) => {
          const zy = bot - z * zh - (z - 1) * 5, lit = z <= ab;
          return (
            <g key={z} className="cj-ab" data-lit={lit ? 'true' : 'false'}>
              <rect x={f1(lx)} y={f1(zy)} width={f1(lw)} height={f1(zh)} rx="2" fill={lit ? P.abFill : P.winBg} stroke={lit ? P.abFill : P.winEdge} strokeWidth="1.5" strokeDasharray={lit ? undefined : '3 3'} />
              <T x={lx + lw / 2} y={zy + zh / 2 + 5} fill={lit ? P.abText : P.winText} weight={800}>{z}</T>
            </g>
          );
        })}
        <T x={lx + lw / 2} y={y + h - 8} fill={ab ? P.abLabel : P.text} weight={800}>{abWord}</T>
      </g>
    );
  }
  const labW = 70, valW = 60, bw = w - labW - valW - 16;
  const rows = [
    { v: rpmN, lab: 'L RPM', val: `${(rpm / 1000).toFixed(1)}k` },
    { v: load, lab: 'R LOAD', val: `${Math.round(load * 100)}%` },
  ];
  const zy = y + 64, zw = (bw - 4 * 6) / 5;
  return (
    <g data-ab={ab}>
      {rows.map((r, i) => {
        const ry = y + i * 30;
        return (
          <g key={r.lab}>
            <T x={x} y={ry + 16} fill={P.text} weight={700} anchor="start">{r.lab}</T>
            <rect x={x + labW} y={ry + 2} width={f1(bw)} height="18" fill={P.tapeBg} stroke={P.edge} strokeWidth="1.5" />
            <rect x={x + labW + 3} y={ry + 5} width={f1((bw - 6) * r.v)} height="12" fill={P.fill} />
            <T x={x + w} y={ry + 16} size={14} fill={P.text} weight={700} anchor="end">{r.val}</T>
          </g>
        );
      })}
      <T x={x} y={zy + 18} fill={ab ? P.abLabel : P.text} weight={800} anchor="start">{abWord}</T>
      {[1, 2, 3, 4, 5].map((z) => {
        const zx = x + labW + (z - 1) * (zw + 6), lit = z <= ab;
        return (
          <g key={z} className="cj-ab" data-lit={lit ? 'true' : 'false'}>
            <rect x={f1(zx)} y={zy} width={f1(zw)} height="26" rx="2" fill={lit ? P.abFill : P.winBg} stroke={lit ? P.abFill : P.winEdge} strokeWidth="1.5" strokeDasharray={lit ? undefined : '3 3'} />
            <T x={zx + zw / 2} y={zy + 18} fill={lit ? P.abText : P.winText} weight={800}>{z}</T>
          </g>
        );
      })}
    </g>
  );
}

/** Night deck markings (decorative, solid colours: no opacity so Reduce Transparency needs no swap). */
export function DeckMarks({ w, h, cx }: { w: number; h: number; cx: number }) {
  const rows = Math.floor(h / 38);
  return (
    <g className="cj-deckmarks">
      <line x1={cx} y1={0} x2={cx} y2={h} stroke="#4c5561" strokeWidth="3" strokeDasharray="26 18" />
      <line x1={0} y1={h * 0.86} x2={w} y2={h * 0.62} stroke="#8a7425" strokeWidth="3" strokeDasharray="14 8" />
      {Array.from({ length: rows }, (_, i) => [12, w - 12].map((ex) => <circle key={`${i}${ex}`} cx={ex} cy={20 + i * 38} r="3.5" fill="#4592e0" />))}
    </g>
  );
}
