import './chrono-coupe.css';

/** Picker thumbnail (decorative). Glow pulse is CSS and stops under Reduce Motion. */
export function ChronoCoupeThumb() {
  return (
    <svg viewBox="0 0 120 78" style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <rect width="120" height="78" rx="6" fill="#0f0f11" />
      <rect x="6" y="7" width="66" height="14" rx="2" fill="#2a2b2e" />
      <rect x="6" y="24" width="66" height="14" rx="2" fill="#2a2b2e" />
      <rect x="6" y="41" width="66" height="14" rx="2" fill="#2a2b2e" />
      <text x="10" y="18" fill="#ff3b2f" fontSize="9" fontFamily="ui-monospace,monospace">JUL 04 1976</text>
      <text x="10" y="35" fill="#3dff6e" fontSize="9" fontFamily="ui-monospace,monospace">OCT 02 2026</text>
      <text x="10" y="52" fill="#ffb21e" fontSize="9" fontFamily="ui-monospace,monospace">SEP 20 2026</text>
      <text x="97" y="34" textAnchor="middle" fill="#ff3b2f" fontSize="22" fontFamily="ui-monospace,monospace">67</text>
      <rect x="78" y="40" width="38" height="4" rx="2" fill="#2a1a10" />
      <rect x="78" y="40" width="29" height="4" rx="2" fill="#ffb21e" />
      <g className="cc-thumb-glow">
        <rect x="18" y="59" width="12" height="17" rx="6" stroke="#ffd36b" strokeWidth="1.6" fill="none" />
        <path d="M20.5 63.5 H27.5 M20.5 67.5 H27.5 M20.5 71.5 H27.5" stroke="#ffd36b" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={46 + i * 9} y={74 - (5 + i * 1.6)} width="6" height={5 + i * 1.6} fill={i < 5 ? '#3dff6e' : i < 7 ? '#ffd23e' : '#5a1d18'} />
      ))}
    </svg>
  );
}
