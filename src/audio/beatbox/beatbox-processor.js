/**
 * Beat Box ICE voice: one generic, fully procedural AudioWorkletProcessor that plays any of the
 * six Beat Box engines from an engine spec (processorOptions.spec, built in engines.ts).
 * Standalone (no imports) so the browser and node-web-audio-api load it as a plain module.
 * No samples, wavetables, convolution or storage: every sound is computed per sample from the
 * crank angle.
 *
 * Signal model (reuses the crank scheduler of chrono-v6-processor.js and the lift-off pop gate
 * of overrunBurst.js, generalised to any firing table):
 *
 *   crank       θ ∈ [0, 720°) advances at rpm·6/sr per sample (+ idle hunt, + cam lope).
 *               Events sorted by angle: 0 exhaust-valve opening (blowdown), 1 intake opening,
 *               2 valve-closing tick. Firing table = real firing order + crank angles.
 *   blowdown    per-cylinder pressure pulse: alpha-function lobe minus a wider rarefaction lobe
 *               of EQUAL area (zero DC at the source), rise time from crank angle clamped to
 *               gas-dynamic limits, + turbulent rasp noise with its own envelope. Amplitude =
 *               load × fixed cylinder imbalance × cycle-to-cycle jitter. Each cylinder's pulse
 *               reaches the collector late by its primary-pipe length (unequal headers → the
 *               real spacing irregularity that makes a cross-plane V8 burble).
 *   pipes       two bank pipes (L / R, H-pipe crossfeed), each a damped waveguide loop
 *               (negative reflection at the open end → quarter-wave modes), shell/muffler
 *               modes, load-driven steepening (soft saturation → rasp), muffler low-pass that
 *               opens with throttle and rpm, rasp band, tailpipe radiation high-pass.
 *   intake      per-cylinder induction breath (sin² over ~220° crank) × band noise, airbox
 *               honk; grows with throttle² and Character.
 *   mechanics   valvetrain pings, timing-chain / gear whir, broadband bay noise.
 *   turbo       spool lag, shaft speed → compressor whine (narrow-band noise + slightly
 *               wandering partials, never a bare sine), intake hiss, blow-off on a lift with
 *               boost (falling band-pass + compressor flutter with high Character).
 *   overrun     fuel-cut hollowing + irregular burble at closed throttle (always), and
 *               afterfire pops only while a lift-off burst is open AND pops > 0 (rate and
 *               level both scale with pops; pops 0 → no pop is ever armed).
 *   output      28 Hz 2nd-order DC guard / speaker high-pass, 1.5 ms look-ahead peak limiter at −1 dBFS, final
 *               safety soft clip. Stereo from bank pipes + two short body reflections.
 *
 * AudioParams (k-rate, smoothed per sample, so no zipper noise):
 *   rpm 0..12000, throttle 0..1, speed km/h 0..400, drive 0..1 (loudness + load hardness),
 *   tone 0..1 (smooth/muffled → raw/lumpy/open), pops 0..1 (overrun pops; 0 = none),
 *   level (linear gain 0..4).
 */
const TWO_PI = Math.PI * 2;
const clip = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

class Biquad {
  constructor() { this.b0 = 0; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(type, f, q, sr) {
    const w = (TWO_PI * clip(f, 10, sr * 0.45)) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Math.max(0.1, q));
    const a0 = 1 + al;
    let b0, b1, b2;
    if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
    else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Damped waveguide loop: y = x + g·lp(y[n−N]); g < 0 → open-end (quarter-wave) modes. */
class Pipe {
  constructor(n) { this.buf = new Float32Array(Math.max(2, n) + 1); this.i = 0; this.lp = 0; }
  run(x, g, damp) {
    const j = (this.i + 1) % this.buf.length;
    this.lp += damp * (this.buf[j] - this.lp);
    const y = x + g * this.lp;
    this.buf[this.i] = y;
    this.i = j;
    return y;
  }
}

class Delay {
  constructor(n) { this.buf = new Float32Array(Math.max(2, n) + 1); this.i = 0; }
  run(x) { const j = (this.i + 1) % this.buf.length; const y = this.buf[j]; this.buf[this.i] = x; this.i = j; return y; }
}

const P = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });
const E = Math.E;

class BeatboxProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      P('rpm', 0, 0, 12000),
      P('throttle', 0, 0, 1),
      P('speed', 0, 0, 400),
      P('drive', 0.7, 0, 1),
      P('tone', 0.5, 0, 1),
      P('pops', 0, 0, 1),
      P('level', 0, 0, 4),
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    const sp = o.spec;
    if (!sp || !Array.isArray(sp.fire)) throw new Error('beatbox-processor: processorOptions.spec missing');
    this.sp = sp;
    const sr = sampleRate;
    this.sr = sr;
    let seed = (o.seed ?? 0x5eed) >>> 0;
    if (!seed) seed = 0x5eed;
    this.seed = seed;

    // ── crank events ──
    const cyc = sp.cycleDeg || 720;
    this.cyc = cyc;
    const ev = [];
    const nC = sp.fire.length;
    for (let c = 0; c < nC; c++) {
      const f = sp.fire[c];
      ev.push({ deg: f.deg % cyc, type: 0, cyl: c });
      ev.push({ deg: (f.deg + (sp.intakeDeg ?? 370)) % cyc, type: 1, cyl: c });
      if (sp.mech.tick > 0) {
        ev.push({ deg: (f.deg + 355) % cyc, type: 2, cyl: c });
        ev.push({ deg: (f.deg + 590) % cyc, type: 2, cyl: c });
      }
    }
    ev.sort((a, b) => a.deg - b.deg);
    this.events = ev;
    this.nextEv = 0;
    this.theta = 0;
    this.primary = sp.fire.map((f) => Math.round((f.primaryMs || 0) * 0.001 * sr));
    this.bank = sp.fire.map((f) => (f.bank ? 1 : 0));
    // Fixed per-cylinder imbalance (deterministic from the seed) on top of spec gains
    this.cylDev = sp.fire.map((f) => (f.gain ?? 1) - 1 + (this.rand() - 0.5) * 0.5);
    this.cylTau = sp.fire.map(() => 1 + (this.rand() - 0.5) * 0.25);
    this.cycleGain = 1;

    // ── exhaust voices ──
    const VN = 32;
    this.vN = VN;
    this.vAge = new Float64Array(VN).fill(1e9);
    this.vA = new Float64Array(VN);
    this.vTp = new Float64Array(VN).fill(1);
    this.vTn = new Float64Array(VN).fill(1);
    this.vNegK = new Float64Array(VN);
    this.vNa = new Float64Array(VN);
    this.vNe = new Float64Array(VN);
    this.vDn = new Float64Array(VN);
    this.vAtt = new Float64Array(VN).fill(8);
    this.vK2 = new Uint8Array(VN);
    this.vBank = new Uint8Array(VN);
    this.vPop = new Uint8Array(VN);
    this.vHead = 0;

    // ── intake voices ──
    const IN = 12;
    this.iN = IN;
    this.iAge = new Float64Array(IN).fill(1e9);
    this.iDur = new Float64Array(IN).fill(1);
    this.iA = new Float64Array(IN);
    this.iHead = 0;

    // ── pipes / filters (two chains: L = bank A side, R = bank B side) ──
    const ms = (x) => Math.max(2, Math.round(x * 0.001 * sr));
    const pp = sp.pipe;
    // bank B is detuned from bank A (tail length, modes, muffler, rasp) for a wider image; bankDetune
    // scales that offset (unset = the original offsets; 0 = identical banks, no L/R beating)
    const bd = sp.bankDetune;
    const det = (orig, d) => (bd === undefined ? orig : 1 + d * bd);
    this.det = { mode: det(1.03, 0.03), lp: det(1.04, 0.04), lp2: det(1.65, 0.05), rasp: det(1.06, 0.06) };
    if (bd !== undefined) this.det.lp2 = 1.6 + 0.05 * bd;
    this.pipeA = new Pipe(ms(pp.lenMsA));
    this.pipeB = new Pipe(ms(pp.lenMsB));
    this.tailA = new Pipe(ms(pp.tailMs));
    this.tailB = new Pipe(ms(pp.tailMs * det(1.07, 0.07)));
    this.modesA = (sp.modes || []).map(() => new Biquad());
    this.modesB = (sp.modes || []).map(() => new Biquad());
    (sp.modes || []).forEach((m, i) => { this.modesA[i].set('bp', m[0], m[1], sr); this.modesB[i].set('bp', m[0] * this.det.mode, m[1], sr); });
    this.lpA = new Biquad(); this.lpB = new Biquad();
    this.lp2A = new Biquad(); this.lp2B = new Biquad();
    this.raspA = new Biquad(); this.raspB = new Biquad();
    this.radA = new Biquad().set('hp', sp.radHz || 60, 0.6, sr);
    this.radB = new Biquad().set('hp', sp.radHz || 60, 0.6, sr);
    this.inBp = new Biquad(); this.honk = new Biquad(); this.inLp = new Biquad();
    this.tickA = new Biquad().set('bp', sp.mech.tickHz || 3200, 14, sr);
    this.tickB = new Biquad().set('bp', (sp.mech.tickHz || 3200) * 1.71, 18, sr);
    this.whir = new Biquad();
    this.bay = new Biquad().set('bp', sp.mech.bayHz || 1500, 0.8, sr);
    this.metal = (sp.metal || []).map((m) => new Biquad().set('bp', m[0], m[1], sr));
    this.turboBp = new Biquad(); this.turboBp2 = new Biquad(); this.hiss = new Biquad().set('bp', 2600, 0.8, sr);
    this.bovBp = new Biquad(); this.bovHp = new Biquad().set('hp', 400, 0.7, sr);
    // afterfire voice (v2): one band-limited bang per event = low-mid thump (damped, slightly falling
    // sine 80–400 Hz) + a brief bright snap (band-passed noise, ~2 ms) + a short ring at the pipe's
    // third quarter-wave mode. No dense micro-crackle, no long noisy tail.
    this.crackBp = new Biquad().set('bp', 2600, 1.1, sr);
    this.crackHp = new Biquad().set('hp', 1200, 0.7, sr);
    this.thumpLp = new Biquad().set('lp', 400, 0.7, sr);
    this.popRing = new Biquad().set('bp', clip(3000 / (4 * sp.pipe.lenMsA), 180, 900), 5, sr);
    this.thA = 0; this.thF = 120; this.thPh = 0; this.snA = 0;
    this.thD = Math.exp(-1 / (0.009 * sr)); this.snD = Math.exp(-1 / (0.0022 * sr)); this.thFd = Math.exp(-1 / (0.03 * sr));
    // optional per-engine output high-pass (default 28 Hz DC guard); a higher corner trims sub flab
    const hpHz = sp.hpHz || 28;
    this.dcL1 = new Biquad().set('hp', hpHz, 0.707, sr); this.dcR1 = new Biquad().set('hp', hpHz, 0.707, sr);
    // optional high-pass on the blowdown gas noise before the pipes: keeps the turbulence as
    // edge and stops it filling the low-mids with mush (unset = full-band noise, as before)
    this.nzHp = sp.pulse.noiseHpHz ? [new Biquad().set('hp', sp.pulse.noiseHpHz, 0.6, sr), new Biquad().set('hp', sp.pulse.noiseHpHz, 0.6, sr)] : null;
    this.reflAmt = sp.refl ?? 0.16;
    this.boomAmt = sp.cabin?.boom ?? 0.45;
    const bo = (sp.body && sp.body.orders) || [];
    this.bodyOrd = new Float64Array(bo.map((x) => x[0]));
    this.bodyAmp = new Float64Array(bo.map((x) => Math.pow(10, x[1] / 20)));
    this.bodyPh = new Float64Array(bo.map(() => this.rand() * TWO_PI));
    this.bodyLp = new Biquad().set('lp', (sp.body && sp.body.lpHz) || 1500, 0.7, sr);
    // cabin: body boom (+~3 dB around 40–90 Hz) and a gentle top roll-off
    this.boomL = new Biquad().set('bp', sp.cabin?.boomHz || 60, 1.3, sr); this.boomR = new Biquad().set('bp', sp.cabin?.boomHz || 60, 1.3, sr);
    this.cabL = new Biquad().set('lp', sp.cabin?.lpHz || 6500, 0.6, sr); this.cabR = new Biquad().set('lp', sp.cabin?.lpHz || 6500, 0.6, sr);
    this.refl1 = new Delay(ms(7.3)); this.refl2 = new Delay(ms(11.9));
    this.reflLp1 = 0; this.reflLp2 = 0;

    // ── smoothed controls ──
    this.s = { rpm: 0, thr: 0, thrC: 0, load: 0, speed: 0, drv: 0.7, tone: 0.5, pops: 0, level: 0 };
    this.kFast = 1 - Math.exp(-1 / (0.012 * sr));
    this.kLoadUp = 1 - Math.exp(-1 / (0.06 * sr));
    this.kLoadDn = 1 - Math.exp(-1 / (0.22 * sr));
    this.kComb = 1 - Math.exp(-1 / (0.025 * sr));
    this.kSlow = 1 - Math.exp(-1 / (0.05 * sr));
    this.offK = 0;

    // ── idle hunt / cam lope ──
    this.lopeNow = 0;
    this.hunt = 0; this.huntV = 0; this.lopePh = this.rand() * TWO_PI;

    // ── turbo ──
    this.boost = 0; this.shaft = 0; this.tPh = 0; this.tPh2 = 0; this.tWob = 0;
    this.bovEnv = 0; this.bovAmp = 0; this.bovPh = 0; this.bovThrPeak = 0;

    // ── lift-off pop gate (overrunBurst.js logic, per block) ──
    this.g = { thrPeak: 0, armed: false, age: 99, liftRpm: 0, amp: 0, env: 0, bursts: 0 };
    this.popAcc = 0; this.popNext = 0.3; this.popArmed = false; this.popDouble = 0; this.popDoubleBank = 0;
    // (v2: the dense micro-crackle layer was removed; afterfire is sparse bangs only)
    this.pops = 0;
    this.pEnv = 0;
    this.popTail = 0;

    // ── limiter ──
    this.laN = Math.round(0.0015 * sr);
    this.laL = new Float32Array(this.laN + 1); this.laR = new Float32Array(this.laN + 1); this.laI = 0;
    this.limG = 1;
    this.limRel = 1 - Math.exp(-1 / (0.12 * sr));
    this.limAtt = 1 - Math.exp(-1 / (0.00025 * sr)); // ~6 time constants inside the look-ahead, so sharp bangs are caught
    this.peakHold = 0; this.peakAge = 0;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'stats') this.port.postMessage({ type: 'stats', pops: this.pops, bursts: this.g.bursts });
    };
  }

  rand() {
    let x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.seed = x;
    return x / 4294967296;
  }

  /** Blowdown voice. delay in samples (primary pipe + jitter), tp = rise samples, negMul = rarefaction width. */
  spawn(delay, A, tp, k2, negMul, nA, tauN, attN, bank, pop = 0) {
    const i = this.vHead;
    this.vHead = (this.vHead + 1) % this.vN;
    this.vAge[i] = -delay;
    this.vA[i] = A;
    this.vTp[i] = Math.max(2, tp);
    this.vK2[i] = k2 ? 1 : 0;
    this.vTn[i] = this.vTp[i] * negMul;
    // equal-area rarefaction: area(pos) = (k2 ? e²/4 : e)·tp ; area(neg lobe) = e·tn·scale
    this.vNegK[i] = (k2 ? (E * E) / 4 : E) / (E * negMul);
    this.vNa[i] = nA;
    this.vNe[i] = 1;
    this.vDn[i] = Math.exp(-1 / Math.max(2, tauN));
    this.vAtt[i] = Math.max(1, attN);
    this.vBank[i] = bank;
    this.vPop[i] = pop;
  }

  firePop(bank, strength) {
    const sr = this.sr;
    const s = this.s;
    const lvl = 0.7 * (0.45 + 0.55 * s.pops) * strength * this.sp.pop;
    // pressure kick into the pipe (short, little gas noise) so the bang still colours the exhaust
    const tp = (0.00025 + 0.0002 * this.rand()) * sr;
    this.spawn(0, lvl * (1.0 + 0.5 * this.rand()), tp, 0, 4, lvl * 0.2, 0.0012 * sr, 2, bank, 1);
    // the bang itself: thump + snap, bypassing the muffler
    this.thA = Math.max(this.thA, lvl * (0.9 + 0.4 * this.rand()));
    this.thF = 110 + 170 * this.rand();
    this.thPh = 0;
    this.snA = Math.max(this.snA, lvl * (0.8 + 0.5 * this.rand()));
    this.pops++;
    if (this.rand() < 0.08 + 0.12 * s.pops) { this.popDouble = Math.round((0.04 + 0.05 * this.rand()) * sr); this.popDoubleBank = 1 - bank; this.popDoubleAmp = strength * 0.55; }
  }

  onEvent(e, dDeg) {
    const s = this.s;
    const sr = this.sr;
    const sp = this.sp;
    const red = sp.redline, idle = sp.idleRpm;
    const rn = clip(s.rpm / red);
    const chr = s.tone;
    if (e.type === 0) {
      const c = e.cyl;
      if (c === 0) this.cycleGain = 1 + (this.rand() - 0.5) * sp.cycleVar * (0.4 + 1.2 * chr) * (1 - 0.6 * rn);
      const L = s.load;
      const idleish = clip(1 - (s.rpm - idle) / (idle * 1.6)) * clip(1 - L * 2);
      // combustion strength: idle floor + load; fuel-cut overrun = pumping only
      // combustion follows the pedal at once (shift cuts / limiter are audible dips), timbre follows load
      let A = (0.3 + 0.7 * (0.55 * s.thrC + 0.45 * L)) * (1 - 0.6 * this.offK);
      const imb = sp.imbalance * (0.35 + 1.3 * chr) * (1 - 0.65 * rn);
      A *= 1 + this.cylDev[c] * imb;
      A *= this.cycleGain;
      // big-overlap cam: rich / lean side of the cycle hunt
      if (this.lopeNow) A *= 1 + 0.45 * this.lopeNow;
      const jit = sp.ampJitter * (0.5 + chr) * (1 - 0.5 * rn);
      A *= 1 + jit * (this.rand() * 2 - 1);
      // off-throttle burble: lazy, irregular weak fires (soft, never a transient)
      if (this.offK > 0.05) { const r = this.rand(); A *= 1 - this.offK * (0.75 * r * r + 0.15); }
      // big-cam idle: occasional lazy fire
      if (sp.lazyFire > 0 && this.rand() < sp.lazyFire * (0.4 + chr) * idleish) A *= 0.3 + 0.3 * this.rand();
      // rotary 'brap': low-rpm peripheral-port overlap → strong/weak chamber fires
      if (sp.brap > 0) {
        const lowK = clip(1 - (s.rpm - idle) / (sp.brapRpm || 2600)) * sp.brap * (0.5 + chr);
        if (this.rand() < 0.35 * lowK) A *= 0.35; else A *= 1 + 0.25 * lowK;
      }
      // timing: rise from crank angle, clamped to gas-dynamic limits
      const tpMs = clip((sp.pulse.riseDeg / Math.max(60, s.rpm * 6)) * 1000, sp.pulse.minMs, sp.pulse.maxMs) * (1 - 0.3 * L) * this.cylTau[c];
      const tp = tpMs * 0.001 * sr;
      const tJit = sp.timingJitterDeg * (0.4 + 1.2 * chr) * (1 - 0.6 * rn) * (this.rand()) / Math.max(1e-3, dDeg);
      const nA = A * sp.pulse.noise * (0.55 + 0.9 * chr) * (0.25 + 1.0 * L) * (0.7 + 0.6 * s.drv) + A * this.offK * sp.pulse.noise * 1.6; // fuel-cut: gas rush + irregular burble
      const tauN = tp * sp.pulse.noiseTau;
      this.spawn(this.primary[c] + tJit, A, tp, sp.pulse.k2, sp.pulse.neg, nA, tauN, tp * 0.4, this.bank[c]);
      // afterfire: an armed pop is released on the next exhaust stroke
      if (this.popArmed) {
        this.popArmed = false;
        this.firePop(this.bank[c], this.g.env);
      }
    } else if (e.type === 1) {
      const i = this.iHead;
      this.iHead = (this.iHead + 1) % this.iN;
      this.iAge[i] = 0;
      this.iDur[i] = Math.min(0.15 * sr, Math.max(0.004 * sr, (sp.intake.durDeg || 220) / Math.max(1e-3, dDeg)));
      this.iA[i] = (0.85 + 0.3 * this.rand()) * (1 + 0.5 * this.cylDev[e.cyl] * sp.imbalance);
    } else if (s.rpm > 30) {
      const a = (0.6 + 0.4 * this.rand()) * (0.7 + 0.3 * rn);
      this.tickQ0 = (this.tickQ0 || 0) + a;
    }
  }

  blockUpdate(n) {
    const s = this.s, sp = this.sp, sr = this.sr;
    const h = n / sr;
    const red = sp.redline, idle = sp.idleRpm;
    const thr = s.thr;
    // ── lift-off gate (same rules as overrunBurst.js) ──
    const g = this.g;
    const minRpm = Math.max(2600, idle + 0.38 * (red - idle));
    const floor = Math.max(1150, idle * 1.6);
    g.thrPeak = Math.max(thr, g.thrPeak * Math.exp(-h / 0.8));
    if (thr >= 0.3) g.armed = true;
    const MAX = 3.2;
    if (g.age >= MAX && g.armed && thr < 0.1 && g.thrPeak >= 0.3 && g.thrPeak - thr >= 0.25 && s.rpm >= minRpm) {
      g.age = 0; g.liftRpm = s.rpm; g.armed = false; g.bursts++;
      g.amp = clip(0.6 + 0.4 * ((s.rpm - minRpm) / Math.max(1, red - minRpm)));
    }
    let target = 0;
    if (g.age < MAX) {
      if (thr > 0.2) g.age = MAX;
      else {
        const rpmK = clip((s.rpm - floor) / Math.max(1, g.liftRpm - floor));
        const timeK = g.age < 0.8 ? 1 : Math.exp(-(g.age - 0.8) / 1.4);
        target = g.amp * Math.pow(rpmK, 0.2) * timeK * clip((MAX - g.age) / 0.4);
        g.age += h;
      }
    }
    g.env += (target - g.env) * (1 - Math.exp(-h / (target > g.env ? 0.03 : 0.06)));
    if (g.env < 1e-4 && target === 0) g.env = 0;

    // ── filters that follow rpm / load ──
    const rn = clip(s.rpm / red);
    const L = s.load;
    const chr = s.tone;
    const lp = sp.muffler;
    const fc = (lp.base + lp.load * L * (0.6 + 0.4 * s.drv) + lp.rpm * rn - lp.off * this.offK) * (0.62 + 0.76 * chr);
    this.lpA.set('lp', fc, 0.65, sr); this.lpB.set('lp', fc * this.det.lp, 0.65, sr);
    this.lp2A.set('lp', fc * 1.6, 0.6, sr); this.lp2B.set('lp', fc * this.det.lp2, 0.6, sr);
    const rf = sp.rasp.hz + sp.rasp.rpmHz * rn;
    this.raspA.set('bp', rf, sp.rasp.q, sr); this.raspB.set('bp', rf * this.det.rasp, sp.rasp.q, sr);
    const ip = sp.intake;
    this.inBp.set('bp', ip.hz + ip.rpmHz * rn + ip.loadHz * L, ip.q, sr);
    this.honk.set('bp', ip.honkHz * (1 + 0.15 * rn), ip.honkQ, sr);
    this.inLp.set('lp', 900 + 2600 * L + 1500 * rn, 0.7, sr);
    this.whir.set('bp', Math.max(80, (s.rpm / 60) * (sp.mech.whirOrder || 20)), 10, sr);
    if (sp.turbo) {
      const fw = sp.turbo.whineHz + sp.turbo.whineRange * this.shaft;
      this.turboBp.set('bp', fw, 25, sr);
      this.turboBp2.set('bp', fw * 2.03, 30, sr);
      this.bovBp.set('bp', 700 + 2600 * clip(this.bovEnv / Math.max(0.05, this.bovAmp)), 1.6, sr);
    }
    // pipe feedback & drive (Character = raw)
    this.fbA = -clip(sp.pipe.fb * (0.75 + 0.5 * chr), 0, 0.93);
    this.fbT = -clip(sp.pipe.tailFb * (0.75 + 0.5 * chr), 0, 0.9);
    this.damp = clip(sp.pipe.damp + 0.25 * L, 0.05, 0.95);
    const drive = 1 + sp.drive * (0.25 + 1.1 * L) * (0.55 + 0.9 * s.drv) * (0.75 + 0.5 * chr);
    this.drive = drive;
    this.dnorm = 1 / Math.tanh(drive * 0.5);
  }

  process(_inputs, outputs, parameters) {
    const outL = outputs[0][0];
    if (!outL) return true;
    const outR = outputs[0][1] || null;
    const n = outL.length;
    const sr = this.sr, sp = this.sp, s = this.s;
    const pv = (k) => parameters[k][0];
    const tRpm = clip(pv('rpm'), 0, 12000), tThr = clip(pv('throttle')), tSpd = pv('speed');
    const tDrv = clip(pv('drive')), tTone = clip(pv('tone')), tPops = clip(pv('pops')), tLvl = clip(pv('level'), 0, 4);
    this.blockUpdate(n);
    const kF = this.kFast, kS = this.kSlow;
    const red = sp.redline, idle = sp.idleRpm;
    const ev = this.events;
    const cyc = this.cyc;
    const fbA = this.fbA, fbT = this.fbT, damp = this.damp, drive = this.drive, dnorm = this.dnorm;
    const cross = sp.pipe.cross;
    const width = sp.width;
    const modes = sp.modes || [];
    const nModes = modes.length;
    const metalN = this.metal.length;
    const turbo = sp.turbo;
    const ip = sp.intake;
    const mech = sp.mech;
    const trim = sp.trim;
    const bodyOrd = this.bodyOrd, bodyAmp = this.bodyAmp, bodyPh = this.bodyPh, nBody = bodyOrd.length;
    for (let i = 0; i < n; i++) {
      s.rpm += (tRpm - s.rpm) * kF;
      s.thr += (tThr - s.thr) * kF;
      s.thrC += (s.thr - s.thrC) * this.kComb;
      s.load += (s.thr - s.load) * (s.thr > s.load ? this.kLoadUp : this.kLoadDn);
      s.speed += (tSpd - s.speed) * kS;
      s.drv += (tDrv - s.drv) * kS;
      s.tone += (tTone - s.tone) * kS;
      s.pops += (tPops - s.pops) * kS;
      s.level += (tLvl - s.level) * kS;
      const rpm = s.rpm;
      const rn = clip(rpm / red);
      const L = s.load;
      // closed throttle above idle → fuel-cut overrun
      const offT = clip(1 - s.thrC / 0.08) * clip((rpm - idle * 1.35) / (idle * 1.2));
      this.offK += (offT - this.offK) * 0.0004;

      // ── pop clock (only while a burst is open and crackle > 0) ──
      const ge = this.g.env;
      if (ge > 0.02 && s.pops > 0.001) {
        // sparse afterfire: ~1–4 bangs per second at most, never a dense crackle
        this.popAcc += (ge * (0.9 + 3.1 * s.pops) * s.pops) / sr;
        if (this.popAcc >= this.popNext) { this.popAcc = 0; this.popNext = 0.35 - Math.log(1 - this.rand() * 0.98) * 0.5; this.popArmed = true; }
      } else { this.popAcc = 0; this.popArmed = false; }
      if (this.popDouble > 0 && --this.popDouble === 0 && s.pops > 0.001) this.firePop(this.popDoubleBank, this.popDoubleAmp * (ge > 0 ? 1 : 0.5));

      // ── crank ──
      const idleish = clip(1 - (rpm - idle) / (idle * 1.2)) * clip(1 - L * 2.5);
      if (sp.hunt > 0) {
        this.huntV += (this.rand() - 0.5) * 0.00004 - this.hunt * 0.0000015;
        this.huntV *= 0.9995;
        this.hunt = clip(this.hunt + this.huntV, -0.02, 0.02);
      }
      let lope = 0;
      if (sp.camLope > 0) {
        this.lopePh += (TWO_PI * (rpm / 120)) / sr; // once per cycle
        if (this.lopePh > TWO_PI) this.lopePh -= TWO_PI;
        lope = sp.camLope * (0.4 + 1.2 * s.tone) * idleish * Math.sin(this.lopePh);
      }
      this.lopeNow = lope;
      const dDeg = ((rpm * 6) / sr) * (1 + this.hunt * sp.hunt * idleish * 1.5 + lope * 0.06);
      if (dDeg > 0 && rpm > 40) {
        const th = this.theta;
        for (let guard = 0; guard < 64; guard++) {
          const e = ev[this.nextEv];
          let dist = e.deg - th;
          if (dist < 0) dist += cyc;
          if (dist > dDeg) break;
          this.onEvent(e, dDeg);
          this.nextEv = (this.nextEv + 1) % ev.length;
        }
        let nt = th + dDeg;
        if (nt >= cyc) nt -= cyc;
        this.theta = nt;
      }

      // ── blowdown voices → banks ──
      let exA = 0, exB = 0, nzA = 0, nzB = 0, popP = 0, popN = 0;
      for (let v = 0; v < this.vN; v++) {
        let age = this.vAge[v];
        if (age > 1e8) continue;
        if (age < 0) { this.vAge[v] = age + 1; continue; }
        const x = age / this.vTp[v];
        let pos = x * Math.exp(1 - x);
        if (this.vK2[v]) pos *= pos;
        const y = age / this.vTn[v];
        const neg = y * Math.exp(1 - y) * this.vNegK[v];
        const p = this.vA[v] * (pos - neg);
        const att = age < this.vAtt[v] ? age / this.vAtt[v] : 1;
        const nz = this.vNa[v] * this.vNe[v] * att * (this.rand() * 2 - 1);
        if (this.vPop[v]) { popP += p; popN += nz; }
        if (this.vBank[v]) { exB += p; nzB += nz; } else { exA += p; nzA += nz; }
        if (age >= this.vAtt[v]) this.vNe[v] *= this.vDn[v];
        age += 1;
        this.vAge[v] = age > this.vTn[v] * 14 && this.vNe[v] < 1e-4 ? 1e9 : age;
      }

      if (this.nzHp) { nzA = this.nzHp[0].run(nzA); nzB = this.nzHp[1].run(nzB); }
      // ── pipes ──
      const inA = exA + cross * exB + (nzA + cross * nzB) * 0.6;
      const inB = exB + cross * exA + (nzB + cross * nzA) * 0.6;
      let pa = this.pipeA.run(inA, fbA, damp);
      let pb = this.pipeB.run(inB, fbA, damp);
      pa = this.tailA.run(pa, fbT, damp);
      pb = this.tailB.run(pb, fbT, damp);
      let ma = pa, mb = pb;
      for (let m = 0; m < nModes; m++) { ma += this.modesA[m].run(pa) * modes[m][2]; mb += this.modesB[m].run(pb) * modes[m][2]; }
      // load-driven steepening (soft, slightly asymmetric) → rasp harmonics
      let sa = Math.tanh(ma * drive * 0.5 + 0.08 * ma * ma) * dnorm;
      let sb = Math.tanh(mb * drive * 0.5 + 0.08 * mb * mb) * dnorm;
      let ya = this.lp2A.run(this.lpA.run(sa)) + this.raspA.run(sa + nzA * 0.5) * sp.rasp.amt * (0.5 + s.tone) * (0.3 + L);
      let yb = this.lp2B.run(this.lpB.run(sb)) + this.raspB.run(sb + nzB * 0.5) * sp.rasp.amt * (0.5 + s.tone) * (0.3 + L);
      if (metalN) {
        let mt = 0;
        const exc = nzA + nzB + (exA + exB) * 0.3;
        for (let m = 0; m < metalN; m++) mt += this.metal[m].run(exc) * sp.metal[m][2];
        mt *= 0.5 + 0.8 * s.tone;
        ya += mt; yb += mt;
      }
      // afterfire bangs happen at the pipe exit: broadband crack + body thump bypass the muffler
      if (popP !== 0 || popN !== 0 || this.popTail > 0 || this.thA > 1e-5 || this.snA > 1e-5) {
        let bang = 0;
        if (this.thA > 1e-5) {
          this.thPh += (TWO_PI * this.thF) / sr;
          this.thF = 70 + (this.thF - 70) * this.thFd; // slight pitch drop = 'bang', not 'beep'
          bang += Math.sin(this.thPh) * this.thA;
          this.thA *= this.thD;
        } else this.thA = 0;
        if (this.snA > 1e-5) {
          bang += this.crackHp.run(this.crackBp.run((this.rand() * 2 - 1) * this.snA * 10));
          this.snA *= this.snD;
        } else { this.snA = 0; this.crackHp.run(this.crackBp.run(0)); }
        const ring = this.popRing.run(bang) * 0.6;
        const crack = bang * 1.3 + ring + this.thumpLp.run(popP) * 0.5 + popN * 0.3;
        ya += crack; yb += crack;
        this.popTail = popP !== 0 || popN !== 0 ? 2048 : this.popTail - 1;
      }
      ya = this.radA.run(ya);
      yb = this.radB.run(yb);

      // ── intake ──
      let ienv = 0;
      for (let k = 0; k < this.iN; k++) {
        const a = this.iAge[k];
        if (a >= this.iDur[k]) continue;
        const w = Math.sin((Math.PI * a) / this.iDur[k]);
        ienv += this.iA[k] * w * w;
        this.iAge[k] = a + 1;
      }
      const inAmt = ip.amt * (0.6 + 0.8 * s.tone) * (0.06 + 0.94 * L * L * (0.5 + 0.5 * rn)) * (0.6 + 0.6 * s.drv) * clip(rpm / 300);
      const wn = this.rand() * 2 - 1;
      const intake = (this.inBp.run(wn * ienv) * 0.9 + this.honk.run(ienv * (0.5 + 0.5 * wn)) * ip.honk + this.inLp.run(ienv - 0.5) * ip.growl) * inAmt;

      // ── mechanics ──
      const tq = this.tickQ0 || 0; this.tickQ0 = 0;
      const ticks = (this.tickA.run(tq) + 0.6 * this.tickB.run(tq)) * mech.tick;
      const run = clip(rpm / 300);
      const mechS = (this.whir.run(this.rand() * 2 - 1) * mech.whir * (0.3 + rn) + this.bay.run(this.rand() * 2 - 1) * mech.bay * (0.4 + rn)) * run;

      // ── turbo ──
      let tb = 0;
      if (turbo) {
        // no road load (standing, free-revving) → little boost builds
        const tgt = L * clip((rpm - turbo.spoolRpm * 0.55) / (turbo.spoolRpm * 0.9)) * (0.3 + 0.7 * clip(s.speed / 8));
        const up = tgt > this.boost;
        this.boost += (tgt - this.boost) * (1 - Math.exp(-1 / ((up ? turbo.lagS : 0.35) * sr)));
        const shT = 0.08 + 0.18 * rn + 0.74 * Math.pow(this.boost, 0.8);
        this.shaft += (shT - this.shaft) * (1 - Math.exp(-1 / ((shT > this.shaft ? 0.25 : 0.9) * sr)));
        this.tWob += (this.rand() - 0.5) * 0.002; this.tWob *= 0.999;
        const fw = (turbo.whineHz + turbo.whineRange * this.shaft) * (1 + this.tWob * 0.02);
        this.tPh += fw / sr; if (this.tPh > 1) this.tPh -= 1;
        this.tPh2 += (fw * 2.03) / sr; if (this.tPh2 > 1) this.tPh2 -= 1;
        const nb = this.turboBp.run(this.rand() * 2 - 1);
        const nb2 = this.turboBp2.run(this.rand() * 2 - 1);
        const tone = Math.sin(TWO_PI * this.tPh) * (0.55 + 4 * nb) + 0.3 * Math.sin(TWO_PI * this.tPh2) * (0.5 + 4 * nb2);
        const wl = turbo.whine * 1.6 * Math.pow(Math.max(0, this.shaft - 0.14), 1.4) * (0.35 + 0.65 * L) * (0.6 + 0.5 * s.drv);
        const hiss = this.hiss.run(this.rand() * 2 - 1) * turbo.hiss * this.boost * (0.4 + 0.6 * L);
        // blow-off: lift with boost
        this.bovThrPeak = Math.max(s.thr, this.bovThrPeak * 0.99997);
        if (this.bovEnv < 0.02 && s.thr < 0.15 && this.bovThrPeak - s.thr > 0.4 && this.boost > 0.25) {
          this.bovAmp = this.boost; this.bovEnv = this.boost; this.bovThrPeak = s.thr;
          this.boost *= 0.3;
        }
        let bov = 0;
        if (this.bovEnv > 1e-4) {
          this.bovEnv *= Math.exp(-1 / (0.32 * sr));
          this.bovPh += (17 + 8 * this.bovEnv) / sr; if (this.bovPh > 1) this.bovPh -= 1;
          const flutter = 1 - turbo.flutter * (0.3 + 0.9 * s.tone) * 0.5 * (1 + Math.cos(TWO_PI * this.bovPh));
          bov = this.bovHp.run(this.bovBp.run(this.rand() * 2 - 1)) * this.bovEnv * turbo.bov * Math.max(0, flutter);
        }
        tb = tone * wl * 0.16 + hiss + bov;
        // the turbine eats pulse energy: soften the exhaust slightly with boost
        const soft = 1 - turbo.muffle * this.boost;
        ya *= soft; yb *= soft;
      }

      // ── engine-order body (partials phase-locked to the crank angle, so they carry the same
      // hunt / lope; low-passed; gives the cabin speakers a solid low end under the pulses) ──
      let body = 0;
      if (nBody) {
        const rev = (this.theta / 360) * TWO_PI;
        for (let b = 0; b < nBody; b++) body += Math.sin(bodyOrd[b] * rev + bodyPh[b]) * bodyAmp[b];
        // follow the real pulse strength (so lope / lazy fires / cuts move the body too)
        const pe = Math.abs(exA) + Math.abs(exB);
        this.pEnv += (pe - this.pEnv) * (pe > this.pEnv ? 0.004 : 0.0006);
        body = this.bodyLp.run(body) * sp.body.gain * Math.min(2.5, this.pEnv * 3.2) * (0.6 + 0.4 * L) * (1 - 0.4 * this.offK) * (0.7 + 0.5 * s.drv) * clip(rpm / 250);
      }
      // ── mix ──
      const center = body + intake + ticks + mechS + tb;
      let l = (ya * (1 + width) + yb * (1 - width)) * 0.5 * sp.exGain + center;
      let r = (yb * (1 + width) + ya * (1 - width)) * 0.5 * sp.exGain + center;
      // two short body reflections (decorrelation / space)
      const r1 = this.refl1.run(l), r2 = this.refl2.run(r);
      this.reflLp1 += 0.3 * (r1 - this.reflLp1); this.reflLp2 += 0.3 * (r2 - this.reflLp2);
      l += this.reflLp2 * this.reflAmt; r += this.reflLp1 * this.reflAmt;
      const gain = s.level * trim * Math.pow(10, (-9 + 9 * s.drv) / 20);
      l = this.cabL.run(l + this.boomL.run(l) * this.boomAmt);
      r = this.cabR.run(r + this.boomR.run(r) * this.boomAmt);
      l = this.dcL1.run(l) * gain;
      r = this.dcR1.run(r) * gain;

      // ── look-ahead limiter (−1 dBFS) ──
      const pk = Math.max(Math.abs(l), Math.abs(r));
      if (pk >= this.peakHold || this.peakAge > this.laN) { this.peakHold = pk; this.peakAge = 0; } else this.peakAge++;
      const ceil = 0.89;
      const want = this.peakHold > ceil ? ceil / this.peakHold : 1;
      this.limG += (want - this.limG) * (want < this.limG ? this.limAtt : this.limRel);
      const j = this.laI;
      const dl = this.laL[j], dr = this.laR[j];
      this.laL[j] = l; this.laR[j] = r;
      this.laI = (j + 1) % this.laL.length;
      let ol = dl * this.limG, orr = dr * this.limG;
      // final safety: soft clip only above the ceiling
      if (ol > ceil) ol = ceil + (1 - ceil) * Math.tanh((ol - ceil) / (1 - ceil)); else if (ol < -ceil) ol = -ceil - (1 - ceil) * Math.tanh((-ol - ceil) / (1 - ceil));
      if (orr > ceil) orr = ceil + (1 - ceil) * Math.tanh((orr - ceil) / (1 - ceil)); else if (orr < -ceil) orr = -ceil - (1 - ceil) * Math.tanh((-orr - ceil) / (1 - ceil));
      outL[i] = ol;
      if (outR) outR[i] = orr;
    }
    for (let c = 2; c < outputs[0].length; c++) outputs[0][c].set(outL);
    return true;
  }
}

registerProcessor('beatbox-processor', BeatboxProcessor);
