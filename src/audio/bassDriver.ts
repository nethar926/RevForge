/**
 * Bass driver: an optional sub-bass layer on the shared engine master bus.
 *
 * Mounted once per engine by CharacterEngine (the EngineSynth wrapper that createEngineSynth returns
 * for every pack), so every engine gets it without touching any pack voice. Off by default.
 *
 * Signal flow (nodes exist only while the driver is on or fading out; never built while off):
 *
 *   engine mix ─┬──────────────── dryDirect (1.0 while off) ─────────────────────┬─▶ engine output
 *               ├─▶ |x| ─▶ LP 5 Hz ─▶ envScale ─┐ (engine loudness follower)    │
 *               │                               ▼                               │
 *   3 sines (octave bank on F) ─▶ weights ─┬─▶ subVca ─▶ HP 20 Hz ─▶ limiter ─▶ out ─┤
 *                                          └─▶ 2nd/3rd shaper ─▶ harm ─┘            │
 *               └─▶ BP 60 Hz (engine's own 40–90 Hz) ─▶ lift ─────────────────▶ out ─┘
 *
 * (a) Sub: three sine oscillators form an octave bank on the engine's base frequency F (ICE: firing
 *     frequency from rpm × cylinders; other kinds: their low driver or a speed-mapped 32–60 Hz tone).
 *     Each oscillator plays F·2^-n for an integer n, weighted by a cos² window over log2(f / 50 Hz)
 *     that is one octave wide each side. The two oscillators nearest the window share the energy
 *     (weights always sum to 1), so the layer stays in roughly 30–80 Hz and its pitch follows every
 *     rpm change — sub-harmonics of the firing frequency, never a fixed drone. The silent third
 *     oscillator is retuned an octave-step ahead while its weight is zero (no clicks).
 * (b) Lift: a 60 Hz band-pass of the engine's own mix added back in phase (= a peaking lift of the
 *     engine's 40–90 Hz content). It bypasses the sub limiter so its phase stays aligned with the dry.
 * (c) Harmonics: Chebyshev shaping (T2/T3) of the constant-level sub mix adds 2nd/3rd harmonics
 *     (60–240 Hz) so the layer reads on small car speakers (missing-fundamental effect).
 *
 * Level: an audio-rate follower of the engine's own loudness (rectify + 5 Hz low-pass) scales the sub,
 * times a load/throttle/speed shape set per control frame. It breathes with the engine and falls to
 * zero whenever the engine is silent (idle-off, after stop, at the end of a shutdown tail).
 * Shutdown/startup cues schedule the bank along a per-cue RPM curve so the sub follows them too.
 *
 * Safety: 20 Hz high-pass on the sub band, a dedicated sub-band compressor before the master, a small
 * dry trim so integrated loudness rises ≤ ~1.5 LU at full strength, and every on/off/strength change
 * is a 150 ms linear ramp. No per-sample JS; control updates ride the existing setDriving frames.
 *
 * The audio layer never persists anything: Frontend owns the prefs (no Web Storage / IndexedDB here).
 */
import type { EngineKind } from './types';

/** Public bass-driver settings. `amount` is strength 0..1. */
export interface BassDriverSettings {
  enabled: boolean;
  amount: number;
}

export type BassDriverListener = (settings: BassDriverSettings) => void;

/** Optional EngineSynth hooks for the bass driver (always present on createEngineSynth engines). */
export interface BassDriverHooks {
  /** Turn the bass driver on/off and/or set its strength (0..1). Ramps over ~150 ms, no clicks. */
  setBassDriver(settings: Partial<BassDriverSettings>): void;
  /** Current settings (a copy). Default `{ enabled: false, amount: 0.5 }`. */
  getBassDriver(): BassDriverSettings;
  /** Called after each effective change with the new settings. Returns an unsubscribe function. */
  onBassDriverChange(cb: BassDriverListener): () => void;
}

export const DEFAULT_BASS_DRIVER: Readonly<BassDriverSettings> = Object.freeze({
  enabled: false,
  amount: 0.5,
});

/** On/off/strength ramp length (s). */
export const BASS_DRIVER_RAMP_S = 0.15;
/** Centre of the sub window (Hz); the window spans one octave each side (25–100 Hz, weight → 0 at the edges). */
export const BASS_SUB_CENTER_HZ = 50;
/** Subsonic / DC high-pass on the sub band (Hz). */
export const BASS_HIGHPASS_HZ = 20;
/** Engine-content lift band centre (Hz). */
export const BASS_LIFT_HZ = 60;
/** Master ceiling while the driver is on (dBFS, after the engine output gain). */
export const BASS_MASTER_CEILING_DB = -1.2;
/** Speed-mapped fallback tone range (Hz) for kinds without a usable low driver. */
export const BASS_TONE_MIN_HZ = 32;
export const BASS_TONE_MAX_HZ = 60;

/**
 * Calibration (offline-measured on the root engines, see scripts/bass-driver-render.mjs):
 * at amount 1 the integrated loudness rises ≤ ~1.5 LU and the master peak stays ≤ -1 dBFS.
 */
export const BASS_CAL = ({
  /** Engine-envelope → sub amplitude at level 1, amount 1. */
  subFromEnv: 1.15,
  /** 2nd / 3rd harmonic weights in the Chebyshev shaper. */
  h2: 0.5,
  h3: 0.32,
  /** Harmonic bus level relative to the sub. */
  harm: 0.55,
  /** Engine-content lift at level 1 (0.6 ≈ +4 dB at 60 Hz). */
  lift: 0.6,
  /** Dry trim at amount 1 (linear; 0.93 ≈ -0.63 dB) — the equal-loudness trim. */
  dryTrimAtFull: 0.93,
  /** Sub-band compressor. */
  compThresholdDb: -24,
  compKneeDb: 6,
  compRatio: 12,
  compAttack: 0.003,
  compRelease: 0.15,
});
// CALIBRATION-TEMP

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const finite = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

/** Merge a partial update onto the previous settings (clamped; non-finite amount keeps the previous). */
export function normalizeBassDriver(
  next: Partial<BassDriverSettings> | null | undefined,
  prev: BassDriverSettings = DEFAULT_BASS_DRIVER,
): BassDriverSettings {
  const n = next ?? {};
  return {
    enabled: n.enabled === undefined ? prev.enabled : !!n.enabled,
    amount: n.amount === undefined ? prev.amount : clamp01(finite(n.amount, prev.amount)),
  };
}

/** Octave-bank assignment: frequency + weight per oscillator for base frequency `baseHz`. */
export interface BassBankSlot {
  /** Octave index n: the oscillator plays baseHz · 2^-n. */
  n: number;
  hz: number;
  weight: number;
}

/** cos² window weight for an oscillator at `hz` (one octave each side of the centre). */
export function bassWindowWeight(hz: number, centerHz = BASS_SUB_CENTER_HZ): number {
  if (!(hz > 0)) return 0;
  const p = Math.log2(hz / centerHz);
  if (p <= -1 || p >= 1) return 0;
  const c = Math.cos((Math.PI / 2) * p);
  return c * c;
}

/**
 * Three-oscillator octave bank for `baseHz`. Oscillator i always holds the octave index n ≡ i (mod 3)
 * nearest the window, so the two audible slots are adjacent octaves whose weights sum to 1 and the
 * third is silent (weight 0) — that is the one that gets retuned.
 */
export function bassBank(baseHz: number, centerHz = BASS_SUB_CENTER_HZ): BassBankSlot[] {
  const f = Math.max(1, finite(baseHz, centerHz));
  const x = Math.log2(f / centerHz);
  const mid = Math.round(x - 0.5);
  const slots: BassBankSlot[] = [];
  for (let i = 0; i < 3; i++) {
    // n in {mid-1, mid, mid+1} with n ≡ i (mod 3)
    let n = mid - 1;
    while ((((n % 3) + 3) % 3) !== i) n++;
    const hz = f * Math.pow(2, -n);
    slots.push({ n, hz, weight: bassWindowWeight(hz, centerHz) });
  }
  return slots;
}

/** What the bus needs from the engine on each control frame. */
export interface BassEngineFrame {
  kind: EngineKind;
  /** Drivetrain rpm (ICE) when known. */
  rpm?: number;
  /** Cylinders (ICE). */
  cylinders?: number;
  /** Rotary: rotors (firingFamily 4). */
  rotary?: boolean;
  rotors?: number;
  /** Pack-reported fundamental / low driver (Hz). */
  fundamentalHz?: number;
  /** 0..1 */
  rpmNorm?: number;
  speed: number;
  throttle: number;
  load?: number;
  overrun?: boolean;
}

/** Base frequency F for the octave bank. ICE: firing frequency; others: low driver or speed tone. */
export function bassBaseHz(fr: BassEngineFrame): number {
  if (fr.kind === 'ice') {
    const rpm = finite(fr.rpm, 0);
    if (rpm > 50) {
      if (fr.rotary) return (rpm * Math.max(1, finite(fr.rotors, 1))) / 60;
      // 4-stroke: cylinders/2 power strokes per crank revolution
      return (rpm * Math.max(1, finite(fr.cylinders, 8))) / 120;
    }
    const f = finite(fr.fundamentalHz, 0);
    if (f > 5) return f;
    return BASS_SUB_CENTER_HZ;
  }
  const f = finite(fr.fundamentalHz, 0);
  if (f >= 25 && f <= 400) return f;
  return bassSpeedToneHz(fr.speed, fr.rpmNorm);
}

/** Speed-mapped 32–60 Hz tone (rpmNorm adds a little so a parked rev still moves it). */
export function bassSpeedToneHz(speed: number, rpmNorm = 0): number {
  const s = clamp01(0.7 * clamp01(finite(speed, 0)) + 0.3 * clamp01(finite(rpmNorm, 0)));
  return BASS_TONE_MIN_HZ + (BASS_TONE_MAX_HZ - BASS_TONE_MIN_HZ) * s;
}

/** Load/throttle/speed shape 0..1 (multiplied by the live engine-loudness follower). */
export function bassLevel(fr: Pick<BassEngineFrame, 'speed' | 'throttle' | 'load' | 'overrun'>): number {
  const thr = clamp01(finite(fr.throttle, 0));
  const spd = clamp01(finite(fr.speed, 0));
  const load = Math.max(0, Math.min(1, finite(fr.load, 0)));
  let lvl = 0.3 + 0.45 * thr + 0.12 * load + 0.15 * spd * (0.5 + 0.5 * thr);
  if (fr.overrun) lvl *= 0.8;
  return clamp01(lvl);
}

export type BassCue = 'starter' | 'shutoff';

/** One point of a cue curve: time offset (s), base-frequency multiplier, level 0..1. */
export interface BassCuePoint {
  t: number;
  fMul: number;
  level: number;
}

/**
 * Generic cue RPM curves (relative to the idle base frequency), timed to the pack's cue duration.
 * starter: crank (~28 % of idle rpm) → catch flare (~1.5×) → settle at idle.
 * shutoff: fuel-cut rundown (exponential rpm decay) with the level falling to zero.
 * Non-ICE kinds use a gentler spool-up / spool-down glide.
 */
export function bassCueCurve(cue: BassCue, kind: EngineKind, durationS: number, steps = 48): BassCuePoint[] {
  const d = Math.max(0.2, finite(durationS, 1));
  const pts: BassCuePoint[] = [];
  const ice = kind === 'ice';
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    let fMul: number;
    let level: number;
    if (cue === 'starter') {
      if (ice) {
        if (u < 0.45) {
          fMul = 0.28 + 0.06 * u;
          level = 0.4;
        } else if (u < 0.62) {
          const k = (u - 0.45) / 0.17;
          fMul = 0.31 + (1.5 - 0.31) * Math.sin((k * Math.PI) / 2);
          level = 0.4 + 0.6 * k;
        } else {
          const k = (u - 0.62) / 0.38;
          fMul = 1 + 0.5 * Math.exp(-4 * k);
          level = 1 - 0.55 * k;
        }
      } else {
        fMul = 0.6 + 0.4 * (1 - Math.exp(-3 * u));
        level = 0.3 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.2));
      }
    } else {
      // shutoff
      fMul = ice ? Math.max(0.08, Math.exp(-2.6 * u)) : Math.max(0.35, 1 - 0.6 * u);
      level = Math.max(0, (1 - u) * (1 - u));
    }
    pts.push({ t: u * d, fMul, level });
  }
  return pts;
}

/** Chebyshev T2/T3 curve (y(0) = 0): adds 2nd and 3rd harmonics of a ≤ unit-level input. */
export function bassHarmonicCurve(h2 = BASS_CAL.h2, h3 = BASS_CAL.h3, n = 1025): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = 2 * h2 * x * x + h3 * (4 * x * x * x - 3 * x);
  }
  return c;
}

/**
 * Safety soft limiter for the bus while the driver is on. The shaper input is pre-scaled by 1/2,
 * so curve index x ∈ [-1, 1] stands for s = 2x. Identity up to the knee (0.75 · ceiling), then a
 * tanh shoulder that never exceeds `ceiling` — no lookahead, no latency, no makeup gain.
 */
export function bassSafetyCurve(ceiling: number, n = 8193): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  const C = Math.max(0.05, ceiling);
  const K = 0.75 * C;
  for (let i = 0; i < n; i++) {
    const s = 2 * ((i * 2) / (n - 1) - 1);
    const a = Math.abs(s);
    const y = a <= K ? a : K + (C - K) * Math.tanh((a - K) / (C - K));
    c[i] = s < 0 ? -y : y;
  }
  return c;
}

/** |x| curve (odd length so 0 → exactly 0) for the engine-loudness follower. */
export function bassRectifierCurve(n = 1025): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.abs((i * 2) / (n - 1) - 1);
  return c;
}

/** Live node set (built when the driver is switched on; torn down after it fades out). */
interface BassVoice {
  oscs: OscillatorNode[];
  weights: GainNode[];
  slotN: number[];
  zeroSince: number[];
  envHp: BiquadFilterNode;
  envShelf: BiquadFilterNode;
  rect: WaveShaperNode;
  envLp: BiquadFilterNode;
  envScale: GainNode;
  subVca: GainNode;
  harmShaper: WaveShaperNode;
  harm: GainNode;
  hp: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  liftBp: BiquadFilterNode;
  lift: GainNode;
  out: GainNode;
  /** Dry feed into the safety stage (crossfaded against the direct dry link). */
  drySafe: GainNode;
  safetyIn: GainNode;
  safety: WaveShaperNode;
  /** ctx time after which a released voice may be torn down. */
  releaseAt: number;
}

/** Context time after which live frames may move the bank again (cue curves own it until then). */
const LIVE_TC_F = 0.03;
const LIVE_TC_W = 0.04;
const LEVEL_ATTACK_TC = 0.08;
const LEVEL_RELEASE_TC = 0.25;
/** Silent time an oscillator needs before it may be retuned to a new octave. */
const RETUNE_SILENT_S = 0.12;

export class BassDriver {
  private readonly ctx: BaseAudioContext;
  private readonly source: AudioNode;
  private readonly dest: AudioNode;
  private readonly dryDirect: GainNode;
  private settings: BassDriverSettings = { ...DEFAULT_BASS_DRIVER };
  private listeners = new Set<BassDriverListener>();
  private voice: BassVoice | null = null;
  private running = false;
  private cueUntil = 0;
  private lastStarterAt = -1;
  private frameSrc: BassEngineFrame | (() => BassEngineFrame) | null = null;
  private lastBaseHz = BASS_SUB_CENTER_HZ;
  private lastLevel = 0;
  private disposed = false;

  /**
   * @param source engine mix (post engine limiter)
   * @param dest   engine output node (the dry link source → dest is owned here: a unity gain while off)
   */
  constructor(ctx: BaseAudioContext, source: AudioNode, dest: AudioNode) {
    this.ctx = ctx;
    this.source = source;
    this.dest = dest;
    this.dryDirect = ctx.createGain();
    this.dryDirect.gain.value = 1;
    source.connect(this.dryDirect);
    this.dryDirect.connect(dest);
  }

  get(): BassDriverSettings {
    return { ...this.settings };
  }

  /** True while the layer has live nodes (on, or fading out). */
  get active(): boolean {
    return this.voice !== null;
  }

  set(next: Partial<BassDriverSettings>): void {
    if (this.disposed) return;
    const prev = this.settings;
    const s = normalizeBassDriver(next, prev);
    this.reap();
    if (s.enabled === prev.enabled && s.amount === prev.amount) return;
    this.settings = s;
    const now = this.ctx.currentTime;
    if (s.enabled) {
      if (!this.voice) {
        this.voice = this.buildVoice();
        const fr = this.frame();
        if (fr) this.applyFrame(fr, true);
      }
      const v = this.voice;
      v.releaseAt = Infinity;
      // Dry moves from the direct link onto the safety stage (identical below its knee), trimmed.
      rampLinear(v.out.gain, s.amount, now, BASS_DRIVER_RAMP_S);
      rampLinear(v.drySafe.gain, dryTrimFor(s.amount), now, BASS_DRIVER_RAMP_S);
      rampLinear(this.dryDirect.gain, 0, now, BASS_DRIVER_RAMP_S);
    } else if (prev.enabled) {
      const v = this.voice;
      if (v) {
        rampLinear(v.out.gain, 0, now, BASS_DRIVER_RAMP_S);
        rampLinear(v.drySafe.gain, 0, now, BASS_DRIVER_RAMP_S);
        v.releaseAt = now + BASS_DRIVER_RAMP_S + 0.1;
      }
      rampLinear(this.dryDirect.gain, 1, now, BASS_DRIVER_RAMP_S);
    }
    for (const cb of [...this.listeners]) {
      try {
        cb({ ...s });
      } catch {
        /* a listener must never break audio */
      }
    }
  }

  onChange(cb: BassDriverListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.reap();
    const fr = this.voice ? this.frame() : null;
    if (fr) this.applyFrame(fr, false);
  }

  /**
   * Per control frame (rides setDriving). Pass a frame or a lazy provider: while the driver is off
   * the provider is only stored (never called), so the off state costs nothing per frame.
   */
  update(frame: BassEngineFrame | (() => BassEngineFrame)): void {
    this.frameSrc = frame;
    this.reap();
    if (!this.voice) return;
    const fr = this.frame();
    if (fr) this.applyFrame(fr, false);
  }

  private frame(): BassEngineFrame | null {
    const src = this.frameSrc;
    if (!src) return null;
    if (typeof src !== 'function') return src;
    try {
      const fr = src();
      this.frameSrc = fr;
      return fr;
    } catch {
      return null;
    }
  }

  /** Startup / shutdown cue: schedule the bank along the cue's RPM curve. */
  cue(cue: BassCue, durationS: number, idleFrame?: BassEngineFrame): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    if (cue === 'starter') {
      if (this.lastStarterAt >= 0 && now - this.lastStarterAt < 0.45) return;
      this.lastStarterAt = now;
    }
    const d = Math.max(0.2, finite(durationS, 1));
    this.cueUntil = Math.max(this.cueUntil, now + d);
    const v = this.voice;
    if (!v) return;
    const kind = idleFrame?.kind ?? this.frame()?.kind ?? 'ice';
    const f0 = cue === 'starter' ? (idleFrame ? bassBaseHz(idleFrame) : this.lastBaseHz) : this.lastBaseHz;
    const lvl0 = cue === 'starter' ? 0.75 : Math.max(0.5, this.lastLevel);
    const pts = bassCueCurve(cue, kind, d);
    for (let i = 0; i < 3; i++) {
      holdAt(v.oscs[i].frequency, now);
      holdAt(v.weights[i].gain, now);
    }
    holdAt(v.envScale.gain, now);
    for (const p of pts) {
      const t = now + Math.max(0.005, p.t);
      this.scheduleBank(v, f0 * p.fMul, t);
      v.envScale.gain.linearRampToValueAtTime(BASS_CAL.subFromEnv * lvl0 * p.level, t);
    }
    if (cue === 'starter') this.lastBaseHz = f0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    if (this.voice) this.teardown(this.voice);
    this.voice = null;
    try {
      this.source.disconnect(this.dryDirect);
    } catch {
      /* ignore */
    }
    try {
      this.dryDirect.disconnect();
    } catch {
      /* ignore */
    }
  }

  /* ---------- internals ---------- */

  private applyFrame(frame: BassEngineFrame, immediate: boolean): void {
    const v = this.voice;
    if (!v) return;
    const now = this.ctx.currentTime;
    if (now < this.cueUntil) return; // a cue curve owns the bank until it ends
    const baseHz = bassBaseHz(frame);
    this.lastBaseHz = baseHz;
    this.retuneLive(v, baseHz, now, immediate);
    const level = this.running ? bassLevel(frame) : 0;
    const prevLevel = this.lastLevel;
    this.lastLevel = level;
    const tc = immediate ? 0.01 : level > prevLevel ? LEVEL_ATTACK_TC : LEVEL_RELEASE_TC;
    v.envScale.gain.setTargetAtTime(BASS_CAL.subFromEnv * level, now, tc);
    v.lift.gain.setTargetAtTime(BASS_CAL.lift * (this.running ? 0.5 + 0.5 * level : 0), now, tc);
  }

  /** Live (frame-rate) bank update with click-free retuning of silent oscillators. */
  private retuneLive(v: BassVoice, baseHz: number, now: number, immediate: boolean): void {
    const bank = bassBank(baseHz);
    for (let i = 0; i < 3; i++) {
      const slot = bank[i];
      const osc = v.oscs[i];
      const w = v.weights[i];
      if (slot.n !== v.slotN[i]) {
        // Only retune once this oscillator has been silent long enough; else hold its old octave
        // (its target weight is 0 there too) until it is.
        const silentFor = v.zeroSince[i] >= 0 ? now - v.zeroSince[i] : 0;
        if (immediate || silentFor >= RETUNE_SILENT_S) {
          v.slotN[i] = slot.n;
          osc.frequency.cancelScheduledValues(now);
          osc.frequency.setValueAtTime(slot.hz, now);
        } else {
          const heldHz = baseHz * Math.pow(2, -v.slotN[i]);
          osc.frequency.setTargetAtTime(heldHz, now, LIVE_TC_F);
          w.gain.setTargetAtTime(0, now, LIVE_TC_W);
          if (v.zeroSince[i] < 0) v.zeroSince[i] = now;
          continue;
        }
      } else if (immediate) {
        osc.frequency.cancelScheduledValues(now);
        osc.frequency.setValueAtTime(slot.hz, now);
      } else {
        osc.frequency.setTargetAtTime(slot.hz, now, LIVE_TC_F);
      }
      if (immediate) {
        w.gain.cancelScheduledValues(now);
        w.gain.setValueAtTime(slot.weight, now);
      } else {
        w.gain.setTargetAtTime(slot.weight, now, LIVE_TC_W);
      }
      if (slot.weight <= 1e-4) {
        if (v.zeroSince[i] < 0) v.zeroSince[i] = now;
      } else v.zeroSince[i] = -1;
    }
  }

  /** Scheduled (cue) bank point at time t: linear ramps; silent oscillators jump octaves instantly. */
  private scheduleBank(v: BassVoice, baseHz: number, t: number): void {
    const bank = bassBank(baseHz);
    for (let i = 0; i < 3; i++) {
      const slot = bank[i];
      if (slot.n !== v.slotN[i]) {
        // The leaving octave and the arriving one both sit at the window edge (weight ≈ 0) here:
        // close to exactly 0, jump the octave while silent, then ramp in from the next point.
        v.slotN[i] = slot.n;
        v.weights[i].gain.linearRampToValueAtTime(0, t);
        v.oscs[i].frequency.setValueAtTime(slot.hz, t);
        v.zeroSince[i] = t;
        continue;
      }
      v.oscs[i].frequency.linearRampToValueAtTime(slot.hz, t);
      v.weights[i].gain.linearRampToValueAtTime(slot.weight, t);
      v.zeroSince[i] = slot.weight <= 1e-4 ? t : -1;
    }
  }

  private buildVoice(): BassVoice {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Safety stage: (trimmed dry + bass) × 1/2 → soft limiter → engine output. The ceiling accounts
    // for the engine output gain so the master stays ≤ BASS_MASTER_CEILING_DB while the driver is on.
    const downstream = Math.max(0.05, finite((this.dest as GainNode).gain?.value, 1));
    const safetyIn = ctx.createGain();
    safetyIn.gain.value = 0.5;
    const safety = ctx.createWaveShaper();
    safety.curve = bassSafetyCurve(Math.pow(10, BASS_MASTER_CEILING_DB / 20) / downstream);
    safetyIn.connect(safety);
    safety.connect(this.dest);
    const drySafe = ctx.createGain();
    drySafe.gain.value = 0;
    this.source.connect(drySafe);
    drySafe.connect(safetyIn);
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(safetyIn);

    // Engine-loudness follower, K-weighted like BS.1770 (38 Hz high-pass + 1.7 kHz +4 dB shelf) so
    // the sub tracks perceived loudness → |x| → 5 Hz LP → × level → sub VCA gain (audio-rate, no JS)
    const envHp = ctx.createBiquadFilter();
    envHp.type = 'highpass';
    envHp.frequency.value = 38;
    envHp.Q.value = 0.5;
    const envShelf = ctx.createBiquadFilter();
    envShelf.type = 'highshelf';
    envShelf.frequency.value = 1680;
    envShelf.gain.value = 4;
    const rect = ctx.createWaveShaper();
    rect.curve = bassRectifierCurve();
    const envLp = ctx.createBiquadFilter();
    envLp.type = 'lowpass';
    envLp.frequency.value = 5;
    envLp.Q.value = 0.5;
    const envScale = ctx.createGain();
    envScale.gain.value = 0;
    const subVca = ctx.createGain();
    subVca.gain.value = 0;
    this.source.connect(envHp);
    envHp.connect(envShelf);
    envShelf.connect(rect);
    rect.connect(envLp);
    envLp.connect(envScale);
    envScale.connect(subVca.gain);

    // (c) 2nd/3rd harmonics of the constant-level sub mix
    const harmShaper = ctx.createWaveShaper();
    harmShaper.curve = bassHarmonicCurve();
    const harm = ctx.createGain();
    harm.gain.value = BASS_CAL.harm;
    harmShaper.connect(harm);
    harm.connect(subVca);

    // (a) octave bank
    const bank = bassBank(this.lastBaseHz);
    const oscs: OscillatorNode[] = [];
    const weights: GainNode[] = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = bank[i].hz;
      const w = ctx.createGain();
      w.gain.value = bank[i].weight;
      o.connect(w);
      w.connect(subVca);
      w.connect(harmShaper);
      o.start(now);
      oscs.push(o);
      weights.push(w);
    }

    // Safety: 20 Hz HP → dedicated sub-band compressor → out
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = BASS_HIGHPASS_HZ;
    hp.Q.value = Math.SQRT1_2;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = BASS_CAL.compThresholdDb;
    comp.knee.value = BASS_CAL.compKneeDb;
    comp.ratio.value = BASS_CAL.compRatio;
    comp.attack.value = BASS_CAL.compAttack;
    comp.release.value = BASS_CAL.compRelease;
    subVca.connect(hp);
    hp.connect(comp);
    comp.connect(out);

    // (b) in-phase lift of the engine's own 40–90 Hz
    const liftBp = ctx.createBiquadFilter();
    liftBp.type = 'bandpass';
    liftBp.frequency.value = BASS_LIFT_HZ;
    liftBp.Q.value = 0.85;
    const lift = ctx.createGain();
    lift.gain.value = 0;
    this.source.connect(liftBp);
    liftBp.connect(lift);
    lift.connect(out);

    return {
      oscs,
      weights,
      slotN: bank.map((s) => s.n),
      zeroSince: bank.map((s) => (s.weight <= 1e-4 ? now : -1)),
      envHp,
      envShelf,
      rect,
      envLp,
      envScale,
      subVca,
      harmShaper,
      harm,
      hp,
      comp,
      liftBp,
      lift,
      out,
      drySafe,
      safetyIn,
      safety,
      releaseAt: Infinity,
    };
  }

  /** Tear down a released voice once its fade has finished (polled from frames and set()). */
  private reap(): void {
    const now = this.ctx.currentTime;
    const v = this.voice;
    if (v && !this.settings.enabled && now >= v.releaseAt) {
      this.voice = null;
      this.teardown(v);
    }
  }

  private teardown(v: BassVoice): void {
    for (const o of v.oscs) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    const nodes: AudioNode[] = [...v.oscs, ...v.weights, v.envHp, v.envShelf, v.rect, v.envLp, v.envScale, v.subVca, v.harmShaper, v.harm];
    nodes.push(v.hp, v.comp, v.liftBp, v.lift, v.out, v.drySafe, v.safetyIn, v.safety);
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    for (const n of [v.envHp, v.drySafe]) {
      try {
        this.source.disconnect(n);
      } catch {
        /* ignore */
      }
    }
    try {
      this.source.disconnect(v.liftBp);
    } catch {
      /* ignore */
    }
  }
}

/** Dry trim for strength `amount` (1 at 0, BASS_CAL.dryTrimAtFull at 1). */
export function dryTrimFor(amount: number): number {
  return 1 - (1 - BASS_CAL.dryTrimAtFull) * clamp01(amount);
}

/** Freeze a param at its current automated value from `now` on (cancel-and-hold where available). */
function holdAt(param: AudioParam, now: number): void {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(now);
  } else {
    const cur = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(cur, now);
  }
}

/** Click-free linear ramp from the current value (cancel-and-hold where available). */
function rampLinear(param: AudioParam, target: number, now: number, dur: number): void {
  holdAt(param, now);
  param.linearRampToValueAtTime(target, now + dur);
}
