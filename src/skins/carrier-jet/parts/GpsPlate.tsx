import type { CSSProperties } from 'react';
import { Defs, Eng, Lens, useSvgPrefix } from './art';
import { ACQ_EDGE, ACQ_UNLIT_FILL, gpsView, PLATE_MIN, PLATE_MIN_NARROW } from './tokens';
import type { CjGpsPlateProps } from '../types';
import './parts.css';

const ACQ_Y = 108;

/** ACQ legend: unlit recessed engraving (static filter), or lit green that follows the bulb pulse (CSS only). */
function Acq({ p, cx, lit }: { p: string; cx: number; lit: boolean }) {
  const common = { x: cx, y: ACQ_Y, textAnchor: 'middle', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', fontFamily: "'B612', system-ui, sans-serif" } as const;
  if (!lit) {
    return (
      <g data-acq="unlit">
        <filter id={`${p}eng`} x="-20%" y="-40%" width="140%" height="180%">
          {/* 1px light catch on the lower-right edge (key light top-left) */}
          <feOffset in="SourceAlpha" dx="1" dy="1" result="o" />
          <feComposite in="o" in2="SourceAlpha" operator="out" result="edge" />
          <feFlood floodColor={ACQ_EDGE} />
          <feComposite in2="edge" operator="in" result="catch" />
          {/* dark inner shadow on the top-left inside wall */}
          <feComponentTransfer in="SourceAlpha" result="inv"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
          <feOffset in="inv" dx="1" dy="1" result="invo" />
          <feGaussianBlur in="invo" stdDeviation=".45" result="invb" />
          <feFlood floodColor="#000" floodOpacity=".9" />
          <feComposite in2="invb" operator="in" />
          <feComposite in2="SourceAlpha" operator="in" result="inner" />
          <feMerge><feMergeNode in="catch" /><feMergeNode in="SourceGraphic" /><feMergeNode in="inner" /></feMerge>
        </filter>
        <text {...common} fill={ACQ_UNLIT_FILL} filter={`url(#${p}eng)`} data-text-floor={11} data-acq-edge={ACQ_EDGE}>ACQ</text>
      </g>
    );
  }
  return (
    <g data-acq="lit" className="cjp-acq-lit">
      <text {...common} fill="none" stroke="rgba(126,247,161,.35)" strokeWidth={2.6} strokeLinejoin="round" className="cjp-acq-halo">ACQ</text>
      <text {...common} x={cx - 0.5} y={ACQ_Y - 0.5} fill="rgba(0,0,0,.7)">ACQ</text>
      <text {...common} className="cjp-acq-fill" data-text-floor={11}>ACQ</text>
    </g>
  );
}

/**
 * GPS plate: engraved GPS, two stacked bulbs (red top, green bottom) in a recessed well, permanent ACQ legend.
 * none: both dark · fail: red lit · acq: green ~1 Hz soft cosine pulse 35→100%, ACQ lit 50→100% in step
 * (Reduce Motion: green steady 50%, ACQ steady lit) · live: green steady. Status only (role="img").
 */
export function GpsPlate({ gps, size = 'wide', bare }: CjGpsPlateProps) {
  const p = useSvgPrefix('s');
  const M = size === 'narrow' ? PLATE_MIN_NARROW : PLATE_MIN;
  const W = M.w, H = M.h, cx = W / 2;
  const v = gpsView(gps);
  return (
    <div
      className={`cjp cjp-gps${bare ? '' : ' cjp-metal'}`}
      role="img"
      aria-label={v.label}
      data-gps={gps}
      data-red={v.red}
      data-green={v.green}
      data-acq={v.acq}
      style={{ aspectRatio: `${W} / ${H}`, minWidth: W } as CSSProperties}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
        <Defs p={p} />
        <Eng x={cx} y={20} size={12} tone="white" ls={0.12}>GPS</Eng>
        <rect x={cx - 14} y={28} width={28} height={62} rx={14} fill="#1a1d1f" />
        <path d={`M${cx - 12.5} ${76} V${42} A12.5 12.5 0 0 1 ${cx + 5} ${30.6}`} fill="none" stroke="rgba(0,0,0,.75)" strokeWidth={2.5} />
        <path d={`M${cx + 13.5} ${44} V${76} A13.5 13.5 0 0 1 ${cx} ${89.5}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={1} />
        <g className="cjp-bulb cjp-bulb--red" data-bulb="red" data-lit={v.red}>
          <Lens p={p} cx={cx} cy={44} r={9.4} tone={v.red === 'lit' ? 'red' : 'off'} />
        </g>
        <g className="cjp-bulb cjp-bulb--green" data-bulb="green" data-lit={v.green}>
          <Lens p={p} cx={cx} cy={74} r={9.4} tone={v.green === 'off' ? 'off' : 'green'} litClass={v.green === 'pulse' ? 'cjp-gps-pulse' : undefined} />
        </g>
        <Acq p={p} cx={cx} lit={v.acq === 'lit'} />
      </svg>
    </div>
  );
}
