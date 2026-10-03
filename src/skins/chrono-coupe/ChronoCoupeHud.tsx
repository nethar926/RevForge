import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { PackHudProps } from '../../packs/types';
import { DestinationDialog } from './DestinationDialog';
import { JUMP_THRESHOLD, bankParts, defaultDestination, readStoredDate, storeDate } from './chronoModel';
import { useHudCompact, type HudCompact } from './useHudCompact';
import './chrono-coupe.css';

export interface ChronoCoupeHudProps extends PackHudProps {
  /** localStorage prefix, e.g. `revforge.pack.<id>`. */
  storageKey: string;
  /**
   * Compact layout for small windows: host passes `true` once its fit would push text
   * under 11px (`'auto'` = skin self-detects from its rendered scale). Sizes are authored
   * in on-screen px so text stays ≥11px and the rail ≥48px at any host scale.
   * Keeps all three date banks (cell captions dropped, active AM/PM only), the original
   * Y flux core + %, velocity + charge bar, engine bars + RPM + gear, output readout
   * and the rail; drops the brass needle meter. Default false = full layout.
   * Dev/test override: `?hudCompact=1|auto|0`.
   */
  compact?: HudCompact;
  shellConnected: boolean;
  muted: boolean;
  onToggleSound: () => void;
  /** Optional engine hook: 0..1 charge (speed / jump threshold). */
  onCharge?: (level: number) => void;
  /** Optional engine hook: one-shot discharge (threshold crossed / JUMP SEQUENCE armed). */
  onDischarge?: () => void;
  /** Rail mode (persisted by the pack runtime so Audio can follow it). */
  mode: RailMode;
  onModeChange: (mode: RailMode) => void;
  /** 0..1 engine envelope when the engine exposes one (charge-core node shimmer). */
  envelope?: number;
}

export type RailMode = 'cruise' | 'jump' | 'off';
const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

const reducedMotionQuery = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    return null;
  }
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !!reducedMotionQuery()?.matches);
  useEffect(() => {
    const mq = reducedMotionQuery();
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Device clock, re-rendered on each minute boundary. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      t = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
    };
    const d = new Date();
    t = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
    return () => clearTimeout(t);
  }, []);
  return now;
}

/**
 * Tinted glass in front of a segment display. The parent `.cc-glass` is the inset well;
 * this layer adds the diagonal glare + inner edge highlight (pure CSS, no backdrop-filter).
 */
function Glare() {
  return <i className="cc-glare" aria-hidden="true" />;
}

function Cell({ seg, ghost, value, label }: { seg: 7 | 14; ghost: string; value: string; label: string }) {
  return (
    <div className={`cc-cell cc-seg${seg}`}>
      <span className="cc-glass">
        <span className="cc-digits">
          <span className="cc-ghost">{ghost}</span>
          <span className="cc-lit">{value}</span>
        </span>
        <Glare />
      </span>
      <small>{label}</small>
    </div>
  );
}

function DateBank({ tone, label, date }: { tone: 'dest' | 'present' | 'departed'; label: string; date: Date }) {
  const p = bankParts(date);
  return (
    <div className={`cc-bank cc-${tone}`} data-testid={`cc-bank-${tone}`}>
      <span className="rf-sr-only">{`${label}: ${p.spoken}`}</span>
      <div className="cc-cells" aria-hidden="true">
        <Cell seg={14} ghost="~~~" value={p.month} label="MONTH" />
        <Cell seg={7} ghost="88" value={p.day} label="DAY" />
        <Cell seg={7} ghost="8888" value={p.year} label="YEAR" />
        <div className="cc-ampm">
          <span><i className={!p.pm ? 'on' : ''} />AM</span>
          <span><i className={p.pm ? 'on' : ''} />PM</span>
        </div>
        <Cell seg={7} ghost="88" value={p.hour} label="HOUR" />
        <div className="cc-colon"><i /><i /></div>
        <Cell seg={7} ghost="88" value={p.minute} label="MIN" />
      </div>
      <div className="cc-plate" aria-hidden="true">{label}</div>
    </div>
  );
}

/** Three-electrode charge glow; intensity follows charge, flash on threshold. */
function ChargeCore({ charge, flash, voice }: { charge: number; flash: number; voice: number }) {
  return (
    <svg className="cc-core-svg" viewBox="0 0 240 190" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ '--cc-charge': charge, '--cc-voice': voice } as CSSProperties}>
      <defs>
        <filter id="cc-core-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" /></filter>
        <linearGradient id="cc-core-line" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#ffe9a8" /></linearGradient>
        <linearGradient id="cc-core-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" /><stop offset="0.4" stopColor="#fff" stopOpacity="0.03" /><stop offset="0.41" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect className="cc-core-window" x="10" y="4" width="220" height="182" rx="12" fill="#0d0e10" stroke="#3b3d41" strokeWidth="3" />
      <g className="cc-core-glow" filter="url(#cc-core-blur)">
        <path d="M40 30 L120 100 L200 30 M120 100 L120 170" fill="none" stroke="#ffd36b" strokeWidth="14" strokeLinecap="round" />
        <circle cx="120" cy="100" r="13" fill="#fff" />
      </g>
      <g className="cc-core-wire">
        <path d="M40 30 L120 100 L200 30 M120 100 L120 170" fill="none" stroke="url(#cc-core-line)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="120" cy="100" r="7" fill="#fff" />
      </g>
      <circle className="cc-core-voice" cx="120" cy="100" r="16" fill="#fff6d8" />
      {flash > 0 && <circle key={flash} className="cc-core-flash" cx="120" cy="100" r="70" fill="#fff" />}
      <g className="cc-core-nodes" fill="#2a2c30" stroke="#5a5d62"><circle cx="40" cy="30" r="9" /><circle cx="200" cy="30" r="9" /><circle cx="120" cy="170" r="9" /></g>
      {/* glass in front of the core window: diagonal glare + inner edge (hidden under Reduce Transparency) */}
      <g className="cc-core-glare">
        <rect x="13" y="7" width="214" height="176" rx="10" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="5" />
        <rect x="10" y="4" width="220" height="182" rx="12" fill="url(#cc-core-glass)" />
        <rect x="11.5" y="5.5" width="217" height="179" rx="11" fill="none" stroke="#fff" strokeOpacity="0.09" strokeWidth="1" />
      </g>
    </svg>
  );
}

/**
 * Meter label size that ignores the SVG scale: sets `--cc-meter-scale` (on-screen px per
 * viewBox unit, including the host fit transform) so the labels' CSS font-size can be
 * authored in screen px. Observes the SVG and its first ancestors (host fit changes
 * resize one of them) — nothing per frame.
 */
function useMeterScale() {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = Math.min(r.width / 400, r.height / 160); // preserveAspectRatio meet
      if (Math.abs(s - last) < 0.001) return;
      last = s;
      el.style.setProperty('--cc-meter-scale', s.toFixed(4));
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (let a: Element | null = el, i = 0; a && i < 6; a = a.parentElement, i++) ro.observe(a);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return ref;
}

/** Brass output meter: needle 0..1 with a hatched MAX zone (not colour alone). */
function OutputMeter({ value }: { value: number }) {
  const angle = -90 + clamp01(value) * 180;
  const ref = useMeterScale();
  return (
    <svg ref={ref} className="cc-meter-svg" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <pattern id="cc-meter-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#b51e15" />
          <rect width="2.5" height="6" fill="#2b1f05" />
        </pattern>
      </defs>
      <path d="M80 145 A120 120 0 0 1 320 145" fill="none" stroke="#2b1f05" strokeWidth="4" />
      <path d="M302 81 A120 120 0 0 1 320 145" fill="none" stroke="url(#cc-meter-hatch)" strokeWidth="16" />
      <g stroke="#2b1f05" strokeWidth="3">
        <line x1="80" y1="145" x2="94" y2="145" /><line x1="200" y1="25" x2="200" y2="39" /><line x1="320" y1="145" x2="306" y2="145" />
        <line x1="115" y1="60" x2="125" y2="70" /><line x1="285" y1="60" x2="275" y2="70" />
      </g>
      <g className="cc-meter-text">
        <text x="56" y="151">0</text>
        <text x="200" y="18" textAnchor="middle">0.5</text>
        <text x="332" y="151">1.0</text>
        <text x="328" y="96" className="cc-meter-max">MAX</text>
        <text x="200" y="118" textAnchor="middle" className="cc-meter-units">CORE UNITS</text>
      </g>
      <g className="cc-needle" style={{ transform: `rotate(${angle}deg)` }}>
        <line x1="200" y1="145" x2="200" y2="40" stroke="#111" strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="200" cy="145" r="11" fill="#111" />
    </svg>
  );
}

const ENGINE_BARS = 24;
const REDLINE_BAR = 19;

export function ChronoCoupeHud(props: ChronoCoupeHudProps) {
  const { speed, unit, rpm, redlineRpm, gear, load, throttle, running, motion, storageKey, shellConnected, muted } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const cfit = useHudCompact(rootRef, props.compact, 11);
  const reduced = useReducedMotion();
  const still = reduced || !motion;
  const now = useMinuteClock();
  const keys = {
    dest: `${storageKey}.destination`,
    departed: `${storageKey}.departed`,
    lastSeen: `${storageKey}.lastSeen`,
  };

  const [destination, setDestination] = useState<Date>(() => readStoredDate(keys.dest) ?? defaultDestination());
  // Last departed: stored ignition/drive-off time, else the previous session's time, else now.
  const [departed, setDeparted] = useState<Date>(() => readStoredDate(keys.departed) ?? readStoredDate(keys.lastSeen) ?? new Date());
  const { mode } = props;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [flash, setFlash] = useState(0);

  const saveMode = (m: RailMode) => props.onModeChange(m);

  // Session heartbeat → fallback "last departed" for the next session.
  useEffect(() => {
    storeDate(keys.lastSeen, now);
  }, [now, keys.lastSeen]);

  const recordDeparture = () => {
    const d = new Date();
    setDeparted(d);
    storeDate(keys.departed, d);
  };

  // Ignition (running false → true) or driving off (stopped → moving) records a departure.
  const prevRunning = useRef(running);
  const stoppedRef = useRef(speed < 1);
  const mphNow = unit === 'kph' ? speed / 1.609344 : speed;
  useEffect(() => {
    if (running && !prevRunning.current) recordDeparture();
    prevRunning.current = running;
    if (mphNow <= 1) stoppedRef.current = true;
    else if (running && stoppedRef.current && mphNow >= 5) {
      stoppedRef.current = false;
      recordDeparture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mphNow]);

  // Charge + threshold crossing (optional engine hooks; flash skipped under Reduce Motion).
  const threshold = JUMP_THRESHOLD[unit];
  const charge = running ? clamp01(speed / threshold) : 0;
  const lastCharge = useRef(-1);
  const armedCross = useRef(true);
  const prevSpeed = useRef(speed);
  const { onCharge, onDischarge } = props;
  useEffect(() => {
    if (Math.abs(charge - lastCharge.current) >= 0.01 || (charge === 0 && lastCharge.current !== 0)) {
      lastCharge.current = charge;
      onCharge?.(charge);
    }
    if (speed < threshold * 0.95) armedCross.current = true;
    if (running && armedCross.current && prevSpeed.current < threshold && speed >= threshold) {
      armedCross.current = false;
      onDischarge?.();
      if (!still) setFlash((f) => f + 1);
    }
    prevSpeed.current = speed;
  }, [charge, speed, threshold, running, still, onCharge, onDischarge]);
  useEffect(() => () => onCharge?.(0), [onCharge]);

  const speedText = String(Math.max(0, Math.round(speed)));
  const speedGhost = '8'.repeat(Math.max(2, speedText.length));
  const unitLabel = unit === 'kph' ? 'KM/H' : 'MPH';
  const output = running ? clamp01(Math.max(load, throttle * 0.9)) : 0;

  const scaleMax = (redlineRpm * ENGINE_BARS) / REDLINE_BAR;
  const lit = running ? Math.round(clamp01(rpm / scaleMax) * ENGINE_BARS) : 0;
  const yellowFrom = Math.round(REDLINE_BAR * 0.75);
  const rpmText = String(Math.max(0, Math.round(rpm)));
  const gearText = typeof gear === 'number' && gear > 0 ? String(gear) : 'N';

  return (
    <div
      ref={rootRef}
      className={`cc ${still ? 'cc-still' : ''} ${mode === 'jump' ? 'cc-armed' : ''} ${charge >= 1 ? 'cc-ready' : ''}${cfit.compact ? ' cc-compact' : ''}`}
      data-running={running ? 'true' : 'false'}
      data-compact={cfit.compact ? 'true' : undefined}
      data-cc-tight={cfit.compact && cfit.realH < 330 ? '' : undefined}
      style={cfit.compact ? ({ '--u': `${cfit.unit}px` } as CSSProperties) : undefined}
    >
      <p className="rf-sr-only">{`Flux ${Math.round(charge * 100)} percent of jump threshold ${threshold} ${unit === 'kph' ? 'kilometers per hour' : 'miles per hour'}${mode === 'jump' ? ', jump sequence armed' : ''}. Core output ${output.toFixed(2)}.`}</p>
      <div className="cc-left">
        <div className="cc-banks">
          <DateBank tone="dest" label="DESTINATION" date={destination} />
          <DateBank tone="present" label="PRESENT" date={now} />
          <DateBank tone="departed" label="LAST DEPARTED" date={departed} />
        </div>
        <div className="cc-lower">
          <section className="cc-panel cc-charge" aria-hidden="true">
            <h4>FLUX</h4>
            <div className="cc-core-wrap"><ChargeCore charge={charge} flash={flash} voice={running ? clamp01(props.envelope ?? 0) : 0} /></div>
            <span className="cc-charge-pct">{Math.round(charge * 100)}%</span>
          </section>
          <section className="cc-panel cc-output" aria-hidden="true">
            <h4>CORE OUTPUT</h4>
            <div className="cc-readout cc-glass">
              <span className="cc-digits"><span className="cc-ghost">8.88</span><span className="cc-lit">{output.toFixed(2)}</span></span>
              <Glare />
            </div>
            <div className="cc-meter-wrap"><OutputMeter value={output} /></div>
          </section>
        </div>
      </div>

      <div className="cc-right">
        <section className="cc-panel cc-velocity" aria-hidden="true">
          <h4>VELOCITY</h4>
          <span className="cc-unit">{unitLabel}</span>
          <div className="cc-big cc-glass">
            <span className="cc-digits">
              <span className="cc-ghost">{speedGhost}</span>
              <span className="cc-lit" data-testid="cc-speed">{speedText}</span>
            </span>
            <Glare />
          </div>
          <div className="cc-thr">
            <b style={{ width: `${charge * 100}%` }} />
            <em />
          </div>
          <div className="cc-thr-labels">
            <span>0</span>
            <span className="cc-thr-state">{charge >= 1 ? 'JUMP READY' : `CHARGE ${Math.round(charge * 100)}%`}</span>
            {cfit.compact ? <span>JUMP · {threshold}</span> : <span>JUMP THRESHOLD · {threshold}</span>}
          </div>
          {mode === 'jump' && <span className="cc-armed-tag">ARMED</span>}
        </section>
        <section className="cc-panel cc-engine" aria-hidden="true">
          <h4>ENGINE</h4>
          <div className="cc-bars">
            {Array.from({ length: ENGINE_BARS }, (_, i) => {
              const zone = i >= REDLINE_BAR;
              const tone = zone ? 'r' : i >= yellowFrom ? 'y' : 'g';
              return <i key={i} className={`${i < lit ? 'on' : ''} ${tone} ${zone ? 'zone' : ''}`} style={{ height: `${30 + i * 3}%` }} />;
            })}
            <span className="cc-redline-tag" style={{ left: `${(REDLINE_BAR / ENGINE_BARS) * 100}%` }}>REDLINE</span>
          </div>
          <div className="cc-rpmrow">
            <div className="cc-rpm">
              <span className="cc-glass"><span className="cc-digits"><span className="cc-ghost">8888</span><span className="cc-lit">{rpmText.padStart(4, '!')}</span></span><Glare /></span>
              <small>RPM</small>
            </div>
            <div className="cc-gear">
              <span className="cc-glass"><span className="cc-digits"><span className="cc-ghost">8</span><span className="cc-lit">{gearText}</span></span><Glare /></span>
              <small>GEAR</small>
            </div>
          </div>
        </section>
      </div>

      <div className="cc-rail">
        <button type="button" aria-pressed={mode === 'cruise'} onClick={() => saveMode(mode === 'cruise' ? 'off' : 'cruise')}>CRUISE</button>
        <button type="button" aria-haspopup="dialog" aria-expanded={dialogOpen} onClick={() => setDialogOpen(true)}>SET DESTINATION</button>
        <button
          type="button"
          aria-pressed={mode === 'jump'}
          onClick={() => {
            if (mode === 'jump') saveMode('off');
            else {
              saveMode('jump');
              onDischarge?.();
            }
          }}
        >
          JUMP SEQUENCE
        </button>
        <button
          type="button"
          aria-label="Sound"
          aria-pressed={!muted}
          aria-disabled={!shellConnected || undefined}
          onClick={() => {
            if (shellConnected) props.onToggleSound();
          }}
        >
          SOUND · {muted ? 'OFF' : 'ON'}
        </button>
      </div>

      <DestinationDialog
        open={dialogOpen}
        value={destination}
        onClose={() => setDialogOpen(false)}
        onSave={(d) => {
          setDestination(d);
          storeDate(keys.dest, d);
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
