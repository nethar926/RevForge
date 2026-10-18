/**
 * MagneticSelect: one of a few options on a track (radiogroup).
 *  - drag: drag the puck along the track; it follows the finger and the nearest option lights; release snaps to it.
 *    A press without moving picks the option under it.
 *  - tap: tap an option directly (each a 44 px radio button), no puck.
 * Arrow keys move the selection (roving tabindex), in both modes. Reduce Motion: the puck jumps (no easing).
 * Art: `renderOption` (inside each option) and `renderPuck`; the track carries --rf-pos (0..1).
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ctlClass, type ControlBaseProps } from './controlBase.ts';
import { useInteractionMode, useReducedMotion } from './useInteractionMode.ts';
import type { InteractionMode } from './interactionMode.ts';
import { nearestOption, nextEnabled, optionFraction, trackFraction } from './magneticSelectModel.ts';
import './controls.css';

export interface MagneticOption { value: string; label: string; disabled?: boolean }
export interface MagneticSelectState {
  mode: InteractionMode;
  disabled: boolean;
  dragging: boolean;
  reduced: boolean;
  /** Selected index (-1 none). */
  selected: number;
  /** Option the puck would snap to right now (= selected when idle). */
  near: number;
  /** Puck position 0..1. */
  pos: number;
}
export interface MagneticOptionState extends MagneticSelectState {
  index: number;
  checked: boolean;
  isNear: boolean;
  optionDisabled: boolean;
}
export interface MagneticSelectProps extends ControlBaseProps {
  label: string;
  options: readonly MagneticOption[];
  value: string;
  onChange: (value: string) => void;
  renderOption?: (o: MagneticOption, s: MagneticOptionState) => ReactNode;
  renderPuck?: (s: MagneticSelectState) => ReactNode;
}

export function MagneticSelect(props: MagneticSelectProps) {
  const auto = useInteractionMode();
  const mode = props.mode ?? auto;
  return <MagneticSelectInner key={mode} {...props} mode={mode} />;
}

function MagneticSelectInner(props: MagneticSelectProps & { mode: InteractionMode }) {
  const { mode, options, label, value, onChange, disabled = false } = props;
  const reduced = useReducedMotion(props.reduceMotion);
  const enabled = options.map((o) => !disabled && !o.disabled);
  const selected = options.findIndex((o) => o.value === value);
  const [drag, setDrag] = useState<{ pos: number; near: number } | null>(null);
  const live = useRef<{ id: number; near: number } | null>(null);
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const n = options.length;
  const pos = drag ? drag.pos : optionFraction(Math.max(0, selected), n);
  const near = drag ? drag.near : selected;
  const s: MagneticSelectState = { mode, disabled, dragging: !!drag, reduced, selected, near, pos };
  const choose = (i: number) => {
    if (i >= 0 && enabled[i] && options[i].value !== value) onChange(options[i].value);
  };
  const focusable = selected >= 0 && enabled[selected] ? selected : enabled.indexOf(true);

  const onKeyDown = (e: RKeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = nextEnabled(i, 1, enabled);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = nextEnabled(i, -1, enabled);
    else if (e.key === 'Home') j = nextEnabled(-1, 1, enabled);
    else if (e.key === 'End') j = nextEnabled(n, -1, enabled);
    if (j < 0) return;
    e.preventDefault();
    choose(j);
    btns.current[j]?.focus();
  };

  // drag: the track maps between the first and last option centres
  const frac = (e: RPointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const cell = n > 0 ? b.width / n : b.width;
    return trackFraction(e.clientX, b.left + cell / 2, b.width - cell);
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (mode !== 'drag' || disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const f = frac(e);
    const nr = nearestOption(f, enabled);
    live.current = { id: e.pointerId, near: nr };
    setDrag({ pos: f, near: nr });
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = live.current;
    if (!d || d.id !== e.pointerId) return;
    const f = frac(e);
    d.near = nearestOption(f, enabled);
    setDrag({ pos: f, near: d.near });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = live.current;
    if (!d || d.id !== e.pointerId) return;
    live.current = null;
    setDrag(null);
    choose(d.near);
  };
  const cancel = () => {
    live.current = null;
    setDrag(null);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={ctlClass('magnet', props)}
      data-rf-ctl="magnetic-select"
      data-mode={mode}
      data-disabled={disabled}
      data-dragging={!!drag}
      data-reduced={reduced}
    >
      <div
        className="rf-magnet__track"
        style={{ '--rf-pos': pos, '--rf-count': Math.max(1, n) } as CSSProperties}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={(e) => live.current?.id === e.pointerId && cancel()}
      >
        {mode === 'drag' && selected >= 0 && <span className="rf-magnet__puck" aria-hidden="true">{props.renderPuck?.(s)}</span>}
        {options.map((o, i) => {
          const st: MagneticOptionState = { ...s, index: i, checked: i === selected, isNear: i === near, optionDisabled: !enabled[i] };
          return (
            <button
              key={o.value}
              ref={(el) => {
                btns.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={i === selected}
              aria-disabled={!enabled[i] || undefined}
              tabIndex={i === focusable ? 0 : -1}
              className="rf-magnet__opt"
              data-near={i === near}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={(e) => {
                // drag mode: pointer presses are handled by the track (release = nearest); keyboard / VoiceOver
                // activation (detail 0) picks directly
                if (mode === 'drag' && e.detail > 0) return;
                choose(i);
              }}
            >
              {props.renderOption?.(o, st) ?? o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
