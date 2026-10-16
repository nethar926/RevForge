/*
 * Shared SVG art for the cold-start parts (original art, after the v2 concept sheet's parts.js).
 * One key light, top-left: highlights on top-left edges, shade bottom-right, short cast shadows down-right.
 * No per-frame filters: the only filters are the static lever blur and the static ACQ engraving.
 */
import { useId, type ReactNode } from 'react';

/** SVG-safe unique id prefix. */
export function useSvgPrefix(tag: string): string {
  return `cjp${tag}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Class on a legend drawn with its backlight off because the control is disabled (tests hook on it). */
export const UNLIT_CLASS = 'cjp-unlit';

/** Engraved legend tones (fill colours; checked >= 4.5:1 on the panel in measure.json). */
export const ENG = {
  /** backlit off-white */
  white: '#f3f1e8',
  /**
   * unlit grey engraving (backlight off). Also the disabled / locked legend: the normal text, no glow.
   * 4.74:1 on the lightest gunmetal stop #51585d, 5.19:1 on the plate base #4a5055, 11.2:1 on the guard tab #17191a.
   */
  grey: '#ccd2d6',
  /** lit green */
  green: '#8dffad',
  /** lit amber */
  amber: '#ffc46a',
} as const;
export type EngTone = keyof typeof ENG;

/**
 * Engraved text: a -0.5 recess shadow under the fill, plus a soft backlight halo (a wide translucent stroke,
 * no filter) when lit.
 */
export function Eng({ x, y, size = 11, tone = 'white', anchor = 'middle', ls = 0.06, glow, fit, children, className }: {
  x: number; y: number; size?: number; tone?: EngTone; anchor?: 'start' | 'middle' | 'end'; ls?: number; glow?: boolean;
  /** max width in units: condenses spacing+glyphs only if the line would overflow */
  fit?: number; children: ReactNode; className?: string;
}) {
  const fill = ENG[tone];
  const common = {
    x, y, textAnchor: anchor, fontSize: size, letterSpacing: `${ls}em`,
    fontFamily: "'B612', 'Barlow Semi Condensed', system-ui, sans-serif", fontWeight: 700,
  } as const;
  const halo = glow ? (tone === 'green' ? 'rgba(126,247,161,.24)' : tone === 'amber' ? 'rgba(255,181,74,.22)' : 'rgba(255,246,220,.14)') : undefined;
  const fitProps = fit ? fitText(String(children), size, ls, fit) : {};
  return (
    <g className={className} data-eng={tone}>
      {halo ? <text {...common} {...fitProps} fill="none" stroke={halo} strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">{children}</text> : null}
      <text {...common} {...fitProps} x={x - 0.5} y={y - 0.5} fill="rgba(0,0,0,.7)" aria-hidden="true">{children}</text>
      <text {...common} {...fitProps} fill={fill} data-text-floor={size}>{children}</text>
    </g>
  );
}

/** B612 Bold advance ≈ 0.64em; condense with textLength only when the estimate overflows `max`. */
function fitText(s: string, size: number, ls: number, max: number): { textLength?: number; lengthAdjust?: 'spacingAndGlyphs' } {
  const est = s.length * size * (0.64 + ls);
  return est > max ? { textLength: max, lengthAdjust: 'spacingAndGlyphs' } : {};
}

/** Gradient + filter defs shared by one SVG (prefix p). */
export function Defs({ p }: { p: string }) {
  return (
    <defs>
      {/* lever: bright and dim (locked) */}
      <linearGradient id={`${p}l`} x1="0" x2="1"><stop offset="0" stopColor="#a6adb1" /><stop offset=".3" stopColor="#f4f6f7" /><stop offset=".65" stopColor="#a6adb1" /><stop offset="1" stopColor="#545b60" /></linearGradient>
      <linearGradient id={`${p}ld`} x1="0" x2="1"><stop offset="0" stopColor="#5c6266" /><stop offset=".3" stopColor="#9aa0a4" /><stop offset=".65" stopColor="#5c6266" /><stop offset="1" stopColor="#3a3f42" /></linearGradient>
      <radialGradient id={`${p}r`} cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#f4f6f7" /><stop offset=".5" stopColor="#a6adb1" /><stop offset="1" stopColor="#545b60" /></radialGradient>
      <radialGradient id={`${p}rd`} cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#9aa0a4" /><stop offset=".5" stopColor="#5c6266" /><stop offset="1" stopColor="#3a3f42" /></radialGradient>
      <radialGradient id={`${p}k`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#c9ced1" /><stop offset="1" stopColor="#40464a" /></radialGradient>
      <radialGradient id={`${p}kd`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#6e7478" /><stop offset="1" stopColor="#2c3033" /></radialGradient>
      {/* lens: smoked, green, green-half, amber, red */}
      <radialGradient id={`${p}lo`} cx="36%" cy="32%" r="70%"><stop offset="0" stopColor="#5a625c" /><stop offset=".11" stopColor="#5a625c" /><stop offset=".4" stopColor="#2a312c" /><stop offset="1" stopColor="#111513" /></radialGradient>
      <radialGradient id={`${p}lg`} cx="40%" cy="36%" r="70%"><stop offset="0" stopColor="#f2fff4" /><stop offset=".14" stopColor="#f2fff4" /><stop offset=".4" stopColor="#8dffad" /><stop offset=".85" stopColor="#3dbe66" /><stop offset="1" stopColor="#217a3f" /></radialGradient>
      <radialGradient id={`${p}la`} cx="40%" cy="36%" r="70%"><stop offset="0" stopColor="#fff6e2" /><stop offset=".14" stopColor="#fff6e2" /><stop offset=".4" stopColor="#ffc46a" /><stop offset=".85" stopColor="#e38f1c" /><stop offset="1" stopColor="#9a5a08" /></radialGradient>
      <radialGradient id={`${p}lr`} cx="40%" cy="36%" r="70%"><stop offset="0" stopColor="#ffe3df" /><stop offset=".14" stopColor="#ffe3df" /><stop offset=".4" stopColor="#ff6a5a" /><stop offset=".85" stopColor="#c8261b" /><stop offset="1" stopColor="#7a120c" /></radialGradient>
      <radialGradient id={`${p}hg`}><stop offset=".45" stopColor="rgba(126,247,161,.55)" /><stop offset="1" stopColor="rgba(126,247,161,0)" /></radialGradient>
      <radialGradient id={`${p}ha`}><stop offset=".45" stopColor="rgba(255,181,74,.5)" /><stop offset="1" stopColor="rgba(255,181,74,0)" /></radialGradient>
      <radialGradient id={`${p}hr`}><stop offset=".45" stopColor="rgba(255,90,70,.5)" /><stop offset="1" stopColor="rgba(255,90,70,0)" /></radialGradient>
      {/* Dzus stud head (matte dome) */}
      <radialGradient id={`${p}s`} cx="36%" cy="32%" r="72%"><stop offset="0" stopColor="#bcc2c5" /><stop offset=".5" stopColor="#8f969a" /><stop offset="1" stopColor="#5b6165" /></radialGradient>
      {/* soft cast shadow (static) */}
      <filter id={`${p}b`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" /></filter>
    </defs>
  );
}

/** Bat-handle toggle, front view, in a 32×42 box at (x, y). pos up | down | mid. ~25° throw, ball toward the eye. */
export function Bat({ p, x, y, pos, dim }: { p: string; x: number; y: number; pos: 'up' | 'down' | 'mid'; dim?: boolean }) {
  const cx = 16, cy = 21, L = pos === 'mid' ? 0 : 15, dir = pos === 'up' ? -1 : 1;
  const tipY = cy + dir * L, ballR = pos === 'mid' ? 4.2 : 4.6;
  const d = dim ? 'd' : '';
  const hex = [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return `${(cx + 5.6 * Math.cos(a)).toFixed(2)},${(cy + 5.6 * Math.sin(a)).toFixed(2)}`; }).join(' ');
  return (
    <g transform={`translate(${x} ${y})`} data-lever={pos}>
      <circle cx={cx + 1} cy={cy + 1.5} r={9.5} fill="rgba(0,0,0,.4)" filter={`url(#${p}b)`} />
      <circle cx={cx} cy={cy} r={9} fill={`url(#${p}k${d})`} stroke="#1d2022" strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={9} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={1.6} strokeDasharray="1 1.3" />
      <polygon points={hex} fill={`url(#${p}r${d})`} stroke="#2a2e31" strokeWidth={0.6} />
      {pos === 'mid' ? (
        <ellipse cx={cx + 2.5} cy={cy + 3} rx={5} ry={4} fill="rgba(0,0,0,.45)" filter={`url(#${p}b)`} />
      ) : (
        <>
          <path d={`M${cx + 1} ${cy + 2} L${cx + 4 + (pos === 'up' ? 6 : 3)} ${tipY + (pos === 'up' ? 9 : 6)}`} stroke="rgba(0,0,0,.5)" strokeWidth={5} strokeLinecap="round" filter={`url(#${p}b)`} />
          <path d={`M${cx - 3.1} ${cy} L${cx - 2} ${tipY} L${cx + 2} ${tipY} L${cx + 3.1} ${cy} Z`} fill={`url(#${p}l${d})`} stroke="#2a2e31" strokeWidth={0.6} />
        </>
      )}
      <circle cx={cx} cy={tipY} r={ballR} fill={`url(#${p}r${d})`} stroke="#2a2e31" strokeWidth={0.6} />
      <circle cx={cx - 1.3} cy={tipY - 1.4} r={1.1} fill={`rgba(255,255,255,${dim ? 0.25 : 0.6})`} />
    </g>
  );
}

export type LensTone = 'off' | 'green' | 'amber' | 'red';
const LENS_FILL: Record<LensTone, string> = { off: 'lo', green: 'lg', amber: 'la', red: 'lr' };
const LENS_HALO: Partial<Record<LensTone, string>> = { green: 'hg', amber: 'ha', red: 'hr' };

/**
 * Round lamp lens in a metal bezel (r = glass radius; the sheet's 13px lamp is r 6.5).
 * `litClass` wraps the lit glass + halo in its own group so CSS can animate its opacity (GPS pulse).
 */
export function Lens({ p, cx, cy, r = 6.5, tone, litClass }: { p: string; cx: number; cy: number; r?: number; tone: LensTone; litClass?: string }) {
  const k = r / 6.5;
  const halo = LENS_HALO[tone];
  return (
    <g data-lens={tone}>
      <circle cx={cx + 1 * k} cy={cy + 2 * k} r={r + 3.5 * k} fill="rgba(0,0,0,.35)" filter={`url(#${p}b)`} />
      <circle cx={cx} cy={cy} r={r + 3.25 * k} fill="#2a2e31" />
      <circle cx={cx} cy={cy} r={r + 2.75 * k} fill="#7d8489" />
      <path d={`M${cx - (r + 2.75 * k)} ${cy} A${r + 2.75 * k} ${r + 2.75 * k} 0 0 1 ${cx + (r + 2.75 * k)} ${cy}`} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={0.8 * k} transform={`rotate(-45 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r + 1.5 * k} fill="#1b1e20" />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${p}lo)`} />
      {tone !== 'off' ? (
        <g className={litClass}>
          {halo ? <circle cx={cx} cy={cy} r={r * 2.3} fill={`url(#${p}${halo})`} /> : null}
          <circle cx={cx} cy={cy} r={r} fill={`url(#${p}${LENS_FILL[tone]})`} />
        </g>
      ) : null}
    </g>
  );
}

/**
 * Dzus quarter-turn fastener, 11 units at (x, y): thin recessed well, flush matte dome, one straight slot with a
 * raised wing tab at each end. One top-left key light, no gloss. `rot` is the slot angle; locked Dzus sit near level,
 * so keep it within about ±15°. Decorative: aria-hidden.
 */
export function Dzus({ p, x, y, rot = 0 }: { p: string; x: number; y: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true" data-fastener="dzus">
      {/* well: dark floor, shadowed top-left wall, lit bottom-right lip */}
      <circle cx={5.5} cy={5.5} r={5.5} fill="#2c3134" />
      <path d="M1.6 7.4 A4.6 4.6 0 0 1 7.4 1.6" fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={0.9} />
      <path d="M9.4 3.6 A4.6 4.6 0 0 1 3.6 9.4" fill="none" stroke="rgba(243,246,247,.16)" strokeWidth={0.6} />
      {/* head + tiny cast shadow down-right */}
      <circle cx={5.8} cy={6} r={4.2} fill="rgba(0,0,0,.45)" />
      <circle cx={5.5} cy={5.5} r={4.2} fill={`url(#${p}s)`} />
      <g transform={`rotate(${rot} 5.5 5.5)`}>
        <rect x={1.5} y={4.45} width={8} height={2.1} rx={1} fill="#9ba2a6" stroke="rgba(0,0,0,.5)" strokeWidth={0.35} />
        <rect x={1.9} y={4.6} width={7.2} height={0.6} rx={0.3} fill="rgba(214,220,223,.55)" />
        <rect x={3.3} y={4.9} width={4.4} height={1.2} fill="#1d2124" />
        <rect x={3.3} y={4.9} width={4.4} height={0.48} fill="rgba(0,0,0,.6)" />
        <rect x={3.3} y={5.76} width={4.4} height={0.34} fill="rgba(243,246,247,.18)" />
      </g>
    </g>
  );
}
/** Alias kept for existing imports: the panel fastener is now a Dzus stud (same 11-unit box). */
export const Screw = Dzus;

/** Padlock glyph, 10×12 at (x, y). */
export function Lock({ x, y, color = '#ccd2d6' }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke={color} strokeWidth={1.6} />
      <rect x={1} y={5} width={8} height={6.5} rx={1} fill={color} />
    </g>
  );
}

/** Recessed well (panel cut-out): dark fill, inner shadow top-left, faint catch bottom-right. */
export function Well({ x, y, w, h, r = 4 }: { x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill="#1a1d1f" />
      <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={r} fill="none" stroke="rgba(255,255,255,.08)" />
      <path d={`M${x + 1.5} ${y + h - r} V${y + r} Q${x + 1.5} ${y + 1.5} ${x + r} ${y + 1.5} H${x + w - r}`} fill="none" stroke="rgba(0,0,0,.75)" strokeWidth={2.5} />
    </g>
  );
}

/** Visually hidden text for descriptions. */
export function Sr({ id, children }: { id?: string; children: ReactNode }) {
  return <span id={id} className="cjp-sr">{children}</span>;
}
