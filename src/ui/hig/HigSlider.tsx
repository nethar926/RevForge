import { useId, type CSSProperties, type ReactNode } from 'react';

/**
 * HIG slider: native range restyled with a ≥44px interactive track (48px Tesla),
 * 28px thumb, accent on the filled track only (never on the value text), and an
 * aria-valuetext that speaks units ("65 percent", "Large").
 */
export function HigSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  valueText,
  hint,
  disabled,
  minGlyph,
  maxGlyph,
  className = '',
  hideHead = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number | 'any';
  onChange: (v: number) => void;
  display?: ReactNode;
  valueText?: string;
  hint?: ReactNode;
  disabled?: boolean;
  minGlyph?: ReactNode;
  maxGlyph?: ReactNode;
  className?: string;
  hideHead?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-h`;
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={`hig-slider ${disabled ? 'is-disabled' : ''} ${className}`}>
      <div className={`hig-slider-head ${hideHead ? 'hig-vh' : ''}`}>
        <label htmlFor={id}>{label}</label>
        {display != null ? <output htmlFor={id} aria-hidden="true">{display}</output> : null}
      </div>
      <div className="hig-slider-track-row">
        {minGlyph ? <span className="hig-slider-glyph" aria-hidden="true">{minGlyph}</span> : null}
        <input
          id={id}
          type="range"
          className="hig-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={valueText}
          aria-describedby={hint ? hintId : undefined}
          style={{ '--hig-fill-pct': `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {maxGlyph ? <span className="hig-slider-glyph is-max" aria-hidden="true">{maxGlyph}</span> : null}
      </div>
      {hint ? <p id={hintId} className="hig-hint">{hint}</p> : null}
    </div>
  );
}

export const pctText = (v: number) => `${Math.round(v * 100)} percent`;
