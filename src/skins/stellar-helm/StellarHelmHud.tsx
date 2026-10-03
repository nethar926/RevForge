import { useEffect, useState, type CSSProperties } from 'react';
import type { PackShellAction, PackShellPanel } from '../../packs/runtime';
import type { PackHudProps } from '../../packs/types';
import { FrameToggle } from './FrameToggle';
import { HelmRings } from './HelmRings';
import { StellarFrame, type FrameStyle } from './StellarFrame';
import './stellar-helm.css';

export interface StellarHelmHudProps extends PackHudProps {
  title: string;
  /** Frame/palette only; layout content is frame-independent. */
  frame: FrameStyle;
  /** User frame choice (persisted by the mount); renders the Frame: CLASSIC / NEO control. */
  onFrameChange: (frame: FrameStyle) => void;
  /** Short stage: tighter spacing (touch floor stays ≥ 44pt). */
  compact?: boolean;
  engineName: string;
  shellConnected: boolean;
  muted: boolean;
  /** 0..1 audio envelope when the engine exposes one; undefined → telemetry blend. */
  envelope?: number;
  onShell: (action: PackShellAction) => boolean;
  /** Drive mode (owned by the pack runtime so audio boost follows it). */
  mode: HelmMode;
  onModeChange: (mode: HelmMode) => void;
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
const BUS_SEGS = 24;
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
  const { rpm, speed, unit, throttle, load, gear, redlineRpm, running, demo, motion, distanceM, rpmNorm } = p;
  const now = useClock();
  const { mode, onModeChange: setMode } = p;

  const mph = unit === 'kph' ? speed / 1.609344 : speed;
  const unitLabel = unit === 'kph' ? 'KM/H' : 'MPH';
  const thr = running ? clamp01(throttle) : 0;
  const ld = running ? clamp01(load) : 0;
  const gearText = typeof gear === 'number' && gear > 0 ? String(gear) : 'N';

  // POWER bar: 0..max(8000, redline + 1000) in 500 rpm segments; red + hatched past redline.
  const scaleK = Math.max(8, Math.ceil(redlineRpm / 1000) + 1);
  const segRpm = (scaleK * 1000) / POWER_SEGS;
  const redFrom = Math.min(POWER_SEGS, Math.floor(redlineRpm / segRpm));
  const powerLit = Math.round(clamp01(rpm / (scaleK * 1000)) * POWER_SEGS);
  const overRedline = running && rpm >= redlineRpm;
  const bus = clamp01(p.envelope ?? (running ? 0.15 + 0.55 * clamp01(rpmNorm) + 0.3 * ld : 0));
  const busLit = Math.round(bus * BUS_SEGS);
  const trip = (distanceM || 0) / (unit === 'kph' ? 1000 : 1609.344);
  const shiftAt = Math.round((redlineRpm * 0.9) / 100) * 100;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  const shell = (a: PackShellAction) => {
    if (p.shellConnected) p.onShell(a);
  };

  return (
    <div className={`sh ${overRedline ? 'sh-over' : ''}`} data-frame={p.frame} data-compact={p.compact ? 'true' : undefined} data-mode={mode} data-running={running ? 'true' : 'false'}>
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

      <section className="sh-ring sh-panel" aria-hidden="true">
        <span className="sh-cap">{p.frame === 'classic' ? 'WARP' : 'DRIVE'}</span>
        <span className="sh-cap-r">{Math.round(mph)} MPH · {Math.round(rpm)} RPM</span>
        <div className="sh-ring-wrap">
          <HelmRings rpm={running ? rpm : 0} mph={running ? mph : 0} gear={gearText} still={!motion} />
        </div>
      </section>

      <section className="sh-power" aria-hidden="true" style={{ '--sh-red': redFrom / POWER_SEGS } as CSSProperties}>
        <div className="sh-power-head">
          <span>POWER · RPM × 1000</span>
          {overRedline && <span className="sh-over-tag">OVER REDLINE</span>}
        </div>
        <div className="sh-segs">
          {Array.from({ length: POWER_SEGS }, (_, i) => {
            const zone = i >= redFrom;
            return <i key={i} className={`${i < powerLit ? 'on' : ''} ${zone ? 'zone' : i >= redFrom - 3 ? 'hot' : ''}`} />;
          })}
          <span className="sh-redline-mark" style={{ left: `${(redFrom / POWER_SEGS) * 100}%` }}>REDLINE</span>
        </div>
        <div className="sh-nums">
          {Array.from({ length: scaleK + 1 }, (_, i) => (
            <span key={i}>{i}</span>
          ))}
        </div>
        <div className="sh-bus-head">AUDIO BUS</div>
        <div className="sh-bus">
          {Array.from({ length: BUS_SEGS }, (_, i) => (
            <i key={i} className={i < busLit ? 'on' : ''} />
          ))}
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
