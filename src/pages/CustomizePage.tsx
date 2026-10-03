import { Gauge } from '../components/Gauge';
import { AppearanceKnobs } from '../components/visuals/AppearanceKnobs';
import { DriveDynamicsPanel } from '../components/visuals/DriveDynamicsPanel';
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

export function CustomizePage({ prefs, update, reset }: Props) {
  return (
    <div className="page customize-page">
      <header className="page-head">
        <h1>Interface Options</h1>
        <p className="page-sub">
          Themes, appearance, Drive Dynamics & SFX — saved locally (RevForge Visuals)
        </p>
      </header>

      <aside className="rf-frontend-note" role="note">
        <strong>Frontend handoff:</strong> when ☰ hamburger IA merges, move{' '}
        <em>Appearance</em> + <em>Drive Dynamics</em> under{' '}
        <code>☰ → Interface Options → Visuals</code> (alongside Themes / Clusters).
        Until then this panel lives on <code>/customize</code> (
        <code>src/pages/CustomizePage.tsx</code>). Components:{' '}
        <code>src/components/visuals/AppearanceKnobs.tsx</code>,{' '}
        <code>src/components/visuals/DriveDynamicsPanel.tsx</code>.
      </aside>

      <section className="panel">
        <h2 className="section-title">Theme</h2>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card ${prefs.theme === t.id ? 'selected' : ''}`}
              aria-pressed={prefs.theme === t.id}
              onClick={() => update({ theme: t.id, accent: t.accent })}
              style={{ ['--card-accent' as string]: t.accent, minHeight: 48 }}
            >
              <span className="theme-swatch" />
              {t.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Accent</span>
          <input
            type="color"
            value={prefs.accent}
            onChange={(e) => update({ accent: e.target.value })}
            aria-label="Accent color"
          />
        </label>
      </section>

      <section className="panel">
        <h2 className="section-title">Appearance</h2>
        <AppearanceKnobs prefs={prefs} update={update} />
      </section>

      <section className="panel">
        <h2 className="section-title">Drive Dynamics</h2>
        <DriveDynamicsPanel prefs={prefs} update={update} />
      </section>

      <section className="panel">
        <h2 className="section-title">Layout density</h2>
        <div className="segmented">
          {(['spacious', 'comfortable', 'compact'] as LayoutDensity[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`seg-btn ${prefs.density === d ? 'active' : ''}`}
              onClick={() => update({ density: d })}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Gauge cluster</h2>
        <div className="segmented">
          {(
            [
              ['classic', 'Classic'],
              ['digital', 'Digital'],
              ['minimal', 'Minimal'],
              ['skin-native', 'Skin-native'],
            ] as [GaugeCluster, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`seg-btn ${prefs.gaugeCluster === id ? 'active' : ''}`}
              style={{ minHeight: 48 }}
              onClick={() => update({ gaugeCluster: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="preview-strip">
          {prefs.gaugeCluster === 'skin-native' ? (
            <p className="help-text dim" style={{ textAlign: 'center', padding: 24 }}>
              Skin-native — pack overlay owns the secondary ring (fallback: Minimal).
            </p>
          ) : (
            <Gauge
              style={clusterToGaugeStyle(prefs.gaugeCluster)}
              value={0.62}
              label="REVS"
              readout="4640"
              size={180}
            />
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Telemetry density</h2>
        <div className="segmented">
          {(
            [
              ['full', 'Full'],
              ['compact', 'Compact'],
              ['minimal', 'Minimal'],
            ] as [TelemetryDensity, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`seg-btn ${prefs.telemetryDensity === id ? 'active' : ''}`}
              style={{ minHeight: 48 }}
              onClick={() => update({ telemetryDensity: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="help-text dim">
          Minimal hides the shared LOAD/REVS/ACCEL bar (skin-native gauges keep SPEED dominant).
        </p>
      </section>

      <section className="panel">
        <h2 className="section-title">Units & coaching</h2>
        <div className="segmented">
          {(['mph', 'kph'] as SpeedUnit[]).map((u) => (
            <button
              key={u}
              type="button"
              className={`seg-btn ${prefs.speedUnit === u ? 'active' : ''}`}
              onClick={() => update({ speedUnit: u })}
            >
              {u.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="toggle-row mt">
          <input
            type="checkbox"
            checked={prefs.showKeepAliveTip}
            onChange={(e) => update({ showKeepAliveTip: e.target.checked })}
          />
          <span>Show keep-tab-open tip</span>
        </label>
        <label className="toggle-row mt tesla-touch">
          <input
            type="checkbox"
            checked={prefs.ionTwinLockSfx}
            onChange={(e) => update({ ionTwinLockSfx: e.target.checked })}
          />
          <span>Ion Twin lock SFX</span>
        </label>
        <p className="help-text dim">Optional chirp when TARGET LOCK engages (off by default).</p>
        <label className="toggle-row mt tesla-touch">
          <input
            type="checkbox"
            checked={prefs.upshiftSfx}
            onChange={(e) => update({ upshiftSfx: e.target.checked })}
          />
          <span>MANUAL upshift bark</span>
        </label>
        <p className="help-text dim">
          Optional short mechanical bark on MANUAL paddle up (off by default). Frontend:{' '}
          <code>eng.triggerUiCue(&apos;upshift&apos;)</code>.
        </p>
        <h2 className="section-title mt">Ion Twin SPEED script</h2>
        <p className="help-text dim">
          Aurebesh is the Ion Twin default. Latin or dual-ghost keeps glanceability under cabin motion.
          Sets <code>data-speed-script</code> on the shell when that skin is active.
        </p>
        <div className="segmented">
          {(
            [
              { id: 'aurebesh', label: 'Aurebesh' },
              { id: 'dual', label: 'Dual ghost' },
              { id: 'latin', label: 'Latin' },
            ] as { id: IonTwinSpeedScript; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`seg-btn ${prefs.ionTwinSpeedScript === opt.id ? 'active' : ''}`}
              onClick={() => update({ ionTwinSpeedScript: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">Control mapping</h2>
        <p className="help-text">
          Rev pad → <code>{prefs.mapping.revPad}</code> · Speed slider →{' '}
          <code>{prefs.mapping.speedSlider}</code> · Mute → <code>{prefs.mapping.mute}</code>
        </p>
        <p className="help-text dim">
          Mapping is fixed for v0 drive safety; values persist with your UI prefs.
        </p>
      </section>

      <button type="button" className="btn-secondary" onClick={reset}>
        Reset to defaults
      </button>
    </div>
  );
}
