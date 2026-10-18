// Carrier Jet cockpit warnings — real-time Web Audio synthesis (opt-in, default off).
// 100 % procedural (oscillators + gain envelopes); no samples or recordings. Same character as the
// reviewed demos (demos/cj-warnings/generate.mjs on branch demos-cj-warnings):
//   stall          soft Hi-Lo two-tone, 800 / 600 Hz, 4 Hi+Lo cycles per second (125 ms per tone),
//                  loops while active; a short linear fade (no click) when it clears
//   masterCaution  original double chime (two bell-like strikes on 1175 Hz), once per activation
// Output: one bus into the jet cue bus (JetColdStartVoice.bus → Tomcat pad → engine master → limiter
// → output), so master volume, stop fades and the output chain apply as for every jet cue.

/** Warning ids accepted by setWarning. */
export const JET_WARNINGS = ['stall', 'masterCaution'];

/** Levels (linear, into the jet cue bus; calibrated to ≈ -5 dBFS output peak, under the engine). */
export const JET_WARNING_LEVEL = { stall: 0.63, chime: 0.34 };

export const STALL_HI = 800;
export const STALL_LO = 600;
/** Hi+Lo cycles per second (each tone lasts 1 / (2 · rate) = 125 ms). */
export const STALL_RATE = 4;
export const STALL_ATTACK = 0.04;
export const STALL_RELEASE = 0.06;

export const CHIME_HZ = 1175;
/** Strike offsets (s), relative level and decay (s) of the double chime. */
export const CHIME_STRIKES = [
  [0, 1, 0.3],
  [0.16, 0.9, 0.35],
];
/** Bell partials: [ratio, gain, decay scale]. */
const CHIME_PARTIALS = [
  [1, 1, 1],
  [2.0, 0.35, 0.6],
  [2.76, 0.18, 0.45],
  [4.07, 0.07, 0.3],
];
/** Each strike envelope runs this many decay constants before its oscillators stop (≈ -87 dB). */
const CHIME_TAIL = 10;

export class JetWarningVoice {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} dest the jet cue bus
   */
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.disposed = false;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
    /** @type {null | { nodes: AudioNode[], env: GainNode, srcs: AudioScheduledSourceNode[] }} */
    this.stall = null;
    /** @type {Set<{ nodes: AudioNode[], srcs: AudioScheduledSourceNode[] }>} */
    this.chimes = new Set();
    // sine + a touch of 2nd harmonic (the demo's soft variant)
    this.stallWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0]), new Float32Array([0, 1, 0.08]));
  }

  get stallActive() {
    return !!this.stall;
  }

  /** Start the looping Hi-Lo two-tone (no-op while it is already running). */
  startStall(t = this.ctx.currentTime) {
    if (this.disposed || this.stall) return;
    const ctx = this.ctx;
    const tone = ctx.createOscillator();
    tone.setPeriodicWave(this.stallWave);
    tone.frequency.value = (STALL_HI + STALL_LO) / 2;
    // square LFO (+1 first half → Hi first), smoothed to a few-ms glide, ± half the spread in Hz
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = STALL_RATE;
    const glide = ctx.createBiquadFilter();
    glide.type = 'lowpass';
    glide.frequency.value = 60;
    glide.Q.value = 0.5;
    const depth = ctx.createGain();
    depth.gain.value = (STALL_HI - STALL_LO) / 2;
    lfo.connect(glide);
    glide.connect(depth);
    depth.connect(tone.frequency);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(JET_WARNING_LEVEL.stall, t + STALL_ATTACK);
    tone.connect(env);
    env.connect(this.out);
    lfo.start(t);
    tone.start(t);
    this.stall = { nodes: [tone, lfo, glide, depth, env], env, srcs: [tone, lfo] };
  }

  /** Fade the stall tone out (linear, STALL_RELEASE) and release its nodes. */
  stopStall(t = this.ctx.currentTime, release = STALL_RELEASE) {
    const s = this.stall;
    if (!s) return;
    this.stall = null;
    const g = s.env.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.min(JET_WARNING_LEVEL.stall, Math.max(0, g.value)), t);
      g.linearRampToValueAtTime(0, t + release);
      for (const o of s.srcs) o.stop(t + release + 0.05);
    } catch {
      /* already stopped */
    }
    s.srcs[0].onended = () => {
      for (const n of s.nodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
  }

  /** One double chime (two strikes); rings out on its own. Returns its length in seconds. */
  chime(t = this.ctx.currentTime) {
    if (this.disposed) return 0;
    const ctx = this.ctx;
    const h = { nodes: [], srcs: [] };
    let end = t;
    for (const [dt, amp, decay] of CHIME_STRIKES) {
      const t0 = t + dt;
      for (const [ratio, g, dr] of CHIME_PARTIALS) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = CHIME_HZ * ratio;
        const env = ctx.createGain();
        const peak = JET_WARNING_LEVEL.chime * amp * g;
        const tc = decay * dr;
        env.gain.value = 0;
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(peak, t0 + 0.004);
        env.gain.setTargetAtTime(0, t0 + 0.004, tc);
        o.connect(env);
        env.connect(this.out);
        const stop = t0 + 0.004 + tc * CHIME_TAIL;
        o.start(t0);
        o.stop(stop);
        end = Math.max(end, stop);
        h.nodes.push(o, env);
        h.srcs.push(o);
      }
    }
    this.chimes.add(h);
    let left = h.srcs.length;
    for (const o of h.srcs)
      o.onended = () => {
        if (--left > 0) return;
        this.chimes.delete(h);
        for (const n of h.nodes) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
    return end - t;
  }

  /** Silence everything quickly (warnings disabled): stall fades, ringing chimes fade with the bus. */
  silence(t = this.ctx.currentTime) {
    this.stopStall(t, 0.03);
    if (!this.chimes.size) return;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.03);
    for (const h of this.chimes) for (const o of h.srcs) {
      try {
        o.stop(t + 0.05);
      } catch {
        /* ignore */
      }
    }
    g.setValueAtTime(1, t + 0.06);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const all = [...(this.stall?.nodes ?? []), ...[...this.chimes].flatMap((h) => h.nodes)];
    this.stall = null;
    this.chimes.clear();
    for (const n of all) {
      try {
        if ('stop' in n) n.stop();
      } catch {
        /* ignore */
      }
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      this.out.disconnect();
    } catch {
      /* ignore */
    }
  }
}
