import { Bat, CUE_TINT, Defs, Eng, Lens, Lock, Sr, UNLIT_CLASS, useSvgPrefix } from './art';
import { labelLines, nextToggle, toggleLamp, toggleLegend, TOGGLE_MIN } from './tokens';
import type { CjToggleProps } from '../types';
import './parts.css';

/**
 * Bat-handle toggle on the panel: engraved label, hex nut + knurled ring, ~25° lever, lamp lens, throw legend.
 * Fixed viewBox 60×96 scaled to the container width (min `TOGGLE_MIN`). The whole cell is one
 * `<button role="switch">`. Disabled = full size, dimmed lever, lock + the normal legend unlit (no glow),
 * `aria-disabled` + description; taps are ignored.
 */
export function BatToggle({ id, label, state, lit, disabled, disabledReason, ariaLabel, onToggle, legend, step, cue, pressHandlers }: CjToggleProps) {
  const p = useSvgPrefix('t');
  const W = TOGGLE_MIN.w, H = TOGGLE_MIN.h;
  const lines = labelLines(label);
  const lamp = toggleLamp(state, lit, disabled);
  const leg = legend ? legend.toUpperCase() : toggleLegend(state);
  const legTone = disabled ? 'grey' : lamp === 'green' ? 'green' : lamp === 'amber' ? 'amber' : state === 'off' ? 'grey' : 'white';
  const descId = disabled && disabledReason ? `${p}d` : undefined;
  const ly = lines.length > 1 ? [11, 23] : [16];
  return (
    <button
      type="button"
      className="cjp cjp-toggle"
      role="switch"
      aria-checked={state !== 'off'}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      aria-describedby={descId}
      data-sys={id}
      data-state={state}
      data-lit={lit}
      data-cue={cue}
      style={{ minWidth: W }}
      {...pressHandlers}
      onClick={() => { if (!disabled) onToggle(id, nextToggle(state)); }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="cjp-svg" aria-hidden="true" focusable="false">
        <Defs p={p} />
        {cue ? <rect x={1} y={1} width={W - 2} height={H - 2} rx={3} fill={cue === 'next' ? CUE_TINT.next : CUE_TINT.busy} stroke={cue === 'next' ? '#7ef7a1' : '#ffb54a'} strokeWidth={1.5} /> : null}
        {lines.map((t, i) => (
          <Eng key={i} x={W / 2} y={ly[i]} tone={disabled ? 'grey' : 'white'} fit={W - 4}>{t}</Eng>
        ))}
        {step != null ? <Eng x={W - 4} y={36} anchor="end" tone={disabled ? 'grey' : 'amber'}>{String(step)}</Eng> : null}
        <Bat p={p} x={6} y={30} pos={state === 'off' ? 'down' : 'up'} dim={disabled} />
        <Lens p={p} cx={47} cy={52} tone={lamp} />
        {disabled ? (
          <>
            <Lock x={2} y={78} />
            <Eng x={14} y={88} anchor="start" tone="grey" ls={0} fit={44} className={UNLIT_CLASS}>{leg}</Eng>
          </>
        ) : (
          <Eng x={W / 2} y={88} tone={legTone} glow={lamp !== 'off'} fit={W - 4}>{leg}</Eng>
        )}
      </svg>
      {descId ? <Sr id={descId}>{disabledReason}</Sr> : null}
    </button>
  );
}
