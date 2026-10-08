/**
 * Night Pursuit sensor-pod radar: pure model (no DOM). Deterministic for a given seed,
 * input stream and dt sequence, so screenshots and tests are reproducible.
 *
 * Geometry: forward-looking half-moon (sector) scope. Bearing θ runs 0..π, 0 = left horizon,
 * π/2 = straight ahead, π = right horizon. Range r runs 0 (own car, scope origin) .. 1 (outer ring).
 * The sweep is a sector scan: it rotates about the origin from one horizon to the other and back.
 * One "rev" = one full there-and-back cycle.
 */

export const RADAR_SEED = 0x4e505244; // "NPRD"
/** Seconds per full sweep cycle at idle and near redline. */
export const SWEEP_PERIOD_IDLE_S = 3.5;
export const SWEEP_PERIOD_REDLINE_S = 1.0;
/** Time constant for sweep-rate smoothing (no jumps when rpm steps). */
export const SWEEP_SMOOTH_S = 0.6;
export const MAX_CONTACTS = 7;
/** Afterglow slices across the half-moon. */
export const SLICES = 96;
/** Blip energy: soft attack after the sweep crosses, slow phosphor decay. */
export const BLIP_ATTACK_S = 0.05;
export const BLIP_HOLD_S = 0.12;
export const BLIP_DECAY_S = 1.4;
/** Frozen blip level used by the static (reduced-motion) scope. */
export const STATIC_BLIP_ENERGY = 0.55;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sweep cycle length for a normalized rpm (rpm / redline). Idle (~0.1) → 3.5 s,
 * ~0.95 → 1.0 s. Frequency is interpolated linearly, so equal rpm steps feel like equal tempo steps.
 */
export function sweepPeriodForRpm(rpmNorm: number): number {
  const t = clamp01((clamp01(rpmNorm) - 0.1) / 0.85);
  const f = 1 / SWEEP_PERIOD_IDLE_S + (1 / SWEEP_PERIOD_REDLINE_S - 1 / SWEEP_PERIOD_IDLE_S) * t;
  return 1 / f;
}

/**
 * How many contacts are on the scope (fractional: the last one is partially faded in).
 * Idle / parked → 1–2 calm contacts; speed and load add traffic up to MAX_CONTACTS.
 */
export function contactTarget(speedNorm: number, load: number): number {
  return Math.max(1, Math.min(MAX_CONTACTS, 1.25 + clamp01(speedNorm) * 4 + clamp01(load) * 1.75));
}

/** Ping-pong sweep bearing for a cycle phase; gently eased at the horizons like a mechanical scanner. */
export function sweepBearing(phase: number): number {
  const p = phase - Math.floor(phase);
  const tri = p < 0.5 ? p * 2 : 2 - p * 2;
  const eased = 0.8 * tri + 0.2 * ((1 - Math.cos(Math.PI * tri)) / 2);
  return Math.PI * eased;
}

export interface RadarInputs {
  rpmNorm: number;
  speedNorm: number;
  load: number;
}

export interface RadarContact {
  bearing: number;
  range: number;
  /** Signed bearing drift, rad/s at load 0. */
  drift: number;
  /** Closing-speed multiplier. */
  close: number;
  presence: number;
  energy: number;
  hitT: number;
  rng: () => number;
}

export interface RadarState {
  t: number;
  phase: number;
  /** Smoothed cycles per second. */
  rate: number;
  bearing: number;
  prevBearing: number;
  /** Last time (s) the sweep passed each afterglow slice. */
  lastHit: Float64Array;
  contacts: RadarContact[];
}

const BEARING_MIN = Math.PI * 0.1;
const BEARING_MAX = Math.PI * 0.9;
const RANGE_IN = 0.14;

function spawn(c: RadarContact, fresh: boolean) {
  const r = c.rng;
  c.bearing = BEARING_MIN + (BEARING_MAX - BEARING_MIN) * r();
  c.range = fresh ? 0.3 + 0.62 * r() : 1;
  c.drift = (r() - 0.5) * 0.09;
  c.close = 0.6 + 0.8 * r();
}

export function createRadarState(seed = RADAR_SEED, inputs?: RadarInputs): RadarState {
  const master = mulberry32(seed);
  const contacts: RadarContact[] = [];
  for (let i = 0; i < MAX_CONTACTS; i++) {
    const c: RadarContact = { bearing: 0, range: 0, drift: 0, close: 1, presence: 0, energy: 0, hitT: -1e9, rng: mulberry32((master() * 2 ** 32) >>> 0) };
    spawn(c, true);
    contacts.push(c);
  }
  const target = inputs ? contactTarget(inputs.speedNorm, inputs.load) : 1.25;
  contacts.forEach((c, i) => (c.presence = clamp01(target - i)));
  const rate = 1 / sweepPeriodForRpm(inputs?.rpmNorm ?? 0);
  const phase = 0.18;
  const b = sweepBearing(phase);
  return { t: 0, phase, rate, bearing: b, prevBearing: b, lastHit: new Float64Array(SLICES).fill(-1e9), contacts };
}

/** Life factor: contacts fade in at the outer ring and out near the origin (no popping on respawn). */
export function contactLife(range: number): number {
  const s = (a: number, b: number, x: number) => {
    const u = clamp01((x - a) / (b - a));
    return u * u * (3 - 2 * u);
  };
  return s(RANGE_IN, RANGE_IN + 0.1, range) * (1 - s(0.9, 1, range));
}

export function sliceOf(bearing: number): number {
  return Math.max(0, Math.min(SLICES - 1, Math.floor((bearing / Math.PI) * SLICES)));
}

export function stepRadar(s: RadarState, dtIn: number, inp: RadarInputs): RadarState {
  const dt = Math.max(0, Math.min(0.1, Number.isFinite(dtIn) ? dtIn : 0));
  if (dt === 0) return s;
  const rpm = clamp01(inp.rpmNorm);
  const speed = clamp01(inp.speedNorm);
  const load = clamp01(inp.load);
  s.t += dt;
  const targetRate = 1 / sweepPeriodForRpm(rpm);
  s.rate += (targetRate - s.rate) * (1 - Math.exp(-dt / SWEEP_SMOOTH_S));
  s.prevBearing = s.bearing;
  s.phase += s.rate * dt;
  if (s.phase > 1e6) s.phase -= Math.floor(s.phase);
  s.bearing = sweepBearing(s.phase);
  // Bearings swept this frame. A turn-around between two samples is at a horizon, so the
  // span runs from the earlier sample out to that horizon.
  const reversed = Math.floor(s.phase * 2) !== Math.floor((s.phase - s.rate * dt) * 2);
  const lo = Math.min(s.prevBearing, s.bearing);
  const hi = Math.max(s.prevBearing, s.bearing);
  const spanLo = reversed && s.bearing < Math.PI / 2 ? 0 : lo;
  const spanHi = reversed && s.bearing >= Math.PI / 2 ? Math.PI : hi;
  for (let i = sliceOf(spanLo); i <= sliceOf(spanHi); i++) s.lastHit[i] = s.t;

  const target = contactTarget(speed, load);
  const closing = 0.012 + 0.17 * speed;
  const wander = 0.35 + 0.9 * load + 0.4 * speed;
  const pk = 1 - Math.exp(-dt / 0.8);
  s.contacts.forEach((c, i) => {
    c.presence += (clamp01(target - i) - c.presence) * pk;
    c.range -= dt * closing * c.close;
    c.bearing += dt * c.drift * wander;
    if (c.bearing < BEARING_MIN || c.bearing > BEARING_MAX) {
      c.drift = -c.drift;
      c.bearing = Math.max(BEARING_MIN, Math.min(BEARING_MAX, c.bearing));
    }
    if (c.range < RANGE_IN) {
      spawn(c, false);
      c.energy = 0;
      c.hitT = -1e9;
    }
    if (c.bearing >= spanLo && c.bearing <= spanHi) c.hitT = s.t;
    const since = s.t - c.hitT;
    if (since < BLIP_HOLD_S) c.energy += (1 - c.energy) * (1 - Math.exp(-dt / BLIP_ATTACK_S));
    else c.energy *= Math.exp(-dt / BLIP_DECAY_S);
  });
  return s;
}

/** Afterglow alpha for a slice of a given age (s): bright short trail + faint long persistence. */
export function afterglow(age: number): number {
  if (!(age >= 0)) return 0;
  return 0.42 * Math.exp(-age / 0.28) + 0.04 * Math.exp(-age / 1.4);
}

export interface LoopFlags {
  /** Reduced motion (OS media query, in-app motion flag or `.motion-off` stage). */
  staticMode: boolean;
  /** Canvas intersects the viewport. */
  visible: boolean;
  /** document.hidden. */
  hidden: boolean;
}

/**
 * rAF gate: a frame loop runs only while live (not reduced-motion), on screen and the
 * document is visible. Scheduler is injected so tests can count rAF calls.
 */
export function createRadarLoop(
  raf: (cb: (ts: number) => void) => number,
  caf: (id: number) => void,
  frame: (dt: number) => void,
) {
  let id: number | null = null;
  let last: number | null = null;
  let flags: LoopFlags = { staticMode: true, visible: false, hidden: true };
  const tick = (ts: number) => {
    id = null;
    const dt = last == null ? 0 : (ts - last) / 1000;
    last = ts;
    frame(dt);
    if (shouldRun(flags)) id = raf(tick);
  };
  return {
    set(next: Partial<LoopFlags>) {
      flags = { ...flags, ...next };
      if (shouldRun(flags)) {
        if (id == null) {
          last = null;
          id = raf(tick);
        }
      } else if (id != null) {
        caf(id);
        id = null;
      }
    },
    get running() {
      return id != null;
    },
    stop() {
      if (id != null) caf(id);
      id = null;
    },
  };
}

export function shouldRun(f: LoopFlags): boolean {
  return !f.staticMode && f.visible && !f.hidden;
}
