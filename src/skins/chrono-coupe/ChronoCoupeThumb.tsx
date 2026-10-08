import './chrono-coupe.css';

/** Picker thumbnail (decorative). Glow pulse is CSS and stops under Reduce Motion. */
export function ChronoCoupeThumb() {
  return (
    <svg viewBox="0 0 120 78" style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <rect width="120" height="78" rx="6" fill="#0f0f11" />
      {/* Date windows: 11-unit text (>=11px in the picker card), slightly tightened so 11 chars fit. */}
      <rect x="3" y="3" width="80" height="16" rx="2" fill="#2a2b2e" />
      <rect x="3" y="21" width="80" height="16" rx="2" fill="#2a2b2e" />
      <rect x="3" y="39" width="80" height="16" rx="2" fill="#2a2b2e" />
      <text x="6" y="15" fill="#ff3b2f" fontSize="11" letterSpacing="-0.3" fontFamily="ui-monospace,monospace">JUL 04 1976</text>
      <text x="6" y="33" fill="#3dff6e" fontSize="11" letterSpacing="-0.3" fontFamily="ui-monospace,monospace">OCT 02 2026</text>
      <text x="6" y="51" fill="#ffb21e" fontSize="11" letterSpacing="-0.3" fontFamily="ui-monospace,monospace">SEP 20 2026</text>
      <text x="101" y="33" textAnchor="middle" fill="#ff3b2f" fontSize="22" fontFamily="ui-monospace,monospace">67</text>
      <rect x="87" y="40" width="29" height="4" rx="2" fill="#2a1a10" />
      <rect x="87" y="40" width="22" height="4" rx="2" fill="#ffb21e" />
      <g className="cc-thumb-glow">
        <path d="M14 61 L24 68 L34 61 M24 68 L24 75" stroke="#ffd36b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </g>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={46 + i * 9} y={74 - (5 + i * 1.6)} width="6" height={5 + i * 1.6} fill={i < 5 ? '#3dff6e' : i < 7 ? '#ffd23e' : '#5a1d18'} />
      ))}
    </svg>
  );
}
