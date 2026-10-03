/**
 * Pulse-train ICE AudioWorkletProcessor (organic v1 + Physics Sim pulse/bus §2)
 * Buses: mechanical bed + soft combustion pulses + intake×throttle + exhaust waveguide.
 * V8 per-bank schedule 180°/90°/180°/270° + dual-collector L/R burble.
 * Family 4 rotary: eccentric chamber-pulse (chambersPerRotor × rotors / 360°).
 * RES / §2.3: firingFamily + firingMask + misfire so lope changes (no Wiebe).
 * Anti-digital: soft asymmetric envelopes, noise/body dominate — no saw/square lead.
 * Self-contained (no imports) for Tesla Chromium AudioWorklet constraints.
 *
 * Night Pursuit opt-in (all default 0 → every other pack renders bit-identical paths):
 *   camLope        lumpy-cam idle: rpm hunt, per-slot imbalance, lazy fires, longer pulses
 *   bankSplit      true dual exhaust: per-bank waveguides of unequal length so the
 *                  cross-plane bank-A/B uneven trains keep their half-order burble
 *   overrun        0..1 lift-off envelope pushed from the main thread
 *   overrunBurble  amount of fuel-cut hollowing + irregular afterfire pops (+ light crack)
 *   dcGuard        strip DC from the pulse excitation (~12 Hz one-pole) so overlapping
 *                  pulses at high rpm cannot charge the waveguide → tanh → DC-block collapse
 *
 * firingMask convention (uint8 0–255):
 *   bit i set  → cylinder/slot i DISABLED (skip that pulse event)
 *   default 0  → all slots enabled (mask-none)
 *   Dropping one bit MUST change lope intervals, not merely quieten.
 */
class PulseEngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 800, minValue: 200, maxValue: 9000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cylinders', defaultValue: 8, minValue: 3, maxValue: 12, automationRate: 'k-rate' },
      { name: 'pulseWidth', defaultValue: 0.35, minValue: 0.05, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pulseJitter', defaultValue: 0.08, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
      { name: 'roughness', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'growl', defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'exhaustLength', defaultValue: 0.45, minValue: 0.05, maxValue: 1, automationRate: 'k-rate' },
      { name: 'exhaustFeedback', defaultValue: 0.72, minValue: 0.1, maxValue: 0.97, automationRate: 'k-rate' },
      { name: 'mufflerMix', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'intake', defaultValue: 0.45, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'crackle', defaultValue: 0.35, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'masterGain', defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'misfire', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'firingFamily', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
      // §2.3: bit i set = slot i disabled; 0 = all fire (chamber mask for rotary)
      { name: 'firingMask', defaultValue: 0, minValue: 0, maxValue: 255, automationRate: 'k-rate' },
      // Dual-collector L/R burble delay (ms). Pack-driven; clamp 0.5–3 in process.
      { name: 'collectorDelayMs', defaultValue: 1.0, minValue: 0, maxValue: 5, automationRate: 'k-rate' },
      // Rotary chamber-pulse: chambers/rotor (default 3) × rotors (1|2) → events/eccentric-rev
      { name: 'chambersPerRotor', defaultValue: 3, minValue: 2, maxValue: 4, automationRate: 'k-rate' },
      { name: 'rotors', defaultValue: 1, minValue: 1, maxValue: 2, automationRate: 'k-rate' },
      // Night Pursuit opt-ins (default 0 = legacy behaviour for all other packs)
      { name: 'camLope', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'bankSplit', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'overrun', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'overrunBurble', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'dcGuard', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    // Explicit eventAnglesDeg per firingFamily (§2.1 / §2.2)
    // Cross-plane V8: 8 fires / 720°. Bank A @ 0,180,270,450 → intervals 180/90/180/270.
    // Overall still every 90° into common collector → 4th-order fundamental.
    this._crossDeg = new Float64Array([0, 90, 180, 270, 360, 450, 540, 630]);
    this._crossBank = new Int8Array([0, 1, 0, 0, 1, 0, 1, 1]); // 0=L 1=R
    // Flat-plane V8: even 90° banks alternate
    this._flatDeg = new Float64Array([0, 90, 180, 270, 360, 450, 540, 630]);
    this._flatBank = new Int8Array([0, 1, 0, 1, 0, 1, 0, 1]);
    // I6 even: 120° global (6 events / 720°)
    this._i6Deg = new Float64Array([0, 120, 240, 360, 480, 600]);
    this._i6Bank = new Int8Array([0, 1, 0, 1, 0, 1]);

    // Scratch schedule buffers (filled per-block from family)
    this._evtDeg = new Float64Array(12);
    this._evtBank = new Int8Array(12);
    this._evtN = 8;
    // Cycle length °: 720 for 4-stroke piston families; 360 for rotary eccentric shaft
    this._cycleDeg = 720;

    // §2.1 crank-angle scheduler: integrate θ; nextPulse from event angles / degPerSec
    this._theta = 0; // unwrapped crank/eccentric degrees
    this._nextTheta = 0; // absolute ° of next candidate event
    this._evtIdx = 0;
    this._schedInit = false;
    this._lastFamily = -1;
    this._lastCyl = -1;
    this._lastChambers = -1;
    this._lastRotors = -1;

    // Active soft-pulse envelopes (sample-accurate starts)
    const PMAX = 16;
    this._pAge = new Float64Array(PMAX); // samples since start; -1 = free
    this._pLen = new Float64Array(PMAX);
    this._pBank = new Int8Array(PMAX);
    this._pAmp = new Float64Array(PMAX);
    for (let i = 0; i < PMAX; i++) this._pAge[i] = -1;
    this._pMax = PMAX;

    const maxDelay = 4096;
    this._delay = new Float32Array(maxDelay);
    this._delayLen = maxDelay;
    this._wPos = 0;
    this._delaySamples = 400;

    this._delay2 = new Float32Array(maxDelay);
    this._wPos2 = 0;
    this._delaySamples2 = 180;

    // Dual-collector cross burble (collectorDelayMs → 0.5–3 ms)
    this._burble = new Float32Array(256);
    this._burbleLen = 256;
    this._burblePos = 0;
    this._burbleSamples = 48;

    // Night Pursuit: per-bank dual-exhaust waveguides (bankSplit)
    this._dA = new Float32Array(maxDelay);
    this._dB = new Float32Array(maxDelay);
    this._wA = 0;
    this._wB = 0;
    // Night Pursuit: lumpy-cam hunt + fixed per-slot combustion imbalance (camLope)
    this._huntPhase = Math.random() * Math.PI * 2;
    this._huntRate = 0;
    this._slotW = new Float64Array([1.08, 0.78, 1.18, 0.88, 1.04, 0.7, 1.14, 0.84]);
    // Night Pursuit: overrun afterfire pops (overrunBurble)
    this._popWait = 0;
    this._popAge = -1;
    this._popLen = 1;
    this._popAmp = 0;
    this._popBank = 0;
    this._popCrack = 0;
    this._popLp = 0;
    this._pdcL = 0;
    this._pdcR = 0;

    this._muff = 0;
    this._bodyLp = 0;
    this._intakeLp = 0;
    this._intakeHp = 0;
    this._mechLp = 0;
    this._mechBp = 0;
    this._mechDeep = 0;
    this._tickLp = 0;
    this._lopePhase = Math.random() * Math.PI * 2;
    this._prevThrottle = 0;
    this._crackleHold = 0;
    this._b0 = 0;
    this._b1 = 0;
    this._b2 = 0;
    this._b3 = 0;
    this._b4 = 0;
    this._b5 = 0;
    this._b6 = 0;
    this._dc = 0;

    // Living drive: continuous micro-wander + sparse valvetrain
    this._rpmWander = 0;
    this._filtWander = 0;
    this._gainWander = 0;
    this._tickWait = (Math.random() * 6000) | 0;
    this._timingWander = 0;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'reset') {
        this._theta = 0;
        this._nextTheta = 0;
        this._evtIdx = 0;
        this._schedInit = false;
        this._lastFamily = -1;
        this._lastCyl = -1;
        this._lastChambers = -1;
        this._lastRotors = -1;
        this._cycleDeg = 720;
        for (let i = 0; i < this._pMax; i++) this._pAge[i] = -1;
        this._delay.fill(0);
        this._delay2.fill(0);
        this._burble.fill(0);
        this._dA.fill(0);
        this._dB.fill(0);
        this._popAge = -1;
        this._muff = 0;
        this._bodyLp = 0;
        this._crackleHold = 0;
        this._rpmWander = 0;
        this._filtWander = 0;
        this._gainWander = 0;
        this._timingWander = 0;
        this._tickWait = (Math.random() * 4000) | 0;
      }
    };
  }

  _pink() {
    const white = Math.random() * 2 - 1;
    this._b0 = 0.99886 * this._b0 + white * 0.0555179;
    this._b1 = 0.99332 * this._b1 + white * 0.0750759;
    this._b2 = 0.969 * this._b2 + white * 0.153852;
    this._b3 = 0.8665 * this._b3 + white * 0.3104856;
    this._b4 = 0.55 * this._b4 + white * 0.5329522;
    this._b5 = -0.7616 * this._b5 - white * 0.016898;
    const pink =
      (this._b0 + this._b1 + this._b2 + this._b3 + this._b4 + this._b5 + this._b6 + white * 0.5362) *
      0.11;
    this._b6 = white * 0.115926;
    return pink;
  }

  _white() {
    return Math.random() * 2 - 1;
  }

  /** Soft asymmetric pressure pulse: gentle attack, longer blow-down decay. */
  _softEnv(t, thr) {
    const attack = 0.2;
    if (t < attack) {
      const a = t / attack;
      return a * a * (3 - 2 * a);
    }
    const u = (t - attack) / (1 - attack);
    const decay = 1.9 + (1 - thr) * 2.6;
    return Math.exp(-u * decay) * (1 - u * 0.1);
  }

  /**
   * Fill _evtDeg / _evtBank from firingFamily + cylinder / rotary geometry.
   * Family 4 (rotary): eccentric 360°; events = chambersPerRotor × rotors.
   * 1 rotor → 3 even chamber pulses/rev; 2-rotor stacks with half-step offset.
   */
  _buildSchedule(family, cylN, chambersPerRotor, rotors) {
    let n;
    if (family === 4) {
      const chambers = Math.max(2, Math.min(4, Math.round(chambersPerRotor) || 3));
      const rot = Math.max(1, Math.min(2, Math.round(rotors) || 1));
      const step = 360 / chambers;
      const rotorOff = rot === 2 ? step * 0.5 : 0;
      const raw = [];
      for (let r = 0; r < rot; r++) {
        for (let c = 0; c < chambers; c++) {
          let deg = c * step + r * rotorOff;
          while (deg >= 360) deg -= 360;
          raw.push({ deg, bank: r & 1 });
        }
      }
      raw.sort((a, b) => a.deg - b.deg);
      n = raw.length;
      for (let i = 0; i < n; i++) {
        this._evtDeg[i] = raw[i].deg;
        this._evtBank[i] = raw[i].bank;
      }
      this._cycleDeg = 360;
    } else if (family === 1) {
      n = 8;
      for (let i = 0; i < n; i++) {
        this._evtDeg[i] = this._crossDeg[i];
        this._evtBank[i] = this._crossBank[i];
      }
      this._cycleDeg = 720;
    } else if (family === 2) {
      n = 8;
      for (let i = 0; i < n; i++) {
        this._evtDeg[i] = this._flatDeg[i];
        this._evtBank[i] = this._flatBank[i];
      }
      this._cycleDeg = 720;
    } else if (cylN === 6) {
      n = 6;
      for (let i = 0; i < n; i++) {
        this._evtDeg[i] = this._i6Deg[i];
        this._evtBank[i] = this._i6Bank[i];
      }
      this._cycleDeg = 720;
    } else {
      n = Math.max(3, Math.min(12, cylN));
      for (let i = 0; i < n; i++) {
        this._evtDeg[i] = (i / n) * 720;
        this._evtBank[i] = i % 2;
      }
      this._cycleDeg = 720;
    }
    this._evtN = n;
  }

  _spawnPulse(bank, amp, pulseSamples) {
    for (let i = 0; i < this._pMax; i++) {
      if (this._pAge[i] < 0) {
        this._pAge[i] = 0;
        this._pLen[i] = pulseSamples;
        this._pBank[i] = bank;
        this._pAmp[i] = amp;
        return;
      }
    }
    // Steal oldest if saturated
    let oldest = 0;
    let maxAge = this._pAge[0];
    for (let i = 1; i < this._pMax; i++) {
      if (this._pAge[i] > maxAge) {
        maxAge = this._pAge[i];
        oldest = i;
      }
    }
    this._pAge[oldest] = 0;
    this._pLen[oldest] = pulseSamples;
    this._pBank[oldest] = bank;
    this._pAmp[oldest] = amp;
  }

  /**
   * Advance scheduler to next event angle.
   * nextPulseTime ≡ t0 + (θ_event − θ_now) / degPerSec  (§2.1)
   * Jitter applied on θ: θ' = θ_event + U(-j,j)*intervalDeg, j ∈ [0, 0.03].
   */
  _armNextEvent(jit, rough) {
    const n = this._evtN;
    const cycle = this._cycleDeg || 720;
    const slot = this._evtIdx % n;
    const nextSlot = (this._evtIdx + 1) % n;
    let deltaDeg = this._evtDeg[nextSlot] - this._evtDeg[slot];
    if (deltaDeg <= 0) deltaDeg += cycle;
    // Map worklet pulseJitter (0..0.5) → spec fraction 0..0.03
    const j = Math.min(0.03, Math.max(0, jit * 0.2));
    const jitterDeg = (Math.random() * 2 - 1) * j * deltaDeg * (0.7 + rough * 0.6);
    this._nextTheta += deltaDeg + jitterDeg;
    this._evtIdx++;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const ch0 = out[0];
    const ch1 = out.length > 1 ? out[1] : null;
    const n = ch0.length;
    const sr = sampleRate;

    const rpmP = parameters.rpm;
    const thrP = parameters.throttle;
    const loadP = parameters.load;
    const cylP = parameters.cylinders;
    const pwP = parameters.pulseWidth;
    const jitP = parameters.pulseJitter;
    const roughP = parameters.roughness;
    const growlP = parameters.growl;
    const exLenP = parameters.exhaustLength;
    const exFbP = parameters.exhaustFeedback;
    const muffP = parameters.mufflerMix;
    const intakeP = parameters.intake;
    const crackP = parameters.crackle;
    const gainP = parameters.masterGain;

    const rpm0 = rpmP.length === 1 ? rpmP[0] : 0;
    const thr0 = thrP.length === 1 ? thrP[0] : 0;
    const load0 = loadP.length === 1 ? loadP[0] : 0;
    const cylN = Math.max(3, Math.min(12, Math.round(cylP.length === 1 ? cylP[0] : 8)));
    const pw0 = pwP.length === 1 ? pwP[0] : 0.35;
    const jit0 = jitP.length === 1 ? jitP[0] : 0.08;
    const rough0 = roughP.length === 1 ? roughP[0] : 0.4;
    const growl0 = growlP.length === 1 ? growlP[0] : 0.6;
    const exLen0 = exLenP.length === 1 ? exLenP[0] : 0.45;
    const exFb0 = exFbP.length === 1 ? exFbP[0] : 0.72;
    const muff0 = muffP.length === 1 ? muffP[0] : 0.3;
    const intake0 = intakeP.length === 1 ? intakeP[0] : 0.45;
    const crack0 = crackP.length === 1 ? crackP[0] : 0.35;
    const gain0 = gainP.length === 1 ? gainP[0] : 0.7;
    const misP = parameters.misfire;
    const famP = parameters.firingFamily;
    const maskP = parameters.firingMask;
    const mis0 = misP ? (misP.length === 1 ? misP[0] : misP[0]) : 0;
    const fam0 = famP ? (famP.length === 1 ? famP[0] : famP[0]) : 0;
    const mask0 = maskP ? (maskP.length === 1 ? maskP[0] : maskP[0]) : 0;
    const chamP = parameters.chambersPerRotor;
    const rotP = parameters.rotors;
    const cham0 = chamP ? (chamP.length === 1 ? chamP[0] : chamP[0]) : 3;
    const rot0 = rotP ? (rotP.length === 1 ? rotP[0] : rotP[0]) : 1;
    const chambersN = Math.max(2, Math.min(4, Math.round(cham0) || 3));
    const camP = parameters.camLope;
    const splitP = parameters.bankSplit;
    const ovrP = parameters.overrun;
    const ovrBP = parameters.overrunBurble;
    const camLope0 = camP ? camP[0] : 0;
    const split0 = splitP ? splitP[0] : 0;
    const ovr0 = ovrP && ovrBP ? Math.max(0, Math.min(1, ovrP[0] * ovrBP[0])) : 0;
    const dcP = parameters.dcGuard;
    const dcGuard0 = dcP ? Math.max(0, Math.min(1, dcP[0])) : 0;
    const dcK = 1 - Math.exp((-2 * Math.PI * 12) / sr);
    // Unequal dual-exhaust pipe lengths (bank B longer) — cross-plane potato survives in mono
    const lenA = Math.max(10, Math.min(this._delayLen - 4, Math.floor(this._delaySamples * 0.9)));
    const lenB = Math.max(10, Math.min(this._delayLen - 4, Math.floor(this._delaySamples * 1.17)));
    const rotorsN = Math.max(1, Math.min(2, Math.round(rot0) || 1));

    const delayMs = 3 + exLen0 * 29;
    this._delaySamples = Math.max(10, Math.min(this._delayLen - 4, Math.floor((delayMs / 1000) * sr)));
    this._delaySamples2 = Math.max(8, Math.min(this._delayLen - 4, Math.floor(this._delaySamples * 0.42)));
    // Dual-collector burble from pack collectorDelayMs (0.5–3 ms → samples @ sr)
    const delayMsP = parameters.collectorDelayMs;
    const delayMsRaw = delayMsP ? (delayMsP.length === 1 ? delayMsP[0] : delayMsP[0]) : 1.0;
    // Clamp to audible dual-collector range; tiny roughness wobble ≤±8%
    let collectorMs = Math.max(0.5, Math.min(3, delayMsRaw));
    collectorMs *= 1 + (rough0 - 0.4) * 0.08;
    collectorMs = Math.max(0.5, Math.min(3, collectorMs));
    this._burbleSamples = Math.max(
      8,
      Math.min(this._burbleLen - 2, Math.floor((collectorMs * 0.001) * sr)),
    );

    // 0=auto → crossplane@8 else even; 1=cross; 2=flat; 3=even/i6; 4=rotary chamber-pulse
    let family = Math.round(fam0);
    if (family === 0) family = cylN === 8 ? 1 : 3;

    if (
      family !== this._lastFamily ||
      cylN !== this._lastCyl ||
      chambersN !== this._lastChambers ||
      rotorsN !== this._lastRotors
    ) {
      this._buildSchedule(family, cylN, chambersN, rotorsN);
      this._lastFamily = family;
      this._lastCyl = cylN;
      this._lastChambers = chambersN;
      this._lastRotors = rotorsN;
      // Re-arm next event relative to current θ (preserve continuity)
      if (this._schedInit) {
        const cycle = this._cycleDeg || 720;
        const slot = this._evtIdx % this._evtN;
        const cycleBase = Math.floor(this._theta / cycle) * cycle;
        let best = cycleBase + this._evtDeg[slot];
        if (best <= this._theta) best += cycle;
        this._nextTheta = best;
      }
    }

    const useBankGeom = family === 1 || family === 2;
    const isRotary = family === 4;
    // Cross/flat: keep 8-slot geometry; mute excess so drop-cyl via cylinders still changes lope
    // Rotary: all chamber slots active; firingMask drops chambers → lope MUST change
    const activeSlots = useBankGeom
      ? Math.max(1, Math.min(8, cylN))
      : this._evtN;

    for (let i = 0; i < n; i++) {
      const rpm = rpmP.length > 1 ? rpmP[i] : rpm0;
      const thr = thrP.length > 1 ? thrP[i] : thr0;
      const load = loadP.length > 1 ? loadP[i] : load0;
      const pw = pwP.length > 1 ? pwP[i] : pw0;
      const jit = jitP.length > 1 ? jitP[i] : jit0;
      const rough = roughP.length > 1 ? roughP[i] : rough0;
      const growl = growlP.length > 1 ? growlP[i] : growl0;
      const exFb = exFbP.length > 1 ? exFbP[i] : exFb0;
      const muffMix = muffP.length > 1 ? muffP[i] : muff0;
      const intakeAmt = intakeP.length > 1 ? intakeP[i] : intake0;
      const crackAmt = crackP.length > 1 ? crackP[i] : crack0;
      const master = gainP.length > 1 ? gainP[i] : gain0;
      const misAmt = misP && misP.length > 1 ? misP[i] : mis0;
      const maskRaw = maskP && maskP.length > 1 ? maskP[i] : mask0;
      const firingMask = Math.max(0, Math.min(255, Math.round(maskRaw))) | 0;

      // Continuous micro-jitter on effective RPM / pulse timing
      this._rpmWander += (Math.random() * 2 - 1) * (0.00035 + jit * 0.0005);
      this._rpmWander *= 0.994;
      this._timingWander += (Math.random() * 2 - 1) * (0.0002 + jit * 0.0004);
      this._timingWander *= 0.991;
      // Lumpy cam (Night Pursuit): strongest at low rpm / closed throttle; fades out by ~2.1k rpm
      let lope = 0;
      let huntMul = 1;
      if (camLope0 > 0.0005) {
        const idleness =
          Math.max(0, Math.min(1, 1 - (rpm - 650) / 1450)) * Math.max(0, Math.min(1, 1 - thr * 1.6));
        lope = camLope0 * idleness;
        this._huntRate += (Math.random() * 2 - 1) * 0.00002;
        this._huntRate *= 0.99995;
        this._huntPhase += (2 * Math.PI * (0.95 + this._huntRate * 40)) / sr;
        huntMul =
          1 +
          lope * (0.034 * Math.sin(this._huntPhase) + 0.013 * Math.sin(this._huntPhase * 2.37 + 1.1));
      }
      const safeRpm = Math.max(
        200,
        Math.min(9000, rpm * huntMul * (1 + this._rpmWander * (0.6 + jit * 1.4))),
      );

      // §2.1: degPerSec = rpm * 6; integrate crankAngle
      const degPerSec = safeRpm * 6 * (1 + this._timingWander);
      const degPerSample = degPerSec / sr;

      // Half-order mechanical AM lope (stronger at idle / cross-plane)
      const revsPerSample = degPerSample / 360;
      this._lopePhase += revsPerSample * Math.PI * (useBankGeom ? 1.0 : isRotary ? 1.5 : 2.0);
      const lopeAm = 0.6 + 0.4 * Math.sin(this._lopePhase);
      const lopeAm2 = 0.75 + 0.25 * Math.sin(this._lopePhase * 0.5 + 0.7);

      const pulseSamples = Math.max(
        8,
        Math.floor((0.0024 + pw * 0.0058) * (1.18 - thr * 0.28) * (1 + lope * 0.7) * sr),
      );
      // Idle always has combustion energy; fuel-cut overrun hollows it (Night Pursuit only)
      const energy = (0.26 + thr * 0.58 + Math.max(0, load) * 0.14) * (1 - ovr0 * 0.5);

      if (!this._schedInit) {
        this._theta = 0;
        this._evtIdx = 0;
        this._nextTheta = this._evtDeg[0];
        // Small initial jitter on first event
        const j0 = Math.min(0.03, Math.max(0, jit * 0.2));
        this._nextTheta += (Math.random() * 2 - 1) * j0 * ((this._cycleDeg || 720) / this._evtN);
        this._schedInit = true;
      }

      this._theta += degPerSample;

      // While θ crosses next event angle → schedule soft pulse (or skip)
      let guard = 0;
      while (this._theta >= this._nextTheta && guard < 16) {
        guard++;
        const slot = this._evtIdx % this._evtN;
        // uint8 mask: only slots 0–7; higher even-family slots use cylinders mute only
        const disabledByMask = slot < 8 && (firingMask & (1 << slot)) !== 0;
        const disabledByCyl = slot >= activeSlots;
        // Stochastic misfire → living lope (RES north star)
        const misfireSkip = misAmt > 0.001 && Math.random() < misAmt * 0.22;

        if (!disabledByMask && !disabledByCyl && !misfireSkip) {
          const bank = this._evtBank[slot];
          let amp = 0.78 + Math.random() * (0.25 + rough * 0.25);
          if (lope > 0.0005) {
            // Big-overlap cam: fixed cylinder imbalance + cycle variance + occasional lazy fire,
            // stronger fires on the rich side of the hunt.
            amp *= 1 + (this._slotW[slot & 7] - 1) * lope;
            amp *= 1 + (Math.random() * 2 - 1) * 0.3 * lope + 0.22 * lope * Math.sin(this._huntPhase);
            if (Math.random() < 0.07 * lope) amp *= 0.3;
          }
          this._spawnPulse(bank, amp, pulseSamples);
        }

        this._armNextEvent(jit, rough);
      }

      // Render active pulse envelopes
      let pulseL = 0;
      let pulseR = 0;
      for (let p = 0; p < this._pMax; p++) {
        if (this._pAge[p] < 0) continue;
        const distSamp = this._pAge[p];
        const len = this._pLen[p];
        if (distSamp >= len) {
          this._pAge[p] = -1;
          continue;
        }
        const t = distSamp / len;
        const env = this._softEnv(t, thr);
        const noiseBite = this._pink() * (0.16 + jit * 0.4);
        const combustion = (0.72 + noiseBite) * env * energy * this._pAmp[p];
        const sig = combustion * (0.52 + growl * 0.48);
        if (this._pBank[p] === 0) pulseL += sig;
        else pulseR += sig;
        this._pAge[p] += 1;
      }

      // Overrun afterfire pops (Night Pursuit): irregular, boomy, through the pipe waveguide
      let crackTick = 0;
      if (ovr0 > 0.005) {
        this._popWait -= 1;
        if (this._popWait <= 0) {
          if (this._popAge < 0 && Math.random() < 0.5 + 0.4 * ovr0) {
            this._popAge = 0;
            this._popLen = Math.max(16, Math.floor((0.003 + Math.random() * 0.007) * sr));
            this._popAmp = (0.45 + Math.random() * 0.95) * ovr0;
            this._popBank = Math.random() < 0.5 ? 0 : 1;
            this._popCrack = Math.random() < 0.18 + crack0 * 0.3 ? 1 : 0;
          }
          const rpmK = Math.sqrt(2400 / Math.max(1100, safeRpm));
          this._popWait = Math.max(64, Math.floor(sr * (0.04 + Math.random() * 0.12) * rpmK));
        }
      }
      if (this._popAge >= 0) {
        const t = this._popAge / this._popLen;
        const env = t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 4.5);
        this._popLp += 0.25 * (this._pink() - this._popLp);
        const pop = (0.55 + this._popLp * 2.2) * env * this._popAmp;
        if (this._popBank === 0) pulseL += pop;
        else pulseR += pop;
        if (this._popCrack) crackTick = (this._white() - this._popLp) * env * this._popAmp * 0.16;
        this._popAge += 1;
        if (this._popAge >= this._popLen) this._popAge = -1;
      }

      if (dcGuard0 > 0.0005) {
        this._pdcL += dcK * (pulseL - this._pdcL);
        this._pdcR += dcK * (pulseR - this._pdcR);
        pulseL -= this._pdcL * dcGuard0;
        pulseR -= this._pdcR * dcGuard0;
      }
      const pulse = pulseL + pulseR;

      // --- Exhaust waveguide body (primary + secondary tap) ---
      const readPos = (this._wPos - this._delaySamples + this._delayLen) % this._delayLen;
      const delayed = this._delay[readPos | 0];
      const readPos2 = (readPos - 1 + this._delayLen) % this._delayLen;
      const avg = 0.5 * (delayed + this._delay[readPos2 | 0]);
      const fb = Math.min(0.955, exFb * (0.86 + growl * 0.12));
      const excited = pulse * (0.75 + thr * 0.45) + avg * fb * 0.97;
      this._delay[this._wPos] = excited * 0.995;
      this._wPos = (this._wPos + 1) % this._delayLen;

      const r2 = (this._wPos2 - this._delaySamples2 + this._delayLen) % this._delayLen;
      const d2 = this._delay2[r2 | 0];
      const excited2 = pulse * 0.35 + d2 * (fb * 0.78);
      this._delay2[this._wPos2] = excited2 * 0.992;
      this._wPos2 = (this._wPos2 + 1) % this._delayLen;

      let bodyRaw = excited * 0.72 + excited2 * 0.38;
      let splitSide = 0;
      if (split0 > 0.0005) {
        // True dual exhaust: bank A / bank B each excite their own unequal-length pipe.
        const rA = (this._wA - lenA + this._delayLen) % this._delayLen;
        const rA2 = (rA - 1 + this._delayLen) % this._delayLen;
        const avgA = 0.5 * (this._dA[rA | 0] + this._dA[rA2 | 0]);
        const exA = pulseL * (0.75 + thr * 0.45) * 1.25 + avgA * fb * 0.96;
        this._dA[this._wA] = exA * 0.995;
        this._wA = (this._wA + 1) % this._delayLen;
        const rB = (this._wB - lenB + this._delayLen) % this._delayLen;
        const rB2 = (rB - 1 + this._delayLen) % this._delayLen;
        const avgB = 0.5 * (this._dB[rB | 0] + this._dB[rB2 | 0]);
        const exB = pulseR * (0.75 + thr * 0.45) * 1.25 + avgB * fb * 0.96;
        this._dB[this._wB] = exB * 0.995;
        this._wB = (this._wB + 1) % this._delayLen;
        const splitBody = (exA + exB) * 0.72 + excited2 * 0.38;
        bodyRaw = bodyRaw + (splitBody - bodyRaw) * split0;
        splitSide = (exA - exB) * split0;
      }
      this._bodyLp += (0.18 + thr * 0.12) * (bodyRaw - this._bodyLp);

      this._filtWander += (Math.random() * 2 - 1) * 0.0025;
      this._filtWander *= 0.988;
      const muffA = Math.max(0.04, Math.min(0.85, 0.1 + muffMix * 0.58 + this._filtWander * 0.08));
      this._muff += muffA * (bodyRaw - this._muff);
      const exhaust =
        bodyRaw * (1 - muffMix * 0.7) + this._muff * (0.4 + muffMix * 0.6) + this._bodyLp * 0.25;

      // --- Mechanical bed ---
      const pn = this._pink();
      this._mechDeep += 0.04 * (pn - this._mechDeep);
      this._mechLp += 0.12 * (pn - this._mechLp);
      const hp = pn - this._mechLp;
      this._mechBp += 0.22 * (hp - this._mechBp);

      const idleBed =
        this._mechDeep * (0.14 + rough * 0.1) * lopeAm * (0.85 + (1 - thr) * 0.35);
      const midTick = this._mechBp * rough * (0.05 + safeRpm / 9000 * 0.1 + thr * 0.06) * lopeAm2;
      const tw = this._white();
      this._tickLp += 0.35 * (tw - this._tickLp);
      // Stochastic valvetrain clatter — sparse irregular, not a metronome
      this._tickWait -= 1;
      let tick = (tw - this._tickLp) * rough * rough * 0.004;
      if (this._tickWait <= 0) {
        const burst = (tw - this._tickLp) * rough * (0.035 + thr * 0.05) * (0.45 + Math.random() * 0.7);
        tick += burst;
        const gapSec = 0.07 + Math.random() * (0.22 + (1 - thr) * 0.35) + rough * Math.random() * 0.12;
        const dens = 0.55 + safeRpm / 7000;
        this._tickWait = Math.max(64, Math.floor((gapSec * sr) / dens));
      }
      const mech = idleBed + midTick + tick;

      // --- Intake × throttle ---
      const nw = this._white();
      this._intakeLp += 0.07 * (nw - this._intakeLp);
      this._intakeHp = nw - this._intakeLp;
      const thrFeel = thr * thr * 0.55 + thr * 0.45;
      const intakeSig =
        this._intakeHp * intakeAmt * thrFeel * (0.28 + thr * 0.7) * 0.32 +
        this._pink() * intakeAmt * thrFeel * 0.06;

      // Crackle only on throttle drop at high rpm
      const dThr = this._prevThrottle - thr;
      this._prevThrottle = thr;
      if (dThr > 0.002 && safeRpm > 2800 && thr < 0.45) {
        this._crackleHold = Math.min(1, this._crackleHold + dThr * 14);
      }
      this._crackleHold *= 0.995;
      const crackBurst =
        this._crackleHold > 0.02
          ? this._white() * this._crackleHold * crackAmt * 0.32 * (safeRpm > 2800 ? 1 : 0.2)
          : 0;

      const mono =
        exhaust * (0.62 + growl * 0.28) +
        mech +
        intakeSig +
        crackBurst +
        crackTick +
        pulse * 0.1;

      // Dual-collector L/R burble: cross-feed opposite bank with short delay
      const bRead = (this._burblePos - this._burbleSamples + this._burbleLen) % this._burbleLen;
      const burbleIn = pulseR - pulseL;
      const burbleOut = this._burble[bRead | 0];
      this._burble[this._burblePos] = burbleIn * 0.85;
      this._burblePos = (this._burblePos + 1) % this._burbleLen;

      let sampleL = mono + pulseL * 0.08 + burbleOut * 0.12 + splitSide * 0.14;
      let sampleR = mono + pulseR * 0.08 - burbleOut * 0.12 - splitSide * 0.14;

      sampleL = Math.tanh(sampleL * (0.95 + growl * 0.35 + thr * 0.15));
      sampleR = Math.tanh(sampleR * (0.95 + growl * 0.35 + thr * 0.15));

      // DC block (shared approx on L; R follows)
      const dcIn = 0.5 * (sampleL + sampleR);
      const dcOut = dcIn - this._dc;
      this._dc += 0.0005 * (dcIn - this._dc);
      const dcCorr = dcOut - dcIn;
      this._gainWander += (Math.random() * 2 - 1) * 0.0018;
      this._gainWander *= 0.99;
      const liveGain = master * 0.88 * (1 + this._gainWander * (0.5 + rough * 0.8));
      sampleL = (sampleL + dcCorr) * liveGain;
      sampleR = (sampleR + dcCorr) * liveGain;

      const pan = Math.max(-1, Math.min(1, load * 0.35));
      ch0[i] = sampleL * (1 - Math.max(0, pan) * 0.35);
      if (ch1) ch1[i] = sampleR * (1 - Math.max(0, -pan) * 0.35);
    }

    return true;
  }
}

registerProcessor('pulse-engine-processor', PulseEngineProcessor);
