// Quiet Current — shared procedural EV voice (original synthesis, no samples).
// Plain JS so EngineSynthImpl (browser) and the offline renderers (node) run the SAME drive
// model, voice bus and power cues.
//
// Layers (all continuous, all smoothed — no cliffs):
//   motor orders  : 3 sine partials tracking motor speed (+2 brighter partials in Cyber)
//   inverter tone : soft triangle → band-pass whose pitch rises with speed; below ~25 % speed
//                   it glides through gentle switching-carrier steps
//   PWM shimmer   : faint band-limited noise + sidebands around 7.6–8.2 kHz, ~30 dB under
//                   the main tone; everything is low-passed at 9.5 kHz
//   hum           : warm motor / gear hum + a light gear-mesh partial (fades in above ~55 %)
//   low-speed hum : soft two-tone hum that fades out by ~30 km/h
//   road / wind   : pink-noise road + tyre texture and band-passed wind, growing with speed
//   regen         : on lift-off — slightly lower, softer partials with a gentle downward glide
//   reverse       : softer, lower tone
//   cyber (0..1)  : brighter partials, chamfered-steel ring (narrow peaks), tighter response
//   boost (0..1)  : sport-style presence (setPursuitBoost)
// Output: own soft compressor + 9.5 kHz low-pass → dest. Quiet by default.

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

/** Normalized speed 1.0 ≙ 120 mph ≈ 193 km/h (same scale as the other packs). */
export const QC_SPEED_FULL_KPH = 193;
/** Low-speed hum is gone by this road speed (km/h). */
export const QC_LOW_HUM_FADE_KPH = 30;
/** Hard ceiling for all voice content (Hz) — nothing above ~10 kHz. */
export const QC_LOWPASS_HZ = 9500;
/** Low-speed switching-carrier steps (motor-norm width of one step). */
export const QC_CARRIER_STEP = 0.044;

/** Variant name → cyber amount (0 standard · 1 cyber). Numbers are clamped 0..1. */
export function quietCurrentCyberAmount(v) {
  if (v === 'cyber') return 1;
  if (v === 'standard' || v == null) return 0;
  return clip(num(v, 0));
}

/** Main motor-order fundamental (Hz) for motor norm m (0..1). */
export function qcMotorHz(m) {
  return 150 + 1250 * Math.pow(clip(m), 0.92);
}

/** Continuous inverter-tone pitch (Hz) for motor norm m. */
export function qcInverterHz(m) {
  return 560 * Math.pow(2, 2.6 * clip(m));
}

/**
 * Power / rpm limits for the HUD (plausible dual-motor figures). Cyber blends to its own set.
 * Params override: maxPowerKw / maxRegenKw / redlineRpm and cyberMaxPowerKw / cyberMaxRegenKw /
 * cyberRedlineRpm.
 */
export const QC_POWER_DEFAULTS = { maxPowerKw: 300, maxRegenKw: 120, redlineRpm: 18000 };
export const QC_CYBER_POWER_DEFAULTS = { maxPowerKw: 390, maxRegenKw: 150, redlineRpm: 18000 };
export function quietCurrentPowerLimits(params = {}, cyber = 0) {
  const c = clip(num(cyber, 0));
  const pick = (k, ck, d, cd) => lerp(Math.max(1, num(params[k], d)), Math.max(1, num(params[ck], cd)), c);
  return {
    maxPowerKw: pick('maxPowerKw', 'cyberMaxPowerKw', QC_POWER_DEFAULTS.maxPowerKw, QC_CYBER_POWER_DEFAULTS.maxPowerKw),
    maxRegenKw: pick('maxRegenKw', 'cyberMaxRegenKw', QC_POWER_DEFAULTS.maxRegenKw, QC_CYBER_POWER_DEFAULTS.maxRegenKw),
    redlineRpm: pick('redlineRpm', 'cyberRedlineRpm', QC_POWER_DEFAULTS.redlineRpm, QC_CYBER_POWER_DEFAULTS.redlineRpm),
  };
}

export function createQuietCurrentDriveState() {
  return {
    time: 0,
    m: 0,
    m1: 0,
    speed: 0,
    thr: 0,
    regen: 0,
    rev: 0,
    cyber: 0,
    boost: 0,
    stepIdx: 0,
    stepHz: qcInverterHz(QC_CARRIER_STEP / 2),
    glide: 0,
    prevThr: 0,
  };
}

/**
 * One continuous drive step. Frontend rpmNorm wins (motor norm); otherwise motor speed follows
 * road speed (single-speed reduction) with a tiny parked throttle nudge. Returns a plain drive
 * snapshot consumed by QuietCurrentBus.update (all values already smoothed).
 */
export function stepQuietCurrentDrive(state, input, dt, params = {}) {
  const s = state;
  const h = clip(num(dt, 1 / 60), 0, 0.25);
  s.time += h;
  const speed = clip(num(input?.speed, 0));
  const thrRaw = clip(num(input?.throttle, 0));
  const load = clip(num(input?.load, 0), -1, 1);
  const cyberT = clip(num(params.cyber, 0));
  const boostT = clip(num(params.pursuitBoost, 0));
  // Variant / boost changes always crossfade (never a jump)
  s.cyber = lag(s.cyber, cyberT, h, 0.35);
  s.boost = lag(s.boost, boostT, h, 0.3);
  const c = s.cyber;
  // Cyber = tighter, more angular response (shorter lags, straighter presence curve)
  const k = 1 - 0.4 * c;

  const hasNorm = input?.rpmNorm != null && Number.isFinite(input.rpmNorm);
  // Parked throttle nudge fades out continuously by 3 % speed (no switch-over cliff)
  const mT = hasNorm ? clip(input.rpmNorm) : clip(speed + thrRaw * 0.025 * (1 - sstep(speed / 0.03)));
  // Two cascaded lags → S-shaped glides (no slope step even on a hard throttle stab)
  s.m1 = lag(s.m1, mT, h, 0.045 * k);
  s.m = lag(s.m, s.m1, h, 0.045 * k);
  s.speed = lag(s.speed, speed, h, 0.12 * k);
  s.thr = lag(s.thr, thrRaw, h, (thrRaw > s.thr ? 0.13 : 0.2) * k);

  // Regen on lift-off (or Frontend overrun / negative load) while rolling
  const roll = sstep((speed - 0.015) / 0.05);
  let regenT = thrRaw < 0.08 ? roll * (0.35 + 0.65 * sstep(speed / 0.35)) * (1 - thrRaw / 0.08) : 0;
  if (input?.overrun) regenT = Math.max(regenT, 0.9 * roll);
  if (load < 0) regenT = Math.max(regenT, -load * roll);
  s.regen = lag(s.regen, clip(regenT), h, (regenT > s.regen ? 0.18 : 0.3) * k);
  // Downward glide that settles while regen holds (gentle, ~0.5 s)
  s.glide = lag(s.glide, s.regen, h, 0.45 * k);

  const revT = input?.reverse ? 1 : 0;
  s.rev = lag(s.rev, revT, h, 0.3);

  // Low-speed switching-carrier steps (hysteresis so a held speed never flutters)
  const m = s.m;
  const raw = m / QC_CARRIER_STEP;
  if (raw > s.stepIdx + 1.1 || raw < s.stepIdx - 0.1) s.stepIdx = Math.max(0, Math.floor(raw));
  const stepTarget = qcInverterHz((s.stepIdx + 0.5) * QC_CARRIER_STEP);
  s.stepHz = lag(s.stepHz, stepTarget, h, 0.07 * k);
  const stepAmt = 0.85 * (1 - sstep((m - 0.12) / 0.14));

  const kph = s.speed * QC_SPEED_FULL_KPH;
  const presence = Math.pow(clip(s.thr), 1.3 - 0.5 * c);
  // Power / regen (HUD; simulated kW-equivalent, not real vehicle data) from the SAME smoothed throttle + regen state that drives the voice:
  // constant-torque region below ~35 % motor speed, then constant power; regen fades at crawl.
  const lim = quietCurrentPowerLimits(params, c);
  const drivePow = lim.maxPowerKw * clip(s.thr) * Math.min(1, (m + 0.05) / 0.35) * (0.92 + 0.08 * s.boost);
  const regenPow = lim.maxRegenKw * clip(s.regen) * Math.min(1, m / 0.3);
  // Simulated kW-equivalent (not real vehicle data); powerNorm -1..1 for %-only HUDs
  const powerKw = drivePow - regenPow;
  const powerNorm = clip(powerKw >= 0 ? powerKw / lim.maxPowerKw : powerKw / lim.maxRegenKw, -1, 1);
  const regenTone = clip(num(params.regenTone, 0.6));
  // Pitch ratio: regen a touch lower (with glide), reverse lower still
  const ratio = (1 - 0.06 * s.glide * (0.5 + regenTone)) * (1 - 0.16 * s.rev);
  // Settled = every smoothed value has reached its target (callers that only send setDriving
  // on change keep stepping until this is true — see EngineSynthImpl settle loop).
  const e = 1e-3;
  const settled =
    Math.abs(s.m - mT) < e &&
    Math.abs(s.m1 - mT) < e &&
    Math.abs(s.speed - speed) < e &&
    Math.abs(s.thr - thrRaw) < e &&
    Math.abs(s.regen - clip(regenT)) < e &&
    Math.abs(s.glide - s.regen) < e &&
    Math.abs(s.rev - revT) < e &&
    Math.abs(s.cyber - cyberT) < e &&
    Math.abs(s.boost - boostT) < e &&
    Math.abs(s.stepHz - stepTarget) < 0.5;
  return {
    settled,
    m,
    speed: s.speed,
    kph,
    presence,
    regen: s.regen,
    glide: s.glide,
    reverse: s.rev,
    cyber: c,
    boost: s.boost,
    ratio,
    motorHz: qcMotorHz(m) * ratio,
    inverterHz: lerp(qcInverterHz(m), s.stepHz, stepAmt) * ratio,
    stepAmt,
    powerKw,
    powerNorm,
    maxPowerKw: lim.maxPowerKw,
    maxRegenKw: lim.maxRegenKw,
    motorRpm: m * lim.redlineRpm,
    redlineRpm: lim.redlineRpm,
    lowHum: 1 - sstep(kph / QC_LOW_HUM_FADE_KPH),
    mesh: sstep((m - 0.55) / 0.3),
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
export function setQuietCurrentOfflineScheduling(on) {
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

/** Steel-ring modes (Hz) — inharmonic plate ratios, all under the 9.5 kHz ceiling. */
export const QC_STEEL_MODES = [1480, 3390, 6120];

/**
 * Quiet Current voice bus. Everything is generated here (the stock EV graph is not built for
 * this topology).  layers → voice sum → steel peaks → presence → compressor → LP 9.5k → out → dest
 */
export class QuietCurrentBus {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.dest = dest;
    this.nodes = [];
    this.oscs = [];
    const n = (node) => {
      this.nodes.push(node);
      return node;
    };
    const osc = (type, hz) => {
      const o = n(ctx.createOscillator());
      o.type = type;
      o.frequency.value = hz;
      this.oscs.push(o);
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
    const noise = (buf) => {
      const s = n(ctx.createBufferSource());
      s.buffer = buf;
      s.loop = true;
      this.oscs.push(s);
      return s;
    };
    this.pink = makeNoiseBuffer(ctx, 2.5, true);
    this.white = makeNoiseBuffer(ctx, 2, false);

    // ── Sum / colour / safety chain ──
    this.sum = gain(1);
    this.steel = QC_STEEL_MODES.map((hz, i) => {
      const f = filt('peaking', hz, 16 + i * 5);
      f.gain.value = 0;
      return f;
    });
    this.presence = gain(1);
    this.comp = n(ctx.createDynamicsCompressor());
    this.comp.threshold.value = -26;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.3;
    this.lp = filt('lowpass', QC_LOWPASS_HZ, 0.6);
    this.lp2 = filt('lowpass', QC_LOWPASS_HZ + 200, 0.6);
    this.out = gain(2.1);
    let node = this.sum;
    for (const f of this.steel) {
      node.connect(f);
      node = f;
    }
    node.connect(this.presence);
    this.presence.connect(this.comp);
    this.comp.connect(this.lp);
    this.lp.connect(this.lp2);
    this.lp2.connect(this.out);
    this.out.connect(dest);

    // ── Motor orders (whine) ──
    this.whineLp = filt('lowpass', 3200, 0.5);
    this.whineG = gain(0);
    this.partials = [1, 2, 3, 4, 6].map((mult) => {
      const o = osc('sine', 150 * mult);
      const g = gain(0);
      o.connect(g);
      g.connect(this.whineLp);
      return { o, g, mult };
    });
    this.whineLp.connect(this.whineG);
    this.whineG.connect(this.sum);

    // ── Inverter tone (soft triangle, band-passed) + cyber bright partial ──
    this.inv = osc('triangle', 560);
    this.invBp = filt('bandpass', 560, 3);
    this.invG = gain(0);
    this.inv.connect(this.invBp);
    this.invBp.connect(this.invG);
    this.invG.connect(this.sum);
    this.invBright = osc('sawtooth', 560);
    this.invBrightBp = filt('bandpass', 1680, 5);
    this.invBrightG = gain(0);
    this.invBright.connect(this.invBrightBp);
    this.invBrightBp.connect(this.invBrightG);
    this.invBrightG.connect(this.sum);

    // ── PWM shimmer: band-limited noise (random-PWM spread) + carrier sidebands ──
    this.shimSrc = noise(this.white);
    this.shimBp = filt('bandpass', 7600, 5);
    this.shimG = gain(0);
    this.shimSrc.connect(this.shimBp);
    this.shimBp.connect(this.shimG);
    this.shimG.connect(this.sum);
    this.sideA = osc('sine', 7400);
    this.sideB = osc('sine', 7800);
    this.sideG = gain(0);
    this.sideA.connect(this.sideG);
    this.sideB.connect(this.sideG);
    this.sideG.connect(this.sum);

    // ── Warm motor / gear hum + gear-mesh partial ──
    this.hum = osc('sine', 48);
    this.hum2 = osc('triangle', 96);
    this.humLp = filt('lowpass', 420, 0.6);
    this.humG = gain(0);
    this.hum.connect(this.humLp);
    this.hum2.connect(this.humLp);
    this.humLp.connect(this.humG);
    this.humG.connect(this.sum);
    this.mesh = osc('sine', 355);
    this.meshG = gain(0);
    this.mesh.connect(this.meshG);
    this.meshG.connect(this.sum);

    // ── Low-speed hum (soft fifth, fades out by ~30 km/h) ──
    this.lowA = osc('sine', 210);
    this.lowB = osc('sine', 315);
    this.lowG = gain(0);
    this.lowA.connect(this.lowG);
    this.lowB.connect(this.lowG);
    this.lowG.connect(this.sum);

    // ── Road / tyre and wind ──
    this.roadSrc = noise(this.pink);
    this.roadLp = filt('lowpass', 260, 0.7);
    this.roadG = gain(0);
    this.roadSrc.connect(this.roadLp);
    this.roadLp.connect(this.roadG);
    this.roadG.connect(this.sum);
    this.tyreBp = filt('bandpass', 850, 1.1);
    this.tyreG = gain(0);
    this.roadSrc.connect(this.tyreBp);
    this.tyreBp.connect(this.tyreG);
    this.tyreG.connect(this.sum);
    this.windSrc = noise(this.pink);
    this.windBp = filt('bandpass', 700, 0.6);
    this.windG = gain(0);
    this.windSrc.connect(this.windBp);
    this.windBp.connect(this.windG);
    this.windG.connect(this.sum);

    this.started = false;
    this.start();
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const o of this.oscs) {
      try {
        o.start();
      } catch {
        /* ignore */
      }
    }
  }

  /** Continuous morph — call on every setDriving. `drive` = stepQuietCurrentDrive() result. */
  update(params, drive, tc = 0.06) {
    const t = this.ctx.currentTime;
    const p = params || {};
    const m = clip(drive.m);
    const c = clip(drive.cyber);
    const b = clip(drive.boost);
    const pres = clip(drive.presence);
    const rg = clip(drive.regen);
    const rv = clip(drive.reverse);
    const sp = clip(drive.speed);
    const tcv = tc * (1 - 0.4 * c);

    const invAmt = clip(num(p.inverterTone, 0.55));
    const humAmt = clip(num(p.motorHum, 0.5));
    const meshAmt = clip(num(p.gearMesh, 0.35));
    const roadAmt = clip(num(p.roadNoise, 0.45));
    const windAmt = clip(num(p.windNoise, 0.4));
    const steelAmt = clip(num(p.steelRing, 0.6));
    const lowAmt = clip(num(p.lowSpeedHum, 0.5));

    // Main motor-order level: tiny at rest, grows with speed; throttle/boost add presence,
    // regen keeps it present but softer; reverse softer still.
    const base = 0.005 + 0.06 * Math.pow(m, 0.75) * (1 - 0.4 * m * m);
    const drivePres = 0.5 + 0.5 * pres + 0.16 * b;
    const regenSoft = 0.44; // light-cruise ≈ 0.58, full throttle 1.0
    const shape = Math.max(drivePres * (1 - rg * 0.6), regenSoft * rg + (1 - rg) * drivePres);
    const whine = base * shape * (1 - 0.3 * rv);
    setT(this.whineG.gain, whine, t, tcv);
    const f0 = num(drive.motorHz, qcMotorHz(m));
    // Partial weights: regen/reverse soften upper orders; cyber adds 4th/6th; boost adds 2nd
    const soft = 1 - 0.5 * Math.max(rg, rv);
    const w = [1, (0.32 + 0.14 * b + 0.1 * c) * soft, (0.12 + 0.08 * c) * soft, 0.13 * c * soft, 0.06 * c * soft];
    const nyq = this.ctx.sampleRate * 0.45;
    this.partials.forEach((pt, i) => {
      const hz = f0 * pt.mult * (i === 2 ? 1.003 : 1);
      setT(pt.o.frequency, Math.min(nyq, hz), t, tcv);
      setT(pt.g.gain, hz < QC_LOWPASS_HZ ? w[i] : 0, t, tcv);
    });
    setT(
      this.whineLp.frequency,
      Math.min(QC_LOWPASS_HZ, 2400 + m * 2600 + pres * 600 + b * 900 + c * 2200 - rg * 1000 - rv * 900),
      t,
      tcv,
    );

    // Inverter tone (stepped carrier at low speed comes from the drive model, already glided)
    const fi = num(drive.inverterHz, qcInverterHz(m));
    setT(this.inv.frequency, fi, t, tcv);
    setT(this.invBp.frequency, fi, t, tcv);
    setT(this.invBp.Q, 3 + 5 * c, t, tcv);
    const invLevel = invAmt * (0.35 + 0.65 * sstep(m / 0.08)) * (0.006 + 0.012 * (1 - Math.abs(m - 0.3) * 1.2)) * (0.7 + 0.3 * pres + 0.25 * b) * (1 + 0.35 * c) * (1 - 0.3 * rg);
    setT(this.invG.gain, Math.max(0, invLevel), t, tcv);
    setT(this.invBright.frequency, fi, t, tcv);
    setT(this.invBrightBp.frequency, Math.min(QC_LOWPASS_HZ - 500, fi * 3), t, tcv);
    setT(this.invBrightG.gain, Math.max(0, invLevel) * 0.55 * c, t, tcv);

    // PWM shimmer ≈ −30 dB under the main tone; random-PWM spread via the noise band
    const carrier = 7600 + 600 * c;
    const fe = f0 * 0.5;
    setT(this.shimBp.frequency, carrier, t, tcv);
    setT(this.shimG.gain, whine * 0.09 * (0.6 + 0.4 * pres) * (1 + 0.5 * c), t, tcv);
    setT(this.sideA.frequency, Math.max(4000, carrier - 2 * fe), t, tcv);
    setT(this.sideB.frequency, Math.min(QC_LOWPASS_HZ - 300, carrier + 2 * fe), t, tcv);
    setT(this.sideG.gain, whine * 0.022 * (1 + 0.6 * c), t, tcv);

    // Warm hum + gear mesh
    const fh = (46 + m * 190) * num(drive.ratio, 1);
    setT(this.hum.frequency, fh, t, tcv);
    setT(this.hum2.frequency, fh * 2, t, tcv);
    setT(this.humG.gain, humAmt * (0.003 + 0.014 * Math.pow(m, 0.7)) * (0.7 + 0.3 * pres + 0.15 * b) * (1 - 0.2 * rg), t, tcv);
    setT(this.mesh.frequency, Math.min(QC_LOWPASS_HZ - 500, f0 * 2.37), t, tcv);
    const meshLvl = meshAmt * whine * (0.08 + 0.32 * clip(drive.mesh)) * (1 - 0.6 * rv) * (1 + 0.3 * c);
    setT(this.meshG.gain, meshLvl, t, tcv);

    // Low-speed hum
    const lh = clip(drive.lowHum);
    setT(this.lowA.frequency, 210 * (1 + sp * 1.5) * (1 - 0.1 * rv), t, tcv);
    setT(this.lowB.frequency, 315 * (1 + sp * 1.5) * (1 - 0.1 * rv), t, tcv);
    setT(this.lowG.gain, lowAmt * 0.0045 * lh * (0.6 + 0.4 * Math.max(pres, sstep(sp / 0.02))), t, tcv);

    // Road / tyre and wind grow with speed (wind ~ speed²)
    setT(this.roadLp.frequency, 220 + sp * 700, t, tc);
    setT(this.roadG.gain, roadAmt * 0.25 * Math.pow(sp, 1.15) * (1 - 0.25 * sp), t, tc);
    setT(this.tyreBp.frequency, 700 + sp * 500, t, tc);
    setT(this.tyreG.gain, roadAmt * 0.12 * Math.pow(sp, 1.4), t, tc);
    setT(this.windBp.frequency, 650 + sp * 1500, t, tc);
    setT(this.windG.gain, windAmt * 0.36 * Math.pow(sp, 2.3), t, tc);

    // Cyber: chamfered-steel ring — narrow peaks, a touch more with speed/presence; never harsh
    const ring = c * steelAmt * (0.75 + 0.25 * Math.max(m, pres));
    setT(this.steel[0].gain, ring * 8, t, tcv);
    setT(this.steel[1].gain, ring * 6, t, tcv);
    setT(this.steel[2].gain, ring * 4, t, tcv);
    setT(this.steel[0].frequency, QC_STEEL_MODES[0] * (1 + 0.02 * m), t, tcv);

    // Presence: throttle + boost add a little body; cyber trims level so brightness ≠ loudness
    setT(this.presence.gain, (1 + 0.18 * pres + 0.1 * b) * (1 - 0.12 * c), t, tcv);
  }

  dispose() {
    for (const o of this.oscs) {
      try {
        o.stop();
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
    this.oscs = [];
  }
}

// ─── Power cues: soft rising chime-tone (on) and falling tone (off). Cues only. ───

/** Disconnect cue nodes when the last oscillator ends (audio-clock based, offline-safe). */
function cleanupOnEnd(parts, extra) {
  const last = parts.reduce((a, x) => (x.end > a.end ? x : a), parts[0]);
  last.nodes[0].onended = () => {
    for (const x of [...extra, ...parts.flatMap((q) => q.nodes)]) {
      try {
        x.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

function tone(ctx, dest, { t0, f0, f1, glide, attack, hold, release, peak, type = 'sine' }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(f1, t0 + glide);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  o.connect(g);
  g.connect(dest);
  const end = t0 + attack + hold + release + 0.02;
  o.start(t0);
  o.stop(end);
  return { nodes: [o, g], end };
}

export const QC_POWER_ON_SECONDS = 1.5;
export const QC_POWER_OFF_SECONDS = 1.1;

/** Soft rising chime-tone. Cyber adds a faint bright partial. Returns duration (s). */
export function playQuietCurrentPowerOn(ctx, dest, params = {}) {
  const now = ctx.currentTime + 0.01;
  const c = clip(num(params.cyber, 0));
  const lvl = 0.05 * (0.6 + 0.4 * clip(num(params.masterGain, 0.62) / 0.62, 0, 1.3));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200 + 2400 * c;
  lp.Q.value = 0.5;
  lp.connect(dest);
  const parts = [
    tone(ctx, lp, { t0: now, f0: 392, f1: 523.25, glide: 0.42, attack: 0.09, hold: 0.18, release: 0.75, peak: lvl }),
    tone(ctx, lp, { t0: now + 0.22, f0: 659.25, f1: 783.99, glide: 0.3, attack: 0.07, hold: 0.12, release: 0.85, peak: lvl * 0.7 }),
    tone(ctx, lp, { t0: now + 0.22, f0: 1318.5, f1: 1568, glide: 0.3, attack: 0.06, hold: 0.05, release: 0.6, peak: lvl * 0.12 }),
  ];
  if (c > 0.01) {
    parts.push(
      tone(ctx, lp, {
        t0: now + 0.24,
        f0: 2093,
        f1: 2349.3,
        glide: 0.28,
        attack: 0.03,
        hold: 0.02,
        release: 0.7,
        peak: lvl * 0.12 * c,
        type: 'triangle',
      }),
    );
  }
  cleanupOnEnd(parts, [lp]);
  return QC_POWER_ON_SECONDS;
}

/** Soft falling tone (power-off). Returns duration (s). */
export function playQuietCurrentPowerOff(ctx, dest, params = {}) {
  const now = ctx.currentTime + 0.01;
  const c = clip(num(params.cyber, 0));
  const lvl = 0.045 * (0.6 + 0.4 * clip(num(params.masterGain, 0.62) / 0.62, 0, 1.3));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4200 + 2000 * c;
  lp.Q.value = 0.5;
  lp.connect(dest);
  const parts = [
    tone(ctx, lp, { t0: now, f0: 659.25, f1: 329.63, glide: 0.7, attack: 0.06, hold: 0.1, release: 0.8, peak: lvl }),
    tone(ctx, lp, { t0: now + 0.04, f0: 987.77, f1: 493.88, glide: 0.65, attack: 0.05, hold: 0.06, release: 0.6, peak: lvl * 0.35 }),
  ];
  if (c > 0.01) {
    parts.push(
      tone(ctx, lp, { t0: now, f0: 1975.5, f1: 987.77, glide: 0.6, attack: 0.03, hold: 0.02, release: 0.45, peak: lvl * 0.1 * c, type: 'triangle' }),
    );
  }
  cleanupOnEnd(parts, [lp]);
  return QC_POWER_OFF_SECONDS;
}
