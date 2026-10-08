import type { UiPrefs } from '../../hooks/useUiPrefs';
import { HigSlider, pctText } from '../../ui/hig';

interface Props {
  prefs: UiPrefs;
  update: (p: Partial<UiPrefs>) => void;
}

type Key = 'bloomGlow' | 'scanlineStrength' | 'hudOpacity' | 'hudBezel';
const KNOBS: readonly { key: Key; label: string; min: number; hint: string }[] = [
  { key: 'bloomGlow', label: 'Glow', min: 0, hint: 'Brightness of needle and digit glow.' },
  { key: 'scanlineStrength', label: 'Scanlines', min: 0, hint: 'Strength of the scan-line overlay on screen-style clusters.' },
  { key: 'hudOpacity', label: 'Instrument opacity', min: 0.25, hint: 'How solid the instrument cluster looks over the scene.' },
  { key: 'hudBezel', label: 'Bezel', min: 0, hint: 'Intensity of frame and plate edges.' },
];

/** Glow / scanlines / opacity / bezel as HIG sliders (≥44px, 48px Tesla). */
export function AppearanceKnobs({ prefs, update }: Props) {
  return (
    <div className="rf-appearance-knobs hig-group-body" data-testid="appearance-knobs">
      {KNOBS.map(({ key, label, min, hint }) => (
        <HigSlider
          key={key}
          className="rf-knob"
          label={label}
          value={prefs[key]}
          min={min}
          max={1}
          step={0.01}
          display={`${Math.round(prefs[key] * 100)}%`}
          valueText={pctText(prefs[key])}
          hint={hint}
          onChange={(v) => update({ [key]: v } as Partial<UiPrefs>)}
        />
      ))}
    </div>
  );
}
