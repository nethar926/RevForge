import './stellar-helm.css';

/** Picker thumbnail (decorative). Rings counter-rotate via CSS; still under Reduce Motion. */
export function StellarHelmThumb() {
  return (
    <svg viewBox="0 0 120 78" style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <rect width="120" height="78" rx="6" fill="#070c18" />
      <path d="M6 10 l4 -4 h40 v44 l-4 4 h-40 z" fill="#0f1a2e" stroke="#2c4366" strokeWidth="0.8" />
      <text x="46" y="26" textAnchor="end" fill="#eaf2ff" fontSize="11" fontFamily="Antonio, ui-monospace, monospace">3600</text>
      <text x="46" y="46" textAnchor="end" fill="#5ce1ff" fontSize="18" fontFamily="Antonio, ui-monospace, monospace">67</text>
      <g transform="translate(86 32)">
        <g className="sh-thumb-outer"><circle r="20" fill="none" stroke="#b49cff" strokeWidth="3" strokeDasharray="14 3 6 3 20 3" /></g>
        <g className="sh-thumb-inner"><circle r="14" fill="none" stroke="#5ce1ff" strokeWidth="4" strokeDasharray="16 3 7 3 10 3" /></g>
        <text y="4" textAnchor="middle" fill="#eaf2ff" fontSize="11" fontFamily="Antonio, ui-monospace, monospace">5</text>
      </g>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={6 + i * 9.3} y="62" width="7.5" height="7" fill={i < 7 ? '#5ce1ff' : i < 10 ? '#1c2a44' : '#4a1820'} />
      ))}
    </svg>
  );
}
