import { forwardRef, type CSSProperties } from 'react';
import { Defs, Eng, useSvgPrefix } from './art';
import { PULL_GRIP, PULL_MIN, PULL_MIN_NARROW, PULL_TRAVEL, pullView } from './tokens';
import type { CjPullHandleProps } from '../types';
import './parts.css';

const SLOT_TOP = 20;
const SLOT_H = 64;
/** Grip (hit box) top at rest, units: the handle bar is centred in it. */
const GRIP_TOP = SLOT_TOP - 5;

/** Red T-handle art centred in the 64×44 grip box. */
function THandle({ p }: { p: string }) {
  return (
    <svg viewBox={`0 0 ${PULL_GRIP.w} ${PULL_GRIP.h}`} className="cjp-svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${p}th`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9463b" /><stop offset=".5" stopColor="#b52a21" /><stop offset="1" stopColor="#7a160f" /></linearGradient>
      </defs>
      <rect x={10} y={7} width={44} height={14} rx={6} fill="rgba(0,0,0,.45)" transform="translate(1.5 2)" />
      <rect x={10} y={6} width={44} height={14} rx={6} fill={`url(#${p}th)`} stroke="#3d0906" strokeWidth={1} />
      <path d="M14 7.5 H50" stroke="rgba(255,255,255,.35)" strokeWidth={1} strokeLinecap="round" />
      {[20, 25, 30, 35, 40, 45].map((x) => <line key={x} x1={x} y1={9} x2={x} y2={17} stroke="#7d1711" strokeWidth={1.1} />)}
    </svg>
  );
}

/**
 * EMER STOP pull handle on a red wrinkle plate with a yellow/black striped surround. Purely visual: the ref
 * goes to the grip `<button>` (64×44, moves with the handle); the host adds the ~40 px downward pull gesture
 * and the VoiceOver "Emergency stop" action. No onClick. Threshold line at 40 units, detent tick at 20.
 */
export const PullHandle = forwardRef<HTMLButtonElement, CjPullHandleProps>(function PullHandle({ phase, progress, size = 'wide', ariaLabel = 'Emergency stop', ariaDescription = 'Pull the handle down to stop the engines', gripProps }, ref) {
  const p = useSvgPrefix('p');
  const M = size === 'narrow' ? PULL_MIN_NARROW : PULL_MIN;
  const W = M.w, H = M.h, cx = W / 2;
  const v = pullView(phase, progress);
  const style = { aspectRatio: `${W} / ${H}`, minWidth: W, '--vbw': W, '--vbh': H, '--travel': v.travel, '--fill': Math.min(v.travel, PULL_TRAVEL) / PULL_TRAVEL, '--slot-top': SLOT_TOP } as CSSProperties;
  const descId = `${p}d`;
  return (
    <div className="cjp cjp-pull cjp-metal cjp-metal--red" data-phase={phase} style={style}>
      <svg viewBox={`0 0 ${W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
        <Defs p={p} />
        <pattern id={`${p}yb`} width={16} height={16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={16} fill="#e8b917" /><rect x={8} width={8} height={16} fill="#17191a" />
        </pattern>
        <Eng x={cx} y={14} tone="white" ls={0.04}>{size === 'narrow' ? 'EMER' : 'EMER STOP'}</Eng>
        {/* striped surround with a metal rim, one key light */}
        <rect x={6} y={SLOT_TOP} width={W - 12} height={SLOT_H} rx={4} fill="#2a2e31" />
        <rect x={7} y={SLOT_TOP + 1} width={W - 14} height={SLOT_H - 2} rx={3.5} fill={`url(#${p}yb)`} />
        <rect x={7} y={SLOT_TOP + 1} width={W - 14} height={SLOT_H - 2} rx={3.5} fill="none" stroke="#8e959a" strokeWidth={2} />
        <path d={`M8 ${SLOT_TOP + SLOT_H - 3} V${SLOT_TOP + 4} Q8 ${SLOT_TOP + 2} 10 ${SLOT_TOP + 2} H${W - 10}`} fill="none" stroke="#d4d9dc" strokeWidth={1} />
        <path d={`M${W - 8} ${SLOT_TOP + 3} V${SLOT_TOP + SLOT_H - 4} Q${W - 8} ${SLOT_TOP + SLOT_H - 2} ${W - 10} ${SLOT_TOP + SLOT_H - 2} H10`} fill="none" stroke="#3d4246" strokeWidth={1} />
        {/* the slot the stem runs in */}
        <rect x={cx - 6} y={SLOT_TOP + 4} width={12} height={SLOT_H - 8} rx={6} fill="#1a1d1f" />
        <path d={`M${cx - 4.5} ${SLOT_TOP + SLOT_H - 8} V${SLOT_TOP + 9}`} stroke="rgba(0,0,0,.8)" strokeWidth={2} strokeLinecap="round" />
        {/* detent tick (20) and fire line (40), measured from the handle's rest position */}
        <rect x={W - 16} y={SLOT_TOP + 8 + PULL_TRAVEL / 2} width={6} height={1.5} fill="#ccd2d6" />
        <rect x={W - 16} y={SLOT_TOP + 8 + PULL_TRAVEL} width={10} height={2} fill="#ffb54a" />
        <Eng x={cx} y={H - 6} tone={v.tone === 'amber' ? 'amber' : 'white'} glow={v.tone === 'amber'} ls={0.04}>{v.legend}</Eng>
      </svg>
      <span className="cjp-pull-fill" aria-hidden="true" />
      <button
        {...gripProps}
        ref={ref}
        type="button"
        className="cjp-pull-grip"
        aria-label={ariaLabel}
        aria-describedby={descId}
        data-phase={phase}
        style={{ left: `${((W - PULL_GRIP.w) / 2 / W) * 100}%`, width: `${(PULL_GRIP.w / W) * 100}%`, top: `${(GRIP_TOP / H) * 100}%`, height: `${(PULL_GRIP.h / H) * 100}%` }}
      >
        <THandle p={p} />
      </button>
      <span id={descId} className="cjp-sr">{ariaDescription}</span>
    </div>
  );
});
