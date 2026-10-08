import { useMemo, useRef, useState, type AnimationEvent, type CSSProperties } from 'react';
import { useHudCompact, type HudCompact } from './useHudCompact';
import './night-pursuit.css';
import './night-pursuit-physical.css';

export type NightPursuitMode = 'power' | 'auto' | 'norm' | 'pursuit';

interface Props {
  rpmNorm: number;
  speedNorm: number;
  throttle: number;
  loadFeel: number;
  /** Optional mph readout for decorative 7-seg (ThemeStage). Drive may omit — uses speedNorm×scale. */
  speedMph?: number;
  /** Absolute engine RPM from drive state. Tach shows this, never a normalized value. */
  rpm?: number;
  /** Redline RPM for the tach bar scale + red zone. Default 7000. */
  redlineRpm?: number;
  /** Current gear, 0 = neutral. Shown as a green 7-seg digit ("N" at 0). */
  gear?: number;
  /**
   * Initial / controlled mode. Default `norm` (button label "Cruise"). `'power'` is kept in the
   * type for old saves only (Frontend migrates it to `norm`); there is no Power button.
   */
  mode?: NightPursuitMode;
  onModeChange?: (mode: NightPursuitMode) => void;
  /**
   * Auto mode has kicked into pursuit (host decides, e.g. hard throttle). Default false.
   * Only meaningful while `mode === 'auto'`: the HUD runs hot, only the Auto key stays lit.
   */
  autoEngaged?: boolean;
  /**
   * Audio Synth voice envelope, 0..1 (post-gain loudness of the engine bus).
   * Drives the center voice box. Falls back to throttle/rpm/load blend when absent.
   */
  voiceEnvelope?: number;
  /**
   * Fired each time the top scanner eye reaches an edge (one pass).
   * Wire to Audio's optional `scannerTick` hook. Not fired under reduced motion.
   */
  onScannerPass?: (edge: 'left' | 'right') => void;
  /**
   * Compact layout for small windows (host passes `true` once its fit would push text
   * under 11px). Keeps scanner, speed + gear, RPM tach and the mode rail; drops the
   * bar stack, sensor pods and footer. Sizes are authored in on-screen px so text stays
   * ≥11px at any host scale. `'auto'` = self-detect. Default false = full layout.
   * Dev/test override (wins over the prop): `?hudCompact=1|auto|0`.
   */
  compact?: HudCompact;
}

/** Smallest font-size in the full layout (bar labels / tach scale) — drives `'auto'`. */
const NP_MIN_DESIGN_PX = 9;

const SEG_BITS: Record<string, number[]> = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '2': [1, 1, 0, 1, 1, 0, 1],
  '3': [1, 1, 1, 1, 0, 0, 1],
  '4': [0, 1, 1, 0, 0, 1, 1],
  '5': [1, 0, 1, 1, 0, 1, 1],
  '6': [1, 0, 1, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 0, 0],
  '8': [1, 1, 1, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1],
  '-': [0, 0, 0, 0, 0, 0, 1],
  N: [1, 1, 1, 0, 1, 1, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

const SEG_PATHS = [
  'M4 2 H16 L18 4 L16 6 H4 L2 4 Z',
  'M18 5 L20 7 V15 L18 17 L16 15 V7 Z',
  'M18 19 L20 21 V29 L18 31 L16 29 V21 Z',
  'M4 30 H16 L18 32 L16 34 H4 L2 32 Z',
  'M2 19 L4 21 V29 L2 31 L0 29 V21 Z',
  'M2 5 L4 7 V15 L2 17 L0 15 V7 Z',
  'M4 16 H16 L18 18 L16 20 H4 L2 18 Z',
];

function SevenSeg({
  value,
  blankLeading = false,
  digits = 3,
  tone = 'crimson',
  unit,
}: {
  value: number | string;
  /** Show unlit segments instead of leading zeros (realistic tach). */
  blankLeading?: boolean;
  digits?: number;
  tone?: 'crimson' | 'amber' | 'green';
  unit?: string;
}) {
  const text =
    typeof value === 'string'
      ? value.padStart(digits, ' ')
      : String(Math.max(0, Math.min(10 ** digits - 1, Math.round(value)))).padStart(digits, '0');
  return (
    <div className={`np-seg-row np-seg-${tone}`}>
      {[...(blankLeading ? text.replace(/^0+(?=.)/, (z) => ' '.repeat(z.length)) : text)].map((ch, i) => {
        const bits = SEG_BITS[ch] ?? SEG_BITS[' '];
        return (
          <svg key={i} className="np-seg-digit" viewBox="0 0 20 36" aria-hidden>
            {SEG_PATHS.map((d, si) => (
              <path key={si} className={bits[si] ? 'np-seg-on' : 'np-seg-off'} d={d} />
            ))}
          </svg>
        );
      })}
      {unit ? <span className="np-seg-unit">{unit}</span> : null}
    </div>
  );
}

function SegBar({
  value,
  segments = 20,
  palette = 'gar',
  redFrom,
}: {
  value: number;
  segments?: number;
  palette?: string;
  /** 0..1: segments at/after this point are drawn as a redline zone (dim red when unlit). */
  redFrom?: number;
}) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * segments);
  const pal = palette.split('');
  return (
    <div className="np-bar" aria-hidden>
      {Array.from({ length: segments }, (_, i) => {
        const zone = redFrom != null && i / segments >= redFrom;
        if (i >= lit) return <i key={i} className={zone ? 'zone' : undefined} />;
        if (zone) return <i key={i} className="lit r" />;
        const t = i / segments;
        const c = t < 0.45 ? pal[0] : t < 0.75 ? pal[1] || pal[0] : pal[2] || pal[1] || pal[0];
        return <i key={i} className={`lit ${c}`} />;
      })}
    </div>
  );
}

/** Drive-mode keys, in rail order. `norm` keeps its id (saves, audio boost) but reads "Cruise". */
export const NP_MODES: readonly { id: Exclude<NightPursuitMode, 'power'>; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'norm', label: 'Cruise' },
  { id: 'pursuit', label: 'Pursuit' },
];

/** Hot HUD (fast scanner, red plate, chase status): Pursuit, legacy Power, or Auto once engaged. */
function npPursuitHot(mode: NightPursuitMode, autoEngaged = false): boolean {
  return mode === 'pursuit' || mode === 'power' || (mode === 'auto' && autoEngaged);
}

/** Footer mode text: the key label in caps; engaged Auto reads "AUTO · PURSUIT". */
function npModeStatus(mode: NightPursuitMode, autoEngaged = false): string {
  if (mode === 'auto' && autoEngaged) return 'AUTO · PURSUIT';
  return (NP_MODES.find((m) => m.id === mode)?.label ?? mode).toUpperCase();
}

let npRailSeq = 0;

const SCANNER_CELLS = 36;

/**
 * Night Pursuit Drive HUD — matte-black command dash with crimson scanner,
 * 7-seg banks, dual CRT pods, and a "Drive mode" rail of AUTO / CRUISE / PURSUIT keys.
 * Original art only. Decorative SPEED 7-seg mirrors telemetry; app may still own hero SPEED.
 */
export function NightPursuitOverlay({
  rpmNorm,
  speedNorm,
  throttle,
  loadFeel,
  speedMph,
  mode: modeProp,
  onModeChange,
  autoEngaged = false,
  voiceEnvelope,
  onScannerPass,
  rpm: rpmAbs,
  redlineRpm = 7000,
  gear,
  compact: compactProp,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useHudCompact(rootRef, compactProp, NP_MIN_DESIGN_PX);
  const [modeLocal, setModeLocal] = useState<NightPursuitMode>('norm');
  const mode = modeProp ?? modeLocal;
  const setMode = (m: NightPursuitMode) => {
    setModeLocal(m);
    onModeChange?.(m);
  };

  const rpm = Math.max(0, Math.min(1, rpmNorm));
  const thr = Math.max(0, Math.min(1, throttle));
  const load = Math.max(0, Math.min(1, loadFeel));
  const spd = Math.max(0, Math.min(1, speedNorm));
  const mph = speedMph ?? Math.round(spd * 120);
  const redline = Math.max(1000, redlineRpm);
  // Real RPM from drive state; normalized fallback only when the host omits it.
  const rpmReal = Math.max(0, Math.round(rpmAbs ?? rpm * redline));
  const rpmShown = Math.round(rpmReal / 10) * 10; // last digit settles like a real counter
  // Classic 0–8k face (grows in 1k steps only if redline + 10% exceeds 8k); redline zone from redlineRpm.
  const tachMax = Math.max(8000, Math.ceil((redline * 1.1) / 1000) * 1000);
  const tachFrac = Math.min(1, rpmReal / tachMax);
  const gearText = gear == null ? null : gear <= 0 ? 'N' : String(Math.min(9, gear));
  const pursuitHot = npPursuitHot(mode, autoEngaged);
  // Stable per-instance id for the rail's aria-labelledby (several HUDs can be on screen).
  const railLabelId = useMemo(() => `np-mode-label-${++npRailSeq}`, []);

  const env = voiceEnvelope == null ? null : Math.max(0, Math.min(1, voiceEnvelope));
  const voiceCols = useMemo(() => {
    // Outer columns sit lower than the center, like a classic voice-box modulator.
    const base =
      env == null
        ? [thr * 0.7 + load * 0.3, rpm * 0.85 + thr * 0.15, load * 0.6 + rpm * 0.4]
        : [env * 0.72, env, env * 0.72];
    return base.map((v) => Math.max(0.08, Math.min(1, v * (pursuitHot ? 1.15 : 0.9))));
  }, [env, thr, load, rpm, pursuitHot]);

  const [edge, setEdge] = useState<'left' | 'right'>('left');
  const handleSweepIteration = (_e: AnimationEvent<HTMLDivElement>) => {
    const next = edge === 'left' ? 'right' : 'left';
    setEdge(next);
    onScannerPass?.(next);
  };

  const scanner = (
    <>
      {/* Mandatory top scanner — ping-pong sweep eye over a dim LED bank.
          Reduced motion → static center glow via CSS. */}
      <div className="np-scanner" aria-hidden>
        {Array.from({ length: SCANNER_CELLS }, (_, i) => (
          <i key={i} className="np-scanner-cell" />
        ))}
        <div className="np-scanner-track">
          <div className="np-scanner-eye" onAnimationIteration={handleSweepIteration} />
        </div>
      </div>
    </>
  );
  const tachBar = (
    <div className="np-tach-bar">
      <SegBar value={tachFrac} segments={22} palette="aar" redFrom={redline / tachMax} />
      <div className="np-tach-scale">
        {Array.from({ length: tachMax / 1000 + 1 }, (_, k) => (
          <span
            key={k}
            className={k * 1000 >= redline ? 'red' : undefined}
            style={{ left: `${((k * 1000) / tachMax) * 100}%` }}
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
  const voice = (
    <div className="np-voice" aria-hidden>
      {voiceCols.map((h, ci) => {
        const n = 10;
        const lit = Math.round(h * n);
        return (
          <div key={ci} className="np-voice-col">
            {Array.from({ length: n }, (_, i) => (
              <span key={i} className={i < lit ? 'lit' : undefined} />
            ))}
          </div>
        );
      })}
    </div>
  );
  // "Drive mode" is a plain caption (not a control); the keys are a labelled group, so
  // VoiceOver reads "Drive mode, group". Only the selected key is lit, even when Auto is engaged.
  const modeRail = (extra = '') => (
    <div
      className={`np-mode-rail${extra}`}
      role="group"
      aria-labelledby={railLabelId}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="np-mode-label" id={railLabelId}>
        Drive mode
      </div>
      {NP_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`np-mode-btn${mode === m.id ? ' active' : ''}`}
          aria-pressed={mode === m.id}
          data-engaged={m.id === 'auto' && mode === 'auto' && autoEngaged ? 'true' : undefined}
          onClick={() => setMode(m.id)}
        >
          <span className="np-key-lamp" aria-hidden />
          {m.label}
        </button>
      ))}
    </div>
  );

  if (fit.compact) {
    return (
      <div
        ref={rootRef}
        className={`np-overlay np-compact${pursuitHot ? ' np-hot' : ''}`}
        data-compact="true"
        data-mode={mode}
        data-np-cols={fit.realW >= 560 ? 2 : 1}
        data-np-tight={fit.realH < 345 && fit.realW < 560 ? '' : undefined}
        style={
          {
            ['--np-rpm']: rpm,
            ['--np-speed']: spd,
            ['--np-throttle']: thr,
            ['--np-load']: load,
            ['--np-scanner-ms']: pursuitHot ? '1100ms' : '2200ms',
            ['--u']: `${fit.unit}px`,
          } as CSSProperties
        }
      >
        {scanner}
        <div className="np-c-dash">
          <section className="np-pod np-c-speed" aria-hidden>
            <div className="np-pod-label">Velocity</div>
            <div className="np-readout-row">
              <SevenSeg value={mph} digits={3} blankLeading tone="crimson" unit="MPH" />
              {gearText ? (
                <div className="np-gear">
                  <span className="np-mini-label">Gear</span>
                  <SevenSeg value={gearText} digits={1} tone="green" />
                </div>
              ) : null}
            </div>
            <div className="np-c-thr">
              <span className="np-bar-label">Throttle</span>
              <SegBar value={thr} palette="gar" />
            </div>
          </section>
          <section className="np-pod np-c-tach" aria-hidden>
            <div className="np-pod-label">Tach</div>
            <div className="np-c-tach-row">
              <SevenSeg value={rpmShown} digits={4} blankLeading tone="amber" unit="RPM" />
              {voice}
            </div>
            {tachBar}
          </section>
          {modeRail(' np-c-rail')}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`np-overlay${pursuitHot ? ' np-hot' : ''}`}
      data-mode={mode}
      style={
        {
          ['--np-rpm']: rpm,
          ['--np-speed']: spd,
          ['--np-throttle']: thr,
          ['--np-load']: load,
          ['--np-scanner-ms']: pursuitHot ? '1100ms' : '2200ms',
        } as CSSProperties
      }
    >
      {scanner}

      <div className="np-dash">
        <section className="np-pod np-pod-speed" aria-hidden>
          <div className="np-pod-label">Primary · Velocity</div>
          <div className="np-readout-row">
            <SevenSeg value={mph} digits={3} blankLeading tone="crimson" unit="MPH" />
            {gearText ? (
              <div className="np-gear">
                <span className="np-mini-label">Gear</span>
                <SevenSeg value={gearText} digits={1} tone="green" />
              </div>
            ) : null}
          </div>
          <div className="np-bar-stack">
            <span className="np-bar-label">Throttle</span>
            <SegBar value={thr} palette="gar" />
            <span className="np-bar-label">Load</span>
            <SegBar value={load} palette="gar" />
            <span className="np-bar-label">Engine</span>
            <SegBar value={rpm} palette="ar" />
          </div>
        </section>

        <section className="np-pod np-pod-tach" aria-hidden>
          <div className="np-pod-label">Tach · Envelope</div>
          <SevenSeg value={rpmShown} digits={4} blankLeading tone="amber" unit="RPM" />
          {tachBar}
          {voice}
        </section>

        <section className="np-pod np-pod-crt" aria-hidden>
          <div className="np-pod-label">Sensor pods</div>
          <div className="np-crt-pair">
            <div className="np-crt np-crt-a">
              {/* Original orbit/chevron glyph (Night Pursuit mark) */}
              <svg className="np-crt-glyph" viewBox="0 0 64 64" aria-hidden>
                <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
                <circle cx="32" cy="32" r="10" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
                <path d="M32 12 L38 28 L32 24 L26 28 Z" fill="currentColor" />
                <path d="M18 40 L32 50 L46 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="np-crt np-crt-b">
              <div className="np-crt-feed">
                <span>{pursuitHot ? 'SYS · PURSUIT' : 'SYS · MONITOR'}</span>
                <span>{Math.round(thr * 100)}% THR</span>
                <span>{Math.round(load * 100)}% LOAD</span>
              </div>
            </div>
          </div>
        </section>

        {modeRail()}
      </div>

      <div className="np-footer" aria-hidden>
        <div className="np-badge" title="Night Pursuit mark">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden>
            <circle cx="16" cy="16" r="11" stroke="#ff1a1a" strokeWidth="1.5" opacity="0.7" />
            <path d="M16 6 L20 14 L16 12 L12 14 Z" fill="#ff1a1a" />
            <path d="M8 20 L16 26 L24 20" stroke="#ffb000" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="16" cy="16" r="2.5" fill="#00e5ff" />
          </svg>
        </div>
        <div className="np-status">
          <span className="np-pack-tag">Night Pursuit · Experimental</span>
          <span>
            {pursuitHot ? 'Scanner chase' : 'Scanner idle'} · Mode {npModeStatus(mode, autoEngaged)}
          </span>
        </div>
        <div className="np-yoke" title="Decorative yoke motif" />
      </div>
    </div>
  );
}
