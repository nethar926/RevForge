/**
 * RadialMenu: pick one of a few actions.
 *  - drag: press the hub, drag toward an item (it lights), release to pick it; release in the hub cancels.
 *    The ring items are also plain buttons (keyboard / VoiceOver / a direct press).
 *  - tap: a plain vertical list of 44 px buttons (no ring, no aiming while moving).
 * role=menu / menuitem, arrow keys rove, Enter / Space pick. Art: `renderItem` (inside each item) and `renderHub`.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ctlClass, type ControlBaseProps } from './controlBase.ts';
import { useInteractionMode, useReducedMotion } from './useInteractionMode.ts';
import type { InteractionMode } from './interactionMode.ts';
import { nextEnabled, radialIndex, radialPosition, RADIAL_DEADZONE_PX } from './radialMenuModel.ts';
import './controls.css';

export interface RadialItem { id: string; label: string; disabled?: boolean }
export interface RadialMenuState {
  mode: InteractionMode;
  disabled: boolean;
  dragging: boolean;
  reduced: boolean;
  /** Item under the pointer while dragging (-1 none). */
  hot: number;
}
export interface RadialItemState extends RadialMenuState {
  index: number;
  active: boolean;
  itemDisabled: boolean;
}
export interface RadialMenuProps extends ControlBaseProps {
  label: string;
  items: readonly RadialItem[];
  onSelect: (id: string) => void;
  /** Ring radius in px (drag mode; default 88). */
  radius?: number;
  /** Hub legend (default "Drag"). */
  hubLabel?: string;
  renderItem?: (item: RadialItem, s: RadialItemState) => ReactNode;
  renderHub?: (s: RadialMenuState) => ReactNode;
}

export function RadialMenu(props: RadialMenuProps) {
  const auto = useInteractionMode();
  const mode = props.mode ?? auto;
  return <RadialMenuInner key={mode} {...props} mode={mode} />;
}

function RadialMenuInner(props: RadialMenuProps & { mode: InteractionMode }) {
  const { mode, items, label, onSelect, disabled = false } = props;
  const reduced = useReducedMotion(props.reduceMotion);
  const [hot, setHot] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const [focus, setFocus] = useState(() => Math.max(0, items.findIndex((i) => !i.disabled)));
  const btns = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ id: number; cx: number; cy: number; hot: number } | null>(null);
  const enabled = items.map((i) => !disabled && !i.disabled);
  const s: RadialMenuState = { mode, disabled, dragging, reduced, hot };
  const pick = (i: number) => {
    if (i >= 0 && enabled[i]) onSelect(items[i].id);
  };
  const onKeyDown = (e: RKeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = nextEnabled(i, 1, enabled);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = nextEnabled(i, -1, enabled);
    else if (e.key === 'Home') j = nextEnabled(-1, 1, enabled);
    else if (e.key === 'End') j = nextEnabled(items.length, -1, enabled);
    if (j < 0) return;
    e.preventDefault();
    setFocus(j);
    btns.current[j]?.focus();
  };
  const item = (it: RadialItem, i: number, extra: { className: string; style?: CSSProperties }) => {
    const st: RadialItemState = { ...s, index: i, active: i === hot, itemDisabled: !enabled[i] };
    return (
      <button
        key={it.id}
        ref={(el) => {
          btns.current[i] = el;
        }}
        type="button"
        role="menuitem"
        className={extra.className}
        style={extra.style}
        tabIndex={i === focus ? 0 : -1}
        aria-disabled={!enabled[i] || undefined}
        data-active={i === hot}
        onFocus={() => setFocus(i)}
        onKeyDown={(e) => onKeyDown(e, i)}
        onClick={() => pick(i)}
      >
        {props.renderItem?.(it, st) ?? it.label}
      </button>
    );
  };
  const root = { className: ctlClass('radial', props), 'data-rf-ctl': 'radial-menu', 'data-mode': mode, 'data-disabled': disabled, 'data-dragging': dragging, 'data-reduced': reduced };

  if (mode === 'tap') {
    return (
      <div {...root}>
        <div role="menu" aria-label={label} className="rf-radial__list">
          {items.map((it, i) => item(it, i, { className: 'rf-radial__row' }))}
        </div>
      </div>
    );
  }

  const r = Math.max(56, props.radius ?? 88);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const b = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, cx: b.left + b.width / 2, cy: b.top + b.height / 2, hot: -1 };
    setDragging(true);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const i = radialIndex(e.clientX - d.cx, e.clientY - d.cy, items.length, RADIAL_DEADZONE_PX);
    const h = i >= 0 && enabled[i] ? i : -1;
    if (h !== d.hot) {
      d.hot = h;
      setHot(h);
    }
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    setHot(-1);
    pick(d.hot);
  };
  const cancel = () => {
    drag.current = null;
    setDragging(false);
    setHot(-1);
  };
  const box = 2 * r + 56;

  return (
    <div {...root}>
      <div role="menu" aria-label={label} className="rf-radial__ring" style={{ width: box, height: box }}>
        {items.map((it, i) => {
          const p = radialPosition(i, items.length, r);
          return item(it, i, { className: 'rf-radial__item', style: { left: `calc(50% + ${p.x.toFixed(1)}px)`, top: `calc(50% + ${p.y.toFixed(1)}px)` } });
        })}
        <div className="rf-radial__hub" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={(e) => drag.current?.id === e.pointerId && cancel()}>
          {props.renderHub?.(s) ?? (props.hubLabel ?? 'Drag')}
        </div>
      </div>
      <span className="rf-ctl-sr" role="status" aria-live="polite">{hot >= 0 ? items[hot].label : ''}</span>
    </div>
  );
}
