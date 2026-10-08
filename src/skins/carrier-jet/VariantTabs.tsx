import { useRef, type KeyboardEvent } from 'react';
import { CARRIER_JET_VARIANTS, type CarrierJetVariant } from './model';

/**
 * "Look: CARRIER JET / TOMCAT / SWING WING" segmented control, mirroring Stellar Helm's
 * FrameToggle: WAI-ARIA radio group with roving tabindex and arrow / Home / End keys.
 * Each tab reads the same name as that variant's header label.
 * Selected = solid fill + heavier weight + a bar under the label (never colour alone).
 * Not rendered in the drive window or compact layout (same as the Stellar Helm toggle).
 */
export function VariantTabs({ variant, onChange }: { variant: CarrierJetVariant; onChange: (v: CarrierJetVariant) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = CARRIER_JET_VARIANTS.findIndex((o) => o.id === variant);
    const n = CARRIER_JET_VARIANTS.length;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(CARRIER_JET_VARIANTS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="cj-tabs" role="radiogroup" aria-label="Carrier Jet look" onKeyDown={onKey}>
      <span className="cj-tabs-cap" aria-hidden="true">Look</span>
      {CARRIER_JET_VARIANTS.map((o, i) => {
        const on = variant === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-variant-option={o.id}
            className="cj-tab"
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
