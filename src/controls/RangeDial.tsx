/**
 * RangeDial: a value in [min, max] on a rotary face. ARIA slider (aria-valuenow / min / max / valuetext) with the
 * WAI-ARIA keys in both modes (arrows ±step, PageUp/PageDown ±10 steps, Home/End).
 *  - drag: rotate the face (relative to where you grab it; no jump on touch).
 *  - tap: −/+ step buttons (44 px each) beside the face; tapping the face cycles through `stops`
 *    (default five evenly spaced values, wrapping).
 * Reduce Motion: the indicator jumps (no easing). Art: `renderFace` (inside the face) given RangeDialState;
 * the face also carries --rf-angle (deg) and --rf-fraction (0..1) for CSS-only art.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ctlClass, type ControlBaseProps } from './controlBase.ts';
import { useInteractionMode, useReducedMotion } from './useInteractionMode.ts';
import type { InteractionMode } from './interactionMode.ts';
import { angleDelta, atMax, atMin, clampValue, cycleStops, DIAL_SWEEP_DEG, keyValue, nextStop, normalizeSpec, pointerAngle, rotationToDelta, snapValue, stepValue, valueFraction, valueToAngle } from './rangeDialModel.ts';
import './controls.css';

export interface RangeDialState {
  mode: InteractionMode;
  value: number;
  valueText: string;
  /** 0..1 */
  fraction: number;
  /** Indicator angle, deg clockwise from 12 o'clock. */
  angle: number;
  disabled: boolean;
  dragging: boolean;
  reduced: boolean;
  atMin: boolean;
  atMax: boolean;
}
export interface RangeDialProps extends ControlBaseProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Spoken + shown value (aria-valuetext). Default String(value). */
  formatValue?: (v: number) => string;
  /** Tap-to-cycle stops (tap mode). Default: five evenly spaced values. */
  stops?: readonly number[];
  /** Degrees the full range spans (default 270). */
  sweep?: number;
  /** Face size in px (default 120; never under 44). */
  size?: number;
  renderFace?: (s: RangeDialState) => ReactNode;
}

export function RangeDial(props: RangeDialProps) {
  const auto = useInteractionMode();
  const mode = props.mode ?? auto;
  return <RangeDialInner key={mode} {...props} mode={mode} />;
}

function RangeDialInner(props: RangeDialProps & { mode: InteractionMode }) {
  const { mode, label, onChange, disabled = false } = props;
  const spec = normalizeSpec({ min: props.min, max: props.max, step: props.step ?? 1 });
  const sweep = props.sweep ?? DIAL_SWEEP_DEG;
  const reduced = useReducedMotion(props.reduceMotion);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; cx: number; cy: number; last: number; raw: number; sent: number } | null>(null);
  const value = snapValue(props.value, spec);
  const fmt = props.formatValue ?? ((v: number) => String(v));
  const valueText = fmt(value);
  const s: RangeDialState = {
    mode, value, valueText, fraction: valueFraction(value, spec), angle: valueToAngle(value, spec, sweep),
    disabled, dragging, reduced, atMin: atMin(value, spec), atMax: atMax(value, spec),
  };
  const emit = (v: number) => {
    if (!disabled && v !== value) onChange(v);
  };

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const v = keyValue(e.key, value, spec);
    if (v === null) return;
    e.preventDefault();
    emit(v);
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (disabled || mode !== 'drag' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, cx, cy, last: pointerAngle(e.clientX - cx, e.clientY - cy), raw: value, sent: value };
    setDragging(true);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const a = pointerAngle(e.clientX - d.cx, e.clientY - d.cy);
    d.raw = clampValue(d.raw + rotationToDelta(angleDelta(d.last, a), spec, sweep), spec);
    d.last = a;
    const v = snapValue(d.raw, spec);
    if (v !== d.sent) {
      d.sent = v;
      onChange(v);
    }
  };
  const end = () => {
    drag.current = null;
    setDragging(false);
  };
  const size = Math.max(44, props.size ?? 120);

  return (
    <div className={ctlClass('dial', props)} data-rf-ctl="range-dial" data-mode={mode} data-disabled={disabled} data-dragging={dragging} data-reduced={reduced}>
      {mode === 'tap' && (
        <button type="button" className="rf-dial__step rf-dial__step--dec" aria-label={`Decrease ${label}`} disabled={disabled || s.atMin} onClick={() => emit(stepValue(value, -1, spec))}>
          <span aria-hidden="true">−</span>
        </button>
      )}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        className="rf-dial__face"
        style={{ width: size, height: size, '--rf-angle': `${s.angle}deg`, '--rf-fraction': s.fraction } as CSSProperties}
        onKeyDown={onKeyDown}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onClick={() => {
          if (mode === 'tap' && !disabled) emit(nextStop(value, props.stops ?? cycleStops(spec)));
        }}
      >
        {props.renderFace?.(s) ?? (
          <>
            <span className="rf-dial__pointer" aria-hidden="true" />
            <span className="rf-dial__value" aria-hidden="true">{valueText}</span>
          </>
        )}
      </div>
      {mode === 'tap' && (
        <button type="button" className="rf-dial__step rf-dial__step--inc" aria-label={`Increase ${label}`} disabled={disabled || s.atMax} onClick={() => emit(stepValue(value, 1, spec))}>
          <span aria-hidden="true">+</span>
        </button>
      )}
    </div>
  );
}
