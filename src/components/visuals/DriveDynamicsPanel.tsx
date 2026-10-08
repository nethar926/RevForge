import { useMemo } from 'react';
import type { UiPrefs } from '../../hooks/useUiPrefs';
import { buildGearTables } from '../../hooks/gearLogic';
import { HigSegmented, HigSlider } from '../../ui/hig';

interface Props {
  prefs: UiPrefs;
  update: (p: Partial<UiPrefs>) => void;
}

const GEARS = [4, 5, 6, 7, 8] as const;

/** Drive Dynamics: gear count, top speed and idle RPM band. */
export function DriveDynamicsPanel({ prefs, update }: Props) {
  const tables = useMemo(
    () => buildGearTables(prefs.gearCount, prefs.maxTopSpeedMph),
    [prefs.gearCount, prefs.maxTopSpeedMph],
  );
  const enterTop = Math.round(tables.enter[prefs.gearCount - 1] ?? 0);

  return (
    <div className="rf-dynamics-panel hig-group-body" data-testid="drive-dynamics-panel">
      <p className="hig-hint">Sets how many gears the cluster shows and where each shift happens.</p>
      <div className="hig-field">
        <span id="rf-gears-label" className="hig-field-label">Gears</span>
        <HigSegmented
          labelledBy="rf-gears-label"
          value={prefs.gearCount}
          onChange={(gearCount) => update({ gearCount })}
          options={GEARS.map((n) => ({ value: n, label: String(n), ariaLabel: `${n} gears` }))}
        />
      </div>
      <HigSlider
        label="Top speed"
        min={60}
        max={300}
        step={1}
        value={prefs.maxTopSpeedMph}
        display={`${Math.round(prefs.maxTopSpeedMph)} mph`}
        valueText={`${Math.round(prefs.maxTopSpeedMph)} miles per hour`}
        hint={`Sets the gauge ceiling. Gear ${prefs.gearCount} starts at ${enterTop} mph.`}
        onChange={(maxTopSpeedMph) => update({ maxTopSpeedMph })}
      />
      <HigSlider
        label="Idle RPM low"
        min={400}
        max={2000}
        step={10}
        value={prefs.idleRpmMin}
        display={`${Math.round(prefs.idleRpmMin)} rpm`}
        valueText={`${Math.round(prefs.idleRpmMin)} RPM`}
        onChange={(idleRpmMin) => update({ idleRpmMin, idleRpmMax: Math.max(prefs.idleRpmMax, idleRpmMin) })}
      />
      <HigSlider
        label="Idle RPM high"
        min={400}
        max={2500}
        step={10}
        value={prefs.idleRpmMax}
        display={`${Math.round(prefs.idleRpmMax)} rpm`}
        valueText={`${Math.round(prefs.idleRpmMax)} RPM`}
        hint="The engine wanders between these speeds at idle."
        onChange={(idleRpmMax) => update({ idleRpmMax, idleRpmMin: Math.min(prefs.idleRpmMin, idleRpmMax) })}
      />
      <details className="rf-dynamics-detail">
        <summary>Shift points</summary>
        <p className="hig-hint">
          Upshift at {tables.enter.map((v) => Math.round(v)).join(', ')} mph · downshift at{' '}
          {tables.exit.map((v) => Math.round(v)).join(', ')} mph
        </p>
      </details>
    </div>
  );
}
