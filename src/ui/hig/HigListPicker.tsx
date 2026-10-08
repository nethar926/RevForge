import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './icons';

export interface PickOption<T extends string> { value: T; label: string; detail?: string }

/**
 * Replaces native <select> (unreliable in Tesla Chromium). A list row button
 * shows the current value; it expands an in-place list (HIG Pickers: "avoid
 * switching views to show a picker") with role=listbox / role=option,
 * aria-selected + a checkmark, ↑/↓/Home/End, Enter/Space to choose, Esc to close
 * and return focus, and type-ahead. Rows are ≥44px (48px Tesla).
 */
export function HigListPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className = '',
}: {
  label: string;
  value: T;
  options: readonly PickOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const current = options.find((o) => o.value === value);
  const selIdx = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (!open) return;
    setActive(selIdx);
    requestAnimationFrame(() => list.current?.focus());
  }, [open, selIdx]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const close = (focusButton = true) => { setOpen(false); if (focusButton) btn.current?.focus(); };
  const choose = (i: number) => { const o = options[i]; if (o) onChange(o.value); close(); };
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const n = options.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(n - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') { setOpen(false); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t > 700 ? '' : typed.current.s) + e.key.toLowerCase(), t: now };
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div
      ref={wrap}
      className={`hig-listpicker ${open ? 'is-open' : ''} ${className}`}
      onBlur={(e) => { if (open && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <span id={`${id}-l`} className="hig-listpicker-label">{label}</span>
      <button
        ref={btn}
        type="button"
        className="hig-listpicker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-l ${id}-v`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${id}-v`} className="hig-listpicker-value">{current?.label ?? '—'}</span>
        <Icon name="chevron-down" className="hig-icon hig-listpicker-chevron" />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-l`}
          aria-activedescendant={`${id}-o${active}`}
          className="hig-listpicker-list"
          onKeyDown={onKey}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-o${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === value}
              className={`hig-listpicker-option ${i === active ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className="hig-listpicker-check" aria-hidden="true">{o.value === value ? <Icon name="check" /> : null}</span>
              <span className="hig-listpicker-text">{o.label}{o.detail ? <small>{o.detail}</small> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
