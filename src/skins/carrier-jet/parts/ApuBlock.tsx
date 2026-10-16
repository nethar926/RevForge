import type { CSSProperties } from 'react';
import { Defs, Eng, Lens, useSvgPrefix } from './art';
import { BatToggle } from './BatToggle';
import { GuardedCover } from './GuardedCover';
import { APU_BLOCK_MIN, GUARD_BAND } from './tokens';
import type { CjApuBlockProps } from '../types';
import './parts.css';

const START_W = 60;
const READY_W = APU_BLOCK_MIN.w - START_W - 4;

/**
 * Option A start block (128×140): striped guard over the APU START bat toggle (lift = ARM, lever up = START,
 * flip down = OFF) beside the APU READY lamp (dark · amber steady while spooling · green steady when ready).
 */
export function ApuBlock({ arm, start, ready, onArmToggle, onStartToggle, id = 'apu', guardId = 'apuGuard', startPressHandlers, disabled, disabledReason, step }: CjApuBlockProps) {
  const p = useSvgPrefix('a');
  const H = APU_BLOCK_MIN.h;
  const tone = ready === 'ready' ? 'green' : ready === 'spooling' ? 'amber' : 'off';
  const leg = ready === 'spooling' ? 'SPOOL' : ready === 'ready' ? 'ON' : 'OFF';
  return (
    <div className="cjp cjp-apu" data-arm={arm} data-start={start} data-ready={ready} style={{ aspectRatio: `${APU_BLOCK_MIN.w} / ${H}`, minWidth: APU_BLOCK_MIN.w } as CSSProperties}>
      <div className="cjp-apu-start" style={{ width: `${(START_W / APU_BLOCK_MIN.w) * 100}%` }}>
        <GuardedCover id={guardId} name="APU" keepNameOpen guardOpen={arm} onGuardToggle={onArmToggle} disabled={disabled} disabledReason={disabledReason} childWidth={START_W}>
          <BatToggle
            id={id}
            label="START"
            state={start ? 'on' : 'off'}
            lit={start}
            ariaLabel="APU start"
            legend={start ? 'START' : 'OFF'}
            onToggle={onStartToggle}
            step={step}
            pressHandlers={startPressHandlers}
            disabled={disabled}
          />
        </GuardedCover>
      </div>
      <div className="cjp-apu-ready" role="img" aria-label={`APU ${ready === 'ready' ? 'ready' : ready === 'spooling' ? 'spooling' : 'not ready'}`} style={{ width: `${(READY_W / APU_BLOCK_MIN.w) * 100}%` }}>
        <svg viewBox={`0 0 ${READY_W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
          <Defs p={p} />
          <Eng x={READY_W / 2} y={GUARD_BAND + 16} tone={disabled ? 'grey' : 'white'} ls={0.02}>READY</Eng>
          <Lens p={p} cx={READY_W / 2} cy={GUARD_BAND + 50} r={9} tone={tone} />
          <Eng x={READY_W / 2} y={GUARD_BAND + 88} tone={tone === 'green' ? 'green' : tone === 'amber' ? 'amber' : 'grey'} glow={tone !== 'off'} ls={0.02}>{leg}</Eng>
        </svg>
      </div>
    </div>
  );
}
