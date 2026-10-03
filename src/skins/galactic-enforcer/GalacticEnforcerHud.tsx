import type { CSSProperties } from 'react';
import type { Simulation } from '../../forge/simulation';
import { CRAFT, type CraftId } from './craft';
import { CraftWireframe } from './CraftWireframe';
import { lockStageFor } from './hudModel';
import './galactic-enforcer.css';

/**
 * Galactic Enforcer — targeting-computer HUD (film styling, original craft).
 *
 * Drop-in for src/themes/GalacticEnforcer.tsx (same props + optional extras).
 * Real data (speed, ladder scale, RPM, gear, load) is always Latin digits in
 * Inter/system-ui; FT Aurebesh (OFL) is used only for decorative glyph lines.
 */
export interface GalacticEnforcerHudProps {
  state: Simulation;
  redline: number;
  unit: 'mph' | 'kph';
  demo: boolean;
  running: boolean;
  lockStage?: string;
  /** False when the app's "Animated environment" is off (OS Reduce Motion is honoured via CSS). */
  motion?: boolean;
  /** Swappable art ids (see craft.tsx). */
  targetCraft?: CraftId;
  statusCraft?: CraftId;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/* ---------------- scope geometry (viewBox 800 × 440) ---------------- */

const SW = 800;
const SH = 440;

/**
 * Tapered perspective ticks on a flattened "eye" arc (top arc; the bottom arc
 * is its mirror). Ticks aim at a focal point below the arc so the side ticks
 * lean inward like the reference scope; they lengthen and widen outward.
 */
function eyeTicks(dir: -1 | 1): string[] {
  const cx = SW / 2;
  const a = 362;
  const b = 112;
  const top = 30;
  const cy = top + b;
  const fx = cx;
  const fy = 262;
  const out: string[] = [];
  // Even spacing along the arc (not in angle) so the sides don't bunch up.
  const T = 72;
  const N = 46;
  const samples: { t: number; s: number }[] = [];
  let acc = 0;
  for (let i = 0; i <= 720; i++) {
    const t = ((-T + (2 * T * i) / 720) * Math.PI) / 180;
    if (i > 0) {
      const p = samples[i - 1].t;
      acc += Math.hypot(a * (Math.sin(t) - Math.sin(p)), b * (Math.cos(t) - Math.cos(p)));
    }
    samples.push({ t, s: acc });
  }
  for (let j = 0; j <= N; j++) {
    if (j === N / 2) continue; // centre handled by the crosshair
    const target = (acc * j) / N;
    const t = (samples.find((x) => x.s >= target - 1e-6) ?? samples[samples.length - 1]).t;
    const deg = (t * 180) / Math.PI;
    const ox = cx + a * Math.sin(t);
    const oy = cy - b * Math.cos(t);
    const ul = Math.hypot(fx - ox, fy - oy);
    const nx = (fx - ox) / ul;
    const ny = (fy - oy) / ul;
    const k = Math.abs(deg) / T;
    const len = 30 + 58 * k ** 1.6;
    const wo = 3 + 2.6 * k; // outer half-width
    const wi = 1; // inner half-width (taper)
    const ix = ox + nx * len;
    const iy = oy + ny * len;
    const px = -ny;
    const py = nx;
    const Y = (y: number) => (dir < 0 ? y : SH - y);
    out.push(
      `M${(ox + px * wo).toFixed(1)} ${Y(oy + py * wo).toFixed(1)}L${(ix + px * wi).toFixed(1)} ${Y(iy + py * wi).toFixed(1)}L${(ix - px * wi).toFixed(1)} ${Y(iy - py * wi).toFixed(1)}L${(ox - px * wo).toFixed(1)} ${Y(oy - py * wo).toFixed(1)}Z`,
    );
  }
  return out;
}
const TOP_TICKS = eyeTicks(-1);
const BOTTOM_TICKS = eyeTicks(1);

/** Ship-status round scope tick ring (viewBox 200). Dense fans top/bottom. */
const RING_TICKS = (() => {
  const out: string[] = [];
  for (let d = 0; d < 360; d += 4) {
    const fromV = Math.min(Math.abs(((d + 180) % 360) - 180), Math.abs(((d + 360) % 360) - 180));
    if (fromV > 38) continue; // only top & bottom fans, like the round scope
    const t = (d * Math.PI) / 180;
    const len = 6 + (1 - fromV / 38) * 12 + (fromV < 2 ? 22 : 0);
    const r0 = 92;
    const r1 = r0 - len;
    out.push(`M${(100 + Math.sin(t) * r0).toFixed(1)} ${(100 - Math.cos(t) * r0).toFixed(1)}L${(100 + Math.sin(t) * r1).toFixed(1)} ${(100 - Math.cos(t) * r1).toFixed(1)}`);
  }
  return out;
})();

/** Decorative glyph lines (rendered in FT Aurebesh; aria-hidden). No digits, no franchise words. */
const GLYPH_LINES = ['range lock nominal | grid online', 'pulse bank ready | vector trim clear'];

/* ------------------------------ HUD ------------------------------ */

export function GalacticEnforcerHud({
  state,
  redline,
  unit,
  demo,
  running,
  lockStage,
  motion = true,
  targetCraft = 'drone',
  statusCraft = 'interceptor',
}: GalacticEnforcerHudProps) {
  const rpm = running ? state.rpm : 0;
  const rev = redline > 0 ? clamp01(rpm / redline) : 0;
  const stage = lockStageFor(rev, lockStage);
  const locked = stage === 'TARGET LOCK' || stage === 'FIRING SOLUTION';
  const speed = Math.max(0, state.speedMps * (unit === 'mph' ? 2.236936 : 3.6));
  const speedShown = Math.round(speed);
  const unitShort = unit === 'kph' ? 'KM/H' : 'MPH';
  const unitWords = unit === 'kph' ? 'kilometers per hour' : 'miles per hour';
  const gear = state.gear > 0 ? String(state.gear) : 'N';
  const charge = clamp01(0.25 + rev * 0.75);
  const load = clamp01(state.load);
  const accel = Number.isFinite(state.accel) ? state.accel : 0;

  // Range ladder: values increase downward (as on the reference scope), step 5.
  const centre = Math.round(speed / 5) * 5;
  const offset = (speed - centre) / 5; // in rows
  const rows = [-3, -2, -1, 0, 1, 2, 3].map((k) => ({ k, v: centre + k * 5 }));

  const tgt = CRAFT[targetCraft];
  const sts = CRAFT[statusCraft];

  return (
    <div
      className={`ge-hud${locked ? ' is-locked' : ''}${motion ? '' : ' is-still'}`}
      role="group"
      aria-label="Galactic Enforcer simulated targeting display"
      data-stage={stage}
    >
      <header className="ge-caption" aria-hidden="true">
        <span>GALACTIC ENFORCER</span>
        <span>SIMULATED TARGETING</span>
      </header>

      <div className="ge-main">
        {/* Left: red range ladder (speed) with highlighted value */}
        <div className="ge-ladder" aria-hidden="true">
          <div className="ge-ladder-frame">
            <div className="ge-ladder-track" style={{ ['--ge-off' as string]: String(offset) } as CSSProperties}>
              {rows.map(({ k, v }) => (
                <div key={k} className="ge-ladder-row" style={{ ['--ge-k' as string]: String(k) } as CSSProperties}>
                  {v >= 0 && k !== 0 && Math.abs(k - offset) <= 2.6 && <span className="ge-ladder-num">{v}</span>}
                  <i className="ge-ladder-major" />
                  <i className="ge-ladder-minor m1" />
                  <i className="ge-ladder-minor m2" />
                  <i className="ge-ladder-minor m3" />
                  <i className="ge-ladder-minor m4" />
                </div>
              ))}
            </div>
            <div className="ge-ladder-hl">
              <span>{speedShown}</span>
            </div>
          </div>
          <span className="ge-ladder-unit">{unitShort}</span>
        </div>

        {/* Centre: rectangular targeting scope */}
        <div className="ge-scope">
          <svg className="ge-scope-svg" viewBox={`0 0 ${SW} ${SH}`} aria-hidden="true" focusable="false">
            <g className="ge-eye">
              {TOP_TICKS.map((d, i) => (
                <path key={`t${i}`} d={d} />
              ))}
              {BOTTOM_TICKS.map((d, i) => (
                <path key={`b${i}`} d={d} />
              ))}
            </g>
            <g className="ge-cross">
              <path d="M400 22V158M400 282V418" />
              <path d="M394 22H406M394 418H406" />
              <path d="M96 210H176M96 220H196M96 230H176M624 210H704M604 220H704M624 230H704" />
            </g>
            <path className="ge-terrain" d="M262 300l18-6 10 4 16-12 22 8 14-10 20 6 8-14 26 10 18-4 24 8 12-10 30 6 16-8 22 12 18-6 14 4 28-18 16 4" />
            <svg
              x={400 - tgt.cx * 0.9}
              y={205 - tgt.cy * 0.9}
              width={360 * 0.9}
              height={300 * 0.9}
              viewBox={tgt.viewBox}
              overflow="visible"
              className="ge-target"
            >
              <CraftWireframe id={targetCraft} className="ge-target-art" />
            </svg>
            <g className="ge-brackets">
              <path d="M300 112h-26v26M500 112h26v26M300 300h-26v-26M500 300h26v-26" />
            </g>
          </svg>
          <span className="ge-badge b1" aria-hidden="true">
            <span>1</span>
          </span>
          <span className="ge-badge b2" aria-hidden="true">
            <span>2</span>
          </span>
          <div className="ge-stage">
            <span className="ge-stage-mark" aria-hidden="true" />
            <span>{stage}</span>
          </div>
          <div className="ge-glyphs" aria-hidden="true">
            <span className="ge-glyph-plate">
              <span>{GLYPH_LINES[0]}</span>
            </span>
          </div>
        </div>

        {/* Right: red indicator column with triangles */}
        <div className="ge-column" aria-hidden="true">
          <div className={`ge-tri up${accel > 0.25 ? ' on' : ''}`}>
            <i />
          </div>
          <div className="ge-slot-wrap">
            <span className="ge-slot-label">CHG</span>
            <div className="ge-slot">
              <i style={{ ['--v' as string]: String(charge) } as CSSProperties} />
            </div>
          </div>
          <div className="ge-gear-block">
            <span>{gear}</span>
          </div>
          <div className="ge-slot-wrap">
            <span className="ge-slot-label">LOAD</span>
            <div className="ge-slot">
              <i style={{ ['--v' as string]: String(load) } as CSSProperties} />
            </div>
          </div>
          <div className={`ge-tri down${accel < -0.25 ? ' on' : ''}`}>
            <i />
          </div>
        </div>
      </div>

      <div className="ge-strip">
        <div className="ge-status">
          <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <circle className="ge-ring" cx="100" cy="100" r="96" />
            <g className="ge-ring-ticks">
              {RING_TICKS.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <path className="ge-ring-cross" d="M12 100H64M136 100H188M12 96H30M12 104H30M170 96H188M170 104H188" />
            <svg x={100 - sts.cx * 0.62} y={100 - sts.cy * 0.62} width={200 * 0.62} height={150 * 0.62} viewBox={sts.viewBox} overflow="visible">
              <CraftWireframe id={statusCraft} className="ge-status-art" />
            </svg>
          </svg>
          <span className="ge-strip-label">SHIP STATUS</span>
        </div>

        <div
          className="ge-speed"
          role="meter"
          aria-label="Speed"
          aria-valuemin={0}
          aria-valuemax={unit === 'kph' ? 300 : 200}
          aria-valuenow={speedShown}
          aria-valuetext={`Speed ${speedShown} ${unitWords}`}
        >
          <strong>{speedShown}</strong>
          <span className="ge-strip-label">
            {unitShort} · {demo ? 'DEMO' : 'GPS'}
          </span>
        </div>

        <div
          className="ge-tele"
          role="meter"
          aria-label="Engine speed"
          aria-valuemin={0}
          aria-valuemax={Math.round(redline)}
          aria-valuenow={Math.round(rpm)}
          aria-valuetext={`RPM ${fmt(rpm)}`}
        >
          <b>{Math.round(rpm)}</b>
          <span className="ge-strip-label">RPM</span>
        </div>
        <div className="ge-tele" aria-label={`Gear ${gear === 'N' ? 'neutral' : gear}`} role="img">
          <b>{gear}</b>
          <span className="ge-strip-label">GEAR</span>
        </div>
        <div className="ge-tele" aria-label={`Engine load ${Math.round(load * 100)} percent`} role="img">
          <b>{Math.round(load * 100)}%</b>
          <span className="ge-strip-label">LOAD</span>
        </div>
        <div className="ge-glyphs ge-glyphs--strip" aria-hidden="true">
          <span>{GLYPH_LINES[1]}</span>
          <span className="ge-strip-label ge-latin">TWIN ION PROPULSION</span>
        </div>
      </div>
    </div>
  );
}
