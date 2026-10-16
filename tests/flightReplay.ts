/**
 * Replay helper for the Carrier Jet flight-phase engine (src/packs/flightPhase.ts).
 * Feeds a 1 Hz-ish trace of { t (s), speedMps } through createFlightPhase with an injected clock
 * (clock = fix time, so runs are deterministic) and records the phase timeline + events.
 * Used by tests/flightPhase.test.ts and scripts/flight-phase-replay.ts (CSV: t,speedMps).
 */
import {
  createFlightPhase,
  mpsToMph,
  type FlightEvent,
  type FlightPhaseConfig,
  type FlightRegime,
} from '../src/packs/flightPhase.ts';

export interface TracePoint {
  /** seconds */
  t: number;
  speedMps: number | null;
  accuracy?: number;
  latitude?: number;
  longitude?: number;
}

export interface ReplayRow {
  t: number;
  speedMph: number;
  regime: FlightRegime;
}

export interface ReplayResult {
  rows: ReplayRow[];
  events: (FlightEvent & { t: number })[];
  /** Phase changes in order, starting with the initial phase. */
  phases: { t: number; phase: FlightRegime['phase'] }[];
  regimeChanges: number;
}

export interface ReplayOptions {
  config?: Partial<FlightPhaseConfig>;
  abArmed?: boolean;
  /** Called before each point is pushed (e.g. flip ARM mid-trace). */
  before?: (p: TracePoint, engine: ReturnType<typeof createFlightPhase>) => void;
}

export function replay(trace: readonly TracePoint[], opts: ReplayOptions = {}): ReplayResult {
  let clock = trace.length ? trace[0].t * 1000 : 0;
  const engine = createFlightPhase({ ...opts.config, now: () => clock });
  if (opts.abArmed !== undefined) engine.setAbArmed(opts.abArmed);
  const rows: ReplayRow[] = [];
  const events: ReplayResult['events'] = [];
  const phases: ReplayResult['phases'] = [{ t: clock / 1000, phase: engine.getFlightRegime().phase }];
  let regimeChanges = 0;
  engine.onFlightEvent((e) => events.push({ ...e, t: e.atMs / 1000 }));
  engine.onFlightRegimeChange((r, p) => {
    regimeChanges++;
    if (r.phase !== p.phase) phases.push({ t: clock / 1000, phase: r.phase });
  });
  for (const p of trace) {
    clock = p.t * 1000;
    opts.before?.(p, engine);
    engine.pushFix({ speedMps: p.speedMps, timestampMs: clock, accuracy: p.accuracy, latitude: p.latitude, longitude: p.longitude });
    const regime = engine.getFlightRegime();
    rows.push({ t: p.t, speedMph: p.speedMps === null ? NaN : mpsToMph(p.speedMps), regime });
  }
  return { rows, events, phases, regimeChanges };
}

/** Parse "t,speedMps" CSV (header optional; empty / 'null' speed → null). */
export function parseTraceCsv(text: string): TracePoint[] {
  const out: TracePoint[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [a, b] = line.split(',').map((x) => x?.trim());
    const t = Number(a);
    if (!line.trim() || !Number.isFinite(t) || a === '') continue;
    const v = b === undefined || b === '' || b === 'null' ? null : Number(b);
    out.push({ t, speedMps: v !== null && Number.isFinite(v) ? v : null });
  }
  return out;
}

/** Human-readable timeline: one line per fix where something discrete changed, plus events. */
export function formatTimeline(res: ReplayResult): string {
  const lines: string[] = ['   t(s)   mph   accelG  phase         gear     L AB conf  alerts / events'];
  let prevKey = '';
  for (const row of res.rows) {
    const r = row.regime;
    const evs = res.events.filter((e) => e.t === row.t).map((e) => `!${e.type}`);
    const key = [r.phase, r.gearDown, r.gearTransit, r.launch, r.afterburnerLit, r.confidence, r.alerts.map((a) => a.id).join()].join('|');
    if (key === prevKey && !evs.length) continue;
    prevKey = key;
    const gear = r.gearTransit ? 'TRANSIT' : r.gearDown ? 'DOWN' : 'UP';
    lines.push(
      `${row.t.toFixed(1).padStart(7)} ${(Number.isNaN(row.speedMph) ? '  -- ' : row.speedMph.toFixed(1).padStart(5))} ${r.accelG.toFixed(3).padStart(7)}  ${r.phase.padEnd(13)} ${gear.padEnd(8)} ${r.launch ? 'L' : '.'} ${r.afterburnerLit ? 'AB' : '..'} ${r.confidence.padEnd(5)} ${[...r.alerts.map((a) => a.text), ...evs].join(' ')}`,
    );
  }
  return lines.join('\n');
}

// ── synthetic trace builders (1 Hz) ──
export const MPH = 0.44704;
/** Piecewise-linear speed profile in mph: [[tSec, mph], ...] sampled every `dt` seconds. */
export function profile(points: readonly [number, number][], dt = 1): TracePoint[] {
  const out: TracePoint[] = [];
  const end = points[points.length - 1][0];
  for (let t = points[0][0]; t <= end + 1e-9; t += dt) {
    let i = 0;
    while (i < points.length - 2 && t > points[i + 1][0]) i++;
    const [t0, v0] = points[i];
    const [t1, v1] = points[i + 1];
    const mph = t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    out.push({ t: Math.round(t * 1000) / 1000, speedMps: Math.max(0, mph) * MPH });
  }
  return out;
}
