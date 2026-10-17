/**
 * Carrier Jet OAT readout (Meghan's mock a7fce46, ported) (MATRIX look, Board 2: map-first Drive and Park).
 * Sits in the top-left corner of the COMPASS cell (left of the HDG box, above the rose arc; Wilson, Oct 16): an OAT
 * legend over `glyph 79° · 25m` on the wide cells (1256/1280); the narrow 773 corner (~35 px, rose ticks ~50 px
 * down) stacks glyph / 79° / 25m in one column and drops the OAT legend (the aria label still says outside air). Drawn by the host layer over the skin cell, so nothing in the skin moves. Values come only from
 * wxStore.ts (live weather module) through wxView (carrier-jet/wxView.ts). Static: no flashing, no motion.
 */
import type { CSSProperties } from 'react';
import type { Box } from '../carrier-jet/geometry';
import type { WxCond, WxView } from '../carrier-jet/wxView';
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
          {view.age && (
            <span className="cjwx-age">
              <i className="cjwx-sep">· </i>
              {view.age}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
