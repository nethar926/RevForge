/**
 * SlideConfirm: confirm a consequential action.
 *  - drag: slide the thumb right past 85 % and let go. Short of that it returns (jumps back under Reduce Motion).
 *  - tap (Prefer Taps or moving): a two-tap confirm. Tap 1 arms (label "Tap again to confirm"), tap 2 within 3 s
 *    confirms, otherwise it disarms. Never a single tap. Keyboard / VoiceOver use the same two-step in both modes.
 * Art: `renderTrack` (behind the label) and `renderThumb` (inside the thumb), both given SlideConfirmState.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ctlClass, TAP_SLOP_PX, type ControlBaseProps } from './controlBase.ts';
import { useInteractionMode, useReducedMotion } from './useInteractionMode.ts';
import type { InteractionMode } from './interactionMode.ts';
import { ARM_IDLE, ARM_TIMEOUT_MS, SLIDE_ARMED_LABEL, slideFraction, slideLabel, slideReleased, tapConfirm, type ArmState } from './slideConfirmModel.ts';
import './controls.css';

export interface SlideConfirmState {
  mode: InteractionMode;
  armed: boolean;
  disabled: boolean;
  dragging: boolean;
  /** Thumb travel 0..1 (drag mode). */
  progress: number;
  reduced: boolean;
  /** The visible label for this state. */
  label: string;
}
export interface SlideConfirmProps extends ControlBaseProps {
  /** Action name, e.g. "Shut down". */
  label: string;
  onConfirm: () => void;
  /** Armed label (default "Tap again to confirm"). */
  armedLabel?: string;
  /** Drag-mode hint (default "Slide to <label>"). */
  dragHint?: string;
  renderTrack?: (s: SlideConfirmState) => ReactNode;
  renderThumb?: (s: SlideConfirmState) => ReactNode;
}

export function SlideConfirm(props: SlideConfirmProps) {
  const auto = useInteractionMode();
  const mode = props.mode ?? auto;
  // remount on a mode change: a half-done drag or a pending arm never carries across modes
  return <SlideConfirmInner key={mode} {...props} mode={mode} />;
}

function SlideConfirmInner(props: SlideConfirmProps & { mode: InteractionMode }) {
  const { mode, label, onConfirm, disabled = false } = props;
  const reduced = useReducedMotion(props.reduceMotion);
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const arm = useRef<ArmState>(ARM_IDLE);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; travel: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  // disarm after 3 s
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => {
      arm.current = ARM_IDLE;
      setArmed(false);
    }, ARM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [armed]);

  const tap = () => {
    const r = tapConfirm(arm.current, Date.now(), disabled);
    arm.current = r.state;
    setArmed(r.state.armedAt !== null);
    if (r.confirmed) onConfirm();
  };

  const visible = slideLabel({ label, mode, armed, armedLabel: props.armedLabel, dragHint: props.dragHint });
  const s: SlideConfirmState = { mode, armed, disabled, dragging, progress, reduced, label: visible };
  const root = {
    className: ctlClass('slide', props),
    'data-rf-ctl': 'slide-confirm',
    'data-mode': mode,
    'data-armed': armed,
    'data-disabled': disabled,
    'data-dragging': dragging,
    'data-reduced': reduced,
  };
  const status = (
    <span className="rf-ctl-sr" role="status" aria-live="polite">
      {armed ? props.armedLabel ?? SLIDE_ARMED_LABEL : ''}
    </span>
  );

  if (mode === 'tap') {
    return (
      <div {...root}>
        <button type="button" className="rf-slide__tap" disabled={disabled} aria-label={armed ? `${label}. ${props.armedLabel ?? SLIDE_ARMED_LABEL}` : `${label}. Tap twice to confirm`} onClick={tap}>
          {props.renderTrack?.(s)}
          <span className="rf-slide__label" aria-hidden="true">{visible}</span>
        </button>
        {status}
      </div>
    );
  }

  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const tr = track.current;
    const th = e.currentTarget;
    if (!tr) return;
    th.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, travel: Math.max(1, tr.clientWidth - th.offsetWidth), moved: false };
    swallowClick.current = false;
    setDragging(true);
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > TAP_SLOP_PX) d.moved = true;
    setProgress(slideFraction(dx, d.travel));
  };
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    swallowClick.current = d.moved;
    setDragging(false);
    setProgress(0);
    if (d.moved && slideReleased(slideFraction(e.clientX - d.x0, d.travel)) === 'confirm') {
      arm.current = ARM_IDLE;
      setArmed(false);
      onConfirm();
    }
  };
  const cancel = () => {
    drag.current = null;
    swallowClick.current = false;
    setDragging(false);
    setProgress(0);
  };

  return (
    <div {...root}>
      <div ref={track} className="rf-slide__track" style={{ '--rf-progress': progress } as CSSProperties}>
        {props.renderTrack?.(s)}
        <span className="rf-slide__label" aria-hidden="true">{visible}</span>
        <button
          type="button"
          className="rf-slide__thumb"
          disabled={disabled}
          aria-label={armed ? `${label}. Activate again to confirm` : `${label}. Slide right to confirm, or activate twice`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onLostPointerCapture={(e) => drag.current?.id === e.pointerId && cancel()}
          onClick={(e) => {
            // a slide that ended short is not a tap; a plain press / keyboard / VoiceOver (detail 0) is (two-step)
            if (e.detail > 0 && swallowClick.current) {
              swallowClick.current = false;
              return;
            }
            tap();
          }}
        >
          {props.renderThumb?.(s) ?? <span className="rf-slide__chevron" aria-hidden="true">›</span>}
        </button>
      </div>
      {status}
    </div>
  );
}
