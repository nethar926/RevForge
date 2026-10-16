import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PackShellAction, PackShellPanel } from '../../packs/runtime';
import type { PackHudProps } from '../../packs/types';
import { FrameToggle } from './FrameToggle';
import { HelmRings } from './HelmRings';
import { LIGHT_SPEED_MPH_DEFAULT, lightSpeedPct, warpFactor } from './lightSpeed';
import { StellarFrame, type FrameStyle } from './StellarFrame';
import { useHudCompact, type HudCompact } from './useHudCompact';
import './stellar-helm.css';

export interface StellarHelmHudProps extends PackHudProps {
  title: string;
  /** Frame/palette only; layout content is frame-independent. */
  frame: FrameStyle;
  /** User frame choice (persisted by the mount); renders the Frame: CLASSIC / NEO control. */
  onFrameChange: (frame: FrameStyle) => void;
  /**
   * Compact layout for small windows: host passes `true` once its fit would push text
   * under 11px (`'auto'` = skin self-detects from its rendered scale). Sizes are authored
   * in on-screen px so text stays ≥11px and the bar ≥48px at any host scale. Keeps tabs,
   * RPM / MPH / THR, rings + WARP FACTOR, power bar + redline,
   * LIGHT SPEED meter, full bottom bar (modes, MUTE, Frame CLASSIC/NEO, SHUTDOWN); drops
   * header, data rows and log line. Both frames. Default false = full layout. Dev/test: `?hudCompact=1|auto|0`.
   */
  compact?: HudCompact;
  engineName: string;
  shellConnected: boolean;
  muted: boolean;
  /** 0..1 audio envelope from the host. Unused since LIGHT SPEED replaced the AUDIO BUS strip; kept for the mount contract. */
  envelope?: number;
  onShell: (action: PackShellAction) => boolean;
  /** Drive mode (owned by the pack runtime so audio boost follows it). */
  mode: HelmMode;
  onModeChange: (mode: HelmMode) => void;
  /**
   * Road speed (mph) that reads as 100% on the LIGHT SPEED meter. Placeholder default 70;
   * non-finite or ≤ 0 falls back to the default.
   */
  lightSpeedMph?: number;
}

export type HelmMode = 'cruise' | 'sport' | 'boost';
const MODES: { id: HelmMode; label: string }[] = [
  { id: 'cruise', label: 'CRUISE' },
  { id: 'sport', label: 'SPORT' },
  { id: 'boost', label: 'BOOST' },
];
const TABS: { label: string; panel: PackShellPanel | null }[] = [
  { label: 'DRIVE', panel: null },
  { label: 'ENGINES', panel: 'garage' },
  { label: 'VISUALS', panel: 'scenes' },
  { label: 'SOUND', panel: 'tune' },
  { label: 'OPTIONS', panel: 'tuner' },
];
const POWER_SEGS = 16;
const LS_SEGS = 24;
const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

function dayOfYear(d: Date) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function StellarHelmHud(p: StellarHelmHudProps) {
  const { rpm, speed, unit, throttle, load, redlineRpm, running, demo, motion, distanceM } = p;
  const now = useClock();
  const rootRef = useRef<HTMLDivElement>(null);
  const cfit = useHudCompact(rootRef, p.compact, 13);
  const { mode, onModeChange: setMode } = p;

  const mph = unit === 'kph' ? speed / 1.609344 : speed;
  const unitLabel = unit === 'kph' ? 'KM/H' : 'MPH';
  const thr = running ? clamp01(throttle) : 0;
  const ld = running ? clamp01(load) : 0;

  // POWER bar: 0..max(8000, redline + 1000) in 500 rpm segments; red + hatched past redline.
  const scaleK = Math.max(8, Math.ceil(redlineRpm / 1000) + 1);
  const segRpm = (scaleK * 1000) / POWER_SEGS;
  const redFrom = Math.min(POWER_SEGS, Math.floor(redlineRpm / segRpm));
  const powerLit = Math.round(clamp01(rpm / (scaleK * 1000)) * POWER_SEGS);
  const overRedline = running && rpm >= redlineRpm;
  // Light-speed readouts come from road speed only (no new sensors).
  const jumpMph = Number.isFinite(p.lightSpeedMph) && (p.lightSpeedMph as number) > 0 ? (p.lightSpeedMph as number) : LIGHT_SPEED_MPH_DEFAULT;
  // Both follow the whole mph the ring readout shows, so 62 MPH reads WARP 6.2 and 89%.
  const warp = warpFactor(Math.round(mph));
  const lsPct = lightSpeedPct(Math.round(mph), jumpMph);
  const lsLit = lsPct >= 100 ? LS_SEGS : Math.min(LS_SEGS - 1, Math.floor((lsPct / 100) * LS_SEGS));
  const atLight = lsPct >= 100;
  const jumpText = unit === 'kph' ? `${Math.round(jumpMph * 1.609344)} KM/H` : `${Math.round(jumpMph)} MPH`;
  const trip = (distanceM || 0) / (unit === 'kph' ? 1000 : 1609.344);
  const shiftAt = Math.round((redlineRpm * 0.9) / 100) * 100;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  const shell = (a: PackShellAction) => {
    if (p.shellConnected) p.onShell(a);
  };

  return (
    <div
      ref={rootRef}
      className={`sh ${overRedline ? 'sh-over' : ''}${cfit.compact ? ' sh-compact' : ''}`}
      data-frame={p.frame}
      data-compact={cfit.compact ? 'true' : undefined}
      data-sh-tight={cfit.compact && cfit.realH < 330 ? '' : undefined}
      data-mode={mode}
      data-running={running ? 'true' : 'false'}
      style={cfit.compact ? ({ '--u': `${cfit.unit}px` } as CSSProperties) : undefined}
    >
      <StellarFrame frame={p.frame} />
      <header className="sh-hdr" aria-hidden="true">
        <span className="sh-title">{p.title.toUpperCase()}</span>
        <span className="sh-status">
          HELM · AUDIO {running ? 'ONLINE' : 'STANDBY'} · {demo ? 'DEMO' : 'GPS'}
        </span>
        <span className="sh-clock">{hh}:{mm}</span>
      </header>

      <nav className="sh-tabs sh-panel" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-current={t.panel === null ? 'page' : undefined}
            aria-disabled={t.panel !== null && !p.shellConnected ? true : undefined}
            onClick={() => t.panel && shell({ type: 'open-panel', panel: t.panel })}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="sh-main sh-panel" aria-hidden="true">
        <div className="sh-screen">
          <div className="sh-rpm-row">
            <span className="sh-rpm">{Math.round(rpm)}</span>
            <span className="sh-u">RPM</span>
          </div>
          <div className="sh-rule"><i style={{ width: `${clamp01(rpm / (scaleK * 1000)) * 100}%` }} /></div>
          <div className="sh-mph-row">
            <span className="sh-mph">{Math.round(speed)}</span>
            <span className="sh-u">{unitLabel}</span>
          </div>
          <div className="sh-thr">
            <span className="sh-thr-label">THR</span>
            <div className="sh-thr-track"><b style={{ width: `${thr * 100}%` }} /></div>
            <span className="sh-thr-val">{Math.round(thr * 100)}%</span>
          </div>
        </div>
        <p className="sh-log">
          <b>LOG {now.getFullYear()}.{String(dayOfYear(now)).padStart(3, '0')}</b> · ENGINE {running ? 'ONLINE' : 'STANDBY'} · SHIFT AT {shiftAt}
        </p>
      </section>

      <section className="sh-data" aria-hidden="true">
        {[
          ['01', String(Math.round(thr * 100)), '% THROTTLE'],
          ['02', String(Math.round(ld * 100)), '% LOAD'],
          ['03', String(Math.round(redlineRpm)), 'REDLINE RPM'],
          ['04', trip.toFixed(1), unit === 'kph' ? 'KM TRIP' : 'MI TRIP'],
          ['05', p.engineName ? p.engineName.toUpperCase() : '—', 'ENGINE'],
        ].map(([n, v, l]) => (
          <div className="sh-row" key={n}>
            <b className="sh-idx">{n}</b>
            <span className="sh-val">{v}</span>
            <small>{l}</small>
          </div>
        ))}
      </section>

      <section className="sh-ring sh-panel">
        <span className="sh-cap" aria-hidden="true">{p.frame === 'classic' ? 'WARP' : 'DRIVE'}</span>
        <div className="sh-ring-wrap">
          <div className="sh-ring-dial" aria-hidden="true">
            <HelmRings rpm={running ? rpm : 0} mph={running ? mph : 0} still={!motion} />
          </div>
          <div className="sh-warp" role="img" aria-label={`Warp ${warp}`}>
            <span className="sh-warp-label" aria-hidden="true">WARP FACTOR</span>
            <span className="sh-warp-num" aria-hidden="true">{warp}</span>
          </div>
        </div>
      </section>

      <section className="sh-power" style={{ '--sh-red': redFrom / POWER_SEGS } as CSSProperties}>
        <div className="sh-power-head" aria-hidden="true">
          <span>POWER · RPM × 1000</span>
          {overRedline && <span className="sh-over-tag">OVER REDLINE</span>}
        </div>
        <div className="sh-segs" aria-hidden="true">
          {Array.from({ length: POWER_SEGS }, (_, i) => {
            const zone = i >= redFrom;
            return <i key={i} className={`${i < powerLit ? 'on' : ''} ${zone ? 'zone' : i >= redFrom - 3 ? 'hot' : ''}`} />;
          })}
          <span className="sh-redline-mark" style={{ left: `${(redFrom / POWER_SEGS) * 100}%` }}>REDLINE</span>
        </div>
        <div className="sh-nums" aria-hidden="true">
          {Array.from({ length: scaleK + 1 }, (_, i) => (
            <span key={i}>{i}</span>
          ))}
        </div>
        {/* LIGHT SPEED meter (replaces the decorative AUDIO BUS strip). 100% = a steady lit plate, never a flash. */}
        <div
          className="sh-ls"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={lsPct}
          aria-valuetext={atLight ? 'Light speed 100 percent, at light speed' : `Light speed ${lsPct} percent`}
          aria-label={`Light speed ${lsPct} percent`}
          data-at-light={atLight ? 'true' : undefined}
        >
          <div className="sh-ls-head" aria-hidden="true">
            <span className="sh-ls-val">LIGHT SPEED · {lsPct}%</span>
            {atLight ? <span className="sh-ls-plate">◆ LIGHT SPEED</span> : <span className="sh-ls-jump">JUMP AT {jumpText}</span>}
          </div>
          <div className="sh-ls-track" aria-hidden="true">
            <div className="sh-ls-segs">
              {Array.from({ length: LS_SEGS }, (_, i) => (
                <i key={i} className={i < lsLit ? 'on' : ''} />
              ))}
            </div>
            <em className="sh-ls-cap">LS</em>
          </div>
        </div>
      </section>

      <div className="sh-bar">
        <div className="sh-modes" role="group" aria-label="Drive mode">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sh-mute"
          aria-pressed={p.muted}
          aria-disabled={!p.shellConnected || undefined}
          onClick={() => shell({ type: 'toggle-mute' })}
        >
          MUTE
        </button>
        <FrameToggle frame={p.frame} onChange={p.onFrameChange} />
        <button
          type="button"
          className="sh-shutdown"
          aria-disabled={!running || !p.shellConnected || undefined}
          onClick={() => {
            if (running) shell({ type: 'shutdown' });
          }}
        >
          SHUTDOWN
        </button>
      </div>
    </div>
  );
}
