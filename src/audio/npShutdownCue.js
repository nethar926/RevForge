// Night Pursuit key-off: big cross-plane V8 run-down, synthesized per sample (no recordings).
//
// Ignition cut → a couple of residual fires → the crank coasts down with every cylinder's
// compression / exhaust pulse individually audible (cross-plane bank pattern, compression
// lope as it slows) → final low shudder as the block rocks back on its mounts + clunk →
// short exhaust / air settle → optional faint cooling tick. About 2.4–2.8 s.
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
/** Output level of the cue (calibrated: loudest 400 ms ≈ idle + 2–4 dB through the shipped chain). */
export const NP_SHUTDOWN_LEVEL = 0.14;
/** Internal scale: peak ≈ 0.8 for a key-off from idle. */
const NP_SHUTDOWN_SCALE = 0.019;

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

/** Two-pole resonator (state in typed arrays: no per-sample allocation). */
class Reso {
  constructor(sr, hz, tau) {
    const r = Math.exp(-1 / (tau * sr));
    this.k = new Float64Array([(1 - r * r) * 0.5, 2 * r * Math.cos((2 * Math.PI * hz) / sr), r * r, 0, 0]);
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
const reso = (sr, hz, tau) => new Reso(sr, hz, tau);
const onePole = (sr, hz) => new OnePole(sr, hz);

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

  // Pipes: unequal left / right banks (cross-plane rumble), a shared second mode, body thump
  const pipeL = reso(sr, 74 + growl * 8, 0.022);
  const pipeR = reso(sr, 67 + growl * 8, 0.025);
  const pipe2 = reso(sr, 158, 0.015);
  const body = reso(sr, 46, 0.035);
  const airLp1 = onePole(sr, 520), airLp2 = onePole(sr, 520);
  const fireLp = onePole(sr, 1500);
  // Shudder / clunk / settle / tick
  const mount = reso(sr, 24, 0.075);
  const mount2 = reso(sr, 52, 0.045);
  const rattle = reso(sr, 230, 0.05);
  const knock = reso(sr, 380, 0.04);
  const setLp1 = onePole(sr, 240), setLp2 = onePole(sr, 240);
  const bedLp1 = onePole(sr, 170), bedLp2 = onePole(sr, 170), bedLp3 = onePole(sr, 170);
  let bedEnv = 0;
  const tickA = reso(sr, 1600, 0.014), tickB = reso(sr, 2600, 0.009);
  let dc = 0;
  const dcA = 1 - Math.exp((-2 * Math.PI * 20) / sr);

  // Per-cylinder imbalance (fixed for this cue) so the coast-down isn't a metronome
  const cyl = Array.from({ length: 8 }, () => 0.85 + 0.3 * rand());

  // Noise table (procedural, filled once per cue) → cheap per-sample noise
  const NZ = 8192;
  const noise = new Float32Array(NZ);
  for (let i = 0; i < NZ; i++) noise[i] = rand() * 2 - 1;
  let nzi = 0;
  const nz = () => noise[(nzi = (nzi + 1) & (NZ - 1))];
  // Active pulse voices: { j (samples since onset), w (samples), a, bank, fire, tail, td }
  const voices = [];
  let fires = 0;
  let theta = 0; // crank degrees since the cut
  let nextEv = 0; // next event angle
  let k = 0;
  let stopAt = T;
  let stopped = false;
  let lastEv = 0;
  const tShudder = { t: -1 };
  const ticks = [];

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // Crank: mean run-down plus compression lope (slows into each TDC, speeds after) that
    // grows as the revs fall — the last revolutions lurch.
    if (!stopped) {
      const base = npRundownRpm(t, r0, T);
      const ph = ((theta % 90) / 90) * 2 * Math.PI;
      const lope = 0.55 * clip(1 - base / 520);
      const rpm = Math.max(0, base * (1 - lope * Math.cos(ph)));
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
        if (fire) a = 0.85 - 0.2 * fires++;
        else a = (0.42 + 0.22 * slow) * (bank ? 0.88 : 1.1) * cyl[k % 8] * (0.92 + 0.16 * rand());
        // Above idle the pulses come faster: keep the power about where it is at idle
        if (base > idle) a *= Math.max(0.25, idle / base);
        // Pulse width: short and hard for a fire, wider / softer as the crank slows
        const w = fire ? 0.0045 : 0.007 + 0.016 * (1 - slow);
        const ws = Math.max(8, Math.round(w * sr));
        voices.push({ j: 0, w: ws, a, bank, fire, tail: 1, td: Math.exp(-1 / (ws * 0.6)) });
        events.push({ t, kind: fire ? 'fire' : 'pulse', bank, amp: a });
        lastEv = t;
        nextEv += 90;
        k++;
      }
    }
    if (stopped && tShudder.t < 0) {
      // Block rocks back on its mounts right after the last compression
      tShudder.t = Math.max(t, lastEv + 0.04);
      const t1 = tShudder.t + 0.75 + 0.25 * rand();
      if (tickLevel > 0) {
        ticks.push(Math.round(t1 * sr));
        if (rand() < 0.6) ticks.push(Math.round((t1 + 0.35 + 0.3 * rand()) * sr));
      }
    }

    // Pulses → pipes
    let exL = 0, exR = 0, air = 0, fx = 0;
    for (let v = voices.length - 1; v >= 0; v--) {
      const p = voices[v];
      const j = p.j++;
      if (j >= p.w * 2) {
        voices.splice(v, 1);
        continue;
      }
      const shape = j < p.w ? Math.sin((Math.PI * j) / p.w) : 0; // half-sine gas pulse
      const tail = (p.tail *= p.td); // turbulent air behind it
      const r = nz();
      const e = p.a * shape;
      if (p.bank) exR += e;
      else exL += e;
      air += p.a * tail * r * (p.fire ? 0.5 : 0.8);
      if (p.fire) fx += p.a * tail * r;
    }
    // Coast bed: the block, pump and air keep moving between pulses, fading as the crank stops
    const bedT = stopped ? 0 : Math.pow(clip(npRundownRpm(t, r0, T) / idle, 0, 1.5), 0.35);
    bedEnv += (bedT - bedEnv) * (stopped ? 0.0015 : 0.002) * (48000 / sr);
    let bodyX = (exL + exR) * 4;
    let pipeLX = exL * 9;
    let y = pipeR.run(exR * 9) + pipe2.run((exL + exR) * 3);
    y += airLp2.run(airLp1.run(air)) * 0.9 + fireLp.run(fx) * 0.25 + bedLp3.run(bedLp2.run(bedLp1.run(nz()))) * bedEnv * 40;

    // Shudder + rattle + clunk
    if (tShudder.t >= 0) {
      const j = i - Math.round(tShudder.t * sr);
      let ex = 0, rx = 0, kx = 0;
      if (j >= 0 && j < 0.03 * sr) ex = Math.sin((Math.PI * j) / (0.03 * sr));
      if (j >= 0.025 * sr && j < 0.1 * sr) rx = nz() * Math.exp(-(j - 0.025 * sr) / (0.02 * sr));
      const jc = j - Math.round(0.12 * sr);
      if (jc >= 0 && jc < 0.012 * sr) kx = Math.sin((Math.PI * jc) / (0.012 * sr));
      y += mount.run(ex * 1.1) + mount2.run(ex * 0.6) * 0.6 + rattle.run(rx * 0.6) * 0.5 + knock.run(kx * 1.4) * 0.55;
      bodyX += kx * 0.6;
      // Exhaust / air settle: a short dark sigh out of the pipes
      const js = j - Math.round(0.05 * sr);
      if (js >= 0) {
        const ts = js / sr;
        const envS = (1 - Math.exp(-ts / 0.06)) * Math.exp(-ts / 0.2);
        const s = setLp2.run(setLp1.run(nz() * envS));
        y += s * 45;
        pipeLX += s * 12;
      }
    }
    y += pipeL.run(pipeLX) + body.run(bodyX) * 0.8;
    // Cooling tick(s): tiny metallic click
    let tx = 0;
    for (const s of ticks) {
      const j = i - s;
      if (j >= 0 && j < 3) tx += (j === 1 ? -1 : 1) * 0.5;
    }
    y += (tickA.run(tx) * 0.9 + tickB.run(tx) * 0.6) * tickLevel * 900;

    dc += dcA * (y - dc);
    out[i] = y - dc;
  }
  // Fade the last 100 ms; fixed calibration (not peak-normalised, so the balance between the
  // pulses, the shudder and the settle holds whatever the start rpm), soft ceiling at 0.95
  const fadeN = Math.round(0.1 * sr);
  for (let i = 0; i < fadeN; i++) out[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeN);
  const scale = num(opts.scale, NP_SHUTDOWN_SCALE);
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
