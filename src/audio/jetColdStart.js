// Carrier Jet cold start — aircraft systems + switch foley for the Tomcat voice (opt-in).
// 100 % procedural (oscillators, runtime noise, biquads, gain envelopes); no samples, loops,
// wavetables, impulse responses or convolution. Plain JS so the browser engine and the offline
// renders / tests run the SAME model and graph.
//
//   model:  BATT (avionics hum + gyro spin-up) · APU (small turbine: crank → light-off → steady)
//           · AIR CART (external ground air: hiss + turbine whine) · CROSSBLEED (valve + air rush)
//           · SEAT BELT (one soft original two-tone chime) · engines: handled by the TF30 drive
//           model (tomcatColdEngine) — this module only adds the panned start extras
//   foley:  toggle (bat-handle detent snap + spring ring) · guarded (cover: spring snap + hinge /
//           solid clack) · hold (ratchety press) · pull (handle drag + latch release) · AB guard
//   out:    one bus → the Tomcat headroom pad (same master bus / limiter as the engine voice)
//
// Every continuous level moves with setTargetAtTime; every one-shot starts at 0 and ends on an
// exponential tail → no steps, no clicks.

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

/** Switchable systems (Frontend switch ids). */
export const JET_SYSTEMS = [
  'batt',
  'seatbelt',
  'apu',
  'aircart',
  'crossbleed',
  'engL',
  'engR',
  'fuelPumpL',
  'fuelPumpR',
  'ignL',
  'ignR',
  'throttleL',
  'throttleR',
  'avionics',
  'anticollision',
  'navLights',
  'hydraulics',
  'canopy',
  'oxygen',
  'inertialNav',
  'masterCaution',
  'quickStartGuard',
  'quickStart',
  'emergencyStop',
];
/** Momentary push / pull controls: they fire on `true` and spring back (state stays false). */
export const JET_MOMENTARY = ['masterCaution', 'quickStart', 'emergencyStop'];
/** Systems the emergency stop / shutdown cue switch off (throttles, canopy and guards stay put). */
export const JET_POWERED = [
  'engL',
  'engR',
  'fuelPumpL',
  'fuelPumpR',
  'ignL',
  'ignR',
  'apu',
  'aircart',
  'crossbleed',
  'hydraulics',
  'oxygen',
  'inertialNav',
  'avionics',
  'anticollision',
  'navLights',
  'seatbelt',
  'batt',
];
/** Foley / one-shot cues for playJetCue. */
export const JET_CUES = [
  'toggle',
  'guardOpen',
  'guardClose',
  'hold',
  'pull',
  'abGuardOpen',
  'abGuardClose',
  'chime',
  'warning',
  // cockpit display config menu (bezel buttons)
  'bezelPress',
  'cursorStep',
  'selectConfirm',
  'pageChange',
  // throttle detent + the start-checklist pamphlet (paper foley)
  'detent',
  'pamphletLift',
  'pamphletOpen',
  'pamphletClose',
];
/** Switch foley played by setJetSystem by default (override per call or pass foley: false). */
export const JET_DEFAULT_FOLEY = {
  batt: 'toggle',
  seatbelt: 'toggle',
  apu: 'toggle',
  aircart: 'toggle',
  crossbleed: 'toggle',
  engL: 'hold',
  engR: 'hold',
  fuelPumpL: 'toggle',
  fuelPumpR: 'toggle',
  ignL: 'toggle',
  ignR: 'toggle',
  throttleL: 'detent',
  throttleR: 'detent',
  avionics: 'toggle',
  anticollision: 'toggle',
  navLights: 'toggle',
  hydraulics: 'toggle',
  canopy: 'hold',
  oxygen: 'toggle',
  inertialNav: 'toggle',
  masterCaution: 'hold',
  quickStartGuard: 'guardOpen', // guardClose when it closes
  quickStart: 'hold',
  emergencyStop: 'pull',
};
/** Stereo position of each engine's start extras (moderate: left / right engine). */
export const JET_ENGINE_PAN = 0.5;
/** Air cart sits on the right side (it is plugged into the right engine's start duct). */
export const JET_CART_PAN = 0.4;
/** Emergency stop: warning tone first, fuel cut after this many seconds. */
export const JET_ESTOP_DELAY = 0.6;

/* ───────────────────────────── model ───────────────────────────── */

export function createJetColdState() {
  return {
    systems: Object.fromEntries(JET_SYSTEMS.map((k) => [k, false])),
    apuN: 0,
    pumpL: 0,
    pumpR: 0,
    avion: 0,
    oxy: 0,
    ins: 0,
    hyd: 0,
    strobeT: 0,
    apuLit: false,
    cartN: 0,
    cartEng: 0,
    gyro: 0,
    hum: 0,
    xbFlow: 0,
    time: 0,
  };
}

/** Copy of the switch states. */
export function jetSystemsOf(st) {
  return { ...st.systems };
}

/**
 * One model step. `eng`: { n2a, n2b } from the TF30 drive. Returns one-shot events
 * ('apuLightoff'). Permissive: every system does what it is set to; nothing is refused.
 */
export function stepJetCold(st, dt, eng = {}) {
  const step = clip(Number(dt) || 0, 0, 0.25);
  const sys = st.systems;
  const events = [];
  st.time += step;
  // APU: starter crank → light-off ≈ 22 % → accelerates to 100 % (≈ 7 s); off → spool-down ≈ 8 s
  if (sys.apu) {
    if (!st.apuLit) {
      st.apuN = lag(st.apuN, 0.35, step, 2.2);
      if (st.apuN >= 0.22) {
        st.apuLit = true;
        events.push({ type: 'apuLightoff' });
      }
    } else {
      st.apuN = Math.min(1, st.apuN + (0.05 + 0.32 * sstep((st.apuN - 0.2) / 0.45)) * (1 - 0.85 * sstep((st.apuN - 0.8) / 0.2)) * step);
      if (st.apuN > 0.985) st.apuN = lag(st.apuN, 1, step, 0.5);
    }
  } else {
    st.apuLit = false;
    st.apuN = Math.max(0, st.apuN - (st.apuN / 2.6 + 0.008) * step);
  }
  // ground air cart: quick spool, slower run-down
  // ground air cart: its diesel runs up first, then hose pressure builds; off → pressure bleeds off
  st.cartEng = sys.aircart ? lag(st.cartEng, 1, step, 0.5) : lag(st.cartEng, 0, step, 1.2);
  st.cartN = sys.aircart ? lag(st.cartN, st.cartEng > 0.5 ? 1 : 0, step, 1.2) : Math.max(0, st.cartN - (st.cartN / 0.9 + 0.01) * step);
  // battery: avionics hum on/off (fast), gyro spin-up (slow) / wind-down (slower)
  st.hum = sys.batt ? lag(st.hum, 1, step, 0.15) : lag(st.hum, 0, step, 0.35);
  st.gyro = sys.batt ? lag(st.gyro, 1, step, 4) : Math.max(0, st.gyro - (st.gyro / 5 + 0.004) * step);
  // crossbleed air rush: valve open and a source with pressure
  const src = Math.max(clip(((eng.n2a ?? 0) - 0.4) / 0.2), clip(((eng.n2b ?? 0) - 0.4) / 0.2), clip((st.apuN - 0.5) / 0.3), clip((st.cartN - 0.5) / 0.3));
  const xbT = sys.crossbleed ? src : 0;
  st.xbFlow = lag(st.xbFlow, xbT, step, xbT > st.xbFlow ? 0.35 : 0.25);
  // fuel boost pumps, avionics cooling, oxygen regulator, nav platform, engine-driven hydraulics
  st.pumpL = lag(st.pumpL, sys.fuelPumpL ? 1 : 0, step, sys.fuelPumpL ? 0.6 : 0.9);
  st.pumpR = lag(st.pumpR, sys.fuelPumpR ? 1 : 0, step, sys.fuelPumpR ? 0.6 : 0.9);
  st.avion = sys.avionics ? lag(st.avion, 1, step, 1.2) : lag(st.avion, 0, step, 1.6);
  st.oxy = lag(st.oxy, sys.oxygen ? 1 : 0, step, 0.25);
  st.ins = sys.inertialNav ? lag(st.ins, 1, step, 6) : Math.max(0, st.ins - (st.ins / 8 + 0.003) * step);
  const drive = Math.max(clip(((eng.n2a ?? 0) - 0.3) / 0.3), clip(((eng.n2b ?? 0) - 0.3) / 0.3));
  const hydT = sys.hydraulics ? drive : 0;
  st.hyd = lag(st.hyd, hydT, step, hydT > st.hyd ? 1.5 : 0.8);
  // anti-collision flasher relay: a faint tick every 1.1 s while on
  if (sys.anticollision) {
    st.strobeT += step;
    if (st.strobeT >= 1.1) {
      st.strobeT -= 1.1;
      events.push({ type: 'strobe' });
    }
  } else st.strobeT = 0;
  return events;
}

/** APU ready to start an engine (≥ 95 %). */
export const jetApuReady = (st) => st.apuN >= 0.95;
/** Air cart up to pressure. */
export const jetCartReady = (st) => st.cartN >= 0.93;

/**
 * Recommended start sequence (step list run by the engine; each step: { system, on } | { wait } |
 * { until }). 'apu': BATT → APU → SEAT BELT → L ENG → R ENG → APU off.
 * 'groundcart': BATT → AIR CART → SEAT BELT → R ENG → CROSSBLEED → L ENG → CROSSBLEED off → CART off.
 */
export function jetAutoStartSteps(mode = 'apu') {
  if (mode === 'groundcart') {
    return [
      { system: 'batt', on: true },
      { wait: 1.6 },
      { system: 'aircart', on: true },
      { wait: 2.2 },
      { system: 'seatbelt', on: true },
      { until: 'cartReady' },
      { wait: 1.0 },
      { system: 'engR', on: true },
      { until: 'engRRun' },
      { wait: 1.2 },
      { system: 'crossbleed', on: true },
      { wait: 1.2 },
      { system: 'engL', on: true },
      { until: 'engLRun' },
      { wait: 1.5 },
      { system: 'crossbleed', on: false },
      { wait: 1.0 },
      { system: 'aircart', on: false },
    ];
  }
  return [
    { system: 'batt', on: true },
    { wait: 1.6 },
    { system: 'apu', on: true },
    { wait: 2.4 },
    { system: 'seatbelt', on: true },
    { until: 'apuReady' },
    { wait: 1.0 },
    { system: 'engL', on: true },
    { until: 'engLRun' },
    { wait: 1.2 },
    { system: 'engR', on: true },
    { until: 'engRRun' },
    { wait: 2.0 },
    { system: 'apu', on: false },
  ];
}

/* ───────────────────────────── voice ───────────────────────────── */

function setT(param, value, t, tc) {
  if (!Number.isFinite(value)) return;
  try {
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, tc);
  } catch {
    param.value = value;
  }
}

/** Overall trim of the cold-start bus (calibrated against the Tomcat idle level). */
export const JET_COLD_TRIM = 1;
/** Layer levels (linear, into the Tomcat pad). Foley and the chime stay well under a car alert. */
export const JET_COLD_LEVEL = {
  hum: 0.0045,
  fan: 0.012,
  gyro: 0.0045,
  apuWhine: 0.011,
  apuRoar: 0.11,
  apuRumble: 0.09,
  cartRoar: 0.12, // broadband high-pressure hose roar (noisy, not tonal)
  cartHiss: 0.05, // hose hiss top
  cartWhine: 0.0015, // barely-there cart compressor tone
  cartChug: 0.11, // distant diesel chug (pulsed low end)
  cartRumble: 0.05,
  xbRush: 0.11,
  duct: 0.045,
  foley: 0.55,
  chime: 0.035,
  warning: 0.032,
  pump: 0.006,
  pumpAir: 0.012,
  avHum: 0.0028,
  avFan: 0.011,
  oxy: 0.006,
  ins: 0.0035,
  hydWhine: 0.0065,
  hydFlow: 0.02,
};

export class JetColdStartVoice {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} dest the Tomcat headroom pad (→ engine master → limiter)
   * @param {{ whiteBuf?: AudioBuffer, pinkBuf?: AudioBuffer }} [opts] runtime-generated noise
   */
  constructor(ctx, dest, opts = {}) {
    this.ctx = ctx;
    this.nodes = [];
    this.sources = [];
    this.disposed = false;
    const L = JET_COLD_LEVEL;
    this.white = opts.whiteBuf ?? this.makeNoise(2, false);
    this.pink = opts.pinkBuf ?? this.makeNoise(2, true);
    const t0 = ctx.currentTime;
    const gain = (v, to) => {
      const g = this.n(ctx.createGain());
      g.gain.value = v;
      if (to) g.connect(to);
      return g;
    };
    const filt = (type, f, q, to) => {
      const b = this.n(ctx.createBiquadFilter());
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      if (to) b.connect(to);
      return b;
    };
    const osc = (type, f, to) => {
      const o = this.n(ctx.createOscillator());
      o.type = type;
      o.frequency.value = f;
      if (to) o.connect(to);
      o.start(t0);
      this.sources.push(o);
      return o;
    };
    const noise = (buf, off) => {
      const s = this.n(ctx.createBufferSource());
      s.buffer = buf;
      s.loop = true;
      s.start(t0, off % (buf.duration || 2));
      this.sources.push(s);
      return s;
    };
    const pan = (p, to) => {
      const s = this.n(ctx.createStereoPanner());
      s.pan.value = p;
      s.connect(to);
      return s;
    };

    this.out = gain(JET_COLD_TRIM, dest);
    // 30 Hz high-pass on the whole bus: no DC / infrasonic from the low thumps
    this.hp = filt('highpass', 30, 0.707, this.out);
    this.bus = gain(1, this.hp);
    this.foley = gain(L.foley, this.bus);
    this.whiteN = noise(this.white, 0.37);
    this.pinkN = noise(this.pink, 0.81);
    this.pinkN2 = noise(this.pink, 1.43);

    // ── BATT: 400 Hz avionics hum (+ harmonics), cooling-fan air, gyro whir (spin-up glide)
    this.hum = gain(0, this.bus);
    const humLp = filt('lowpass', 1800, 0.7, this.hum);
    osc('sine', 400, humLp);
    osc('sine', 800, gain(0.32, humLp));
    osc('triangle', 1200, gain(0.1, humLp));
    this.fan = gain(0, this.bus);
    this.pinkN.connect(filt('bandpass', 2300, 1.1, this.fan));
    this.gyro = gain(0, this.bus);
    this.gyroOsc = osc('sine', 1, this.gyro);
    this.gyroOsc2 = osc('sine', 1, gain(0.3, this.gyro));

    // ── APU: small turbine whine (two blade tones + shaft), combustion roar band, low rumble
    this.apuBus = gain(1, pan(0.08, this.bus));
    this.apuW1 = gain(0, this.apuBus);
    this.apuO1 = osc('sine', 1, this.apuW1);
    this.apuW2 = gain(0, this.apuBus);
    this.apuO2 = osc('sine', 1, this.apuW2);
    this.apuShaft = gain(0, this.apuBus);
    this.apuO3 = osc('triangle', 1, filt('lowpass', 900, 0.7, this.apuShaft));
    this.apuRoar = gain(0, this.apuBus);
    this.apuRoarBp = filt('bandpass', 400, 0.9, this.apuRoar);
    this.pinkN2.connect(this.apuRoarBp);
    this.apuRumble = gain(0, this.apuBus);
    this.pinkN.connect(filt('lowpass', 140, 0.7, this.apuRumble));

    // ── AIR CART (right side, external): distant diesel chug + broadband high-pressure hose roar.
    // Deliberately noisy and untonal — the APU is the tonal small-turbine whine.
    this.cartBus = gain(1, pan(JET_CART_PAN, this.bus));
    // hose roar: wide band (≈ 0.5–6 kHz) of white noise + a hiss top
    this.cartRoar = gain(0, this.cartBus);
    this.cartRoarBp = filt('bandpass', 1800, 0.35, this.cartRoar);
    this.whiteN.connect(filt('lowpass', 6500, 0.6, this.cartRoarBp));
    this.cartHiss = gain(0, this.cartBus);
    this.cartHissHp = filt('highpass', 4200, 0.7, this.cartHiss);
    this.pinkN2.connect(this.cartHissHp);
    this.cartW = gain(0, this.cartBus);
    this.cartO1 = osc('sine', 1, this.cartW);
    this.cartO2 = osc('sine', 1, gain(0.5, this.cartW));
    // diesel: low saw at 3 × firing rate + pulsed low noise, both softened (distant: LP ≈ 700 Hz)
    this.cartFar = filt('lowpass', 700, 0.6, pan(JET_CART_PAN + 0.15, this.bus));
    this.cartChug = gain(0, this.cartFar);
    const chugAm = gain(0.5, this.cartChug);
    this.cartFire = osc('square', 12.5, null); // firing pulse (≈ 750 rpm idle feel)
    const fireLp = filt('lowpass', 45, 0.7, gain(0.5, chugAm.gain));
    this.cartFire.connect(fireLp);
    this.pinkN.connect(filt('lowpass', 220, 0.8, chugAm));
    this.cartBody = osc('sawtooth', 37.5, filt('lowpass', 160, 0.9, gain(0.35, chugAm)));
    this.cartRumble = gain(0, this.cartFar);
    this.pinkN2.connect(filt('lowpass', 110, 0.7, this.cartRumble));

    // ── CROSSBLEED air rush (centre duct)
    this.xb = gain(0, this.bus);
    this.xbBp = filt('bandpass', 1100, 0.7, this.xb);
    this.pinkN.connect(this.xbBp);

    // ── per-engine start-duct air rush (panned left / right)
    this.ducts = [-JET_ENGINE_PAN, JET_ENGINE_PAN].map((p, i) => {
      const g = gain(0, pan(p, this.bus));
      const bp = filt('bandpass', 1400, 0.8, g);
      (i ? this.pinkN2 : this.pinkN).connect(bp);
      return { g, bp };
    });

    // ── fuel boost pumps (L / R): motor whir (saw → LP) + fuel flow band
    this.pumps = [-JET_ENGINE_PAN, JET_ENGINE_PAN].map((p, i) => {
      const bus = gain(0, pan(p * 0.8, this.bus));
      const o = osc('sawtooth', i ? 186 : 178, filt('lowpass', 700, 0.7, gain(L.pump, bus)));
      const air = gain(L.pumpAir, bus);
      (i ? this.pinkN : this.pinkN2).connect(filt('bandpass', i ? 930 : 870, 1.4, air));
      return { bus, o };
    });
    // ── avionics (separate from BATT): cooling fan air + 1.2 kHz power hum + faint inverter tone
    this.avBus = gain(0, this.bus);
    const avHum = gain(L.avHum, this.avBus);
    osc('sine', 1200, avHum);
    osc('sine', 3900, gain(0.18, avHum));
    this.avFan = gain(L.avFan, this.avBus);
    this.pinkN2.connect(filt('bandpass', 3100, 1.0, this.avFan));
    this.avFanOsc = osc('triangle', 1, gain(L.avHum * 0.6, this.avBus)); // fan blade tone (spins up)
    // ── oxygen regulator: soft hiss with a slow breathing swell
    this.oxy = gain(0, this.bus);
    const oxyAm = gain(0.65, this.oxy);
    this.whiteN.connect(filt('bandpass', 4800, 0.9, filt('lowpass', 7000, 0.7, oxyAm)));
    osc('sine', 0.22, gain(0.35, oxyAm.gain));
    // ── inertial nav platform: gyro whir spinning up (two beating tones)
    this.ins = gain(0, this.bus);
    this.insO1 = osc('sine', 1, this.ins);
    this.insO2 = osc('sine', 1, gain(0.6, this.ins));
    // ── hydraulics (engine-driven pump): whine rising with pressure + flow hiss while it builds
    this.hyd = gain(0, this.bus);
    this.hydO1 = osc('triangle', 1, filt('lowpass', 2400, 0.7, this.hyd));
    this.hydO2 = osc('sine', 1, gain(0.3, this.hyd));
    this.hydFlow = gain(0, this.bus);
    this.pinkN.connect(filt('bandpass', 1700, 1.2, this.hydFlow));
    this.last = null;
  }

  n(node) {
    this.nodes.push(node);
    return node;
  }

  makeNoise(seconds, pink) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) d[i] = w;
      else {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    return buf;
  }

  /**
   * Continuous layers from the systems model + engine starter states.
   * eng: { starterA, starterB, n2a, n2b }.
   */
  update(st, eng = {}, when) {
    if (this.disposed) return;
    const t = when ?? this.ctx.currentTime;
    const L = JET_COLD_LEVEL;
    const g = 0.05;
    setT(this.hum.gain, L.hum * st.hum, t, g);
    setT(this.fan.gain, L.fan * st.hum * (0.4 + 0.6 * st.gyro), t, 0.3);
    setT(this.gyro.gain, L.gyro * Math.pow(st.gyro, 0.7), t, g);
    setT(this.gyroOsc.frequency, 18 + 362 * st.gyro, t, g);
    setT(this.gyroOsc2.frequency, 2 * (18 + 362 * st.gyro) * 1.003, t, g);
    const a = st.apuN;
    const lit = st.apuLit ? 1 : 0;
    setT(this.apuW1.gain, L.apuWhine * Math.pow(a, 1.4), t, g);
    setT(this.apuO1.frequency, 1 + 1180 * a, t, g);
    setT(this.apuW2.gain, L.apuWhine * 0.45 * Math.pow(a, 1.8), t, g);
    setT(this.apuO2.frequency, 1 + 2950 * a, t, g);
    setT(this.apuShaft.gain, L.apuWhine * 0.6 * a, t, g);
    setT(this.apuO3.frequency, 1 + 410 * a, t, g);
    // the roar opens after light-off (combustion), cranking is only air
    const roar = a * (0.25 + 0.75 * lit * sstep((a - 0.2) / 0.3));
    setT(this.apuRoar.gain, L.apuRoar * roar, t, 0.12);
    setT(this.apuRoarBp.frequency, 320 + 1300 * a, t, g);
    setT(this.apuRumble.gain, L.apuRumble * roar * a, t, 0.15);
    const c = st.cartN;
    const ce = st.cartEng ?? 0;
    setT(this.cartRoar.gain, L.cartRoar * Math.pow(c, 1.4), t, g);
    setT(this.cartRoarBp.frequency, 900 + 1300 * c, t, g);
    setT(this.cartHiss.gain, L.cartHiss * Math.pow(c, 1.6), t, g);
    setT(this.cartW.gain, L.cartWhine * Math.pow(c, 1.5), t, g);
    setT(this.cartO1.frequency, 1 + 1150 * c, t, g);
    setT(this.cartO2.frequency, 1 + 2600 * c, t, g);
    // the diesel loads up as it makes air: firing rate 10.5 → 14 Hz, body follows
    setT(this.cartChug.gain, L.cartChug * ce, t, 0.12);
    setT(this.cartFire.frequency, 10.5 + 3.5 * c, t, 0.3);
    setT(this.cartBody.frequency, 3 * (10.5 + 3.5 * c), t, 0.3);
    setT(this.cartRumble.gain, L.cartRumble * ce, t, 0.15);
    setT(this.xb.gain, L.xbRush * st.xbFlow, t, 0.08);
    setT(this.xbBp.frequency, 800 + 600 * st.xbFlow, t, g);
    const starters = [clip(eng.starterA ?? 0), clip(eng.starterB ?? 0)];
    const n2 = [eng.n2a ?? 0, eng.n2b ?? 0];
    for (let i = 0; i < 2; i++) {
      setT(this.ducts[i].g.gain, L.duct * starters[i], t, 0.08);
      setT(this.ducts[i].bp.frequency, 900 + 2200 * clip(n2[i] / 0.45), t, g);
    }
    const pumps = [st.pumpL ?? 0, st.pumpR ?? 0];
    for (let i = 0; i < 2; i++) {
      setT(this.pumps[i].bus.gain, Math.pow(pumps[i], 1.3), t, g);
      setT(this.pumps[i].o.frequency, 40 + (i ? 146 : 138) * pumps[i], t, g);
    }
    const av = st.avion ?? 0;
    setT(this.avBus.gain, av, t, g);
    setT(this.avFanOsc.frequency, 1 + 610 * av, t, g);
    setT(this.oxy.gain, L.oxy * (st.oxy ?? 0), t, g);
    const ins = st.ins ?? 0;
    setT(this.ins.gain, L.ins * Math.pow(ins, 0.8), t, g);
    setT(this.insO1.frequency, 12 + 610 * ins, t, g);
    setT(this.insO2.frequency, (12 + 610 * ins) * 1.5 + 0.7, t, g);
    const hyd = st.hyd ?? 0;
    setT(this.hyd.gain, L.hydWhine * hyd, t, 0.1);
    setT(this.hydO1.frequency, 1 + 380 + 260 * hyd, t, g);
    setT(this.hydO2.frequency, 2 * (1 + 380 + 260 * hyd), t, g);
    // flow hiss while pressure is building (rate), small steady trickle after
    const rate = clip(((hyd - (this._hydPrev ?? hyd)) / Math.max(1e-3, t - (this._hydT ?? t - 0.05))) * 1.2);
    this._hydPrev = hyd;
    this._hydT = t;
    setT(this.hydFlow.gain, L.hydFlow * (0.6 * rate + 0.12 * hyd), t, 0.15);
    this.last = st;
  }

  /* ── one-shot builders (start at 0, exponential tail, sources stop after the tail) ── */

  /** Filtered noise burst. o: { hz, q, type, peak, a, d, pan, pink, sweepTo, sweepT } */
  burst(t, o) {
    const ctx = this.ctx;
    try {
      const src = ctx.createBufferSource();
      const buf = o.pink ? this.pink : this.white;
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = o.type ?? 'bandpass';
      f.frequency.setValueAtTime(o.hz, t);
      if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + (o.sweepT ?? o.a));
      f.Q.value = o.q ?? 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      const a = o.a ?? 0.001;
      const d = o.d ?? 0.01;
      g.gain.linearRampToValueAtTime(o.peak, t + a);
      g.gain.setTargetAtTime(0, t + a, d);
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan ?? 0;
      src.connect(f);
      f.connect(g);
      g.connect(p);
      p.connect(o.to ?? this.foley);
      const len = a + d * 11;
      src.start(t, Math.random() * Math.max(0.01, buf.duration - len - 0.05));
      src.stop(t + len);
      src.onended = () => {
        for (const n of [src, f, g, p]) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
    } catch {
      /* never block the drive path */
    }
  }

  /** Damped tone. o: { hz, toHz, peak, a, d, pan, type } */
  ping(t, o) {
    const ctx = this.ctx;
    try {
      const os = ctx.createOscillator();
      os.type = o.type ?? 'sine';
      os.frequency.setValueAtTime(o.hz, t);
      const a = o.a ?? 0.001;
      const d = o.d ?? 0.02;
      if (o.toHz) os.frequency.exponentialRampToValueAtTime(o.toHz, t + a + d * 3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.peak, t + a);
      g.gain.setTargetAtTime(0, t + a, d);
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan ?? 0;
      os.connect(g);
      g.connect(p);
      p.connect(o.to ?? this.foley);
      os.start(t);
      os.stop(t + a + d * 11);
      os.onended = () => {
        for (const n of [os, g, p]) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
    } catch {
      /* ignore */
    }
  }

  /** Held tone with linear attack / release (chime partials, warning pulses). */
  tone(t, o) {
    const ctx = this.ctx;
    try {
      const os = ctx.createOscillator();
      os.type = o.type ?? 'sine';
      os.frequency.value = o.hz;
      const g = ctx.createGain();
      const a = o.a ?? 0.006;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.peak, t + a);
      let end;
      if (o.hold !== undefined) {
        g.gain.setValueAtTime(o.peak, t + a + o.hold);
        g.gain.linearRampToValueAtTime(0, t + a + o.hold + (o.r ?? 0.03));
        end = t + a + o.hold + (o.r ?? 0.03) + 0.01;
      } else {
        g.gain.setTargetAtTime(0, t + a, o.d ?? 0.3);
        end = t + a + (o.d ?? 0.3) * 11;
      }
      let last = g;
      let lp;
      if (o.lp) {
        lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = o.lp;
        g.connect(lp);
        last = lp;
      }
      os.connect(g);
      last.connect(o.to ?? this.bus);
      os.start(t);
      os.stop(end);
      os.onended = () => {
        for (const n of [os, g, lp]) {
          try {
            n?.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
    } catch {
      /* ignore */
    }
  }

  /** Switch foley + system one-shots. Returns false for an unknown cue. */
  cue(name, opts = {}) {
    if (this.disposed) return false;
    const t = (opts.when ?? this.ctx.currentTime) + 0.005;
    const pan = clip(Number(opts.pan) || 0, -1, 1);
    const s = clip(opts.level ?? 1, 0, 2);
    const B = (dt, o) => this.burst(t + dt, { pan, ...o, peak: o.peak * s });
    const P = (dt, o) => this.ping(t + dt, { pan, ...o, peak: o.peak * s });
    switch (name) {
      case 'toggle':
        // bat-handle toggle: lever pre-click, over-centre detent snap, body knock, tiny spring ring
        B(0, { hz: 2600, q: 1.4, peak: 0.07, a: 0.0008, d: 0.0018 });
        B(0.011, { hz: 3500, q: 1.1, peak: 0.2, a: 0.0005, d: 0.0035 });
        B(0.011, { hz: 950, q: 1.6, peak: 0.12, a: 0.0008, d: 0.008 });
        P(0.011, { hz: 180, peak: 0.025, a: 0.001, d: 0.012 });
        P(0.012, { hz: 4180, peak: 0.009, a: 0.0005, d: 0.05 });
        P(0.012, { hz: 5470, peak: 0.005, a: 0.0005, d: 0.032 });
        return true;
      case 'guardOpen':
      case 'abGuardOpen': {
        // cover lift: hinge creak, then the spring-loaded cover snaps open against its stop
        const k = name === 'abGuardOpen' ? 0.86 : 1;
        B(0, { hz: 1650 * k, q: 7, peak: 0.035, a: 0.03, d: 0.018, sweepTo: 1900 * k, sweepT: 0.05 });
        B(0.075, { hz: 2700 * k, q: 1.2, peak: 0.2, a: 0.0005, d: 0.003 });
        B(0.075, { hz: 720 * k, q: 1.3, peak: 0.13, a: 0.0008, d: 0.01 });
        P(0.076, { hz: 3300 * k, peak: 0.011, a: 0.0005, d: 0.085 });
        P(0.076, { hz: 2210 * k, peak: 0.007, a: 0.0005, d: 0.06 });
        return true;
      }
      case 'guardClose':
      case 'abGuardClose': {
        // cover close: solid clack, damped body, short thunk (no ring)
        const k = name === 'abGuardClose' ? 0.86 : 1;
        B(0, { hz: 1450 * k, q: 1.0, peak: 0.26, a: 0.0005, d: 0.0055 });
        B(0, { hz: 460 * k, q: 1.2, peak: 0.2, a: 0.0008, d: 0.013 });
        P(0.001, { hz: 190 * k, peak: 0.045, a: 0.001, d: 0.018 });
        return true;
      }
      case 'hold':
        // ratchety press: four pawl clicks, then the button bottoms out
        for (let k = 0; k < 4; k++) B(k * 0.021, { hz: 2300 - 120 * k, q: 2, peak: 0.085 * (1 - 0.1 * k), a: 0.0005, d: 0.0018 });
        B(0.1, { hz: 620, q: 1.2, peak: 0.15, a: 0.0008, d: 0.011 });
        P(0.1, { hz: 210, peak: 0.028, a: 0.001, d: 0.018 });
        return true;
      case 'pull':
        // T-handle pull: handle drag (rising scrape), latch release snap + metallic ring + thunk
        B(0, { hz: 1150, q: 2.5, peak: 0.045, a: 0.12, d: 0.04, sweepTo: 1900, sweepT: 0.16 });
        B(0.02, { hz: 380, q: 1, peak: 0.03, a: 0.1, d: 0.04, pink: true });
        B(0.19, { hz: 3100, q: 1.3, peak: 0.24, a: 0.0005, d: 0.003 });
        P(0.19, { hz: 2650, peak: 0.012, a: 0.0005, d: 0.11 });
        P(0.19, { hz: 3920, peak: 0.007, a: 0.0005, d: 0.075 });
        P(0.191, { hz: 230, peak: 0.045, a: 0.001, d: 0.022 });
        return true;
      case 'relay':
        // battery bus contactor: low clunk + contact tick
        P(0, { hz: 95, toHz: 70, peak: 0.06, a: 0.002, d: 0.03 });
        B(0, { hz: 820, q: 1, peak: 0.16, a: 0.0008, d: 0.008 });
        B(0.004, { hz: 2400, q: 2, peak: 0.05, a: 0.0005, d: 0.002 });
        return true;
      case 'hoseConnect':
        // hose coupling clunk onto the start duct + a short pressure spit
        P(0, { hz: 78, toHz: 55, peak: 0.075, a: 0.002, d: 0.045 });
        B(0, { hz: 620, q: 0.9, peak: 0.24, a: 0.0008, d: 0.016 });
        P(0.001, { hz: 2050, peak: 0.009, a: 0.0005, d: 0.1 });
        B(0.03, { hz: 2600, q: 0.5, peak: 0.1, a: 0.01, d: 0.07 });
        return true;
      case 'hoseRelease':
        // cart disconnect: pressure dump hiss (broadband, falling) then the coupling clunk
        B(0, { hz: 3000, q: 0.4, peak: 0.22, a: 0.015, d: 0.28, sweepTo: 1200, sweepT: 0.8 });
        P(0.55, { hz: 72, toHz: 52, peak: 0.08, a: 0.002, d: 0.05 });
        B(0.55, { hz: 560, q: 0.9, peak: 0.26, a: 0.0008, d: 0.018 });
        P(0.551, { hz: 1870, peak: 0.011, a: 0.0005, d: 0.13 });
        B(0.64, { hz: 1200, q: 1.5, peak: 0.07, a: 0.0005, d: 0.006 });
        return true;
      case 'cartClunk':
        // air cart hose disconnect: heavy coupling clunk, short metallic ring, rattle
        P(0, { hz: 72, toHz: 52, peak: 0.08, a: 0.002, d: 0.05 });
        B(0, { hz: 560, q: 0.9, peak: 0.26, a: 0.0008, d: 0.018 });
        P(0.001, { hz: 1870, peak: 0.011, a: 0.0005, d: 0.13 });
        B(0.09, { hz: 1200, q: 1.5, peak: 0.07, a: 0.0005, d: 0.006 });
        B(0.012, { hz: 1500, q: 0.6, peak: 0.06, a: 0.01, d: 0.12, pink: true });
        return true;
      case 'xbValve':
        // crossbleed valve: motor-driven butterfly thunk, then a short air surge
        P(0, { hz: 82, toHz: 60, peak: 0.065, a: 0.002, d: 0.04 });
        B(0, { hz: 380, q: 1, peak: 0.18, a: 0.0008, d: 0.016 });
        // the valve cracks open: an obvious air rush swell (the steady rush follows the flow)
        B(0.02, { hz: 1300, q: 0.45, peak: 0.3 * (opts.down ? 0.3 : 1), a: 0.18, d: 0.35 });
        return true;
      case 'apuLightoff':
        P(0, { hz: 62, toHz: 40, peak: 0.05, a: 0.01, d: 0.09 });
        B(0, { hz: 260, q: 0.7, type: 'lowpass', peak: 0.12, a: 0.02, d: 0.08, pink: true });
        return true;
      case 'lightoff':
        // engine light-off thump on that engine's side
        P(0, { hz: 48, toHz: 30, peak: 0.1, a: 0.05, d: 0.2 });
        B(0, { hz: 140, q: 0.7, type: 'lowpass', peak: 0.32, a: 0.05, d: 0.18, pink: true });
        return true;
      case 'igniter':
        // high-energy igniter snap on that engine's side
        B(0, { hz: 5200, q: 1.2, peak: 0.16, a: 0.0005, d: 0.0025 });
        B(0, { hz: 2600, q: 1.5, peak: 0.05, a: 0.0005, d: 0.004 });
        return true;
      case 'bezelPress':
        // display bezel pushbutton: firm rubber-dome press onto a metal snap, short release tick
        B(0, { hz: 1800, q: 1.3, peak: 0.11, a: 0.0006, d: 0.0028 });
        B(0.004, { hz: 520, q: 1.1, peak: 0.11, a: 0.0008, d: 0.011 });
        P(0.004, { hz: 150, peak: 0.018, a: 0.001, d: 0.014 });
        B(0.075, { hz: 2400, q: 1.5, peak: 0.045, a: 0.0005, d: 0.002 });
        return true;
      case 'cursorStep':
        // menu cursor up / down: very short soft tick
        B(0, { hz: 4200, q: 2, peak: 0.045, a: 0.0005, d: 0.0014 });
        return true;
      case 'selectConfirm':
        // original low two-note acknowledge: E4 → A4, short, soft triangle
        [329.6, 440].forEach((hz, k) =>
          this.tone(t + k * 0.085, { hz, type: 'triangle', peak: 0.022 * s, a: 0.006, hold: 0.05, r: 0.035, lp: 1800 }),
        );
        return true;
      case 'pageChange':
        // display page flip: small relay pair + a faint display refresh hiss
        B(0, { hz: 1100, q: 1.2, peak: 0.075, a: 0.0006, d: 0.0045 });
        B(0.018, { hz: 1600, q: 1.4, peak: 0.055, a: 0.0006, d: 0.0035 });
        B(0, { hz: 6000, q: 0.8, peak: 0.014, a: 0.01, d: 0.03 });
        return true;
      case 'detent':
        // throttle quadrant: short slide, then the cutoff → idle detent click (heavier back to cutoff)
        B(0, { hz: 820, q: 1.6, peak: 0.05, a: 0.03, d: 0.02, pink: true });
        B(0.045, { hz: opts.down ? 2300 : 2900, q: 1.3, peak: 0.18, a: 0.0005, d: 0.003 });
        B(0.045, { hz: opts.down ? 480 : 620, q: 1.2, peak: opts.down ? 0.16 : 0.12, a: 0.0008, d: 0.012 });
        P(0.046, { hz: opts.down ? 150 : 190, peak: 0.03, a: 0.001, d: 0.016 });
        return true;
      case 'pamphletLift':
        // checklist card lifted from its holder: soft paper swish
        B(0, { hz: 2600, q: 0.6, peak: 0.05, a: 0.06, d: 0.05, pink: true });
        B(0.02, { hz: 5200, q: 0.8, peak: 0.018, a: 0.04, d: 0.03 });
        return true;
      case 'pamphletOpen':
        // fold opened: two page swishes + a few tiny crinkle grains
        B(0, { hz: 2200, q: 0.6, peak: 0.055, a: 0.07, d: 0.06, pink: true });
        B(0.16, { hz: 3000, q: 0.6, peak: 0.045, a: 0.06, d: 0.05, pink: true });
        for (let k = 0; k < 4; k++) B(0.05 + k * 0.045, { hz: 6200 - 300 * k, q: 1.5, peak: 0.02, a: 0.0006, d: 0.003 });
        return true;
      case 'pamphletClose':
        // folded shut: swish then a soft paper pat
        B(0, { hz: 2400, q: 0.6, peak: 0.05, a: 0.05, d: 0.05, pink: true });
        B(0.12, { hz: 420, q: 0.8, peak: 0.07, a: 0.002, d: 0.012, pink: true });
        B(0.12, { hz: 3200, q: 1, peak: 0.02, a: 0.0008, d: 0.004 });
        return true;
      case 'igniterArm':
        // igniter arm: relay click + exciter charging whine (rises, fades)
        B(0, { hz: 1500, q: 1.3, peak: 0.08, a: 0.0006, d: 0.004 });
        this.tone(t + 0.01, { hz: 6200, peak: 0.0035 * s, a: 0.12, d: 0.12 });
        this.tone(t + 0.01, { hz: 3100, peak: 0.0025 * s, a: 0.1, d: 0.1 });
        return true;
      case 'relayTick':
        // soft light relay tick
        B(0, { hz: 2100, q: 1.6, peak: 0.05, a: 0.0005, d: 0.0025 });
        B(0.001, { hz: 700, q: 1.2, peak: 0.03, a: 0.0006, d: 0.005 });
        return true;
      case 'strobe':
        // anti-collision flasher relay (very faint)
        B(0, { hz: 1900, q: 2, peak: 0.018, a: 0.0005, d: 0.002 });
        return true;
      case 'valveClick':
        P(0, { hz: 120, peak: 0.03, a: 0.002, d: 0.02 });
        B(0, { hz: 900, q: 1.2, peak: 0.08, a: 0.0008, d: 0.008 });
        return true;
      case 'cautionReset':
        // original short reset tone: one soft rounded blip with a small upward bend
        this.tone(t + 0.02, { hz: 587, type: 'triangle', peak: 0.02 * s, a: 0.006, hold: 0.06, r: 0.04, lp: 1600 });
        this.tone(t + 0.1, { hz: 784, type: 'triangle', peak: 0.012 * s, a: 0.006, hold: 0.03, r: 0.05, lp: 1600 });
        return true;
      case 'canopy':
        this.canopy(t, !opts.down, s);
        return true;
      case 'chime':
        this.chime(t, opts.down ? -1 : 1, s);
        return true;
      case 'warning':
        this.warning(t, s);
        return true;
      default:
        return false;
    }
  }

  /**
   * Original soft two-tone chime: a rising fourth (F5 → B♭5) of mallet-like tones (fundamental +
   * soft octave + faint inharmonic overtone), quick attack, ≈ 1 s ring. `dir` -1 = falling (off).
   */
  chime(t, dir = 1, s = 1) {
    const L = JET_COLD_LEVEL.chime * s * (dir < 0 ? 0.6 : 1);
    const f = dir < 0 ? [932.3, 698.5] : [698.5, 932.3];
    f.forEach((hz, k) => {
      const tk = t + k * 0.34;
      this.tone(tk, { hz, peak: L, a: 0.006, d: 0.34 });
      this.tone(tk, { hz: hz * 2.0, peak: L * 0.16, a: 0.004, d: 0.16 });
      this.tone(tk, { hz: hz * 4.16, peak: L * 0.035, a: 0.003, d: 0.05 });
    });
  }

  /**
   * Canopy actuator run (≈ 3.2 s): motor whir (saw → LP) with a slow pitch rise and a gear-train
   * buzz, then the latch thunk (closing) or a softer end-stop knock (opening).
   */
  canopy(t, closing = true, s = 1) {
    const ctx = this.ctx;
    const run = 3.2;
    try {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t);
      o.frequency.linearRampToValueAtTime(closing ? 128 : 118, t + 0.4);
      o.frequency.linearRampToValueAtTime(closing ? 136 : 124, t + run);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018 * s, t + 0.25);
      g.gain.setValueAtTime(0.018 * s, t + run - 0.2);
      g.gain.linearRampToValueAtTime(0, t + run);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.foley);
      o.start(t);
      o.stop(t + run + 0.02);
      o.onended = () => {
        for (const n of [o, lp, g]) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
    } catch {
      /* ignore */
    }
    this.burst(t, { hz: 700, q: 1.5, peak: 0.03 * s, a: 0.3, d: run / 4, pink: true });
    const end = t + run;
    if (closing) {
      this.ping(end, { hz: 70, toHz: 50, peak: 0.07 * s, a: 0.002, d: 0.05 });
      this.burst(end, { hz: 520, q: 0.9, peak: 0.24 * s, a: 0.0008, d: 0.016 });
      this.burst(end + 0.07, { hz: 1500, q: 1.2, peak: 0.12 * s, a: 0.0005, d: 0.004 });
    } else {
      this.burst(end, { hz: 640, q: 1, peak: 0.12 * s, a: 0.0008, d: 0.01 });
    }
  }

  /** Short warning: three soft dyad pulses (≈ 0.6 s total). */
  warning(t, s = 1) {
    const L = JET_COLD_LEVEL.warning * s;
    for (let k = 0; k < 3; k++) {
      const tk = t + k * 0.2;
      this.tone(tk, { hz: 760, type: 'triangle', peak: L, a: 0.008, hold: 0.11, r: 0.025, lp: 2400 });
      this.tone(tk, { hz: 1140, type: 'triangle', peak: L * 0.6, a: 0.008, hold: 0.11, r: 0.025, lp: 2400 });
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
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sources = [];
    this.nodes = [];
  }
}

/* ───────────────────────────── switch list / checklist ───────────────────────────── */

const E = (id, label, group, kind, requires, extra = {}) => ({ id, label, group, kind, requires, ...extra });

/**
 * Switch panel description for Frontend. `variant`: 'apu' (APU start) | 'aircart' (external air
 * cart, alias 'groundcart'). `requires` is advisory only (the audio layer never refuses a call);
 * `order` is the startup order of the panel; `required` = part of the minimum start.
 */
export function getJetSystemList(variant = 'apu') {
  const cart = variant === 'aircart' || variant === 'groundcart';
  const air = cart ? 'aircart' : 'apu';
  const list = [
    E('batt', 'Battery', 'POWER', 'toggle', [], { required: true }),
    E('seatbelt', 'Seat belt sign', 'SYSTEMS', 'toggle', ['batt'], { required: false }),
    E('avionics', 'Avionics', 'POWER', 'toggle', ['batt'], { required: false }),
    E('inertialNav', 'Nav platform', 'POWER', 'toggle', ['avionics'], { required: false }),
    E('navLights', 'Position lights', 'LIGHTS', 'toggle', ['batt'], { required: false }),
    E('anticollision', 'Beacon', 'LIGHTS', 'toggle', ['batt'], { required: false }),
    cart
      ? E('aircart', 'Ground air', 'POWER', 'toggle', ['batt'], { required: true })
      : E('apu', 'APU', 'POWER', 'toggle', ['batt'], { required: true }),
  ];
  const engine = (side, extraReq) => {
    const s = side;
    return [
      E(`fuelPump${s}`, `${s} fuel pump`, 'FUEL', 'toggle', ['batt'], { side: s, required: true }),
      E(`ign${s}`, `${s} ignition`, 'ENGINES', 'toggle', ['batt'], { side: s, required: true }),
      E(`eng${s}`, `${s} engine start`, 'ENGINES', 'hold', ['batt', `fuelPump${s}`, `ign${s}`, ...extraReq], { side: s, required: true }),
      E(`throttle${s}`, `${s} throttle idle`, 'ENGINES', 'toggle', [`eng${s}`], { side: s, required: true }),
    ];
  };
  if (cart) {
    // the cart blows into the right engine; the left starts on bleed air from the right
    list.push(...engine('R', ['aircart']));
    list.push(E('crossbleed', 'Crossbleed', 'FUEL', 'toggle', ['engR'], { required: true }));
    list.push(...engine('L', ['crossbleed']));
  } else {
    list.push(...engine('L', ['apu']));
    list.push(...engine('R', ['apu']));
  }
  list.push(
    E('hydraulics', 'Hydraulics', 'SYSTEMS', 'toggle', ['engL', 'engR'], { required: false }),
    E('canopy', 'Canopy', 'SYSTEMS', 'hold', ['batt'], { required: false }),
    E('oxygen', 'Oxygen', 'SYSTEMS', 'toggle', [], { required: false }),
    E('masterCaution', 'Caution reset', 'SYSTEMS', 'hold', ['batt'], { required: false }),
    E('quickStartGuard', 'Quick start cover', 'ENGINES', 'guarded', [], { required: false }),
    E('quickStart', 'Quick start', 'ENGINES', 'hold', ['quickStartGuard'], { required: false }),
    E('emergencyStop', 'Emergency stop', 'ENGINES', 'pull', [], { required: false }),
  );
  return list.map((x, i) => ({ ...x, order: i + 1 }));
}

/** Our own short plain-words checklist (startup / shutdown) per variant. */
export function getJetChecklist(variant = 'apu') {
  const cart = variant === 'aircart' || variant === 'groundcart';
  const start = cart
    ? [
        'Battery on',
        'Seat belt sign on',
        'Avionics on, nav platform on',
        'Position lights and beacon on',
        'Ground air on, wait for steady hiss',
        'Right fuel pump on, right ignition on',
        'Hold right engine start, throttle to idle when it turns',
        'Wait for right engine idle',
        'Crossbleed open',
        'Left fuel pump on, left ignition on',
        'Hold left engine start, throttle to idle when it turns',
        'Wait for left engine idle',
        'Crossbleed closed, ground air off',
        'Hydraulics on, wait for pressure',
        'Canopy closed, oxygen on',
        'Caution reset',
      ]
    : [
        'Battery on',
        'Seat belt sign on',
        'Avionics on, nav platform on',
        'Position lights and beacon on',
        'APU on, wait for steady hum',
        'Left fuel pump on, left ignition on',
        'Hold left engine start, throttle to idle when it turns',
        'Wait for left engine idle',
        'Right fuel pump on, right ignition on',
        'Hold right engine start, throttle to idle when it turns',
        'Wait for right engine idle',
        'APU off',
        'Hydraulics on, wait for pressure',
        'Canopy closed, oxygen on',
        'Caution reset',
      ];
  const shutdown = [
    'Throttles to cutoff',
    'Ignition off, fuel pumps off',
    'Hydraulics off, oxygen off',
    'Canopy open',
    'Lights off',
    'Nav platform off, avionics off',
    'Seat belt sign off',
    'Battery off',
  ];
  return { startup: start, shutdown };
}
