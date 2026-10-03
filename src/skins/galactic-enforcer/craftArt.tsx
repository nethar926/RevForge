/** Original craft wireframes (see craft.ts). Components only. */
export const DroneArt = () => (
  <>
    {/* hull + surfaces (outline) */}
    <g className="ge-craft-hull">
      <path d="M180 86L193 128L189 194L180 210L171 194L167 128Z" />
      <path d="M168 130Q126 138 102 186Q134 166 170 166Z" />
      <path d="M192 132L250 116L238 138L190 160Z" />
      <path d="M186 186L218 216L187 205Z" />
    </g>
    {/* wireframe detail */}
    <g className="ge-craft-wire">
      <path d="M180 92V204M174 128H186M172 150H188M172 172H188M174 192H186" />
      <path d="M176 112L184 112L186 128M176 112L174 128" />
      <path d="M167 140Q138 148 116 176M168 152Q146 158 128 172M150 140L144 162M134 148L128 168" />
      <path d="M194 140L240 126M196 150L234 134M214 124L210 146M228 120L224 140" />
      <path d="M192 196L208 208M190 190L196 204" />
      <path d="M139 152L162 147M207 133L230 126" />
    </g>
    <circle className="ge-craft-eye" cx="180" cy="118" r="5" />
  </>
);

export const InterceptorArt = () => (
  <>
    <g className="ge-craft-hull">
      <path d="M100 14L111 50L174 108L171 117L118 106L112 120H88L82 106L29 117L26 108L89 50Z" />
      <path d="M89 104L78 137L94 124ZM111 104L122 137L106 124Z" />
    </g>
    <g className="ge-craft-wire">
      <path d="M100 80V114M58 101L86 82M142 101L114 82" />
      <path d="M92 50H108M86 64H114M84 80H116M84 96H116" />
      <path d="M40 108L92 70M160 108L108 70M70 104L94 88M130 104L106 88" />
      <path d="M86 110L80 130M114 110L120 130" />
    </g>
    <ellipse className="ge-craft-eye" cx="100" cy="60" rx="6" ry="15" />
  </>
);

