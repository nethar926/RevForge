import { wingPts } from './parts';
import './carrier-jet.css';

const CX = 60, CY = 40, S = 0.3;
const pts = (a: [number, number][]) => a.map(([x, y]) => `${(CX + x * S).toFixed(1)},${(CY + y * S).toFixed(1)}`).join(' ');
const BODY: [number, number][] = [[0, -100], [7.5, -74], [12, -46], [15, -36], [33, -10], [36, -2], [35, 6], [29, 22], [27, 70], [26, 90], [18, 99], [9, 99], [5, 93], [0, 94]];
const body = [...BODY, ...BODY.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
const STAB: [number, number][] = [[23, 60], [58, 82], [60, 88], [58, 95], [24, 90]];

/**
 * Picker thumbnail (decorative): the default SWING WING look, a night deck with the
 * swing-wing planform. Wings sweep 20°→68° via CSS only (no SMIL); still at 30° under Reduce Motion.
 */
export function CarrierJetThumb() {
  // Wing pivots: (CX ± 29·S, CY − 3·S) = (68.7 | 51.3, 39.1), mirrored in carrier-jet.css.
  return (
    <svg viewBox="0 0 120 78" style={{ width: '100%', height: '100%' }} aria-hidden="true" focusable="false">
      <rect width="120" height="78" rx="6" fill="#0b1018" />
      <rect x="4" y="4" width="112" height="70" rx="4" fill="#101722" stroke="#233246" />
      <line x1="60" y1="4" x2="60" y2="74" stroke="#4c5561" strokeWidth="1.5" strokeDasharray="6 5" />
      <line x1="4" y1="66" x2="116" y2="52" stroke="#8a7425" strokeWidth="1.5" strokeDasharray="4 3" />
      {[12, 26, 40, 54, 68].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" fill="#4592e0" />
          <circle cx="111" cy={y} r="1.6" fill="#4592e0" />
        </g>
      ))}
      <polygon points={pts(STAB)} fill="#243243" stroke="#d5dee8" strokeWidth="0.8" />
      <polygon points={pts(STAB.map(([x, y]) => [-x, y]))} fill="#243243" stroke="#d5dee8" strokeWidth="0.8" />
      <g className="cj-thumb-wing-r">
        <polygon points={pts(wingPts(0, 1))} fill="#3b4d63" stroke="#ffc35a" strokeWidth="1" strokeLinejoin="round" />
      </g>
      <g className="cj-thumb-wing-l">
        <polygon points={pts(wingPts(0, -1))} fill="#3b4d63" stroke="#ffc35a" strokeWidth="1" strokeLinejoin="round" />
      </g>
      <polygon points={pts(body)} fill="#243243" stroke="#d5dee8" strokeWidth="0.8" strokeLinejoin="round" />
      <ellipse cx="60" cy={CY - 63 * S} rx="1.3" ry="3.9" fill="#0b1018" stroke="#d5dee8" strokeWidth="0.5" />
      <rect x="8" y="8" width="30" height="18" rx="3" fill="#0b1018" stroke="#5f7a99" strokeWidth="0.8" />
      <text x="23" y="22" textAnchor="middle" fill="#ffc35a" fontSize="14" fontFamily="Oswald, sans-serif">F-14</text>
    </svg>
  );
}
