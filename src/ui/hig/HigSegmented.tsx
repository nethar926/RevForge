import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface SegOption<T extends string | number> { value: T; label: ReactNode; ariaLabel?: string }

/**
 * HIG segmented control as an ARIA radiogroup (APG radio pattern): role=radio +
 * aria-checked, roving tabindex, ←/→/↑/↓/Home/End move and select. Equal-width
 * segments ≥44px (48px Tesla); the selected segment is a light pill (≥3:1 against
 * the track, plus weight) so state never relies on hue.
 */
export function HigSegmented<T extends string | number>({
  label,
  labelledBy,
  options,
  value,
  onChange,
  wrap = false,
  className = '',
  size = 'regular',
  tabs = false,
  panelId,
}: {
  label?: string;
  labelledBy?: string;
  options: readonly SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  wrap?: boolean;
  className?: string;
  size?: 'regular' | 'large';
  /** View switcher (Themes/Clusters, DashLab/EngineForge): APG tabs pattern instead of radios. */
  tabs?: boolean;
  /** With `tabs`, id of the tabpanel the tabs control. */
  panelId?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (to: number) => {
    const n = options.length;
    const next = ((to % n) + n) % n;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); move(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); move(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(options.length - 1); }
  };
  return (
    <div
      role={tabs ? 'tablist' : 'radiogroup'}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={`hig-segmented ${wrap ? 'is-wrap' : ''} is-${size} ${className}`}
      style={wrap ? undefined : { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const on = i === idx;
        return (
          <button
            key={String(o.value)}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role={tabs ? 'tab' : 'radio'}
            aria-checked={tabs ? undefined : on}
            aria-selected={tabs ? on : undefined}
            aria-controls={tabs && on ? panelId : undefined}
            id={tabs && panelId ? `${panelId}-tab-${String(o.value)}` : undefined}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            className={`hig-seg-option ${on ? 'is-selected' : ''}`}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
