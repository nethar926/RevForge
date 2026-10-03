import type { CSSProperties } from 'react';

export interface EnterpriseClusterProps {
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

/** Chunky segments in the RPM bar — fills from the right, per the mockup. */
const SEGS = 2;

/**
 * Ring spin: always turning, faster with value.
 * Idle ~8s/rev, full tilt ~1.6s/rev. Set via inline animation-duration so the
 * parent render loop (same path as every other cluster) drives it live.
 */
const spinDur = (pct: number) => `${(2 / (0.25 + clamp01(pct))).toFixed(2)}s`;

/**
 * RF Enterprise — strict LCARS command cluster, reflowable.
 * Geometry follows the design wireframe: left orange P-mass with a nested
 * black inset (RPM over a purple rule over huge MPH over a chunky green
 * right-to-left RPM bar), a center orange LCARS block, a right purple panel
 * whose warp rings straddle the WARP header boundary, and a bottom orange
 * strip with a black inset. All sizing is proportional (container units) so
 * the design scales without distortion.
 */
export function EnterpriseCluster({
  rpmNorm,
  speedNorm,
  rpm,
  speed,
  unit = 'mph',
  gear,
}: EnterpriseClusterProps) {
  const rpmPct = clamp01(rpmNorm);
  const speedPct = clamp01(speedNorm);

  const rpmShow = rpm != null ? String(Math.round(rpm)) : `${Math.round(rpmPct * 100)}%`;
  const speedShow = speed != null ? Math.round(speed) : Math.round(speedPct * (unit === 'kph' ? 260 : 160));
  const gearShow = gear === 0 ? 'N' : (gear ?? '–');
  const unitShow = unit === 'kph' ? 'KPH' : 'MPH';
  const filled = Math.ceil(rpmPct * SEGS);

  return (
    <div
      className="ent"
      role="img"
      aria-label={`Saffron Command cluster: ${speedShow} ${unitShow}, ${rpmShow} RPM, gear ${gearShow}`}
    >
      <div className="ent-inner">
      <div className="ent-main">
        <section className="ent-left" aria-label="Speed and RPM">
          <div className="ent-inset">
            <div className="ent-top">
              <strong className="ent-num ent-rpm-num">{rpmShow}</strong>
              <span className="ent-label">RPM</span>
            </div>
            <div className="ent-rule" aria-hidden />
            <div className="ent-bottom">
              <div className="ent-line">
                <strong className="ent-num ent-speed-num">{speedShow}</strong>
                <span className="ent-label">{unitShow}</span>
              </div>
              <div className="ent-bar" role="img" aria-label={`RPM ${Math.round(rpmPct * 100)} percent`}>
                <i className={filled >= 2 ? 'on' : ''} aria-hidden />
                <i className={filled >= 1 ? 'on' : ''} aria-hidden />
              </div>
            </div>
          </div>
        </section>

        <div className="ent-center" aria-hidden />

        <section className="ent-right" aria-label="Drive rings">
          <div className="ent-warp">
            <span className="ent-label ent-warp-label">WARP</span>
          </div>
          <div
            className="ent-rings"
            style={{ animationDuration: spinDur(speedPct) } as CSSProperties}
            aria-hidden
          >
            <svg viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="84"
                fill="none"
                stroke="#7b2f9e"
                strokeWidth="22"
                strokeLinecap="round"
                strokeDasharray="200 328"
              />
            </svg>
          </div>
          <div
            className="ent-rings ent-rings--inner"
            style={{ animationDuration: spinDur(rpmPct) } as CSSProperties}
            aria-hidden
          >
            <svg viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="60"
                fill="none"
                stroke="#f9a825"
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray="150 60 110 57"
              />
              <circle
                cx="100"
                cy="100"
                r="42"
                fill="none"
                stroke="#c58fd0"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="100 164"
              />
            </svg>
          </div>
          <div className="ent-gear" aria-hidden>
            <span className="ent-num">{gearShow}</span>
          </div>
        </section>
      </div>
      <div className="ent-foot" aria-hidden>
        <i />
      </div>
      </div>
    </div>
  );
}
