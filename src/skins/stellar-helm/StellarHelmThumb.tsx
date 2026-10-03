import './stellar-helm.css';

/**
 * Picker thumbnail (decorative) — shows the default CLASSIC frame: rounded elbow,
 * colour-block tabs/bar, orange-framed RPM/MPH screen, purple ring panel.
 * Rings counter-rotate via CSS; still under Reduce Motion.
 */
export function StellarHelmThumb() {
  return (
    <svg viewBox="0 0 120 78" style={{ width: '100%', height: '100%' }} aria-hidden="true">
      <rect width="120" height="78" rx="6" fill="#000" />
      {/* top elbow + bar blocks */}
      <path d="M5 24 V13 a8 8 0 0 1 8 -8 H40 v5 H15 a3 3 0 0 0 -3 3 V24 Z" fill="#ffb13b" />
      <rect x="42" y="5" width="20" height="5" fill="#ffb13b" />
      <rect x="64" y="5" width="6" height="5" fill="#e290ff" />
      <rect x="72" y="5" width="26" height="5" fill="#ff8f1f" />
      <rect x="100" y="5" width="15" height="5" fill="#ffcc99" />
      {/* tab blocks */}
      <rect x="5" y="26" width="16" height="7" fill="#fff" />
      <rect x="5" y="35" width="16" height="7" fill="#e290ff" />
      <rect x="5" y="44" width="16" height="7" fill="#ffcc99" />
      <rect x="5" y="53" width="16" height="7" fill="#9ab8ff" />
      {/* bottom elbow + bar */}
      <path d="M5 62 h16 v4 h3 v7 H13 a8 8 0 0 1 -8 -8 Z" fill="#e290ff" />
      <rect x="26" y="66" width="13" height="7" fill="#ffb13b" />
      <rect x="41" y="66" width="13" height="7" fill="#e290ff" />
      <rect x="56" y="66" width="13" height="7" fill="#e290ff" />
      <rect x="71" y="66" width="13" height="7" fill="#9ab8ff" />
      <path d="M86 66 h25 a3.5 3.5 0 0 1 0 7 h-25 Z" fill="#ff5b45" />
      {/* RPM / MPH screen in its orange frame */}
      <path d="M24 13 h36 a9 9 0 0 1 9 9 v31 a9 9 0 0 1 -9 9 h-36 Z" fill="#ffb13b" />
      <rect x="24" y="16" width="35" height="43" fill="#000" />
      <text x="57" y="27" textAnchor="end" fill="#ffb13b" fontSize="11" fontFamily="Antonio, ui-monospace, monospace">3600</text>
      <rect x="27" y="30" width="30" height="2" fill="#3a1050" />
      <rect x="27" y="30" width="15" height="2" fill="#7a22a0" />
      <text x="57" y="51" textAnchor="end" fill="#ff8f1f" fontSize="18" fontFamily="Antonio, ui-monospace, monospace">67</text>
      <rect x="27" y="55" width="30" height="2.5" rx="1.25" fill="#1c1c1c" />
      <rect x="27" y="55" width="9" height="2.5" rx="1.25" fill="#9cd65f" />
      {/* ring panel */}
      <path d="M72 13 h43 v39 a10 10 0 0 1 -10 10 h-23 a10 10 0 0 1 -10 -10 Z" fill="#7a22a0" />
      <rect x="72" y="13" width="43" height="6" fill="#e290ff" />
      <g transform="translate(93.5 40)">
        <g className="sh-thumb-outer"><circle r="16" fill="none" stroke="#e290ff" strokeWidth="3" strokeDasharray="14 3 6 3 20 3" /></g>
        <g className="sh-thumb-inner"><circle r="11" fill="none" stroke="#ffb13b" strokeWidth="3.5" strokeDasharray="16 3 7 3 10 3" /></g>
        <circle r="7.5" fill="#000" />
        <text y="4" textAnchor="middle" fill="#e290ff" fontSize="11" fontFamily="Antonio, ui-monospace, monospace">5</text>
      </g>
    </svg>
  );
}
