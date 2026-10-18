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
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { GpsPlate } from '../../skins/carrier-jet/parts/index';
import type { CjGps } from '../../skins/carrier-jet/parts/index';
import { abArmedAria, abAria, bonusAria, ENG_BULB_LEGEND, fsbAria, HV_BONUS, HV_GUARD_CLOSE_MS, HV_LAMPS, HV_RAIL_773, HV_RAIL_GEO, HV_TOP, lampAria, lampColor, qsAria, qsTap, RADAR_SPOKEN, radarStep, railFlipAria, railSw, railSwAria, type AbTarget, type EngBulb, type HeroLayout, type LampId, type LampMark, type LampState, type QsTarget, type RadarPos, type RailCol, type RailState, type RailSwDecl, type RailSwId, type SourcePos, type SplitCap } from '../carrier-jet/heroRail';
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

/**
 * v3.1 top plate (Meghan's v3.1-all-switches, option A; push 1): the bonus switch row (AVION · INS | POS LT · BEACON |
 * L IDLE · R IDLE | HYD | CANOPY · OXY, ON / OFF, two targets each), MASTER CAUTION / MASTER WARNING (tap to clear) and
 * the lights row: FASTEN SEAT BELT bulb + AB ARMED lamp (indicators, follow their switches) and the THEMES key.
 * Portaled into .rev-viewport, right-anchored; geometry in heroRail.ts HV_TOP (plate-relative px). All lamps steady.
 */
export interface TopPlateProps {
  layout: HeroLayout;
  lamps: LampState;
  onClear: (id: LampId) => void;
  bonus: Record<string, boolean>;
  onBonus: (system: string, on: boolean) => void;
  armed: boolean;
  launch: boolean;
  onThemes: () => void;
}
const px = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });
export function TopPlate(p: TopPlateProps) {
  const g = HV_TOP[p.layout];
  const master = (['masterCaution', 'masterWarning'] as const).map((id) => {
    const d = HV_LAMPS.find((x) => x.id === id)!;
    const r = id === 'masterCaution' ? g.mc : g.mw;
    const lit = p.lamps[id];
    return (
      <button key={id} type="button" className="cjhv-cap cjhv-top-master" data-lamp={id} data-color={lampColor(id)} data-lit={lit || undefined}
        style={{ left: r.x + g.masterHit.dx, top: r.y + g.masterHit.dy, width: g.masterHit.w, height: g.masterHit.h }} aria-label={lampAria(d, lit)} onClick={() => p.onClear(id)}>
        <Mark mark={d.mark} />
        <span className="cjhv-lg">{d.top}</span>
        <span className="cjhv-lg">{d.bottom}</span>
      </button>
    );
  });
  return (
    <div className="cjhv-top" data-rf-layout={p.layout} role="group" aria-label="Top plate" style={{ right: g.plate.right, top: g.plate.y, width: g.plate.w, height: g.plate.h, '--tg-k': g.tgScale } as CSSProperties}>
      <ArtDefs />
      {g.mods.map((m, i) => <span key={i} className="cjhv-top-mod" aria-hidden="true" style={{ left: m.x, top: g.modY, width: m.w, height: g.modH }} />)}
      <div className="cjhv-top-bonus" role="group" aria-label="Bonus switches">
        {HV_BONUS.map((b, i) => {
          const c = g.cols[i];
          const on = !!p.bonus[b.system];
          return (
            <div key={b.id} className="cjhv-top-sw" data-on={on || undefined} style={{ left: c.x, width: c.w }}>
              <span className="cjhv-lg cjhv-top-name" aria-hidden="true" style={{ top: g.nameY, fontSize: g.nameSize }}>{b.label}</span>
              <span className="cjhv-lg cjhv-top-pos" aria-hidden="true" style={{ top: g.onY }}>ON</span>
              <span className="cjhv-top-tg" style={{ top: g.tgY - 34 }}><ToggleArt pos={on ? 'up' : 'dn'} w={44} /></span>
              <span className="cjhv-lg cjhv-top-pos" aria-hidden="true" style={{ top: g.offY }}>OFF</span>
              <button type="button" className="cjhv-hit" style={{ top: g.upY, height: g.upH }} aria-label={bonusAria(b, on, 'on')} aria-pressed={on} onClick={() => p.onBonus(b.system, true)} />
              <button type="button" className="cjhv-hit" style={{ top: g.dnY, height: g.dnH }} aria-label={bonusAria(b, on, 'off')} aria-pressed={!on} onClick={() => p.onBonus(b.system, false)} />
            </div>
          );
        })}
      </div>
      {master}
      <span className="cjhv-top-bulb" data-lit={p.lamps.seatbelt || undefined} role="img" aria-label={fsbAria(p.lamps.seatbelt)} style={{ left: g.bulb.cx - g.bulb.r, top: g.bulb.cy - g.bulb.r, width: 2 * g.bulb.r, height: 2 * g.bulb.r }} />
      <span className="cjhv-lg cjhv-top-fsb" aria-hidden="true" style={{ left: g.fsb.x, top: g.fsb.y, width: g.fsb.w }}>FASTEN<br />SEAT BELT</span>
      <div className="cjhv-cap cjhv-top-ab" data-color="amber" data-lit={p.armed || undefined} role="img" aria-label={abArmedAria(p.armed, p.launch)} style={px(g.ab)}>
        <span className="cjhv-lg">AB</span>
        <span className="cjhv-lg">{p.launch ? 'LAUNCH' : 'ARMED'}</span>
      </div>
      <button type="button" className="cjhv-cap cjhv-top-themes" aria-label="Themes: opens the theme picker" style={px(g.themesHit)} onClick={p.onThemes}>
        <span className="cjhv-lg">THEMES</span>
        <span className="cjhv-lg">▸</span>
      </button>
    </div>
  );
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

/** A raised bead-blast module (fixed design width) with its engraved title and two Dzus studs. */
function Mod({ kind, w, title, children, label, style }: { kind: string; w?: number; title?: ReactNode; children: ReactNode; label?: string; style?: CSSProperties }) {
  return (
    <div className={`cjhv-mod cjhv-mod-${kind}`} role={label ? 'group' : undefined} aria-label={label} style={{ width: w, ...style }}>
      {title ? <span className="cjhv-title" aria-hidden="true">{title}</span> : null}
      {children}
    </div>
  );
}
/** ToggleArt centred on (tx, ty) at scale k. */
function Tg({ pos, tx, ty, k }: { pos: 'up' | 'mid' | 'dn'; tx: number; ty: number; k: number }) {
  return (
    <span className="cjhv-rtg" style={{ left: tx - 22, top: ty - 34, '--tg-k': k } as CSSProperties}>
      <ToggleArt pos={pos} w={44} />
    </span>
  );
}
const lgAt = (x: number, y: number, w: number, extra?: CSSProperties): CSSProperties => ({ left: x, top: y, width: w, ...extra });
/** Board / 773-left two-target toggle column (up target ON, down target OFF). */
function Col({ d, c, g, on, cue, onSet, up = 'ON', dn = 'OFF' }: { d: RailSwDecl; c: RailCol; g: { nameY: number; onY: number; offY: number; upY: number; upH: number; dnY: number; dnH: number; tgY: number }; on: boolean; cue?: boolean; onSet: (on: boolean) => void; up?: string; dn?: string }) {
  const two = d.label.includes('|');
  return (
    <div className="cjhv-col" data-on={on || undefined} data-cue={cue || undefined}>
      {two ? (
        <span className="cjhv-lg cjhv-rname cjhv-rname-2" aria-hidden="true" style={lgAt(c.x, g.nameY - 2, c.w)}>{d.label.split('|')[0]}<br />{d.label.split('|')[1]}</span>
      ) : (
        <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, g.nameY, c.w)}>{d.label}</span>
      )}
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 20, g.onY + (two ? 4 : 0), 40)}>{up}</span>
      <Tg pos={on ? 'up' : 'dn'} tx={c.tx} ty={g.tgY} k={HV_RAIL_GEO.board.tgK} />
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 20, g.offY, 40)}>{dn}</span>
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY, height: g.upH }} aria-label={railSwAria(d, on, 'on')} aria-pressed={on} onClick={() => onSet(true)} />
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.dnY, height: g.dnH }} aria-label={railSwAria(d, on, 'off')} aria-pressed={!on} onClick={() => onSet(false)} />
    </div>
  );
}
/** Three-position lever (RADAR MX / WX / OFF, SOURCE APU / OFF / AIR CART): up / down step one position. */
function Col3({ name, spoken, c, g, pos, labels, onStep, k }: { name: string; spoken: string; c: RailCol; g: { nameY: number; onY: number; offY: number; upY: number; upH: number; dnY: number; dnH: number; tgY: number }; pos: 'up' | 'mid' | 'dn'; labels: [string, string, string]; onStep: (dir: 1 | -1) => void; k: number }) {
  const now = labels[pos === 'up' ? 0 : pos === 'mid' ? 1 : 2];
  return (
    <div className="cjhv-col" data-pos={pos}>
      <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, g.nameY, c.w)}>{name}</span>
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 22, g.onY, 44)}>{labels[0]}</span>
      <Tg pos={pos} tx={c.tx} ty={g.tgY} k={k} />
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx + 15, g.tgY - 6, c.x + c.w - c.tx - 15, { textAlign: 'left' })}>{labels[1]}</span>
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.x, g.offY - 1, c.w)}>{labels[2]}</span>
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY, height: g.upH }} aria-label={`${spoken}: up one position, toward ${labels[0]}, now ${now}`} onClick={() => onStep(1)} />
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.dnY, height: g.dnH }} aria-label={`${spoken}: down one position, toward ${labels[2]}, now ${now}`} onClick={() => onStep(-1)} />
    </div>
  );
}
/** Engine START/RUN bulb: dark OFF, amber START, green RUN, with its legend (never colour alone). Steady. */
function Bulb({ state, cx, cy, r, lgX, lgY, lgW }: { state: EngBulb; cx: number; cy: number; r: number; lgX: number; lgY: number; lgW: number }) {
  return (
    <>
      <span className="cjhv-bulb" data-state={state} aria-hidden="true" style={{ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r }} />
      <span className="cjhv-lg cjhv-bulb-lg" data-state={state} aria-hidden="true" style={lgAt(lgX, lgY, lgW)}>{ENG_BULB_LEGEND[state]}</span>
    </>
  );
}
/** AFTERBURNER art: ARM / SAFE toggle under the red MS25224 guard (drawn open edge-on, or closed over the bat). */
function AbArt({ armed, open }: { armed: boolean; open: boolean }) {
  return (
    <div className="cjhv-ab-well">
      <ToggleArt pos={armed ? 'up' : 'dn'} w={44} />
      <svg className="cjhv-guard" viewBox="0 0 40 64" aria-hidden="true" focusable="false">
        {open ? (
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
        <rect x="2" y="2" width="36" height="7" rx="3.5" fill="#b8bec2" stroke="#2f3336" strokeWidth="0.7" />
        <path d="M10 2.5 V8.5 M20 2.5 V8.5 M30 2.5 V8.5" stroke="#596065" strokeWidth="0.8" />
      </svg>
    </div>
  );
}
/** QUICK START art: striped guard over the START korry (closed, LIFT tag) or lid edge-on + GUARD OPEN + green START. */
function QsArt({ open }: { open: boolean }) {
  return (
    <div className="cjhv-qs" data-open={open || undefined}>
      <span className="cjhv-qs-key" aria-hidden="true"><span className="cjhv-lg">START</span></span>
      {open ? (
        <>
          <svg className="cjhv-qs-lid" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect x="1" y="1" width="98" height="8" rx="2" fill="url(#cjhv-stripe)" stroke="#1a1a1a" strokeWidth="1" />
            <rect x="0" y="0" width="100" height="4" rx="2" fill="#c4c9cc" stroke="#2f3336" strokeWidth="0.7" />
          </svg>
          <span className="cjhv-lg cjhv-qs-open" aria-hidden="true">GUARD OPEN</span>
        </>
      ) : (
        <>
          <svg className="cjhv-qs-guard" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect x="2" y="6" width="96" height="56" rx="3" fill="url(#cjhv-stripe)" stroke="#1a1a1a" strokeWidth="1" />
            <rect x="2" y="6" width="96" height="56" rx="3" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
            <rect x="0" y="0" width="100" height="7" rx="3.5" fill="#c4c9cc" stroke="#2f3336" strokeWidth="0.7" />
            <path d="M16.6 0.5 V6.5 M33.3 0.5 V6.5 M50 0.5 V6.5 M66.6 0.5 V6.5 M83.3 0.5 V6.5" stroke="#596065" strokeWidth="0.8" />
          </svg>
          <span className="cjhv-qs-tag" aria-hidden="true">LIFT ▲</span>
        </>
      )}
    </div>
  );
}

export interface HeroRailProps {
  layout: HeroLayout;
  gps: CjGps;
  radar: RadarPos;
  onRadar: (pos: RadarPos) => void;
  /** AFTERBURNER at ARM (abView: the one value the bat, the lid and the plate lamp read) */
  armed: boolean;
  /** lid drawn open (abView.lidOpen) */
  guardOpen: boolean;
  onAb: (target: AbTarget) => void;
  rail: RailState;
  /** next switch in Dan's start order (static green legend, steady), if any */
  cue?: RailSwId | null;
  onSwitch: (id: RailSwId, on: boolean) => void;
  onSource: (pos: SourcePos) => void;
  live: boolean;
  onQuickStart: () => void;
  onEmergencyStop: () => void;
  holdRev: boolean;
  onHoldRev: (on: boolean) => void;
  running: boolean;
  onShutdown: () => void;
  say: (t: string) => void;
}

const SRC_LABELS: [string, string, string] = ['APU', 'OFF', 'AIR CART'];
const SRC_ORDER: SourcePos[] = ['dn', 'mid', 'up'];

export function HeroRail(p: HeroRailProps) {
  const narrow = p.layout === 'window';
  const G = HV_RAIL_GEO.board;
  const Z = HV_RAIL_773.zones;
  const bmod = Object.fromEntries(G.mods.map((m) => [m.id, m.w])) as Record<string, number>;
  // EMER STOP: the same deliberate pull as Meghan's PULL handle (pullGesture.ts); taps never fire (push 3 reworks it)
  const [pull, setPull] = useState<PullState>(PULL_REST);
  const pullRef = useRef(pull);
  const applyPull = (r: PullResult, el?: HTMLElement | null, pid?: number) => {
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
  const srcStep = (dir: 1 | -1) => {
    const i = SRC_ORDER.indexOf(p.rail.source) + dir;
    if (i < 0 || i > 2) return p.say(`Start source already at ${dir > 0 ? 'APU' : 'AIR CART'}`);
    p.onSource(SRC_ORDER[i]);
  };
  const holding = useRef(false);
  const hold = (on: boolean) => {
    if (holding.current === on) return;
    holding.current = on;
    p.onHoldRev(on);
  };
  // QUICK START two-step guard (qsTap): tap 1 lifts, tap 2 on START starts; shuts after a start, on a tap on the
  // raised guard, or HV_GUARD_CLOSE_MS after a lift with no second tap. Instant lid (this rail has no motion at all).
  const [qsUp, setQsUp] = useState(false);
  const qsOpen = qsUp && !p.live;
  useEffect(() => {
    if (!qsUp) return;
    const t = setTimeout(() => setQsUp(false), HV_GUARD_CLOSE_MS);
    return () => clearTimeout(t);
  }, [qsUp]);
  const qsPress = (target: QsTarget) => {
    const r = qsTap(qsOpen, target, p.live);
    setQsUp(r.open);
    if (r.start) p.onQuickStart();
    if (r.say) p.say(r.say);
  };
  const sw = (id: RailSwId) => ({ d: railSw(id), on: p.rail.on[id], cue: p.cue === id, onSet: (on: boolean) => p.onSwitch(id, on) });

  const qsHits = (x: number, w: number, pressY: number) => (
    <>
      <button type="button" className="cjhv-hit" style={{ left: x, width: w, top: 18, height: 44 }} aria-label={qsAria('guard', qsOpen, p.live)} aria-expanded={qsOpen} aria-disabled={p.live || undefined} onClick={() => qsPress('guard')} />
      <button type="button" className="cjhv-hit" style={{ left: x, width: w, top: pressY, height: 44 }} aria-label={qsAria('start', qsOpen, p.live)} aria-disabled={!qsOpen || undefined} onClick={() => qsPress('start')} />
    </>
  );
  const qs = (
    <Mod kind="qs" w={narrow ? Z.qs : bmod.qs} title="QUICK START" label="Quick start">
      <QsArt open={qsOpen} />
      {narrow ? qsHits(3, 64, 64) : qsHits(3, 94, 62)}
      <span className="cjhv-lg cjhv-foot" aria-hidden="true">LIFT · PRESS</span>
    </Mod>
  );
  const estop = (
      <Mod kind="es" w={narrow ? Z.estop : bmod.estop} title="EMER STOP" label="Emergency stop">
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

  );
  const push = (
    <Mod kind="push" w={narrow ? Z.push : bmod.push} label="Engine">
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
  );
  const gps = <div className="cjhv-mod cjhv-mod-gps" style={{ width: narrow ? Z.gps : bmod.gps }}><GpsPlate gps={p.gps} size={narrow ? 'narrow' : 'wide'} /></div>;

  if (narrow) {
    const L = HV_RAIL_773.left;
    const M = HV_RAIL_773.mid;
    const k = HV_RAIL_773.tgK;
    const flip = (id: RailSwId) => {
      const s = sw(id);
      const c = M[id];
      const ty = c.y + 38;
      return (
        <div key={id} className="cjhv-col" data-on={s.on || undefined} data-cue={s.cue || undefined}>
          <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, c.y + 3, c.w)}>{s.d.short}</span>
          <Tg pos={s.on ? 'up' : 'dn'} tx={c.tx} ty={ty} k={k} />
          <button type="button" className="cjhv-hit" style={px({ x: c.x, y: c.y, w: c.w, h: c.h })} aria-label={railFlipAria(s.d, s.on)} aria-pressed={s.on} onClick={() => s.onSet(!s.on)} />
        </div>
      );
    };
    const ab = M.ab;
    return (
      <div className="cjhv-rail" data-rf-layout="window" role="group" aria-label="Start rail">
        <ArtDefs />
        {gps}
        <Mod kind="radar" w={Z.radar} label={`Radar, ${RADAR_SPOKEN[p.radar]}`}>
          <Col3 name="RADAR" spoken="Radar" c={L.radar} g={L} pos={p.radar} labels={['MX', 'WX', 'OFF']} onStep={radarTap} k={1} />
        </Mod>
        <Mod kind="air" w={Z.air} label="Start air">
          <Col3 name="SOURCE" spoken="Start source" c={L.source} g={L} pos={p.rail.source} labels={SRC_LABELS} onStep={srcStep} k={1} />
          <Col d={railSw('xbleed')} c={L.xbleed} g={L} on={p.rail.on.xbleed} cue={p.cue === 'xbleed'} onSet={(on) => p.onSwitch('xbleed', on)} />
        </Mod>
        <div className="cjhv-zone" style={{ width: Z.mid }} role="group" aria-label="Start switches">
          {HV_RAIL_773.midMods.map((m, i) => <span key={i} className="cjhv-mod cjhv-submod" aria-hidden="true" style={px(m)} />)}
          {flip('batt')}
          {flip('seatbelt')}
          <div className="cjhv-col cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
            <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(161.3, 3, 70, { letterSpacing: 0 })}>AFTERBURNER</span>
            <span className="cjhv-ab-k" style={{ left: ab.tx - 22, top: 48 - 33, '--tg-k': 0.7 } as CSSProperties}><AbArt armed={p.armed} open={p.guardOpen} /></span>
            <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(196.3, 24, 35, { textAlign: 'left' })}>ARM</span>
            <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(196.3, 46, 35, { textAlign: 'left' })}>SAFE</span>
            <button type="button" className="cjhv-hit" style={px({ x: ab.x, y: ab.y, w: ab.w, h: ab.h })} aria-label={abAria(p.armed, p.guardOpen, 'one')} aria-pressed={p.armed} aria-expanded={p.guardOpen} onClick={() => p.onAb('one')} />
          </div>
          {flip('gen')}
          {flip('nav')}
          {flip('fuelL')}
          {flip('ignL')}
          {flip('engL')}
          <Bulb state={p.rail.bulb.L} {...HV_RAIL_773.bulbs.L} lgX={116} lgY={112} lgW={36} />
          {flip('fuelR')}
          {flip('ignR')}
          {flip('engR')}
          <Bulb state={p.rail.bulb.R} {...HV_RAIL_773.bulbs.R} lgX={293} lgY={112} lgW={36} />
        </div>
        {qs}
        {estop}
        {push}
      </div>
    );
  }

  const C = G.col;
  const titles = (id: string) =>
    G.mods.find((m) => m.id === id)?.titles?.map((t) => <span key={t.t} className="cjhv-lg cjhv-gtitle" aria-hidden="true" style={lgAt(t.x, G.titleY, t.w)}>{t.t}</span>);
  const divs = (id: string) => G.mods.find((m) => m.id === id)?.dividers?.map((x) => <span key={x} className="cjhv-div" aria-hidden="true" style={{ left: x }} />);
  return (
    <div className="cjhv-rail" data-rf-layout="board" role="group" aria-label="Start rail">
      <ArtDefs />
      {gps}
      <Mod kind="radar" w={bmod.radar} label={`Radar, ${RADAR_SPOKEN[p.radar]}`}>
        <Col3 name="RADAR" spoken="Radar" c={C.radar!} g={G} pos={p.radar} labels={['MX', 'WX', 'OFF']} onStep={radarTap} k={G.tgK} />
      </Mod>
      <Mod kind="ab" w={bmod.ab} title="AFTERBURNER" label="Afterburner master arm">
        <div className="cjhv-col cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
          <span className="cjhv-ab-k" style={{ left: C.ab!.tx - 22, top: G.tgY - 33, '--tg-k': 0.9 } as CSSProperties}><AbArt armed={p.armed} open={p.guardOpen} /></span>
          <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(49, 40, 37, { textAlign: 'left' })}>ARM</span>
          <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(49, 88, 37, { textAlign: 'left' })}>SAFE</span>
          <button type="button" className="cjhv-hit" style={{ left: 4, width: 80, top: 18, height: 44 }} aria-label={abAria(p.armed, p.guardOpen, 'guard')} aria-expanded={p.guardOpen} onClick={() => p.onAb('guard')} />
          <button type="button" className="cjhv-hit" style={{ left: 4, width: 80, top: 62, height: 52 }} aria-label={abAria(p.armed, p.guardOpen, 'switch')} aria-pressed={p.armed} onClick={() => p.onAb('switch')} />
        </div>
      </Mod>
      <Mod kind="air" w={bmod.air} label="Power, start air, cabin">
        {divs('air')}
        <Col {...sw('batt')} c={C.batt!} g={G} />
        <Col3 name="SOURCE" spoken="Start source" c={C.source!} g={G} pos={p.rail.source} labels={SRC_LABELS} onStep={srcStep} k={G.tgK} />
        <Col {...sw('xbleed')} c={C.xbleed!} g={G} />
        <Col {...sw('seatbelt')} c={C.seatbelt!} g={G} />
        {titles('air')}
      </Mod>
      {(['L', 'R'] as const).map((s) => (
        <Mod key={s} kind="eng" w={bmod[`eng${s}`]} label={`${s} engine`}>
          <Col {...sw(`fuel${s}`)} c={C[`fuel${s}`]!} g={G} />
          <Col {...sw(`ign${s}`)} c={C[`ign${s}`]!} g={G} />
          <Col {...sw(`eng${s}`)} c={C[`eng${s}`]!} g={G} />
          <Bulb state={p.rail.bulb[s]} cx={152} cy={58} r={9} lgX={134} lgY={70} lgW={36} />
          {titles(`eng${s}`)}
        </Mod>
      ))}
      <Mod kind="elec" w={bmod.elec} label="Electrics and nav">
        <Col {...sw('gen')} c={C.gen!} g={G} />
        <Col {...sw('nav')} c={C.nav!} g={G} />
        {titles('elec')}
      </Mod>
      {qs}
      {estop}
      {push}
    </div>
  );
}
