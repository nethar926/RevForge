import { useRef, type KeyboardEvent } from 'react';
import type { FrameStyle } from './StellarFrame';

const OPTIONS: { id: FrameStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'helm', label: 'Helm' },
];

/**
 * "Frame: Classic / Helm" segmented control (WAI-ARIA radio group, roving tabindex).
 * VoiceOver: "Classic, radio button, selected, 1 of 2, Stellar Helm frame".
 * Fixed width + right-anchored in the bar, so it never moves when the frame flips.
 */
export function FrameToggle({ frame, onChange }: { frame: FrameStyle; onChange: (f: FrameStyle) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = OPTIONS.findIndex((o) => o.id === frame);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % OPTIONS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + OPTIONS.length) % OPTIONS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = OPTIONS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(OPTIONS[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="sh-frame" role="radiogroup" aria-label="Stellar Helm frame" onKeyDown={onKey}>
      <span className="sh-frame-cap" aria-hidden="true">Frame</span>
      {OPTIONS.map((o, i) => {
        const on = frame === o.id;
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
            data-frame-option={o.id}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
