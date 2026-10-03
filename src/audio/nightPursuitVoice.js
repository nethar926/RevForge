// Night Pursuit — shared procedural voice pieces (original synthesis, no samples).
// Plain JS so EngineSynthImpl (browser) and scripts/render-snippets.mjs (node offline)
// run the SAME drive model, worklet targets, post-EQ, PURSUIT bus, scanner tick and cues.
//
// Base sound = pulse-engine-processor cross-plane V8 (family 1) + camLope / bankSplit /
// overrun opt-ins. This module only shapes it; it never generates a jet.

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const lag = (cur, target, dt, tc) => cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-3, tc)));
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

/** Automatic 4-speed (overdrive) + converter used only when Frontend sends no rpm/rpmNorm. */
export const NP_GEAR_RATIOS = [2.74, 1.57, 1.0, 0.67];
export const NP_FINAL_DRIVE = 3.23;
export const NP_TIRE_CIRC_M = 2.07;
/** Normalized speed 1.0 ≙ 120 mph (same as mphToSpeed default). */
export const NP_SPEED_FULL_MPH = 120;
export const NP_STALL_RPM = 2100;

export function npIdleRpm(params) {
  return (num(params?.rpmIdle, 44) * 120) / Math.max(4, num(params?.cylinders, 8));
}
export function npRedlineRpm(params) {
  return (num(params?.rpmRedline, 340) * 120) / Math.max(4, num(params?.cylinders, 8));
}

export function createNightPursuitDriveState(idleRpm = 660) {
  return {
    rpm: idleRpm,
    gear: 1,
    lastShiftAt: -10,
    glide: 0,
    time: 0,
    thrSlow: 0,
    prevThr: 0,
    overrun: 0,
    spool: 0,
    blowoff: 0,
    loadRich: 0,
    modelled: false,
  };
}

function lockedRpm(mps, gear) {
  const wheelRpm = (mps / NP_TIRE_CIRC_M) * 60;
  return wheelRpm * NP_GEAR_RATIOS[gear - 1] * NP_FINAL_DRIVE;
}

/**
 * One continuous drive step. Frontend rpm/rpmNorm always win (driving-adapt contract);
 * otherwise an automatic-transmission model maps speed+throttle → rpm with glides, no cliffs.
 * Returns { rpm, rpmNorm, gear, overrun, spool, blowoff, loadRich, modelled }.
 */
export function stepNightPursuitDrive(state, input, dt, params = {}) {
  const s = state;
  const idle = npIdleRpm(params);
  const red = npRedlineRpm(params);
  const thr = clip(num(input?.throttle, 0));
  const load = clip(num(input?.load, 0), -1, 1);
  const speed = clip(num(input?.speed, 0));
  const h = clip(num(dt, 1 / 60), 0, 0.25);
  s.time += h;

  const hasRpm = input?.rpm != null && Number.isFinite(input.rpm);
  const hasNorm = input?.rpmNorm != null && Number.isFinite(input.rpmNorm);
  if (hasRpm || hasNorm) {
    s.modelled = false;
    s.rpm = hasRpm ? clip(input.rpm, 200, 9000) : idle + clip(input.rpmNorm) * (red - idle);
  } else {
    s.modelled = true;
    const mph = speed * NP_SPEED_FULL_MPH;
    const mps = mph / 2.236936;
    const parked = mph < 1.2;
    let target;
    if (parked) {
      s.gear = 1;
      // Free rev in Park: heavy flywheel, slower fall than rise
      target = idle + Math.pow(thr, 1.25) * (red * 0.94 - idle);
    } else {
      // Throttle-dependent shift schedule with hysteresis + kickdown
      const shape = sstep(thr * 1.1);
      const upRpm = 1700 + shape * (red * 0.93 - 1700);
      const downRpm = 950 + thr * 1250;
      const since = s.time - s.lastShiftAt;
      if (since > 0.55) {
        if (s.gear < NP_GEAR_RATIOS.length && lockedRpm(mps, s.gear) > upRpm) {
          s.gear += 1;
          s.lastShiftAt = s.time;
        } else if (s.gear > 1 && lockedRpm(mps, s.gear) < downRpm) {
          s.gear -= 1;
          s.lastShiftAt = s.time;
        } else if (
          s.gear > 1 &&
          thr > 0.82 &&
          lockedRpm(mps, s.gear - 1) < red * 0.84 &&
          s.thrSlow < thr - 0.25
        ) {
          s.gear -= 1; // kickdown
          s.lastShiftAt = s.time;
        }
      }
      const locked = lockedRpm(mps, s.gear);
      // Converter slip: big at launch, gone with lockup in 3rd/4th at light cruise
      const couple = clip(locked / 1900);
      let slip = (NP_STALL_RPM - idle) * Math.pow(thr, 1.15) * Math.pow(1 - couple, 1.4);
      slip += (s.gear <= 2 ? 160 : 90) * thr;
      if (s.gear >= 3 && thr < 0.5 && mph > 38) slip *= 0.15;
      target = Math.max(idle + (mph < 6 ? thr * 220 : 0), locked + slip);
    }
    target = clip(target, idle * 0.97, red);
    const shifting = s.time - s.lastShiftAt < 0.42;
    const tc = shifting ? 0.26 : target > s.rpm ? (parked ? 0.14 : 0.1) : parked ? 0.32 : 0.16;
    s.rpm = lag(s.rpm, target, h, tc);
  }
  const rpmNorm = clip((s.rpm - idle) / Math.max(1, red - idle));

  // Lift-off → overrun burble envelope (continuous; never a hard gate)
  const dropRate = h > 0 ? (s.prevThr - thr) / h : 0;
  s.thrSlow = lag(s.thrSlow, thr, h, 0.35);
  const rpmGate = clip((s.rpm - 1150) / 900);
  if (thr < 0.14 && s.thrSlow - thr > 0.1 && s.rpm > 1450) {
    s.overrun = Math.max(s.overrun, clip((s.thrSlow - thr) * 2.2) * rpmGate);
  }
  if (input?.overrun && s.rpm > 1300) s.overrun = Math.max(s.overrun, 0.8 * rpmGate);
  // Coasting floor: the cam keeps burbling while the car rolls off-throttle
  const coastFloor = thr < 0.06 && speed > 0.08 ? 0.28 * rpmGate : 0;
  const ovrTarget = thr > 0.2 ? 0 : coastFloor;
  const ovrTc = thr > 0.2 ? 0.06 : s.overrun > ovrTarget ? 1.3 : 0.35;
  s.overrun = lag(s.overrun, ovrTarget, h, ovrTc);
  // Fades continuously with rpm (no burble at idle)
  s.overrun = Math.min(s.overrun, rpmGate);

  // PURSUIT spool (turbo lag) + blow-off on fast lift
  const boost = clip(num(params.pursuitBoost, 0));
  const spoolTarget = boost > 0.001 ? clip(thr * 0.85 + rpmNorm * 0.35 + Math.max(0, load) * 0.15) : 0;
  s.spool = lag(s.spool, spoolTarget, h, spoolTarget > s.spool ? 0.45 : 0.7);
  if (boost > 0.001 && s.spool > 0.4 && dropRate > 1.6) s.blowoff = Math.max(s.blowoff, s.spool);
  s.blowoff = lag(s.blowoff, 0, h, 0.2);
  s.prevThr = thr;

  // Load richness (mid + exhaust) — throttle, positive load lean, low-rpm lugging
  const lug = clip(1 - rpmNorm * 1.6) * thr;
  s.loadRich = lag(s.loadRich, clip(thr * 0.72 + Math.max(0, load) * 0.45 + lug * 0.25), h, 0.12);

  return {
    rpm: s.rpm,
    rpmNorm,
    gear: s.gear,
    overrun: clip(s.overrun),
    spool: s.spool,
    blowoff: s.blowoff,
    loadRich: s.loadRich,
    modelled: s.modelled,
  };
}

/**
 * Worklet AudioParam targets for the Night Pursuit opt-ins + load/pursuit seasoning.
 * `base` = values the generic ICE path would push; returned object overrides them.
 */
export function nightPursuitWorkletTargets(params, drive, thr, base = {}) {
  const p = params || {};
  const loadAmt = clip(num(p.loadRich, 0.7));
  const lr = clip(drive.loadRich * loadAmt);
  const boost = clip(num(p.pursuitBoost, 0));
  const growl0 = num(base.growl, num(p.growl, 0.8));
  const intake0 = num(base.intake, num(p.intake, 0.55));
  const muff0 = num(base.mufflerMix, num(p.muffling, 0.36));
  return {
    camLope: clip(num(p.camLope, 0.7)),
    bankSplit: clip(num(p.bankSplit, 0.8)),
    overrun: clip(drive.overrun),
    overrunBurble: clip(num(p.overrunBurble, 0.6)),
    // Only needed once pulses start to overlap; idle keeps its sub-firing lump content
    dcGuard: clip((num(drive.rpm, 700) - 1500) / 1300),
    growl: clip(growl0 * (0.86 + lr * 0.34)),
    intake: clip(intake0 * (0.8 + lr * 0.35) * (1 + boost * drive.spool * 0.3)),
    mufflerMix: clip(muff0 * (1.1 - lr * 0.62)),
    exhaustFeedback: clip(num(base.exhaustFeedback, num(p.exhaustFeedback, 0.8)) * (0.97 + lr * 0.04), 0.1, 0.95),
    collectorDelayMs: clip(num(p.collectorDelayMs, 2.5), 0.5, 3),
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

/** Offline renders pre-schedule every frame: piecewise-linear ramps avoid piling up
 * hundreds of cancel+setTarget events (node-web-audio-api mis-renders those). */
let OFFLINE_RAMPS = false;
export function setNightPursuitOfflineScheduling(on) {
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

/**
 * Night Pursuit post chain + PURSUIT seasoning bus + scanner tick.
 *   engine (worklet / osc ICE) → input → HP → low shelf (body) → mid peak (load) → tone LP → dest
 *   PURSUIT: turbo whistle (sine + narrow noise) · intake whoosh · blow-off flutter → dest
 */
export class NightPursuitBus {
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
    this.hp.frequency.value = 26;
    this.hp.Q.value = 0.6;
    this.shelf = n(ctx.createBiquadFilter());
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = 110;
    this.shelf.gain.value = 4;
    this.mid = n(ctx.createBiquadFilter());
    this.mid.type = 'peaking';
    this.mid.frequency.value = 420;
    this.mid.Q.value = 0.85;
    this.mid.gain.value = 0;
    this.tone = n(ctx.createBiquadFilter());
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 1100;
    this.tone.Q.value = 0.5;
    this.out = n(ctx.createGain());
    this.out.gain.value = 0.86;
    this.input.connect(this.hp);
    this.hp.connect(this.shelf);
    // Load rasp: soft-clipped copy of the pipe signal, high-passed — upper firing harmonics
    // appear only under load / revs (organic bark, not a synth lead)
    this.raspDrive = n(ctx.createGain());
    this.raspDrive.gain.value = 5;
    this.raspShaper = n(ctx.createWaveShaper());
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) * 0.85 + 0.15 * x * Math.abs(x);
    }
    this.raspShaper.curve = curve;
    this.raspShaper.oversample = '2x';
    this.raspHp = n(ctx.createBiquadFilter());
    this.raspHp.type = 'highpass';
    this.raspHp.frequency.value = 650;
    this.raspHp.Q.value = 0.6;
    this.raspGain = n(ctx.createGain());
    this.raspGain.gain.value = 0;
    this.hp.connect(this.raspDrive);
    this.raspDrive.connect(this.raspShaper);
    this.raspShaper.connect(this.raspHp);
    this.raspHp.connect(this.raspGain);
    this.raspGain.connect(this.tone);
    this.shelf.connect(this.mid);
    this.mid.connect(this.tone);
    this.tone.connect(this.out);
    this.out.connect(dest);

    // PURSUIT seasoning bus — silent unless pursuitBoost > 0
    this.pursuit = n(ctx.createGain());
    this.pursuit.gain.value = 1;
    this.pursuit.connect(dest);
    const pinkSrc = n(ctx.createBufferSource());
    pinkSrc.buffer = this.pink;
    pinkSrc.loop = true;
    const whiteSrc = n(ctx.createBufferSource());
    whiteSrc.buffer = this.white;
    whiteSrc.loop = true;
    this.sources.push(pinkSrc, whiteSrc);

    this.whistle = n(ctx.createOscillator());
    this.whistle.type = 'sine';
    this.whistle.frequency.value = 2600;
    this.whistleGain = n(ctx.createGain());
    this.whistleGain.gain.value = 0;
    this.whistle.connect(this.whistleGain);
    this.whistleNoiseF = n(ctx.createBiquadFilter());
    this.whistleNoiseF.type = 'bandpass';
    this.whistleNoiseF.frequency.value = 2600;
    this.whistleNoiseF.Q.value = 14;
    this.whistleNoiseG = n(ctx.createGain());
    this.whistleNoiseG.gain.value = 0;
    whiteSrc.connect(this.whistleNoiseF);
    this.whistleNoiseF.connect(this.whistleNoiseG);
    this.whistleGain.connect(this.pursuit);
    this.whistleNoiseG.connect(this.pursuit);

    this.whooshF = n(ctx.createBiquadFilter());
    this.whooshF.type = 'bandpass';
    this.whooshF.frequency.value = 900;
    this.whooshF.Q.value = 0.8;
    this.whooshG = n(ctx.createGain());
    this.whooshG.gain.value = 0;
    pinkSrc.connect(this.whooshF);
    this.whooshF.connect(this.whooshG);
    this.whooshG.connect(this.pursuit);

    this.bovF = n(ctx.createBiquadFilter());
    this.bovF.type = 'bandpass';
    this.bovF.frequency.value = 2400;
    this.bovF.Q.value = 0.9;
    this.bovG = n(ctx.createGain());
    this.bovG.gain.value = 0;
    this.bovAm = n(ctx.createGain());
    this.bovAm.gain.value = 0;
    this.flutter = n(ctx.createOscillator());
    this.flutter.type = 'triangle';
    this.flutter.frequency.value = 21;
    this.flutter.connect(this.bovAm);
    this.bovAm.connect(this.bovG.gain);
    whiteSrc.connect(this.bovF);
    this.bovF.connect(this.bovG);
    this.bovG.connect(this.pursuit);

    this.started = false;
    this.start();
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const s of this.sources) s.start();
    this.whistle.start();
    this.flutter.start();
  }

  /** Continuous morph — call on every setDriving. */
  update(params, drive, thr, tc = 0.06) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const p = params || {};
    const rn = clip(drive.rpmNorm);
    const depth = clip(num(p.bodyDepth, 0.65));
    const lr = clip(drive.loadRich * clip(num(p.loadRich, 0.7)));
    const boost = clip(num(p.pursuitBoost, 0));
    const ovr = clip(drive.overrun);
    // Deep body: strongest at idle, relaxes as revs climb (stays V8, not boomy at WOT)
    setT(this.shelf.gain, depth * (6 - rn * 3.5), t, tc);
    // Load → mid richness (bark), slight dip when unloaded so cruise stays mellow
    setT(this.mid.gain, -1 + lr * 7.5, t, tc);
    setT(this.raspGain.gain, lr * (0.12 + rn * 0.6) * 1.1 + ovr * 0.06, t, tc);
    setT(this.raspHp.frequency, 600 + rn * 700, t, tc);
    setT(this.mid.frequency, 340 + rn * 420 + lr * 90, t, tc);
    // Tone: closed at idle (no buzz), opens with rpm + throttle; overrun keeps a little crack air
    const open = 980 + Math.pow(rn, 0.85) * 3800 + thr * 1500 + lr * 1100 + ovr * 700 + boost * drive.spool * 600;
    setT(this.tone.frequency, Math.min(9000, open), t, tc);

    // PURSUIT seasoning (light turbo + intake), never a jet roar
    const sp = clip(drive.spool);
    const whistleAmt = clip(num(p.turboWhistle, 0.5));
    const whooshAmt = clip(num(p.intakeWhoosh, 0.6));
    const bovAmt = clip(num(p.wastegate, 0.35));
    const wHz = 2300 + sp * 4300 + rn * 600;
    setT(this.whistle.frequency, wHz, t, tc * 1.5);
    setT(this.whistleNoiseF.frequency, wHz * 1.01, t, tc * 1.5);
    const wl = boost * whistleAmt * Math.pow(sp, 1.6) * (0.35 + thr * 0.65);
    setT(this.whistleGain.gain, wl * 0.022, t, tc);
    setT(this.whistleNoiseG.gain, wl * 0.06, t, tc);
    setT(this.whooshF.frequency, 650 + sp * 1900 + thr * 500, t, tc);
    setT(this.whooshG.gain, boost * whooshAmt * sp * sp * (0.35 + thr * 0.65) * 0.11, t, tc);
    const bov = boost * bovAmt * clip(drive.blowoff);
    setT(this.bovG.gain, bov * 0.05, t, 0.03);
    setT(this.bovAm.gain, bov * 0.045, t, 0.03);
    setT(this.bovF.frequency, 1800 + clip(drive.blowoff) * 1400, t, 0.05);
  }

  /** Soft original electronic tick (call in sync with the scanner sweep). pan −1..1. */
  scannerTick(level = 0.5, pan = 0) {
    const lv = clip(level);
    if (lv <= 0.001) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.005;
    try {
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) panner.pan.value = clip(pan, -1, 1) * 0.6;
      const outNode = panner ?? this.dest;
      if (panner) panner.connect(this.dest);
      const parts = [
        { hz: 1320, peak: 0.05, dur: 0.05 },
        { hz: 1980, peak: 0.022, dur: 0.032 },
      ];
      const done = [];
      for (const part of parts) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(part.hz, t0);
        o.frequency.exponentialRampToValueAtTime(part.hz * 0.93, t0 + part.dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, part.peak * lv), t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + part.dur);
        o.connect(g);
        g.connect(outNode);
        o.start(t0);
        o.stop(t0 + part.dur + 0.02);
        done.push(o, g);
        o.onended = () => {
          try {
            o.disconnect();
            g.disconnect();
          } catch {
            /* ignore */
          }
        };
      }
      const nz = ctx.createBufferSource();
      nz.buffer = this.white;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3600;
      f.Q.value = 2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.018 * lv), t0 + 0.0015);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012);
      nz.connect(f);
      f.connect(ng);
      ng.connect(outNode);
      nz.start(t0);
      nz.stop(t0 + 0.02);
      nz.onended = () => {
        try {
          nz.disconnect();
          f.disconnect();
          ng.disconnect();
          if (panner) setTimeout(() => panner.disconnect(), 120);
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* never block drive path */
    }
  }

  dispose() {
    for (const s of [...this.sources, this.whistle, this.flutter]) {
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

// ─── Pack-specific cues: heavy V8 crank → catch → flare, and lumpy rundown ───

function env(g, t0, peak, attack, release, hold = 0) {
  const p = Math.max(0.0001, peak);
  g.gain.value = 0.0001; // silent until t0 (default gain 1 would leak before the envelope)
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
  o.frequency.exponentialRampToValueAtTime(hz * 0.7, t + len);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpHz;
  lp.Q.value = 0.8;
  const g = ctx.createGain();
  env(g, t, peak, 0.006, len);
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
  bp.frequency.value = lpHz * 0.55;
  bp.Q.value = 1.1;
  const ng = ctx.createGain();
  env(ng, t, peak * 0.9, 0.005, len * 0.85);
  nz.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  nz.start(t);
  nz.stop(t + len + 0.05);
  nz.onended = cleanup(nz, bp, ng);
}

export const NP_STARTER_SECONDS = 1.75;
export const NP_SHUTOFF_SECONDS = 1.25;

/** Heavy cross-plane V8 crank (slow compression-loaded starter) → catch → flare. */
export function playNightPursuitStarter(ctx, dest, params, whiteBuf, pinkBuf) {
  const now = ctx.currentTime + 0.02;
  const growl = clip(num(params?.growl, 0.8));
  const jit = clip(num(params?.pulseJitter, 0.36));
  const crankEnd = now + 0.95;

  // Starter motor gear whine, dipping on every compression stroke (~4/rev @ ~190 rpm crank)
  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  const mBp = ctx.createBiquadFilter();
  mBp.type = 'bandpass';
  mBp.frequency.value = 900;
  mBp.Q.value = 1.4;
  const mLp = ctx.createBiquadFilter();
  mLp.type = 'lowpass';
  mLp.frequency.value = 1800;
  const mG = ctx.createGain();
  mG.gain.setValueAtTime(0.0001, now);
  mG.gain.exponentialRampToValueAtTime(0.11, now + 0.05);
  mG.gain.setValueAtTime(0.11, crankEnd - 0.05);
  mG.gain.exponentialRampToValueAtTime(0.0001, crankEnd + 0.12);
  motor.connect(mBp);
  mBp.connect(mLp);
  mLp.connect(mG);
  mG.connect(dest);
  let t = now;
  let gap = 0.085;
  motor.frequency.setValueAtTime(150, now);
  let k = 0;
  while (t < crankEnd) {
    const heavy = k % 2 === 0 ? 1.12 : 0.9; // cross-plane: uneven compression load per bank
    const j = 1 + (Math.random() * 2 - 1) * jit * 0.18;
    motor.frequency.linearRampToValueAtTime(205 + k * 2.5, t + gap * 0.45);
    motor.frequency.linearRampToValueAtTime((168 + k * 2.5) / heavy, t + gap * 0.95);
    // Compression chuff (no fire yet)
    thump(ctx, dest, pinkBuf, t + gap * 0.9, 52 + growl * 10, 0.17 * heavy, 0.06, 320);
    t += gap * heavy * j;
    gap *= 0.985;
    k++;
  }
  motor.start(now);
  motor.stop(crankEnd + 0.2);
  motor.onended = cleanup(motor, mBp, mLp, mG);

  // Bendix grind on engage
  const nz = ctx.createBufferSource();
  nz.buffer = whiteBuf;
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 2400;
  nbp.Q.value = 1.8;
  const ng = ctx.createGain();
  env(ng, now, 0.035, 0.004, 0.09);
  nz.connect(nbp);
  nbp.connect(ng);
  ng.connect(dest);
  nz.start(now);
  nz.stop(now + 0.15);
  nz.onended = cleanup(nz, nbp, ng);

  // Catch: first ragged fires, accelerating
  const catches = [0, 0.11, 0.19, 0.25, 0.3, 0.345];
  for (let i = 0; i < catches.length; i++) {
    const ct = crankEnd - 0.06 + catches[i] + (Math.random() * 2 - 1) * 0.008;
    thump(ctx, dest, pinkBuf, ct, 64 + growl * 14 + i * 4, (0.26 + i * 0.04) * (i % 2 ? 0.82 : 1), 0.09, 520 + i * 40);
  }

  // Flare to ~1.4k then settle into the lope (noise body through a sweeping low-pass)
  const flareT = crankEnd + 0.3;
  const fl = ctx.createBufferSource();
  fl.buffer = pinkBuf;
  fl.loop = true;
  const flF = ctx.createBiquadFilter();
  flF.type = 'lowpass';
  flF.Q.value = 2.2;
  flF.frequency.setValueAtTime(180, flareT);
  flF.frequency.exponentialRampToValueAtTime(620, flareT + 0.18);
  flF.frequency.exponentialRampToValueAtTime(240, flareT + 0.62);
  const flG = ctx.createGain();
  flG.gain.setValueAtTime(0.0001, flareT);
  flG.gain.exponentialRampToValueAtTime(0.36 + growl * 0.1, flareT + 0.12);
  flG.gain.exponentialRampToValueAtTime(0.0001, flareT + 0.62);
  const flAm = ctx.createGain();
  flAm.gain.value = 0;
  const flLfo = ctx.createOscillator();
  flLfo.type = 'sine';
  flLfo.frequency.setValueAtTime(48, flareT);
  flLfo.frequency.exponentialRampToValueAtTime(92, flareT + 0.18);
  flLfo.frequency.exponentialRampToValueAtTime(48, flareT + 0.62);
  const flD = ctx.createGain();
  flD.gain.value = 0.6;
  flLfo.connect(flD);
  flD.connect(flAm.gain);
  fl.connect(flF);
  flF.connect(flAm);
  flAm.connect(flG);
  flG.connect(dest);
  fl.start(flareT);
  fl.stop(flareT + 0.7);
  flLfo.start(flareT);
  flLfo.stop(flareT + 0.7);
  fl.onended = cleanup(fl, flF, flAm, flG, flLfo, flD);

  return NP_STARTER_SECONDS;
}

/** Key-off rundown: lumpy last fires slowing, pitch sagging, mount shudder + settle clunk. */
export function playNightPursuitShutoff(ctx, dest, params, whiteBuf, pinkBuf) {
  const now = ctx.currentTime + 0.01;
  const growl = clip(num(params?.growl, 0.8));
  const crackle = clip(num(params?.crackle, 0.3));
  let t = now;
  let gap = 0.058;
  const fires = 11;
  for (let i = 0; i < fires; i++) {
    const bank = [0, 1, 0, 0, 1, 0, 1, 1][i % 8];
    const lumpy = bank ? 0.86 : 1.1;
    const fade = 1 - i / (fires + 2);
    thump(ctx, dest, pinkBuf, t, (70 - i * 3.2) * (0.9 + growl * 0.2), 0.2 * fade * lumpy, 0.08 + i * 0.006, 460 - i * 22);
    if (crackle > 0.1 && (i === 3 || i === 6)) {
      const nz = ctx.createBufferSource();
      nz.buffer = whiteBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1900;
      const ng = ctx.createGain();
      env(ng, t + 0.012, crackle * 0.05, 0.002, 0.025);
      nz.connect(hp);
      hp.connect(ng);
      ng.connect(dest);
      nz.start(t);
      nz.stop(t + 0.06);
      nz.onended = cleanup(nz, hp, ng);
    }
    t += gap * (bank ? 1.18 : 0.88);
    gap *= 1.14;
  }
  // Mount shudder: low wobble as the block rocks back
  const sh = now + 0.62;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(38, sh);
  o.frequency.exponentialRampToValueAtTime(26, sh + 0.35);
  const am = ctx.createGain();
  am.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 9;
  const lfoD = ctx.createGain();
  lfoD.gain.value = 0.5;
  lfo.connect(lfoD);
  lfoD.connect(am.gain);
  const g = ctx.createGain();
  env(g, sh, 0.22, 0.03, 0.34);
  o.connect(am);
  am.connect(g);
  g.connect(dest);
  o.start(sh);
  o.stop(sh + 0.45);
  lfo.start(sh);
  lfo.stop(sh + 0.45);
  o.onended = cleanup(o, am, g, lfo, lfoD);
  // Settle clunk
  thump(ctx, dest, pinkBuf, now + 1.0, 96, 0.12, 0.12, 300);
  return NP_SHUTOFF_SECONDS;
}

/** Pack mode → audio seasoning (matches src/packs/audioBridge boostForMode). */
export function nightPursuitBoostForMode(mode) {
  const m = String(mode || '').toLowerCase();
  return m === 'pursuit' ? 1 : m === 'power' ? 0.5 : 0;
}
