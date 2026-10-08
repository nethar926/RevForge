import { Gauge } from '../components/Gauge';
import { AppearanceKnobs } from '../components/visuals/AppearanceKnobs';
import { DriveDynamicsPanel } from '../components/visuals/DriveDynamicsPanel';
import { DisplaySettings, HigGroup } from '../components/settings/DisplaySettings';
import { HigSegmented, HigSwitch, Icon } from '../ui/hig';
import type {
  UiPrefs,
  ThemeId,
  LayoutDensity,
  GaugeCluster,
  TelemetryDensity,
  SpeedUnit,
  IonTwinSpeedScript,
} from '../hooks/useUiPrefs';
import { clusterToGaugeStyle } from '../hooks/useUiPrefs';
import '../themes/themes.css';

interface Props {
  prefs: UiPrefs;
  update: (p: Partial<UiPrefs>) => void;
  reset: () => void;
}

const THEMES: { id: ThemeId; label: string; accent: string }[] = [
  { id: 'night', label: 'Night Graphite', accent: '#3dffb5' },
  { id: 'day', label: 'Day High-Vis', accent: '#0b5fff' },
  { id: 'neon', label: 'Neon Drive', accent: '#ff3d9a' },
  { id: 'mono', label: 'Minimal Mono', accent: '#e8ecf2' },
];

/** Labelled segmented row inside a settings group. */
function SegRow<T extends string>({ id, label, value, options, onChange, wrap }: { id: string; label: string; value: T; options: { value: T; label: string; ariaLabel?: string }[]; onChange: (v: T) => void; wrap?: boolean }) {
  return (
    <div className="hig-field">
      <span id={id} className="hig-field-label">{label}</span>
      <HigSegmented labelledBy={id} value={value} options={options} onChange={onChange} wrap={wrap} />
    </div>
  );
}

export function CustomizePage({ prefs, update, reset }: Props) {
  return (
    <div className="page customize-page hig-settings">
      <header className="page-head">
        <h1>Interface Options</h1>
        <p className="page-sub">Display, theme, appearance and drive settings. Saved on this device.</p>
      </header>

      <DisplaySettings prefs={prefs} update={update} idPrefix="customize-display" />

      <HigGroup title="Theme" id="customize-theme-title">
        <div className="theme-grid" role="group" aria-labelledby="customize-theme-title">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card ${prefs.theme === t.id ? 'selected' : ''}`}
              aria-pressed={prefs.theme === t.id}
              onClick={() => update({ theme: t.id, accent: t.accent })}
              style={{ ['--card-accent' as string]: t.accent }}
            >
              <span className="theme-swatch" aria-hidden="true" />
              {t.label}
              {prefs.theme === t.id && <span className="theme-card-check" aria-hidden="true"><Icon name="check" /></span>}
            </button>
          ))}
        </div>
        <label className="field hig-field-row">
          <span>Accent color</span>
          <input type="color" value={prefs.accent} onChange={(e) => update({ accent: e.target.value })} />
        </label>
      </HigGroup>

      <HigGroup title="Appearance" id="customize-appearance-title">
        <AppearanceKnobs prefs={prefs} update={update} />
      </HigGroup>

      <HigGroup title="Drive Dynamics" id="customize-dynamics-title">
        <DriveDynamicsPanel prefs={prefs} update={update} />
      </HigGroup>

      <HigGroup title="Layout" id="customize-layout-title" footer="Minimal telemetry hides the shared load, revs and acceleration bar.">
        <SegRow<LayoutDensity> id="cz-density" label="Density" value={prefs.density} onChange={(density) => update({ density })}
          options={[{ value: 'spacious', label: 'Spacious' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        <SegRow<GaugeCluster> id="cz-gauge" label="Gauge cluster" value={prefs.gaugeCluster} wrap onChange={(gaugeCluster) => update({ gaugeCluster })}
          options={[{ value: 'classic', label: 'Classic' }, { value: 'digital', label: 'Digital' }, { value: 'minimal', label: 'Minimal' }, { value: 'skin-native', label: 'Theme' }]} />
        <div className="preview-strip">
          {prefs.gaugeCluster === 'skin-native' ? (
            <p className="hig-hint" style={{ textAlign: 'center', padding: 24 }}>The selected theme draws its own gauges.</p>
          ) : (
            <Gauge style={clusterToGaugeStyle(prefs.gaugeCluster)} value={0.62} label="REVS" readout="4640" size={180} />
          )}
        </div>
        <SegRow<TelemetryDensity> id="cz-telemetry" label="Telemetry" value={prefs.telemetryDensity} onChange={(telemetryDensity) => update({ telemetryDensity })}
          options={[{ value: 'full', label: 'Full' }, { value: 'compact', label: 'Compact' }, { value: 'minimal', label: 'Minimal' }]} />
      </HigGroup>

      <HigGroup title="Units & sounds" id="customize-units-title">
        <SegRow<SpeedUnit> id="cz-units" label="Speed units" value={prefs.speedUnit} onChange={(speedUnit) => update({ speedUnit })}
          options={[{ value: 'mph', label: 'mph', ariaLabel: 'Miles per hour' }, { value: 'kph', label: 'km/h', ariaLabel: 'Kilometers per hour' }]} />
        <HigSwitch label="Keep-tab-open tip" description="Reminder that switching away may pause audio and GPS." checked={prefs.showKeepAliveTip} onChange={(showKeepAliveTip) => update({ showKeepAliveTip })} />
        <HigSwitch label="Ion lock cues" description="Chirp when Twin Ion target lock engages." checked={prefs.ionTwinLockSfx} onChange={(ionTwinLockSfx) => update({ ionTwinLockSfx })} />
        <HigSwitch label="Shift sound" description="Short mechanical bark on Manual upshifts." checked={prefs.upshiftSfx} onChange={(upshiftSfx) => update({ upshiftSfx })} />
      </HigGroup>

      <HigGroup title="Twin Ion speed digits" id="customize-ion-title" footer="Aurebesh is the Twin Ion default. Latin or Dual keeps the speed readable at a glance.">
        <SegRow<IonTwinSpeedScript> id="cz-script" label="Script" value={prefs.ionTwinSpeedScript} onChange={(ionTwinSpeedScript) => update({ ionTwinSpeedScript })}
          options={[{ value: 'aurebesh', label: 'Aurebesh' }, { value: 'dual', label: 'Dual' }, { value: 'latin', label: 'Latin' }]} />
      </HigGroup>

      <HigGroup title="Controls" id="customize-controls-title" footer="Control mapping is fixed for driving safety.">
        <dl className="hig-kv">
          <dt>Rev pad</dt><dd>{prefs.mapping.revPad}</dd>
          <dt>Speed slider</dt><dd>{prefs.mapping.speedSlider}</dd>
          <dt>Mute</dt><dd>{prefs.mapping.mute}</dd>
        </dl>
      </HigGroup>

      <button type="button" className="btn-secondary hig-btn" onClick={reset}>
        Reset to defaults
      </button>
    </div>
  );
}
