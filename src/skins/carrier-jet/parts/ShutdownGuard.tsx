import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Bat, Defs, Dzus, Eng, Sr, UNLIT_CLASS, Well, useSvgPrefix } from './art';
import { SHUTDOWN_GUARD_MIN, SHUTDOWN_GUARD_STRIP_W, shutdownGuardView } from './tokens';
import type { CjShutdownGuardProps } from '../types';
import './parts.css';
import './shutdown-guard.css';

/* Geometry in CSS px (1 SVG unit = 1px). Legend row on top, then the guard row: Dzus leaf · hinge · lid. */
const W = SHUTDOWN_GUARD_MIN.w;
const H = SHUTDOWN_GUARD_MIN.h;
const ROW_Y = 15;
const ROW_H = 31;
const HINGE_X = 12;
const LID_X = 17;
const LID_W = 89;
/** Window cut in the lid (lid coords), over the switch bay. */
const WIN = { x: 31, y: 3, w: 55, h: 25 };
/** Tab on the solid part of the lid (lid coords). */
const TAB = { x: 3, y: 3, w: 25, h: 25 };
/** Folded underside strip (plate coords): from the hinge to the strip column's edge. */
const UNDER_W = SHUTDOWN_GUARD_STRIP_W - LID_X;

const STRIPES = {
  'red-yellow': ['#c8261b', '#f2c21b'],
  'yellow-black': ['#f2c21b', '#17191a'],
  dull: ['#6a3a35', '#6e6233'],
} as const;

/** Rounded-rect path (for the even-odd window cut). */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

/**
 * Guarded SHUTDOWN toggle for the bottom row, in the AB guard's paint: a flip-up striped lid on a hinge pin,
 * held to the panel by a Dzus leaf, with a window cut over the bat-handle toggle so the lever shows while the
 * lid is down. Closed (default): the whole part is the cover button "Shutdown, guarded"; the switch is
 * aria-disabled with a reason and its RUN / OFF legends are unlit. Open: the lid swings up on the hinge and
 * folds to the strip column (46×48, the close target), the switch (62.67×48) is live. 108.67×48 CSS px =
 * the current Shutdown plate. Lift = transform + opacity, 160ms; Reduce Motion = static swap. Stores nothing.
 */
export function ShutdownGuard({ guardOpen = false, onGuardToggle, on, onToggle, disabled, disabledReason, reduceMotion, stripe = 'red-yellow' }: CjShutdownGuardProps) {
  const p = useSvgPrefix('sd');
  const v = shutdownGuardView(on, guardOpen, disabled, disabledReason);
  const swId = `${p}sw`;
  const reasonId = `${p}why`;
  const coverRef = useRef<HTMLButtonElement>(null);
  const swRef = useRef<HTMLButtonElement>(null);
  const prevOpen = useRef(guardOpen);
  const escClose = useRef(false);

  // Focus follows the lift when it came from our own controls: open → switch, close → cover (as the AB guard).
  useEffect(() => {
    if (prevOpen.current === guardOpen) return;
    prevOpen.current = guardOpen;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (guardOpen && active === coverRef.current) swRef.current?.focus();
    else if (!guardOpen && (escClose.current || active === swRef.current)) coverRef.current?.focus();
    escClose.current = false;
  }, [guardOpen]);

  const onSwKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape' && guardOpen && !disabled) {
      e.preventDefault();
      escClose.current = true;
      onGuardToggle();
    }
  };

  const [c1, c2] = STRIPES[disabled ? 'dull' : stripe];
  const unlit = v.unlit ? UNLIT_CLASS : undefined;
  const runTone = v.unlit ? 'grey' : on ? 'white' : 'grey';
  const offTone = v.unlit ? 'grey' : on ? 'grey' : 'white';
  const style = { width: W, height: H, minWidth: W } as CSSProperties;

  return (
    <div
      className="cjp cjp-metal cjp-sdg"
      data-open={guardOpen}
      data-on={on}
      data-disabled={disabled || undefined}
      data-stripe={stripe}
      data-rf-reduce-motion={reduceMotion || undefined}
      style={style}
    >
      {/* panel: engraved name, Dzus leaf, hinge pin, switch well with the lever and its RUN / OFF throw legends */}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="cjp-svg cjp-sdg-base" aria-hidden="true" focusable="false">
        <Defs p={p} />
        <Eng x={W / 2} y={11.5} tone={disabled ? 'grey' : 'white'} glow={!disabled} ls={0} className={disabled ? UNLIT_CLASS : undefined}>SHUTDOWN</Eng>
        <rect x={2} y={ROW_Y} width={HINGE_X - 1} height={ROW_H} rx={2} fill="#3f4549" stroke="#23272a" strokeWidth={0.8} />
        <path d={`M2.6 ${ROW_Y + ROW_H - 1} V${ROW_Y + 1.5} H${HINGE_X}`} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={0.8} />
        <g transform={`translate(2.9 ${ROW_Y + 2.4}) scale(.74)`}><Dzus p={p} x={0} y={0} rot={-8} /></g>
        <g transform={`translate(2.9 ${ROW_Y + ROW_H - 10.6}) scale(.74)`}><Dzus p={p} x={0} y={0} rot={6} /></g>
        <Well x={LID_X + 30} y={ROW_Y + 1} w={58} h={ROW_H - 2} r={3} />
        <g transform={`translate(50.4 ${ROW_Y + 1.6}) scale(.66)`}><Bat p={p} x={0} y={0} pos={v.lever} dim={disabled} /></g>
        <path d="M71 21.5h3M71 38.5h3" stroke={v.unlit ? '#7d8489' : '#b9bfc3'} strokeWidth={1} />
        <Eng x={86.5} y={28.5} tone={runTone} glow={!v.unlit && on} ls={0} className={unlit}>RUN</Eng>
        <Eng x={86.5} y={42.5} tone={offTone} glow={!v.unlit && !on} ls={0} className={unlit}>OFF</Eng>
        <g className="cjp-sdg-pin">
          <rect x={HINGE_X} y={ROW_Y} width={LID_X - HINGE_X} height={ROW_H} rx={2.2} fill={`url(#${p}hp)`} stroke="#23272a" strokeWidth={0.6} />
          <path d={`M${HINGE_X} ${ROW_Y + 10.3}h5M${HINGE_X} ${ROW_Y + 20.6}h5`} stroke="rgba(0,0,0,.55)" strokeWidth={0.8} />
          <path d={`M${HINGE_X} ${ROW_Y + 11.1}h5M${HINGE_X} ${ROW_Y + 21.4}h5`} stroke="rgba(255,255,255,.22)" strokeWidth={0.5} />
        </g>
        <defs>
          <linearGradient id={`${p}hp`} x1="0" x2="1"><stop offset="0" stopColor="#eef1f2" /><stop offset=".35" stopColor="#a3aaae" /><stop offset=".75" stopColor="#5b6266" /><stop offset="1" stopColor="#2f3437" /></linearGradient>
        </defs>
      </svg>

      <button
        ref={swRef}
        id={swId}
        type="button"
        className="cjp-sdg-switch"
        role={v.sw.role}
        aria-checked={v.sw['aria-checked']}
        aria-label={v.sw['aria-label']}
        aria-disabled={v.sw['aria-disabled']}
        aria-describedby={v.operable ? undefined : reasonId}
        tabIndex={v.sw.tabIndex}
        style={{ left: SHUTDOWN_GUARD_STRIP_W, width: W - SHUTDOWN_GUARD_STRIP_W }}
        onClick={() => { if (v.operable) onToggle(); }}
        onKeyDown={onSwKey}
      />

      {/* folded lid (underside, standing up on the hinge): the close target while open */}
      <span className="cjp-sdg-under" aria-hidden="true" style={{ left: LID_X, top: ROW_Y, width: UNDER_W, height: ROW_H }}>
        <svg viewBox={`0 0 ${UNDER_W} ${ROW_H}`} width={UNDER_W} height={ROW_H} className="cjp-svg" focusable="false">
          <defs>
            <pattern id={`${p}su`} width={12} height={12} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={6} height={12} fill={disabled ? '#4a2c29' : '#8f1b13'} /><rect x={6} width={6} height={12} fill={disabled ? '#4c4529' : '#b48f14'} />
            </pattern>
            <linearGradient id={`${p}ug`} x1="0" x2="1"><stop offset="0" stopColor="#4b5054" /><stop offset="1" stopColor="#2a2d2f" /></linearGradient>
          </defs>
          <rect x={0.5} y={0.5} width={UNDER_W - 1} height={ROW_H - 1} rx={2} fill={`url(#${p}ug)`} stroke="#1c1e20" />
          <rect x={2} y={2} width={UNDER_W - 4} height={4} fill={`url(#${p}su)`} opacity={0.8} />
          <rect x={2} y={ROW_H - 6} width={UNDER_W - 4} height={4} fill={`url(#${p}su)`} opacity={0.8} />
          <rect x={4} y={8} width={UNDER_W - 8} height={ROW_H - 16} rx={2} fill="#17191a" />
          <path d={`M${UNDER_W / 2 - 4.5} ${ROW_H / 2 - 2.5}h9l-4.5 6z`} fill={disabled ? '#ccd2d6' : '#f3f1e8'} />
          <path d={`M${UNDER_W - 1.2} 2V${ROW_H - 2}`} stroke="rgba(255,255,255,.16)" strokeWidth={0.8} />
        </svg>
      </span>

      {/* the lid: striped frame (AB paint), window over the switch, LIFT tab; worn paint at the edges */}
      <span className="cjp-sdg-lid" aria-hidden="true" style={{ left: LID_X, top: ROW_Y, width: LID_W, height: ROW_H }}>
        <svg viewBox={`0 0 ${LID_W} ${ROW_H}`} width={LID_W} height={ROW_H} className="cjp-svg" focusable="false">
          <defs>
            <pattern id={`${p}st`} width={24} height={24} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={12} height={24} fill={c1} /><rect x={12} width={12} height={24} fill={c2} />
            </pattern>
          </defs>
          <path d={`${rr(0, 0, LID_W, ROW_H, 3)}${rr(WIN.x, WIN.y, WIN.w, WIN.h, 2)}`} fillRule="evenodd" fill={`url(#${p}st)`} />
          {/* matte smoked window: flat tint, no sheen */}
          <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} rx={2} fill="rgba(12,14,16,.3)" />
          {/* window wall: shade on the top/left inner walls, a catch on the bottom/right (key light top-left) */}
          <path d={`M${WIN.x + 0.6} ${WIN.y + WIN.h - 1.5}V${WIN.y + 0.6}H${WIN.x + WIN.w - 1.5}`} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={1.2} />
          <path d={`M${WIN.x + 1.5} ${WIN.y + WIN.h - 0.5}H${WIN.x + WIN.w - 0.5}V${WIN.y + 1.5}`} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={0.8} />
          {/* outer edge: dark rim, lit top-left bevel, shaded bottom-right */}
          <path d={rr(0.6, 0.6, LID_W - 1.2, ROW_H - 1.2, 2.6)} fill="none" stroke="#1c1e20" strokeWidth={1.2} />
          <path d={`M1.6 ${ROW_H - 3}V3Q1.6 1.6 3 1.6H${LID_W - 3}`} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth={0.8} />
          <path d={`M3 ${ROW_H - 1.6}H${LID_W - 3}Q${LID_W - 1.6} ${ROW_H - 1.6} ${LID_W - 1.6} ${ROW_H - 3}V3`} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={0.8} />
          {/* worn paint: bare metal where fingers lift the lid and along the hinge edge */}
          <g fill="#b5bbbf" opacity={disabled ? 0.3 : 0.55}>
            <path d="M0.9 6.2c.8-.3 1.6.2 1.4 1.1-.2.7-.4 1.9.1 2.9-.9.1-1.6-.3-1.6-1.2z" />
            <path d="M1 20.5c.7.2 1.2.9.9 1.6-.3.6-.2 1.3 0 1.8-.6 0-1-.5-1-1.2z" />
            <path d={`M${LID_W - 1} 9.2c-.8.1-1.4.9-1.1 1.8.3.9.1 2.2-.3 3.2.8-.1 1.4-.7 1.4-1.6z`} />
            <path d={`M${LID_W - 1} 17.6c-.6.4-1 1.3-.7 2.2.2.6.1 1.4-.2 1.9.6-.2 .9-.8.9-1.5z`} />
            <path d={`M40 0.8c.9.5 2.6.6 3.8.1-.3.7-1.5 1-2.6.9-.6-.1-1-.5-1.2-1z`} />
            <path d={`M66 ${ROW_H - 0.9}c1-.5 2.8-.5 4.1 0-.6.5-1.8.7-2.9.6-.5 0-.9-.3-1.2-.6z`} />
          </g>
          <rect x={TAB.x} y={TAB.y} width={TAB.w} height={TAB.h} rx={2} fill="#17191a" />
          <path d={`M${TAB.x + 0.5} ${TAB.y + TAB.h - 1}V${TAB.y + 0.5}H${TAB.x + TAB.w - 1}`} fill="none" stroke="rgba(0,0,0,.7)" strokeWidth={0.8} />
          <path d={`M${TAB.x + TAB.w / 2 - 4.5} ${TAB.y + 10}h9l-4.5-6z`} fill={disabled ? '#ccd2d6' : '#f3f1e8'} />
          <Eng x={TAB.x + TAB.w / 2} y={TAB.y + 21} tone={disabled ? 'grey' : 'white'} ls={0} className={disabled ? UNLIT_CLASS : undefined}>LIFT</Eng>
        </svg>
      </span>

      <button
        ref={coverRef}
        type="button"
        className="cjp-sdg-cover"
        aria-label={v.cover['aria-label']}
        aria-expanded={v.cover['aria-expanded']}
        aria-controls={swId}
        aria-disabled={v.cover['aria-disabled']}
        aria-describedby={disabled ? reasonId : undefined}
        style={guardOpen ? { width: SHUTDOWN_GUARD_STRIP_W, height: H } : { width: W, height: H }}
        onClick={() => { if (!disabled) onGuardToggle(); }}
      />
      {v.reason ? <Sr id={reasonId}>{v.reason}</Sr> : null}
    </div>
  );
}
