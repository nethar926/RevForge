import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './quiet-current.css';

export type QcAppearance = 'auto' | 'light' | 'dark';
export type QcVariant = 'standard' | 'cyber';
export type QcDriveState = 'P' | 'R' | 'N' | 'D';
export type QcUnits = 'mph' | 'kph';

export interface QuietCurrentOverlayProps {
  /** Speed already expressed in `units` (PackHudProps `speed`). Wins over `speedMph`. */
  speed?: number;
  /** Speed in mph; converted when `units` is 'kph'. */
  speedMph?: number;
  /** Display units. Default 'mph'. (`unit` is accepted as an alias for PackHudProps.) */
  units?: QcUnits;
  unit?: QcUnits;
  /** Signed electrical power in kW: positive = power, negative = regen. */
  powerKw?: number;
  /** Full-scale power for the bar (kW). Default 250. */
  maxPowerKw?: number;
  /** Full-scale regen for the bar (kW). Default 80. */
  maxRegenKw?: number;
  /** Signed power fraction -1..1 (negative = regen). Used when `powerKw` is absent. */
  power?: number;
  /** PRND state. Wins over `gear`. */
  driveState?: QcDriveState;
  /** Numeric gear: 0 = N, >0 = D, <0 = R. Ignored when `driveState` is set. */
  gear?: number;
  /** Motor speed; the arc shows rpm / redlineRpm as "motor output %". */
  rpm?: number;
  /** Full-scale motor speed. Default 7000. */
  redlineRpm?: number;
  /** 0..1 motor output; wins over rpm/redlineRpm when given (PackHudProps `rpmNorm`). */
  rpmNorm?: number;
  /** Appearance preference from app settings. 'auto' follows prefers-color-scheme. Default 'dark'. */
  appearance?: QcAppearance;
  /** Skin variant inside the same pack. Default 'standard'. */
  variant?: QcVariant;
  /** In-app "Solid surfaces" switch: replaces textures with solid plates. */
  solidSurfaces?: boolean;
  /** Shared moving signal (Frontend useIsMoving()). Hides non-essential readouts; no motion. */
  isMoving?: boolean;
  /** False when the in-app "Animated environment" switch is off. */
  motion?: boolean;
  /** Demo source instead of GPS (caption only). */
  demo?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));

/** Resolve 'auto' against prefers-color-scheme; read-only, never persists anything. */
function useResolvedAppearance(pref: QcAppearance): 'light' | 'dark' {
  const query = '(prefers-color-scheme: light)';
  const read = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;
  const [systemLight, setSystemLight] = useState(read);
  useEffect(() => {
    if (pref !== 'auto' || typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setSystemLight(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [pref]);
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return systemLight ? 'light' : 'dark';
}

const DRIVE_STATES: readonly QcDriveState[] = ['P', 'R', 'N', 'D'];
const DRIVE_WORDS: Record<QcDriveState, string> = { P: 'Park', R: 'Reverse', N: 'Neutral', D: 'Drive' };

/* Motor arc geometry: 240° open arc, centre (100,100), r 80, from 150° to 390° (screen coords). */
const ARC_CX = 100;
const ARC_CY = 100;
const ARC_R = 80;
const ARC_START = 150;
const ARC_SWEEP = 240;
const arcPoint = (t: number, r = ARC_R) => {
  const a = ((ARC_START + ARC_SWEEP * t) * Math.PI) / 180;
  return [ARC_CX + r * Math.cos(a), ARC_CY + r * Math.sin(a)] as const;
};
const fmt = (n: number) => n.toFixed(2);
const ARC_PATH = (() => {
  const [x0, y0] = arcPoint(0);
  const [x1, y1] = arcPoint(1);
  return `M${fmt(x0)} ${fmt(y0)} A${ARC_R} ${ARC_R} 0 1 1 ${fmt(x1)} ${fmt(y1)}`;
})();
/** Cyber: straight facets every 10 %. */
const facetPoints = (t: number) => {
  const pts: string[] = [];
  const steps = Math.floor(t * 10 + 1e-9);
  for (let i = 0; i <= steps; i++) pts.push(arcPoint(i / 10).map(fmt).join(','));
  if (t * 10 - steps > 1e-6) pts.push(arcPoint(t).map(fmt).join(','));
  return pts.join(' ');
};
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const [xa, ya] = arcPoint(i / 10, ARC_R + 9);
  const [xb, yb] = arcPoint(i / 10, ARC_R + (i % 5 === 0 ? 17 : 14));
  return `M${fmt(xa)} ${fmt(ya)}L${fmt(xb)} ${fmt(yb)}`;
}).join('');

function MotorArc({ value, cyber, peak }: { value: number; cyber: boolean; peak: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div
      className={`qc-arc${peak ? ' is-peak' : ''}`}
      role="meter"
      aria-label="Motor output"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct} percent${peak ? ', peak' : ''}`}
    >
      <svg viewBox="0 0 200 172" aria-hidden="true" focusable="false">
        <path className="qc-arc-ticks" d={TICKS} />
        {cyber ? (
          <>
            <polyline className="qc-arc-track" points={facetPoints(1)} />
            {value > 0.001 && <polyline className="qc-arc-fill" points={facetPoints(value)} />}
          </>
        ) : (
          <>
            <path className="qc-arc-track" d={ARC_PATH} pathLength={100} />
            {value > 0.001 && (
              <path className="qc-arc-fill" d={ARC_PATH} pathLength={100} strokeDasharray={`${fmt(value * 100)} 100`} />
            )}
          </>
        )}
      </svg>
      <div className="qc-arc-readout" aria-hidden="true">
        <span className="qc-label">Motor</span>
        <span className="qc-meter-num">
          {pct}
          <small>%</small>
        </span>
        {peak && <span className="qc-peak">PEAK</span>}
      </div>
    </div>
  );
}

function PowerBar({ value, kw, showValue }: { value: number; kw?: number; showValue: boolean }) {
  const pct = Math.round(value * 100);
  const regen = value < -0.005;
  const state = regen ? 'Regenerating' : value > 0.005 ? 'Power' : 'Coasting';
  const valueText =
    kw != null ? `${state}, ${Math.abs(Math.round(kw))} kilowatts` : `${state}, ${Math.abs(pct)} percent`;
  return (
    <div className="qc-power" data-state={regen ? 'regen' : value > 0.005 ? 'power' : 'idle'}>
      <div className="qc-power-labels" aria-hidden="true">
        <span className={`qc-power-label qc-power-label--regen${regen ? ' is-on' : ''}`}>
          <span className="qc-swatch qc-swatch--regen" />
          REGEN
        </span>
        {showValue && (
          <span className="qc-power-value">
            {kw != null ? `${Math.abs(Math.round(kw))} kW` : `${Math.abs(pct)} %`}
          </span>
        )}
        <span className={`qc-power-label qc-power-label--power${value > 0.005 ? ' is-on' : ''}`}>
          POWER
          <span className="qc-swatch qc-swatch--power" />
        </span>
      </div>
      <div
        className="qc-power-bar"
        role="meter"
        aria-label="Power and regeneration"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={valueText}
      >
        <div className="qc-power-track" aria-hidden="true">
          {regen && <i className="qc-power-fill qc-power-fill--regen" style={{ width: `${Math.abs(value) * 50}%` }} />}
          {value > 0.005 && <i className="qc-power-fill qc-power-fill--power" style={{ width: `${value * 50}%` }} />}
          <i className="qc-power-zero" />
        </div>
      </div>
    </div>
  );
}

export function QuietCurrentOverlay({
  speed,
  speedMph,
  units,
  unit,
  powerKw,
  maxPowerKw = 250,
  maxRegenKw = 80,
  power,
  driveState,
  gear,
  rpm,
  redlineRpm = 7000,
  rpmNorm,
  appearance = 'dark',
  variant = 'standard',
  solidSurfaces = false,
  isMoving = false,
  motion = true,
  demo = false,
}: QuietCurrentOverlayProps) {
  const resolved = useResolvedAppearance(appearance);
  const u: QcUnits = units ?? unit ?? 'mph';
  const spd = Math.max(
    0,
    Math.round(speed != null ? speed : (speedMph ?? 0) * (u === 'kph' ? 1.609344 : 1)),
  );
  const unitLabel = u === 'kph' ? 'KM/H' : 'MPH';
  const unitWords = u === 'kph' ? 'kilometres per hour' : 'miles per hour';

  const powerFrac =
    powerKw != null
      ? clamp(powerKw >= 0 ? powerKw / Math.max(1, maxPowerKw) : powerKw / Math.max(1, maxRegenKw), -1, 1)
      : clamp(power ?? 0, -1, 1);

  const state: QcDriveState =
    driveState ?? (gear == null ? 'P' : gear === 0 ? 'N' : gear < 0 ? 'R' : 'D');

  const motorNorm = clamp(rpmNorm ?? (rpm != null ? rpm / Math.max(1, redlineRpm) : 0), 0, 1);
  const peak = motorNorm >= 0.9;
  const cyber = variant === 'cyber';
  const motorPct = Math.round(motorNorm * 100);

  /* Polite, rate-limited VoiceOver summary: at most every 5 s, or at once on a drive-state change. */
  const powerWord = powerFrac < -0.005 ? 'Regenerating' : powerFrac > 0.005 ? 'Power' : 'Coasting';
  const candidate = `${DRIVE_WORDS[state]}. ${spd} ${unitWords}. Motor ${motorPct} percent. ${powerWord}.`;
  const [summary, setSummary] = useState(candidate);
  const last = useRef({ at: 0, state });
  useEffect(() => {
    const now = Date.now();
    const stateChanged = last.current.state !== state;
    if (candidate !== summary && (stateChanged || now - last.current.at >= 5000)) {
      last.current = { at: now, state };
      setSummary(candidate);
    }
  }, [candidate, summary, state]);

  return (
    <div
      className="qc-root"
      role="group"
      aria-label="Quiet Current drive display"
      data-appearance={resolved}
      data-appearance-pref={appearance}
      data-variant={cyber ? 'cyber' : 'standard'}
      data-solid={solidSurfaces ? 'true' : 'false'}
      data-moving={isMoving ? 'true' : 'false'}
      data-motion={motion ? 'on' : 'off'}
      style={{ '--qc-motor': motorNorm, '--qc-power-frac': powerFrac } as CSSProperties}
    >
      <div className="qc-frame cy-steel">
        <div className="qc-edge">
          <div className="qc-card">
            <header className="qc-top">
              <ol className="qc-gears" aria-label="Drive state">
                {DRIVE_STATES.map((g) => (
                  <li
                    key={g}
                    className={`qc-gear${g === state ? ' is-active' : ''}`}
                    aria-current={g === state ? 'true' : undefined}
                  >
                    <span aria-hidden="true">{g}</span>
                    <span className="qc-sr">{DRIVE_WORDS[g]}</span>
                  </li>
                ))}
              </ol>
              <span className="qc-source">{demo ? 'Demo' : 'GPS'}</span>
            </header>

            <div className="qc-main">
              <div className="qc-speed">
                <span className="qc-sr">Speed</span>
                <span className="qc-speed-num" data-testid="qc-speed">
                  {spd}
                </span>
                <span className="qc-speed-unit">
                  <span aria-hidden="true">{unitLabel}</span>
                  <span className="qc-sr">{unitWords}</span>
                  <span className="qc-speed-caption">{demo ? 'Demo speed' : 'GPS speed'}</span>
                </span>
              </div>
              <div className="qc-edge qc-edge--sm qc-motor-edge">
                <div className="qc-plate qc-motor">
                  <MotorArc value={motorNorm} cyber={cyber} peak={peak} />
                </div>
              </div>
            </div>

            <div className="qc-edge qc-edge--sm qc-power-edge">
              <div className="qc-plate">
                <PowerBar value={powerFrac} kw={powerKw} showValue={!isMoving} />
              </div>
            </div>

            <p className="qc-sr" aria-live="polite" aria-atomic="true">
              {summary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuietCurrentOverlay;
