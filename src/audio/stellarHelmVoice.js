// Stellar Helm — shared procedural voice (original synthesis, no samples).
// Plain JS so EngineSynthImpl (browser) and scripts/stellar-helm-render.mjs (node offline)
// run the SAME drive model, targets, graph and cues.
//
// Compact Web Audio graph (~10 oscillators, 1 runtime-noise source, 6 filters) — light enough
// for in-car Chromium, no AudioWorklet required:
//
//   bed:     3 sines (f0, f0+beat, 2·f0−beat/2) → LP 150 Hz ─────────────────┐
//   core:    2 detuned harmonic waves (L/R) + fifth/octave power partials     │
//            → warmth low-shelf → brightness LP (breathing-modulated) ────────┼→ breathe → level → power → out
//   shimmer: runtime pink noise → HP → BP (slow AM) + 2 faint glass partials ─┘
//   pitch:   one ConstantSource (cents) → every oscillator's detune (power-up glide / power-down fall)

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

/* ───────────────────────────── drive model ───────────────────────────── */

/** Lagged drive state. Speed glides (starship inertia); lifting off relaxes slower than pressing. */
export function createStellarHelmDriveState() {
  return { speed: 0, thr: 0, rev: 0, boost: 0, time: 0 };
}

/**
 * One continuous drive step. Uses speed (0..1) + throttle + load + reverse + boost only:
 * Frontend rpm / rpmNorm are deliberately ignored so a gearbox simulation can never put an
 * rpm cliff into the hum. dt in seconds.
 */
export function stepStellarHelmDrive(state, input, dt, params = {}) {
  const d = input || {};
  const s = clip(num(d.speed, 0));
  const load = clip(num(d.load, 0), -1, 1);
  const t = clip(clip(num(d.throttle, 0)) * 0.88 + Math.max(0, load) * 0.12);
  const r = d.reverse ? 1 : 0;
  const b = clip(num(params.pursuitBoost, 0));
  const step = clip(num(dt, 1 / 60), 0, 1);
  state.speed = lag(state.speed, s, step, 0.9);
  state.thr = lag(state.thr, t, step, t > state.thr ? 0.45 : 1.0);
  state.rev = lag(state.rev, r, step, 0.6);
  state.boost = lag(state.boost, b, step, b > state.boost ? 0.45 : 0.8);
  state.time += step;
  const sp = clip(state.speed);
  return {
    speed: state.speed,
    // Gently concave (more movement at low speed) with a finite slope at 0 — no low-speed cliff
    x: sp * (1.5 - 0.5 * sp),
    thr: state.thr,
    rev: state.rev,
    boost: state.boost,
  };
}

/** Pure mapping drive → voice targets (all continuous; tested for no cliffs). */
export function stellarHelmTargets(params = {}, drv) {
  const p = params || {};
  const x = clip(drv?.x ?? 0);
  const t = clip(drv?.thr ?? 0);
  const b = clip(drv?.boost ?? 0);
  const r = clip(drv?.rev ?? 0) * clip(num(p.helmReverse, 0.7));
  const rise = clip(num(p.helmRise, 0.85), 0, 1.5);
  const coreBase = clip(num(p.helmCoreHz, 73.4), 45, 130);
  const subBase = clip(num(p.helmSubHz, 38), 28, 60);
  const bright = clip(num(p.helmBright, 0.55));
  const warmth = clip(num(p.helmWarmth, 0.6));
  const shimmer = clip(num(p.helmShimmer, 0.45));
  const breath = clip(num(p.helmBreath, 0.5));
  const beatAmt = clip(num(p.helmBeat, 0.6));
  const coreLvl = clip(num(p.helmCore, 0.7));
  const subLvl = clip(num(p.helmSub, 0.8));

  const coreHz = coreBase * Math.pow(2, x * rise + t * 0.12 + b * 0.1 - r * 0.32);
  const subHz = subBase * Math.pow(2, x * 0.32 + t * 0.04 + b * 0.05 - r * 0.2);
  const beatHz = (0.25 + 0.75 * beatAmt) * (0.6 + x * 1.4 + t * 0.3);
  const cutoff = (430 + bright * (1600 * Math.pow(x, 1.1) + 900 * t + 1100 * b) + 120 * x) * (1 - 0.35 * r);
  return {
    coreHz,
    subHz,
    beatHz,
    cutoff: Math.min(6000, cutoff),
    coreGain: coreLvl * (0.5 + 0.22 * x + 0.22 * t + 0.16 * b) * (1 - 0.35 * r),
    powerGain: warmth * (t * 0.45 + b * 0.3) * (1 - 0.5 * r),
    shelfDb: warmth * (1 + 5 * t + 1.5 * b),
    subGain: subLvl * (0.85 + 0.12 * t + 0.08 * b) * (1 - 0.3 * r),
    shimmerGain: shimmer * (0.2 + 0.55 * x + 0.15 * t + 0.6 * b) * (1 - 0.6 * r),
    shimmerHz: 2800 + 2400 * x + 1400 * b,
    glassGain: shimmer * (0.1 + 0.35 * x + 0.5 * b) * (1 - 0.6 * r),
    breathRate: 0.13 + 0.05 * x + 0.12 * b,
    breathDepth: breath * (0.09 + 0.03 * b),
    level: 1 - 0.3 * r,
  };
}

/* ───────────────────────────── scheduling ───────────────────────────── */

/** Offline renders pre-schedule every frame with linear ramps (node-web-audio-api mis-renders
 * long chains of cancel + setTarget). Live audio uses cancel + setTargetAtTime. */
let OFFLINE_RAMPS = false;
export function setStellarHelmOfflineScheduling(on) {
  OFFLINE_RAMPS = !!on;
}

function setT(param, value, t, tc) {
  if (!Number.isFinite(value)) return;
  if (OFFLINE_RAMPS) {
    param.linearRampToValueAtTime(value, t);
    return;
  }
  try {
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, tc);
  } catch {
    param.value = value;
  }
}

function makeNoiseBuffer(ctx, seconds) {
  // Pink-ish runtime noise (Math.random at construction) — the only AudioBuffer the voice uses.
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/** Harmonic "engine core" spectrum: soft 1/n roll-off with a slightly hollow 2nd/4th. */
const CORE_HARMONICS = [0, 1, 0.42, 0.34, 0.17, 0.15, 0.08, 0.07, 0.04, 0.03, 0.02, 0.014, 0.01];

function smoothCurve(from, to, n = 64, shape = sstep) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = from + (to - from) * shape(i / (n - 1));
  return c;
}

/** Output trim so cruise sits ~−20 dBFS RMS through EngineSynthImpl master + limiter. */
const OUT_TRIM = 0.62;

/* ───────────────────────────── voice ───────────────────────────── */

export class StellarHelmVoice {
  /** @param {BaseAudioContext} ctx  @param {AudioNode} dest  @param {{noiseBuffer?: AudioBuffer}} [opts] */
  constructor(ctx, dest, opts = {}) {
    this.ctx = ctx;
    this.dest = dest;
    this.nodes = [];
    this.sources = [];
    this.disposed = false;
    this.powerLevel = 0;
    this.lastTargets = stellarHelmTargets({}, { x: 0, thr: 0, rev: 0, boost: 0 });
    const n = (node) => {
      this.nodes.push(node);
      return node;
    };
    const osc = (type, hz, wave) => {
      const o = n(ctx.createOscillator());
      if (wave) o.setPeriodicWave(wave);
      else o.type = type;
      o.frequency.value = hz;
      this.sources.push(o);
      return o;
    };
    const gain = (v) => {
      const g = n(ctx.createGain());
      g.gain.value = v;
      return g;
    };
    const filt = (type, hz, q) => {
      const f = n(ctx.createBiquadFilter());
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      return f;
    };
    const pan = (v) => {
      if (!ctx.createStereoPanner) return gain(1);
      const p = n(ctx.createStereoPanner());
      p.pan.value = v;
      return p;
    };

    // Output chain: breathe (LFO AM) → level → power (power-up/down) → trim → dest
    this.out = gain(OUT_TRIM);
    this.power = gain(0);
    this.level = gain(1);
    this.breathe = gain(1);
    this.breathe.connect(this.level);
    this.level.connect(this.power);
    this.power.connect(this.out);
    this.out.connect(dest);

    // Global pitch offset (cents) → every tonal oscillator's detune
    this.pitch = n(ctx.createConstantSource());
    this.pitch.offset.value = -1200;
    this.sources.push(this.pitch);

    // ── Sub-bass bed: detuned partials beating slowly
    this.subLp = filt('lowpass', 150, 0.5);
    this.subG = gain(0.8);
    this.subLp.connect(this.subG);
    this.subG.connect(this.breathe);
    this.subA = osc('sine', 38);
    this.subB = osc('sine', 38.5);
    this.subC = osc('sine', 75.8);
    this.subGains = [0.24, 0.075, 0.055].map((v) => gain(v));
    [this.subA, this.subB, this.subC].forEach((o, i) => {
      o.connect(this.subGains[i]);
      this.subGains[i].connect(this.subLp);
      this.pitch.connect(o.detune);
    });

    // ── Engine core: two detuned harmonic waves spread L/R + power partials
    const wave = ctx.createPeriodicWave(
      new Float32Array(CORE_HARMONICS.length),
      Float32Array.from(CORE_HARMONICS),
    );
    this.coreSum = gain(1);
    this.shelf = filt('lowshelf', 170, 0.7);
    this.shelf.gain.value = 1;
    this.coreLp = filt('lowpass', 320, 0.75);
    this.coreG = gain(0.35);
    this.coreSum.connect(this.shelf);
    this.shelf.connect(this.coreLp);
    this.coreLp.connect(this.coreG);
    this.coreG.connect(this.breathe);
    this.coreA = osc('sine', 73.4, wave);
    this.coreB = osc('sine', 73.4, wave);
    this.coreA.detune.value = -4;
    this.coreB.detune.value = 4;
    this.panA = pan(-0.22);
    this.panB = pan(0.22);
    const cA = gain(0.5);
    const cB = gain(0.5);
    this.coreA.connect(cA);
    cA.connect(this.panA);
    this.panA.connect(this.coreSum);
    this.coreB.connect(cB);
    cB.connect(this.panB);
    this.panB.connect(this.coreSum);
    this.fifth = osc('triangle', 110);
    this.octave = osc('sine', 146.8);
    this.powerG = gain(0);
    const fG = gain(0.6);
    const oG = gain(0.45);
    this.fifth.connect(fG);
    this.octave.connect(oG);
    fG.connect(this.powerG);
    oG.connect(this.powerG);
    this.powerG.connect(this.coreSum);
    for (const o of [this.coreA, this.coreB, this.fifth, this.octave]) this.pitch.connect(o.detune);

    // Slow organic drift on core B (±3 cents @ 0.043 Hz) — never perfectly static
    this.drift = osc('sine', 0.043);
    const driftAmt = gain(3);
    this.drift.connect(driftAmt);
    driftAmt.connect(this.coreB.detune);

    // ── Shimmer: airy runtime noise band + two faint glass partials
    this.noiseBuf = opts.noiseBuffer || makeNoiseBuffer(ctx, 2);
    this.noise = n(ctx.createBufferSource());
    this.noise.buffer = this.noiseBuf;
    this.noise.loop = true;
    this.sources.push(this.noise);
    this.shimHp = filt('highpass', 1800, 0.6);
    this.shimBp = filt('bandpass', 2800, 0.7);
    this.shimG = gain(0.02);
    this.shimAm = gain(0);
    this.noise.connect(this.shimHp);
    this.shimHp.connect(this.shimBp);
    this.shimBp.connect(this.shimG);
    this.shimG.connect(this.breathe);
    this.glassA = osc('sine', 880);
    this.glassB = osc('sine', 880.4);
    this.glassG = gain(0);
    const gpA = pan(-0.5);
    const gpB = pan(0.5);
    this.glassA.connect(gpA);
    this.glassB.connect(gpB);
    gpA.connect(this.glassG);
    gpB.connect(this.glassG);
    this.glassG.connect(this.breathe);
    this.pitch.connect(this.glassA.detune);
    this.pitch.connect(this.glassB.detune);

    // ── Breathing: slow LFO on level + brightness; a slower one on the shimmer
    this.breathLfo = osc('sine', 0.15);
    this.breathDepth = gain(0.04);
    this.breathLfo.connect(this.breathDepth);
    this.breathDepth.connect(this.breathe.gain);
    this.cutMod = gain(20);
    this.breathLfo.connect(this.cutMod);
    this.cutMod.connect(this.coreLp.frequency);
    this.shimLfo = osc('sine', 0.071);
    this.shimLfo.connect(this.shimAm);
    this.shimAm.connect(this.shimG.gain);

    for (const s of this.sources) s.start();
  }

  /** Current power 0..1 (scheduled target). */
  get powerTarget() {
    return this.powerLevel;
  }

  /** Current core frequency (Hz) for cues that settle into / fall from the hum. */
  coreHz() {
    return this.lastTargets.coreHz;
  }

  /** Continuous morph — call on every setDriving (drv from stepStellarHelmDrive). */
  update(params, drv, tc = 0.08, when) {
    if (this.disposed) return;
    const p = params || {};
    const t = when ?? this.ctx.currentTime;
    const v = stellarHelmTargets(p, drv);
    this.lastTargets = v;
    const width = clip(num(p.stereoWidth, 0.45));
    setT(this.subA.frequency, v.subHz, t, tc);
    setT(this.subB.frequency, v.subHz + v.beatHz, t, tc);
    setT(this.subC.frequency, v.subHz * 2 - v.beatHz * 0.5, t, tc);
    setT(this.subG.gain, v.subGain, t, tc);
    setT(this.coreA.frequency, v.coreHz, t, tc);
    setT(this.coreB.frequency, v.coreHz, t, tc);
    setT(this.fifth.frequency, v.coreHz * 1.5, t, tc);
    setT(this.octave.frequency, v.coreHz * 2, t, tc);
    setT(this.coreG.gain, v.coreGain * 0.9, t, tc);
    setT(this.powerG.gain, v.powerGain * 0.3, t, tc);
    setT(this.shelf.gain, v.shelfDb, t, tc);
    setT(this.coreLp.frequency, v.cutoff, t, tc);
    setT(this.cutMod.gain, v.cutoff * v.breathDepth * 1.5, t, tc);
    setT(this.shimBp.frequency, v.shimmerHz, t, tc);
    setT(this.shimG.gain, v.shimmerGain * 0.8, t, tc);
    setT(this.shimAm.gain, v.shimmerGain * 0.3, t, tc);
    setT(this.glassA.frequency, v.coreHz * 12, t, tc);
    setT(this.glassB.frequency, v.coreHz * 12 + 0.37, t, tc);
    setT(this.glassG.gain, v.glassGain * 0.02, t, tc);
    setT(this.breathLfo.frequency, v.breathRate, t, tc * 4);
    setT(this.breathDepth.gain, v.breathDepth, t, tc);
    setT(this.level.gain, v.level, t, tc);
    if (this.panA.pan) {
      setT(this.panA.pan, -0.5 * width, t, tc);
      setT(this.panB.pan, 0.5 * width, t, tc);
    }
  }

  /**
   * Smooth power-up: level → 1 and pitch −1 oct → 0 over `dur` s (settles into the hum).
   * `from` (0..1) restarts from that power; default continues from the current power.
   */
  powerUp(dur = 1.6, when, from) {
    if (this.disposed) return;
    const t0 = (when ?? this.ctx.currentTime) + 0.01;
    from = clip(from ?? this.powerLevel);
    this.powerLevel = 1;
    try {
      this.power.gain.cancelScheduledValues(t0);
      this.pitch.offset.cancelScheduledValues(t0);
      this.power.gain.setValueCurveAtTime(smoothCurve(from, 1), t0, Math.max(0.05, dur));
      this.pitch.offset.setValueCurveAtTime(
        smoothCurve(-1200 * (1 - from), 0, 64, (k) => 1 - Math.pow(1 - clip(k), 2.4)),
        t0,
        Math.max(0.05, dur * 1.1),
      );
    } catch {
      this.power.gain.value = 1;
      this.pitch.offset.value = 0;
    }
  }

  /** Power-down: pitch falls ~1.25 oct and level fades with a soft tail over `dur` s. */
  powerDown(dur = 1.8, when) {
    if (this.disposed) return;
    const t0 = (when ?? this.ctx.currentTime) + 0.01;
    const from = clip(this.powerLevel);
    this.powerLevel = 0;
    try {
      this.power.gain.cancelScheduledValues(t0);
      this.pitch.offset.cancelScheduledValues(t0);
      this.power.gain.setValueCurveAtTime(
        smoothCurve(from, 0),
        t0,
        Math.max(0.05, dur),
      );
      this.pitch.offset.setValueCurveAtTime(smoothCurve(0, -1500, 64, (k) => Math.pow(clip(k), 0.8)), t0, Math.max(0.05, dur));
    } catch {
      this.power.gain.value = 0;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes = [];
    this.sources = [];
  }
}

/* ───────────────────────────── cues ───────────────────────────── */

export const SH_STARTER_SECONDS = 1.9;
export const SH_SHUTOFF_SECONDS = 2.2;

function cleanup(...nodes) {
  return () => {
    for (const x of nodes) {
      try {
        x.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

function cueWave(ctx) {
  return ctx.createPeriodicWave(new Float32Array(CORE_HARMONICS.length), Float32Array.from(CORE_HARMONICS));
}

/** Gain envelope via a short curve (no hard edges). points: [[timeOffset, value], …]. */
function shape(param, t0, points) {
  param.value = 0;
  param.setValueAtTime(0, t0);
  for (const [dt, v] of points) param.linearRampToValueAtTime(v, t0 + dt);
}

/**
 * Power-up: a rising harmonic sweep (26 Hz → the hum's core pitch) with an airy noise swell
 * opening upward, then a faint glassy settle as it hands over to the hum.
 */
export function playStellarHelmStarter(ctx, dest, params, noiseBuf, settleHz, when) {
  const now = (when ?? ctx.currentTime) + 0.02;
  const target = clip(num(settleHz, num(params?.helmCoreHz, 73.4)), 40, 400);
  const lvl = 0.8 + 0.2 * clip(num(params?.masterGain, 0.72));
  const nodes = [];
  const track = (x) => (nodes.push(x), x);

  const o = track(ctx.createOscillator());
  o.setPeriodicWave(cueWave(ctx));
  o.frequency.setValueAtTime(26, now);
  o.frequency.exponentialRampToValueAtTime(target, now + 1.25);
  const lp = track(ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(180, now);
  lp.frequency.exponentialRampToValueAtTime(1400, now + 1.1);
  lp.frequency.exponentialRampToValueAtTime(600, now + 1.8);
  const g = track(ctx.createGain());
  shape(g.gain, now, [[0.35, 0.04 * lvl], [1.0, 0.11 * lvl], [1.3, 0.09 * lvl], [1.88, 0]]);
  o.connect(lp);
  lp.connect(g);
  g.connect(dest);

  const o2 = track(ctx.createOscillator());
  o2.type = 'sine';
  o2.frequency.setValueAtTime(52, now);
  o2.frequency.exponentialRampToValueAtTime(target * 2, now + 1.25);
  const g2 = track(ctx.createGain());
  shape(g2.gain, now, [[0.5, 0.012 * lvl], [1.05, 0.035 * lvl], [1.85, 0]]);
  o2.connect(g2);
  g2.connect(dest);

  let nz = null;
  if (noiseBuf) {
    nz = track(ctx.createBufferSource());
    nz.buffer = noiseBuf;
    nz.loop = true;
    const bp = track(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(160, now);
    bp.frequency.exponentialRampToValueAtTime(3000, now + 1.2);
    const ng = track(ctx.createGain());
    shape(ng.gain, now, [[0.4, 0.05 * lvl], [1.1, 0.12 * lvl], [1.85, 0]]);
    nz.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
  }

  const glint = track(ctx.createOscillator());
  glint.type = 'sine';
  glint.frequency.value = target * 12;
  const gg = track(ctx.createGain());
  gg.gain.value = 0;
  gg.gain.setValueAtTime(0, now + 1.1);
  gg.gain.linearRampToValueAtTime(0.006 * lvl, now + 1.2);
  gg.gain.exponentialRampToValueAtTime(0.0001, now + 1.88);
  glint.connect(gg);
  gg.connect(dest);

  const end = now + SH_STARTER_SECONDS + 0.05;
  for (const s of [o, o2, glint, nz]) {
    if (!s) continue;
    s.start(now);
    s.stop(end);
  }
  o.onended = cleanup(...nodes);
  return SH_STARTER_SECONDS;
}

/**
 * Power-down: a falling harmonic sweep (from the hum's core pitch toward 22 Hz), a descending
 * airy noise band and a soft sub tail.
 */
export function playStellarHelmShutoff(ctx, dest, params, noiseBuf, fromHz, when) {
  const now = (when ?? ctx.currentTime) + 0.02;
  const start = clip(num(fromHz, num(params?.helmCoreHz, 73.4)), 40, 400);
  const lvl = 0.8 + 0.2 * clip(num(params?.masterGain, 0.72));
  const nodes = [];
  const track = (x) => (nodes.push(x), x);

  const o = track(ctx.createOscillator());
  o.setPeriodicWave(cueWave(ctx));
  o.frequency.setValueAtTime(start, now);
  o.frequency.exponentialRampToValueAtTime(22, now + 1.7);
  const lp = track(ctx.createBiquadFilter());
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(1100, now);
  lp.frequency.exponentialRampToValueAtTime(140, now + 1.9);
  const g = track(ctx.createGain());
  shape(g.gain, now, [[0.08, 0.06 * lvl], [0.6, 0.05 * lvl], [1.4, 0.022 * lvl], [2.15, 0]]);
  o.connect(lp);
  lp.connect(g);
  g.connect(dest);

  const sub = track(ctx.createOscillator());
  sub.type = 'sine';
  sub.frequency.setValueAtTime(42, now);
  sub.frequency.exponentialRampToValueAtTime(24, now + 2.1);
  const sg = track(ctx.createGain());
  shape(sg.gain, now, [[0.1, 0.045 * lvl], [1.2, 0.032 * lvl], [2.18, 0]]);
  sub.connect(sg);
  sg.connect(dest);

  let nz = null;
  if (noiseBuf) {
    nz = track(ctx.createBufferSource());
    nz.buffer = noiseBuf;
    nz.loop = true;
    const bp = track(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.Q.value = 1.0;
    bp.frequency.setValueAtTime(2600, now);
    bp.frequency.exponentialRampToValueAtTime(140, now + 1.8);
    const ng = track(ctx.createGain());
    shape(ng.gain, now, [[0.06, 0.045 * lvl], [0.9, 0.028 * lvl], [1.9, 0]]);
    nz.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
  }

  const end = now + SH_SHUTOFF_SECONDS + 0.05;
  for (const s of [o, sub, nz]) {
    if (!s) continue;
    s.start(now);
    s.stop(end);
  }
  o.onended = cleanup(...nodes);
  return SH_SHUTOFF_SECONDS;
}
