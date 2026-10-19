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
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { CjGps } from '../../skins/carrier-jet/parts/index';
import type { CjGpsSeq } from '../carrier-jet/gpsAcqSeq';
import { abAria, bonusAria, ENG_BULB_LEGEND, fsbAria, HV_BONUS, HV_GUARD_CLOSE_MS, HV_LAMPS, HV_RAIL_773, HV_RAIL_GEO, HV_TOP, lampAria, lampColor, qsAria, qsTap, RADAR_SPOKEN, radarStep, railFlipAria, railSw, railSwAria, type AbTarget, type EngBulb, type HeroLayout, type LampId, type LampMark, type LampState, type QsTarget, type RadarPos, type RailCol, type RailPart, type RailState, type RailSwDecl, type RailSwId, type SourcePos, type SplitCap } from '../carrier-jet/heroRail';
import { PULL_REST, pullAction, pullDown, pullMove, pullUp, type PullResult, type PullState } from '../carrier-jet/pullGesture';
import { guardSrc, masterSrc, pushSquareSrc, roundMode, roundSrc, darkSrc, squareFullRedSrc, squareFullSrc, squareThirdSrc, toggleSrc } from './cjArt';
import './cj-hero-v2.css';

/* ------------------------------------------------------------------ Korry split cap (upper-board keys) */

/** Edge keys that toggle a state (lit legend strip: Push Square 1/3 lamp); every other key is a plain Push Square
 * (unpressed, pressed while held). */
const KORRY_TOGGLE = new Set(['orient', 'mode', 'wx', 'drive']);
export function KorryCap({ cap, id }: { cap: SplitCap | null; id?: string }) {
  if (!cap) return null;
  const toggle = !!id && KORRY_TOGGLE.has(id);
  const art: CSSProperties = (toggle
    ? { '--sq': `url(${squareThirdSrc(cap.lit)})`, '--sq-dark': `url(${squareThirdSrc(false)})`, '--sq-dark2': `url(${darkSrc('third')})` }
    : { '--sq': `url(${pushSquareSrc(false)})`, '--sq-on': `url(${pushSquareSrc(true)})`, '--sq-dark2': `url(${darkSrc('full')})` }) as Record<string, string>;
  return (
    <span className="cjhv-korry" data-lit={cap.lit || undefined} data-cap-only={cap.capOnly || undefined} data-push={toggle ? undefined : true} data-single={cap.bottom ? undefined : true} aria-hidden="true" style={art}>
      <span className="cjhv-korry-top">{cap.top}</span>
      {cap.bottom ? <span className="cjhv-korry-bot">{cap.bottom}</span> : null}
      {/* the 1/3 lamp strip carries on / off on toggle keys whose face has no state text */}
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
  /** BATT on: switches can light, round lamps are powered */
  batt: boolean;
  /** first BATT-on lamp test (2 s): every round lamp lit */
  lampTest: boolean;
  /** EMER STOP (moved up next to MC / MW, Oct 19 round 2) */
  onEmergencyStop: () => void;
}
const px = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });
export function TopPlate(p: TopPlateProps) {
  const g = HV_TOP[p.layout];
  // round 3: with no caution / warning active, pressing MC or MW lights it until release (press-to-test, BATT on)
  const [pressTest, setPressTest] = useState<LampId | null>(null);
  const master = (['masterCaution', 'masterWarning'] as const).map((id) => {
    const d = HV_LAMPS.find((x) => x.id === id)!;
    const r = id === 'masterCaution' ? g.mc : g.mw;
    const active = p.lamps[id];
    const lit = active || (p.batt && (p.lampTest || pressTest === id));
    const down = () => { if (!active && p.batt) setPressTest(id); };
    const up = () => setPressTest((v) => (v === id ? null : v));
    return (
      <button key={id} type="button" className="cjhv-cap cjhv-top-master" data-lamp={id} data-color={lampColor(id)} data-lit={lit || undefined}
        style={{ left: r.x + g.masterHit.dx, top: r.y + g.masterHit.dy, width: g.masterHit.w, height: g.masterHit.h, backgroundImage: `url(${lit || p.batt ? masterSrc(id, lit) : darkSrc('master')})` }} aria-label={lampAria(d, active)} onClick={() => { if (active) p.onClear(id); }}
        onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') down(); }} onKeyUp={up} onBlur={up}>
        {/* Wilson, Oct 19: no circle / triangle mark on MASTER CAUTION / WARNING, legends only */}
        <span className="cjhv-lg">{d.top}</span>
        <span className="cjhv-lg">{d.bottom}</span>
      </button>
    );
  });
  return (
    <LampTestCtx.Provider value={p.lampTest && p.batt}><div className="cjhv-top" data-rf-layout={p.layout} role="group" aria-label="Top plate" style={{ right: g.plate.right, top: g.plate.y, width: g.plate.w, height: g.plate.h, '--tg-k': g.tgScale } as CSSProperties}>
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
              <span className="cjhv-top-tg" style={{ top: g.tgY - 34 }}><ToggleArt pos={on ? 'up' : 'dn'} lit={on && p.batt} /></span>
              <span className="cjhv-lg cjhv-top-pos" aria-hidden="true" style={{ top: g.offY }}>OFF</span>
              <button type="button" className="cjhv-hit" style={{ top: g.upY, height: g.upH }} aria-label={bonusAria(b, on, 'on')} aria-pressed={on} onClick={() => p.onBonus(b.system, true)} />
              <button type="button" className="cjhv-hit" style={{ top: g.dnY, height: g.dnH }} aria-label={bonusAria(b, on, 'off')} aria-pressed={!on} onClick={() => p.onBonus(b.system, false)} />
            </div>
          );
        })}
      </div>
      {master}
      <span className="cjhv-top-bulb" data-lit={p.lamps.seatbelt || undefined} data-mode={roundMode(p.batt, p.lampTest, p.lamps.seatbelt)} role="img" aria-label={fsbAria(p.lamps.seatbelt)} style={{ left: g.bulb.cx - g.bulb.r, top: g.bulb.cy - g.bulb.r, width: 2 * g.bulb.r, height: 2 * g.bulb.r, '--lamp': `url(${roundSrc('amber', roundMode(p.batt, p.lampTest, p.lamps.seatbelt))})` } as CSSProperties} />
      <span className="cjhv-lg cjhv-top-fsb" aria-hidden="true" style={{ left: g.fsb.x, top: g.fsb.y, width: g.fsb.w }}>FASTEN<br />SEAT BELT</span>
      {/* AB ARMED moved beside CONFIG (CjV2Layer abLamp); THEMES centred in the freed column */}
      <button type="button" className="cjhv-cap cjhv-top-themes" aria-label="Themes" style={{ ...px(g.themesHit), ...sqVars }} onClick={p.onThemes}>
        <JetIcon />
      </button>
      <EStop r={g.es} narrow={p.layout === 'window'} onFire={p.onEmergencyStop} />
    </div></LampTestCtx.Provider>
  );
}

/** THEMES key icon: a simple original swept-wing jet, top view (not a trace of any aircraft). */
function JetIcon() {
  return (
    <svg className="cjhv-jet" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 1.5c.7 0 1.1 1.4 1.1 3.2v4.1l8.4 5.6v1.9l-8.4-2.6v4.4l2.6 2v1.5L12 20.7l-3.7.9v-1.5l2.6-2v-4.4l-8.4 2.6v-1.9l8.4-5.6V4.7c0-1.8.4-3.2 1.1-3.2z" />
    </svg>
  );
}
/** EMER STOP: the same deliberate pull as Meghan's PULL handle (pullGesture.ts); taps never fire. On the top plate since
 * Oct 19 round 2 (next to MASTER CAUTION / WARNING). */
function EStop({ r, narrow, onFire }: { r: { x: number; y: number; w: number; h: number }; narrow: boolean; onFire: () => void }) {
  const [pull, setPull] = useState<PullState>(PULL_REST);
  const pullRef = useRef(pull);
  const applyPull = (res: PullResult, el?: HTMLElement | null, pid?: number) => {
    const next = res.state.phase === 'fired' ? PULL_REST : res.state;
    pullRef.current = next;
    setPull(next);
    for (const e of res.effects) {
      if (e === 'capture' && el && pid !== undefined) el.setPointerCapture?.(pid);
      if (e === 'release' && el && pid !== undefined && el.hasPointerCapture?.(pid)) el.releasePointerCapture(pid);
      if (e === 'fire') onFire();
    }
  };
  const grip = {
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullDown(pullRef.current, e.pointerId, e.clientY, e.isPrimary), e.currentTarget, e.pointerId),
    onPointerMove: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullMove(pullRef.current, e.pointerId, e.clientY), e.currentTarget, e.pointerId),
    onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId, e.clientY), e.currentTarget, e.pointerId),
    onPointerCancel: (e: RPointerEvent<HTMLButtonElement>) => applyPull(pullUp(pullRef.current, e.pointerId), e.currentTarget, e.pointerId),
  };
  return (
    <div className="cjhv-mod cjhv-mod-es cjhv-top-es" data-narrow={narrow || undefined} role="group" aria-label="Emergency stop" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
      <span className="cjhv-title" aria-hidden="true">{narrow ? 'EMER' : 'EMER STOP'}</span>
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

/** Wilson's hex toggle (cjArt.ts): up / mid / dn, lit = on and BATT on. Fills the old 44x68 art box (nut centred). */
/** Lamp TEST held (BATT on): every switch lamp shows lit (the CONFIG row TEST push; screens are not affected). */
const LampTestCtx = createContext(false);
function ToggleArt({ pos, lit }: { pos: 'up' | 'mid' | 'dn'; lit: boolean }) {
  const test = useContext(LampTestCtx);
  return <img className="cjhv-tg cjhv-art" src={toggleSrc(pos, lit || test)} width={44} height={68} alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
/** Wilson's guarded toggle / closed cover, centred on the toggle pivot of its 44x68 box (overflows it; no layout). */
function GuardArt({ color, open, pos, lit: lit0, h }: { color: 'red' | 'black' | 'yellow'; open: boolean; pos?: 'up' | 'mid' | 'dn'; lit?: boolean; h: number }) {
  const test = useContext(LampTestCtx);
  const lit = lit0 || (test && open && pos !== 'dn');
  const w = Math.round((h * 460) / 1040);
  const st = { width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 };
  const img = (src: string, k: string) => <img key={k} className="cjhv-gart cjhv-art" src={src} width={w} height={h} style={st} alt="" aria-hidden="true" draggable={false} decoding="async" />;
  // round 4: a closed gunmetal / yellow guard is its cover over the hinge frame (Wilson: no bare grey blocks)
  if (!open && color !== 'red') return <>{img(guardSrc(color, true, 'dn'), 'f')}{img(guardSrc(color, false), 'c')}</>;
  return img(guardSrc(color, open, pos, lit), 'g');
}
/** Guard art height that draws its toggle + hex at the plain toggle's size (same sheet scale: 1040 / 780 x 68). */
const GUARD_H = 91;
/** Square push key faces (plain push art; pressed on :active), as CSS vars for .cjhv-push / THEMES. */
const sqVars = { '--sq-off': `url(${pushSquareSrc(false)})`, '--sq-on': `url(${pushSquareSrc(true)})` } as CSSProperties;

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
function Tg({ pos, tx, ty, k, lit, guard }: { pos: 'up' | 'mid' | 'dn'; tx: number; ty: number; k: number; lit: boolean; guard?: { open: boolean; h?: number } }) {
  return (
    <span className="cjhv-rtg" style={{ left: tx - 22, top: ty - 34, '--tg-k': k } as CSSProperties}>
      {guard ? <span className="cjhv-gpiv"><GuardArt color="black" open={guard.open} pos={pos} lit={lit} h={guard.h ?? GUARD_H} /></span> : <ToggleArt pos={pos} lit={lit} />}
    </span>
  );
}
const lgAt = (x: number, y: number, w: number, extra?: CSSProperties): CSSProperties => ({ left: x, top: y, width: w, ...extra });
/** Board / 773-left two-target toggle column (up target ON, down target OFF). */
export interface FuelGuardCtl { onGuard: () => void; onSwitch: () => void; guardAria: string; switchAria: string }
function Col({ d, c, g, on, cue, onSet, batt, guard, gctl, k = HV_RAIL_GEO.board.tgK, up = 'ON', dn = 'OFF' }: { d: RailSwDecl; c: RailCol; g: { nameY: number; onY: number; offY: number; upY: number; upH: number; dnY: number; dnH: number; tgY: number }; on: boolean; cue?: boolean; onSet: (on: boolean) => void; batt: boolean; guard?: { open: boolean }; gctl?: FuelGuardCtl; k?: number; up?: string; dn?: string }) {
  const two = d.label.includes('|');
  return (
    <div className="cjhv-col" data-on={on || undefined} data-cue={cue || undefined}>
      {two ? (
        <span className="cjhv-lg cjhv-rname cjhv-rname-2" aria-hidden="true" style={lgAt(c.x, g.nameY - 2, c.w)}>{d.label.split('|')[0]}<br />{d.label.split('|')[1]}</span>
      ) : (
        <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, g.nameY, c.w)}>{d.label}</span>
      )}
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 20, g.onY + (two ? 4 : 0), 40)}>{up}</span>
      <Tg pos={on ? 'up' : 'dn'} tx={c.tx} ty={g.tgY} k={k} lit={on && batt} guard={guard} />
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 20, g.offY, 40)}>{dn}</span>
      {gctl ? (
        // guarded (L / R FUEL): a guard band (lift / close; closing turns the switch off) over a switch band (on / off)
        <>
          <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY, height: 44 }} aria-label={gctl.guardAria} aria-expanded={!!guard?.open} onClick={gctl.onGuard} />
          <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY + 44, height: g.dnY + g.dnH - g.upY - 44 }} aria-label={gctl.switchAria} aria-pressed={on} onClick={gctl.onSwitch} />
        </>
      ) : (
        <>
          <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY, height: g.upH }} aria-label={railSwAria(d, on, 'on')} aria-pressed={on} onClick={() => onSet(true)} />
          <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.dnY, height: g.dnH }} aria-label={railSwAria(d, on, 'off')} aria-pressed={!on} onClick={() => onSet(false)} />
        </>
      )}
    </div>
  );
}
/** Three-position lever (RADAR MX / WX / OFF, SOURCE APU / OFF / AIR CART): up / down step one position. */
function Col3({ name, spoken, c, g, pos, labels, onStep, k, lit }: { name: string; spoken: string; c: RailCol; g: { nameY: number; onY: number; offY: number; upY: number; upH: number; dnY: number; dnH: number; tgY: number }; pos: 'up' | 'mid' | 'dn'; labels: [string, string, string]; onStep: (dir: 1 | -1) => void; k: number; lit: boolean }) {
  const now = labels[pos === 'up' ? 0 : pos === 'mid' ? 1 : 2];
  return (
    <div className="cjhv-col" data-pos={pos}>
      <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, g.nameY, c.w)}>{name}</span>
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 22, g.onY, 44)}>{labels[0]}</span>
      <Tg pos={pos} tx={c.tx} ty={g.tgY} k={k} lit={lit} />
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx + 15, g.tgY - 6, c.x + c.w - c.tx - 15, { textAlign: 'left' })}>{labels[1]}</span>
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.x, g.offY - 1, c.w)}>{labels[2]}</span>
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY, height: g.upH }} aria-label={`${spoken}: up one position, toward ${labels[0]}, now ${now}`} onClick={() => onStep(1)} />
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.dnY, height: g.dnH }} aria-label={`${spoken}: down one position, toward ${labels[2]}, now ${now}`} onClick={() => onStep(-1)} />
    </div>
  );
}
/** Engine START/RUN bulb: dark OFF, amber START, green RUN, with its legend (never colour alone). Steady. */
function Bulb({ state, fuel, cx, cy, r, batt, test }: { state: EngBulb; fuel: boolean; cx: number; cy: number; r: number; lgX?: number; lgY?: number; lgW?: number; batt: boolean; test: boolean }) {
  // round 4: green, lit while that side's FUEL is on (no legend under it); off with BATT off, lit in the lamp test
  const mode = roundMode(batt, test, fuel);
  return <span className="cjhv-bulb" data-state={state} data-mode={mode} role="img" aria-label={`${ENG_BULB_LEGEND[state].toLowerCase()}, fuel ${fuel ? 'on' : 'off'}`} style={{ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, '--lamp': `url(${roundSrc('green', mode)})` } as CSSProperties} />;
}
/** AFTERBURNER art: Wilson's red guard, closed cover or lifted lid with the ARM (up) / SAFE (down) toggle. */
function AbArt({ armed, open, batt, h = GUARD_H }: { armed: boolean; open: boolean; batt: boolean; h?: number }) {
  return (
    <div className="cjhv-ab-well">
      <span className="cjhv-gpiv"><GuardArt color="red" open={open} pos={armed ? 'up' : 'dn'} lit={armed && batt} h={h} /></span>
    </div>
  );
}
/** QUICK START art: striped guard over the START korry (closed, LIFT tag) or lid edge-on + GUARD OPEN + green START. */
/** QUICK START lamp: ready = steady lit (BATT on, engines not running) · running = 1 Hz on / off (steady lit under
 * Reduce Motion) · complete / BATT off = unlit. */
export type QsLamp = 'lit' | 'blink' | 'unlit';
export const qsLampAria = (running: boolean, live: boolean) => (running ? 'Quick start running' : live ? 'Quick start complete' : 'Quick start ready');
function QsArt({ open, lamp, aria, k }: { open: boolean; lamp: QsLamp; aria: string; k: number }) {
  // Wilson, Oct 19 round 2: closed = the gunmetal cover (LIFT tag); lifted = his unguarded neutral switch's plate + hex
  // with the Push Square full lamp in the centre where the toggle would be (ready lit / running 1 Hz / complete unlit)
  const piv = { scale: String(k), transformOrigin: '0 0' } as CSSProperties;
  return (
    <div className="cjhv-qs" data-open={open || undefined}>
      {open ? (
        <>
          <span className="cjhv-gpiv cjhv-qs-art" style={piv}>
            {/* round 4: the lifted yellow guard (like FUEL), the Push Square full lamp over the nut in place of the toggle */}
            <GuardArt color="yellow" open pos="mid" h={GUARD_H} />
            <span className="cjhv-qs-key" data-lamp={lamp} role="img" aria-label={aria} style={{ '--sq': `url(${squareFullSrc(true)})`, '--sq-off': `url(${squareFullSrc(false)})` } as CSSProperties}>
              <span className="cjhv-qs-unlit" aria-hidden="true" />
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="cjhv-gpiv cjhv-qs-art" style={piv}><GuardArt color="yellow" open={false} h={GUARD_H} /></span>
          <span className="rf-sr-only" role="img" aria-label={aria} />
        </>
      )}
    </div>
  );
}
/** GEN (no switch since Oct 19): one red lamp per engine (Wilson, Oct 19 round 2): LIT while that engine runs and its
 * generator is online; POWERED (dim) with BATT on and the engine not running; OFF with BATT off; lit in the lamp test. */
function GenLamps({ x, w, y, r, bulb, apu, batt, test, nameY }: { x: number; w: number; y: number; r: number; bulb: { L: EngBulb; R: EngBulb }; apu: boolean; batt: boolean; test: boolean; nameY: number }) {
  const cx = x + w / 2;
  // L · APU · R (Wilson, Oct 19 round 3): three red lamps, same art and size, evenly spaced across the module
  const d = Math.min(24, (w - 2 * r - 4) / 2);
  return (
    <div className="cjhv-col cjhv-gen" role="group" aria-label="Generators">
      <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(x, nameY, w)}>GEN</span>
      {(['L', 'APU', 'R'] as const).map((s, i) => {
        const online = s === 'APU' ? apu : bulb[s] === 'run';
        const mode = roundMode(batt, test, online);
        const lx = cx + (i - 1) * d;
        return (
          <span key={s}>
            <span className="cjhv-bulb" data-mode={mode} data-gen={s} role="img" aria-label={`${s === 'APU' ? 'A P U' : s} generator, ${online ? 'online' : 'offline'}`} style={{ left: lx - r, top: y - r, width: 2 * r, height: 2 * r, '--lamp': `url(${roundSrc('red', mode)})` } as CSSProperties} />
            <span className="cjhv-lg cjhv-bulb-lg" aria-hidden="true" style={lgAt(lx - 12, y + r + 4, 24)}>{s}</span>
          </span>
        );
      })}
    </div>
  );
}

export interface HeroRailProps {
  layout: HeroLayout;
  gps: CjGps;
  /** GPS ACQ sequence (NAV on: yellow → pulse → green) and amber caution (useGpsAcqSeq / gpsCaution). */
  gpsSeq?: CjGpsSeq;
  gpsCaution?: boolean;
  /** APU running (on and spooled): the APU GEN lamp. */
  apuRun?: boolean;
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
  /** a FUEL guard closed over an ON switch: that pump off (guard-close foley), the engine spools down */
  onFuelGuardOff: (id: 'fuelL' | 'fuelR') => void;
  holdRev: boolean;
  onHoldRev: (on: boolean) => void;
  running: boolean;
  onShutdown: () => void;
  say: (t: string) => void;
  /** first BATT-on lamp test (2 s): every round lamp lit */
  lampTest: boolean;
  /** QUICK START sequence running (CjColdStart csQuickSteps), and the FUEL guards it lifted */
  qsRunning: boolean;
  qsLift: { fuelL?: boolean; fuelR?: boolean };
}

const SRC_LABELS: [string, string, string] = ['APU', 'OFF', 'AIR CART'];
const SRC_ORDER: SourcePos[] = ['dn', 'mid', 'up'];

export function HeroRail(p: HeroRailProps) {
  const narrow = p.layout === 'window';
  const G = HV_RAIL_GEO.board;
  const Z = HV_RAIL_773.zones;
  const bmod = Object.fromEntries(G.mods.map((m) => [m.id, m.w])) as Record<string, number>;
  // EMER STOP moved to the top plate (Oct 19 round 2): its width stretches the switch modules in x (RailMod.base)
  const bf = Object.fromEntries(G.mods.map((m) => [m.id, m.w / (m.base ?? m.w)])) as Record<string, number>;
  const sc = (c: RailCol, f: number): RailCol => ({ x: c.x * f, w: c.w * f, tx: c.tx * f });
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
  const [revHeld, setRevHeld] = useState(false);
  const hold = (on: boolean) => {
    if (holding.current === on) return;
    holding.current = on;
    p.onHoldRev(on);
  };
  // QUICK START two-step guard (qsTap): tap 1 lifts, tap 2 on START starts; shuts after a start, on a tap on the
  // raised guard, or HV_GUARD_CLOSE_MS after a lift with no second tap. Instant lid (this rail has no motion at all).
  const [qsUp, setQsUp] = useState(false);
  // the lid stays up while the sequence runs, so the START lamp's 1 Hz run indication is visible
  const qsOpen = (qsUp && !p.live) || p.qsRunning;
  const qsLamp: QsLamp = p.lampTest && p.rail.on.batt ? 'lit' : p.qsRunning ? 'blink' : !p.rail.on.batt || p.live ? 'unlit' : 'lit';
  useEffect(() => {
    if (!qsUp) return;
    const t = setTimeout(() => setQsUp(false), HV_GUARD_CLOSE_MS);
    return () => clearTimeout(t);
  }, [qsUp]);
  const qsPress = (target: QsTarget) => {
    if (p.qsRunning) return p.say('Quick start running');
    const r = qsTap(qsOpen, target, p.live);
    setQsUp(r.open);
    if (r.start) p.onQuickStart();
    if (r.say) p.say(r.say);
  };
  const batt = p.rail.on.batt;
  // L / R FUEL under gunmetal guards (Wilson, Oct 19; closable since round 2). Closed: any tap lifts the lid. Lifted:
  // the switch band flips ON / OFF; a tap on the lid closes it, and closing over ON turns that pump OFF (guard-close
  // foley; the engine spools down). Opening it again allows ON. An idle lifted lid over OFF closes after
  // HV_GUARD_CLOSE_MS. A FUEL switch that is ON always shows its lid lifted (a closed guard holds it OFF).
  const [fuelLift, setFuelLift] = useState<{ fuelL: boolean; fuelR: boolean }>({ fuelL: false, fuelR: false });
  const fuelOpen = (id: 'fuelL' | 'fuelR') => fuelLift[id] || p.rail.on[id] || !!p.qsLift[id];
  useEffect(() => {
    const idle = (['fuelL', 'fuelR'] as const).filter((id) => fuelLift[id] && !p.rail.on[id]);
    if (!idle.length) return;
    const t = setTimeout(() => setFuelLift((f) => ({ ...f, ...Object.fromEntries(idle.map((id) => [id, false])) })), HV_GUARD_CLOSE_MS);
    return () => clearTimeout(t);
  }, [fuelLift, p.rail.on.fuelL, p.rail.on.fuelR]);
  const fuelLiftUp = (id: 'fuelL' | 'fuelR') => {
    setFuelLift((f) => ({ ...f, [id]: true }));
    p.say(`${railSw(id).spoken} guard lifted`);
  };
  const fuelClose = (id: 'fuelL' | 'fuelR') => {
    const on = p.rail.on[id];
    setFuelLift((f) => ({ ...f, [id]: false }));
    if (on) p.onFuelGuardOff(id);
    p.say(`${railSw(id).spoken} guard closed${on ? ', off' : ''}`);
  };
  const fuelGuard = (id: 'fuelL' | 'fuelR') => (fuelOpen(id) ? fuelClose(id) : fuelLiftUp(id));
  const fuelFlip = (id: 'fuelL' | 'fuelR') => {
    if (!fuelOpen(id)) return fuelLiftUp(id);
    setFuelLift((f) => ({ ...f, [id]: true }));
    p.onSwitch(id, !p.rail.on[id]);
  };
  const fuelCtl = (id: 'fuelL' | 'fuelR'): FuelGuardCtl => {
    const d = railSw(id);
    const open = fuelOpen(id);
    const on = p.rail.on[id];
    return {
      onGuard: () => fuelGuard(id),
      onSwitch: () => fuelFlip(id),
      guardAria: open ? `${d.spoken} guard: open, tap to close${on ? ' and turn off' : ''}` : `${d.spoken} guard: closed, tap to lift`,
      switchAria: open ? `${d.spoken}: ${on ? 'on, tap for off' : 'off, tap for on'}` : `${d.spoken}: off, guard closed. Tap to lift the guard`,
    };
  };
  const sw = (id: RailSwId) => {
    const fuel = id === 'fuelL' || id === 'fuelR';
    return {
      d: railSw(id), on: p.rail.on[id], cue: p.cue === id, batt,
      guard: fuel ? { open: fuelOpen(id) } : undefined,
      gctl: fuel ? fuelCtl(id) : undefined,
      onSet: (on: boolean) => p.onSwitch(id, on),
    };
  };

  const qsHits = (x: number, w: number, pressY: number) => (
    <>
      <button type="button" className="cjhv-hit" style={{ left: x, width: w, top: 18, height: 44 }} aria-label={qsAria('guard', qsOpen, p.live)} aria-expanded={qsOpen} aria-disabled={p.live || undefined} onClick={() => qsPress('guard')} />
      <button type="button" className="cjhv-hit" style={{ left: x, width: w, top: pressY, height: 44 }} aria-label={qsAria('start', qsOpen, p.live)} aria-disabled={!qsOpen || undefined} onClick={() => qsPress('start')} />
    </>
  );
  const qs = (
    <Mod kind="qs" w={narrow ? Z.qs : bmod.qs} title="QUICK START" label="Quick start">
      <QsArt open={qsOpen} lamp={qsLamp} aria={qsLampAria(p.qsRunning, p.live)} k={narrow ? HV_RAIL_773.tgK : G.tgK} />
      {narrow ? qsHits(3, 64, 64) : qsHits(3, 94, 62)}
    </Mod>
  );
  const push = (
    <Mod kind="push" w={narrow ? Z.push : bmod.push} label="Engine">
      <button
        type="button"
        className="cjhv-push cjhv-lamp-push"
        data-lit={((revHeld || p.lampTest) && batt) || undefined}
        style={{ '--sq-off': `url(${batt ? squareFullSrc(false) : darkSrc('full')})`, '--sq-on': `url(${squareFullSrc(true)})` } as CSSProperties}
        aria-label={p.holdRev ? 'Hold to rev' : 'Hold to rev, engine not running'}
        aria-disabled={!p.holdRev || undefined}
        onPointerDown={(e) => {
          if (!p.holdRev) return p.say('Hold to rev: start the engines first');
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setRevHeld(true);
          hold(true);
        }}
        onPointerUp={() => { setRevHeld(false); hold(false); }}
        onPointerCancel={() => { setRevHeld(false); hold(false); }}
        onLostPointerCapture={() => { setRevHeld(false); hold(false); }}
      >
        <span className="cjhv-lg">HOLD</span>
        <span className="cjhv-lg">TO REV</span>
      </button>
      <button type="button" className="cjhv-push cjhv-lamp-push cjhv-sd-push" data-lit={((p.running || p.lampTest) && batt) || undefined} style={{ '--sq-off': `url(${batt ? squareFullRedSrc(false) : darkSrc('fullRed')})`, '--sq-on': `url(${squareFullRedSrc(true)})` } as CSSProperties} aria-label={p.running ? 'Shutdown' : 'Shutdown, engine already off'} aria-disabled={!p.running || undefined} onClick={() => (p.running ? p.onShutdown() : p.say('Engine already off'))}>
        {narrow ? <><span className="cjhv-lg">SHUT</span><span className="cjhv-lg">DOWN</span></> : <span className="cjhv-lg">SHUTDOWN</span>}
      </button>
    </Mod>
  );
  // GPS · NAV (Wilson, Oct 19 round 3): Wilson's small lamps at the GEN size (ACQ: yellow 1 s → green pulse → steady
  // green after NAV on; CAUT amber: GPS error / no fix / stale while NAV is on) and the NAV switch moved here from ELEC
  const seq: CjGpsSeq = p.gpsSeq ?? 'off';
  const gpsLamp = (key: string, label: string, color: 'amber' | 'green', on: boolean, cx: number, cy: number, r: number, pulse: boolean, aria: string) => {
    const mode = roundMode(batt, p.lampTest, on);
    return (
      <span key={key}>
        <span className="cjhv-bulb cjhv-gps-lamp" data-mode={mode} data-pulse={(pulse && mode === 'lit' && !p.lampTest) || undefined} role="img" aria-label={aria} style={{ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, '--lamp': `url(${roundSrc(color, mode)})` } as CSSProperties} />
        <span className="cjhv-lg cjhv-bulb-lg cjhv-gps-lg" aria-hidden="true" style={lgAt(cx - 18, cy + r + 4, 36)}>{label}</span>
      </span>
    );
  };
  const gpsW = narrow ? Z.gps : bmod.gps;
  const lx = narrow ? 19 : 23, lr = narrow ? 7 : 8;
  const acqOn = seq !== 'off';
  const acqAria = seq === 'off' ? 'GPS acquire, off' : seq === 'green' ? 'GPS acquired' : 'GPS acquiring';
  const gps = (
    <Mod kind="gpsnav" w={gpsW} label="GPS and nav">
      <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(lx - 18, narrow ? HV_RAIL_773.left.nameY : G.nameY, 36)}>GPS</span>
      {gpsLamp('acq', 'ACQ', seq === 'yellow' ? 'amber' : 'green', acqOn, lx, narrow ? 46 : 48, lr, seq === 'pulse', acqAria)}
      {gpsLamp('caut', 'CAUT', 'amber', !!p.gpsCaution && acqOn, lx, narrow ? 92 : 90, lr, false, p.gpsCaution && acqOn ? 'GPS caution, lit' : 'GPS caution, off')}
      {narrow ? <Col {...sw('nav')} c={HV_RAIL_773.left.nav} g={HV_RAIL_773.left} k={HV_RAIL_773.tgK} /> : <Col {...sw('nav')} c={G.col.nav!} g={G} />}
    </Mod>
  );

  if (narrow) {
    const L = HV_RAIL_773.left;
    const fm = Z.mid / HV_RAIL_773.midBase;
    const M = Object.fromEntries(Object.entries(HV_RAIL_773.mid).map(([id, c]) => [id, { ...c, x: c.x * fm, w: c.w * fm, tx: c.tx * fm }])) as typeof HV_RAIL_773.mid;
    const k = HV_RAIL_773.tgK;
    const flip = (id: RailSwId) => {
      const s = sw(id);
      const c = M[id];
      const ty = c.y + 38;
      const fuel = id === 'fuelL' || id === 'fuelR';
      return (
        <div key={id} className="cjhv-col" data-on={s.on || undefined} data-cue={s.cue || undefined}>
          <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, c.y + 3, c.w)}>{s.d.short}</span>
          <Tg pos={s.on ? 'up' : 'dn'} tx={c.tx} ty={ty} k={k} lit={s.on && batt} guard={s.guard} />
          {fuel ? (
            // one target (two taps, like AFTERBURNER): closed → lift · open + OFF → ON · ON → OFF and close the guard
            <button type="button" className="cjhv-hit" style={px({ x: c.x, y: c.y, w: c.w, h: c.h })} aria-label={!s.guard!.open ? `${s.d.spoken}: off, guard closed. Tap to lift the guard` : s.on ? `${s.d.spoken}: on. Tap for off and close the guard` : `${s.d.spoken}: off, guard open. Tap for on`} aria-pressed={s.on} aria-expanded={s.guard!.open} onClick={() => (!s.guard!.open ? fuelLiftUp(id) : s.on ? fuelClose(id) : fuelFlip(id))} />
          ) : (
            <button type="button" className="cjhv-hit" style={px({ x: c.x, y: c.y, w: c.w, h: c.h })} aria-label={railFlipAria(s.d, s.on)} aria-pressed={s.on} onClick={() => s.onSet(!s.on)} />
          )}
        </div>
      );
    };
    const ab = M.ab;
    return (
      <LampTestCtx.Provider value={p.lampTest && batt}><div className="cjhv-rail" data-rf-layout="window" role="group" aria-label="Start rail">
        <ArtDefs />
        {gps}
        <Mod kind="radar" w={Z.radar} label={`Radar, ${RADAR_SPOKEN[p.radar]}`}>
          <Col3 name="RADAR" spoken="Radar" c={L.radar} g={L} pos={p.radar} labels={['MX', 'WX', 'OFF']} onStep={radarTap} k={k} lit={batt && p.radar !== 'dn'} />
        </Mod>
        <Mod kind="air" w={Z.air} label="Start air">
          <Col3 name="SOURCE" spoken="Start source" c={L.source} g={L} pos={p.rail.source} labels={SRC_LABELS} onStep={srcStep} k={k} lit={batt && p.rail.source !== 'mid'} />
          <Col d={railSw('xbleed')} c={L.xbleed} g={L} k={k} on={p.rail.on.xbleed} cue={p.cue === 'xbleed'} batt={batt} onSet={(on) => p.onSwitch('xbleed', on)} />
        </Mod>
        <div className="cjhv-zone" style={{ width: Z.mid }} role="group" aria-label="Start switches">
          {HV_RAIL_773.midMods.map((m, i) => <span key={i} className="cjhv-mod cjhv-submod" aria-hidden="true" style={px({ ...m, x: m.x * fm, w: m.w * fm })} />)}
          {flip('batt')}
          <div className="cjhv-col cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
            <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(217.3 * fm, 3, 115.7 * fm, { letterSpacing: 0 })}>AFTERBURNER</span>
            <span className="cjhv-ab-k" style={{ left: ab.tx - 22, top: 48 - 33, '--tg-k': k } as CSSProperties}><AbArt armed={p.armed} open={p.guardOpen} batt={batt} /></span>
            <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(ab.tx + 18, 24, 35, { textAlign: 'left' })}>ARM</span>
            <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(ab.tx + 18, 46, 35, { textAlign: 'left' })}>SAFE</span>
            <button type="button" className="cjhv-hit" style={px({ x: ab.x, y: ab.y, w: ab.w, h: ab.h })} aria-label={abAria(p.armed, p.guardOpen, 'one')} aria-pressed={p.armed} aria-expanded={p.guardOpen} onClick={() => p.onAb('one')} />
          </div>
          <GenLamps x={M.gen.x} w={M.gen.w} y={M.gen.y + 36} r={7} nameY={M.gen.y + 3} bulb={p.rail.bulb} apu={!!p.apuRun} batt={batt} test={p.lampTest} />
          {flip('fuelL')}
          {flip('ignL')}
          {flip('engL')}
          <Bulb state={p.rail.bulb.L} fuel={p.rail.on.fuelL} {...HV_RAIL_773.bulbs.L} cx={HV_RAIL_773.bulbs.L.cx * fm} lgX={116 * fm} lgY={112} lgW={36} batt={batt} test={p.lampTest} />
          {flip('fuelR')}
          {flip('ignR')}
          {flip('engR')}
          <Bulb state={p.rail.bulb.R} fuel={p.rail.on.fuelR} {...HV_RAIL_773.bulbs.R} cx={HV_RAIL_773.bulbs.R.cx * fm} lgX={293 * fm} lgY={112} lgW={36} batt={batt} test={p.lampTest} />
        </div>
        {qs}
        {push}
      </div></LampTestCtx.Provider>
    );
  }

  const C0 = G.col;
  const modOf: Partial<Record<RailPart, string>> = { batt: 'air', source: 'air', xbleed: 'air', seatbelt: 'air', fuelL: 'engL', ignL: 'engL', engL: 'engL', fuelR: 'engR', ignR: 'engR', engR: 'engR', gen: 'elec', nav: 'elec' };
  const C = Object.fromEntries(Object.entries(C0).map(([id, c]) => [id, sc(c!, bf[modOf[id as RailPart] ?? ''] ?? 1)])) as typeof C0;
  const titles = (id: string) =>
    G.mods.find((m) => m.id === id)?.titles?.map((t) => <span key={t.t} className="cjhv-lg cjhv-gtitle" aria-hidden="true" style={lgAt(t.x * bf[id], G.titleY, t.w * bf[id])}>{t.t}</span>);
  const divs = (id: string) => G.mods.find((m) => m.id === id)?.dividers?.map((x) => <span key={x} className="cjhv-div" aria-hidden="true" style={{ left: x * bf[id] }} />);
  return (
    <LampTestCtx.Provider value={p.lampTest && batt}><div className="cjhv-rail" data-rf-layout="board" role="group" aria-label="Start rail">
      <ArtDefs />
      {gps}
      <Mod kind="radar" w={bmod.radar} label={`Radar, ${RADAR_SPOKEN[p.radar]}`}>
        <Col3 name="RADAR" spoken="Radar" c={C.radar!} g={G} pos={p.radar} labels={['MX', 'WX', 'OFF']} onStep={radarTap} k={G.tgK} lit={batt && p.radar !== 'dn'} />
      </Mod>
      <Mod kind="ab" w={bmod.ab} title="AFTERBURNER" label="Afterburner master arm">
        <div className="cjhv-col cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
          <span className="cjhv-ab-k" style={{ left: C.ab!.tx - 22, top: 66 - 33, '--tg-k': G.tgK } as CSSProperties}><AbArt armed={p.armed} open={p.guardOpen} batt={batt} /></span>
          <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(52, 40, 34, { textAlign: 'left' })}>ARM</span>
          <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(52, 88, 34, { textAlign: 'left' })}>SAFE</span>
          <button type="button" className="cjhv-hit" style={{ left: 4, width: 80, top: 18, height: 44 }} aria-label={abAria(p.armed, p.guardOpen, 'guard')} aria-expanded={p.guardOpen} onClick={() => p.onAb('guard')} />
          <button type="button" className="cjhv-hit" style={{ left: 4, width: 80, top: 62, height: 52 }} aria-label={abAria(p.armed, p.guardOpen, 'switch')} aria-pressed={p.armed} onClick={() => p.onAb('switch')} />
        </div>
      </Mod>
      <Mod kind="air" w={bmod.air} label="Power, start air">
        {divs('air')}
        <Col {...sw('batt')} c={C.batt!} g={G} />
        <Col3 name="SOURCE" spoken="Start source" c={C.source!} g={G} pos={p.rail.source} labels={SRC_LABELS} onStep={srcStep} k={G.tgK} lit={batt && p.rail.source !== 'mid'} />
        <Col {...sw('xbleed')} c={C.xbleed!} g={G} />
        {titles('air')}
      </Mod>
      <Mod kind="elec" w={bmod.elec} label="Electrics">
        <GenLamps x={C.gen!.x} w={C.gen!.w} y={58} r={8} nameY={G.nameY} bulb={p.rail.bulb} apu={!!p.apuRun} batt={batt} test={p.lampTest} />
        {titles('elec')}
      </Mod>
      {(['L', 'R'] as const).map((s) => (
        <Mod key={s} kind="eng" w={bmod[`eng${s}`]} label={`${s} engine`}>
          <Col {...sw(`fuel${s}`)} c={C[`fuel${s}`]!} g={G} />
          <Col {...sw(`ign${s}`)} c={C[`ign${s}`]!} g={G} />
          <Col {...sw(`eng${s}`)} c={C[`eng${s}`]!} g={G} />
          <Bulb state={p.rail.bulb[s]} fuel={p.rail.on[`fuel${s}`]} cx={152 * bf[`eng${s}`]} cy={58} r={9} lgX={134 * bf[`eng${s}`]} lgY={70} lgW={36} batt={batt} test={p.lampTest} />
          {titles(`eng${s}`)}
        </Mod>
      ))}
      {qs}
      {push}
    </div></LampTestCtx.Provider>
  );
}
