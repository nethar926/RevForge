import type { ReactNode } from 'react';
import type { UiPrefs } from '../../hooks/useUiPrefs';
import { TEXT_SIZES, TEXT_SIZE_LABEL, useA11y } from '../../hooks/useA11yPrefs';
import { HigSlider, HigSwitch } from '../../ui/hig';

/** Inset-grouped settings section (HIG Settings). */
export function HigGroup({ title, footer, children, id }: { title: string; footer?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="hig-group" aria-labelledby={id}>
      <h3 className="hig-group-title" id={id}>{title}</h3>
      <div className="hig-group-body">{children}</div>
      {footer ? <p className="hig-group-footer">{footer}</p> : null}
    </section>
  );
}

const systemNote = (on: boolean, name: string) => (on ? `On because your device's ${name} setting is on.` : undefined);

/**
 * Display & Accessibility group, shared by Tuner › Settings and Interface Options.
 * Tesla exposes no OS accessibility settings to its browser, so each preference
 * has an in-app switch; on Apple/other devices the system setting also applies.
 */
export function DisplaySettings({ prefs, update, idPrefix = 'display' }: { prefs: UiPrefs; update: (p: Partial<UiPrefs>) => void; idPrefix?: string }) {
  const a11y = useA11y();
  const idx = Math.max(0, TEXT_SIZES.indexOf(prefs.textSize));
  return (
    <HigGroup title="Display & Accessibility" id={`${idPrefix}-title`}>
      <div className="hig-textsize">
        <HigSlider
          label="Text size"
          min={0}
          max={TEXT_SIZES.length - 1}
          step={1}
          value={idx}
          display={TEXT_SIZE_LABEL[prefs.textSize]}
          valueText={TEXT_SIZE_LABEL[prefs.textSize]}
          minGlyph="A"
          maxGlyph="A"
          onChange={(i) => update({ textSize: TEXT_SIZES[Math.round(i)] })}
          hint="Settings, menus and labels follow this size."
        />
      </div>
      <HigSwitch label="Bold text" checked={prefs.boldText} onChange={(boldText) => update({ boldText })} />
      <HigSwitch
        label="Increase contrast"
        description={systemNote(a11y.system.increaseContrast, 'Increase Contrast') ?? 'Brighter text, solid surfaces and stronger borders.'}
        checked={a11y.increaseContrast}
        disabled={a11y.system.increaseContrast}
        onChange={(increaseContrast) => update({ increaseContrast })}
      />
      <HigSwitch
        label="Reduce transparency"
        description={systemNote(a11y.system.reduceTransparency, 'Reduce Transparency') ?? 'Solid backgrounds instead of blurred glass.'}
        checked={a11y.reduceTransparency}
        disabled={a11y.system.reduceTransparency}
        onChange={(reduceTransparency) => update({ reduceTransparency })}
      />
      <HigSwitch
        label="Reduce motion"
        description={systemNote(a11y.system.reduceMotion, 'Reduce Motion') ?? 'Stops animated scenes and scanner loops; uses short fades.'}
        checked={a11y.reduceMotion}
        disabled={a11y.system.reduceMotion}
        onChange={(reduceMotion) => update({ reduceMotion })}
      />
    </HigGroup>
  );
}
