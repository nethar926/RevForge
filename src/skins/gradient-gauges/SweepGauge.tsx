import type { CSSProperties } from 'react';
import {
  SWEEP_INK,
  sweepAngle,
  sweepGradient,
  sweepTicks,
  speedValueText,
  unitShort,
  type SweepInk,
} from './gaugeMath';
import { usePrefersReducedMotion, useSmoothedValue } from './motion';
import './gradient-gauges.css';

export interface SweepGaugeProps {
  /** Current value in `units` (e.g. mph). */
  value: number;
  /** Full-scale value (end of the arc). */
  max: number;
  /** Values at/above this are redline: hollow outlined ticks + REDLINE chip. */
  redlineFrom?: number;
  /** 'mph' | 'kph' (or any short unit string). */
  units?: string;
  /** Accessible name of the quantity, default "Speed". */
  label?: string;
  /** Tighter readout/ticks for small Drive viewports. */
  compact?: boolean;
  /**
   * 'light' (default): white numerals on the reference's mid-blue — ≥7:1.
   * 'dark': the reference's navy numerals; the readout sector brightens so it
   * still clears 4.5:1 at every point of the gradient behind it.
   */
  ink?: SweepInk;
  /** Force Reduce Motion (e.g. app "Animated environment" off). OS setting is always honoured. */
  reduceMotion?: boolean;
  className?: string;
}

/**
 * Sweep — full-bleed conic-gradient speed sweep.
 * A hard cyan edge marks the value; the arc behind it falls to deep navy and
 * the arc ahead of it lifts to mid-blue. Recessed pill ticks; redline ticks
 * are hollow outlined pills (shape, not just colour).
 */
export function SweepGauge({
  value,
  max,
  redlineFrom,
  units = 'mph',
  label = 'Speed',
  compact = false,
  ink = 'light',
  reduceMotion,
  className,
}: SweepGaugeProps) {
  const osRm = usePrefersReducedMotion();
  const jump = osRm || !!reduceMotion;
  const safeMax = max > 0 ? max : 1;
  const v = Math.max(0, Number.isFinite(value) ? value : 0);
  const target = sweepAngle(v, safeMax);
  const deg = useSmoothedValue(target, jump);
  const atRedline = redlineFrom != null && v >= redlineFrom;
  const ticks = sweepTicks(safeMax, redlineFrom);
  const shown = Math.round(v);

  return (
    <div
      className={`gg-sweep${compact ? ' is-compact' : ''}${jump ? ' is-rm' : ''}${atRedline ? ' is-redline' : ''}${className ? ` ${className}` : ''}`}
      data-ink={ink}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={shown}
      aria-valuetext={speedValueText(label, shown, units, atRedline)}
      style={{ background: sweepGradient(deg, ink), ['--gg-ink' as string]: SWEEP_INK[ink] } as CSSProperties}
    >
      <svg className="gg-sweep-ticks" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        {ticks.map((t) => (
          <g key={t.deg} transform={`rotate(${t.deg} 100 100)`} className={t.redline ? 'gg-tick is-red' : 'gg-tick'}>
            {t.redline ? (
              <>
                {/* dark keyline so the outline clears 3:1 on bright blue */}
                <rect className="gg-tick-key" x="97.1" y="12.5" width="5.8" height="19" rx="2.9" />
                <rect className="gg-tick-red" x="97.6" y="13" width="4.8" height="18" rx="2.4" />
              </>
            ) : (
              <>
                <rect className="gg-tick-lip" x="98.6" y="16.6" width="3.2" height="14" rx="1.6" />
                <rect className="gg-tick-well" x="98.2" y="16" width="3.2" height="14" rx="1.6" />
              </>
            )}
          </g>
        ))}
      </svg>
      <div className="gg-sweep-readout" aria-hidden="true">
        <span className="gg-sweep-num">{shown}</span>
        <span className="gg-sweep-unit">{unitShort(units)}</span>
        {atRedline && (
          <span className="gg-redline-chip">
            <span>REDLINE</span>
          </span>
        )}
      </div>
    </div>
  );
}
