/**
 * Options › ACCESS › Prefer Taps (default OFF). A plain checkbox row (no iOS toggle): the whole row is the target
 * (≥ 44 px tall), VoiceOver reads "Prefer Taps, switch, off" plus the one-line description.
 */
import { useId } from 'react';
import { PREFER_TAPS_DESCRIPTION, PREFER_TAPS_LABEL } from '../lib/preferTaps.ts';
import { usePreferTaps } from './useInteractionMode.ts';
import './controls.css';

export function PreferTapsSetting({ className }: { className?: string }) {
  const [on, set] = usePreferTaps();
  const id = useId();
  return (
    <div className={['rf-pref', className ?? ''].filter(Boolean).join(' ')} data-rf-pref="prefer-taps">
      <label className="rf-pref__row" htmlFor={`${id}-in`}>
        <span className="rf-pref__name">{PREFER_TAPS_LABEL}</span>
        <input
          id={`${id}-in`}
          type="checkbox"
          role="switch"
          aria-label={PREFER_TAPS_LABEL}
          aria-describedby={`${id}-d`}
          checked={on}
          onChange={(e) => set(e.target.checked)}
        />
      </label>
      <p id={`${id}-d`} className="rf-pref__desc">{PREFER_TAPS_DESCRIPTION}</p>
    </div>
  );
}

/** The ACCESS group for an Options panel: heading + Prefer Taps (more accessibility rows go here). */
export function AccessOptionsGroup({ className }: { className?: string }) {
  const id = useId();
  return (
    <section className={['rf-access', className ?? ''].filter(Boolean).join(' ')} aria-labelledby={`${id}-h`} data-rf-group="access">
      <h3 id={`${id}-h`} className="rf-access__title">
        <span>ACCESS</span>
        <small>Accessibility</small>
      </h3>
      <PreferTapsSetting />
    </section>
  );
}
