import type { CSSProperties } from 'react';
import { Eng, Lock, Sr, useSvgPrefix } from './art';
import { GUARD_BAND, TOGGLE_MIN } from './tokens';
import type { CjGuardedCoverProps } from '../types';
import './parts.css';

/** Band geometry in units: engraved name, then the hinge barrel the cover swings on. */
const NAME_Y = 15;
const HINGE_Y = 30;
const HINGE_H = 7;

/**
 * Spring-loaded hinged guard over a switch. Layout: a 44-unit band (engraved name + hinge barrel) above the
 * child; viewBox width = `childWidth`. Closed: the striped lid lies over the child, the whole part is the cover
 * button and the child is `inert`. Open: the lid folds up to a foreshortened underside strip above the hinge,
 * the cover button shrinks to the band (>= 44 tall) and the child is live. The flip is transform/opacity only
 * (160ms), instant under Reduce Motion.
 */
export function GuardedCover({ id, guardOpen, onGuardToggle, children, name, ariaLabel, stripe = 'red-yellow', disabled, disabledReason, childWidth = TOGGLE_MIN.w, childHeight = TOGGLE_MIN.h, keepNameOpen }: CjGuardedCoverProps & { /** internal: keep the band name while open (APU block) */ keepNameOpen?: boolean }) {
  const p = useSvgPrefix('g');
  const W = childWidth, B = GUARD_BAND, H = B + childHeight;
  const lidTop = HINGE_Y + 3, lidH = H - lidTop - 2;
  const descId = disabled && disabledReason ? `${p}d` : undefined;
  // stripe period 16 units along a -45° gradient line of length (w + h)·0.707
  const period = (16 / ((W - 4 + lidH) * Math.SQRT1_2)) * 100;
  const style = {
    '--vbw': W, '--vbh': H, '--band': B, '--hinge-y': HINGE_Y, '--hinge-h': HINGE_H, '--lid-top': lidTop, '--lid-h': lidH,
    '--stripe': `${period.toFixed(2)}%`, aspectRatio: `${W} / ${H}`, minWidth: W,
  } as CSSProperties;
  const tab = disabled ? 'LOCKED' : 'LIFT ▲';
  const tabW = Math.min(W - 10, disabled ? 58 : 48);
  const tabY = lidH / 2;
  return (
    <div className="cjp cjp-guarded" data-open={guardOpen} data-stripe={stripe} data-disabled={disabled || undefined} data-guard={id} data-keep-name={keepNameOpen || undefined} style={style}>
      <svg viewBox={`0 0 ${W} ${B}`} className="cjp-svg cjp-guarded-name" aria-hidden="true" focusable="false">
        <Eng x={W / 2} y={NAME_Y} tone={disabled ? 'grey' : 'white'} fit={W - 4}>{name.toUpperCase()}</Eng>
      </svg>
      <div className="cjp-guarded-child" inert={!guardOpen || undefined}>{children}</div>
      <span className="cjp-under" aria-hidden="true" />
      <span className="cjp-lid" aria-hidden="true">
        <svg viewBox={`0 0 ${W - 4} ${lidH}`} className="cjp-svg" focusable="false">
          <rect x={(W - 4 - tabW) / 2} y={tabY - 9} width={tabW} height={18} rx={2} fill="#17191a" />
          {disabled ? <Lock x={(W - 4 - tabW) / 2 + 3} y={tabY - 6} /> : null}
          <Eng x={(W - 4) / 2 + (disabled ? 6 : 0)} y={tabY + 4} tone={disabled ? 'grey' : 'white'} ls={0.02} fit={tabW - (disabled ? 16 : 4)}>{tab}</Eng>
        </svg>
      </span>
      <span className="cjp-hinge" aria-hidden="true" />
      <button
        type="button"
        className="cjp-cover"
        aria-expanded={guardOpen}
        aria-label={ariaLabel ?? `${name} guard, ${guardOpen ? 'open' : 'closed'}`}
        aria-disabled={disabled || undefined}
        aria-describedby={descId}
        onClick={() => { if (!disabled) onGuardToggle(id); }}
      />
      {descId ? <Sr id={descId}>{disabledReason}</Sr> : null}
    </div>
  );
}

/** Same part under the name used in the brief. */
export const GuardedToggle = GuardedCover;
