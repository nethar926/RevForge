/**
 * Carrier Jet flight-phase engine (shared, pure logic — no UI, no Web Audio, no React).
 *
 * Feed it ~1 Hz GPS fixes; it derives a "flight regime" for the jet pack:
 *   phase  TAXI → TAKEOFF_ROLL → AIRBORNE → APPROACH → ROLLOUT → TAXI (or touch-and-go → TAKEOFF_ROLL)
 *   gear   gearDown / gearTransit, launch, afterburnerLit, alerts (GPS / AB / high-speed), confidence
 * and fires one-shot events (gearUp, gearDown, launch, touchAndGo, abUnarmed, overspeedCaution,
 * overspeedWarning). Audio (Dan) subscribes with onFlightRegimeChange / onFlightEvent; the HUD
 * (Scott) reads getFlightRegime() / getTopAlert(). See FlightAudioApi + regimeToAudioCalls /
 * eventToAudioCall at the bottom for the audio call shapes (no wiring here).
 *
 * Determinism: no timers, no Date.now() unless you omit config.now. All timing is from fix
 * timestamps plus the injectable clock (staleness, TTLs, GPS FAIL). Call tick() ~1 Hz from the
 * mount so GPS FAIL / note expiry / gear-transit end happen even when no fixes arrive.
 *
 * Speed & acceleration
 *  - Speed comes from coords.speed (fix.speedMps). Only when it is null do we fall back to
 *    position-derived speed (haversine / dt between this and the previous fix); that value is
 *    flagged confidence 'low', is never added to the acceleration series and can never launch.
 *  - Acceleration is ONLY from coords.speed: the slope over the last `accelWindowFixes` (3)
 *    coords.speed samples, i.e. (v_last − v_first) / (t_last − t_first) — a 2-fix average once
 *    2 samples exist, 3-fix (≈2 s span at 1 Hz) once 3 exist. A gap > staleMs restarts the series.
 *  - Standstill jitter: a ±1.5 m/s noise floor gives at most 3 m/s over a 2 s span = 0.15 g, half
 *    the 0.3 g launch threshold; launch also needs a full 3-fix window and v ≥ launchMinSpeedMph.
 *
 * LAUNCH (hard launch, any speed): smoothed accel ≥ launchAccelG "held" ≥ launchHoldMs. At 1 Hz we
 *  can't see sub-second holds, so "held" is measured on the smoothed series: the time covered by
 *  the run of consecutive above-threshold samples, counted from the START of the first sample's
 *  averaging window to the current fix, must be ≥ launchHoldMs. Because one 3-fix sample already
 *  averages ~2 s, with the defaults (0.3 g / 500 ms) the first full-window sample ≥ 0.3 g fires.
 *  Launch releases when smoothed accel < launchReleaseG (hysteresis), on stale GPS, or low confidence.
 *  Typical latency at 1 Hz: 1–2 fixes after the car starts pulling (see tests / replay script).
 *
 * Fix handling: speedMps null with no usable position → no update (hold). Fix older than staleMs
 *  vs the clock, or not newer than the last accepted fix → ignored (hold). No accepted fix for
 *  > staleMs → state held, launch dropped, confidence 'none' (GPS ACQ). > gpsFailMs after a fix was
 *  live → GPS FAIL caution until the next usable fix.
 */

// ───────────────────────────── config (mph / g / ms; converted internally to m/s) ─────────────

export const MPS_PER_MPH = 0.44704;
export const G_MPS2 = 9.80665;
export const mphToMps = (mph: number): number => mph * MPS_PER_MPH;
export const mpsToMph = (mps: number): number => mps / MPS_PER_MPH;

export interface FlightPhaseConfig {
  /** mph. TAXI ↔ ROLLOUT boundary: APPROACH → ROLLOUT below this. */
  rolloutMph: number;
  /** mph. TAKEOFF_ROLL entered at ≥ this while not decelerating; touch-and-go threshold. */
  takeoffMph: number;
  /** mph. TAKEOFF_ROLL → AIRBORNE at ≥ this. */
  airborneMph: number;
  /** mph. AIRBORNE held until below this, then APPROACH. */
  airborneHoldMph: number;
  /** mph. Generic hysteresis applied to the 35 boundary (abort / touchdown arm), AB and callouts. */
  hysteresisMph: number;
  /** mph. ROLLOUT → TAXI once below this for taxiStopHoldMs … */
  taxiStopMph: number;
  taxiStopHoldMs: number;
  /** mph. … or immediately at/below this ("full stop"). */
  fullStopMph: number;
  /** mph. Gear UP when accelerating through this (failsafe: always up at ≥ takeoffMph). */
  gearUpMph: number;
  /** mph. Gear DOWN when decelerating through this (failsafe: always down below rolloutMph). */
  gearDownMph: number;
  /** ms gearTransit stays true after a gear change. */
  gearTransitMs: number;
  /** g. |accel| below this counts as neither accelerating nor decelerating. */
  accelDeadbandG: number;
  /** Fixes in the acceleration average (2–3). */
  accelWindowFixes: number;
  /** g. Launch threshold (sensitivity setting). */
  launchAccelG: number;
  /** ms. Launch hold (see header for the 1 Hz definition). */
  launchHoldMs: number;
  /** g. Launch ends when smoothed accel drops below this. */
  launchReleaseG: number;
  /** mph. Launch needs at least this speed (rejects standstill noise). */
  launchMinSpeedMph: number;
  /** Fixes required in the window before a launch can fire. */
  launchMinFixes: number;
  /** mph. Armed AB auto-lights at ≥ this … */
  abAutoMph: number;
  /** mph. … and goes out below this (unless still launching). */
  abOffMph: number;
  /** mph. Unarmed → abUnarmed at ≥ this (or a hard launch). Re-arms below abWarnMph − hysteresis. */
  abWarnMph: number;
  abUnarmedCooldownMs: number;
  /** Setting: speed callouts (HIGH SPEED / OVERSPEED). OFF by default. */
  highSpeedCallouts: boolean;
  /** mph. HIGH SPEED (amber caution, event overspeedCaution). */
  overspeedCautionMph: number;
  /** mph. OVERSPEED (red warning, event overspeedWarning). */
  overspeedWarningMph: number;
  calloutCooldownMs: number;
  /** ms. Fix older than this (or no fix for this long) = stale → hold state. */
  staleMs: number;
  /** ms. No usable fix for longer than this after one was live → GPS FAIL. */
  gpsFailMs: number;
  /** m. Fixes with worse horizontal accuracy are low confidence (shown, never launch). */
  lowConfidenceAccuracyM: number;
  /** ms. Event notes (AB LIVE) stay in alerts[] this long. */
  noteTtlMs: number;
  /** ms. Event cautions (AB UNARMED) stay in alerts[] this long. */
  cautionTtlMs: number;
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number;
}

export const FLIGHT_PHASE_DEFAULTS: Readonly<Omit<FlightPhaseConfig, 'now'>> = Object.freeze({
  rolloutMph: 20,
  takeoffMph: 35,
  airborneMph: 40,
  airborneHoldMph: 36,
  hysteresisMph: 3,
  taxiStopMph: 5,
  taxiStopHoldMs: 3000,
  fullStopMph: 0.5,
  gearUpMph: 30,
  gearDownMph: 28,
  gearTransitMs: 2000,
  accelDeadbandG: 0.02,
  accelWindowFixes: 3,
  launchAccelG: 0.3,
  launchHoldMs: 500,
  launchReleaseG: 0.15,
  launchMinSpeedMph: 5,
  launchMinFixes: 3,
  abAutoMph: 80,
  abOffMph: 77,
  abWarnMph: 85,
  abUnarmedCooldownMs: 20000,
  highSpeedCallouts: false,
  overspeedCautionMph: 100,
  overspeedWarningMph: 126,
  calloutCooldownMs: 30000,
  staleMs: 3000,
  gpsFailMs: 10000,
  lowConfidenceAccuracyM: 50,
  noteTtlMs: 3000,
  cautionTtlMs: 5000,
});

// ───────────────────────────── types ─────────────────────────────

export type FlightPhase = 'TAXI' | 'TAKEOFF_ROLL' | 'AIRBORNE' | 'APPROACH' | 'ROLLOUT';
export type FlightConfidence = 'high' | 'low' | 'none';
export type FlightAlertLevel = 'warning' | 'caution' | 'note';
export type FlightAlertId = 'overspeedWarning' | 'overspeedCaution' | 'gpsFail' | 'abUnarmed' | 'gpsAcq' | 'abLive';

export interface FlightAlert {
  id: FlightAlertId;
  text: string;
  level: FlightAlertLevel;
  sinceMs: number;
}

/** Display text + level per alert. warning = red, caution = amber, note = neutral. */
export const FLIGHT_ALERTS: Readonly<Record<FlightAlertId, { text: string; level: FlightAlertLevel }>> = Object.freeze({
  overspeedWarning: { text: 'OVERSPEED', level: 'warning' },
  overspeedCaution: { text: 'HIGH SPEED', level: 'caution' },
  gpsFail: { text: 'GPS FAIL', level: 'caution' },
  abUnarmed: { text: 'AB UNARMED', level: 'caution' },
  gpsAcq: { text: 'GPS ACQ', level: 'note' },
  abLive: { text: 'AB LIVE', level: 'note' },
});
/** Sort order inside alerts[]: most serious first, then this fixed order, then newest. */
const ALERT_ORDER: readonly FlightAlertId[] = ['overspeedWarning', 'overspeedCaution', 'gpsFail', 'abUnarmed', 'gpsAcq', 'abLive'];
const LEVEL_RANK: Record<FlightAlertLevel, number> = { warning: 0, caution: 1, note: 2 };

export interface GpsSpeedFix {
  /** coords.speed (m/s) or null. */
  speedMps: number | null;
  timestampMs: number;
  /** coords.accuracy (m). */
  accuracy?: number | null;
  /** Optional position, used ONLY for the low-confidence speed fallback when speedMps is null. */
  latitude?: number | null;
  longitude?: number | null;
}

export interface FlightRegime {
  phase: FlightPhase;
  gearDown: boolean;
  gearTransit: boolean;
  launch: boolean;
  afterburnerLit: boolean;
  abArmed: boolean;
  /** Ids of active caution/warning alerts, most serious first. */
  cautions: FlightAlertId[];
  /** Full alert list (warnings, cautions, notes), most serious first. */
  alerts: FlightAlert[];
  speedMph: number;
  accelG: number;
  confidence: FlightConfidence;
}

export type FlightEventType = 'touchAndGo' | 'launch' | 'abUnarmed' | 'overspeedCaution' | 'overspeedWarning' | 'gearUp' | 'gearDown';
export interface FlightEvent {
  type: FlightEventType;
  atMs: number;
  speedMph: number;
}

export interface FlightPhaseEngine {
  pushFix(fix: GpsSpeedFix): void;
  setAbArmed(armed: boolean): void;
  setHighSpeedCallouts(on: boolean): void;
  /** Re-evaluate clock-driven state (GPS stale/FAIL, TTLs, gear transit) without a fix. */
  tick(): void;
  getFlightRegime(): FlightRegime;
  getTopAlert(): FlightAlert | null;
  /** Fires when any discrete field changes (phase, gear, launch, AB, alerts, confidence) — not on speed/accel alone. */
  onFlightRegimeChange(cb: (regime: FlightRegime, prev: FlightRegime) => void): () => void;
  onFlightEvent(cb: (event: FlightEvent) => void): () => void;
  reset(): void;
  readonly config: Readonly<FlightPhaseConfig>;
}

/** Adapter from a Geolocation-style fix ({speed, timestamp, accuracy, latitude, longitude}). */
export const fromGeolocationFix = (g: {
  speed: number | null;
  timestamp: number;
  accuracy?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}): GpsSpeedFix => ({ speedMps: g.speed, timestampMs: g.timestamp, accuracy: g.accuracy, latitude: g.latitude, longitude: g.longitude });

const EARTH_R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const haversineM = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ───────────────────────────── engine ─────────────────────────────

export function createFlightPhase(overrides: Partial<FlightPhaseConfig> = {}): FlightPhaseEngine {
  const config: FlightPhaseConfig = { ...FLIGHT_PHASE_DEFAULTS, ...overrides };
  const now = config.now ?? (() => Date.now());
  const regimeSubs = new Set<(r: FlightRegime, p: FlightRegime) => void>();
  const eventSubs = new Set<(e: FlightEvent) => void>();

  // m/s thresholds
  const T = {
    rollout: mphToMps(config.rolloutMph),
    takeoff: mphToMps(config.takeoffMph),
    takeoffLow: mphToMps(config.takeoffMph - config.hysteresisMph),
    airborne: mphToMps(config.airborneMph),
    airborneHold: mphToMps(config.airborneHoldMph),
    taxiStop: mphToMps(config.taxiStopMph),
    fullStop: mphToMps(config.fullStopMph),
    gearUp: mphToMps(config.gearUpMph),
    gearDown: mphToMps(config.gearDownMph),
    launchMin: mphToMps(config.launchMinSpeedMph),
    abAuto: mphToMps(config.abAutoMph),
    abOff: mphToMps(config.abOffMph),
    abWarn: mphToMps(config.abWarnMph),
    abWarnRearm: mphToMps(config.abWarnMph - config.hysteresisMph),
    osC: mphToMps(config.overspeedCautionMph),
    osCClear: mphToMps(config.overspeedCautionMph - config.hysteresisMph),
    osW: mphToMps(config.overspeedWarningMph),
    osWClear: mphToMps(config.overspeedWarningMph - config.hysteresisMph),
  };

  interface State {
    phase: FlightPhase;
    gearDown: boolean;
    gearChangedAt: number | null;
    launch: boolean;
    launchRunStart: number | null;
    abLit: boolean;
    abLitAt: number | null;
    abUnarmedAt: number | null;
    abUnarmedLaunchLatched: boolean;
    abUnarmedSpeedLatched: boolean;
    osC: boolean;
    osCSince: number;
    osCLastEmit: number | null;
    osW: boolean;
    osWSince: number;
    osWLastEmit: number | null;
    touchdownArmed: boolean;
    slowSince: number | null;
    series: { t: number; v: number }[];
    lastFixT: number | null;
    lastPos: { t: number; lat: number; lon: number } | null;
    lastUsableAt: number | null; // clock time of last accepted fix
    everLive: boolean;
    speedMps: number;
    accelG: number;
    fixConfidence: FlightConfidence;
    acqSince: number;
    failSince: number;
    snapshot: FlightRegime;
  }

  // Inputs that survive reset(): the ARM switch (default armed, like the Tomcat engine) and the callout setting.
  let abArmed = true;
  let highSpeed = config.highSpeedCallouts;
  let s: State;
  const init = (): void => {
    const t0 = now();
    s = {
      phase: 'TAXI',
      gearDown: true,
      gearChangedAt: null,
      launch: false,
      launchRunStart: null,
      abLit: false,
      abLitAt: null,
      abUnarmedAt: null,
      abUnarmedLaunchLatched: false,
      abUnarmedSpeedLatched: false,
      osC: false,
      osCSince: 0,
      osCLastEmit: null,
      osW: false,
      osWSince: 0,
      osWLastEmit: null,
      touchdownArmed: false,
      slowSince: null,
      series: [],
      lastFixT: null,
      lastPos: null,
      lastUsableAt: null,
      everLive: false,
      speedMps: 0,
      accelG: 0,
      fixConfidence: 'none',
      acqSince: t0,
      failSince: 0,
      snapshot: undefined as unknown as FlightRegime,
    };
    s.snapshot = build(t0);
  };

  const confidenceAt = (t: number): FlightConfidence =>
    s.lastUsableAt === null || t - s.lastUsableAt > config.staleMs ? 'none' : s.fixConfidence;
  const gpsFailAt = (t: number): boolean => s.everLive && s.lastUsableAt !== null && t - s.lastUsableAt > config.gpsFailMs;

  function build(t: number): FlightRegime {
    const conf = confidenceAt(t);
    const fail = gpsFailAt(t);
    const alerts: FlightAlert[] = [];
    const add = (id: FlightAlertId, sinceMs: number) => alerts.push({ id, sinceMs, ...FLIGHT_ALERTS[id] });
    if (highSpeed && s.osW) add('overspeedWarning', s.osWSince);
    else if (highSpeed && s.osC) add('overspeedCaution', s.osCSince);
    if (fail) add('gpsFail', s.failSince);
    if (s.abUnarmedAt !== null && t - s.abUnarmedAt < config.cautionTtlMs) add('abUnarmed', s.abUnarmedAt);
    if (!fail && conf !== 'high') add('gpsAcq', s.acqSince);
    if (s.abLit && s.abLitAt !== null && t - s.abLitAt < config.noteTtlMs) add('abLive', s.abLitAt);
    const list = alerts.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || ALERT_ORDER.indexOf(a.id) - ALERT_ORDER.indexOf(b.id) || b.sinceMs - a.sinceMs);
    return {
      phase: s.phase,
      gearDown: s.gearDown,
      gearTransit: s.gearChangedAt !== null && t - s.gearChangedAt < config.gearTransitMs,
      launch: s.launch,
      afterburnerLit: s.abLit,
      abArmed,
      cautions: list.filter((a) => a.level !== 'note').map((a) => a.id),
      alerts: list,
      speedMph: mpsToMph(s.speedMps),
      accelG: s.accelG,
      confidence: conf,
    };
  }

  const discreteKey = (r: FlightRegime): string =>
    [r.phase, r.gearDown, r.gearTransit, r.launch, r.afterburnerLit, r.abArmed, r.confidence, r.alerts.map((a) => a.id).join(',')].join('|');

  function commit(t: number, events: FlightEventType[]): void {
    // Track when GPS ACQ / GPS FAIL conditions started (for alert sinceMs).
    const conf = confidenceAt(t);
    const prevAcq = s.snapshot && s.snapshot.alerts.some((a) => a.id === 'gpsAcq');
    if (conf !== 'high' && !prevAcq) s.acqSince = t;
    const prevFail = s.snapshot && s.snapshot.alerts.some((a) => a.id === 'gpsFail');
    if (gpsFailAt(t) && !prevFail && s.lastUsableAt !== null) s.failSince = s.lastUsableAt + config.gpsFailMs;
    const prev = s.snapshot;
    const next = build(t);
    s.snapshot = next;
    if (discreteKey(prev) !== discreteKey(next)) for (const cb of [...regimeSubs]) cb(next, prev);
    const mph = next.speedMph;
    for (const type of events) {
      const ev: FlightEvent = { type, atMs: t, speedMph: mph };
      for (const cb of [...eventSubs]) cb(ev);
    }
  }

  /** Stale GPS: hold phase/gear/speed, drop launch + accel series. */
  function applyStale(t: number): void {
    if (s.lastUsableAt !== null && t - s.lastUsableAt > config.staleMs) {
      s.launch = false;
      s.launchRunStart = null;
      s.series = [];
      s.accelG = 0;
      if (s.abLit && s.speedMps < T.abOff) s.abLit = false;
    }
  }

  function evaluateAb(t: number): void {
    const v = s.speedMps;
    if (abArmed) {
      if (!s.abLit && (s.launch || v >= T.abAuto)) {
        s.abLit = true;
        s.abLitAt = t;
      } else if (s.abLit && !s.launch && v < T.abOff) s.abLit = false;
    } else s.abLit = false;
  }

  function step(fixT: number, v: number, fromCoords: boolean, lowConf: boolean, clockT: number): void {
    const events: FlightEventType[] = [];
    // acceleration series (coords.speed only)
    if (fromCoords) {
      const last = s.series[s.series.length - 1];
      if (last && fixT - last.t > config.staleMs) s.series = [];
      s.series.push({ t: fixT, v });
      while (s.series.length > Math.max(2, config.accelWindowFixes)) s.series.shift();
    }
    const first = s.series[0];
    const last = s.series[s.series.length - 1];
    const seriesFresh = !!last && last.t === fixT;
    s.accelG = seriesFresh && s.series.length >= 2 && last.t > first.t ? (last.v - first.v) / ((last.t - first.t) / 1000) / G_MPS2 : 0;
    s.speedMps = v;
    const a = s.accelG;
    const accelerating = a > config.accelDeadbandG;
    const decelerating = a < -config.accelDeadbandG;

    // ── launch
    const canLaunch = fromCoords && !lowConf && s.series.length >= config.launchMinFixes && v >= T.launchMin;
    if (canLaunch && a >= config.launchAccelG) {
      if (s.launchRunStart === null) s.launchRunStart = first.t;
      if (!s.launch && fixT - s.launchRunStart >= config.launchHoldMs) {
        s.launch = true;
        s.abUnarmedLaunchLatched = false;
        events.push('launch');
      }
    } else {
      s.launchRunStart = null;
      if (s.launch && (!canLaunch || a < config.launchReleaseG)) s.launch = false;
    }

    // ── slow timer (for ROLLOUT → TAXI)
    if (v < T.taxiStop) s.slowSince ??= fixT;
    else s.slowSince = null;

    // ── phase machine
    for (let i = 0; i < 5; i++) {
      const p = s.phase;
      if (p === 'TAXI') {
        if (v >= T.takeoff && !decelerating) s.phase = 'TAKEOFF_ROLL';
      } else if (p === 'TAKEOFF_ROLL') {
        if (v >= T.airborne) s.phase = 'AIRBORNE';
        else if (v < T.takeoffLow) s.phase = 'TAXI'; // rejected takeoff: never flew, so no rollout / touch-and-go
      } else if (p === 'AIRBORNE') {
        if (v < T.airborneHold) {
          s.phase = 'APPROACH';
          s.touchdownArmed = false;
        }
      } else if (p === 'APPROACH') {
        if (v < T.takeoffLow) s.touchdownArmed = true;
        if (v < T.rollout) s.phase = 'ROLLOUT';
        else if (s.touchdownArmed && v >= T.takeoff && !decelerating) {
          s.phase = 'TAKEOFF_ROLL';
          events.push('touchAndGo');
        } else if (!s.touchdownArmed && v >= T.airborne && !decelerating) s.phase = 'AIRBORNE'; // go-around
      } else if (p === 'ROLLOUT') {
        if (v <= T.fullStop || (s.slowSince !== null && fixT - s.slowSince >= config.taxiStopHoldMs)) s.phase = 'TAXI';
        else if (v >= T.takeoff && !decelerating) {
          s.phase = 'TAKEOFF_ROLL';
          events.push('touchAndGo');
        }
      }
      // Down-chains resolve in one fix (GPS gap recovery); TAKEOFF_ROLL is always shown for ≥ 1 fix.
      if (s.phase === p || s.phase === 'TAKEOFF_ROLL') break;
    }

    // ── gear
    if (s.gearDown && ((v >= T.gearUp && accelerating) || v >= T.takeoff)) {
      s.gearDown = false;
      s.gearChangedAt = clockT;
      events.unshift('gearUp');
    } else if (!s.gearDown && ((v <= T.gearDown && decelerating) || v < T.rollout)) {
      s.gearDown = true;
      s.gearChangedAt = clockT;
      events.unshift('gearDown');
    }

    // ── afterburner
    evaluateAb(clockT);
    if (!abArmed) {
      if (v < T.abWarnRearm) s.abUnarmedSpeedLatched = false;
      const launchTrig = s.launch && !s.abUnarmedLaunchLatched;
      const speedTrig = v >= T.abWarn && !s.abUnarmedSpeedLatched;
      if (launchTrig || speedTrig) {
        const cooled = s.abUnarmedAt === null || clockT - s.abUnarmedAt >= config.abUnarmedCooldownMs;
        if (launchTrig) s.abUnarmedLaunchLatched = true;
        if (speedTrig) s.abUnarmedSpeedLatched = true;
        if (cooled) {
          s.abUnarmedAt = clockT;
          events.push('abUnarmed');
        }
      }
    }

    // ── speed callouts (state tracked always; alerts/events only when the setting is on)
    if (!s.osC && v >= T.osC) {
      s.osC = true;
      s.osCSince = clockT;
      if (highSpeed && !(v >= T.osW) && (s.osCLastEmit === null || clockT - s.osCLastEmit >= config.calloutCooldownMs)) {
        s.osCLastEmit = clockT;
        events.push('overspeedCaution');
      }
    } else if (s.osC && v < T.osCClear) s.osC = false;
    if (!s.osW && v >= T.osW) {
      s.osW = true;
      s.osWSince = clockT;
      if (highSpeed && (s.osWLastEmit === null || clockT - s.osWLastEmit >= config.calloutCooldownMs)) {
        s.osWLastEmit = clockT;
        events.push('overspeedWarning');
      }
    } else if (s.osW && v < T.osWClear) s.osW = false;

    commit(clockT, events);
  }

  function pushFix(fix: GpsSpeedFix): void {
    const t = now();
    const ts = fix?.timestampMs;
    if (!finite(ts)) return tick();
    if (t - ts > config.staleMs) return tick(); // stale fix → hold
    if (s.lastFixT !== null && ts <= s.lastFixT) return tick(); // duplicate / out of order
    let v: number | null = finite(fix.speedMps) ? Math.max(0, fix.speedMps) : null;
    let fromCoords = v !== null;
    const lat = fix.latitude;
    const lon = fix.longitude;
    const pos = finite(lat) && finite(lon) ? { t: ts, lat, lon } : null;
    if (v === null && pos && s.lastPos && ts - s.lastPos.t >= 500 && ts - s.lastPos.t <= config.staleMs) {
      v = haversineM(s.lastPos.lat, s.lastPos.lon, pos.lat, pos.lon) / ((ts - s.lastPos.t) / 1000);
      fromCoords = false;
    }
    if (pos) s.lastPos = pos;
    if (v === null) return tick(); // null speed, no fallback → hold
    const lowConf = !fromCoords || (finite(fix.accuracy) && fix.accuracy > config.lowConfidenceAccuracyM);
    s.lastFixT = ts;
    s.lastUsableAt = t;
    s.everLive = true;
    s.fixConfidence = lowConf ? 'low' : 'high';
    step(ts, v, fromCoords, lowConf, t);
  }

  function tick(): void {
    const t = now();
    applyStale(t);
    commit(t, []);
  }

  init();

  return {
    config,
    pushFix,
    tick,
    setAbArmed(armed: boolean) {
      if (abArmed === armed) return;
      abArmed = armed;
      const t = now();
      evaluateAb(t);
      commit(t, []);
    },
    setHighSpeedCallouts(on: boolean) {
      if (highSpeed === on) return;
      highSpeed = on;
      commit(now(), []);
    },
    getFlightRegime: () => ({ ...s.snapshot, cautions: [...s.snapshot.cautions], alerts: s.snapshot.alerts.map((a) => ({ ...a })) }),
    getTopAlert: () => (s.snapshot.alerts[0] ? { ...s.snapshot.alerts[0] } : null),
    onFlightRegimeChange(cb) {
      regimeSubs.add(cb);
      return () => void regimeSubs.delete(cb);
    },
    onFlightEvent(cb) {
      eventSubs.add(cb);
      return () => void eventSubs.delete(cb);
    },
    reset() {
      init();
    },
  };
}

// ───────────────────────────── audio call shapes (no wiring here) ─────────────────────────────

/** Callouts Dan's audio can play. */
export type FlightCallout = 'abUnarmed' | 'overspeedCaution' | 'overspeedWarning' | 'gearUp' | 'gearDown';
export type FlightCalloutMode = 'voice' | 'tone' | 'off';
export type FlightGearState = 'down' | 'up' | 'transit';

/** The audio surface the later mount commit will call (structural; matches Dan's engine API). */
export interface FlightAudioApi {
  setFlightPhase(phase: FlightPhase, opts: { gear: FlightGearState; launch: boolean }): void;
  setAfterburnerLaunch(on: boolean): void;
  playFlightCallout(id: FlightCallout): void;
  setCalloutMode(mode: FlightCalloutMode): void;
}

/** One audio call as data: { method, args } for any FlightAudioApi method. */
export type FlightAudioCall = { [K in keyof FlightAudioApi]: { method: K; args: Parameters<FlightAudioApi[K]> } }[keyof FlightAudioApi];

/** Maps each event type to the callout it plays (touchAndGo / launch are not callouts). */
export const FLIGHT_EVENT_CALLOUT: Readonly<Record<FlightEventType, FlightCallout | null>> = Object.freeze({
  abUnarmed: 'abUnarmed',
  overspeedCaution: 'overspeedCaution',
  overspeedWarning: 'overspeedWarning',
  gearUp: 'gearUp',
  gearDown: 'gearDown',
  touchAndGo: null,
  launch: null,
});

export const gearStateOf = (r: Pick<FlightRegime, 'gearDown' | 'gearTransit'>): FlightGearState => (r.gearTransit ? 'transit' : r.gearDown ? 'down' : 'up');

/** Audio calls implied by a regime change (prev null = initial sync). */
export function regimeToAudioCalls(next: FlightRegime, prev: FlightRegime | null): FlightAudioCall[] {
  const calls: FlightAudioCall[] = [];
  const gear = gearStateOf(next);
  if (!prev || prev.phase !== next.phase || gearStateOf(prev) !== gear || prev.launch !== next.launch)
    calls.push({ method: 'setFlightPhase', args: [next.phase, { gear, launch: next.launch }] });
  if (!prev || prev.afterburnerLit !== next.afterburnerLit) calls.push({ method: 'setAfterburnerLaunch', args: [next.afterburnerLit] });
  return calls;
}

/** Audio call for a one-shot event, or null (touchAndGo / launch have no callout). */
export function eventToAudioCall(ev: Pick<FlightEvent, 'type'>): FlightAudioCall | null {
  const id = FLIGHT_EVENT_CALLOUT[ev.type];
  return id ? { method: 'playFlightCallout', args: [id] } : null;
}

/** Dispatch call data onto an audio implementation (for the mount commit / tests). */
export function applyFlightAudioCalls(api: FlightAudioApi, calls: readonly (FlightAudioCall | null)[]): void {
  for (const c of calls) {
    if (!c) continue;
    (api[c.method] as (...a: unknown[]) => void)(...c.args);
  }
}
