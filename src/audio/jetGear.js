// Carrier Jet landing gear — fully procedural retract / extend sequences (oscillators + runtime
// noise only). A sequence starts when the gear goes into transit; the lock clunk lands when the
// lock is reported (lock(t)), never earlier than a minimum travel time. If no report comes, a
// default lock is already scheduled behind a gate, so the gear always locks exactly once: an early
// report mutes that gate and re-plans, a late report finds the gear locked and is ignored.

/** Timings (s). k-scaled for the compressed (direct up ↔ down) version. */
export const JET_GEAR = Object.freeze({
  up: { travel: 3.2, minTravel: 1.6, tail: 1.9 }, // retract: lock → doors close → pump spin-down
  down: { travel: 2.8, minTravel: 1.2, tail: 1.8 }, // extend: lock → doors partway → pump settles
  compressed: 0.45, // direct jump without transit: everything before the lock × this
  stagger: [0, 0.14, 0.26], // nose, left main, right main
  pan: [0, -0.3, 0.3],
});

export class GearSequence {
  /**
   * @param {object} v JetColdStartVoice (helpers burst / ping, noise buffers, gear bus)
   * @param {'up'|'down'} dir
   * @param {number} t0 start time (ctx time)
   * @param {{ compressed?: boolean, level?: number }} [opts]
   */
  constructor(v, dir, t0, opts = {}) {
    this.v = v;
    this.ctx = v.ctx;
    this.dir = dir === 'down' ? 'down' : 'up';
    this.t0 = t0;
    this.k = opts.compressed ? JET_GEAR.compressed : 1;
    this.s = opts.level ?? 1;
    const T = JET_GEAR[this.dir];
    this.minT = t0 + T.minTravel * this.k;
    this.autoT = t0 + T.travel * this.k;
    this.lockT = null;
    this.nodes = [];
    this.sources = [];
    const ctx = this.ctx;
    const g = (val, to) => {
      const n = ctx.createGain();
      n.gain.value = val;
      if (to) n.connect(to);
      this.nodes.push(n);
      return n;
    };
    this.g = g;
    this.out = g(1, v.gearBus);
    this.autoGate = g(1, this.out); // default lock group (muted on an early report)
    this.rel = []; // [{ a: GainNode (default release), e: GainNode (early release), kind }]
    this.build();
    this.prelude();
    this.creaks(t0 + 0.55 * this.k, this.autoT);
    this.plan(this.autoT, this.autoGate, 'a');
    const end = this.autoT + T.tail + 0.6;
    for (const s of this.sources) {
      try {
        s.stop(end);
      } catch {
        /* ignore */
      }
    }
    this.endT = end;
    this.sources[0].onended = () => this.dispose();
  }

  get locked() {
    return this.lockT !== null;
  }

  /**
   * A sustained layer: shape gain → default release → early release → out. Only anchored linear
   * ramps (no setTargetAtTime, no cancelAndHold): node-web-audio-api mis-renders both.
   */
  layer(kind) {
    const shape = this.g(0);
    const a = this.g(1);
    const e = this.g(1, this.out);
    for (const n of [a, e]) n.gain.setValueAtTime(1, this.t0);
    shape.connect(a);
    a.connect(e);
    this.rel.push({ kind, a, e });
    return shape;
  }

  /** Sustained layers: hydraulic pump whine, flow hiss, strut creak gate, (extend) air-load rumble. */
  build() {
    const ctx = this.ctx;
    const v = this.v;
    const t0 = this.t0;
    const up = this.dir === 'up';
    const k = this.k;
    const src = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(t0, Math.random() * Math.max(0.01, buf.duration - 0.1));
      this.sources.push(s);
      return s;
    };
    const filt = (type, hz, q, to) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      f.connect(to);
      this.nodes.push(f);
      return f;
    };
    // pump whine: triangle + octave, soft LP; rises as pressure builds
    const pumpG = this.layer('pump');
    pumpG.gain.setValueAtTime(0, t0);
    pumpG.gain.linearRampToValueAtTime(0.011 * this.s, t0 + 0.05 + 0.5 * k);
    const lp = filt('lowpass', 1700, -3, pumpG);
    this.pump = ctx.createOscillator();
    this.pump.type = 'triangle';
    this.pump2 = ctx.createOscillator();
    this.pump2.type = 'sine';
    const g2 = this.g(0.3, lp);
    this.pump.connect(lp);
    this.pump2.connect(g2);
    this.f0 = up ? 270 : 250;
    this.f1 = up ? 520 : 430;
    this.riseEnd = t0 + 0.05 + (up ? 1.2 : 0.9) * k;
    for (const [o, m] of [
      [this.pump, 1],
      [this.pump2, 2],
    ]) {
      o.frequency.setValueAtTime(this.f0 * m, t0);
      o.frequency.linearRampToValueAtTime(this.f1 * m, this.riseEnd);
      o.start(t0);
      this.sources.push(o);
    }
    // hydraulic flow hiss (retract: grows with the strut swing; extend: damping, strong then easing)
    const hissG = this.layer('hiss');
    const hs = 0.05 * this.s;
    hissG.gain.setValueAtTime(0, t0);
    if (up) {
      hissG.gain.setValueAtTime(0, t0 + 0.5 * k);
      hissG.gain.linearRampToValueAtTime(hs, t0 + 1.4 * k);
    } else {
      hissG.gain.setValueAtTime(0, t0 + 0.45 * k);
      hissG.gain.linearRampToValueAtTime(hs * 1.1, t0 + 0.7 * k);
      hissG.gain.linearRampToValueAtTime(hs * 0.45, t0 + 2.0 * k);
    }
    const hbp = filt('bandpass', up ? 2600 : 2100, 0.9, hissG);
    src(v.white).connect(hbp);
    // strut creak (bursts scheduled by creaks()) through its own gate
    this.swingGate = this.layer('swing');
    this.swingGate.gain.setValueAtTime(1, t0);
    // extend: air-load rumble as the gear falls into the airflow (low, LP'd — felt, not wind)
    if (!up) {
      const rumbleG = this.layer('rumble');
      rumbleG.gain.setValueAtTime(0, t0);
      rumbleG.gain.setValueAtTime(0, t0 + 0.5 * k);
      rumbleG.gain.linearRampToValueAtTime(0.16 * this.s, t0 + 2.2 * k);
      const rbp = filt('bandpass', 320, 0.7, rumbleG);
      const rlp = filt('lowpass', 420, -3, rbp);
      src(v.pink).connect(rlp);
    }
  }

  /** Selector clack, then (retract) door unlatch + doors open / (extend) uplock release + doors open. */
  prelude() {
    const v = this.v;
    const t0 = this.t0;
    const k = this.k;
    const s = this.s;
    const B = (t, o) => v.burst(t, { ...o, peak: o.peak * s, to: this.out });
    const P = (t, o) => v.ping(t, { ...o, peak: o.peak * s, to: this.out });
    // cockpit selector: crisp detent + a short handle thunk
    B(t0, { hz: 2600, q: 1.5, peak: 0.12, a: 0.0006, d: 0.006 });
    B(t0 + 0.012, { hz: 520, q: 1, peak: 0.14, a: 0.0008, d: 0.014 });
    P(t0, { hz: 190, toHz: 120, peak: 0.03, a: 0.002, d: 0.03 });
    JET_GEAR.stagger.forEach((st, i) => {
      const pan = JET_GEAR.pan[i];
      if (this.dir === 'up') {
        const tu = t0 + (0.15 + st * 0.8) * k;
        B(tu, { hz: 1700, q: 2, peak: 0.07, a: 0.0005, d: 0.005, pan }); // door latch lets go
        B(tu + 0.02, { hz: 900, q: 1.5, peak: 0.05, a: 0.0005, d: 0.008, pan });
        const td = t0 + (0.45 + st) * k;
        P(td, { hz: 140, toHz: 95, peak: 0.05, a: 0.003, d: 0.05, pan }); // door thumps open
        B(td, { hz: 420, q: 0.9, peak: 0.12, a: 0.001, d: 0.02, pan });
      } else {
        const tr = t0 + (0.12 + st) * k;
        P(tr, { hz: 160, toHz: 110, peak: 0.055, a: 0.002, d: 0.04, pan }); // uplock releases
        B(tr, { hz: 1250, q: 1.8, peak: 0.07, a: 0.0005, d: 0.006, pan });
        B(tr + 0.006, { hz: 480, q: 1, peak: 0.1, a: 0.0008, d: 0.016, pan });
        const td = t0 + (0.38 + st) * k;
        P(td, { hz: 130, toHz: 90, peak: 0.045, a: 0.003, d: 0.05, pan }); // doors swing open
        B(td, { hz: 380, q: 0.9, peak: 0.1, a: 0.001, d: 0.02, pan });
      }
    });
  }

  /** Strut creak during travel: short resonant stick-slip clusters into the swing gate. */
  creaks(from, to) {
    const v = this.v;
    let t = from;
    let i = 0;
    while (t < to - 0.15) {
      const hz = 650 + 450 * Math.random();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        v.burst(t + j * (0.018 + 0.012 * Math.random()), {
          hz: hz * (1 + 0.03 * j),
          q: 9,
          peak: 0.05 * this.s * (0.6 + 0.4 * Math.random()),
          a: 0.0008,
          d: 0.006,
          pan: JET_GEAR.pan[i % 3] * 0.8,
          to: this.swingGate,
        });
      }
      t += (0.35 + 0.35 * Math.random()) * this.k;
      i++;
    }
  }

  /** Lock group at tL into `to`, and every sustained layer re-planned to end around it. */
  plan(tL, to, which) {
    const v = this.v;
    const s = this.s;
    const up = this.dir === 'up';
    const B = (t, o) => v.burst(t, { ...o, peak: o.peak * s, to });
    const P = (t, o) => v.ping(t, { ...o, peak: o.peak * s, to });
    JET_GEAR.stagger.forEach((st, i) => {
      const pan = JET_GEAR.pan[i];
      const tl = tL + st;
      if (up) {
        // UPLOCK: solid low-mid clunk + latch metal
        P(tl, { hz: 165, toHz: 100, peak: 0.1, a: 0.002, d: 0.045, pan });
        B(tl, { hz: 360, q: 1, peak: 0.16, a: 0.0008, d: 0.02, pan });
        B(tl + 0.004, { hz: 1450, q: 1.6, peak: 0.07, a: 0.0005, d: 0.006, pan });
        // doors close: firm thud
        const tc = tL + 0.45 + st;
        P(tc, { hz: 110, toHz: 78, peak: 0.08, a: 0.003, d: 0.06, pan });
        B(tc, { hz: 300, q: 0.8, peak: 0.15, a: 0.001, d: 0.025, pan });
      } else {
        // DOWNLOCK: deeper, heavier, more final — overcentre clank, ring, strut rattle
        P(tl, { hz: 118, toHz: 62, peak: 0.14, a: 0.002, d: 0.085, pan });
        B(tl, { hz: 250, q: 0.9, peak: 0.22, a: 0.0008, d: 0.03, pan });
        B(tl + 0.006, { hz: 950, q: 2, peak: 0.09, a: 0.0005, d: 0.01, pan });
        P(tl + 0.007, { hz: 1870, peak: 0.006, a: 0.0006, d: 0.12, pan });
        B(tl + 0.09, { hz: 1200, q: 1.8, peak: 0.035, a: 0.0005, d: 0.006, pan });
        B(tl + 0.13, { hz: 1050, q: 1.8, peak: 0.02, a: 0.0005, d: 0.005, pan });
        // doors close partway: softer thud
        const tc = tL + 0.4 + st;
        P(tc, { hz: 95, toHz: 74, peak: 0.05, a: 0.003, d: 0.05, pan });
        B(tc, { hz: 420, q: 0.9, peak: 0.08, a: 0.001, d: 0.02, pan });
      }
    });
    // sustained layers: release ramps on the default ('a') or early ('e') release gains
    const tt = JET_GEAR[this.dir].tail;
    const pd = tL + (up ? 0.55 : 0.35);
    for (const r of this.rel) {
      const p = r[which].gain;
      const ramp = (t1, v1, t2, v2) => {
        p.setValueAtTime(v1, t1);
        p.linearRampToValueAtTime(v2, t2);
      };
      if (r.kind === 'hiss') ramp(tL, 1, tL + (up ? 0.25 : 0.4), 0);
      else if (r.kind === 'rumble') ramp(tL, 1, tL + 0.15, 0);
      else if (r.kind === 'swing') ramp(tL - 0.03, 1, tL, 0);
      else if (r.kind === 'pump') {
        ramp(pd, 1, pd + 0.5, up ? 0.55 : 0.65);
        p.linearRampToValueAtTime(0, tL + tt);
      }
    }
    // pump spin-down (retract) / settle (extend) after the lock
    for (const [o, m] of [
      [this.pump, 1],
      [this.pump2, 2],
    ]) {
      o.frequency.setValueAtTime(this.f1 * m, pd);
      o.frequency.linearRampToValueAtTime((up ? 130 : 300) * m, tL + tt);
    }
  }

  /** Lock reported at t: catch up (never before minTravel); late / repeat reports are ignored. */
  lock(t) {
    if (this.lockT !== null) return false;
    const now = Math.max(t, this.ctx.currentTime);
    if (now >= this.autoT - 0.05) {
      this.lockT = this.autoT; // the default lock already landed (or is landing): a short tail, no second clunk
      return false;
    }
    const tL = Math.max(now, this.minT);
    // drop the default plan: every event there sits after `now` (autoT − 0.03 at the earliest), so
    // nothing in progress is cut; the pump rise is kept (its ramp ends at riseEnd)
    this.autoGate.gain.setValueAtTime(1, now);
    this.autoGate.gain.linearRampToValueAtTime(0, now + 0.004);
    for (const r of this.rel) r.a.gain.cancelScheduledValues(now + 0.001);
    const fc = Math.max(now, this.riseEnd) + 0.001;
    this.pump.frequency.cancelScheduledValues(fc);
    this.pump2.frequency.cancelScheduledValues(fc);
    this.plan(Math.max(tL, fc - 0.5), this.out, 'e');
    this.lockT = tL;
    return true;
  }

  /** When the lock lands (reported, or the default). */
  get lockAt() {
    return this.lockT ?? this.autoT;
  }

  /** Fade out (a reversal mid-travel). */
  abort(t) {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(1, t);
    this.out.gain.linearRampToValueAtTime(0, t + 0.08);
    this.lockT = this.lockT ?? t;
  }

  dispose() {
    for (const n of [...this.sources, ...this.nodes]) {
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
