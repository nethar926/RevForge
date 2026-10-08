// Chrono Coupe — shared procedural voice pieces (original synthesis, no samples).
// Plain JS so EngineSynthImpl (browser) and the offline renderers (node) run the SAME drive
// model, worklet targets, post chain, charge / discharge bus and cues.
//
// Base sound = pulse-engine-processor family 5 (odd-fire 90° V6: 150°/90° alternating) with
// light camLope / bankSplit / overrun opt-ins. This module shapes it and adds the charge bus.

import { createOverrunBurstState, gatedCrackle, stepOverrunBurst } from './overrunBurst.js';

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

/** 5-speed manual + clutch-slip launch, used only when Frontend sends no rpm / rpmNorm. */
export const CC_GEAR_RATIOS = [3.36, 2.06, 1.38, 1.03, 0.82];
export const CC_FINAL_DRIVE = 3.44;
export const CC_TIRE_CIRC_M = 1.98;
/** Normalized speed 1.0 ≙ 120 mph (same as Night Pursuit / mphToSpeed default). */
export const CC_SPEED_FULL_MPH = 120;
/** Upshift glide: rpm falls to the next gear over ~0.6 s (no cliffs). */
const SHIFT_GLIDE_TC = 0.28;

export function ccIdleRpm(params) {
  return (num(params?.rpmIdle, 43) * 120) / Math.max(4, num(params?.cylinders, 6));
}
export function ccRedlineRpm(params) {
  return (num(params?.rpmRedline, 300) * 120) / Math.max(4, num(params?.cylinders, 6));
}

export function createChronoCoupeDriveState(idleRpm = 860) {
  return {
    rpm: idleRpm,
    gear: 1,
    lastShiftAt: -10,
    time: 0,
    thrSlow: 0,
    prevThr: 0,
    overrun: 0,
    burst: createOverrunBurstState(),
    breath: 0,
    modelled: false,
  };
}

function lockedRpm(mps, gear) {
  const wheelRpm = (mps / CC_TIRE_CIRC_M) * 60;
  return wheelRpm * CC_GEAR_RATIOS[gear - 1] * CC_FINAL_DRIVE;
}

/**
 * One continuous drive step. Frontend rpm / rpmNorm always win (driving-adapt contract);
 * otherwise a 5-speed manual model maps speed + throttle → rpm with glides, no cliffs.
 * Returns { rpm, rpmNorm, gear, overrun, breath, shifting, modelled }.
 */
export function stepChronoCoupeDrive(state, input, dt, params = {}) {
  const s = state;
  const idle = ccIdleRpm(params);
  const red = ccRedlineRpm(params);
  const thr = clip(num(input?.throttle, 0));
  const load = clip(num(input?.load, 0), -1, 1);
  const speed = clip(num(input?.speed, 0));
  const h = clip(num(dt, 1 / 60), 0, 0.25);
  s.time += h;

  const hasRpm = input?.rpm != null && Number.isFinite(input.rpm);
  const hasNorm = input?.rpmNorm != null && Number.isFinite(input.rpmNorm);
  let shifting = false;
  if (hasRpm || hasNorm) {
    s.modelled = false;
    s.rpm = hasRpm ? clip(input.rpm, 200, 9000) : idle + clip(input.rpmNorm) * (red - idle);
  } else {
    s.modelled = true;
    const mph = speed * CC_SPEED_FULL_MPH;
    const mps = mph / 2.236936;
    let target;
    if (mph < 1.2) {
      // Neutral free-rev: light flywheel, quick rise, slower fall
      s.gear = 1;
      target = idle + Math.pow(thr, 1.2) * (red * 0.9 - idle);
    } else {
      const shape = sstep(thr * 1.1);
      const upRpm = 2000 + shape * (red * 0.93 - 2000);
      const downRpm = 1200 + thr * 1300;
      const since = s.time - s.lastShiftAt;
      if (since > 0.7) {
        if (s.gear < CC_GEAR_RATIOS.length && lockedRpm(mps, s.gear) > upRpm) {
          s.gear += 1;
          s.lastShiftAt = s.time;
        } else if (s.gear > 1 && lockedRpm(mps, s.gear) < downRpm) {
          s.gear -= 1;
          s.lastShiftAt = s.time;
        }
      }
      const locked = lockedRpm(mps, s.gear);
      // Clutch slip at launch, fading out by ~14 mph in first
      const launch = s.gear === 1 ? 1 - clip(mph / 14) : 0;
      const slip = launch * (250 + Math.pow(thr, 1.1) * 1600);
      target = Math.max(idle, locked + slip);
    }
    target = clip(target, idle * 0.97, red);
    shifting = s.time - s.lastShiftAt < 0.45;
    const parked = mph < 1.2;
    const tc = shifting ? SHIFT_GLIDE_TC : target > s.rpm ? (parked ? 0.11 : 0.09) : parked ? 0.26 : 0.15;
    s.rpm = lag(s.rpm, target, h, tc);
  }
  const rpmNorm = clip((s.rpm - idle) / Math.max(1, red - idle));

  // Overrun pops: ONLY a genuine lift-off from high rpm opens a bounded burst that decays as the
  // revs fall (overrunBurst.js). No coasting floor / Frontend `overrun` flag trigger.
  s.thrSlow = lag(s.thrSlow, thr, h, 0.35);
  if (!s.burst) s.burst = createOverrunBurstState();
  s.overrun = stepOverrunBurst(s.burst, { throttle: thr, rpm: s.rpm }, h, { idleRpm: idle, redlineRpm: red });
  s.prevThr = thr;

  // Breath = intake airflow feel (wheeze + injection hiss), throttle-led, load adds a little
  s.breath = lag(s.breath, clip(thr * 0.7 + rpmNorm * 0.3 + Math.max(0, load) * 0.15), h, 0.1);

  return {
    rpm: s.rpm,
    rpmNorm,
    gear: s.gear,
    overrun: clip(s.overrun),
    breath: s.breath,
    shifting,
    modelled: s.modelled,
  };
}

/**
 * Worklet AudioParam targets (family 5 + opt-ins). `base` = values the generic ICE path would
 * push; the returned object overrides them.
 */
export function chronoCoupeWorkletTargets(params, drive, thr, base = {}) {
  const p = params || {};
  const wz = clip(num(p.wheeze, 0.55));
  const growl0 = num(base.growl, num(p.growl, 0.52));
  const intake0 = num(base.intake, num(p.intake, 0.62));
  const muff0 = num(base.mufflerMix, num(p.muffling, 0.42));
  return {
    firingFamily: 5,
    camLope: clip(num(p.camLope, 0.16)),
    bankSplit: clip(num(p.bankSplit, 0.35)),
    overrun: clip(drive.overrun),
    overrunBurble: clip(num(p.overrunBurble, 0.32)),
    dcGuard: clip((num(drive.rpm, 860) - 1500) / 1300),
    growl: clip(growl0 * (0.85 + thr * 0.22)),
    intake: clip(intake0 * (0.9 + wz * 0.35 * (0.3 + thr))),
    mufflerMix: clip(muff0 * (1.05 - thr * 0.35)),
    exhaustFeedback: clip(num(base.exhaustFeedback, num(p.exhaustFeedback, 0.74)), 0.1, 0.95),
    collectorDelayMs: clip(num(p.collectorDelayMs, 1.4), 0.5, 3),
    // Worklet crackle only while a lift-off burst is open (never at cruise / coast / idle)
    crackle: gatedCrackle(num(p.crackle, 0.3), drive.overrun),
  };
}

function makeNoiseBuffer(ctx, seconds, pink) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) {
      d[i] = w;
      continue;
    }
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

/** Offline renders pre-schedule every frame: piecewise-linear ramps (see Night Pursuit). */
let OFFLINE_RAMPS = false;
export function setChronoCoupeOfflineScheduling(on) {
  OFFLINE_RAMPS = !!on;
}

function setT(param, value, t, tc) {
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

/** Charge intensity 0..1 from params + boost (setPursuitBoost maps here). */
export function chronoCoupeChargeIntensity(params) {
  const base = clip(num(params?.chargeIntensity, 0.75));
  const boost = clip(num(params?.pursuitBoost, 0));
  return clip(base * (0.6 + 0.4 * boost));
}

/** Minimum seconds between discharge events (button mashing stays polite). */
export const CC_DISCHARGE_COOLDOWN_S = 1.0;
export const CC_DISCHARGE_SECONDS = 1.3;

/**
 * Chrono Coupe post chain + charge bus.
 *   engine → input → HP → shell peaks (stainless panel modes) → low shelf → tone LP → duck → out
 *   breath: wheeze (pink BP, crank-order AM) + mechanical-injection hiss → duck
 *   charge: whine pair + electrical buzz + crackle spikes → compressor → out (not ducked)
 *   discharge: crack + sweep + shimmer tail → charge compressor; duck dips the engine briefly
 */
export class ChronoCoupeBus {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.nodes = [];
    this.sources = [];
    const n = (node) => {
      this.nodes.push(node);
      return node;
    };
    this.pink = makeNoiseBuffer(ctx, 2, true);
    this.white = makeNoiseBuffer(ctx, 2, false);

    this.input = n(ctx.createGain());
    this.hp = n(ctx.createBiquadFilter());
    this.hp.type = 'highpass';
    this.hp.frequency.value = 32;
    this.hp.Q.value = 0.6;
    this.shellA = n(ctx.createBiquadFilter());
    this.shellA.type = 'peaking';
    this.shellA.frequency.value = 385;
    this.shellA.Q.value = 5;
    this.shellA.gain.value = 1.5;
    this.shellB = n(ctx.createBiquadFilter());
    this.shellB.type = 'peaking';
    this.shellB.frequency.value = 1160;
    this.shellB.Q.value = 7;
    this.shellB.gain.value = 1;
    this.shelf = n(ctx.createBiquadFilter());
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 140;
    this.shelf.gain.value = 1.5;
    this.tone = n(ctx.createBiquadFilter());
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 1200;
    this.tone.Q.value = 0.55;
    this.duck = n(ctx.createGain());
    this.duck.gain.value = 1;
    this.out = n(ctx.createGain());
    this.out.gain.value = 1.5;
    this.input.connect(this.hp);
    this.hp.connect(this.shellA);
    this.shellA.connect(this.shellB);
    this.shellB.connect(this.shelf);
    this.shelf.connect(this.tone);
    this.tone.connect(this.duck);
    this.duck.connect(this.out);
    this.out.connect(dest);

    const pinkSrc = n(ctx.createBufferSource());
    pinkSrc.buffer = this.pink;
    pinkSrc.loop = true;
    const whiteSrc = n(ctx.createBufferSource());
    whiteSrc.buffer = this.white;
    whiteSrc.loop = true;
    this.sources.push(pinkSrc, whiteSrc);

    // Wheeze: narrow-ish intake breath, amplitude-modulated at crank order (odd-fire breathing)
    this.wheezeF = n(ctx.createBiquadFilter());
    this.wheezeF.type = 'bandpass';
    this.wheezeF.frequency.value = 1200;
    this.wheezeF.Q.value = 1.6;
    this.wheezeAm = n(ctx.createGain());
    this.wheezeAm.gain.value = 0.6;
    this.crankLfo = n(ctx.createOscillator());
    this.crankLfo.type = 'sine';
    this.crankLfo.frequency.value = 14;
    this.crankDepth = n(ctx.createGain());
    this.crankDepth.gain.value = 0.4;
    this.crankLfo.connect(this.crankDepth);
    this.crankDepth.connect(this.wheezeAm.gain);
    this.wheezeG = n(ctx.createGain());
    this.wheezeG.gain.value = 0;
    pinkSrc.connect(this.wheezeF);
    this.wheezeF.connect(this.wheezeAm);
    this.wheezeAm.connect(this.wheezeG);
    this.wheezeG.connect(this.duck);

    // Mechanical (continuous) injection hiss: fine high band, follows airflow
    this.hissF = n(ctx.createBiquadFilter());
    this.hissF.type = 'bandpass';
    this.hissF.frequency.value = 7200;
    this.hissF.Q.value = 0.7;
    this.hissHp = n(ctx.createBiquadFilter());
    this.hissHp.type = 'highpass';
    this.hissHp.frequency.value = 4200;
    this.hissG = n(ctx.createGain());
    this.hissG.gain.value = 0;
    whiteSrc.connect(this.hissF);
    this.hissF.connect(this.hissHp);
    this.hissHp.connect(this.hissG);
    this.hissG.connect(this.duck);

    // Charge bus — own compressor keeps every charge sound under the engine's loudness
    this.chargeComp = n(ctx.createDynamicsCompressor());
    this.chargeComp.threshold.value = -28;
    this.chargeComp.knee.value = 6;
    this.chargeComp.ratio.value = 10;
    this.chargeComp.attack.value = 0.002;
    this.chargeComp.release.value = 0.16;
    this.chargeOut = n(ctx.createGain());
    this.chargeOut.gain.value = 1.4;
    this.chargeComp.connect(this.chargeOut);
    this.chargeOut.connect(dest);
    // Discharge one-shots: separate gentle safety compressor so the release reads clearly but
    // its short-term loudness stays within ~+3 dB of the running engine (no surprise peaks)
    this.dischargeComp = n(ctx.createDynamicsCompressor());
    this.dischargeComp.threshold.value = -14;
    this.dischargeComp.knee.value = 6;
    this.dischargeComp.ratio.value = 4;
    this.dischargeComp.attack.value = 0.001;
    this.dischargeComp.release.value = 0.12;
    this.dischargeOut = n(ctx.createGain());
    this.dischargeOut.gain.value = 1.5;
    this.dischargeComp.connect(this.dischargeOut);
    this.dischargeOut.connect(dest);

    this.whineA = n(ctx.createOscillator());
    this.whineA.type = 'sawtooth';
    this.whineA.frequency.value = 180;
    this.whineB = n(ctx.createOscillator());
    this.whineB.type = 'sine';
    this.whineB.frequency.value = 271;
    this.whineLp = n(ctx.createBiquadFilter());
    this.whineLp.type = 'lowpass';
    this.whineLp.frequency.value = 1400;
    this.whineLp.Q.value = 2.5;
    this.whineG = n(ctx.createGain());
    this.whineG.gain.value = 0;
    this.vib = n(ctx.createOscillator());
    this.vib.type = 'sine';
    this.vib.frequency.value = 5.5;
    this.vibDepth = n(ctx.createGain());
    this.vibDepth.gain.value = 0;
    this.vib.connect(this.vibDepth);
    this.vibDepth.connect(this.whineA.frequency);
    this.vibDepth.connect(this.whineB.frequency);
    this.whineA.connect(this.whineLp);
    this.whineB.connect(this.whineLp);
    this.whineLp.connect(this.whineG);
    this.whineG.connect(this.chargeComp);

    this.buzz = n(ctx.createOscillator());
    this.buzz.type = 'triangle';
    this.buzz.frequency.value = 100;
    this.buzzG = n(ctx.createGain());
    this.buzzG.gain.value = 0;
    this.buzz.connect(this.buzzG);
    this.buzzG.connect(this.chargeComp);

    this.crackF = n(ctx.createBiquadFilter());
    this.crackF.type = 'bandpass';
    this.crackF.frequency.value = 4300;
    this.crackF.Q.value = 0.8;
    this.crackHp = n(ctx.createBiquadFilter());
    this.crackHp.type = 'highpass';
    this.crackHp.frequency.value = 2200;
    this.crackG = n(ctx.createGain());
    this.crackG.gain.value = 0;
    whiteSrc.connect(this.crackHp);
    this.crackHp.connect(this.crackF);
    this.crackF.connect(this.crackG);
    this.crackG.connect(this.chargeComp);

    this.chargeTarget = 0;
    this.breath = 0;
    this.chargeSmooth = 0;
    this.spent = 0;
    this.lastUpdate = -1;
    this.lastDischarge = -10;
    this.nextCrackAt = 0;
    this.started = false;
    this.start();
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const s of this.sources) s.start();
    for (const o of [this.crankLfo, this.whineA, this.whineB, this.vib, this.buzz]) o.start();
  }

  /** Set the 0..1 charge level (Frontend: speed ÷ jump threshold). Smoothed on update. */
  setCharge(level) {
    this.chargeTarget = clip(num(level, 0));
  }

  /** Continuous morph — call on every setDriving (and after setCharge). */
  update(params, drive, thr, tc = 0.06) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const p = params || {};
    const rn = clip(drive.rpmNorm);
    const rpm = num(drive.rpm, 860);
    const br = clip(drive.breath);
    this.breath = br;
    const ovr = clip(drive.overrun);
    const shell = clip(num(p.shellResonance, 0.45));
    // Stainless shell: panel modes ring a touch more with revs/load, never boomy
    setT(this.shellA.gain, shell * (2.2 + rn * 1.6 + thr * 0.8), t, tc);
    setT(this.shellB.gain, shell * (1.2 + rn * 1.8), t, tc);
    setT(this.shellA.frequency, 370 + rn * 60, t, tc);
    setT(this.shelf.gain, 2 - rn * 1.2, t, tc);
    // Modest power: tone opens with revs + throttle but stays rounded
    const open = 950 + Math.pow(rn, 0.9) * 3300 + thr * 1100 + ovr * 500;
    setT(this.tone.frequency, Math.min(7500, open), t, tc);

    // Wheeze + injection hiss follow airflow
    const wz = clip(num(p.wheeze, 0.55));
    const hiss = clip(num(p.injectionHiss, 0.5));
    setT(this.crankLfo.frequency, clip(rpm / 60, 8, 110), t, tc);
    setT(this.wheezeF.frequency, 1050 + rn * 1500 + thr * 300, t, tc);
    setT(this.wheezeG.gain, wz * (0.016 + br * 0.07) * (0.5 + rn * 0.5), t, tc);
    setT(this.hissG.gain, hiss * (0.011 + br * 0.03), t, tc);

    this.updateCharge(p, t, tc);
  }

  /** Charge whine / buzz / crackle from the smoothed level. */
  updateCharge(params, t = this.ctx.currentTime, tc = 0.06) {
    const dt = this.lastUpdate < 0 ? 1 / 60 : clip(t - this.lastUpdate, 0, 0.25);
    this.lastUpdate = t;
    const target = Math.max(this.chargeTarget, clip(num(params?.chargeLevel, 0)));
    this.chargeSmooth = lag(this.chargeSmooth, target, dt, target > this.chargeSmooth ? 0.18 : 0.3);
    this.spent = lag(this.spent, 0, dt, 0.6);
    const I = chronoCoupeChargeIntensity(params);
    const L = clip(this.chargeSmooth * (1 - this.spent));
    const hz = 180 + Math.pow(L, 1.4) * 2400;
    setT(this.whineA.frequency, hz, t, tc);
    setT(this.whineB.frequency, hz * 1.503, t, tc);
    setT(this.whineLp.frequency, 900 + L * 4200, t, tc);
    setT(this.vibDepth.gain, hz * 0.004 * L, t, tc);
    setT(this.whineG.gain, I * Math.pow(L, 1.6) * 0.022, t, tc);
    setT(this.buzz.frequency, 96 + L * 34, t, tc);
    setT(this.buzzG.gain, I * L * 0.012, t, tc);
    // Crackle: sparse random spikes, denser near full charge (boost adds density)
    const boost = clip(num(params?.pursuitBoost, 0));
    const rate = Math.pow(L, 2.2) * (6 + boost * 8); // spikes per second
    if (rate > 0.05 && t >= this.nextCrackAt) {
      const amp = I * (0.025 + L * 0.045) * (0.4 + Math.random() * 0.6);
      const at = Math.max(t, this.nextCrackAt);
      try {
        this.crackG.gain.setValueAtTime(0, at);
        this.crackG.gain.linearRampToValueAtTime(amp, at + 0.0015);
        this.crackG.gain.setTargetAtTime(0, at + 0.0015, 0.004 + Math.random() * 0.008);
      } catch {
        /* ignore */
      }
      this.nextCrackAt = at + (0.4 + Math.random() * 1.2) / rate;
    }
  }

  /**
   * Discharge event: bright release crack + falling sweep + short shimmer tail and a brief
   * engine dip. Rate-limited; returns false when skipped. Loudness-safe (charge compressor,
   * 3–6 ms attacks, peaks below the engine's cruise loudness + 3 dB).
   */
  discharge(params) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01;
    if (t0 - this.lastDischarge < CC_DISCHARGE_COOLDOWN_S) return false;
    this.lastDischarge = t0;
    // Level tracks the running engine (quieter at idle, fuller at speed) → never a surprise
    const I = Math.max(0.45, chronoCoupeChargeIntensity(params)) * (0.18 + 0.82 * clip(this.breath));
    const L = Math.max(0.35, this.chargeSmooth);
    const dest = this.dischargeComp;
    try {
      // Crack: broadband snap, high-passed
      const nz = ctx.createBufferSource();
      nz.buffer = this.white;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const ng = ctx.createGain();
      ng.gain.value = 0;
      ng.gain.setValueAtTime(0, t0);
      ng.gain.linearRampToValueAtTime(0.6 * I, t0 + 0.003);
      ng.gain.setTargetAtTime(0, t0 + 0.003, 0.022);
      nz.connect(hp);
      hp.connect(ng);
      ng.connect(dest);
      nz.start(t0);
      nz.stop(t0 + 0.2);
      nz.onended = cleanup(nz, hp, ng);

      // Sweep: bright release falling from ~4.6 kHz to ~200 Hz
      const sw = ctx.createOscillator();
      sw.type = 'sawtooth';
      sw.frequency.setValueAtTime(3400 + L * 1200, t0);
      sw.frequency.exponentialRampToValueAtTime(200, t0 + 0.45);
      const swLp = ctx.createBiquadFilter();
      swLp.type = 'lowpass';
      swLp.Q.value = 4;
      swLp.frequency.setValueAtTime(7000, t0);
      swLp.frequency.exponentialRampToValueAtTime(600, t0 + 0.45);
      const swG = ctx.createGain();
      swG.gain.value = 0;
      swG.gain.setValueAtTime(0, t0);
      swG.gain.linearRampToValueAtTime(0.28 * I, t0 + 0.006);
      swG.gain.setTargetAtTime(0, t0 + 0.02, 0.12);
      sw.connect(swLp);
      swLp.connect(swG);
      swG.connect(dest);
      sw.start(t0);
      sw.stop(t0 + 0.9);
      sw.onended = cleanup(sw, swLp, swG);

      // Shimmer tail: a few high partials with tremolo, ~1 s decay
      const parts = [2350, 3110, 3920, 4870, 6050];
      for (let i = 0; i < parts.length; i++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        const f0 = parts[i] * (0.97 + Math.random() * 0.06);
        o.frequency.setValueAtTime(f0, t0 + 0.05);
        o.frequency.linearRampToValueAtTime(f0 * 1.02, t0 + 1.1);
        const am = ctx.createGain();
        am.gain.value = 0.5;
        const trem = ctx.createOscillator();
        trem.frequency.value = 7 + i * 1.3;
        const td = ctx.createGain();
        td.gain.value = 0.5;
        trem.connect(td);
        td.connect(am.gain);
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setValueAtTime(0, t0 + 0.04);
        g.gain.linearRampToValueAtTime(0.035 * I, t0 + 0.09);
        g.gain.setTargetAtTime(0, t0 + 0.12, 0.22 + i * 0.03);
        o.connect(am);
        am.connect(g);
        g.connect(dest);
        o.start(t0 + 0.04);
        o.stop(t0 + CC_DISCHARGE_SECONDS);
        trem.start(t0 + 0.04);
        trem.stop(t0 + CC_DISCHARGE_SECONDS);
        o.onended = cleanup(o, am, g, trem, td);
      }

      // Brief engine dip (≈ −5 dB) then recover; charge sounds collapse and rebuild
      const d = this.duck.gain;
      d.cancelScheduledValues(t0);
      d.setValueAtTime(d.value || 1, t0);
      d.setTargetAtTime(0.55, t0 + 0.01, 0.03);
      d.setTargetAtTime(1, t0 + 0.22, 0.18);
      this.spent = 1;
      this.updateCharge(params, ctx.currentTime, 0.03);
    } catch {
      /* never block drive path */
    }
    return true;
  }

  dispose() {
    for (const s of [...this.sources, this.crankLfo, this.whineA, this.whineB, this.vib, this.buzz]) {
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

// ─── Pack-specific cues: fuel-pump prime → odd-fire crank → catch, and uneven rundown ───

function env(g, t0, peak, attack, release, hold = 0) {
  const p = Math.max(0.0001, peak);
  g.gain.value = 0.0001;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(p, t0 + Math.max(0.003, attack));
  if (hold > 0) g.gain.setValueAtTime(p, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + Math.max(0.02, release));
}

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

function thump(ctx, dest, pinkBuf, t, hz, peak, len, lpHz) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(hz, t);
  o.frequency.exponentialRampToValueAtTime(hz * 0.72, t + len);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpHz;
  lp.Q.value = 0.8;
  const g = ctx.createGain();
  env(g, t, peak, 0.005, len);
  o.connect(lp);
  lp.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + len + 0.05);
  o.onended = cleanup(o, lp, g);
  const nz = ctx.createBufferSource();
  nz.buffer = pinkBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = lpHz * 0.6;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  env(ng, t, peak * 0.8, 0.004, len * 0.8);
  nz.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  nz.start(t);
  nz.stop(t + len + 0.05);
  nz.onended = cleanup(nz, bp, ng);
}

function pumpWhir(ctx, dest, t, dur, peak, fall = false) {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(fall ? 205 : 150, t);
  o.frequency.linearRampToValueAtTime(fall ? 120 : 205, t + dur * 0.6);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1300;
  bp.Q.value = 3;
  const g = ctx.createGain();
  env(g, t, peak, 0.04, dur * 0.4, dur * 0.5);
  o.connect(bp);
  bp.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.1);
  o.onended = cleanup(o, bp, g);
}

export const CC_STARTER_SECONDS = 1.7;
export const CC_SHUTOFF_SECONDS = 1.2;

/** Fuel-pump prime whir → brisk odd-fire crank (uneven compression gaps) → catch → flare. */
export function playChronoCoupeStarter(ctx, dest, params, whiteBuf, pinkBuf) {
  const now = ctx.currentTime + 0.02;
  const growl = clip(num(params?.growl, 0.52));
  const jit = clip(num(params?.pulseJitter, 0.22));
  pumpWhir(ctx, dest, now, 0.4, 0.035);
  const crankStart = now + 0.32;
  const crankEnd = crankStart + 0.7;

  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  const mBp = ctx.createBiquadFilter();
  mBp.type = 'bandpass';
  mBp.frequency.value = 1050;
  mBp.Q.value = 1.5;
  const mG = ctx.createGain();
  env(mG, crankStart, 0.09, 0.04, 0.12, 0.62);
  motor.connect(mBp);
  mBp.connect(mG);
  mG.connect(dest);
  motor.frequency.setValueAtTime(190, crankStart);
  let t = crankStart;
  let gap = 0.07;
  let k = 0;
  while (t < crankEnd) {
    // Odd-fire: alternating long / short compression gaps (150° / 90°)
    const odd = k % 2 === 0 ? 1.25 : 0.75;
    const j = 1 + (Math.random() * 2 - 1) * jit * 0.15;
    motor.frequency.linearRampToValueAtTime(240 + k * 2, t + gap * odd * 0.45);
    motor.frequency.linearRampToValueAtTime((205 + k * 2) / (odd > 1 ? 1.08 : 0.96), t + gap * odd * 0.95);
    thump(ctx, dest, pinkBuf, t + gap * odd * 0.85, 66 + growl * 10, 0.13 * odd, 0.05, 380);
    t += gap * odd * j;
    gap *= 0.985;
    k++;
  }
  motor.start(crankStart);
  motor.stop(crankEnd + 0.25);
  motor.onended = cleanup(motor, mBp, mG);

  // Pinion engage tick
  const nz = ctx.createBufferSource();
  nz.buffer = whiteBuf;
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 2800;
  nbp.Q.value = 2;
  const ng = ctx.createGain();
  env(ng, crankStart, 0.03, 0.003, 0.07);
  nz.connect(nbp);
  nbp.connect(ng);
  ng.connect(dest);
  nz.start(crankStart);
  nz.stop(crankStart + 0.12);
  nz.onended = cleanup(nz, nbp, ng);

  // Catch: uneven first fires (150/90 rhythm), accelerating
  const catches = [0, 0.1, 0.16, 0.24, 0.28, 0.34, 0.37];
  for (let i = 0; i < catches.length; i++) {
    const ct = crankEnd - 0.05 + catches[i] + (Math.random() * 2 - 1) * 0.006;
    thump(ctx, dest, pinkBuf, ct, 80 + growl * 14 + i * 5, (0.22 + i * 0.03) * (i % 2 ? 0.8 : 1), 0.08, 620 + i * 50);
  }

  // Flare to ~1.8k then settle (breathy noise through a sweeping band)
  const flareT = crankEnd + 0.32;
  const fl = ctx.createBufferSource();
  fl.buffer = pinkBuf;
  fl.loop = true;
  const flF = ctx.createBiquadFilter();
  flF.type = 'bandpass';
  flF.Q.value = 1.4;
  flF.frequency.setValueAtTime(260, flareT);
  flF.frequency.exponentialRampToValueAtTime(900, flareT + 0.16);
  flF.frequency.exponentialRampToValueAtTime(330, flareT + 0.55);
  const flAm = ctx.createGain();
  flAm.gain.value = 0;
  const flLfo = ctx.createOscillator();
  flLfo.frequency.setValueAtTime(43, flareT);
  flLfo.frequency.exponentialRampToValueAtTime(90, flareT + 0.16);
  flLfo.frequency.exponentialRampToValueAtTime(45, flareT + 0.55);
  const flD = ctx.createGain();
  flD.gain.value = 0.6;
  flLfo.connect(flD);
  flD.connect(flAm.gain);
  const flG = ctx.createGain();
  flG.gain.value = 0.0001;
  flG.gain.setValueAtTime(0.0001, flareT);
  flG.gain.exponentialRampToValueAtTime(0.3 + growl * 0.08, flareT + 0.1);
  flG.gain.exponentialRampToValueAtTime(0.0001, flareT + 0.55);
  fl.connect(flF);
  flF.connect(flAm);
  flAm.connect(flG);
  flG.connect(dest);
  fl.start(flareT);
  fl.stop(flareT + 0.62);
  flLfo.start(flareT);
  flLfo.stop(flareT + 0.62);
  fl.onended = cleanup(fl, flF, flAm, flG, flLfo, flD);
  return CC_STARTER_SECONDS;
}

/** Key-off: uneven last fires slowing (150/90 rhythm), hiss tails off, pump run-down, settle. */
export function playChronoCoupeShutoff(ctx, dest, params, whiteBuf, pinkBuf) {
  const now = ctx.currentTime + 0.01;
  const growl = clip(num(params?.growl, 0.52));
  let t = now;
  let gap = 0.05;
  const fires = 9;
  for (let i = 0; i < fires; i++) {
    const odd = i % 2 === 0 ? 1.25 : 0.75;
    const fade = 1 - i / (fires + 2);
    thump(ctx, dest, pinkBuf, t, (84 - i * 4) * (0.9 + growl * 0.2), 0.17 * fade * (odd > 1 ? 1.05 : 0.88), 0.07 + i * 0.006, 560 - i * 30);
    t += gap * odd;
    gap *= 1.16;
  }
  // Injection hiss tailing off
  const nz = ctx.createBufferSource();
  nz.buffer = whiteBuf;
  nz.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4800;
  const ng = ctx.createGain();
  env(ng, now, 0.012, 0.01, 0.5);
  nz.connect(hp);
  hp.connect(ng);
  ng.connect(dest);
  nz.start(now);
  nz.stop(now + 0.6);
  nz.onended = cleanup(nz, hp, ng);
  pumpWhir(ctx, dest, now + 0.05, 0.5, 0.02, true);
  // Mount rock + settle
  const sh = now + 0.55;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(44, sh);
  o.frequency.exponentialRampToValueAtTime(30, sh + 0.3);
  const g = ctx.createGain();
  env(g, sh, 0.16, 0.03, 0.3);
  o.connect(g);
  g.connect(dest);
  o.start(sh);
  o.stop(sh + 0.4);
  o.onended = cleanup(o, g);
  thump(ctx, dest, pinkBuf, now + 0.95, 110, 0.09, 0.1, 340);
  return CC_SHUTOFF_SECONDS;
}
