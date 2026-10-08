import type { CSSProperties } from 'react';

interface Props {
  rpmNorm: number;
  speedNorm: number;
  throttle: number;
  loadFeel: number;
}

const LOAD_R = 136;
const LOAD_C = 2 * Math.PI * LOAD_R;
const CHEVRON_COUNT = 6;
const AOA_R = 42;
const AOA_C = Math.PI * AOA_R; // half-circle arc length

/** AB ARMED from throttle / rpm / loadFeel (Audio getHud) — high-power afterburn cue. */
function afterburnArmed(throttle: number, rpmNorm: number, loadFeel: number): boolean {
  return (
    (throttle >= 0.72 && rpmNorm >= 0.65) ||
    (rpmNorm >= 0.78 && loadFeel >= 0.55) ||
    (throttle >= 0.82 && loadFeel >= 0.5)
  );
}

/**
 * Original aerospace HUD plate — pitch ladder + canopy + glanceable secondary gauges.
 * Does not own SPEED/LOAD. Decorative gauges are CSS/SVG only (pointer-events none).
 * No real F-14 / SW IP — invented geometry.
 */
export function AerospaceF14Overlay({ rpmNorm, speedNorm, throttle, loadFeel }: Props) {
  const rpm = Math.max(0, Math.min(1, rpmNorm));
  const thr = Math.max(0, Math.min(1, throttle));
  const load = Math.max(0, Math.min(1, loadFeel));
  const spd = Math.max(0, Math.min(1, speedNorm));
  const armed = afterburnArmed(thr, rpm, load);
  const litChevrons = Math.round(thr * CHEVRON_COUNT);
  const dashOffset = LOAD_C * (1 - load);
  const tipDeg = load * 360;
  const climbOffset = armed ? -10 : Math.round((load - 0.35) * 18);
  const accent = armed ? '#ffc850' : '#7cffb2';
  const accentHot = armed ? '#ff7a2e' : '#7cffb2';

  // Secondary cues — decorative / live from rpmNorm · throttle · loadFeel
  const aoa = Math.max(0, Math.min(1, load * 0.65 + thr * 0.35));
  const aoaDash = AOA_C * (1 - aoa);
  const vsi = Math.max(-1, Math.min(1, (thr - 0.45) * 1.4 + (load - 0.4) * 0.8));
  const vsiY = 100 - vsi * 72; // center 100, ± ±72
  const abPct = Math.round(Math.max(0, Math.min(1, (thr - 0.55) / 0.45)) * 100);
  const horizonTilt = (load - 0.5) * 12 + (armed ? -4 : 0); // degrees, subtle

  return (
    <div
      className={`aero-f14-overlay ${armed ? 'armed' : ''}`}
      style={
        {
          ['--aero-rpm']: rpm,
          ['--aero-speed']: spd,
          ['--aero-throttle']: thr,
          ['--aero-load']: load,
          ['--aero-aoa']: aoa,
          ['--aero-vsi']: vsi,
          ['--aero-ab']: abPct / 100,
          ['--aero-horizon']: `${horizonTilt}deg`,
        } as CSSProperties
      }
    >
      <div className="aero-scanlines" />
      <div className="aero-grid" />
      {armed && <div className="aero-heat-band" aria-hidden />}

      <div className="aero-status">
        <span className="aero-status-name aero-stencil">TOMCAT</span>
        <span className="aero-status-lat aero-stencil">AEROSPACE · DRIVE</span>
        <span className={`aero-ab-pill aero-stencil ${armed ? 'on' : ''}`}>
          {armed ? 'AB ARMED' : 'AB STBY'}
        </span>
      </div>

      {/* Thin AOA-style arc — left periphery, away from SPEED */}
      <svg className="aero-aoa" viewBox="0 0 56 110" aria-hidden>
        <path
          d="M48 8 A42 42 0 0 0 48 102"
          fill="none"
          stroke={armed ? 'rgba(255,122,46,0.22)' : 'rgba(124,255,178,0.18)'}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          className="aero-aoa-fill"
          d="M48 8 A42 42 0 0 0 48 102"
          fill="none"
          stroke={accentHot}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={AOA_C}
          strokeDashoffset={aoaDash}
          opacity="0.9"
        />
        <text x="28" y="58" className="aero-gauge-label" fill={accent} textAnchor="middle">
          AOA
        </text>
      </svg>

      {/* VSI-style tick ladder — right periphery */}
      <svg className="aero-vsi" viewBox="0 0 36 200" aria-hidden>
        <line x1="18" y1="12" x2="18" y2="188" stroke={accent} strokeWidth="0.7" opacity="0.35" />
        {[12, 40, 68, 100, 132, 160, 188].map((y, i) => (
          <line
            key={y}
            x1={i === 3 ? 4 : 10}
            y1={y}
            x2="28"
            y2={y}
            stroke={accent}
            strokeWidth={i === 3 ? 1.4 : 0.9}
            opacity={i === 3 ? 0.85 : 0.4}
          />
        ))}
        <circle cx="18" cy={vsiY} r="3.2" fill={accentHot} opacity="0.95" className="aero-vsi-bug" />
        <text x="18" y="8" className="aero-gauge-label" fill={accent} textAnchor="middle" fontSize="7">
          VSI
        </text>
      </svg>

      {/* AB % strip — bottom-right, decorative */}
      <div className="aero-ab-strip" aria-hidden>
        <span className="aero-ab-strip-label aero-stencil">AB%</span>
        <div className="aero-ab-strip-track">
          <div className="aero-ab-strip-fill" style={{ width: `${abPct}%` }} />
        </div>
        <span className="aero-ab-strip-val aero-stencil">{abPct}</span>
      </div>

      <div className="aero-throttle" aria-hidden>
        <span className="aero-thr-label aero-stencil">THR</span>
        <div className={`aero-chevrons ${armed ? 'hot' : ''}`}>
          {Array.from({ length: CHEVRON_COUNT }, (_, i) => (
            <span key={i} className={i < litChevrons ? 'on' : ''} />
          ))}
        </div>
      </div>

      {/* Invented trapezoid canopy silhouette — not military IP */}
      <svg className="aero-canopy" viewBox="0 0 420 420" aria-hidden>
        <defs>
          <linearGradient id="aeroFrameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
            <stop offset="45%" stopColor={armed ? '#7cffb2' : '#8aa0a8'} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accentHot} stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <path
          d="M70 50 L350 50 L390 140 L390 300 L350 370 L70 370 L30 300 L30 140 Z"
          fill="none"
          stroke="url(#aeroFrameGrad)"
          strokeWidth={armed ? 1.6 : 1.4}
          opacity={armed ? 0.9 : 0.75}
        />
        <path
          d="M90 70 L330 70 L360 145 L360 290 L330 350 L90 350 L60 290 L60 145 Z"
          fill={armed ? 'rgba(255,200,80,0.04)' : 'rgba(124,255,178,0.03)'}
          stroke={accent}
          strokeWidth={armed ? 0.8 : 0.7}
          opacity={armed ? 0.5 : 0.4}
        />
        <g stroke={accent} strokeWidth={armed ? 1.8 : 1.6} fill="none" opacity="0.85">
          <path d="M70 50 L70 78 M70 50 L98 50" />
          <path d="M350 50 L350 78 M350 50 L322 50" />
          <path d="M70 370 L70 342 M70 370 L98 370" />
          <path d="M350 370 L350 342 M350 370 L322 370" />
        </g>
      </svg>

      <svg
        className="aero-ladder"
        viewBox="0 0 340 340"
        role="img"
        aria-label={
          armed
            ? `Pitch reference climb cue at ${Math.round(load * 100)} percent load`
            : `Pitch ladder level flight at ${Math.round(load * 100)} percent load`
        }
      >
        <defs>
          <filter id="aeroBloom" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="170" cy="170" r="148" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.22" />
        <circle
          cx="170"
          cy="170"
          r="120"
          fill="none"
          stroke={armed ? '#ff7a2e' : '#8aa0a8'}
          strokeWidth="0.8"
          opacity="0.32"
          strokeDasharray="4 6"
        />

        {/* Horizon tick — subtle bank cue; SPEED stays dominant */}
        <g
          className="aero-horizon"
          transform={`rotate(${horizonTilt} 170 170)`}
          stroke={accent}
          strokeLinecap="square"
          filter="url(#aeroBloom)"
        >
          <line x1="118" y1="170" x2="148" y2="170" strokeWidth="1.6" opacity="0.55" />
          <line x1="192" y1="170" x2="222" y2="170" strokeWidth="1.6" opacity="0.55" />
          <line x1="168" y1="170" x2="172" y2="170" strokeWidth="2.2" opacity="0.9" />
        </g>

        <g
          transform={`translate(0 ${climbOffset})`}
          stroke={accent}
          strokeLinecap="square"
          filter="url(#aeroBloom)"
        >
          <g opacity="0.55" strokeWidth="1.2">
            <line x1="110" y1="58" x2="140" y2="58" />
            <line x1="200" y1="58" x2="230" y2="58" />
            <line x1="140" y1="58" x2="140" y2="64" />
            <line x1="200" y1="58" x2="200" y2="64" />
          </g>
          <g opacity="0.7" strokeWidth="1.4">
            <line x1="95" y1="98" x2="145" y2="98" />
            <line x1="195" y1="98" x2="245" y2="98" />
            <line x1="145" y1="98" x2="145" y2="106" />
            <line x1="195" y1="98" x2="195" y2="106" />
          </g>
          <g strokeWidth={armed ? 2.4 : 2.2} opacity="0.95">
            <line x1="55" y1="170" x2="130" y2="170" />
            <line x1="210" y1="170" x2="285" y2="170" />
            <path
              d={armed ? 'M155 170 L170 152 L185 170 L170 166 Z' : 'M155 170 L170 155 L185 170 L170 168 Z'}
              fill={accent}
              stroke="none"
            />
          </g>
          <g opacity="0.7" strokeWidth="1.4">
            <line x1="95" y1="242" x2="145" y2="242" />
            <line x1="195" y1="242" x2="245" y2="242" />
            <line x1="145" y1="242" x2="145" y2="234" />
            <line x1="195" y1="242" x2="195" y2="234" />
          </g>
          <g opacity="0.55" strokeWidth="1.2">
            <line x1="110" y1="282" x2="140" y2="282" />
            <line x1="200" y1="282" x2="230" y2="282" />
            <line x1="140" y1="282" x2="140" y2="276" />
            <line x1="200" y1="282" x2="200" y2="276" />
          </g>
        </g>

        <g
          className="aero-stencil-svg"
          fontSize="10"
          fill={accent}
          opacity="0.65"
          letterSpacing="0.12em"
          transform={`translate(0 ${climbOffset})`}
        >
          <text x="100" y="62" textAnchor="end">
            +20
          </text>
          <text x="240" y="62">
            +20
          </text>
          <text x="85" y="102" textAnchor="end">
            +10
          </text>
          <text x="255" y="102">
            +10
          </text>
          <text x="85" y="246" textAnchor="end">
            −10
          </text>
          <text x="255" y="246">
            −10
          </text>
          <text x="100" y="286" textAnchor="end">
            −20
          </text>
          <text x="240" y="286">
            −20
          </text>
        </g>

        <g filter="url(#aeroBloom)">
          <circle
            cx="170"
            cy="170"
            r={LOAD_R}
            fill="none"
            stroke={armed ? 'rgba(255,122,46,0.18)' : 'rgba(124,255,178,0.12)'}
            strokeWidth={armed ? 5 : 4}
          />
          <circle
            className="aero-load-arc"
            cx="170"
            cy="170"
            r={LOAD_R}
            fill="none"
            stroke={accentHot}
            strokeWidth={armed ? 5 : 4}
            strokeLinecap="round"
            strokeDasharray={LOAD_C}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 170 170)"
            opacity="0.9"
          />
          <circle
            className="aero-load-tip"
            cx="170"
            cy={170 - LOAD_R}
            r="3.5"
            fill={accent}
            opacity="0.95"
            transform={`rotate(${tipDeg} 170 170)`}
          />
        </g>

        <text
          x="170"
          y="210"
          textAnchor="middle"
          className="aero-stencil-svg"
          fontSize="10"
          fill={armed ? '#ffc850' : '#8aa0a8'}
          letterSpacing="0.28em"
          opacity="0.8"
        >
          PITCH REF
        </text>
        <text
          x="170"
          y="228"
          textAnchor="middle"
          className="aero-stencil-svg"
          fontSize="14"
          fontWeight="700"
          fill={accentHot}
          letterSpacing="0.16em"
        >
          {armed ? '+CLIMB' : 'LVL'}
        </text>
      </svg>

      <div className="aero-footer">
        <span className="aero-mode aero-stencil">
          {armed ? 'AFTERBURN' : 'FLIGHT STANDBY'}
        </span>
      </div>
    </div>
  );
}
