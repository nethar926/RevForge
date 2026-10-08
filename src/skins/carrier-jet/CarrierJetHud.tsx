import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PackHudProps } from '../../packs/types';
import {
  CARRIER_JET_DEFAULT_VARIANT,
  CARRIER_JET_DESIGNATION,
  PARK_HOLD_MS,
  PARK_SPEED_MPH,
  SWEEP_TAPE_LO,
  accelCell,
  accelWord,
  aoaUnits,
  indexerState,
  resolveAbZone,
  scheduledSweep,
  speedValueText,
  statusText,
  stepSweep,
  sweepValueText,
  toMph,
  variantLabel,
  type CarrierJetVariant,
  type SweepMode,
  MACH_MAX,
  machLabel,
  machText,
  mphToMach,
} from './model';
import { PALETTES, type CjPalette } from './palettes';
import { Approach, AoaTape, DeckMarks, Engines, HeadingTape, Indexer, Ladder, Planform, Rose, Svg, SweepTape } from './parts';
import { VariantTabs } from './VariantTabs';
import { useCarrierJetVariant } from './variantStore';
import './carrier-jet.css';

/**
 * Carrier Jet HUD props: the PackHudProps ThemeStage hands every pack HUD, plus the
 * Carrier Jet extras. Only speed / rpm are required, so a mount can spread PackHudProps
 * straight in. There is no gear readout (gear is accepted and ignored).
 */
export interface CarrierJetHudProps extends Partial<Omit<PackHudProps, 'compact' | 'driveWindow'>> {
  speed: number;
  rpm: number;
  /** Accepted from PackHudProps and ignored: the skin shows no gear. */
  gear?: number;
  /** Drive-window layout (Tesla in Drive). An ancestor `[data-drive-window="true"]` also turns it on. */
  driveWindow?: boolean;
  /** true = reflowed board; 'auto' = the skin decides from its size; false = never flagged compact (a small container still gets the board laid out to fit). Dev/test: `?hudCompact=1|auto|0`. */
  compact?: boolean | 'auto';
  /** Controlled look. Without `onVariantChange` the skin persists the choice itself (storageKey). */
  variant?: CarrierJetVariant;
  onVariantChange?: (variant: CarrierJetVariant) => void;
  /** Audio's current afterburner zone 0..5 (getAfterburnerZone / onAfterburnerZoneChange). Drives every AB readout; undefined → AB OFF. */
  abZone?: number;
  /** Host override for parked (e.g. the car is in P). Default: speed < 0.5 mph held 2 s. */
  parked?: boolean;
  /** GPS course in degrees (secondary heading cues). Undefined → "---". */
  heading?: number;
  /** Longitudinal accel in mph/s (accel ball). Undefined → derived from speed changes. */
  accel?: number;
}

const clamp01 = (v: number | undefined) => Math.max(0, Math.min(1, typeof v === 'number' && Number.isFinite(v) ? v : 0));

function compactFromQuery(): boolean | 'auto' | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = new URLSearchParams(window.location.search).get('hudCompact');
  if (v == null) return undefined;
  if (v === 'auto') return 'auto';
  return v === '' || v === '1' || v === 'true';
}

function useReducedMotion(): boolean {
  const [rm, setRm] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const on = () => setRm(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return rm;
}

/** Below this (container CSS px) compact='auto' reflows the board (same elements, container-unit sizing). */
const AUTO_COMPACT_W = 980;
const AUTO_COMPACT_H = 500; // 1280x800 mounts get ~1248x518, which must stay full layout

interface View {
  P: CjPalette;
  variant: CarrierJetVariant;
  compact: boolean;
  speed: number;
  unit: 'mph' | 'kph';
  rpm: number;
  rpmN: number;
  /** Display Mach (number from speed, mphToMach). */
  mach: number;
  load: number;
  ab: number;
  parked: boolean;
  cmd: number;
  act: number;
  mode: SweepMode;
  aoa: number;
  accel: number;
  heading?: number;
  pitch: number;
  demo: boolean;
}

// ------------------------------------------------------------------ shared HTML blocks
function SpeedBlock({ v, row = false }: { v: View; row?: boolean }) {
  const max = v.unit === 'kph' ? 290 : 180;
  const unit = v.unit === 'kph' ? 'KM/H' : 'MPH';
  const n = Math.max(0, Math.round(v.speed));
  const meta = (
    <span className="cj-spd-meta" aria-hidden="true">
      <span className="cj-spd-unit">{unit}</span>
      <span className="cj-spd-src">{v.demo ? 'DEMO' : 'GPS LIVE'}</span>
    </span>
  );
  return (
    <div className={`cj-spd${row ? ' cj-spd-row' : ''}`} data-cj-el="speed" role="meter" aria-label="Speed" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(max, n)} aria-valuetext={speedValueText(n, v.unit)}>
      <span className="cj-lab" aria-hidden="true">SPEED</span>
      <span className="cj-spd-line" aria-hidden="true">
        <strong className="cj-spd-num">{String(n).padStart(2, '0')}</strong>
        {row && meta}
      </span>
      {!row && meta}
    </div>
  );
}
/**
 * MACH readout in the old gear slot: `M 0.85` (number from speed) over a small sound-barrier tape with a
 * fixed M 1.0 barrier mark. The vapor cone and SUPERSONIC tag follow the afterburner zone (abZone > 0),
 * not road speed, so they move with the sound. Static art, no animation.
 */
function MachTape({ v }: { v: View }) {
  const P = v.P;
  const sup = v.ab > 0;
  const x = (q: number) => 6 + (Math.max(0, Math.min(MACH_MAX, q)) / MACH_MAX) * 88;
  const px = x(v.mach);
  const b = x(1);
  return (
    <svg className="cj-mach-tape" data-cj-el="mach-tape" viewBox="0 0 100 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect x={b} y={14.5} width={x(MACH_MAX) - b} height={3} fill={P.hatch} />
      <line x1={6} y1={16} x2={94} y2={16} stroke={P.edge} strokeWidth={1.5} />
      {[0, 0.5, 1.5, 2].map((q) => (
        <line key={q} x1={x(q)} y1={11.5} x2={x(q)} y2={16} stroke={P.tick} strokeWidth={1.2} />
      ))}
      <line data-cj-el="mach-barrier" x1={b} y1={3} x2={b} y2={22} stroke={P.caret} strokeWidth={2.4} />
      {sup ? (
        <path
          data-cj-el="vapor-cone"
          d={`M${px + 3} 11 C${px - 3} 4 ${px - 9} 2.5 ${px - 16} 2.5 L${px - 16} 19.5 C${px - 9} 19.5 ${px - 3} 18 ${px + 3} 11 Z`}
          fill={P.ref}
          fillOpacity={0.28}
          stroke={P.ref}
          strokeWidth={1.2}
        />
      ) : null}
      <path d={`M${px} 15 L${px - 4.5} 6.5 L${px + 4.5} 6.5 Z`} fill={P.pointer} stroke={P.boxBg} strokeWidth={0.8} />
    </svg>
  );
}
function MachBlock({ v }: { v: View }) {
  const sup = v.ab > 0;
  return (
    <div className="cj-mach" data-cj-el="mach" data-supersonic={sup ? 'true' : 'false'} role="img" aria-label={machLabel(v.mach, sup)}>
      <span className="cj-lab" aria-hidden="true">MACH</span>
      <b className="cj-k-num cj-mach-num" aria-hidden="true">{machText(v.mach)}</b>
      <MachTape v={v} />
      <span className="cj-mach-tag" data-cj-el="supersonic" data-on={sup ? 'true' : 'false'} aria-hidden="true">SUPERSONIC</span>
    </div>
  );
}
function RpmBlock({ v }: { v: View }) {
  const r = Math.max(0, Math.round(v.rpm));
  return (
    <div className="cj-rpm" data-cj-el="rpm">
      <span className="cj-lab" aria-hidden="true">RPM</span>
      <b className="cj-k-num" aria-hidden="true">{r.toLocaleString('en-US')}</b>
      <span className="cj-sr">{`${r} RPM`}</span>
      <span className="cj-rpm-bar" data-cj-el="rpm-bar" aria-hidden="true">
        <i style={{ width: `${(v.rpmN * 86).toFixed(1)}%` }} />
        <span className="cj-red" />
      </span>
    </div>
  );
}
/** Sweep digits + mode chip. Digits are rewritten by the rAF loop (integer changes only). */
function SweepDigits({ v, label = 'SWEEP' }: { v: View; label?: string }) {
  return (
    <div className="cj-swd" data-cj-el="sweep-digits" aria-hidden="true">
      <span className="cj-lab">{label}</span>
      <span className="cj-sw-num" data-cj-num="">{`${Math.round(v.act)}°`}</span>
      <span className={`cj-mode${v.parked ? ' is-over' : ''}`} data-mode={v.mode}>
        {v.parked ? 'OVER · DECK' : 'AUTO'}
      </span>
    </div>
  );
}
/** role=meter wrapper for every sweep block (planform + digits + tape). */
function SweepMeter({ v, className, children }: { v: View; className: string; children: ReactNode }) {
  return (
    <div className={className} role="meter" aria-label="Wing sweep" aria-valuemin={20} aria-valuemax={75} aria-valuenow={Math.round(v.act)} aria-valuetext={sweepValueText(v.act, v.mode)} data-cj-meter="">
      {children}
    </div>
  );
}
const Sec = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <div className={`cj-sec ${className}`} aria-hidden="true">
    {children}
  </div>
);

// ------------------------------------------------------------------ A · carrier-jet variant (faithful cockpit)
function Cockpit({ v }: { v: View }) {
  const { P } = v;
  return (
    <div className="cj-body">
      <div className="cj-panel cj-a-left">
        <span data-cj-el="panel-label" className="cj-plab" aria-hidden="true">FLIGHT</span>
        <div className="cj-crt cj-scan cj-a-speed"><SpeedBlock v={v} row /></div>
        <div className="cj-a-gr">
          <div className="cj-crt cj-scan"><MachBlock v={v} /></div>
          <div className="cj-crt cj-scan"><RpmBlock v={v} /></div>
        </div>
        <Sec className="cj-crt">
          <Svg w={388} h={236}>
            <AoaTape x={12} y={10} h={216} P={P} aoa={v.aoa} active={!v.parked} />
            <Indexer x={86} y={50} P={P} state={indexerState(v.aoa, !v.parked)} s={1.25} />
            <Engines x={154} y={10} w={226} h={218} P={P} rpmN={v.rpmN} load={v.load} ab={v.ab} rpm={v.rpm} />
          </Svg>
        </Sec>
      </div>
      <Sec className="cj-panel cj-a-mid">
        <span data-cj-el="panel-label" className="cj-plab">VDI</span>
        <div className="cj-crt cj-scan"><Svg w={390} h={278}><g className="cj-glow-sym"><Ladder x={0} y={0} w={390} h={278} P={P} pitch={v.pitch} /></g></Svg></div>
        <span data-cj-el="panel-label" className="cj-plab cj-plab-2">HSD</span>
        <div className="cj-crt cj-scan"><Svg w={390} h={300}><Rose x={0} y={4} w={390} h={296} P={P} heading={v.heading} /></Svg></div>
      </Sec>
      <div className="cj-panel cj-a-right">
        <span data-cj-el="panel-label" className="cj-plab" aria-hidden="true">WING SWEEP</span>
        <SweepMeter v={v} className="cj-crt cj-scan cj-a-sweep">
          <Svg w={388} h={470} className="cj-fill">
            <Planform cx={130} cy={150} s={0.98} P={P} ghosts glow cmd={v.cmd} />
            <SweepTape x={20} y={330} w={348} P={P} cmd={v.cmd} mode={v.mode} />
          </Svg>
          <SweepDigits v={v} />
        </SweepMeter>
        <Sec className="cj-crt">
          <Svg w={388} h={138}>
            <Approach x={0} y={6} w={388} h={130} P={P} cell={accelCell(v.accel)} active={!v.parked} label={`ACCEL BALL · ${accelWord(v.accel, v.parked)}`} />
          </Svg>
        </Sec>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ B · tomcat variant (modern glass)
function Glass({ v }: { v: View }) {
  const { P } = v;
  return (
    <div className="cj-body">
      <div className="cj-b-left">
        <div className="cj-hudbox cj-b-speed"><SpeedBlock v={v} /></div>
        <div className="cj-b-gr">
          <MachBlock v={v} />
          <RpmBlock v={v} />
        </div>
      </div>
      <Sec className="cj-b-aoa">
        <Svg w={64} h={440} align="xMidYMin">
          <AoaTape x={2} y={6} h={290} P={P} aoa={v.aoa} active={!v.parked} />
          <Indexer x={10} y={318} P={P} state={indexerState(v.aoa, !v.parked)} s={1.15} />
        </Svg>
      </Sec>
      <Sec className="cj-b-mid">
        <Svg w={450} h={56}><HeadingTape x={0} y={6} w={450} P={P} heading={v.heading} /></Svg>
        <Svg w={450} h={420}><g className="cj-glow-sym"><Ladder x={0} y={0} w={450} h={420} P={P} pitch={v.pitch} /></g></Svg>
        <Svg w={450} h={96}><Engines x={0} y={2} w={450} h={92} P={P} rpmN={v.rpmN} load={v.load} ab={v.ab} rpm={v.rpm} horizontal /></Svg>
      </Sec>
      <Sec className="cj-b-acc">
        <Svg w={90} h={300}>
          <Approach x={0} y={6} w={90} h={286} P={P} cell={accelCell(v.accel)} active={!v.parked} label={accelWord(v.accel, v.parked)} />
        </Svg>
      </Sec>
      <SweepMeter v={v} className="cj-b-sweep">
        <SweepDigits v={v} />
        <Svg w={300} h={300} className="cj-fill">
          <Planform cx={150} cy={152} s={1.2} P={P} ghosts glow cmd={v.cmd} />
        </Svg>
        <Svg w={304} h={124} className="cj-b-tape">
          <SweepTape x={14} y={2} w={276} P={P} cmd={v.cmd} mode={v.mode} />
        </Svg>
      </SweepMeter>
    </div>
  );
}

// ------------------------------------------------------------------ C · swing-wing variant (carrier-deck night)
function Deck({ v }: { v: View }) {
  const { P } = v;
  return (
    <div className="cj-body">
      <div className="cj-card cj-c-left">
        <div className="cj-c-speed"><SpeedBlock v={v} /></div>
        <div className="cj-c-gr">
          <MachBlock v={v} />
          <RpmBlock v={v} />
        </div>
        <Sec>
          <Svg w={278} h={220}>
            <Engines x={0} y={10} w={278} h={210} P={P} rpmN={v.rpmN} load={v.load} ab={v.ab} rpm={v.rpm} />
          </Svg>
        </Sec>
      </div>
      <SweepMeter v={v} className="cj-deck">
        <Svg w={620} h={652} className="cj-fill">
          <DeckMarks w={620} h={652} cx={310} />
          <Planform cx={310} cy={250} s={1.75} P={P} ghosts arc cmd={v.cmd} />
          <SweepTape x={52} y={510} w={516} P={P} cmd={v.cmd} mode={v.mode} plate="#0b1018" />
        </Svg>
        <div className="cj-swbox"><SweepDigits v={v} label="WING SWEEP" /></div>
      </SweepMeter>
      <Sec className="cj-card cj-c-right">
        <Svg w={294} h={220}><Ladder x={0} y={0} w={294} h={220} P={P} pitch={v.pitch} /></Svg>
        <Svg w={294} h={56}><HeadingTape x={0} y={6} w={294} P={P} heading={v.heading} span={50} /></Svg>
        <div className="cj-c-rb">
          <Svg w={150} h={340}><Approach x={0} y={6} w={150} h={330} P={P} cell={accelCell(v.accel)} active={!v.parked} label={accelWord(v.accel, v.parked)} /></Svg>
          <Svg w={140} h={340}>
            <AoaTape x={6} y={10} h={250} P={P} aoa={v.aoa} active={!v.parked} />
            <Indexer x={86} y={64} P={P} state={indexerState(v.aoa, !v.parked)} />
          </Svg>
        </div>
      </Sec>
    </div>
  );
}

// ------------------------------------------------------------------ compact reflow (same blocks and parts, rearranged)
// Compact is the full board for each look, reflowed: every block of the full layout is here, the dense
// SVG instruments get their own cells (so their >= 11px text has room) and the CSS grid places them with
// container units. Nothing is dropped or swapped; a gauge stays a gauge.
function CockpitCompact({ v }: { v: View }) {
  const { P } = v;
  return (
    <div className="cj-body cj-cbody">
      <div className="cj-panel cj-a-left">
        <span data-cj-el="panel-label" className="cj-plab" aria-hidden="true">FLIGHT</span>
        <div className="cj-crt cj-scan cj-a-speed"><SpeedBlock v={v} /></div>
        <div className="cj-a-gr">
          <div className="cj-crt cj-scan"><MachBlock v={v} /></div>
          <div className="cj-crt cj-scan"><RpmBlock v={v} /></div>
        </div>
        <Sec className="cj-crt cj-a-eng">
          <Svg w={150} h={236}>
            <AoaTape x={8} y={6} h={224} P={P} aoa={v.aoa} active={!v.parked} head={42} />
            <Indexer x={100} y={60} P={P} state={indexerState(v.aoa, !v.parked)} s={1.1} />
          </Svg>
          <Svg w={280} h={236}>
            <Engines x={20} y={10} w={238} h={218} P={P} rpmN={v.rpmN} load={v.load} ab={v.ab} rpm={v.rpm} />
          </Svg>
        </Sec>
      </div>
      <Sec className="cj-panel cj-a-mid">
        <span className="cj-plab" data-cj-el="panel-label">VDI</span>
        <div className="cj-crt cj-scan"><Svg w={390} h={250}><g className="cj-glow-sym"><Ladder x={0} y={0} w={390} h={250} P={P} pitch={v.pitch} /></g></Svg></div>
        <span className="cj-plab cj-plab-2" data-cj-el="panel-label">HSD</span>
        <div className="cj-crt cj-scan"><Svg w={390} h={250}><Rose x={0} y={4} w={390} h={246} P={P} heading={v.heading} /></Svg></div>
      </Sec>
      <div className="cj-panel cj-a-right">
        <span data-cj-el="panel-label" className="cj-plab" aria-hidden="true">WING SWEEP</span>
        <SweepMeter v={v} className="cj-crt cj-scan cj-a-sweep">
          <Svg w={300} h={300} className="cj-a-plan" align="xMinYMid">
            <Planform cx={130} cy={150} s={1.1} P={P} ghosts glow cmd={v.cmd} />
          </Svg>
          <Svg w={376} h={112} className="cj-a-tape">
            <SweepTape x={14} y={4} w={348} P={P} cmd={v.cmd} mode={v.mode} />
          </Svg>
          <SweepDigits v={v} />
        </SweepMeter>
        <Sec className="cj-crt cj-a-acc">
          <Svg w={388} h={138}>
            <Approach x={0} y={6} w={388} h={130} P={P} cell={accelCell(v.accel)} active={!v.parked} label={`ACCEL BALL · ${accelWord(v.accel, v.parked)}`} />
          </Svg>
        </Sec>
      </div>
    </div>
  );
}

function GlassCompact({ v }: { v: View }) {
  const { P } = v;
  return (
    <div className="cj-body cj-cbody">
      <div className="cj-b-left">
        <div className="cj-hudbox cj-b-speed"><SpeedBlock v={v} /></div>
        <div className="cj-b-gr">
          <MachBlock v={v} />
          <RpmBlock v={v} />
        </div>
      </div>
      <Sec className="cj-b-aoa">
        <Svg w={74} h={440} align="xMidYMid">
          <AoaTape x={2} y={6} h={290} P={P} aoa={v.aoa} active={!v.parked} />
          <Indexer x={10} y={318} P={P} state={indexerState(v.aoa, !v.parked)} s={1.15} />
        </Svg>
      </Sec>
      <Sec className="cj-b-mid">
        <Svg w={450} h={56}><HeadingTape x={0} y={6} w={450} P={P} heading={v.heading} /></Svg>
        <Svg w={450} h={330}><g className="cj-glow-sym"><Ladder x={0} y={0} w={450} h={330} P={P} pitch={v.pitch} /></g></Svg>
        <Svg w={450} h={96}><Engines x={0} y={2} w={450} h={92} P={P} rpmN={v.rpmN} load={v.load} ab={v.ab} rpm={v.rpm} horizontal /></Svg>
      </Sec>
      <Sec className="cj-b-acc">
        <Svg w={90} h={300}>
          <Approach x={0} y={6} w={90} h={286} P={P} cell={accelCell(v.accel)} active={!v.parked} label={accelWord(v.accel, v.parked)} />
        </Svg>
      </Sec>
      <SweepMeter v={v} className="cj-b-sweep">
        <SweepDigits v={v} />
        <Svg w={300} h={300} className="cj-fill">
          <Planform cx={150} cy={152} s={1.2} P={P} ghosts glow cmd={v.cmd} />
        </Svg>
        <Svg w={304} h={124} className="cj-b-tape">
          <SweepTape x={14} y={2} w={276} P={P} cmd={v.cmd} mode={v.mode} />
        </Svg>
      </SweepMeter>
    </div>
  );
}

function DeckCompact({ v }: { v: View }) {
  const { P } = v;
  return (
    <div className="cj-body cj-cbody">
      <div className="cj-card cj-c-left">
        <div className="cj-c-speed"><SpeedBlock v={v} /></div>
        <div className="cj-c-gr">
          <MachBlock v={v} />
          <RpmBlock v={v} />
        </div>
        <Sec className="cj-c-eng">
          <Svg w={300} h={218}>
            <Engines x={11} y={8} w={278} h={210} P={P} rpmN={v.rpmN} load={v.load} ab={v.ab} rpm={v.rpm} />
          </Svg>
        </Sec>
      </div>
      <SweepMeter v={v} className="cj-deck">
        <Svg w={360} h={290} className="cj-c-plan">
          <DeckMarks w={360} h={290} cx={180} />
          <Planform cx={178} cy={128} s={1.05} P={P} ghosts arc cmd={v.cmd} />
        </Svg>
        <Svg w={368} h={116} className="cj-c-tape">
          <SweepTape x={14} y={4} w={340} P={P} cmd={v.cmd} mode={v.mode} plate="#0b1018" />
        </Svg>
        <div className="cj-swbox"><SweepDigits v={v} label="WING SWEEP" /></div>
      </SweepMeter>
      <Sec className="cj-card cj-c-right">
        <div className="cj-c-lh">
          <Svg w={220} h={200} className="cj-c-lad"><Ladder x={0} y={0} w={220} h={200} P={P} pitch={v.pitch} /></Svg>
          <Svg w={220} h={56}><HeadingTape x={0} y={6} w={220} P={P} heading={v.heading} span={40} /></Svg>
        </div>
        <Svg w={150} h={340}><Approach x={0} y={6} w={150} h={330} P={P} cell={accelCell(v.accel)} active={!v.parked} label={accelWord(v.accel, v.parked)} /></Svg>
        <Svg w={84} h={420}>
          <AoaTape x={6} y={6} h={254} P={P} aoa={v.aoa} active={!v.parked} head={38} />
          <Indexer x={14} y={300} P={P} state={indexerState(v.aoa, !v.parked)} />
        </Svg>
      </Sec>
    </div>
  );
}

// ------------------------------------------------------------------ HUD
export function CarrierJetHud(p: CarrierJetHudProps) {
  const unit = p.unit ?? 'mph';
  const motion = p.motion ?? true;
  const running = p.running ?? true;
  const rootRef = useRef<HTMLDivElement>(null);

  // Variant: controlled when the host passes a handler, otherwise persisted by the skin.
  const [stored, setStored] = useCarrierJetVariant();
  const variant: CarrierJetVariant = p.onVariantChange ? (p.variant ?? CARRIER_JET_DEFAULT_VARIANT) : stored;
  const setVariant = p.onVariantChange ?? setStored;

  // Layout: one board for every size. A small container (under AUTO_COMPACT_W x AUTO_COMPACT_H), compact=true or a
  // phone layout reflows that same board with container units; the drive window only flags data-drive-window.
  const compactReq = compactFromQuery() ?? p.compact ?? false;
  const [ancestorDw, setAncestorDw] = useState(false);
  const [small, setSmall] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const check = () => {
      setAncestorDw(!!el.parentElement?.closest('[data-drive-window="true"]'));
      setSmall(el.clientWidth > 0 && (el.clientWidth < AUTO_COMPACT_W || el.clientHeight < AUTO_COMPACT_H));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // The stage flips data-drive-window on resize; a resize of the HUD follows, but watch the attribute too.
    const stage = el.closest('.theme-stage');
    const mo = stage ? new MutationObserver(check) : null;
    mo?.observe(stage!, { attributes: true, attributeFilter: ['data-drive-window'] });
    return () => {
      ro.disconnect();
      mo?.disconnect();
    };
  }, [compactReq]);
  // compact (true, or 'auto' on a small container) flags data-compact. An explicit compact={false} wins: no ancestor
  // flag (drive window, data-box) can turn it on. The full board still lays itself out to fit, so a small container
  // (or a phone layout) gets the reflowed arrangement of the same board either way.
  const compact = compactReq === true || (compactReq === 'auto' && small);
  const reflow = compact || small;
  const dw = !!p.driveWindow || ancestorDw;

  // Telemetry.
  const mph = toMph(p.speed, unit);
  const stopped = !(mph >= PARK_SPEED_MPH);
  const [parkedAuto, setParkedAuto] = useState(false);
  useEffect(() => {
    if (!stopped) {
      setParkedAuto(false);
      return;
    }
    const t = setTimeout(() => setParkedAuto(true), PARK_HOLD_MS);
    return () => clearTimeout(t);
  }, [stopped]);
  const parked = p.parked ?? (stopped && parkedAuto);
  const cmd = scheduledSweep(mph, parked);
  const mode: SweepMode = parked ? 'OVER' : 'AUTO';
  const load = clamp01(p.load ?? p.throttle);
  const ab = resolveAbZone(p.abZone);

  // Accel (mph/s) for the decorative accel ball when the host gives none.
  const accRef = useRef({ mph, t: 0, a: 0 });
  if (p.accel === undefined) {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const r = accRef.current;
    const dt = (now - r.t) / 1000;
    if (r.t && dt > 0.04) {
      r.a += ((mph - r.mph) / dt - r.a) * Math.min(1, dt / 0.6);
      r.mph = mph;
      r.t = now;
    } else if (!r.t) {
      r.mph = mph;
      r.t = now;
    }
  }
  const accel = p.accel ?? accRef.current.a;

  // Drawn sweep (ACT): rAF rate-limited toward CMD, transform-only DOM writes, snaps under Reduce Motion / motion off.
  const reduced = useReducedMotion();
  const snap = reduced || !motion;
  const actRef = useRef<number | null>(null);
  if (actRef.current === null) actRef.current = cmd;
  const cmdRef = useRef(cmd);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const rafRef = useRef(0);
  const nodes = useRef<{ rot: SVGGElement[]; bar: SVGRectElement[]; line: SVGLineElement[]; num: HTMLElement[]; meter: HTMLElement[] }>({ rot: [], bar: [], line: [], num: [], meter: [] });
  const lastInt = useRef<number | null>(null);

  const apply = useCallback((act: number, force = false) => {
    const n = nodes.current;
    for (const g of n.rot) {
      const sign = Number(g.dataset.cjRot) || 1;
      const max = g.dataset.max ? Number(g.dataset.max) : Infinity;
      g.setAttribute('transform', `rotate(${(sign * Math.min(act, max)).toFixed(2)} ${g.dataset.px} ${g.dataset.py})`);
    }
    for (const r of n.bar) {
      const x0 = Number(r.dataset.x0), lo = Number(r.dataset.lo), pd = Number(r.dataset.pxdeg);
      const full = Number(r.getAttribute('width')) || 1;
      const k = Math.max(0, Math.min(1, (lo + (act - SWEEP_TAPE_LO) * pd - x0) / full));
      r.setAttribute('transform', `matrix(${k.toFixed(4)} 0 0 1 ${(x0 * (1 - k)).toFixed(2)} 0)`);
    }
    for (const l of n.line) l.setAttribute('transform', `translate(${((act - SWEEP_TAPE_LO) * Number(l.dataset.pxdeg)).toFixed(2)} 0)`);
    const i = Math.round(act);
    if (force || i !== lastInt.current) {
      lastInt.current = i;
      for (const e of n.num) e.textContent = `${i}°`;
      for (const m of n.meter) {
        m.setAttribute('aria-valuenow', String(i));
        m.setAttribute('aria-valuetext', sweepValueText(i, modeRef.current));
      }
    }
  }, []);

  // Re-collect animated nodes whenever the board's DOM changes (variant / layout), then paint the current ACT.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    nodes.current = {
      rot: [...root.querySelectorAll<SVGGElement>('[data-cj-rot]')],
      bar: [...root.querySelectorAll<SVGRectElement>('[data-cj-bar]')],
      line: [...root.querySelectorAll<SVGLineElement>('[data-cj-line]')],
      num: [...root.querySelectorAll<HTMLElement>('[data-cj-num]')],
      meter: [...root.querySelectorAll<HTMLElement>('[data-cj-meter]')],
    };
    apply(actRef.current ?? cmd, true);
  }, [variant, reflow, apply]);
  // React re-renders reset the meter's aria-valuetext mode word; repaint text on mode change.
  useLayoutEffect(() => {
    apply(actRef.current ?? cmd, true);
  }, [mode, apply]);

  useEffect(() => {
    cmdRef.current = cmd;
    if (snap) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      actRef.current = cmd;
      apply(cmd);
      return;
    }
    if (rafRef.current || Math.abs((actRef.current ?? cmd) - cmd) < 1e-3) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const target = cmdRef.current;
      const next = stepSweep(actRef.current ?? target, target, dt);
      actRef.current = next;
      apply(next);
      rafRef.current = Math.abs(next - target) > 1e-3 ? requestAnimationFrame(tick) : 0;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [cmd, snap, apply]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const redline = p.redlineRpm && p.redlineRpm > 0 ? p.redlineRpm : 6000;
  const rpm = running ? Math.max(0, p.rpm) : 0;
  const v: View = {
    P: PALETTES[variant],
    variant,
    compact: reflow,
    speed: Math.max(0, p.speed),
    unit,
    rpm,
    rpmN: Math.max(0, Math.min(1, rpm / (redline / 0.86))),
    mach: mphToMach(mph),
    load,
    ab,
    parked,
    cmd,
    act: actRef.current ?? cmd,
    mode,
    aoa: aoaUnits(load),
    accel,
    heading: p.heading,
    pitch: Math.max(-12, Math.min(12, 1.5 + accel * 2.25)),
    demo: !!p.demo,
  };
  const label = variantLabel(variant);
  const status = statusText(parked, ab);

  return (
    <div
      ref={rootRef}
      className="cj"
      role="group"
      aria-label={`${label} heads-up display`}
      data-skin="carrier-jet"
      data-variant={variant}
      data-layout={reflow ? 'reflow' : 'full'}
      data-drive-window={dw ? 'true' : undefined}
      data-compact={compact ? 'true' : undefined}
      data-parked={parked ? 'true' : 'false'}
      data-ab={ab}
      data-motion={snap ? 'snap' : 'rate'}
    >
      <div className="cj-in">
        <header className="cj-hdr">
          <span className="cj-lbl" data-cj-label="" data-cj-el="label">{label}</span>
          <span className="cj-desig" data-cj-el="designation">{CARRIER_JET_DESIGNATION}</span>
          <span className="cj-sp" />
          <span className="cj-pill cj-gps" data-cj-el="gps-pill">
            <span className="cj-dot" aria-hidden="true">●</span>
            {p.demo ? 'DEMO' : 'GPS LIVE'}
          </span>
          <span className={`cj-pill cj-st${ab && !parked ? ' is-hot' : ''}${parked ? ' is-deck' : ''}`} data-cj-status="" data-cj-el="status-pill">
            {status}
          </span>
          <VariantTabs variant={variant} onChange={setVariant} />
        </header>
        {variant === 'carrier-jet' ? (reflow ? <CockpitCompact v={v} /> : <Cockpit v={v} />) : variant === 'tomcat' ? (reflow ? <GlassCompact v={v} /> : <Glass v={v} />) : reflow ? <DeckCompact v={v} /> : <Deck v={v} />}
      </div>
    </div>
  );
}
