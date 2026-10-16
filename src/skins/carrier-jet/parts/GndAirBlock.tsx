import type { CSSProperties } from 'react';
import { Bat, Defs, Eng, Lens, Lock, Sr, UNLIT_CLASS, useSvgPrefix } from './art';
import { BatToggle } from './BatToggle';
import { GND_AIR_MIN, nextToggle, TOGGLE_MIN } from './tokens';
import type { CjGndAirBlockProps } from '../types';
import './parts.css';

const XB_W = GND_AIR_MIN.w - TOGGLE_MIN.w - 4;

/**
 * Option B start block (140×96): GND AIR (air cart) bat toggle + X-BLEED bat toggle with L / R side lamps
 * (L left, R right: physical order). The lamp of `side` lights green steady.
 */
export function GndAirBlock({ aircart, crossbleed, side, onToggle, disabledReasons, steps }: CjGndAirBlockProps) {
  const p = useSvgPrefix('x');
  const H = GND_AIR_MIN.h;
  const xbLocked = disabledReasons?.crossbleed !== undefined;
  const descId = xbLocked && disabledReasons?.crossbleed ? `${p}d` : undefined;
  const sideName = side === 'L' ? 'left' : side === 'R' ? 'right' : 'none';
  return (
    <div className="cjp cjp-gndair" data-aircart={aircart} data-crossbleed={crossbleed} data-side={side ?? 'none'} style={{ aspectRatio: `${GND_AIR_MIN.w} / ${H}`, minWidth: GND_AIR_MIN.w } as CSSProperties}>
      <div style={{ width: `${(TOGGLE_MIN.w / GND_AIR_MIN.w) * 100}%` }}>
        <BatToggle
          id="aircart"
          label="GND AIR"
          state={aircart ? 'on' : 'off'}
          lit={aircart}
          legend={aircart ? 'CART' : 'OFF'}
          ariaLabel="Ground air cart"
          onToggle={(_, n) => onToggle('aircart', n)}
          disabled={disabledReasons?.aircart !== undefined}
          disabledReason={disabledReasons?.aircart}
          step={steps?.aircart}
        />
      </div>
      <div style={{ width: `${(XB_W / GND_AIR_MIN.w) * 100}%` }}>
        <button
          type="button"
          className="cjp cjp-toggle"
          role="switch"
          aria-checked={crossbleed}
          aria-label={`Crossbleed, air to ${sideName === 'none' ? 'no engine' : `${sideName} engine`}`}
          aria-disabled={xbLocked || undefined}
          aria-describedby={descId}
          data-sys="crossbleed"
          data-state={crossbleed ? 'on' : 'off'}
          style={{ aspectRatio: `${XB_W} / ${H}`, minWidth: XB_W }}
          onClick={() => { if (!xbLocked) onToggle('crossbleed', nextToggle(crossbleed ? 'on' : 'off')); }}
        >
          <svg viewBox={`0 0 ${XB_W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
            <Defs p={p} />
            <Eng x={XB_W / 2} y={16} tone={xbLocked ? 'grey' : 'white'} ls={0.02}>X-BLEED</Eng>
            {steps?.crossbleed != null ? <Eng x={XB_W - 3} y={36} anchor="end" tone="amber">{String(steps.crossbleed)}</Eng> : null}
            <Bat p={p} x={2} y={30} pos={crossbleed ? 'up' : 'down'} dim={xbLocked} />
            <Lens p={p} cx={45} cy={50} r={5.5} tone={side === 'L' ? 'green' : 'off'} />
            <Lens p={p} cx={64} cy={50} r={5.5} tone={side === 'R' ? 'green' : 'off'} />
            <Eng x={45} y={72} tone={side === 'L' ? 'green' : 'grey'} glow={side === 'L'}>L</Eng>
            <Eng x={64} y={72} tone={side === 'R' ? 'green' : 'grey'} glow={side === 'R'}>R</Eng>
            {xbLocked ? (
              <>
                <Lock x={10} y={78} />
                <Eng x={23} y={88} anchor="start" tone="grey" ls={0} className={UNLIT_CLASS}>{crossbleed ? 'OPEN' : 'OFF'}</Eng>
              </>
            ) : (
              <Eng x={XB_W / 2} y={88} tone={crossbleed ? 'green' : 'grey'} glow={crossbleed}>{crossbleed ? 'OPEN' : 'OFF'}</Eng>
            )}
          </svg>
          {descId ? <Sr id={descId}>{disabledReasons?.crossbleed}</Sr> : null}
        </button>
      </div>
    </div>
  );
}
