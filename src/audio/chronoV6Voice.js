// Chrono Coupe — rear-mounted 90° V6 voice (main-thread side of worklets/chrono-v6-processor.js).
// Plain JS so EngineSynthImpl (browser) and the offline renderers (node) share the SAME live
// targets, startup / shutdown plans and cue logic.
//
// The startup and shutdown are played BY THE ENGINE ITSELF: the plans below automate the
// worklet's crank speed, combustion, compression and starter, so cranking, catch, flare,
// settle, fuel cut, run-down and the final rock come from the same crank model as the running
// engine. A throttle press during a cue glides every param to the live targets (~300 ms).
// Fully procedural; no storage.

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const sstep = (x) => {
  const t = clip(x);
  return t * t * (3 - 2 * t);
};

export const CHRONO_V6_PROCESSOR = 'chrono-v6-processor';
/** Startup: solenoid → odd-fire cranking → catch → flare → settle to an uneven idle. */
export const V6_STARTUP_SECONDS = 2.1;
/** Throttle above this during a cue (or while waiting for ignition) hands over to live. */
export const V6_TAKEOVER_THROTTLE = 0.15;
/** Glide time constant for the hand-over (≈ 300 ms to settle). */
export const V6_TAKEOVER_TC = 0.1;
/** start() without a playStarter() within this time → the engine simply runs (resume, layers). */
export const V6_IGNITION_WAIT_S = 0.4;
/** Params a cue owns while it plays. */
const CUE_PARAMS = ['rpm', 'throttle', 'fire', 'comp', 'starter'];
const EDGE_PARAMS = ['rock', 'settle', 'tick'];
const STEP = 0.02;

/** Run-down length from rpm r0 (s). */
export function v6RundownSeconds(r0, idleRpm = 860) {
  return 1.35 + 0.25 * clip((num(r0, idleRpm) - idleRpm) / 3000);
}
/** Whole shutdown cue length from rpm r0 (run-down + rock + settle + ticks). */
export function v6ShutdownSeconds(r0, idleRpm = 860) {
  return v6RundownSeconds(r0, idleRpm) + 1.25;
}

/** Startup plan value at t seconds after the key (idle = target idle rpm). */
export function v6StartupAt(t, idleRpm = 860) {
  const I = num(idleRpm, 860);
  const crank = (u) => (u < 0.12 ? 225 * sstep(u / 0.12) : 225 + (22 * (u - 0.12)) / 0.83);
  const starter = t < 0.95 ? 1 : 0;
  let rpm;
  let fire = 0;
  if (t < 0.82) rpm = crank(t);
  else {
    fire = clip((t - 0.82) / 0.22);
    const c0 = crank(0.82);
    const flare = (u) => c0 + (1850 - c0) * (1 - Math.exp(-Math.max(0, u - 0.9) / 0.12));
    if (t <= 1.3) rpm = flare(t);
    else {
      const r13 = flare(1.3);
      rpm = I + (r13 - I) * Math.exp(-(t - 1.3) / 0.2) - 0.07 * I * Math.sin(Math.PI * clip((t - 1.45) / 0.55));
    }
  }
  const throttle = 0.22 * Math.sin(Math.PI * clip((t - 0.86) / 0.4));
  const comp = t < 0.9 ? 1 : 1 - 0.9 * clip((t - 0.9) / 0.4);
  return { rpm, fire, comp, starter, throttle };
}

/** Shutdown plan value at t seconds after key-off, from rpm r0. */
export function v6ShutdownAt(t, r0, idleRpm = 860) {
  const T = v6RundownSeconds(r0, idleRpm);
  const rpm = num(r0, idleRpm) * Math.pow(1 - clip(t / T), 1.7);
  return { rpm, fire: 1 - clip(t / 0.16), comp: clip(t / 0.25), starter: 0, throttle: 0 };
}

/**
 * Live worklet targets from the Chrono Coupe drive model (stepChronoCoupeDrive output).
 * `level` is the loudness-calibrated output gain (matches the previous Chrono Coupe engine at
 * idle / cruise / full within ±1 dB, see docs/chrono-coupe-v6.md).
 */
export function chronoV6Targets(params, drive, thr, load = 0) {
  const p = params || {};
  const th = clip(thr);
  const rn = clip(num(drive?.rpmNorm, 0));
  const lvl = num(p.v6Level, 1) * (0.475 + 0.7 * th * th + 0.1 * rn);
  return {
    rpm: clip(num(drive?.rpm, 860), 0, 9000),
    throttle: th,
    load: clip(num(load, 0), -1, 1),
    fire: 1,
    comp: 0.1,
    starter: 0,
    overrun: clip(num(drive?.overrun, 0)),
    rasp: clip(num(p.v6Rasp, 0.55)),
    lump: clip(num(p.v6Lump, 0.6)),
    level: lvl,
  };
}

/** Browser + node: addModule once per context (node-web-audio-api wants a path, not file://). */
const loaded = new WeakMap();
export function ensureChronoV6Module(ctx, url) {
  let pr = loaded.get(ctx);
  if (pr) return pr;
  let u = String(url);
  if (u.startsWith('file:') && typeof process !== 'undefined' && process.versions?.node) {
    u = decodeURIComponent(new URL(u).pathname);
  }
  pr = ctx.audioWorklet.addModule(u);
  loaded.set(ctx, pr);
  pr.catch(() => loaded.delete(ctx));
  return pr;
}

export class ChronoV6Voice {
  /** node: AudioWorkletNode('chrono-v6-processor'), already connected by the caller. */
  constructor(ctx, node) {
    this.ctx = ctx;
    this.node = node;
    this.cue = null; // { type, t0, end, at(t) }
    this.awaitSince = -1;
    this.live = null;
    this.glideUntil = -1; // after a take-over, live updates keep the ~300 ms glide
    this.waitS = V6_IGNITION_WAIT_S;
  }

  static create(ctx, dest, seed) {
    const node = new AudioWorkletNode(ctx, CHRONO_V6_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { seed: (num(seed, 0x5eed) >>> 0) || 0x5eed },
    });
    node.connect(dest);
    return new ChronoV6Voice(ctx, node);
  }

  param(name) {
    return this.node.parameters.get(name);
  }

  /** True while a startup / shutdown plan owns the crank. */
  cueActive(now = this.ctx.currentTime) {
    if (this.cue && now >= this.cue.end) this.cue = null;
    return !!this.cue;
  }

  /** Combustion amount right now (plan value during a cue, 0 while waiting for the key). */
  combustion(now = this.ctx.currentTime) {
    if (this.awaitSince >= 0) return 0;
    if (this.cueActive(now)) {
      const u = now - this.cue.t0;
      return u < 0 ? (this.cue.type === 'startup' ? 0 : 1) : clip(this.cue.at(u).fire);
    }
    return 1;
  }

  get cueType() {
    return this.cueActive() ? this.cue.type : null;
  }

  /** Live drive targets (call on every setDriving). Cue-owned params are left to the cue. */
  setLive(t, tc = 0.06, now = this.ctx.currentTime) {
    this.live = t;
    const owned = this.cueActive(now) || this.awaitSince >= 0;
    const gtc = now < this.glideUntil ? Math.max(tc, V6_TAKEOVER_TC) : tc;
    for (const [k, v] of Object.entries(t)) {
      if (owned && CUE_PARAMS.includes(k)) continue;
      this.glide(k, v, now, CUE_PARAMS.includes(k) ? gtc : tc);
    }
  }

  glide(name, value, now, tc) {
    const prm = this.param(name);
    if (!prm || !Number.isFinite(value)) return;
    try {
      prm.cancelScheduledValues(now);
      prm.setTargetAtTime(value, now, Math.max(0.005, tc));
    } catch {
      prm.value = value;
    }
  }

  /** start(): silent and waiting for the key (playStarter) — rpm 0, no combustion. */
  armIgnition(now = this.ctx.currentTime, waitS = V6_IGNITION_WAIT_S) {
    this.cue = null;
    this.awaitSince = now;
    this.waitS = Math.max(0, num(waitS, V6_IGNITION_WAIT_S));
    for (const k of [...CUE_PARAMS, ...EDGE_PARAMS]) {
      const prm = this.param(k);
      if (!prm) continue;
      prm.cancelScheduledValues(now);
      prm.setValueAtTime(0, now);
    }
  }

  /** No key within V6_IGNITION_WAIT_S (resume / layer engines): just run. */
  checkIgnitionWait(now = this.ctx.currentTime) {
    if (this.awaitSince >= 0 && now - this.awaitSince >= num(this.waitS, V6_IGNITION_WAIT_S)) this.takeOver(now, 0.08);
  }

  schedule(type, at, dur, t0 = this.ctx.currentTime) {
    const start = t0 + 0.01;
    for (const k of CUE_PARAMS) {
      const prm = this.param(k);
      if (!prm) continue;
      prm.cancelScheduledValues(t0);
      prm.setValueAtTime(at(0)[k], start);
      for (let u = STEP; u < dur + 1e-9; u += STEP) prm.linearRampToValueAtTime(at(u)[k], start + u);
    }
    this.cue = { type, t0: start, end: start + dur, at };
    return start;
  }

  /** Key → crank → catch → flare → settle (V6_STARTUP_SECONDS). */
  startup(idleRpm, now = this.ctx.currentTime) {
    this.awaitSince = -1;
    const I = num(idleRpm, 860);
    for (const k of EDGE_PARAMS) this.param(k)?.setValueAtTime(0, now);
    this.schedule('startup', (u) => v6StartupAt(u, I), V6_STARTUP_SECONDS, now);
    // Hand back to the live targets right at the end (same values: idle, fire 1, comp 0.1)
    return V6_STARTUP_SECONDS;
  }

  /** Fuel cut → run-down (odd-fire lope) → rock → settle → faint ticks. Returns seconds. */
  shutdown(idleRpm, now = this.ctx.currentTime) {
    this.awaitSince = -1;
    const I = num(idleRpm, 860);
    const r0 = this.cueActive(now) ? this.cue.at(now - this.cue.t0).rpm : num(this.live?.rpm, I);
    const T = v6RundownSeconds(r0, I);
    const dur = v6ShutdownSeconds(r0, I);
    const start = this.schedule('shutdown', (u) => v6ShutdownAt(u, r0, I), T + 0.04, now);
    this.cue.end = start + dur;
    const ov = this.param('overrun');
    if (ov) {
      ov.cancelScheduledValues(now);
      ov.setTargetAtTime(0, now, 0.03);
    }
    const edge = (k, on, off) => {
      const prm = this.param(k);
      if (!prm) return;
      prm.cancelScheduledValues(now);
      prm.setValueAtTime(0, now);
      prm.setValueAtTime(1, start + on);
      prm.setValueAtTime(0, start + off);
    };
    edge('rock', T + 0.02, T + 0.12);
    edge('settle', T + 0.08, T + 0.2);
    edge('tick', T + 0.45, T + 1.2);
    return dur;
  }

  /** Throttle (or a new start) during a cue: glide everything to the live targets (~300 ms). */
  takeOver(now = this.ctx.currentTime, tc = V6_TAKEOVER_TC) {
    const live = this.live;
    const from = this.cueActive(now) ? this.cue.at(now - this.cue.t0) : null;
    this.cue = null;
    this.awaitSince = -1;
    this.glideUntil = now + 3 * tc;
    for (const k of CUE_PARAMS) {
      const prm = this.param(k);
      if (!prm) continue;
      const target = live && Number.isFinite(live[k]) ? live[k] : k === 'fire' ? 1 : 0;
      try {
        prm.cancelScheduledValues(now);
        if (from) prm.setValueAtTime(from[k], now);
        prm.setTargetAtTime(k === 'starter' ? 0 : target, now, tc);
      } catch {
        prm.value = target;
      }
    }
    for (const k of EDGE_PARAMS) {
      const prm = this.param(k);
      if (!prm) continue;
      prm.cancelScheduledValues(now);
      prm.setValueAtTime(0, now);
    }
  }

  dispose() {
    try {
      this.node.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.node.port?.close?.();
    } catch {
      /* ignore */
    }
  }
}
