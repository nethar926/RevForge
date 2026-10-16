import type { CSSProperties } from 'react';
import { Eng, Lock, Sr, UNLIT_CLASS, useSvgPrefix } from './art';
import { GuardedCover } from './GuardedCover';
import { GUARD_BAND, QUICK_START_MIN, QUICK_START_MIN_NARROW } from './tokens';
import type { CjQuickStartGuardProps } from '../types';
import './parts.css';

const TITLE_H = 14;
const PLATE_H = 14;

/**
 * QUICK START on a gunmetal plate: engraved title, red/yellow striped spring guard over the START push-light,
 * status plate under it (1 TAP · LIFT / PRESS START / RUNNING; disabled = the same legend unlit, no glow). Host owns the guard and the sequence.
 */
export function QuickStartGuard({ guardOpen, onGuardToggle, onStart, running, id = 'quickStart', guardId = 'quickStartGuard', startPressHandlers, disabled, disabledReason, size = 'wide' }: CjQuickStartGuardProps) {
  const p = useSvgPrefix('q');
  const M = size === 'narrow' ? QUICK_START_MIN_NARROW : QUICK_START_MIN;
  const W = M.w, H = M.h;
  const KW = W - 12, KH = H - TITLE_H - PLATE_H - GUARD_BAND;
  const plate = running ? 'RUNNING' : guardOpen ? 'PRESS START' : '1 TAP · LIFT';
  const keyDesc = disabled && disabledReason ? `${p}d` : undefined;
  const annW = Math.min(KW - 8, 76);
  return (
    <div className="cjp cjp-qs cjp-metal" data-open={guardOpen} data-running={running} data-disabled={disabled || undefined} style={{ aspectRatio: `${W} / ${H}`, minWidth: W } as CSSProperties}>
      <svg viewBox={`0 0 ${W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
        <Eng x={W / 2} y={11.5} tone={disabled ? 'grey' : 'white'} ls={size === 'narrow' ? 0.02 : 0.1}>QUICK START</Eng>
        <Eng x={W / 2} y={H - 3.5} tone={running && !disabled ? 'green' : 'grey'} glow={running && !disabled} ls={0.02} className={disabled ? UNLIT_CLASS : undefined}>{plate}</Eng>
      </svg>
      <div className="cjp-qs-guard" style={{ left: `${(6 / W) * 100}%`, width: `${(KW / W) * 100}%`, top: `${(TITLE_H / H) * 100}%` }}>
        <GuardedCover id={guardId} name="" ariaLabel={`Quick start guard, ${guardOpen ? 'open' : 'closed'}`} guardOpen={guardOpen} onGuardToggle={onGuardToggle} disabled={disabled} disabledReason={disabledReason} childWidth={KW} childHeight={KH}>
          <button
            type="button"
            className="cjp cjp-key"
            aria-label={running ? 'Quick start, running' : 'Quick start'}
            aria-pressed={running}
            aria-disabled={disabled || undefined}
            aria-describedby={keyDesc}
            data-sys={id}
            style={{ aspectRatio: `${KW} / ${KH}` }}
            {...startPressHandlers}
            onClick={() => { if (!disabled) onStart(id); }}
          >
            <svg viewBox={`0 0 ${KW} ${KH}`} className="cjp-svg" aria-hidden="true" focusable="false">
              <rect x={0} y={0} width={KW} height={KH} rx={4} fill="#1a1d1f" />
              <path d={`M1.5 ${KH - 4} V4 Q1.5 1.5 4 1.5 H${KW - 4}`} fill="none" stroke="rgba(0,0,0,.75)" strokeWidth={2.5} />
              <rect x={(KW - annW) / 2 - 3} y={KH / 2 - 20} width={annW + 6} height={40} rx={3} fill="#6f767b" />
              <rect x={(KW - annW) / 2 - 1.5} y={KH / 2 - 18.5} width={annW + 3} height={37} rx={2.5} fill="#101213" />
              <rect x={(KW - annW) / 2} y={KH / 2 - 17} width={annW} height={34} rx={2} fill={running ? '#88f2a7' : '#1c2123'} />
              {running ? <rect x={(KW - annW) / 2} y={KH / 2 - 17} width={annW} height={12} rx={2} fill="rgba(255,255,255,.22)" /> : null}
              {disabled ? <Lock x={(KW - annW) / 2 + 4} y={KH / 2 - 6} color="#aab4ba" /> : null}
              <text x={KW / 2 + (disabled ? 6 : 0)} y={KH / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} letterSpacing=".06em" fontFamily="'B612', system-ui, sans-serif" fill={running ? '#03100a' : '#c9cfd3'} data-text-floor={13}>{running ? 'RUNNING' : 'START'}</text>
            </svg>
            {keyDesc ? <Sr id={keyDesc}>{disabledReason}</Sr> : null}
          </button>
        </GuardedCover>
      </div>
    </div>
  );
}
