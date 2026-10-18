/**
 * Carrier Jet hero v2 (Meghan's cj-hero-2026/v2 mock, rail v2 layout; Wilson approved Oct 18). Host-drawn parts in the
 * hero's photoreal material (matte FS 36231-style paint on one baked grain tile, engraved backlit cream legends, one
 * top-left key light, frosted diffusers on lamp lenses only):
 *  - AnnunciatorPlate: 8 steady split-legend Korry caps, portaled into the top bar's empty right half.
 *  - HeroRail: RADAR 3-pos · AFTERBURNER guard (+ AB ARMED cap at 1280) · START bank · QUICK START · EMER STOP ·
 *    HOLD TO REV / SHUTDOWN, between Meghan's live GPS lamp (GpsPlate) and the live SHELF key, in the dock.
 *  - KorryCap: the split legend printed on an edge key's blank cap (decoration over Meghan's BezelKey; taps go through).
 * Model and rules: packs/carrier-jet/heroRail.ts (lamp colours, split caps, RADAR positions, START positions).
 * Nothing animates: no transitions or keyframes; a pulled EMER STOP handle follows the finger (direct manipulation)
 * and snaps back. No WebGL, no backdrop-filter, no CSS blur: everything here is CSS + inline SVG + two baked tiles.
 */
import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { GpsPlate } from '../../skins/carrier-jet/parts/index';
import type { CjGps } from '../../skins/carrier-jet/parts/index';
import { HV_LAMPS, HV_START, lampAria, lampColor, RADAR_SPOKEN, radarStep, type HeroLayout, type LampId, type LampMark, type LampState, type RadarPos, type SplitCap, type StartId } from '../carrier-jet/heroRail';
import { PULL_REST, pullAction, pullDown, pullMove, pullUp, type PullResult, type PullState } from '../carrier-jet/pullGesture';
import './cj-hero-v2.css';

/* ------------------------------------------------------------------ Korry split cap (upper-board keys) */

export function KorryCap({ cap }: { cap: SplitCap | null }) {
  if (!cap) return null;
  return (
    <span className="cjhv-korry" data-lit={cap.lit || undefined} data-single={cap.bottom ? undefined : true} aria-hidden="true">
      <span className="cjhv-korry-top">{cap.top}</span>
      {cap.bottom ? <span className="cjhv-korry-bot">{cap.bottom}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ annunciator plate */

function Mark({ mark }: { mark: LampMark }) {
  const common = { className: 'cjhv-mark', viewBox: '0 0 8 8', 'aria-hidden': true, focusable: false } as const;
  switch (mark) {
    case 'bar': return <svg {...common}><rect x="0.5" y="3" width="7" height="2" /></svg>;
    case 'circle': return <svg {...common}><circle cx="4" cy="4" r="3" /></svg>;
    case 'triangle': return <svg {...common}><path d="M4 0.6 L7.6 7.2 H0.4 Z" /></svg>;
    case 'ring': return <svg {...common}><circle cx="4" cy="4" r="2.7" fill="none" strokeWidth="1.3" data-stroke /></svg>;
    case 'x': return <svg {...common}><path d="M1 1 L7 7 M7 1 L1 7" fill="none" strokeWidth="1.5" data-stroke /></svg>;
    default: return <svg {...common}><rect x="1" y="1" width="6" height="6" /></svg>;
  }
}

export function AnnunciatorPlate({ lamps, layout, onClear }: { lamps: LampState; layout: HeroLayout; onClear: (id: LampId) => void }) {
  return (
    <div className="cjhv-ann" data-rf-layout={layout} role="group" aria-label="Annunciator lamps">
      {HV_LAMPS.map((d) => {
        const lit = lamps[d.id];
        const face = (
          <>
            <Mark mark={d.mark} />
            <span className="cjhv-lg">{d.top}</span>
            <span className="cjhv-lg">{d.bottom}</span>
          </>
        );
        const p = { className: 'cjhv-cap', 'data-lamp': d.id, 'data-color': lampColor(d.id), 'data-lit': lit || undefined } as const;
        return d.clearable ? (
          <button key={d.id} type="button" {...p} aria-label={lampAria(d, lit)} onClick={() => onClear(d.id)}>{face}</button>
        ) : (
          <div key={d.id} {...p} role="img" aria-label={lampAria(d, lit)}>{face}</div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ hardware art (original SVG) */

/** MS24658-style toggle seen from the front: knurled locking ring + key tab, hex nut, threaded bushing, chrome bat
 * with lock collar and ball tip. `pos` up / mid (bat end-on) / dn. Key light top-left. */
function ToggleArt({ pos, w = 44 }: { pos: 'up' | 'mid' | 'dn'; w?: number }) {
  const cx = w / 2, cy = 34, H = 68;
  const bat = pos === 'up' ? { y1: cy, y2: 7 } : pos === 'dn' ? { y1: cy, y2: H - 6 } : null;
  return (
    <svg className="cjhv-tg" viewBox={`0 0 ${w} ${H}`} width={w} height={H} aria-hidden="true" focusable="false">
      {/* knurled locking ring (dashed rim = knurl) with its key tab at 12 o'clock */}
      <circle cx={cx} cy={cy} r={13} fill="url(#cjhv-ring)" stroke="#16181a" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={12} fill="none" stroke="#9aa0a5" strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray="1.1 1.3" />
      <rect x={cx - 2} y={cy - 16} width={4} height={4} rx={0.6} fill="#5c6267" stroke="#1a1c1e" strokeWidth={0.6} />
      {/* hex nut */}
      <path d={hex(cx, cy, 9)} fill="url(#cjhv-nut)" stroke="#121416" strokeWidth={0.8} />
      <path d={hex(cx, cy, 9)} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={0.6} strokeDasharray="0 14 9 30" />
      {/* threaded bushing */}
      <circle cx={cx} cy={cy} r={5.6} fill="#2a2e31" stroke="#0d0f10" strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={4.4} fill="none" stroke="#6f767b" strokeWidth={0.5} />
      <circle cx={cx} cy={cy} r={3.3} fill="none" stroke="#596065" strokeWidth={0.5} />
      {bat ? (
        <>
          {/* contact shadow of the bat on the plate (offset down-right, from the top-left light) */}
          <path d={batPath(cx + 1.6, bat.y1 + 1.6, bat.y2 + 1.6)} fill="rgba(0,0,0,.38)" />
          <path d={batPath(cx, bat.y1, bat.y2)} fill="url(#cjhv-chrome)" stroke="#2b2f32" strokeWidth={0.7} />
          {/* lock collar */}
          <rect x={cx - 4} y={Math.min(bat.y1, bat.y2) + (pos === 'up' ? 16 : 3)} width={8} height={3.2} rx={1} fill="#b9bfc3" stroke="#3a3f42" strokeWidth={0.5} />
          {/* ball tip */}
          <circle cx={cx} cy={bat.y2} r={4.4} fill="url(#cjhv-ball)" stroke="#2b2f32" strokeWidth={0.7} />
        </>
      ) : (
        <>
          {/* MID: the bat points at the viewer, the ball tip end-on over the bushing */}
          <circle cx={cx + 1.4} cy={cy + 1.6} r={5} fill="rgba(0,0,0,.4)" />
          <circle cx={cx} cy={cy} r={5} fill="url(#cjhv-ball)" stroke="#2b2f32" strokeWidth={0.7} />
        </>
      )}
    </svg>
  );
}
const hex = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ') + ' Z';
/** Tapered bat from the bushing (y1) to the tip (y2). */
const batPath = (cx: number, y1: number, y2: number) => `M${cx - 3.2} ${y1} L${cx - 2} ${y2} L${cx + 2} ${y2} L${cx + 3.2} ${y1} Z`;

/** Shared gradients for every toggle (one defs block for the rail). */
function ArtDefs() {
  return (
    <svg className="cjhv-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="cjhv-ring" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#6d7378" /><stop offset=".6" stopColor="#3b4044" /><stop offset="1" stopColor="#212427" /></radialGradient>
        <linearGradient id="cjhv-nut" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8a9095" /><stop offset=".5" stopColor="#50565a" /><stop offset="1" stopColor="#2a2e31" /></linearGradient>
        <linearGradient id="cjhv-chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f3f5f6" /><stop offset=".35" stopColor="#c4c9cc" /><stop offset=".62" stopColor="#7e8488" /><stop offset="1" stopColor="#4e5458" /></linearGradient>
        <radialGradient id="cjhv-ball" cx="35%" cy="32%" r="70%"><stop offset="0" stopColor="#ffffff" /><stop offset=".3" stopColor="#d4d8db" /><stop offset=".75" stopColor="#80868a" /><stop offset="1" stopColor="#3d4245" /></radialGradient>
        <linearGradient id="cjhv-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c8332a" /><stop offset=".55" stopColor="#9b2019" /><stop offset="1" stopColor="#6a1410" /></linearGradient>
        <pattern id="cjhv-stripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="14" height="14" fill="#d9a521" /><rect width="7" height="14" fill="#141414" /></pattern>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ rail */

/** A raised bead-blast module with its engraved title and two Dzus studs. */
function Mod({ kind, title, children, label }: { kind: string; title?: ReactNode; children: ReactNode; label: string }) {
  return (
    <div className={`cjhv-mod cjhv-mod-${kind}`} role="group" aria-label={label}>
      {title ? <span className="cjhv-title" aria-hidden="true">{title}</span> : null}
      {children}
    </div>
  );
}

/** A two-target toggle (upper half = ON / up, lower half = OFF / down), the rail v2 hit boxes. */
function Toggle2({ name, on, onSet, cue, disabled, reason, upLegend = 'ON', dnLegend = 'OFF', w }: { name: string; on: boolean; onSet: (on: boolean) => void; cue?: boolean; disabled?: boolean; reason?: string; upLegend?: string; dnLegend?: string; w: number }) {
  const why = disabled && reason ? `. ${reason}` : '';
  return (
    <div className="cjhv-sw" data-on={on || undefined} data-cue={cue || undefined} data-disabled={disabled || undefined}>
      <span className="cjhv-lg cjhv-sw-up" aria-hidden="true">{upLegend}</span>
      <ToggleArt pos={on ? 'up' : 'dn'} w={w} />
      <span className="cjhv-lg cjhv-sw-dn" aria-hidden="true">{dnLegend}</span>
      <button type="button" className="cjhv-hit cjhv-hit-up" aria-label={`${name} ${upLegend.toLowerCase()}${why}`} aria-pressed={on} aria-disabled={disabled || undefined} onClick={() => onSet(true)} />
      <button type="button" className="cjhv-hit cjhv-hit-dn" aria-label={`${name} ${dnLegend.toLowerCase()}${why}`} aria-pressed={!on} aria-disabled={disabled || undefined} onClick={() => onSet(false)} />
    </div>
  );
}

export interface HeroRailProps {
  layout: HeroLayout;
  gps: CjGps;
  radar: RadarPos;
  onRadar: (pos: RadarPos) => void;
  armed: boolean;
  guardOpen: boolean;
  onGuard: () => void;
  onArm: () => void;
  launch: boolean;
  start: Record<StartId, boolean>;
  /** Next START switch in the start order (static green legend cue), if any. */
  startCue?: StartId | null;
  /** START bank usable (cold start present); false: it mirrors the engine and says why on a tap. */
  startLive: boolean;
  onStart: (id: StartId, on: boolean) => void;
  live: boolean;
  onQuickStart: () => void;
  onEmergencyStop: () => void;
  holdRev: boolean;
  onHoldRev: (on: boolean) => void;
  running: boolean;
  onShutdown: () => void;
  say: (t: string) => void;
}

export function HeroRail(p: HeroRailProps) {
  const narrow = p.layout === 'window';
  const W = narrow ? 44 : 56;
  // EMER STOP: the same deliberate pull as Meghan's PULL handle (pullGesture.ts); taps never fire
  const [pull, setPull] = useState<PullState>(PULL_REST);
  const pullRef = useRef(pull);
  const applyPull = (r: PullResult, el?: HTMLElement | null, pid?: number) => {
    // the ref is the gesture's source of truth between pointer events (written here, never during render)
    const next = r.state.phase === 'fired' ? PULL_REST : r.state;
    pullRef.current = next;
    setPull(next);
    for (const e of r.effects) {
      if (e === 'capture' && el && pid !== undefined) el.setPointerCapture?.(pid);
      if (e === 'release' && el && pid !== undefined && el.hasPointerCapture?.(pid)) el.releasePointerCapture(pid);
      if (e === 'fire') p.onEmergencyStop();
    }
  };
  const grip = {
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullDown(pullRef.current, e.pointerId, e.clientY, e.isPrimary), e.currentTarget, e.pointerId),
    onPointerMove: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullMove(pullRef.current, e.pointerId, e.clientY), e.currentTarget, e.pointerId),
    onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId, e.clientY), e.currentTarget, e.pointerId),
    onPointerCancel: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId), e.currentTarget, e.pointerId),
  };
  const radarTap = (dir: 1 | -1) => {
    const r = radarStep(p.radar, dir);
    if (r.reason) return p.say(r.reason);
    p.onRadar(r.pos);
    p.say(`Radar ${RADAR_SPOKEN[r.pos]}`);
  };
  const holding = useRef(false);
  const hold = (on: boolean) => {
    if (holding.current === on) return;
    holding.current = on;
    p.onHoldRev(on);
  };
  return (
    <div className="cjhv-rail" data-rf-layout={p.layout} role="group" aria-label="Start rail">
      <ArtDefs />
      <div className="cjhv-mod cjhv-mod-gps"><GpsPlate gps={p.gps} size={narrow ? 'narrow' : 'wide'} /></div>

      <Mod kind="radar" title="RADAR" label={`Radar, ${RADAR_SPOKEN[p.radar]}`}>
        <div className="cjhv-sw cjhv-sw3" data-pos={p.radar}>
          <span className="cjhv-lg cjhv-sw-up" aria-hidden="true">MX</span>
          <ToggleArt pos={p.radar} w={44} />
          <span className="cjhv-lg cjhv-sw-mid" aria-hidden="true">WX</span>
          <span className="cjhv-lg cjhv-sw-dn" aria-hidden="true">OFF</span>
          <button type="button" className="cjhv-hit cjhv-hit-up" aria-label={`Radar: move up one position, toward MX, now ${RADAR_SPOKEN[p.radar]}`} onClick={() => radarTap(1)} />
          <button type="button" className="cjhv-hit cjhv-hit-dn" aria-label={`Radar: move down one position, toward OFF, now ${RADAR_SPOKEN[p.radar]}`} onClick={() => radarTap(-1)} />
        </div>
      </Mod>

      <Mod kind="ab" title={narrow ? 'AB' : 'AFTERBURNER'} label="Afterburner master arm">
        <div className="cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
          <span className="cjhv-lg cjhv-sw-up" aria-hidden="true">ARM</span>
          <div className="cjhv-ab-well">
            <ToggleArt pos={p.armed ? 'up' : 'dn'} w={44} />
            {/* MS25224-style red flip guard: hinge barrel at the top, ears, U-channel, lift tab */}
            <svg className="cjhv-guard" viewBox="0 0 40 64" aria-hidden="true" focusable="false">
              {p.guardOpen ? (
                <g>
                  <rect x="4" y="0.5" width="32" height="10" rx="2" fill="url(#cjhv-red)" stroke="#3a0b08" strokeWidth="0.8" />
                  <rect x="6" y="2.5" width="28" height="2" rx="1" fill="rgba(255,255,255,.18)" />
                </g>
              ) : (
                <g>
                  <rect x="5" y="9" width="30" height="51" rx="3" fill="rgba(0,0,0,.35)" transform="translate(1.5 1.5)" />
                  <rect x="5" y="9" width="30" height="51" rx="3" fill="url(#cjhv-red)" stroke="#3a0b08" strokeWidth="0.8" />
                  <rect x="8" y="12" width="3" height="44" rx="1.5" fill="rgba(255,255,255,.16)" />
                  <rect x="12" y="56" width="16" height="5" rx="1.5" fill="#b02a21" stroke="#3a0b08" strokeWidth="0.6" />
                </g>
              )}
              {/* hinge barrel + ears (always on top) */}
              <rect x="2" y="2" width="36" height="7" rx="3.5" fill="#b8bec2" stroke="#2f3336" strokeWidth="0.7" />
              <path d="M10 2.5 V8.5 M20 2.5 V8.5 M30 2.5 V8.5" stroke="#596065" strokeWidth="0.8" />
            </svg>
          </div>
          <span className="cjhv-lg cjhv-sw-dn" aria-hidden="true">SAFE</span>
          <button type="button" className="cjhv-hit cjhv-hit-guard" aria-label={p.guardOpen ? 'Afterburner guard, open: close it' : 'Afterburner guard, closed: lift to reach ARM'} aria-expanded={p.guardOpen} onClick={p.onGuard} />
          {p.guardOpen ? <button type="button" className="cjhv-hit cjhv-hit-arm" role="switch" aria-checked={p.armed} aria-label={`Afterburner ${p.armed ? 'armed' : 'safe'}`} onClick={p.onArm} /> : null}
        </div>
        {!narrow && (
          <div className="cjhv-cap cjhv-abcap" data-color="amber" data-lit={p.armed || undefined} role="img" aria-label={`A B armed, ${p.launch ? 'launch' : p.armed ? 'lit amber' : 'off'}`}>
            <span className="cjhv-lg">AB</span>
            <span className="cjhv-lg">{p.launch ? 'LAUNCH' : 'ARMED'}</span>
          </div>
        )}
      </Mod>

      <Mod kind="start" label="Start switches">
        {HV_START.map((s, i) => (
          <div key={s.id} className="cjhv-start" data-div={i === 4 || undefined}>
            <span className="cjhv-title" aria-hidden="true">{s.label}</span>
            <Toggle2
              name={s.spoken}
              on={p.start[s.id]}
              cue={p.startCue === s.id}
              w={W}
              disabled={!p.startLive || s.system === null}
              reason={s.system === null ? 'Generators come on with the engines' : 'Needs the cold start (Tomcat engine)'}
              onSet={(on) => {
                if (!p.startLive || s.system === null) return p.say(`${s.spoken}: ${s.system === null ? 'generators come on with the engines' : 'needs the cold start'}`);
                p.onStart(s.id, on);
              }}
            />
          </div>
        ))}
      </Mod>

      <Mod kind="qs" title="QUICK START" label="Quick start">
        <div className="cjhv-qs">
          <svg className="cjhv-qs-guard" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect x="2" y="6" width="96" height="56" rx="3" fill="url(#cjhv-stripe)" stroke="#1a1a1a" strokeWidth="1" />
            <rect x="2" y="6" width="96" height="56" rx="3" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
            {/* hinge with 6 knuckles */}
            <rect x="0" y="0" width="100" height="7" rx="3.5" fill="#c4c9cc" stroke="#2f3336" strokeWidth="0.7" />
            <path d="M16.6 0.5 V6.5 M33.3 0.5 V6.5 M50 0.5 V6.5 M66.6 0.5 V6.5 M83.3 0.5 V6.5" stroke="#596065" strokeWidth="0.8" />
          </svg>
          <span className="cjhv-qs-tag" aria-hidden="true">LIFT ▲</span>
          <button type="button" className="cjhv-hit cjhv-hit-qs" aria-label={p.live ? 'Quick start: engines already running' : 'Quick start guard: lift and start in one tap'} aria-disabled={p.live || undefined} onClick={() => (p.live ? p.say('Engines already running') : p.onQuickStart())} />
        </div>
        <span className="cjhv-lg cjhv-foot" aria-hidden="true">1 TAP · LIFT</span>
      </Mod>

      <Mod kind="es" title={narrow ? 'EMER' : 'EMER STOP'} label="Emergency stop">
        <div className="cjhv-es-well">
          <button type="button" className="cjhv-es-grip" aria-label="Emergency stop: pull the handle down" style={{ transform: `translateY(${Math.round(pull.progress * 14)}px)` }} {...grip}>
            <svg viewBox="0 0 44 52" aria-hidden="true" focusable="false">
              <rect x="20" y="14" width="5" height="26" fill="url(#cjhv-chrome)" transform="translate(1 1)" opacity=".4" />
              <rect x="19.5" y="14" width="5" height="26" fill="url(#cjhv-chrome)" stroke="#2b2f32" strokeWidth="0.6" />
              <rect x="13" y="38" width="18" height="5" rx="1" fill="#8d9398" stroke="#2b2f32" strokeWidth="0.6" />
              <rect x="4" y="3" width="36" height="13" rx="3" fill="rgba(0,0,0,.4)" transform="translate(1.4 1.6)" />
              <rect x="4" y="3" width="36" height="13" rx="3" fill="url(#cjhv-red)" stroke="#3a0b08" strokeWidth="0.8" />
              <rect x="6" y="5" width="32" height="2.4" rx="1.2" fill="rgba(255,255,255,.2)" />
            </svg>
          </button>
          {/* VoiceOver: the one non-pull path (as on Meghan's PULL handle) */}
          <button type="button" className="rf-sr-only" onClick={() => applyPull(pullAction(pullRef.current))}>Emergency stop, stop the engines now</button>
        </div>
        <span className="cjhv-lg cjhv-foot" aria-hidden="true">PULL ▼</span>
      </Mod>

      <Mod kind="push" label="Engine">
        <button
          type="button"
          className="cjhv-push"
          aria-label={p.holdRev ? 'Hold to rev' : 'Hold to rev, demo source only'}
          aria-disabled={!p.holdRev || undefined}
          onPointerDown={(e) => {
            if (!p.holdRev) return p.say('Hold to rev works with the demo source');
            e.currentTarget.setPointerCapture?.(e.pointerId);
            hold(true);
          }}
          onPointerUp={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onLostPointerCapture={() => hold(false)}
        >
          <span className="cjhv-lg">HOLD</span>
          <span className="cjhv-lg">TO REV</span>
        </button>
        <button type="button" className="cjhv-push" aria-label={p.running ? 'Shutdown' : 'Shutdown, engine already off'} aria-disabled={!p.running || undefined} onClick={() => (p.running ? p.onShutdown() : p.say('Engine already off'))}>
          {narrow ? <><span className="cjhv-lg">SHUT</span><span className="cjhv-lg">DOWN</span></> : <span className="cjhv-lg">SHUTDOWN</span>}
        </button>
      </Mod>
    </div>
  );
}
