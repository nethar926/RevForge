// Tomcat — shared procedural twin afterburning-turbofan voice (original synthesis, no samples).
// Plain JS so EngineSynthImpl (browser) and the offline renders / tests (node) run the SAME drive
// model, targets, graph and events.
//
// Modelled on the character of a 1970s low-bypass afterburning turbofan pair (TF30 class): rough,
// strong low-pressure fan buzz, hot core roar, 5-zone afterburner. Everything is derived from a
// twin N1/N2 spool model, so the start sequence, spool-up, afterburner staging and shutdown are one
// continuous system (no clips are cross-faded):
//
//   drive model:  throttle → N2 target (rate-limited accel / faster decel, per engine, B detuned)
//                 N1 lags N2 · start: air starter → light-off → idle · shutdown: fuel cut → rundown
//                 afterburner demand (load if supplied, else throttle) → zones 1..5 lit in sequence
//   per engine:   N2/N1 ConstantSources → blade-pass whine (3 tones + fan tone) · buzz-saw (N1 saw →
//                 rasp shaper), both ducking under thrust · idle/spool bed · core roar (deep rumble
//                 25–120 Hz, body 120–300 Hz, small hot band) rolled by slow random AM · starter → pan
//   shared:       rear-arc rumble · afterburner (dark roar ≤ 1.2 kHz, chest-weight body, wide stereo
//                 deep rumble, sparse low crackle, faint hiss, per-zone thumps) · mechanical
//                 (gearbox / mesh / shaft tones, ticks, intake rumble) · ram airflow
//   out:          sum → 2 × 20 Hz high-pass (DC + subsonic) → level → engine master (→ limiter)
//
// Node budget (~22 oscillators, 4 looping runtime-noise + 2 runtime random-walk sources, ~39
// filters, 3 fixed shapers, 4 stereo panners) is light enough for in-car Chromium; no AudioWorklet.
// WaveShaper curves are assigned once.

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

/* ───────────────────────────── constants ───────────────────────────── */

/** Ground-idle N2 as a fraction of 100 % N2. */
export const TC_IDLE_N2 = 0.62;
/** Throttle (0..1) at military power (100 % N2, no afterburner). */
export const TC_MIL_THROTTLE = 0.8;
/** Afterburner demand needed to light zone k (index k-1). Demand = load if supplied, else throttle. */
export const TC_AB_ZONE_ON = [0.83, 0.87, 0.91, 0.945, 0.975];
/** A lit zone stays lit until demand drops this far below its light threshold (zone 1 still goes
 * out at military power: 0.83 − 0.02 > 0.8). */
export const TC_AB_HYSTERESIS = 0.02;
/** Seconds from demand to zone 1 light (ignition delay). */
export const TC_AB_FIRST_DELAY = 0.15;
/** Seconds between each further zone lighting (2, 3, 4, 5). */
export const TC_AB_ZONE_DELAY = 0.16;
/** Seconds between zones going out when demand drops (top zone first). */
export const TC_AB_DESTAGE_DELAY = 0.07;
/** Afterburner intensity per lit zone (0..5): zone 1 (core ignition) is the biggest step, each
 * further zone adds roar / low end. The audio level glides between these (no raw jumps). */
export const TC_AB_ZONE_LEVEL = [0, 0.4, 0.58, 0.74, 0.88, 1];
/** Spool (0 = idle … 1 = military) both engines need before zone 1 can light / to stay lit. */
export const TC_AB_LIGHT_SPOOL = 0.9;
export const TC_AB_HOLD_SPOOL = 0.8;
/** Start sequence: second engine begins this long after the first. */
export const TC_ENGINE_B_START_OFFSET = 0.55;
/** Approximate start-sequence length (starter whine → light-off → settle at idle). */
export const TC_STARTER_SECONDS = 3.4;
/** Approximate audible shutdown length (fuel cut → spool rundown). */
export const TC_SHUTOFF_SECONDS = 2.8;
/** Reference shaft rates at 100 % (character model, not a specification). */
export const TC_N2_HZ = 238;
export const TC_N1_HZ = 160;
/** Blade-pass style ratios: whine tones on N2, fan tone on N1. */
export const TC_RATIOS = { comp1: 17.6, comp1h: 35.2, comp2: 29.3, fan: 22, gear: 0.47, mesh: 10.8 };
/** Calibrated output trim (cruise loudness matched to the previous aerospace voice in the car chain). */
export const TC_OUT_TRIM = 0.454;
/**
 * Low-end mix (thrust + afterburner). Thrust and afterburner energy sits in a deep exhaust rumble
 * (≈25–120 Hz) with a body band (≈120–300 Hz); the hot band and nozzle hiss are kept small, and the
 * whine / fan buzz duck under thrust so the low end leads.
 */
export const TC_LOW = {
  deep: 1.15, // per-engine deep rumble (LP 70–120 Hz) × thrust
  body: 2.45, // per-engine body band (BP 130–280 Hz) × thrust
  hot: 0.19, // per-engine hot band (BP 650–1100 Hz) × thrust²
  rumble: 0.75, // shared rear-arc rumble × thrust^1.5
  am: 0.3, // max depth of the slow random roll on the roar (0..1)
  abRoar: 0.7, // AB roar (LP ≤ 1.2 kHz, darker per zone)
  abBody: 2.0, // AB chest weight (BP ≈ 110–160 Hz)
  abLow: 2.4, // AB deep rumble, stereo pair (LP 45–70 Hz), widening per zone
  crackle: 0.3,
  hiss: 0.006,
  duckSpool: 0.32, // whine / fan duck at full spool
  duckAb: 0.25, // extra duck at zone 5
};

/* ───────────────────────────── drive model ───────────────────────────── */

function engineState() {
  return { n2: 0, n1: 0, comb: 0, lit: false, litAt: 0, starter: 0, wander: 0, nextTick: 0 };
}

/** Lagged drive state. phase: 'off' | 'starting' | 'run' | 'shutdown'. */
export function createTomcatDriveState(phase = 'off') {
  const s = {
    phase: 'off',
    time: 0,
    phaseTime: 0,
    a: engineState(),
    b: engineState(),
    speed: 0,
    thrCmd: 0,
    abDemand: 0,
    abZone: 0,
    abTimer: 0,
    abLevel: 0,
    stallCooldown: 3,
    prevSpool: 0,
    rate: 0,
  };
  if (phase === 'run') tomcatSetRunning(s);
  return s;
}

/** N1 (fan) fraction that a given N2 settles at. */
export function tomcatN1FromN2(n2) {
  return Math.pow(clip((n2 - 0.1) / 0.9), 1.6);
}

/** Spool position 0 (ground idle) … 1 (military) from N2. */
export function tomcatSpoolNorm(n2) {
  return clip((n2 - TC_IDLE_N2) / (1 - TC_IDLE_N2));
}

/** Jump straight to a settled idle (pack switched while running). */
export function tomcatSetRunning(s) {
  for (const e of [s.a, s.b]) {
    e.n2 = TC_IDLE_N2;
    e.n1 = tomcatN1FromN2(TC_IDLE_N2);
    e.comb = 1;
    e.lit = true;
    e.starter = 0;
  }
  s.phase = 'run';
  s.phaseTime = 0;
  s.prevSpool = 0;
}

/** Begin the start sequence (air starter → light-off → idle). No-op if already starting/running. */
export function tomcatBeginStart(s) {
  if (s.phase === 'run' || s.phase === 'starting') return false;
  s.phase = 'starting';
  s.phaseTime = 0;
  for (const e of [s.a, s.b]) {
    e.lit = false;
    e.nextTick = 0;
  }
  return true;
}

/** Fuel cut on both engines → spool rundown. Afterburner de-stages through its normal sequence. */
export function tomcatBeginShutdown(s) {
  if (s.phase === 'off' || s.phase === 'shutdown') return false;
  s.phase = 'shutdown';
  s.phaseTime = 0;
  return true;
}

/** Afterburner demand: `load` when the caller supplied it (finite), otherwise throttle. */
export function tomcatAbDemand(input) {
  const d = input || {};
  const load = d.load;
  if (load !== undefined && load !== null && Number.isFinite(Number(load))) return clip(Number(load));
  return clip(num(d.throttle, 0));
}

/** Zone (0..5) the demand asks for, with per-zone hysteresis and the spool gate. */
export function tomcatZoneTarget(demand, zone, spool) {
  const gate = zone > 0 ? spool >= TC_AB_HOLD_SPOOL : spool >= TC_AB_LIGHT_SPOOL;
  if (!gate) return 0;
  let z = 0;
  for (let k = 0; k < TC_AB_ZONE_ON.length; k++) {
    const thr = zone > k ? TC_AB_ZONE_ON[k] - TC_AB_HYSTERESIS : TC_AB_ZONE_ON[k];
    if (demand >= thr) z = k + 1;
    else break;
  }
  return z;
}

function spoolStep(n2, target, dt, accelMax, decelMax, tau) {
  const v = clip((target - n2) / Math.max(1e-3, tau), -decelMax, accelMax);
  const next = n2 + v * dt;
  // never overshoot the target
  return v >= 0 ? Math.min(next, Math.max(n2, target)) : Math.max(next, Math.min(n2, target));
}

/** Spool-time multiplier from tcSpoolTime (0.5 default → 1) and the legacy spoolInertia slider. */
export function tomcatTimeScale(params = {}) {
  const st = clip(num(params.tcSpoolTime, 0.5));
  const inertia = clip(num(params.spoolInertia, 0.64));
  return (0.6 + 0.8 * st) * (0.75 + 0.39 * inertia);
}

/**
 * One drive step (dt seconds). Input: DrivingInput (speed, throttle, load?, shifting?).
 * Frontend rpm / rpmNorm are ignored on purpose: a gearbox simulation must not put shift cliffs
 * into a jet. While `shifting` is true the throttle command is held (the car sim dips throttle).
 * Returns the drive snapshot incl. one-shot `events` (lightoff, igniter, abLight, abDestage, stall).
 */
export function stepTomcatDrive(state, input, dt, params = {}) {
  const d = input || {};
  const p = params || {};
  const step = clip(num(dt, 1 / 60), 0, 0.25);
  const events = [];
  const ts = tomcatTimeScale(p);
  const loadGiven = d.load !== undefined && d.load !== null && Number.isFinite(Number(d.load));
  const demand = tomcatAbDemand(d);
  if (!d.shifting) {
    const thr = clip(num(d.throttle, 0));
    state.thrCmd = loadGiven ? Math.max(thr, demand) : thr;
    state.abDemand = demand;
  }
  state.time += step;
  state.phaseTime += step;
  state.speed = lag(state.speed, clip(num(d.speed, 0)), step, 0.8);

  const x = clip(state.thrCmd / TC_MIL_THROTTLE);
  const sCmd = clip(Math.pow(x, 0.75) + state.speed * 0.03);
  const det = clip(num(p.tcDetune, 0.35)) * 0.004;
  const idleN1 = tomcatN1FromN2(TC_IDLE_N2);

  const engines = [state.a, state.b];
  for (let i = 0; i < 2; i++) {
    const e = engines[i];
    const slow = i === 1 ? 1.06 : 1;
    // slow random wander (keeps the twin beat drifting)
    e.wander = clip((e.wander + (Math.random() * 2 - 1) * Math.sqrt(step) * 0.0012) * Math.exp(-step / 4), -0.003, 0.003);
    let n2Target = 0;
    if (state.phase === 'starting') {
      const te = state.phaseTime - (i === 1 ? TC_ENGINE_B_START_OFFSET : 0);
      if (te >= 0) {
        e.starter = e.n2 < 0.45 ? lag(e.starter, 1, step, 0.12) : lag(e.starter, 0, step, 0.3);
        if (!e.lit) {
          // air starter spins the core up; fuel + igniters light it off around 16 % N2
          e.n2 = lag(e.n2, 0.27, step, 0.5 * ts);
          if (e.n2 >= 0.16) {
            e.lit = true;
            e.litAt = te;
            events.push({ type: 'lightoff', engine: i });
          }
        } else {
          const acc = (0.16 + 0.24 * sstep((e.n2 - 0.15) / 0.45)) / ts;
          e.n2 = spoolStep(e.n2, TC_IDLE_N2 * (1 + (i ? det : 0)), step, acc, 1, 0.3 * ts);
        }
        e.comb = e.lit ? lag(e.comb, 1, step, 0.35) : 0;
        if ((!e.lit || te - e.litAt < 0.5) && te >= e.nextTick) {
          events.push({ type: 'igniter', engine: i });
          e.nextTick = te + 0.23;
        }
      } else {
        e.n2 = Math.max(0, e.n2 - (e.n2 / 0.95 + 0.015) * step);
      }
      n2Target = TC_IDLE_N2;
    } else if (state.phase === 'run') {
      n2Target = (TC_IDLE_N2 + (1 - TC_IDLE_N2) * sCmd) * (1 + (i ? det : 0) + e.wander);
      const s = tomcatSpoolNorm(e.n2);
      const accel = ((0.14 + 0.3 * sstep(s / 0.7)) * (1 - TC_IDLE_N2)) / (ts * slow);
      const decel = (0.55 * (1 - TC_IDLE_N2)) / (ts * slow);
      e.n2 = spoolStep(e.n2, n2Target, step, accel, decel, (n2Target > e.n2 ? 0.4 : 0.55) * ts * slow);
      e.comb = lag(e.comb, 1, step, 0.3);
      e.lit = true;
      e.starter = lag(e.starter, 0, step, 0.3);
    } else {
      // shutdown (engine B 0.15 s after A) / off: fuel cut → rundown
      const te = state.phaseTime - (i === 1 ? 0.15 : 0);
      if (state.phase === 'off' || te >= 0) {
        e.lit = false;
        e.comb = lag(e.comb, 0, step, 0.18);
        e.n2 = Math.max(0, e.n2 - (e.n2 / 0.95 + 0.015) * step);
      }
      e.starter = lag(e.starter, 0, step, 0.2);
    }
    const n1T = tomcatN1FromN2(e.n2);
    e.n1 = lag(e.n1, n1T, step, (n1T > e.n1 ? 0.35 : 0.3) * ts * slow);
    e._target = n2Target;
  }

  // phase transitions
  if (state.phase === 'starting') {
    const done = engines.every((e) => e.lit && e.n2 >= TC_IDLE_N2 - 0.004);
    if (done || state.phaseTime > 8) {
      if (!done) tomcatSetRunning(state);
      state.phase = 'run';
      state.phaseTime = 0;
    }
  } else if (state.phase === 'shutdown') {
    if (engines.every((e) => e.n2 < 0.004 && e.comb < 0.01)) {
      state.phase = 'off';
      state.phaseTime = 0;
    }
  }

  const sA = tomcatSpoolNorm(state.a.n2);
  const sB = tomcatSpoolNorm(state.b.n2);
  const spool = (sA + sB) / 2;
  const running = state.phase === 'run';

  // afterburner staging (sequential light, sequential de-stage)
  const zt = running ? tomcatZoneTarget(state.abDemand, state.abZone, Math.min(sA, sB)) : 0;
  if (zt !== state.abZone) {
    state.abTimer += step;
    while (zt !== state.abZone) {
      const up = zt > state.abZone;
      const need = up ? (state.abZone === 0 ? TC_AB_FIRST_DELAY : TC_AB_ZONE_DELAY) : TC_AB_DESTAGE_DELAY;
      if (state.abTimer + 1e-9 < need) break;
      state.abTimer -= need;
      if (up) {
        state.abZone += 1;
        events.push({ type: 'abLight', zone: state.abZone });
      } else {
        events.push({ type: 'abDestage', zone: state.abZone });
        state.abZone -= 1;
      }
    }
    if (zt === state.abZone) state.abTimer = 0;
  } else {
    state.abTimer = 0;
  }
  const abT = TC_AB_ZONE_LEVEL[state.abZone] ?? 0;
  state.abLevel = lag(state.abLevel, abT, step, abT > state.abLevel ? 0.09 : 0.16);

  // TF30 roughness: rare, soft compressor-stall chug on a hard throttle snap mid-spool
  state.stallCooldown = Math.max(0, state.stallCooldown - step);
  const stallAmt = clip(num(p.tcStall, 0.35));
  if (running && stallAmt > 0 && state.stallCooldown <= 0 && sCmd - spool > 0.4 && spool > 0.15 && spool < 0.85) {
    if (Math.random() < stallAmt * 1.2 * step) {
      events.push({ type: 'stall', amount: 0.55 + 0.45 * Math.random() });
      state.stallCooldown = 6;
    }
  }

  const rateNow = (spool - state.prevSpool) / Math.max(1e-3, step);
  state.prevSpool = spool;
  state.rate = lag(state.rate, rateNow, step, 0.15);

  const n1a = state.a.n1;
  const n1b = state.b.n1;
  let settled;
  if (state.phase === 'off') settled = state.a.n2 < 1e-3 && state.b.n2 < 1e-3 && state.a.comb < 1e-3;
  else if (state.phase === 'run')
    settled =
      engines.every((e) => Math.abs(e._target - e.n2) < 0.0015 && Math.abs(tomcatN1FromN2(e.n2) - e.n1) < 0.002) &&
      zt === state.abZone &&
      Math.abs(state.abLevel - abT) < 0.003 &&
      Math.abs(state.speed - clip(num(d.speed, 0))) < 0.003;
  else settled = false;

  return {
    phase: state.phase,
    n2a: state.a.n2,
    n2b: state.b.n2,
    n1a,
    n1b,
    combA: state.a.comb,
    combB: state.b.comb,
    starterA: state.a.starter,
    starterB: state.b.starter,
    sA,
    sB,
    spool,
    n1: (n1a + n1b) / 2,
    idleN1,
    speed: state.speed,
    thr: state.thrCmd,
    demand: state.abDemand,
    abZone: state.abZone,
    abTarget: zt,
    abLevel: state.abLevel,
    rate: state.rate,
    events,
    settled,
  };
}

/* ───────────────────────────── targets ───────────────────────────── */

const en = (p, id) => (num(p[id], 1) >= 0.5 ? 1 : 0);
const macro = (p, id, def) => clip(num(p[id], def) / def, 0, 2.5);
const lvl = (p, id, def) => clip(num(p[id], def), 0, 1) / def;

/** Per-layer gain multipliers (enable × gain knob × legacy macro); defaults → 1. */
export function tomcatLayerGains(params = {}) {
  const p = params || {};
  return {
    idle: en(p, 'tcIdleOn') * lvl(p, 'tcIdleGain', 0.7) * macro(p, 'idleSpool', 0.58),
    whine: en(p, 'tcWhineOn') * lvl(p, 'tcWhineGain', 0.62) * macro(p, 'intakeWhine', 0.48),
    fan: en(p, 'tcFanOn') * lvl(p, 'tcFanGain', 0.6) * macro(p, 'compressor', 0.72),
    roar: en(p, 'tcRoarOn') * lvl(p, 'tcRoarGain', 0.72) * macro(p, 'turbine', 0.74),
    rumble: en(p, 'tcRoarOn') * lvl(p, 'tcRoarGain', 0.72) * macro(p, 'jetRoar', 0.7),
    ab: en(p, 'tcAbOn') * lvl(p, 'tcAbGain', 0.72) * macro(p, 'afterburn', 0.8),
    crackle: lvl(p, 'tcCrackle', 0.55) * macro(p, 'jetScream', 0.42),
    mech: en(p, 'tcMechOn') * lvl(p, 'tcMechGain', 0.55),
    ram: en(p, 'tcRamOn') * lvl(p, 'tcRamGain', 0.5) * macro(p, 'airframe', 0.55),
    starter: en(p, 'tcStarterOn') * lvl(p, 'tcStarterGain', 0.6),
  };
}

function engineTargets(L, n2, n1, s, comb, starter, rate, pitch, ab) {
  const presence = clip(n2 / TC_IDLE_N2);
  const thrust = comb * presence * (0.1 + 0.9 * Math.pow(s, 1.6));
  const duck = clip(1 - TC_LOW.duckSpool * s * s - TC_LOW.duckAb * ab);
  // low end grows faster than the shared thrust curve: modest at cruise, full at military power
  const lowT = thrust * (0.47 + 0.53 * s);
  const whine = L.whine * 0.04 * Math.pow(presence, 1.5) * (0.75 + 0.25 * s) * duck;
  return {
    n2Hz: TC_N2_HZ * n2 * pitch,
    n1Hz: TC_N1_HZ * n1 * pitch,
    presence,
    thrust,
    whine,
    whine2: whine * (0.35 + 0.35 * s),
    whineH: whine * 0.22,
    fanTone: L.fan * 0.03 * Math.pow(clip(n1 / 0.35), 1.2) * (0.6 + 0.4 * s) * duck,
    buzz: L.fan * 0.05 * sstep((n1 - 0.62) / 0.33) * duck,
    buzzDrive: 1 + 6 * sstep((n1 - 0.8) / 0.2),
    idleBed: L.idle * presence * (0.4 * (1 - 0.55 * s) * (0.3 + 0.7 * comb) + 0.2 * clip(Math.abs(rate) * 1.5)),
    idleHz: 420 + 900 * s,
    roarLow: L.roar * TC_LOW.deep * lowT,
    roarLowHz: 90 + 60 * thrust,
    roarBody: L.roar * TC_LOW.body * lowT,
    roarBodyHz: 130 + 120 * s + 30 * ab,
    roarHot: L.roar * TC_LOW.hot * thrust * thrust,
    roarHotHz: 650 + 450 * s,
    roarAm: TC_LOW.am * (0.35 + 0.65 * thrust),
    starterHz: 1500 + 5200 * clip(n2 / 0.45),
    starter: L.starter * 0.05 * starter,
    starterHiss: L.starter * 0.06 * starter,
  };
}

/** Pure mapping drive → voice targets (all continuous). */
export function tomcatTargets(params = {}, drv = {}) {
  const p = params || {};
  const L = tomcatLayerGains(p);
  const pitch = clip(num(p.spoolPitch, 88) / 88, 0.5, 2);
  const ab = clip(drv.abLevel ?? 0);
  const rate = num(drv.rate, 0);
  const a = engineTargets(L, num(drv.n2a, 0), num(drv.n1a, 0), clip(drv.sA ?? 0), clip(drv.combA ?? 0), clip(drv.starterA ?? 0), rate, pitch, ab);
  const b = engineTargets(L, num(drv.n2b, 0), num(drv.n1b, 0), clip(drv.sB ?? 0), clip(drv.combB ?? 0), clip(drv.starterB ?? 0), rate, pitch, ab);
  const thrust = (a.thrust + b.thrust) / 2;
  const presence = (a.presence + b.presence) / 2;
  const s = clip(num(drv.spool, 0));
  const n1 = clip(num(drv.n1, 0));
  const sp = clip(num(drv.speed, 0));
  const abOn = L.ab;
  return {
    a,
    b,
    thrust,
    rumble: L.rumble * (0.2 * thrust + TC_LOW.rumble * Math.pow(thrust, 1.5) * (0.4 + 0.6 * s)),
    rumbleNoiseAm: TC_LOW.am * 0.8 * (0.3 + 0.7 * thrust),
    rumbleAmRate: 0.7 + 2.2 * s,
    abRoar: abOn * TC_LOW.abRoar * Math.pow(ab, 1.1),
    abRoarHz: 700 - 250 * ab,
    abBody: abOn * TC_LOW.abBody * Math.pow(ab, 1.35),
    abBodyHz: 160 - 50 * ab,
    abLow: abOn * TC_LOW.abLow * Math.pow(ab, 1.4),
    abLowHz: 45 + 25 * ab,
    abWidth: 0.25 + 0.6 * ab,
    abAm: TC_LOW.am * 0.8 * ab,
    crackleDrive: 0.45 + 0.8 * Math.pow(ab, 0.8),
    crackle: abOn * L.crackle * TC_LOW.crackle * sstep(ab * 1.25),
    abHiss: abOn * L.crackle * TC_LOW.hiss * ab,
    gearHz: a.n2Hz * TC_RATIOS.gear,
    gear: L.mech * 0.011 * presence * (0.6 + 0.4 * s),
    mesh: L.mech * 0.009 * presence,
    shaftN2: L.mech * 0.0065 * presence,
    shaftN1: L.mech * 0.005 * clip(n1 / 0.3),
    tickDrive: 0.45 + 0.75 * presence * (1 - 0.8 * s),
    ticks: L.mech * 0.16 * presence * (1 - 0.75 * s),
    intake: L.mech * (0.07 * n1 + 0.08 * sp),
    intakeHz: 45 + 30 * n1,
    ramWind: L.ram * 0.14 * sp * sp,
    ramHz: 600 + 900 * sp,
    ramBuffet: L.ram * 0.12 * Math.pow(sp, 1.5),
    width: clip(num(p.stereoWidth, 0.62)),
    level: clip(num(p.tcLevel, 0.5), 0, 1) * 2 * TC_OUT_TRIM,
    whumpScale: abOn,
    lightoffScale: L.starter > 0 ? 1 : 0.6,
    igniter: L.starter * 0.05,
    stallScale: L.roar,
  };
}

/* ───────────────────────────── graph ───────────────────────────── */

function setT(param, value, t, tc) {
  if (!Number.isFinite(value)) return;
  try {
    param.cancelScheduledValues(t);
    param.setTargetAtTime(value, t, tc);
  } catch {
    param.value = value;
  }
}

/** Odd-symmetric threshold curve: zero below `th`, rising above → sparse pops from noise. No DC. */
function thresholdCurve(th, power = 1.5, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const m = Math.max(0, Math.abs(x) - th) / (1 - th);
    c[i] = Math.sign(x) * Math.pow(m, power);
  }
  return c;
}

/** Soft tanh rasp curve (odd → no DC). */
function raspCurve(n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
  }
  return c;
}

/**
 * Smooth random control signal (≈2.5 Hz bandwidth, zero mean, unit RMS) at a low buffer rate,
 * generated at runtime from Math.random and cross-faded so the loop seam is continuous.
 */
function makeRoll(ctx, seconds, hz = 2.5) {
  const sr = 3000;
  const len = Math.floor(sr * seconds);
  const fade = sr;
  const x = new Float32Array(len + fade);
  const k = 1 - Math.exp((-2 * Math.PI * hz) / sr);
  let a = 0;
  let b = 0;
  for (let i = -sr * 2; i < len + fade; i++) {
    a += k * (Math.random() * 2 - 1 - a);
    b += k * (a - b);
    if (i >= 0) x[i] = b;
  }
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = i < fade ? x[i] * (i / fade) + x[len + i] * (1 - i / fade) : x[i];
  let mean = 0;
  for (let i = 0; i < len; i++) mean += d[i];
  mean /= len;
  let sq = 0;
  for (let i = 0; i < len; i++) sq += (d[i] - mean) ** 2;
  const g = 1 / Math.max(1e-9, Math.sqrt(sq / len));
  for (let i = 0; i < len; i++) d[i] = (d[i] - mean) * g;
  return buf;
}

function makeNoise(ctx, seconds, pink) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) data[i] = w;
    else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return buf;
}

export class TomcatVoice {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} dest engine master (→ limiter)
   * @param {{ whiteBuf?: AudioBuffer, pinkBuf?: AudioBuffer }} [opts] runtime-generated noise buffers
   */
  constructor(ctx, dest, opts = {}) {
    this.ctx = ctx;
    this.nodes = [];
    this.sources = [];
    this.disposed = false;
    const white = opts.whiteBuf ?? makeNoise(ctx, 2, false);
    const pink = opts.pinkBuf ?? makeNoise(ctx, 2, true);
    const t0 = ctx.currentTime;
    const dur = white.duration || 2;

    const gain = (v = 0, to) => {
      const g = this.n(ctx.createGain());
      g.gain.value = v;
      if (to) g.connect(to);
      return g;
    };
    const filt = (type, f, q = 0.707, to) => {
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
    const noise = (buf, offset) => {
      const s = this.n(ctx.createBufferSource());
      s.buffer = buf;
      s.loop = true;
      s.start(t0, offset % dur);
      this.sources.push(s);
      return s;
    };
    const constant = (v) => {
      const c = this.n(ctx.createConstantSource());
      c.offset.value = v;
      c.start(t0);
      this.sources.push(c);
      return c;
    };
    const shaper = (curve) => {
      const w = this.n(ctx.createWaveShaper());
      w.curve = curve;
      return w;
    };

    // ── output: sum → DC-blocking HP → level → dest
    // two cascaded 20 Hz high-passes: DC + subsonic safety under the boosted low end (24 dB/oct)
    this.out = gain(0, dest);
    this.dcBlock = filt('highpass', 20, 0.707, this.out);
    this.subsonic = filt('highpass', 20, 0.707, this.dcBlock);
    this.sum = gain(1, this.subsonic);

    // noise sources (decorrelated by loop offset)
    this.pinkA = noise(pink, 0);
    this.pinkB = noise(pink, dur * 0.47);
    this.whiteA = noise(white, 0);
    this.whiteB = noise(white, dur * 0.61);

    // whine "haystack" AM: slow band-limited noise wobble on the tonal whine
    const hay = filt('lowpass', 32, 0.7);
    const hay2 = filt('lowpass', 32, 0.7);
    this.whiteB.connect(hay);
    hay.connect(hay2);
    // slow random roll for the exhaust roar (jet roar "breathes" instead of sitting still):
    // runtime-generated smooth random walks (unit RMS), two decorrelated loop lengths
    const roll = [23.3, 29.1].map((sec) => {
      const s = this.n(ctx.createBufferSource());
      s.buffer = makeRoll(ctx, sec);
      s.loop = true;
      s.start(t0);
      this.sources.push(s);
      return s;
    });

    // ── per engine
    this.eng = [0, 1].map((i) => {
      const e = {};
      e.pan = this.n(ctx.createStereoPanner());
      e.pan.pan.value = i ? 0.3 : -0.3;
      e.pan.connect(this.sum);
      e.bus = gain(1, e.pan);
      e.csN2 = constant(0);
      e.csN1 = constant(0);
      const ratioOsc = (type, cs, ratio, to) => {
        const o = osc(type, 0, to);
        const r = gain(ratio);
        cs.connect(r);
        r.connect(o.frequency);
        return o;
      };
      // turbine / compressor whine (N2 blade-pass tones) through the haystack AM
      e.whineAm = gain(1, e.bus);
      const hayDepth = gain(i ? 7 : 8);
      hay2.connect(hayDepth);
      hayDepth.connect(e.whineAm.gain);
      e.whine1 = gain(0, e.whineAm);
      e.whine1h = gain(0, e.whineAm);
      e.whine2 = gain(0, e.whineAm);
      ratioOsc('sine', e.csN2, TC_RATIOS.comp1, e.whine1);
      ratioOsc('sine', e.csN2, TC_RATIOS.comp1h, e.whine1h);
      ratioOsc('sine', e.csN2, TC_RATIOS.comp2, e.whine2);
      // fan blade-pass tone (N1)
      e.fanTone = gain(0, e.bus);
      const fanLp = filt('lowpass', 5200, 0.7, e.fanTone);
      ratioOsc('triangle', e.csN1, TC_RATIOS.fan, fanLp);
      // fan buzz-saw: N1 shaft-order saw → HP → presence peak → rasp drive → shaper
      e.buzz = gain(0, e.bus);
      const buzzShape = shaper(raspCurve());
      buzzShape.connect(e.buzz);
      e.buzzDrive = gain(1, buzzShape);
      const buzzPeak = this.n(ctx.createBiquadFilter());
      buzzPeak.type = 'peaking';
      buzzPeak.frequency.value = i ? 1750 : 1900;
      buzzPeak.Q.value = 0.9;
      buzzPeak.gain.value = 7;
      buzzPeak.connect(e.buzzDrive);
      const buzzHp = filt('highpass', 380, 0.7, buzzPeak);
      ratioOsc('sawtooth', e.csN1, 1, buzzHp);
      // idle / spool airflow bed
      const pinkE = i ? this.pinkB : this.pinkA;
      const whiteE = i ? this.whiteB : this.whiteA;
      e.idleBed = gain(0, e.bus);
      e.idleBp = filt('bandpass', 500, 0.9, e.idleBed);
      pinkE.connect(e.idleBp);
      // core roar: low (LP), body (BP), hot (white BP)
      e.roarAm = gain(1, e.bus);
      e.roarAmDepth = gain(0, e.roarAm.gain);
      roll[i].connect(e.roarAmDepth);
      e.roarLow = gain(0, e.roarAm);
      e.roarLowLp = filt('lowpass', 90, 0.75, e.roarLow);
      pinkE.connect(e.roarLowLp);
      e.roarBody = gain(0, e.roarAm);
      e.roarBodyBp = filt('bandpass', 180, 0.75, e.roarBody);
      pinkE.connect(e.roarBodyBp);
      e.roarHot = gain(0, e.bus);
      e.roarHotBp = filt('bandpass', 800, 0.7, e.roarHot);
      whiteE.connect(e.roarHotBp);
      // air-turbine starter whine + starter air hiss
      e.starter = gain(0, e.bus);
      e.starterOsc = osc('sine', 1500, e.starter);
      e.starterOsc2 = osc('sine', 2200, null);
      const s2 = gain(0.35, e.starter);
      e.starterOsc2.connect(s2);
      e.starterHiss = gain(0, e.bus);
      const sh = filt('highpass', 2200, 0.7, e.starterHiss);
      whiteE.connect(sh);
      return e;
    });

    // ── shared: rear-arc rumble with slow AM
    this.rumble = gain(0, this.sum);
    const rumbleAm = gain(0.8, this.rumble);
    const rLp2 = filt('lowpass', 85, 0.7, rumbleAm);
    const rLp1 = filt('lowpass', 85, 0.7, rLp2);
    this.pinkA.connect(rLp1);
    this.rumbleLfo = osc('sine', 1.1, null);
    const rDepth = gain(0.12, rumbleAm.gain);
    this.rumbleLfo.connect(rDepth);
    this.rumbleNoiseDepth = gain(0, rumbleAm.gain);
    roll[1].connect(this.rumbleNoiseDepth);

    // ── afterburner
    // roar: moving LP (darker per zone) → fixed 1.2 kHz LP, rolled by the slow random AM
    this.abAm = gain(1, this.sum);
    this.abAmDepth = gain(0, this.abAm.gain);
    roll[0].connect(this.abAmDepth);
    this.abRoar = gain(0, this.abAm);
    const abDark = filt('lowpass', 1200, 0.6, this.abRoar);
    this.abRoarLp = filt('lowpass', 600, 0.6, abDark);
    this.pinkB.connect(this.abRoarLp);
    // chest weight
    this.abBody = gain(0, this.abAm);
    this.abBodyBp = filt('bandpass', 140, 0.8, this.abBody);
    this.pinkA.connect(this.abBodyBp);
    // deep rumble: decorrelated L/R pair that widens with each zone
    this.abLowPanL = this.n(ctx.createStereoPanner());
    this.abLowPanR = this.n(ctx.createStereoPanner());
    this.abLowPanL.connect(this.abAm);
    this.abLowPanR.connect(this.abAm);
    this.abLow = gain(0, this.abLowPanL);
    this.abLowLp2 = filt('lowpass', 60, 0.8, this.abLow);
    this.abLowLp1 = filt('lowpass', 60, 0.8, this.abLowLp2);
    this.pinkA.connect(this.abLowLp1);
    this.abLowR = gain(0, this.abLowPanR);
    this.abLowRLp2 = filt('lowpass', 60, 0.8, this.abLowR);
    this.abLowRLp1 = filt('lowpass', 60, 0.8, this.abLowRLp2);
    this.pinkB.connect(this.abLowRLp1);
    // crackle: sparse, low pops
    this.crackle = gain(0, this.sum);
    const crackBp = filt('bandpass', 520, 0.6, this.crackle);
    const crackShape = shaper(thresholdCurve(0.87, 1.4));
    crackShape.connect(crackBp);
    this.crackleDrive = gain(0.5, crackShape);
    const crackLp = filt('lowpass', 1600, 0.7, this.crackleDrive);
    this.whiteA.connect(crackLp);
    this.abHiss = gain(0, this.sum);
    const hissHp = filt('highpass', 4500, 0.7, this.abHiss);
    this.whiteB.connect(hissHp);
    // whump / light-off / stall transients (event-scheduled only)
    this.whump = gain(0, this.sum);
    this.whumpOsc = osc('sine', 42, this.whump);
    const whumpNoise = gain(2.2, this.whump);
    const wLp = filt('lowpass', 140, 0.7, whumpNoise);
    this.pinkB.connect(wLp);
    // igniter ticks (event-scheduled)
    this.igniter = gain(0, this.sum);
    const igBp = filt('bandpass', 5200, 1.2, this.igniter);
    this.whiteA.connect(igBp);

    // ── mechanical
    const csA = this.eng[0].csN2;
    const mechOsc = (cs, ratio, to) => {
      const o = osc('sine', 0, to);
      const r = gain(ratio);
      cs.connect(r);
      r.connect(o.frequency);
      return o;
    };
    this.gear = gain(0, this.sum);
    mechOsc(csA, TC_RATIOS.gear, this.gear);
    this.mesh = gain(0, this.sum);
    mechOsc(csA, TC_RATIOS.mesh, this.mesh);
    this.shaftN2 = gain(0, this.sum);
    mechOsc(this.eng[1].csN2, 1, this.shaftN2);
    this.shaftN1 = gain(0, this.sum);
    mechOsc(this.eng[0].csN1, 2, this.shaftN1);
    this.ticks = gain(0, this.sum);
    const tickBp = filt('bandpass', 3300, 3, this.ticks);
    const tickShape = shaper(thresholdCurve(0.84, 1.2));
    tickShape.connect(tickBp);
    this.tickDrive = gain(0.5, tickShape);
    const tickLp = filt('lowpass', 2500, 0.7, this.tickDrive);
    this.whiteB.connect(tickLp);
    this.intake = gain(0, this.sum);
    this.intakeBp = filt('bandpass', 55, 1.2, this.intake);
    this.pinkB.connect(this.intakeBp);

    // ── ram airflow (speed)
    this.ramWind = gain(0, this.sum);
    this.ramBp = filt('bandpass', 800, 0.6, this.ramWind);
    this.pinkA.connect(this.ramBp);
    this.ramBuffet = gain(0, this.sum);
    const bLp = filt('lowpass', 110, 0.7, this.ramBuffet);
    this.pinkB.connect(bLp);

    this.jit = [0, 0];
    this.lastTargets = null;
  }

  n(node) {
    this.nodes.push(node);
    return node;
  }

  /** Current N2 shaft rate of engine A (Hz) — HUD fundamental. */
  shaftHz() {
    return this.lastTargets ? this.lastTargets.a.n2Hz : 0;
  }

  /** Apply one drive snapshot at ctx time `when` (default now). */
  update(params, drv, tc = 0.05, when) {
    if (this.disposed) return;
    const t = when ?? this.ctx.currentTime;
    const T = tomcatTargets(params, drv);
    this.lastTargets = T;
    const g = tc;
    const gp = Math.max(0.02, tc * 0.6);
    setT(this.out.gain, T.level, t, 0.08);
    const pans = [-0.12 - 0.36 * T.width, 0.12 + 0.36 * T.width];
    for (let i = 0; i < 2; i++) {
      const e = this.eng[i];
      const E = i ? T.b : T.a;
      // small per-engine pitch jitter (TF30 roughness) riding on the shaft rate
      this.jit[i] = clip(this.jit[i] * 0.92 + (Math.random() * 2 - 1) * 0.0009, -0.004, 0.004);
      setT(e.csN2.offset, E.n2Hz * (1 + this.jit[i]), t, gp);
      setT(e.csN1.offset, E.n1Hz * (1 + this.jit[i] * 0.6), t, gp);
      setT(e.pan.pan, pans[i], t, 0.2);
      setT(e.whine1.gain, E.whine, t, g);
      setT(e.whine1h.gain, E.whineH, t, g);
      setT(e.whine2.gain, E.whine2, t, g);
      setT(e.fanTone.gain, E.fanTone, t, g);
      setT(e.buzz.gain, E.buzz, t, g);
      setT(e.buzzDrive.gain, E.buzzDrive, t, g);
      setT(e.idleBed.gain, E.idleBed, t, g);
      setT(e.idleBp.frequency, E.idleHz, t, g);
      setT(e.roarLow.gain, E.roarLow, t, g);
      setT(e.roarLowLp.frequency, E.roarLowHz, t, g);
      setT(e.roarBody.gain, E.roarBody, t, g);
      setT(e.roarBodyBp.frequency, E.roarBodyHz, t, g);
      setT(e.roarHot.gain, E.roarHot, t, g);
      setT(e.roarHotBp.frequency, E.roarHotHz, t, g);
      setT(e.roarAmDepth.gain, E.roarAm, t, 0.2);
      setT(e.starter.gain, E.starter, t, g);
      setT(e.starterOsc.frequency, E.starterHz, t, gp);
      setT(e.starterOsc2.frequency, E.starterHz * 1.47, t, gp);
      setT(e.starterHiss.gain, E.starterHiss, t, g);
    }
    setT(this.rumble.gain, T.rumble, t, g);
    setT(this.rumbleLfo.frequency, T.rumbleAmRate, t, 0.3);
    setT(this.rumbleNoiseDepth.gain, T.rumbleNoiseAm, t, 0.2);
    setT(this.abRoar.gain, T.abRoar, t, g);
    setT(this.abRoarLp.frequency, T.abRoarHz, t, g);
    setT(this.abBody.gain, T.abBody, t, g);
    setT(this.abBodyBp.frequency, T.abBodyHz, t, g);
    setT(this.abLow.gain, T.abLow * 0.5, t, g);
    setT(this.abLowR.gain, T.abLow * 0.5, t, g);
    for (const f of [this.abLowLp1, this.abLowLp2, this.abLowRLp1, this.abLowRLp2]) setT(f.frequency, T.abLowHz, t, g);
    setT(this.abLowPanL.pan, -T.abWidth, t, 0.2);
    setT(this.abLowPanR.pan, T.abWidth, t, 0.2);
    setT(this.abAmDepth.gain, T.abAm, t, 0.2);
    setT(this.crackleDrive.gain, T.crackleDrive, t, g);
    setT(this.crackle.gain, T.crackle, t, g);
    setT(this.abHiss.gain, T.abHiss, t, g);
    setT(this.gear.gain, T.gear, t, g);
    setT(this.mesh.gain, T.mesh, t, g);
    setT(this.shaftN2.gain, T.shaftN2, t, g);
    setT(this.shaftN1.gain, T.shaftN1, t, g);
    setT(this.tickDrive.gain, T.tickDrive, t, g);
    setT(this.ticks.gain, T.ticks, t, g);
    setT(this.intake.gain, T.intake, t, g);
    setT(this.intakeBp.frequency, T.intakeHz, t, g);
    setT(this.ramWind.gain, T.ramWind, t, g);
    setT(this.ramBp.frequency, T.ramHz, t, g);
    setT(this.ramBuffet.gain, T.ramBuffet, t, g);
    if (drv && drv.events && drv.events.length) this.handleEvents(drv.events, T, t);
  }

  /** Ramped low-frequency pressure pulse (no step → no click). */
  pulse(peak, attack, decayTc, hzFrom, hzTo, t) {
    if (!(peak > 0)) return;
    const gp = this.whump.gain;
    try {
      if (typeof gp.cancelAndHoldAtTime === 'function') gp.cancelAndHoldAtTime(t);
      else {
        gp.cancelScheduledValues(t);
        gp.setValueAtTime(gp.value, t);
      }
      gp.linearRampToValueAtTime(peak, t + attack);
      gp.setTargetAtTime(0, t + attack, decayTc);
      const f = this.whumpOsc.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(hzFrom, t);
      f.exponentialRampToValueAtTime(hzTo, t + attack + decayTc * 3);
    } catch {
      /* never block the drive path */
    }
  }

  tick(peak, t) {
    if (!(peak > 0)) return;
    const gp = this.igniter.gain;
    try {
      gp.cancelScheduledValues(t);
      gp.setValueAtTime(0, t);
      gp.linearRampToValueAtTime(peak, t + 0.002);
      gp.linearRampToValueAtTime(0, t + 0.028);
    } catch {
      /* ignore */
    }
  }

  /** Schedule one-shot events from the drive model. */
  handleEvents(events, T, t) {
    for (const ev of events) {
      if (ev.type === 'abLight') {
        // zone 1 = ignition whump; later zones add smaller thumps (roar ramps via abLevel)
        // each later zone lands a lower, heavier chest thump
        const peak = T.whumpScale * (ev.zone === 1 ? 0.42 : 0.2 + 0.02 * ev.zone);
        this.pulse(peak, ev.zone === 1 ? 0.045 : 0.04, ev.zone === 1 ? 0.14 : 0.11, ev.zone === 1 ? 56 : 46 - 2 * ev.zone, 28, t);
      } else if (ev.type === 'lightoff') {
        this.pulse(0.22 * T.lightoffScale, 0.06, 0.22, 46, 27, t);
      } else if (ev.type === 'igniter') {
        this.tick(T.igniter, t);
      } else if (ev.type === 'stall') {
        this.pulse(0.12 * T.stallScale * (ev.amount ?? 1), 0.02, 0.07, 64, 36, t);
      }
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
