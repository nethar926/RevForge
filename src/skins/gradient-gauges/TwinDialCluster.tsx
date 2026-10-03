import type { CSSProperties } from 'react';
import {
  dialAngle,
  redlineArc,
  rpmDiscGradient,
  rpmHeat,
  rpmValueText,
  speedDiscGradient,
  speedValueText,
  unitShort,
} from './gaugeMath';
import { usePrefersReducedMotion, useSmoothedValue } from './motion';
import './gradient-gauges.css';

export interface TwinDialClusterProps {
  speed: number;
  maxSpeed: number;
  rpm: number;
  redlineRpm: number;
  maxRpm: number;
  /** 0 / 'N' = neutral. Only shown with `showGearRpm`. */
  gear?: number | string;
  units?: string;
  /** Second variant: gear chip above, speed in a tile, RPM pill below. */
  showGearRpm?: boolean;
  compact?: boolean;
  /** Force Reduce Motion (app "Animated environment" off). OS setting is always honoured. */
  reduceMotion?: boolean;
  className?: string;
}

function gearText(gear: number | string | undefined): string {
  if (gear == null || gear === '') return '–';
  if (gear === 0 || gear === '0' || gear === 'N') return 'N';
  if (typeof gear === 'number' && gear < 0) return 'R';
  return String(gear);
}

function Disc({
  kind,
  deg,
  gradient,
  label,
  valueNow,
  valueMax,
  valueText,
  redline,
}: {
  kind: 'speed' | 'rpm';
  deg: number;
  gradient: string;
  label: string;
  valueNow: number;
  valueMax: number;
  valueText: string;
  redline?: { from: number; to: number };
}) {
  return (
    <div
      className={`tdc-disc tdc-disc--${kind}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(valueMax)}
      aria-valuenow={Math.round(valueNow)}
      aria-valuetext={valueText}
    >
      <div className="tdc-face" style={{ background: gradient }} aria-hidden="true" />
      {redline && (
        <svg className="tdc-redzone" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          {/* Hollow, outlined band = redline by shape, not only by colour. */}
          <path className="tdc-redzone-key" d={arcBand(redline.from, redline.to, 82, 93)} />
          <path className="tdc-redzone-band" d={arcBand(redline.from, redline.to, 83, 92)} />
        </svg>
      )}
      <div className="tdc-needle" style={{ transform: `rotate(${deg.toFixed(2)}deg)` } as CSSProperties} aria-hidden="true">
        <i />
      </div>
    </div>
  );
}

/** SVG annular band between absolute angles a0→a1 (0° = 12 o'clock, cw). */
function arcBand(a0: number, a1: number, r0: number, r1: number): string {
  const p = (a: number, r: number) => {
    const t = (a * Math.PI) / 180;
    return `${(100 + Math.sin(t) * r).toFixed(2)} ${(100 - Math.cos(t) * r).toFixed(2)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(a0, r1)} A${r1} ${r1} 0 ${large} 1 ${p(a1, r1)} L${p(a1, r0)} A${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`;
}

/**
 * Twin Dial — stadium housing with a speed disc (left), RPM disc (right) and a
 * glowing centre readout. `showGearRpm` adds the gear chip + RPM pill variant.
 */
export function TwinDialCluster({
  speed,
  maxSpeed,
  rpm,
  redlineRpm,
  maxRpm,
  gear,
  units = 'mph',
  showGearRpm = false,
  compact = false,
  reduceMotion,
  className,
}: TwinDialClusterProps) {
  const osRm = usePrefersReducedMotion();
  const jump = osRm || !!reduceMotion;
  const sp = Math.max(0, Number.isFinite(speed) ? speed : 0);
  const rp = Math.max(0, Number.isFinite(rpm) ? rpm : 0);
  const rMax = maxRpm > 0 ? maxRpm : Math.max(1, redlineRpm * 1.15);
  const sMax = maxSpeed > 0 ? maxSpeed : 1;
  const speedDeg = useSmoothedValue(dialAngle(sp, sMax), jump);
  const rpmDeg = useSmoothedValue(dialAngle(rp, rMax), jump);
  const atRedline = redlineRpm > 0 && rp >= redlineRpm;
  const speedShown = Math.round(sp);
  const rpmShown = Math.round(rp / 10) * 10;
  const unit = unitShort(units);
  const g = gearText(gear);

  return (
    <div
      className={`tdc${showGearRpm ? ' has-gear-rpm' : ''}${compact ? ' is-compact' : ''}${jump ? ' is-rm' : ''}${atRedline ? ' is-redline' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Twin Dial cluster"
    >
      <div className="tdc-housing">
        <Disc
          kind="speed"
          deg={speedDeg}
          gradient={speedDiscGradient(speedDeg)}
          label="Speed"
          valueNow={speedShown}
          valueMax={sMax}
          valueText={speedValueText('Speed', speedShown, units)}
        />
        <div className="tdc-center" aria-hidden="true">
          {showGearRpm && (
            <div className="tdc-gear">
              <span>{g}</span>
            </div>
          )}
          <div className="tdc-speed">
            <strong>{speedShown}</strong>
            <small>{unit}</small>
          </div>
          {showGearRpm ? (
            <div className="tdc-rpm-pill">
              <span>{atRedline ? `▲ ${rpmShown} REDLINE` : `${rpmShown} RPM`}</span>
            </div>
          ) : (
            atRedline && (
              <span className="gg-redline-chip tdc-redline-chip">
                <span>▲ REDLINE</span>
              </span>
            )
          )}
        </div>
        <Disc
          kind="rpm"
          deg={rpmDeg}
          gradient={rpmDiscGradient(rpmDeg, rpmHeat(rp, redlineRpm))}
          label="Engine speed"
          valueNow={rpmShown}
          valueMax={rMax}
          valueText={rpmValueText(rpmShown, atRedline)}
          redline={redlineRpm > 0 && redlineRpm < rMax ? redlineArc(redlineRpm, rMax) : undefined}
        />
        {showGearRpm && <span className="gg-sr-only">{`Gear ${g === 'N' ? 'neutral' : g === 'R' ? 'reverse' : g}`}</span>}
      </div>
    </div>
  );
}
