import { useId, type ReactNode } from 'react';

/**
 * HIG switch in a list row (Toggles: "use the switch style only in a list row").
 * Native `<input type=checkbox switch role=switch>`: Safari 17.4+ treats it as a
 * real switch (haptic on iOS 18); Chromium ignores `switch` and keeps role=switch.
 * 51×31 visual drawn on the input itself, inside a ≥44px (48px Tesla) hit box;
 * the whole row is the label. Accessible name = the short label only; the
 * description is attached with aria-describedby. On/off is shown by fill, thumb
 * position and an I/O glyph (not colour alone).
 */
export function HigSwitch({
  label,
  description,
  checked,
  onChange,
  disabled,
  className = '',
  inputClassName = '',
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  const id = useId();
  const labelId = `${id}-l`;
  const descId = `${id}-d`;
  const nativeSwitch = { switch: '' } as Record<string, string>;
  return (
    <label className={`hig-switch-row ${disabled ? 'is-disabled' : ''} ${className}`}>
      <span className="hig-switch-text">
        <span id={labelId} className="hig-switch-label">{label}</span>
        {description ? <span id={descId} className="hig-switch-desc">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        {...nativeSwitch}
        className={`hig-switch ${inputClassName}`}
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
