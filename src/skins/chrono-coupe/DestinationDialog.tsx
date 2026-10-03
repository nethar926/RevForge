import { useEffect, useId, useRef, useState } from 'react';
import { MONTHS, composeDate, daysInMonth } from './chronoModel';

interface Fields {
  year: number;
  month0: number;
  day: number;
  hour12: number;
  minute: number;
  pm: boolean;
}

const toFields = (d: Date): Fields => {
  const h = d.getHours();
  return { year: d.getFullYear(), month0: d.getMonth(), day: d.getDate(), hour12: h % 12 === 0 ? 12 : h % 12, minute: d.getMinutes(), pm: h >= 12 };
};

const wrap = (v: number, min: number, max: number) => (v > max ? min : v < min ? max : v);

function Stepper({
  label,
  value,
  display,
  min,
  max,
  onChange,
  wide = false,
}: {
  label: string;
  value: number;
  display?: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`cc-step ${wide ? 'wide' : ''}`} role="group" aria-labelledby={id}>
      <span id={id} className="cc-step-label">{label}</span>
      <div className="cc-step-row">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => onChange(wrap(value - 1, min, max))}>−</button>
        {display ? (
          <output aria-live="polite" aria-label={label}>{display}</output>
        ) : (
          <input
            type="number"
            inputMode="numeric"
            aria-label={label}
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
            }}
          />
        )}
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} onClick={() => onChange(wrap(value + 1, min, max))}>+</button>
      </div>
    </div>
  );
}

/** Large-target destination editor (native modal <dialog>; Escape cancels). */
export function DestinationDialog({ open, value, onClose, onSave }: { open: boolean; value: Date; onClose: () => void; onSave: (d: Date) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState<Fields>(() => toFields(value));
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setF(toFields(value));
      try {
        dlg.showModal();
      } catch {
        dlg.setAttribute('open', '');
      }
    } else if (!open && dlg.open) dlg.close();
  }, [open, value]);

  const set = (patch: Partial<Fields>) =>
    setF((cur) => {
      const next = { ...cur, ...patch };
      next.day = Math.min(next.day, daysInMonth(next.year, next.month0));
      return next;
    });

  return (
    <dialog
      ref={ref}
      className="cc-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Keep Drive's Space/B keyboard shortcuts from firing while editing.
      onKeyDown={(e) => {
        if (e.key !== 'Escape') e.stopPropagation();
      }}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(composeDate(f));
        }}
      >
        <h2 id={titleId}>Set destination</h2>
        <div className="cc-step-grid">
          <Stepper label="Month" value={f.month0} display={MONTHS[f.month0]} min={0} max={11} onChange={(month0) => set({ month0 })} />
          <Stepper label="Day" value={f.day} min={1} max={daysInMonth(f.year, f.month0)} onChange={(day) => set({ day })} />
          <Stepper label="Year" value={f.year} min={1} max={9999} onChange={(year) => set({ year })} wide />
          <Stepper label="Hour" value={f.hour12} min={1} max={12} onChange={(hour12) => set({ hour12 })} />
          <Stepper label="Minute" value={f.minute} display={String(f.minute).padStart(2, '0')} min={0} max={59} onChange={(minute) => set({ minute })} />
          <div className="cc-step" role="group" aria-label="AM or PM">
            <span className="cc-step-label" aria-hidden="true">AM / PM</span>
            <div className="cc-step-row cc-ampm-pick">
              <button type="button" aria-pressed={!f.pm} onClick={() => set({ pm: false })}>AM</button>
              <button type="button" aria-pressed={f.pm} onClick={() => set({ pm: true })}>PM</button>
            </div>
          </div>
        </div>
        <div className="cc-dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Save destination</button>
        </div>
      </form>
    </dialog>
  );
}
