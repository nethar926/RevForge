// Night Pursuit key-off: big cross-plane V8 run-down, synthesized per sample (no recordings).
//
// Ignition cut → a couple of residual fires → the crank coasts down with every cylinder's
// compression / exhaust pulse individually audible (cross-plane bank pattern, compression
// lope as it slows), each one a chunky thump with low-mid block / head weight, over the V8's
// firing-order groan and exhaust pipes that ring longer as the revs fall → heavy shudder as
// the block rocks forward and back on its mounts + clunk → short, dark pipe settle → optional
// faint cooling tick. About 2.45–2.8 s. Energy sits in 40–400 Hz (sub-36 Hz is filtered off).
//
// renderNightPursuitShutdown() is a pure function (sample rate, options, random source) so it
// can be tested and rendered offline. startNightPursuitShutdown() plays it into a node graph
// through one gain node and returns a handle that can be cancelled (throttle / restart).

const clip = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Cross-plane V8 firing order 1-8-4-3-6-5-7-2 → bank (0 = left, 1 = right) per 90° event. */
export const NP_SHUTDOWN_BANKS = [0, 1, 0, 0, 1, 0, 1, 1];
/** Residual fires after the ignition cut (seconds). */
export const NP_SHUTDOWN_FIRE_S = 0.07;
/** Tail after the crank stops: shudder, clunk, settle, tick. */
export const NP_SHUTDOWN_TAIL_S = 1.25;
/**
 * Output level of the cue (calibrated through the shipped chain + HIG master: integrated loudness
 * ≈ idle + 1 dB, loudest 400 ms ≈ idle + 3.5 dB, opens at the idle level).
 */
export const NP_SHUTDOWN_LEVEL = 0.172;
/** Internal scale: peak ≈ 0.8 for a key-off from idle. */
const NP_SHUTDOWN_SCALE = 0.0165;

/** Run-down time from rpm r0 to rest (longer from higher revs). */
export function npRundownSeconds(r0, idle = 660) {
  return 1.2 + 0.4 * clip((num(r0, idle) - idle) / 2200);
}
export function npShutdownSeconds(r0, idle = 660) {
  return npRundownSeconds(r0, idle) + NP_SHUTDOWN_TAIL_S;
}

/** Mean crank speed during the run-down (before the compression lope). */
export function npRundownRpm(t, r0, T) {
  if (t >= T) return 0;
  return r0 * Math.pow(1 - t / T, 1.45);
}

/** Two-pole resonator (state in typed arrays: no per-sample allocation). tune() re-voices it. */
class Reso {
  constructor(sr, hz, tau) {
    this.sr = sr;
    this.k = new Float64Array(5);
    this.tune(hz, tau);
  }
  tune(hz, tau) {
    const r = Math.exp(-1 / (tau * this.sr));
    const k = this.k;
    k[0] = (1 - r * r) * 0.5;
    k[1] = 2 * r * Math.cos((2 * Math.PI * hz) / this.sr);
    k[2] = r * r;
  }
  run(x) {
    const k = this.k;
    const y = k[0] * x + k[1] * k[3] - k[2] * k[4];
    k[4] = k[3];
    k[3] = y;
    return y;
  }
}
class OnePole {
  constructor(sr, hz) {
    this.k = new Float64Array([1 - Math.exp((-2 * Math.PI * hz) / sr), 0]);
  }
  run(x) {
    const k = this.k;
    return (k[1] += k[0] * (x - k[1]));
  }
}
/** 2nd-order high-pass (RBJ, Q 0.707): keeps sub-audible rumble from eating the headroom. */
class HighPass {
  constructor(sr, hz) {
    const w = (2 * Math.PI * hz) / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
    this.k = new Float64Array([(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0, 0, 0, 0, 0]);
  }
  run(x) {
    const k = this.k;
    const y = k[0] * x + k[1] * k[5] + k[2] * k[6] - k[3] * k[7] - k[4] * k[8];
    k[6] = k[5];
    k[5] = x;
    k[8] = k[7];
    k[7] = y;
    return y;
  }
}
const reso = (sr, hz, tau) => new Reso(sr, hz, tau);
const onePole = (sr, hz) => new OnePole(sr, hz);
const TAU = 2 * Math.PI;
/** Firing-harmonic weight: fades a partial in above ~28 Hz so the groan never turns into DC wobble. */
const audible = (hz) => clip((hz - 28) / 22) * clip((900 - hz) / 300);

/**
 * Render the key-off cue. opts: { rpm (at the cut), idleRpm, growl 0..1, tick 0..1 }; rand: 0..1 source.
 * Returns { data: Float32Array (mono, fixed calibration, soft ceiling 0.95), events: [{t, kind, bank, amp}],
 * stopAt (crank at rest), duration }.
 */
export function renderNightPursuitShutdown(sr, opts = {}, rand = Math.random) {
  const idle = clip(num(opts.idleRpm, 660), 400, 1200);
  const r0 = clip(num(opts.rpm, idle), idle * 0.9, 3200);
  const growl = clip(num(opts.growl, 0.8));
  const tickLevel = clip(num(opts.tick, 1));
  const T = npRundownSeconds(r0, idle);
  const duration = T + NP_SHUTDOWN_TAIL_S;
  const n = Math.ceil(duration * sr);
  const out = new Float32Array(n);
  const events = [];

  // Exhaust: unequal left / right bank pipes (cross-plane rumble), collector modes, block mode.
  // The pipes ring longer as the gas slows (re-voiced every 32 samples).
  const pipeLHz = 74 + growl * 8, pipeRHz = 67 + growl * 8;
  const pipeL = reso(sr, pipeLHz, 0.026);
  const pipeR = reso(sr, pipeRHz, 0.029);
  const coll = reso(sr, 112, 0.024); // collector / X-pipe mode
  const pipe2 = reso(sr, 158, 0.02);
  const body = reso(sr, 51, 0.04);
  // Low-mid cylinder body: block, heads and intake plenum answer every compression thump
  const midL = reso(sr, 182, 0.016), midR = reso(sr, 197, 0.015);
  const mid2 = reso(sr, 258, 0.012), mid3 = reso(sr, 334, 0.009);
  const airLp1 = onePole(sr, 420), airLp2 = onePole(sr, 420);
  const fireLp = onePole(sr, 1200);
  // Shudder / clunk / settle / tick
  const mount = reso(sr, 36, 0.09);
  const mount2 = reso(sr, 52, 0.07);
  const thud = reso(sr, 71, 0.07);
  const clunkLo = reso(sr, 148, 0.05), clunkMid = reso(sr, 226, 0.04);
  const rattle = reso(sr, 230, 0.05);
  const knock = reso(sr, 380, 0.035);
  const setLp1 = onePole(sr, 200), setLp2 = onePole(sr, 200);
  const bedLp1 = onePole(sr, 150), bedLp2 = onePole(sr, 150), bedLp3 = onePole(sr, 150);
  let bedEnv = 0;
  const tickA = reso(sr, 1600, 0.014), tickB = reso(sr, 2600, 0.009);
  // Below ~36 Hz a car speaker gives nothing back but excursion: keep the energy in 40–400 Hz
  const hp = new HighPass(sr, 36);

  // Per-cylinder imbalance (fixed for this cue) so the coast-down isn't a metronome
  const cyl = Array.from({ length: 8 }, () => 0.85 + 0.3 * rand());

  // Noise table (procedural, filled once per cue) → cheap per-sample noise
  const NZ = 8192;
  const noise = new Float32Array(NZ);
  for (let i = 0; i < NZ; i++) noise[i] = rand() * 2 - 1;
  let nzi = 0;
  const nz = () => noise[(nzi = (nzi + 1) & (NZ - 1))];
  // Active pulse voices: { j (samples since onset), w (samples), wk (thump samples), a, bank, fire, tail, td }
  const voices = [];
  let fires = 0;
  let theta = 0; // crank degrees since the cut
  let nextEv = 0; // next event angle
  let k = 0;
  let stopAt = T;
  let stopped = false;
  let lastEv = 0;
  let rpmNow = r0;
  let groanEnv = 1;
  const tShudder = { t: -1 };
  const ticks = [];
  const base0 = (t) => npRundownRpm(t, r0, T);
  const fadeInN = Math.max(1, Math.round(0.02 * sr)); // crossfades with the 30 ms ignition cut: no step
  // Handoff: the cue opens at the running engine's level and swells into its full weight over
  // ~0.4 s, so the key-off never jumps out (the last compressions are the heaviest anyway)
  const swellN = Math.round(0.4 * sr);
  const SWELL_FLOOR = 0.7;

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // Crank: mean run-down plus compression lope (slows into each TDC, speeds after) that
    // grows as the revs fall — the last revolutions lurch.
    if (!stopped) {
      const base = npRundownRpm(t, r0, T);
      const ph = ((theta % 90) / 90) * 2 * Math.PI;
      const lope = 0.55 * clip(1 - base / 520);
      const rpm = Math.max(0, base * (1 - lope * Math.cos(ph)));
      rpmNow = rpm;
      theta += (rpm * 6) / sr;
      if (base <= 0) {
        stopped = true;
        stopAt = t;
      } else if (k > 0 && t - lastEv > 0.06) {
        // The crank won't make the next compression: it stops here and rocks back (no dead gap)
        const need = (nextEv - theta) / Math.max(1e-6, base * 6);
        if (need > 0.12 || t + need > T) {
          stopped = true;
          stopAt = t;
        }
      }
      while (theta >= nextEv && !stopped) {
        const bank = NP_SHUTDOWN_BANKS[k % 8];
        const fire = t < NP_SHUTDOWN_FIRE_S && fires < 3;
        const slow = clip(base / idle);
        let a;
        if (fire) a = 0.5 - 0.08 * fires++;
        else a = (0.55 + Math.pow(1 - slow, 1.2)) * (bank ? 0.88 : 1.1) * cyl[k % 8] * (0.92 + 0.16 * rand());
        // Above idle the pulses come faster: keep the power about where it is at idle
        if (base > idle) a *= Math.max(0.25, idle / base);
        // Pulse width: short and hard for a fire, wider / softer as the crank slows
        const w = fire ? 0.0055 : 0.008 + 0.016 * (1 - slow);
        const ws = Math.max(8, Math.round(w * sr));
        // Compression thump: a short knock into the block / heads (low-mid weight), fuller as it slows
        const wk = Math.max(4, Math.round((fire ? 0.0026 : 0.003 + 0.0016 * (1 - slow)) * sr));
        voices.push({ j: 0, w: ws, wk, a, bank, fire, tail: 1, td: Math.exp(-1 / (ws * 0.5)) });
        events.push({ t, kind: fire ? 'fire' : 'pulse', bank, amp: a });
        lastEv = t;
        nextEv += 90;
        k++;
      }
    } else rpmNow = 0;
    if (stopped && tShudder.t < 0) {
      // Block rocks back on its mounts right after the last compression
      tShudder.t = Math.max(t, lastEv + 0.04);
      const t1 = tShudder.t + 0.75 + 0.25 * rand();
      if (tickLevel > 0) {
        ticks.push(Math.round(t1 * sr));
        if (rand() < 0.6) ticks.push(Math.round((t1 + 0.35 + 0.3 * rand()) * sr));
      }
    }
    // Exhaust rings longer as the revs fall (gas slows, pipes keep sounding between pulses)
    if ((i & 31) === 0) {
      const ring = 1 + 0.6 * clip(1 - rpmNow / idle);
      pipeL.tune(pipeLHz * (0.97 + 0.03 * clip(rpmNow / idle)), 0.026 * ring);
      pipeR.tune(pipeRHz * (0.97 + 0.03 * clip(rpmNow / idle)), 0.029 * ring);
      coll.tune(112, 0.024 * ring);
    }

    // Pulses → pipes, thumps → block / heads
    let exL = 0, exR = 0, air = 0, fx = 0, thL = 0, thR = 0;
    for (let v = voices.length - 1; v >= 0; v--) {
      const p = voices[v];
      const j = p.j++;
      if (j >= p.w * 2) {
        voices.splice(v, 1);
        continue;
      }
      const shape = j < p.w ? Math.sin((Math.PI * j) / p.w) : 0; // half-sine gas pulse
      const th = j < p.wk ? Math.sin((Math.PI * j) / p.wk) : 0;
      const tail = (p.tail *= p.td); // turbulent air behind it
      const r = nz();
      const e = p.a * shape;
      if (p.bank) {
        exR += e;
        thR += p.a * th;
      } else {
        exL += e;
        thL += p.a * th;
      }
      air += p.a * tail * r * (p.fire ? 0.4 : 0.5);
      if (p.fire) fx += p.a * tail * r;
    }
    // Coast bed: the block, pump and air keep moving between pulses, fading as the crank stops
    const bedT = stopped ? 0 : Math.pow(clip(npRundownRpm(t, r0, T) / idle, 0, 1.5), 0.35);
    bedEnv += (bedT - bedEnv) * (stopped ? 0.0015 : 0.002) * (48000 / sr);
    // Firing-order groan: the V8's fundamental and its harmonics follow the crank all the way
    // down (cosine-locked to the pulses), each partial fading out as it drops below ~30 Hz
    const fHz = (rpmNow * 4) / 60;
    const gT = stopped ? 0 : Math.pow(clip(base0(t) / idle, 0, 1.5), 0.9) * (r0 > idle ? Math.sqrt(idle / Math.max(idle, rpmNow)) : 1);
    groanEnv += (gT - groanEnv) * 0.004 * (48000 / sr);
    const fp = TAU * (theta / 90);
    let groan = 0;
    if (groanEnv > 1e-4) {
      groan =
        Math.cos(fp) * audible(fHz) +
        0.75 * Math.cos(2 * fp + 0.5) * audible(2 * fHz) +
        0.45 * Math.cos(3 * fp + 1.1) * audible(3 * fHz) +
        0.5 * Math.cos(0.5 * fp) * audible(0.5 * fHz) * (1 + growl * 0.4);
      groan *= groanEnv;
    }
    let bodyX = (exL + exR) * 6 + groan * 1.3;
    let pipeLX = exL * 12 + groan * 0.8;
    let y = pipeR.run(exR * 12 + groan * 0.8) + coll.run((exL + exR) * 5 + groan * 0.9) * 1.2 + pipe2.run((exL + exR) * 3);
    y += midL.run(thL * 7) * 1.6 + midR.run(thR * 7.6) * 1.6 + mid2.run((thL + thR) * 5) * 1.3 + mid3.run((thL + thR) * 3.2) * 0.9;
    y += airLp2.run(airLp1.run(air)) * 0.5 + fireLp.run(fx) * 0.2 + bedLp3.run(bedLp2.run(bedLp1.run(nz()))) * bedEnv * 40;

    // Shudder (rock forward, rock back) + rattle + clunk
    if (tShudder.t >= 0) {
      const j = i - Math.round(tShudder.t * sr);
      let ex = 0, rx = 0, kx = 0;
      const w1 = 0.035 * sr, b2 = 0.15 * sr, w2 = 0.05 * sr;
      if (j >= 0 && j < w1) ex = Math.sin((Math.PI * j) / w1);
      else if (j >= b2 && j < b2 + w2) ex = -0.55 * Math.sin((Math.PI * (j - b2)) / w2);
      if (j >= 0.025 * sr && j < 0.1 * sr) rx = nz() * Math.exp(-(j - 0.025 * sr) / (0.02 * sr));
      const jc = j - Math.round(0.11 * sr);
      if (jc >= 0 && jc < 0.014 * sr) kx = Math.sin((Math.PI * jc) / (0.014 * sr));
      y += mount.run(ex * 10) + mount2.run(ex * 12) + thud.run(ex * 12 + kx * 5) * 1.5;
      y += clunkLo.run(kx * 9) * 1.1 + clunkMid.run(kx * 6) * 0.8 + rattle.run(rx * 0.5) * 0.4 + knock.run(kx * 1.0) * 0.3;
      bodyX += kx * 1.4 + ex * 0.5;
      pipeLX += ex * 2;
      // Exhaust settle: a short, dark breath out of the pipes (mostly heard as pipe ring)
      const js = j - Math.round(0.05 * sr);
      if (js >= 0) {
        const ts = js / sr;
        const envS = (1 - Math.exp(-ts / 0.05)) * Math.exp(-ts / 0.22);
        const s = setLp2.run(setLp1.run(nz() * envS));
        y += s * 8;
        pipeLX += s * 30;
        bodyX += s * 10;
      }
    }
    y += pipeL.run(pipeLX) + body.run(bodyX) * 0.9;
    // Cooling tick(s): tiny metallic click
    let tx = 0;
    for (const s of ticks) {
      const j = i - s;
      if (j >= 0 && j < 3) tx += (j === 1 ? -1 : 1) * 0.5;
    }
    y += (tickA.run(tx) * 0.9 + tickB.run(tx) * 0.6) * tickLevel * 900;

    let g = i < fadeInN ? 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeInN) : 1;
    if (i < swellN) {
      const u = i / swellN;
      g *= SWELL_FLOOR + (1 - SWELL_FLOOR) * u * u * (3 - 2 * u);
    }
    out[i] = hp.run(y) * g;
  }
  // Fade the last 100 ms; fixed calibration (not peak-normalised, so the balance between the
  // pulses, the shudder and the settle holds whatever the start rpm), soft ceiling at 0.95
  const fadeN = Math.round(0.1 * sr);
  for (let i = 0; i < fadeN; i++) out[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeN);
  // From higher revs the coast sweeps the firing harmonics through the pipe modes and the
  // pulses pile up: trim so a key-off from 2.5k lands about where one from idle does
  const hiTrim = 1 - 0.32 * clip((r0 - idle) / 1840);
  const scale = num(opts.scale, NP_SHUTDOWN_SCALE) * hiTrim;
  for (let i = 0; i < n; i++) out[i] = 0.95 * Math.tanh((out[i] * scale) / 0.95);
  return { data: out, events, stopAt, shudderAt: tShudder.t, duration, rundown: T };
}

/** Small seeded PRNG so a cue is reproducible from its seed (no Math.random). */
export function npShutdownRand(seed) {
  let a = (Math.floor(num(seed, 1)) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cueRate = (sampleRate) => (sampleRate >= 44100 ? sampleRate / 2 : sampleRate);
const cueOpts = (params, opts) => ({
  rpm: opts.rpm,
  idleRpm: num(opts.idleRpm, 660),
  growl: num(params?.growl, 0.8),
  tick: num(params?.npShutdownTick, 1),
  seed: num(opts.seed, 1),
});

/**
 * Pre-render the cue for the current idle (the usual key-off point) so the key-off itself does
 * no synthesis work. Rendered at half rate (content sits below ~4 kHz); the buffer source
 * resamples. Pass the result as opts.prepared to startNightPursuitShutdown.
 */
export function prepareNightPursuitShutdown(sampleRate, params = {}, opts = {}) {
  const o = cueOpts(params, { ...opts, rpm: num(opts.rpm, num(opts.idleRpm, 660)) });
  const sr = cueRate(sampleRate);
  return { sr, o, r: renderNightPursuitShutdown(sr, o, npShutdownRand(o.seed)) };
}

const fits = (p, sr, o) =>
  p && p.sr === sr && p.o.idleRpm === o.idleRpm && p.o.growl === o.growl && p.o.tick === o.tick &&
  p.o.seed === o.seed && Math.abs(p.o.rpm - num(o.rpm, o.idleRpm)) <= 120;

/**
 * Play the key-off cue into dest through one gain node. opts: { rpm, idleRpm, seed, prepared,
 * delay }. Returns a handle: { at, end, duration, stopAt, events, active(now),
 * cancel(now, seconds = 0.25), dispose() }. cancel() fades the cue out; the crossfade into the
 * live engine is the caller's key-on ramp.
 */
export function startNightPursuitShutdown(ctx, dest, params = {}, opts = {}) {
  const sr = cueRate(ctx.sampleRate);
  const o = cueOpts(params, opts);
  const r = fits(opts.prepared, sr, o) ? opts.prepared.r : renderNightPursuitShutdown(sr, o, npShutdownRand(o.seed));
  const buf = ctx.createBuffer(1, r.data.length, sr);
  buf.getChannelData(0).set(r.data);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = NP_SHUTDOWN_LEVEL * clip(num(params?.npShutdownLevel, 1), 0, 2);
  src.connect(g);
  g.connect(dest);
  const at = ctx.currentTime + num(opts.delay, 0.004);
  src.start(at);
  src.stop(at + r.duration + 0.02);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* ignore */
    }
  };
  src.onended = cleanup;
  const end = at + r.duration;
  return {
    at,
    end,
    duration: end - ctx.currentTime,
    stopAt: at + r.stopAt,
    events: r.events.map((e) => ({ ...e, t: at + e.t })),
    active: (now) => !done && now < end,
    cancel(now, seconds = 0.25) {
      if (done) return;
      try {
        const p = g.gain;
        const s = Math.max(0.01, seconds);
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(0, now + s);
        src.stop(now + s + 0.02);
      } catch {
        cleanup();
      }
    },
    dispose() {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
      cleanup();
    },
  };
}
