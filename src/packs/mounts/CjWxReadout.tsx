/**
 * MOCK (mock/cj-map-first, not shipped): Carrier Jet OAT readout (MATRIX look, Board 2: map-first Drive and Park).
 * Sits in the bottom-right corner of the SPEED cell (the FLIGHT group's air data, under the digits, right of
 * MPH / GPS LIVE: an OAT legend over `glyph 79° · 25m`; the 773 cell drops the legend and uses one line under GPS LIVE); drawn by the host layer over the skin cell, so nothing in the skin moves. Values come only from
 * ?cjWxMock=… (carrier-jet/wxMock.ts). Static: no flashing, no motion.
 */
import type { CSSProperties } from 'react';
import type { Box } from '../carrier-jet/geometry';
import type { WxCond, WxView } from '../carrier-jet/wxMock';
import { wxGlyph } from '../carrier-jet/wxGlyphs';

export function WxGlyph({ cond, night, className }: { cond: WxCond; night: boolean; className?: string }) {
  return (
    <svg className={className ?? 'cjwx-glyph'} viewBox="0 0 24 24" aria-hidden="true" data-cond={cond} data-night={night || undefined}>
      {wxGlyph(cond, night).map((p, i) => (
        <path key={i} d={p.d} className={p.fill === 'bg' ? 'cjwx-bgfill' : undefined} strokeDasharray={p.dash} />
      ))}
    </svg>
  );
}

export function CjWxReadout({ box, view }: { box: Box; view: WxView }) {
  const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height };
  return (
    <div className="cjwx-host" style={style}>
      <div className="cjwx" role="img" aria-label={view.aria} data-dim={view.dim || undefined} data-aged={view.age ? true : undefined}>
        <span className="cjwx-oat" aria-hidden="true">OAT</span>
        <span className="cjwx-line" aria-hidden="true">
          {view.cond && <WxGlyph cond={view.cond} night={view.night} />}
          <b className="cjwx-t">{view.temp}</b>
          {view.age && <span className="cjwx-age">· {view.age}</span>}
        </span>
      </div>
    </div>
  );
}
