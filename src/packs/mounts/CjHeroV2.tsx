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
import { guardSrc, masterSrc, pushSquareSrc, roundMode, roundSrc, squareFullSrc, squareThirdSrc, toggleSrc } from './cjArt';
import './cj-hero-v2.css';

/* ------------------------------------------------------------------ Korry split cap (upper-board keys) */

/** Edge keys that toggle a state (lit legend strip: Push Square 1/3 lamp); every other key is a plain Push Square
 * (unpressed, pressed while held). */
const KORRY_TOGGLE = new Set(['orient', 'mode', 'wx', 'drive']);
export function KorryCap({ cap, id }: { cap: SplitCap | null; id?: string }) {
  if (!cap) return null;
  const toggle = !!id && KORRY_TOGGLE.has(id);
  const art: CSSProperties = (toggle
    ? { '--sq': `url(${squareThirdSrc(cap.lit)})` }
    : { '--sq': `url(${pushSquareSrc(false)})`, '--sq-on': `url(${pushSquareSrc(true)})` }) as Record<string, string>;
  return (
    <span className="cjhv-korry" data-lit={cap.lit || undefined} data-push={toggle ? undefined : true} data-single={cap.bottom ? undefined : true} aria-hidden="true" style={art}>
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
  /** BATT on: switches can light, round lamps are powered */
  batt: boolean;
  /** first BATT-on lamp test (2 s): every round lamp lit */
  lampTest: boolean;
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
        style={{ left: r.x + g.masterHit.dx, top: r.y + g.masterHit.dy, width: g.masterHit.w, height: g.masterHit.h, backgroundImage: `url(${masterSrc(id, lit, p.layout)})` }} aria-label={lampAria(d, lit)} onClick={() => p.onClear(id)}>
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
      <div className="cjhv-cap cjhv-top-ab" data-color="amber" data-lit={p.armed || undefined} role="img" aria-label={abArmedAria(p.armed, p.launch)} style={{ ...px(g.ab), '--sq': `url(${squareFullSrc(p.armed)})` } as CSSProperties}>
        <span className="cjhv-lg">AB</span>
        <span className="cjhv-lg">{p.launch ? 'LAUNCH' : 'ARMED'}</span>
      </div>
      <button type="button" className="cjhv-cap cjhv-top-themes" aria-label="Themes: opens the theme picker" style={{ ...px(g.themesHit), ...sqVars }} onClick={p.onThemes}>
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

/** Wilson's hex toggle (cjArt.ts): up / mid / dn, lit = on and BATT on. Fills the old 44x68 art box (nut centred). */
function ToggleArt({ pos, lit }: { pos: 'up' | 'mid' | 'dn'; lit: boolean }) {
  return <img className="cjhv-tg cjhv-art" src={toggleSrc(pos, lit)} width={44} height={68} alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
/** Wilson's guarded toggle / closed cover, centred on the toggle pivot of its 44x68 box (overflows it; no layout). */
function GuardArt({ color, open, pos, lit, h }: { color: 'red' | 'black'; open: boolean; pos?: 'up' | 'mid' | 'dn'; lit?: boolean; h: number }) {
  const w = Math.round((h * 460) / 1040);
  return <img className="cjhv-gart cjhv-art" src={guardSrc(color, open, pos, lit)} width={w} height={h} style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 }} alt="" aria-hidden="true" draggable={false} decoding="async" />;
}
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
      {guard ? <span className="cjhv-gpiv"><GuardArt color="black" open={guard.open} pos={pos} lit={lit} h={guard.h ?? 88} /></span> : <ToggleArt pos={pos} lit={lit} />}
    </span>
  );
}
const lgAt = (x: number, y: number, w: number, extra?: CSSProperties): CSSProperties => ({ left: x, top: y, width: w, ...extra });
/** Board / 773-left two-target toggle column (up target ON, down target OFF). */
function Col({ d, c, g, on, cue, onSet, batt, guard, up = 'ON', dn = 'OFF' }: { d: RailSwDecl; c: RailCol; g: { nameY: number; onY: number; offY: number; upY: number; upH: number; dnY: number; dnH: number; tgY: number }; on: boolean; cue?: boolean; onSet: (on: boolean) => void; batt: boolean; guard?: { open: boolean }; up?: string; dn?: string }) {
  const two = d.label.includes('|');
  return (
    <div className="cjhv-col" data-on={on || undefined} data-cue={cue || undefined}>
      {two ? (
        <span className="cjhv-lg cjhv-rname cjhv-rname-2" aria-hidden="true" style={lgAt(c.x, g.nameY - 2, c.w)}>{d.label.split('|')[0]}<br />{d.label.split('|')[1]}</span>
      ) : (
        <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(c.x, g.nameY, c.w)}>{d.label}</span>
      )}
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 20, g.onY + (two ? 4 : 0), 40)}>{up}</span>
      <Tg pos={on ? 'up' : 'dn'} tx={c.tx} ty={g.tgY} k={HV_RAIL_GEO.board.tgK} lit={on && batt} guard={guard} />
      <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(c.tx - 20, g.offY, 40)}>{dn}</span>
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.upY, height: g.upH }} aria-label={railSwAria(d, on, 'on')} aria-pressed={on} onClick={() => onSet(true)} />
      <button type="button" className="cjhv-hit" style={{ left: c.x, width: c.w, top: g.dnY, height: g.dnH }} aria-label={railSwAria(d, on, 'off')} aria-pressed={!on} onClick={() => onSet(false)} />
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
function Bulb({ state, cx, cy, r, lgX, lgY, lgW, batt, test }: { state: EngBulb; cx: number; cy: number; r: number; lgX: number; lgY: number; lgW: number; batt: boolean; test: boolean }) {
  // amber while START, green for RUN (and its dark / powered states); off with BATT off, all lit in the lamp test
  const mode = roundMode(batt, test, state !== 'off');
  const color = state === 'start' ? 'amber' : 'green';
  return (
    <>
      <span className="cjhv-bulb" data-state={state} data-mode={mode} aria-hidden="true" style={{ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r, '--lamp': `url(${roundSrc(color, mode)})` } as CSSProperties} />
      <span className="cjhv-lg cjhv-bulb-lg" data-state={state} aria-hidden="true" style={lgAt(lgX, lgY, lgW)}>{ENG_BULB_LEGEND[state]}</span>
    </>
  );
}
/** AFTERBURNER art: Wilson's red guard, closed cover or lifted lid with the ARM (up) / SAFE (down) toggle. */
function AbArt({ armed, open, batt, h = 96 }: { armed: boolean; open: boolean; batt: boolean; h?: number }) {
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
function QsArt({ open, lamp, aria }: { open: boolean; lamp: QsLamp; aria: string }) {
  // Wilson's gunmetal guard: the closed cover (LIFT tag), or lifted: the START key (Push Square full lamp) under the lid
  return (
    <div className="cjhv-qs" data-open={open || undefined}>
      {open ? (
        <>
          <span className="cjhv-qs-key" data-lamp={lamp} role="img" aria-label={aria} style={{ '--sq': `url(${squareFullSrc(true)})`, '--sq-off': `url(${squareFullSrc(false)})` } as CSSProperties}>
            <span className="cjhv-qs-unlit" aria-hidden="true" />
            <span className="cjhv-lg" aria-hidden="true">START</span>
          </span>
          <span className="cjhv-qs-lid" aria-hidden="true" />
          <span className="cjhv-lg cjhv-qs-open" aria-hidden="true">GUARD OPEN</span>
        </>
      ) : (
        <>
          <span className="cjhv-gpiv cjhv-qs-art"><GuardArt color="black" open={false} h={78} /></span>
          <span className="cjhv-qs-tag" aria-hidden="true">LIFT ▲</span>
          <span className="rf-sr-only" role="img" aria-label={aria} />
        </>
      )}
    </div>
  );
}
/** GEN (no switch since Oct 19): one amber lamp per engine, lit while that generator is offline (BATT on, engine
 * not at RUN), dark once online; off with BATT off; lit in the first-BATT lamp test. */
function GenLamps({ x, w, y, r, bulb, batt, test, nameY }: { x: number; w: number; y: number; r: number; bulb: { L: EngBulb; R: EngBulb }; batt: boolean; test: boolean; nameY: number }) {
  const cx = x + w / 2;
  return (
    <div className="cjhv-col cjhv-gen" role="group" aria-label="Generators">
      <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(x, nameY, w)}>GEN</span>
      {(['L', 'R'] as const).map((s, i) => {
        const offline = bulb[s] !== 'run';
        const mode = !batt ? 'off' : test || offline ? 'lit' : 'off';
        const lx = cx + (i ? 11 : -11);
        return (
          <span key={s}>
            <span className="cjhv-bulb" data-mode={mode} role="img" aria-label={`${s} generator, ${offline ? 'offline' : 'online'}`} style={{ left: lx - r, top: y - r, width: 2 * r, height: 2 * r, '--lamp': `url(${roundSrc('amber', mode)})` } as CSSProperties} />
            <span className="cjhv-lg cjhv-bulb-lg" aria-hidden="true" style={lgAt(lx - 10, y + r + 4, 20)}>{s}</span>
          </span>
        );
      })}
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
  // the lid stays up while the sequence runs, so the START lamp's 1 Hz run indication is visible
  const qsOpen = (qsUp && !p.live) || p.qsRunning;
  const qsLamp: QsLamp = p.qsRunning ? 'blink' : !p.rail.on.batt || p.live ? 'unlit' : 'lit';
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
  // L / R FUEL sit under gunmetal guards (Wilson, Oct 19). Closed: a tap lifts the lid (no switch change). Lifted:
  // up = ON, down = OFF; down on an OFF switch closes the lid; an idle lifted lid over OFF closes after
  // HV_GUARD_CLOSE_MS. A FUEL switch that is ON always shows its lid lifted (closing a guard turns its switch off).
  const [fuelLift, setFuelLift] = useState<{ fuelL: boolean; fuelR: boolean }>({ fuelL: false, fuelR: false });
  const fuelOpen = (id: 'fuelL' | 'fuelR') => fuelLift[id] || p.rail.on[id] || !!p.qsLift[id];
  useEffect(() => {
    const idle = (['fuelL', 'fuelR'] as const).filter((id) => fuelLift[id] && !p.rail.on[id]);
    if (!idle.length) return;
    const t = setTimeout(() => setFuelLift((f) => ({ ...f, ...Object.fromEntries(idle.map((id) => [id, false])) })), HV_GUARD_CLOSE_MS);
    return () => clearTimeout(t);
  }, [fuelLift, p.rail.on.fuelL, p.rail.on.fuelR]);
  const fuelSet = (id: 'fuelL' | 'fuelR', on: boolean, flip: boolean) => {
    const d = railSw(id);
    if (!fuelOpen(id)) {
      setFuelLift((f) => ({ ...f, [id]: true }));
      return p.say(`${d.spoken} guard lifted`);
    }
    if (!on && !p.rail.on[id] && !flip) {
      setFuelLift((f) => ({ ...f, [id]: false }));
      return p.say(`${d.spoken} guard closed`);
    }
    setFuelLift((f) => ({ ...f, [id]: true }));
    p.onSwitch(id, on);
  };
  const sw = (id: RailSwId) => {
    const fuel = id === 'fuelL' || id === 'fuelR';
    return {
      d: railSw(id), on: p.rail.on[id], cue: p.cue === id, batt,
      guard: fuel ? { open: fuelOpen(id) } : undefined,
      onSet: (on: boolean) => (fuel ? fuelSet(id, on, false) : p.onSwitch(id, on)),
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
      <QsArt open={qsOpen} lamp={qsLamp} aria={qsLampAria(p.qsRunning, p.live)} />
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
        style={sqVars}
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
      <button type="button" className="cjhv-push" style={sqVars} aria-label={p.running ? 'Shutdown' : 'Shutdown, engine already off'} aria-disabled={!p.running || undefined} onClick={() => (p.running ? p.onShutdown() : p.say('Engine already off'))}>
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
          <Tg pos={s.on ? 'up' : 'dn'} tx={c.tx} ty={ty} k={k} lit={s.on && batt} guard={s.guard && { ...s.guard, h: 72 }} />
          <button type="button" className="cjhv-hit" style={px({ x: c.x, y: c.y, w: c.w, h: c.h })} aria-label={railFlipAria(s.d, s.on)} aria-pressed={s.on} onClick={() => (id === 'fuelL' || id === 'fuelR' ? fuelSet(id, !s.on, true) : s.onSet(!s.on))} />
        </div>
      );
    };
    const ab = M.ab;
    return (
      <div className="cjhv-rail" data-rf-layout="window" role="group" aria-label="Start rail">
        <ArtDefs />
        {gps}
        <Mod kind="radar" w={Z.radar} label={`Radar, ${RADAR_SPOKEN[p.radar]}`}>
          <Col3 name="RADAR" spoken="Radar" c={L.radar} g={L} pos={p.radar} labels={['MX', 'WX', 'OFF']} onStep={radarTap} k={1} lit={batt && p.radar !== 'dn'} />
        </Mod>
        <Mod kind="air" w={Z.air} label="Start air">
          <Col3 name="SOURCE" spoken="Start source" c={L.source} g={L} pos={p.rail.source} labels={SRC_LABELS} onStep={srcStep} k={1} lit={batt && p.rail.source !== 'mid'} />
          <Col d={railSw('xbleed')} c={L.xbleed} g={L} on={p.rail.on.xbleed} cue={p.cue === 'xbleed'} batt={batt} onSet={(on) => p.onSwitch('xbleed', on)} />
        </Mod>
        <div className="cjhv-zone" style={{ width: Z.mid }} role="group" aria-label="Start switches">
          {HV_RAIL_773.midMods.map((m, i) => <span key={i} className="cjhv-mod cjhv-submod" aria-hidden="true" style={px(m)} />)}
          {flip('batt')}
          {flip('seatbelt')}
          <div className="cjhv-col cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
            <span className="cjhv-lg cjhv-rname" aria-hidden="true" style={lgAt(161.3, 3, 70, { letterSpacing: 0 })}>AFTERBURNER</span>
            <span className="cjhv-ab-k" style={{ left: ab.tx - 22, top: 48 - 33, '--tg-k': 0.7 } as CSSProperties}><AbArt armed={p.armed} open={p.guardOpen} batt={batt} h={74} /></span>
            <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(196.3, 24, 35, { textAlign: 'left' })}>ARM</span>
            <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(196.3, 46, 35, { textAlign: 'left' })}>SAFE</span>
            <button type="button" className="cjhv-hit" style={px({ x: ab.x, y: ab.y, w: ab.w, h: ab.h })} aria-label={abAria(p.armed, p.guardOpen, 'one')} aria-pressed={p.armed} aria-expanded={p.guardOpen} onClick={() => p.onAb('one')} />
          </div>
          <GenLamps x={M.gen.x} w={M.gen.w} y={M.gen.y + 36} r={7} nameY={M.gen.y + 3} bulb={p.rail.bulb} batt={batt} test={p.lampTest} />
          {flip('nav')}
          {flip('fuelL')}
          {flip('ignL')}
          {flip('engL')}
          <Bulb state={p.rail.bulb.L} {...HV_RAIL_773.bulbs.L} lgX={116} lgY={112} lgW={36} batt={batt} test={p.lampTest} />
          {flip('fuelR')}
          {flip('ignR')}
          {flip('engR')}
          <Bulb state={p.rail.bulb.R} {...HV_RAIL_773.bulbs.R} lgX={293} lgY={112} lgW={36} batt={batt} test={p.lampTest} />
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
        <Col3 name="RADAR" spoken="Radar" c={C.radar!} g={G} pos={p.radar} labels={['MX', 'WX', 'OFF']} onStep={radarTap} k={G.tgK} lit={batt && p.radar !== 'dn'} />
      </Mod>
      <Mod kind="ab" w={bmod.ab} title="AFTERBURNER" label="Afterburner master arm">
        <div className="cjhv-col cjhv-ab" data-open={p.guardOpen || undefined} data-armed={p.armed || undefined}>
          <span className="cjhv-ab-k" style={{ left: C.ab!.tx - 22, top: G.tgY - 33, '--tg-k': 0.9 } as CSSProperties}><AbArt armed={p.armed} open={p.guardOpen} batt={batt} /></span>
          <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(49, 40, 37, { textAlign: 'left' })}>ARM</span>
          <span className="cjhv-lg cjhv-rpos" aria-hidden="true" style={lgAt(49, 88, 37, { textAlign: 'left' })}>SAFE</span>
          <button type="button" className="cjhv-hit" style={{ left: 4, width: 80, top: 18, height: 44 }} aria-label={abAria(p.armed, p.guardOpen, 'guard')} aria-expanded={p.guardOpen} onClick={() => p.onAb('guard')} />
          <button type="button" className="cjhv-hit" style={{ left: 4, width: 80, top: 62, height: 52 }} aria-label={abAria(p.armed, p.guardOpen, 'switch')} aria-pressed={p.armed} onClick={() => p.onAb('switch')} />
        </div>
      </Mod>
      <Mod kind="air" w={bmod.air} label="Power, start air, cabin">
        {divs('air')}
        <Col {...sw('batt')} c={C.batt!} g={G} />
        <Col3 name="SOURCE" spoken="Start source" c={C.source!} g={G} pos={p.rail.source} labels={SRC_LABELS} onStep={srcStep} k={G.tgK} lit={batt && p.rail.source !== 'mid'} />
        <Col {...sw('xbleed')} c={C.xbleed!} g={G} />
        <Col {...sw('seatbelt')} c={C.seatbelt!} g={G} />
        {titles('air')}
      </Mod>
      {(['L', 'R'] as const).map((s) => (
        <Mod key={s} kind="eng" w={bmod[`eng${s}`]} label={`${s} engine`}>
          <Col {...sw(`fuel${s}`)} c={C[`fuel${s}`]!} g={G} />
          <Col {...sw(`ign${s}`)} c={C[`ign${s}`]!} g={G} />
          <Col {...sw(`eng${s}`)} c={C[`eng${s}`]!} g={G} />
          <Bulb state={p.rail.bulb[s]} cx={152} cy={58} r={9} lgX={134} lgY={70} lgW={36} batt={batt} test={p.lampTest} />
          {titles(`eng${s}`)}
        </Mod>
      ))}
      <Mod kind="elec" w={bmod.elec} label="Electrics and nav">
        <GenLamps x={C.gen!.x} w={C.gen!.w} y={58} r={8} nameY={G.nameY} bulb={p.rail.bulb} batt={batt} test={p.lampTest} />
        <Col {...sw('nav')} c={C.nav!} g={G} />
        {titles('elec')}
      </Mod>
      {qs}
      {estop}
      {push}
    </div>
  );
}
