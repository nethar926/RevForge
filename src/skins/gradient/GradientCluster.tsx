import type { CSSProperties } from 'react';

/**
 * Dial assignment for the Gradient cluster — LEFT = MPH (speed), RIGHT = RPM.
 * (Named constant so the mapping is trivial to change later.)
 */
export const GRADIENT_DIAL_MAP: { left: 'rpm' | 'speed'; right: 'rpm' | 'speed' } = {
  left: 'speed',
  right: 'rpm',
};

export interface GradientClusterProps {
  /** 0..1 */
  rpmNorm: number;
  /** 0..1 */
  speedNorm: number;
  /** Absolute values for the center stack (ThemeStage provides these). */
  rpm?: number;
  /** Absolute speed in `unit`. */
  speed?: number;
  unit?: 'mph' | 'kph';
  gear?: number | string;
  /** 0..1 */
  load?: number;
  /** 0..1 */
  throttle?: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** 0° = 12 o'clock, clockwise positive. */
const pctToDeg = (pct: number) => -135 + clamp01(pct) * 270;

/** Etched tick ring — quiet, no glow. */
const TICKS: { deg: number; major: boolean }[] = Array.from({ length: 60 }, (_, i) => ({
  deg: i * 6,
  major: i % 5 === 0,
}));

function Dial({
  pct,
  tone,
  label,
}: {
  pct: number;
  tone: 'speed' | 'rpm';
  label: string;
}) {
  const deg = pctToDeg(pct);
  const rotate = { transform: `rotate(${deg}deg)` } as CSSProperties;
  return (
    <div
      className={`grad-dial grad-dial--${tone}`}
      role="img"
      aria-label={`${label} ${Math.round(clamp01(pct) * 100)} percent`}
    >
      <div className="grad-dial-face" aria-hidden />
      {/* Rotating beam — hard sharp leading edge at the needle, soft trail behind.
          Both dials share the same blue-to-light-blue gradient. */}
      <div className="grad-beam" style={rotate} aria-hidden>
        <div className="grad-beam-wedge" />
      </div>
      <svg className="grad-ticks" viewBox="0 0 200 200" aria-hidden>
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
      {/* Slim dark needle with a thin bright edge. No tip dot, no hub. */}
      <div className="grad-needle" style={rotate} aria-hidden>
        <i className="grad-needle-bar" />
      </div>
    </div>
  );
}

/**
 * RF Gradient Sweep — twin light-sweep dials (MPH left, RPM right) around a
 * glowing center stack. Live values drive beam/needle rotation on the same
 * render path as every other cluster: the parent re-renders with new props,
 * we set rotation via inline style (transform-only, GPU friendly).
 */
export function GradientCluster({
  rpmNorm,
  speedNorm,
  rpm,
  speed,
  unit = 'mph',
  gear,
}: GradientClusterProps) {
  const rpmPct = clamp01(rpmNorm);
  const speedPct = clamp01(speedNorm);

  const rpmShow = rpm != null ? Math.round(rpm).toLocaleString() : `${Math.round(rpmPct * 100)}%`;
  const speedShow = speed != null ? Math.round(speed) : Math.round(speedPct * 160);
  const gearShow = gear === 0 ? 'N' : (gear ?? '–');
  const unitShow = unit === 'kph' ? 'KM/H' : 'MPH';

  const leftTone = GRADIENT_DIAL_MAP.left;
  const rightTone = GRADIENT_DIAL_MAP.right;

  return (
    <div
      className="grad-cluster"
      role="img"
      aria-label={`Gradient cluster: ${speedShow} ${unitShow}, ${rpmShow} RPM, gear ${gearShow}`}
    >
      <div className="grad-housing">
        <Dial
          pct={leftTone === 'rpm' ? rpmPct : speedPct}
          tone={leftTone}
          label={leftTone === 'rpm' ? 'Engine RPM' : 'Speed'}
        />
        <div className="grad-center">
          <div className="grad-gear">
            <span>{gearShow}</span>
          </div>
          <div className="grad-speed">
            <strong>{speedShow}</strong>
            <small>{unitShow}</small>
          </div>
          <div className="grad-rpm-pill">
            <span>{rpmShow} RPM</span>
          </div>
        </div>
        <Dial
          pct={rightTone === 'rpm' ? rpmPct : speedPct}
          tone={rightTone}
          label={rightTone === 'rpm' ? 'Engine RPM' : 'Speed'}
        />
      </div>
    </div>
  );
}
