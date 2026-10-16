import type { CSSProperties } from 'react';
import { Bat, Defs, Eng, Sr, useSvgPrefix } from './art';
import { RADAR_MIN, RADAR_MIN_NARROW } from './tokens';
import type { CjRadarToggleProps } from '../types';
import './parts.css';

/**
 * RADAR bat toggle for the bank beside the GPS plate: engraved RADAR, ON above / OFF below the lever. The whole
 * plate is one `<button role="switch">` (56×118, 'narrow' 44×118). The active throw legend is lit.
 */
export function RadarToggle({ on, onToggle, size = 'wide', bare, disabled, disabledReason }: CjRadarToggleProps) {
  const p = useSvgPrefix('r');
  const M = size === 'narrow' ? RADAR_MIN_NARROW : RADAR_MIN;
  const W = M.w, H = M.h, cx = W / 2;
  const descId = disabled && disabledReason ? `${p}d` : undefined;
  return (
    <button
      type="button"
      className={`cjp cjp-radar${bare ? '' : ' cjp-metal'}`}
      role="switch"
      aria-checked={on}
      aria-label="Radar"
      aria-disabled={disabled || undefined}
      aria-describedby={descId}
      data-on={on}
      style={{ aspectRatio: `${W} / ${H}`, minWidth: W } as CSSProperties}
      onClick={() => { if (!disabled) onToggle(!on); }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
        <Defs p={p} />
        <Eng x={cx} y={19} tone={disabled ? 'grey' : 'white'} ls={size === 'narrow' ? 0 : 0.08} fit={W - 3}>RADAR</Eng>
        <Eng x={cx} y={36} tone={on && !disabled ? 'green' : 'grey'} glow={on && !disabled}>ON</Eng>
        <Bat p={p} x={cx - 16} y={42} pos={on ? 'up' : 'down'} dim={disabled} />
        <Eng x={cx} y={100} tone={on ? 'grey' : 'white'}>OFF</Eng>
      </svg>
      {descId ? <Sr id={descId}>{disabledReason}</Sr> : null}
    </button>
  );
}
