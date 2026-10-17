import type { CSSProperties } from 'react';
import { UNLIT_CLASS, useSvgPrefix } from './art';
import { BEZEL_KEY_MIN } from './tokens';
import type { CjBezelKeyProps } from '../types';
import './parts.css';

const SLOT_H = 18;
const KEY = 44;

/**
 * MFD edge key frame: the legend is printed on the CRT edge slot above a blank machined key (MFD style).
 * With a legend: live `<button>` (whole frame is the target, key 44×44); `active` boxes the legend.
 * No legend: inert: darker cap, `disabled`, `aria-hidden`, no handler. `unlit` (a toggle that is off): grey legend.
 */
export function BezelKey({ legend, active, onPress, ariaLabel, unlit }: CjBezelKeyProps) {
  const p = useSvgPrefix('k');
  const W = BEZEL_KEY_MIN.w, H = BEZEL_KEY_MIN.h, kx = (W - KEY) / 2, ky = H - KEY;
  const inert = !legend;
  const art = (
    <svg viewBox={`0 0 ${W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${p}c`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={inert ? '#565a5e' : '#8b9297'} /><stop offset=".55" stopColor={inert ? '#2e3235' : '#4a5055'} /><stop offset="1" stopColor={inert ? '#1d2022' : '#2f3437'} /></linearGradient>
        <radialGradient id={`${p}d`} cx="60%" cy="65%" r="70%"><stop offset="0" stopColor={inert ? '#363a3d' : '#565d62'} /><stop offset=".7" stopColor={inert ? '#1b1e20' : '#2c3134'} /></radialGradient>
      </defs>
      {/* CRT edge slot */}
      <rect x={0} y={0} width={W} height={SLOT_H} rx={2} fill="#041009" />
      <rect x={0.5} y={0.5} width={W - 1} height={SLOT_H - 1} rx={2} fill="none" stroke="#000" />
      {legend ? (
        <>
          {active ? <rect x={3} y={2.5} width={W - 6} height={SLOT_H - 5} fill="none" stroke="#7ef7a1" strokeWidth={1.5} /> : null}
          <text x={W / 2} y={13} textAnchor="middle" fontSize={11} fontWeight={700} letterSpacing=".02em" fontFamily="'B612', system-ui, sans-serif" fill={unlit ? '#ccd2d6' : '#8dffad'} className={unlit ? UNLIT_CLASS : undefined} data-text-floor={11} {...(legend.length * 7.4 > W - 8 ? { textLength: W - 8, lengthAdjust: 'spacingAndGlyphs' as const } : {})}>{legend}</text>
        </>
      ) : null}
      {/* blank machined cap: bevel TL highlight, BR shade, small down-right cast shadow, concave centre */}
      <rect x={kx + 1} y={ky + 2} width={KEY} height={KEY - 2} rx={4} fill="rgba(0,0,0,.55)" />
      <rect x={kx} y={ky} width={KEY} height={KEY - 2} rx={4} fill={`url(#${p}c)`} stroke="#15181a" strokeWidth={1} />
      <path d={`M${kx + 1.5} ${ky + KEY - 6} V${ky + 4} Q${kx + 1.5} ${ky + 1.5} ${kx + 4} ${ky + 1.5} H${kx + KEY - 4}`} fill="none" stroke={`rgba(255,255,255,${inert ? 0.15 : 0.35})`} strokeWidth={1} />
      <circle cx={kx + KEY / 2} cy={ky + KEY / 2 - 1} r={15} fill={`url(#${p}d)`} />
      <path d={`M${kx + KEY / 2 - 10.6} ${ky + KEY / 2 + 9.6} A15 15 0 0 0 ${kx + KEY / 2 + 10.6} ${ky + KEY / 2 - 11.6}`} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth={1} />
      <path d={`M${kx + KEY / 2 - 10.6} ${ky + KEY / 2 + 9.6} A15 15 0 0 1 ${kx + KEY / 2 + 10.6} ${ky + KEY / 2 - 11.6}`} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={1.5} />
    </svg>
  );
  const style = { aspectRatio: `${W} / ${H}`, minWidth: W } as CSSProperties;
  if (inert) {
    return (
      <button type="button" className="cjp cjp-bezel" data-inert="true" disabled aria-hidden="true" tabIndex={-1} style={style}>{art}</button>
    );
  }
  return (
    <button type="button" className="cjp cjp-bezel" data-active={active} data-unlit={unlit || undefined} aria-label={ariaLabel ?? legend} aria-pressed={active} style={style} onClick={onPress}>{art}</button>
  );
}
