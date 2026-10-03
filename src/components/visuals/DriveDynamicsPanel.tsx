import { useMemo } from 'react';
import type { UiPrefs } from '../../hooks/useUiPrefs';
import { buildGearTables } from '../../hooks/gearLogic';

interface Props {
  prefs: UiPrefs;
  update: (p: Partial<UiPrefs>) => void;
}

/**
 * Drive Dynamics — gear count, top speed, idle RPM band.
 * Lives on CustomizePage (/customize · Interface Options). Frontend should
 * relocate this block under ☰ → Interface Options → Visuals when the
 * hamburger IA lands on the fusion tip.
 */
export function DriveDynamicsPanel({ prefs, update }: Props) {
  const tables = useMemo(
    () => buildGearTables(prefs.gearCount, prefs.maxTopSpeedMph),
    [prefs.gearCount, prefs.maxTopSpeedMph],
  );

  const gearOptions = [4, 5, 6, 7, 8] as const;

  return (
    <div className="rf-dynamics-panel" data-testid="drive-dynamics-panel">
      <p className="help-text dim">
        Scales indicated-gear ENTER/EXIT tables and gauge top. Defaults keep the
        classic 8-speed mph windows. Idle band is persisted for @Audio Synth.
      </p>

      <h3 className="rf-subhead">Gears</h3>
      <div className="segmented" role="group" aria-label="Gear count">
        {gearOptions.map((n) => (
          <button
            key={n}
            type="button"
            className={`seg-btn rf-hit ${prefs.gearCount === n ? 'active' : ''}`}
            style={{ minHeight: 48 }}
            aria-pressed={prefs.gearCount === n}
            onClick={() => update({ gearCount: n })}
          >
            {n}
          </button>
        ))}
      </div>

      <label className="rf-knob tesla-touch">
        <span className="rf-knob-head">
          <span>Max top speed</span>
          <output>{Math.round(prefs.maxTopSpeedMph)} mph</output>
        </span>
        <input
          type="range"
          min={60}
          max={300}
          step={1}
          value={prefs.maxTopSpeedMph}
          aria-label="Max top speed miles per hour"
          onChange={(e) => update({ maxTopSpeedMph: Number(e.target.value) })}
        />
        <small className="help-text dim">
          Scales gear thresholds and gauge ceiling. Enter gear {prefs.gearCount} at{' '}
          {Math.round(tables.enter[prefs.gearCount - 1] ?? 0)} mph.
        </small>
      </label>

      <h3 className="rf-subhead">Idle band (Audio)</h3>
      <label className="rf-knob tesla-touch">
        <span className="rf-knob-head">
          <span>Idle RPM min</span>
          <output>{Math.round(prefs.idleRpmMin)}</output>
        </span>
        <input
          type="range"
          min={400}
          max={2000}
          step={10}
          value={prefs.idleRpmMin}
          aria-label="Idle RPM minimum"
          onChange={(e) => {
            const idleRpmMin = Number(e.target.value);
            update({
              idleRpmMin,
              idleRpmMax: Math.max(prefs.idleRpmMax, idleRpmMin),
            });
          }}
        />
      </label>
      <label className="rf-knob tesla-touch">
        <span className="rf-knob-head">
          <span>Idle RPM max</span>
          <output>{Math.round(prefs.idleRpmMax)}</output>
        </span>
        <input
          type="range"
          min={400}
          max={2500}
          step={10}
          value={prefs.idleRpmMax}
          aria-label="Idle RPM maximum"
          onChange={(e) => {
            const idleRpmMax = Number(e.target.value);
            update({
              idleRpmMax,
              idleRpmMin: Math.min(prefs.idleRpmMin, idleRpmMax),
            });
          }}
        />
        <small className="help-text dim">
          Keys: <code>revforge.dynamics.idleRpmMin</code> /{' '}
          <code>revforge.dynamics.idleRpmMax</code> (also in{' '}
          <code>drivesynth.ui.v1</code>). Approx idle Hz ≈ RPM ÷ 60.
        </small>
      </label>

      <details className="rf-dynamics-detail">
        <summary>Threshold preview</summary>
        <p className="help-text dim">
          ENTER [{tables.enter.map((v) => Math.round(v)).join(', ')}] · EXIT [
          {tables.exit.map((v) => Math.round(v)).join(', ')}]
        </p>
      </details>
    </div>
  );
}
