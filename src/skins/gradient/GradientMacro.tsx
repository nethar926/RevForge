import type { CSSProperties } from 'react';

export interface GradientMacroProps {
  /** 0..1 */
  speedNorm: number;
  /** Absolute speed in `unit`. */
  speed?: number;
  unit?: 'mph' | 'kph';
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** 0° = 12 o'clock, clockwise positive. */
const pctToDeg = (pct: number) => -135 + clamp01(pct) * 270;

/** Etched tick ring — quiet, no glow. */
const TICKS: { deg: number; major: boolean }[] = Array.from({ length: 60 }, (_, i) => ({
  deg: i * 6,
  major: i % 5 === 0,
}));

/** Hollow orange pill outlines, fixed on the right side (cf. macro shots). */
const MARKER_DEGS = [58, 84];

/**
 * RF Gradient Macro — one large beam gauge, a close-up of the light-sweep
 * face. A single bright wedge (hard sharp leading edge, soft fade behind)
 * rotates with speed; the beam is the indicator, so there is no needle.
 * Live speed reads out in dark navy numerals sitting on the bright beam.
 */
export function GradientMacro({ speedNorm, speed, unit = 'mph' }: GradientMacroProps) {
  const pct = clamp01(speedNorm);
  const deg = pctToDeg(pct);
  const speedShow = speed != null ? Math.round(speed) : Math.round(pct * 160);
  const unitShow = unit === 'kph' ? 'KM/H' : 'MPH';

  return (
    <div
      className="grad-macro"
      role="img"
      aria-label={`Speed ${speedShow} ${unitShow}`}
    >
      <div className="grad-macro-face" aria-hidden />
      <div
        className="grad-macro-beam"
        style={{ transform: `rotate(${deg}deg)` } as CSSProperties}
        aria-hidden
      >
        <div className="grad-macro-wedge" />
      </div>
      <svg className="grad-macro-ticks" viewBox="0 0 200 200" aria-hidden>
        {TICKS.map(({ deg: d, major }) => (
          <line
            key={d}
            className={`grad-tick${major ? ' major' : ''}`}
            transform={`rotate(${d} 100 100)`}
            x1="100"
            y1={major ? 8 : 11}
            x2="100"
            y2="15"
          />
        ))}
      </svg>
      {MARKER_DEGS.map((d) => (
        <div key={d} className="grad-macro-marker" style={{ transform: `rotate(${d}deg)` }} aria-hidden>
          <i />
        </div>
      ))}
      <div className="grad-macro-readout">
        <strong>{speedShow}</strong>
        <small>{unitShow}</small>
      </div>
    </div>
  );
}
