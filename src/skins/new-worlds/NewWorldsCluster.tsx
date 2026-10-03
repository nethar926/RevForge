import type { CSSProperties } from 'react';

export interface NewWorldsClusterProps {
  /** 0..1 */
  rpmNorm: number;
  /** 0..1 */
  speedNorm: number;
  /** Absolute values for readouts (ThemeStage provides these). */
  rpm?: number;
  /** Absolute speed in `unit`. */
  speed?: number;
  unit?: 'mph' | 'kph';
  gear?: number | string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/** Segments in the RPM bar — fills from the right. */
const SEGS = 12;

/**
 * Ring spin: always turning, faster with value.
 * Idle ~8s/rev, full tilt ~1.6s/rev. Set via inline animation-duration so the
 * parent render loop (same path as every other cluster) drives it live.
 */
const spinDur = (pct: number) => `${(2 / (0.25 + clamp01(pct))).toFixed(2)}s`;

/**
 * RF Enterprise — LCARS-style command cluster.
 * Left: orange LCARS panel, Oswald Black numerals (RPM over MPH), a purple
 * rule, and a green segmented RPM bar that fills right-to-left and turns red
 * at redline. Right: purple LCARS panel with a WARP header, twin warp rings
 * (outer spins with speed, inner with RPM) and the gear in purple at the core.
 */
export function NewWorldsCluster({
  rpmNorm,
  speedNorm,
  rpm,
  speed,
  unit = 'mph',
  gear,
}: NewWorldsClusterProps) {
  const rpmPct = clamp01(rpmNorm);
  const speedPct = clamp01(speedNorm);

  const rpmShow = rpm != null ? Math.round(rpm).toLocaleString() : `${Math.round(rpmPct * 100)}%`;
  const speedShow = speed != null ? Math.round(speed) : Math.round(speedPct * (unit === 'kph' ? 260 : 160));
  const gearShow = gear === 0 ? 'N' : (gear ?? '–');
  const unitShow = unit === 'kph' ? 'KPH' : 'MPH';
  const filled = Math.round(rpmPct * SEGS);

  return (
    <div
      className="nw"
      role="img"
      aria-label={`Saffron Console cluster: ${speedShow} ${unitShow}, ${rpmShow} RPM, gear ${gearShow}`}
    >
      <div className="nw-main">
        <section className="nw-left" aria-label="Speed and RPM">
          <div className="nw-inset">
            <div className="nw-line">
              <strong className="nw-num ent-rpm-num">{rpmShow}</strong>
              <span className="nw-label">RPM</span>
            </div>
            <div className="nw-rule" aria-hidden />
            <div className="nw-line">
              <strong className="nw-num ent-speed-num">{speedShow}</strong>
              <span className="nw-label">{unitShow}</span>
            </div>
            <div className="nw-bar" role="img" aria-label={`RPM ${Math.round(rpmPct * 100)} percent`} aria-hidden={false}>
              {Array.from({ length: SEGS }, (_, i) => (
                <i key={i} className={i >= SEGS - filled ? 'on' : ''} aria-hidden />
              ))}
            </div>
          </div>
        </section>

        <section className="nw-right" aria-label="Drive rings">
          <div className="nw-warp">
            <span className="nw-label ent-warp-label">WARP</span>
          </div>
          <div className="nw-rings">
            <div
              className="nw-ring"
              style={{ animationDuration: spinDur(speedPct) } as CSSProperties}
              aria-hidden
            >
              <svg viewBox="0 0 200 200">
                <circle
                  cx="100"
                  cy="100"
                  r="86"
                  fill="none"
                  stroke="#8e44ad"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray="210 330"
                />
              </svg>
            </div>
            <div
              className="nw-ring ent-ring--rev"
              style={{ animationDuration: spinDur(rpmPct) } as CSSProperties}
              aria-hidden
            >
              <svg viewBox="0 0 200 200">
                <circle
                  cx="100"
                  cy="100"
                  r="62"
                  fill="none"
                  stroke="#f5820d"
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeDasharray="150 60 110 70"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="44"
                  fill="none"
                  stroke="#c39bd3"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="100 177"
                />
              </svg>
            </div>
            <div className="nw-gear">
              <span className="nw-num">{gearShow}</span>
            </div>
          </div>
        </section>
      </div>
      <div className="nw-foot" aria-hidden>
        <i />
      </div>
    </div>
  );
}
