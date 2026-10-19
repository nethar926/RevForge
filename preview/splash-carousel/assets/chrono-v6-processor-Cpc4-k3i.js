/**
 * Chrono Coupe — rear-mounted 90° V6, odd-fire (150° / 90° alternating crank intervals).
 * 100 % procedural AudioWorklet: every sound below is computed per sample from the crank
 * angle. No samples, loops, wavetables or convolution. Standalone (no imports) so it can be
 * loaded as a plain module by the browser and by node-web-audio-api.
 *
 * Crank model: θ ∈ [0, 720°) advances at rpm·6/sr °/sample. Compression torque slows the crank
 * before each TDC and speeds it after (strong while cranking / running down, faint at idle),
 * so the starter and the run-down carry the 150/90 lope in their rhythm.
 *
 * Sound sources, by event:
 *   fire (TDC)        exhaust blowdown pulse (alpha-shaped) + rasp noise, per bank pipe,
 *                     or a dark air chuff when there is no combustion (fire = 0)
 *   intake open       induction breath (band noise) + airbox honk — the engine sits right
 *                     behind the cabin, so intake and engine-bay mechanics are close and
 *                     the exhaust is behind (darker, slightly later)
 *   valve closing     small valvetrain ticks (resonator pings, 3-sample excitation)
 *   continuous        cam-chain whir, starter motor + mesh, cooling ticks, settle sigh
 *   edges             starter mesh-in (solenoid clunk), rock (end-of-run-down shudder)
 *
 * Params are k-rate and smoothed per sample. processorOptions.seed seeds the PRNG.
 */
const FIRE_DEG = [0, 150, 240, 390, 480, 630];
const BANK = [0, 1, 0, 1, 0, 1];

class OnePole {
  constructor() { this.y = 0; this.a = 0; }
  setLp(fc, sr) { this.a = 1 - Math.exp((-2 * Math.PI * Math.max(5, fc)) / sr); }
  lp(x) { this.y += this.a * (x - this.y); return this.y; }
  hp(x) { this.y += this.a * (x - this.y); return x - this.y; }
}

class Biquad {
  constructor() { this.b0 = 0; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  set(type, f, q, sr) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Math.max(0.1, q));
    const a0 = 1 + al;
    let b0, b1, b2;
    if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
    else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class Comb {
  constructor(n) { this.buf = new Float32Array(n + 1); this.n = n; this.i = 0; this.lp = 0; }
  run(x, g, damp) {
    const j = (this.i + 1) % this.buf.length; // oldest sample = n samples ago
    const d = this.buf[j];
    this.lp += damp * (d - this.lp);
    const y = x + g * this.lp;
    this.buf[this.i] = y;
    this.i = j;
    return y;
  }
}

const P = (name, defaultValue, minValue, maxValue) => ({ name, defaultValue, minValue, maxValue, automationRate: 'k-rate' });

class ChronoV6Processor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      P('rpm', 0, 0, 9000),
      P('throttle', 0, 0, 1),
      P('load', 0, -1, 1),
      P('fire', 0, 0, 1),
      P('comp', 0, 0, 1),
      P('starter', 0, 0, 1),
      P('overrun', 0, 0, 1),
      P('rasp', 0.55, 0, 1),
      P('lump', 0.5, 0, 1),
      P('level', 0.5, 0, 4),
      P('rock', 0, 0, 1),
      P('settle', 0, 0, 1),
      P('tick', 0, 0, 1),
    ];
  }

  constructor(options) {
    super();
    const sr = sampleRate;
    this.sr = sr;
    let s = (options?.processorOptions?.seed ?? 0x5eed) >>> 0;
    if (!s) s = 0x5eed;
    this.seed = s;
    this.theta = 0;
    // Event table (sorted by crank angle): 0 fire, 1 intake open, 2 valve tick
    const ev = [];
    for (let c = 0; c < 6; c++) {
      ev.push({ deg: FIRE_DEG[c], type: 0, cyl: c });
      ev.push({ deg: (FIRE_DEG[c] + 370) % 720, type: 1, cyl: c });
      ev.push({ deg: (FIRE_DEG[c] + 365) % 720, type: 2, cyl: c });
      ev.push({ deg: (FIRE_DEG[c] + 575) % 720, type: 2, cyl: c });
    }
    ev.sort((a, b) => a.deg - b.deg);
    this.events = ev;
    this.nextEv = 0;
    // Fixed per-cylinder imbalance (lumpy, never two identical pulses)
    this.cylGain = FIRE_DEG.map(() => 1 + (this.rand() - 0.5) * 0.26);
    this.cylTau = FIRE_DEG.map(() => 1 + (this.rand() - 0.5) * 0.3);
    this.cycleGain = 1;
    // Exhaust voices
    this.vN = 10;
    this.vAge = new Float64Array(this.vN).fill(1e9);
    this.vA = new Float64Array(this.vN);
    this.vTau = new Float64Array(this.vN).fill(1);
    this.vE = new Float64Array(this.vN);
    this.vDe = new Float64Array(this.vN);
    this.vNa = new Float64Array(this.vN);
    this.vNe = new Float64Array(this.vN);
    this.vDn = new Float64Array(this.vN);
    this.vBank = new Uint8Array(this.vN);
    this.vHead = 0;
    // Intake voices (sin² envelopes over ~200° crank)
    this.iN = 4;
    this.iAge = new Float64Array(this.iN).fill(1e9);
    this.iDur = new Float64Array(this.iN).fill(1);
    this.iA = new Float64Array(this.iN);
    this.iHead = 0;
    // Filters
    this.combA = new Comb(Math.round(0.0026 * sr));
    this.combB = new Comb(Math.round(0.0034 * sr));
    this.exHp = new OnePole();
    this.exLp1 = new Biquad();
    this.pipeLo = new Biquad();
    this.pipeMid = new Biquad();
    this.clatter = new Biquad();
    this.raspBp = new Biquad();
    this.inBp = new Biquad();
    this.honk = new Biquad();
    this.tickA = new Biquad();
    this.tickB = new Biquad();
    this.chain = new Biquad();
    this.stWhineBp = new Biquad();
    this.stMesh = new Biquad();
    this.clunkHi = new Biquad();
    this.clunkLo = new Biquad();
    this.rockLo = new Biquad();
    this.rattle = new Biquad();
    this.sighLp = new Biquad();
    this.coolPing = new Biquad();
    this.dcHp = new OnePole();
    this.dcHp.setLp(18, sr);
    this.exHp.setLp(75, sr);
    this.clatter.set('bp', 1900, 0.9, sr);
    this.tickA.set('bp', 3100, 16, sr);
    this.tickB.set('bp', 5300, 20, sr);
    this.clunkHi.set('bp', 1700, 7, sr);
    this.clunkLo.set('bp', 95, 3, sr);
    this.rockLo.set('bp', 34, 4, sr);
    this.rattle.set('bp', 760, 9, sr);
    this.sighLp.set('lp', 650, 0.7, sr);
    this.coolPing.set('bp', 4400, 30, sr);
    // Smoothed controls
    this.s = { rpm: 0, thr: 0, load: 0, fire: 0, comp: 0, starter: 0, overrun: 0, rasp: 0.55, lump: 0.5, level: 0.5 };
    this.k = 1 - Math.exp(-1 / (0.012 * sr));
    // Excitation queues (3-sample raised pulses → resonators)
    this.tickQ = new Float64Array(4);
    this.clunkQ = 0;
    this.clunkAge = 1e9;
    this.rockAge = 1e9;
    this.sighEnv = 0;
    this.sighAtt = 0;
    this.sighDecay = Math.exp(-1 / (0.26 * sr));
    this.coolQ = 0;
    // Starter motor
    this.smHz = 0;
    this.stEnv = 0;
    this.stPhase = 0;
    this.prevStarter = 0;
    this.prevRock = 0;
    this.prevSettle = 0;
    this.hunt = 0;
    this.popAcc = 0;
    this.popNext = 0.2;
    this.popArmed = false;
    this.huntV = 0;
  }

  rand() {
    let x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.seed = x;
    return x / 4294967296;
  }

  spawnExhaust(A, tauS, nA, tauNS, bank) {
    const i = this.vHead;
    this.vHead = (this.vHead + 1) % this.vN;
    this.vAge[i] = 0;
    this.vA[i] = A;
    this.vTau[i] = Math.max(4, tauS);
    this.vE[i] = 1;
    this.vDe[i] = Math.exp(-1 / this.vTau[i]);
    this.vNa[i] = nA;
    this.vNe[i] = 1;
    this.vDn[i] = Math.exp(-1 / Math.max(4, tauNS));
    this.vBank[i] = bank;
  }

  onEvent(e, dDeg) {
    const s = this.s;
    const sr = this.sr;
    const rn = Math.min(1, s.rpm / 7000);
    if (e.type === 0) {
      if (e.cyl === 0) this.cycleGain = 1 + (this.rand() - 0.5) * 0.3 * s.lump * (1 - rn);
      const thrE = Math.max(s.thr, 0.1 + 0.08 * (1 - rn));
      const bank = BANK[e.cyl];
      const fires = s.fire > 0.001 && this.rand() < 0.2 + 0.8 * Math.min(1, s.fire * 1.25);
      if (fires) {
        const jit = (0.08 + 0.3 * s.lump * (1 - Math.min(1, s.rpm / 2500))) * (this.rand() - 0.5);
        const lift = s.thr < 0.08 ? 0.55 + 0.45 * (1 - rn) : 1; // closed throttle at revs: thin
        const A = s.fire * (0.3 + 0.7 * thrE) * lift * this.cylGain[e.cyl] * this.cycleGain * (1 + jit);
        const tauMs = (0.75 + 1.5 * (1 - rn) - 0.25 * s.thr) * this.cylTau[e.cyl];
        const nA = A * (0.25 + 0.45 * s.rasp) * (0.6 + 0.6 * thrE);
        this.spawnExhaust(A, tauMs * 0.001 * sr, nA, (1.5 + 3.5 * (1 - rn)) * 0.001 * sr, bank);
        // Afterfire on a lift-off burst only (overrun envelope is gated upstream): sparse,
        // distinct pops — armed by a slow random clock, released on the next exhaust stroke
        if (this.popArmed && s.overrun > 0.02) {
          this.popArmed = false;
          const pa = (0.8 + 0.6 * this.rand()) * Math.min(1, s.overrun * 1.4);
          this.spawnExhaust(pa * 1.1, 0.0012 * sr, pa * 1.4, 0.007 * sr, bank);
        }
      } else if (s.rpm > 20) {
        // No combustion: the cylinder still pumps air out — dark chuff (run-down / cranking)
        const C = (0.1 + 0.3 * s.comp) * Math.min(1, s.rpm / 120) * this.cylGain[e.cyl];
        this.spawnExhaust(C, (3.2 + 1.5 * this.rand()) * 0.001 * sr, C * 0.35, 0.004 * sr, bank);
      }
    } else if (e.type === 1) {
      const i = this.iHead;
      this.iHead = (this.iHead + 1) % this.iN;
      this.iAge[i] = 0;
      this.iDur[i] = Math.min(0.12 * sr, Math.max(0.005 * sr, 200 / Math.max(1e-3, dDeg)));
      this.iA[i] = (0.85 + 0.3 * this.rand()) * this.cylGain[e.cyl];
    } else {
      // Valvetrain tick: 3-sample raised pulse into two resonators
      if (s.rpm > 30) {
        const a = (0.6 + 0.4 * this.rand()) * (0.75 + 0.25 * rn);
        this.tickQ[0] += a * 0.5; this.tickQ[1] += a; this.tickQ[2] += a * 0.5;
      }
    }
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0][0];
    if (!out) return true;
    const sr = this.sr;
    const s = this.s;
    const k = this.k;
    const pv = (n) => parameters[n][0];
    const tRpm = pv('rpm'), tThr = pv('throttle'), tLoad = pv('load'), tFire = pv('fire'), tComp = pv('comp');
    const tSt = pv('starter'), tOv = pv('overrun'), tRasp = pv('rasp'), tLump = pv('lump'), tLevel = pv('level');
    const rock = pv('rock'), settle = pv('settle'), tick = pv('tick');
    // Edges (k-rate is plenty: 2.7 ms)
    if (tSt > 0.5 && this.prevStarter <= 0.5) { this.clunkAge = 0; }
    this.prevStarter = tSt;
    if (rock > 0.5 && this.prevRock <= 0.5) { this.rockAge = 0; this.spawnExhaust(0.1, 0.006 * sr, 0.03, 0.006 * sr, 1); }
    this.prevRock = rock;
    if (settle > 0.5 && this.prevSettle <= 0.5) { this.sighAtt = 1; }
    this.prevSettle = settle;
    // Block-rate filter retune
    const rn0 = Math.min(1, s.rpm / 7000);
    const thrE0 = Math.max(s.thr, 0.1);
    this.exLp1.set('lp', 1500 + 3600 * thrE0 + 1800 * rn0, 0.6, sr);
    this.raspBp.set('bp', 1650 + 900 * rn0 + 300 * s.thr, 1.3, sr);
    this.inBp.set('bp', 480 + 950 * thrE0 + 520 * rn0, 1.5, sr);
    this.honk.set('bp', 200 + 70 * rn0, 4.5, sr);
    this.pipeLo.set('bp', 112 + 30 * rn0, 5 - 2.5 * rn0, sr);
    this.pipeMid.set('bp', 430 + 160 * rn0, 6 - 3 * rn0, sr);
    this.chain.set('bp', Math.max(60, (s.rpm / 60) * 23), 14, sr);
    this.stWhineBp.set('bp', Math.max(80, this.smHz * 9), 6, sr);
    this.stMesh.set('bp', 1350, 2.2, sr);
    const combDamp = 0.55 + 0.3 * thrE0;
    const drive = 1 + 2.4 * s.rasp * thrE0;
    const dnorm = 1 / Math.tanh(drive * 0.6);
    for (let n = 0; n < out.length; n++) {
      s.rpm += (tRpm - s.rpm) * k;
      s.thr += (tThr - s.thr) * k;
      s.load += (tLoad - s.load) * k;
      s.fire += (tFire - s.fire) * k;
      s.comp += (tComp - s.comp) * k;
      s.starter += (tSt - s.starter) * k;
      s.overrun += (tOv - s.overrun) * k;
      s.rasp += (tRasp - s.rasp) * k;
      s.lump += (tLump - s.lump) * k;
      s.level += (tLevel - s.level) * k;
      // Pop clock: ~5 / s at a full burst, never two within one exhaust stroke
      if (s.overrun > 0.02) {
        this.popAcc += (s.overrun * 5) / sr;
        if (this.popAcc >= this.popNext) {
          this.popAcc = 0;
          this.popNext = 0.25 - Math.log(1 - this.rand() * 0.98);
          this.popArmed = true;
        }
      } else {
        this.popAcc = 0;
        this.popArmed = false;
      }
      // Idle hunt: slow random walk (±1.5 %) that fades out with revs / throttle
      this.huntV += ((this.rand() - 0.5) * 0.00004 - this.hunt * 0.0000015) ;
      this.huntV *= 0.9995;
      this.hunt += this.huntV;
      if (this.hunt > 0.015) this.hunt = 0.015; else if (this.hunt < -0.015) this.hunt = -0.015;
      // Compression torque: dip before each TDC, rebound after
      let m = 0;
      const th = this.theta;
      for (let c = 0; c < 6; c++) {
        let x = th - FIRE_DEG[c];
        if (x < -360) x += 720; else if (x >= 360) x -= 720;
        if (x > -70 && x < 80) {
          const a = (x + 18) / 22, b = (x - 22) / 26;
          m += -Math.exp(-a * a) + 0.85 * Math.exp(-b * b);
        }
      }
      const idleish = Math.max(0, 1 - s.rpm / 1400);
      const cmod = Math.min(0.62, s.comp * Math.max(0, 1 - s.rpm / 950) * 0.62 + 0.035 * s.lump * idleish);
      const dDeg = ((s.rpm * 6) / sr) * (1 + this.hunt * idleish) * (1 + cmod * m);
      // Crossed events: the pointer always names the next event ahead of θ (cyclic, 720°)
      if (dDeg > 0) {
        const ev = this.events;
        for (let guard = 0; guard < 24; guard++) {
          const e = ev[this.nextEv];
          let dist = e.deg - th;
          if (dist < 0) dist += 720;
          if (dist > dDeg) break;
          this.onEvent(e, dDeg);
          this.nextEv = (this.nextEv + 1) % ev.length;
        }
        let nt = th + dDeg;
        if (nt >= 720) nt -= 720;
        this.theta = nt;
      }
      // Exhaust voices → two bank pipes
      let exA = 0, exB = 0;
      for (let i = 0; i < this.vN; i++) {
        const age = this.vAge[i];
        if (age > 1e8) continue;
        const tau = this.vTau[i];
        const pulse = this.vA[i] * (age / tau) * this.vE[i] * 2.718281828;
        const att = age < 9 ? age / 9 : 1;
        const nz = this.vNa[i] * this.vNe[i] * att * (this.rand() * 2 - 1);
        const v = pulse + nz;
        if (this.vBank[i]) exB += v; else exA += v;
        this.vE[i] *= this.vDe[i];
        this.vNe[i] *= this.vDn[i];
        this.vAge[i] = age + 1;
        if (age > tau * 9 && this.vNe[i] < 1e-3) this.vAge[i] = 1e9;
      }
      const pa = this.combA.run(exA, -0.6, combDamp);
      const pb = this.combB.run(exB, -0.56, combDamp);
      let ex = pa + 0.92 * pb;
      // Pipe / muffler body: a modest low mode (thin, not boomy) and a stronger mid mode
      ex += this.pipeLo.run(ex) * 0.9 + this.pipeMid.run(ex) * 1.2;
      ex = Math.tanh(ex * drive * 0.6) * dnorm * 0.85;
      ex = this.exHp.hp(ex);
      const exL = this.exLp1.run(ex);
      const rasp = this.raspBp.run(ex) * (0.35 + 0.5 * s.rasp);
      const exhaust = exL + rasp;
      // Intake: sin² envelopes × band noise + airbox honk
      let ienv = 0;
      for (let i = 0; i < this.iN; i++) {
        const a = this.iAge[i];
        if (a >= this.iDur[i]) continue;
        const w = Math.sin((Math.PI * a) / this.iDur[i]);
        ienv += this.iA[i] * w * w;
        this.iAge[i] = a + 1;
      }
      const thrE = Math.max(s.thr, 0.08);
      const rn = Math.min(1, s.rpm / 7000);
      const inAmt = (0.05 + 0.55 * thrE * (0.45 + 0.55 * rn)) * (s.fire * 0.8 + 0.2) * Math.min(1, s.rpm / 300);
      const wn = this.rand() * 2 - 1;
      const intake = this.inBp.run(wn * ienv) * inAmt * 0.9 + this.honk.run(ienv * (0.6 + 0.4 * wn)) * inAmt * 0.16;
      // Valvetrain ticks (3-sample raised excitation)
      const tx = this.tickQ[0] * 0.5;
      this.tickQ[0] = this.tickQ[1]; this.tickQ[1] = this.tickQ[2]; this.tickQ[2] = 0;
      const ticks = (this.tickA.run(tx) * 0.9 + this.tickB.run(tx) * 0.6) * 0.05;
      // Engine-bay clatter: broadband mechanical bed that breathes with the crank
      const clat = this.clatter.run(this.rand() * 2 - 1) * (0.014 + 0.02 * rn) * (0.5 + 0.5 * Math.max(0, -m)) * Math.min(1, s.rpm / 300);
      // Cam-chain whir
      const chain = this.chain.run(this.rand() * 2 - 1) * (0.012 + 0.03 * rn) * Math.min(1, s.rpm / 400);
      // Starter motor: armature speed follows the crank while in mesh, spins down when released
      const inMesh = s.starter > 0.5;
      const smT = inMesh ? (s.rpm / 60) * 11 * (1 + cmod * m * 0.6) : 0;
      this.smHz += (smT - this.smHz) * (inMesh ? 0.002 : 0.00009);
      this.stEnv += ((inMesh ? 1 : 0) - this.stEnv) * (inMesh ? 0.003 : 0.00007);
      let starter = 0;
      if (this.stEnv > 1e-4) {
        this.stPhase += (this.smHz * 9) / sr;
        if (this.stPhase > 1) this.stPhase -= 1;
        const ph = this.stPhase * 2 * Math.PI;
        const whine = Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.22 * Math.sin(3 * ph);
        const brush = this.stWhineBp.run(this.rand() * 2 - 1) * (0.6 + 0.4 * Math.sin(ph * 0.5));
        const mesh = this.stMesh.run((this.rand() * 2 - 1) * (0.5 + 0.5 * Math.sin((ph / 9) * 4))) * s.starter;
        starter = this.stEnv * (whine * 0.03 + brush * 0.35 + mesh * 0.25);
      }
      // Solenoid clunk as the pinion meshes
      let clunk = 0;
      if (this.clunkAge < 0.25 * sr) {
        const a = this.clunkAge;
        const x = a < 24 ? Math.sin((Math.PI * a) / 24) : 0;
        clunk = this.clunkHi.run(x * 0.5) * 0.9 + this.clunkLo.run(x) * 0.5;
        this.clunkAge++;
      }
      // Rock / shudder at the end of the run-down
      let shud = 0;
      if (this.rockAge < 0.6 * sr) {
        const a = this.rockAge;
        const t = a / sr;
        const x = t < 0.03 ? Math.sin((Math.PI * t) / 0.03) : 0;
        const r1 = t > 0.04 && t < 0.046 ? Math.sin((Math.PI * (t - 0.04)) / 0.006) : 0;
        const r2 = t > 0.13 && t < 0.135 ? Math.sin((Math.PI * (t - 0.13)) / 0.005) * 0.6 : 0;
        shud = this.rockLo.run(x) * 0.9 + this.rattle.run((r1 + r2) * (this.rand() * 0.5 + 0.5)) * 0.18;
        this.rockAge++;
      }
      // Settle sigh (hot exhaust / air), soft attack, ~0.4 s
      let sigh = 0;
      if (this.sighAtt > 0 || this.sighEnv > 1e-4) {
        if (this.sighAtt > 0) {
          this.sighEnv += (1 - this.sighEnv) * 0.0012;
          if (this.sighEnv > 0.95) this.sighAtt = 0;
        } else this.sighEnv *= this.sighDecay;
        sigh = this.sighLp.run(this.rand() * 2 - 1) * this.sighEnv * 0.014;
      }
      // Cooling ticks (sparse, faint)
      if (tick > 0.01 && this.rand() < (tick * 2.4) / sr) this.coolQ = 0.5 + 0.5 * this.rand();
      const cq = this.coolQ;
      this.coolQ = 0;
      const cool = this.coolPing.run(cq) * 0.06;
      // Mix: exhaust behind (already darker), intake + bay mechanics close
      const y = exhaust * 0.9 + intake + ticks + clat + chain + starter + clunk * 0.5 + shud + sigh + cool;
      out[n] = this.dcHp.hp(y) * s.level;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}

registerProcessor('chrono-v6-processor', ChronoV6Processor);
