/** RevForge synthesis port. Original oscillator, noise, filter, transient and music algorithms preserved. See docs/revforge-merge.md. */
function Jt(e, t = 2, n = `white`) {
  let r = Math.floor(e.sampleRate * t),
    i = e.createBuffer(1, r, e.sampleRate),
    a = i.getChannelData(0),
    o = 0,
    s = 0,
    c = 0,
    l = 0,
    u = 0,
    d = 0,
    f = 0,
    p = 0;
  for (let e = 0; e < r; e++) {
    let t = Math.random() * 2 - 1;
    if (n === `white`) {
      a[e] = t;
    } else {
      if (n === `pink`) {
        o = 0.99886 * o + t * 0.0555179;
        s = 0.99332 * s + t * 0.0750759;
        c = 0.969 * c + t * 0.153852;
        l = 0.8665 * l + t * 0.3104856;
        u = 0.55 * u + t * 0.5329522;
        d = -0.7616 * d - t * 0.016898;
        a[e] = (o + s + c + l + u + d + f + t * 0.5362) * 0.11;
        f = t * 0.115926;
      } else {
        p = (p + 0.02 * t) / 1.02;
        a[e] = p * 3.5;
      }
    }
  }
  return i;
}
function Yt(e) {
  return e * e;
}
function Xt(e, t, n) {
  return Math.max(t, Math.min(n, e));
}
export class RevForgeVoice {
  ctx = null;
  master = null;
  engineBus = null;
  musicBus = null;
  compressor = null;
  mediaEl = null;
  started = !1;
  patch = null;
  nodes = [];
  osc = [];
  sources = [];
  intervals = [];
  lastRpm = 800;
  lastLoad = 0;
  crackleAt = 0;
  blowoffAt = 0;
  fundGain = null;
  subGain = null;
  harmGain = null;
  noiseGain = null;
  raspGain = null;
  turboGain = null;
  screamGain = null;
  pulseGain = null;
  dcDry = null;
  dcWet = null;
  bodyFilter = null;
  raspFilter = null;
  turboFilter = null;
  screamFilter = null;
  pulseOsc = null;
  lfo = null;
  lfoGain = null;
  drive = null;
  fund = null;
  sub = null;
  h2 = null;
  h3 = null;
  h4 = null;
  screamOsc = null;
  screamOsc2 = null;
  turboOsc = null;
  pink = null;
  white = null;
  brown = null;
  look = null;
  setLook(e) {
    this.look = e;
    let t = this.ctx?.currentTime ?? 0;
    {
      this.master?.gain.setTargetAtTime(Yt(e.masterVolume), t, 0.04);
      this.engineBus?.gain.setTargetAtTime(Yt(e.engineVolume), t, 0.04);
      this.musicBus?.gain.setTargetAtTime(0, t, 0.05);
    }
  }
  loopBuffer(e, t, n) {
    let r = e.createBufferSource();
    return (
      (r.buffer = t),
      (r.loop = !0),
      r.connect(n),
      r.start(),
      this.sources.push(r),
      r
    );
  }
  makeDrive(e) {
    let t = new Float32Array(256),
      n = e * 80 + 1;
    for (let e = 0; e < 256; e++) {
      let r = (e * 2) / 256 - 1;
      t[e] = ((1 + n) * r) / (1 + n * Math.abs(r));
    }
    return t;
  }
  buildGraph(e, t) {
    let n = this.track(e.createGain());
    {
      n.gain.value = 1;
      this.drive = this.track(e.createWaveShaper());
      this.drive.curve = this.makeDrive(t.distortion);
      this.drive.oversample = `2x`;
      // ICE DC guard (iceDcGuardForRpm, rpm-gated): crossfade dry ↔ ~12 Hz one-pole DC-blocked
      // copy ahead of the drive shaper. Wet starts at exactly 0 and stays 0 below 1500 rpm, so
      // idle / low rpm (and every non-combustion voice) is bit-for-bit unchanged.
      const feed = this.track(e.createGain());
      feed.gain.value = 1;
      this.dcDry = this.track(e.createGain());
      this.dcDry.gain.value = 1;
      this.dcWet = this.track(e.createGain());
      this.dcWet.gain.value = 0;
      const a = Math.exp((-2 * Math.PI * 12) / e.sampleRate);
      const hp = this.track(e.createIIRFilter([a, -a], [1, -a]));
      n.connect(this.dcDry);
      n.connect(hp);
      hp.connect(this.dcWet);
      this.dcDry.connect(feed);
      this.dcWet.connect(feed);
      this.driveInput = feed;
      feed.connect(this.drive);
      this.drive.connect(this.engineBus);
      this.bodyFilter = this.track(e.createBiquadFilter());
      this.bodyFilter.type = `lowpass`;
      this.bodyFilter.frequency.value = 900;
      this.bodyFilter.Q.value = 0.7;
      this.bodyFilter.connect(n);
      this.fundGain = this.track(e.createGain());
      this.subGain = this.track(e.createGain());
      this.harmGain = this.track(e.createGain());
      this.noiseGain = this.track(e.createGain());
      this.raspGain = this.track(e.createGain());
      this.turboGain = this.track(e.createGain());
      this.screamGain = this.track(e.createGain());
      this.pulseGain = this.track(e.createGain());
      this.pulseGain.gain.value = 0.7;
      this.fundGain.connect(this.bodyFilter);
      this.subGain.connect(this.bodyFilter);
      this.harmGain.connect(this.bodyFilter);
      this.noiseGain.connect(this.bodyFilter);
      this.raspFilter = this.track(e.createBiquadFilter());
      this.raspFilter.type = `bandpass`;
      this.raspFilter.frequency.value = 1800;
      this.raspFilter.Q.value = 1.1;
      this.raspGain.connect(this.raspFilter);
      this.raspFilter.connect(n);
      this.turboFilter = this.track(e.createBiquadFilter());
      this.turboFilter.type = `bandpass`;
      this.turboFilter.frequency.value = 4200;
      this.turboFilter.Q.value = 6;
      this.turboGain.connect(this.turboFilter);
      this.turboFilter.connect(n);
      this.screamFilter = this.track(e.createBiquadFilter());
      this.screamFilter.type = `bandpass`;
      this.screamFilter.frequency.value = 1400;
      this.screamFilter.Q.value = 8;
      this.screamGain.connect(this.screamFilter);
      this.screamFilter.connect(n);
    }
    let r = this.makeWave(e, t);
    {
      this.fund = e.createOscillator();
      this.fund.setPeriodicWave(r);
      this.fund.connect(this.fundGain);
      this.fund.start();
      this.osc.push(this.fund);
      this.sub = e.createOscillator();
      this.sub.type = `sine`;
      this.sub.connect(this.subGain);
      this.sub.start();
      this.osc.push(this.sub);
      this.h2 = e.createOscillator();
      this.h2.type = `triangle`;
      this.h2.connect(this.harmGain);
      this.h2.start();
      this.osc.push(this.h2);
      this.h3 = e.createOscillator();
      this.h3.type = `sawtooth`;
      this.h3.connect(this.harmGain);
      this.h3.start();
      this.osc.push(this.h3);
      this.h4 = e.createOscillator();
      this.h4.type = `square`;
      this.h4.connect(this.harmGain);
      this.h4.start();
      this.osc.push(this.h4);
      this.pulseOsc = e.createOscillator();
      this.pulseOsc.type = `square`;
      this.pulseOsc.frequency.value = 40;
    }
    let i = this.track(e.createGain());
    {
      i.gain.value = 0.035;
      this.pulseOsc.connect(i);
      i.connect(this.noiseGain.gain);
      this.pulseOsc.start();
      this.osc.push(this.pulseOsc);
      this.lfo = e.createOscillator();
      this.lfo.type = `sine`;
      this.lfo.frequency.value = 18;
      this.lfoGain = this.track(e.createGain());
      this.lfoGain.gain.value = 4;
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.fund.frequency);
      this.lfo.start();
      this.osc.push(this.lfo);
      this.screamOsc = e.createOscillator();
      this.screamOsc.type = `sawtooth`;
      this.screamOsc.connect(this.screamGain);
      this.screamOsc.start();
      this.osc.push(this.screamOsc);
      this.screamOsc2 = e.createOscillator();
      this.screamOsc2.type = `sawtooth`;
      this.screamOsc2.connect(this.screamGain);
      this.screamOsc2.start();
      this.osc.push(this.screamOsc2);
      this.turboOsc = e.createOscillator();
      this.turboOsc.type = `sine`;
      this.turboOsc.connect(this.turboGain);
      this.turboOsc.start();
      this.osc.push(this.turboOsc);
      if (this.pink) {
        this.loopBuffer(e, this.pink, this.noiseGain);
      }
      if (this.white) {
        this.loopBuffer(e, this.white, this.raspGain);
      }
      if (this.white) {
        this.loopBuffer(e, this.white, this.turboGain);
      }
      if (this.brown) {
        this.loopBuffer(e, this.brown, this.subGain);
      }
      this.zeroGains();
    }
  }
  makeWave(e, t) {
    let n = new Float32Array(48),
      r = new Float32Array(48),
      i = 0.35 + t.rumble * 0.5,
      a = 0.4 + t.growl * 0.6;
    for (let e = 1; e < 48; e++) {
      let n = (e % 2 == 0 ? i : a) / e ** 0.72;
      {
        if (e % 3 == 0) {
          n *= 1 + t.metallic * 0.9;
        }
        if (t.firing === `crossplane` && (e === 1 || e === 2)) {
          n *= 1.4;
        }
        r[e] = n;
      }
    }
    return e.createPeriodicWave(n, r, { disableNormalization: !1 });
  }
  zeroGains() {
    for (let e of [
      this.fundGain,
      this.subGain,
      this.harmGain,
      this.noiseGain,
      this.raspGain,
      this.turboGain,
      this.screamGain,
    ])
      if (e) {
        e.gain.value = 1e-4;
      }
  }
  teardownGraph() {
    for (let e of this.intervals) window.clearInterval(e);
    this.intervals = [];
    for (let e of this.osc) {
      try {
        e.stop();
      } catch {}
      try {
        e.disconnect();
      } catch {}
    }
    this.osc = [];
    for (let e of this.sources) {
      try {
        e.stop();
      } catch {}
      try {
        e.disconnect();
      } catch {}
    }
    this.sources = [];
    for (let e of this.nodes)
      try {
        e.disconnect();
      } catch {}
    this.nodes = [];
  }
  update(e) {
    if (!this.ctx || !this.patch || !this.started) return;
    let t = this.patch,
      n = this.ctx.currentTime,
      r = Xt(e.rpm, 0, t.redline * 1.05),
      i = Xt(e.load, 0, 1),
      a = r / Math.max(1, t.redline),
      o = r / Math.max(1, t.idleRpm),
      s = Math.max(18, r / 60),
      c = Math.max(1, t.cylinders || 8),
      l = t.voice === `combustion` ? (r / 60) * (c / 2) : s * 2;
    // Four-stroke firing order supplies the combustion fundamental; motor poles set EV order.
    if(t.voice === 'combustion') s=l;
    if(t.voice === 'electric') s=Math.max(18,r/60*6);
    {
      this.fund?.frequency.setTargetAtTime(s, n, 0.045);
      this.sub?.frequency.setTargetAtTime(Math.max(18,r/120), n, 0.08);
      this.h2?.frequency.setTargetAtTime(s * 2, n, 0.03);
      this.h3?.frequency.setTargetAtTime(s * 3.01, n, 0.03);
      this.h4?.frequency.setTargetAtTime(s * 4.04, n, 0.03);
      this.pulseOsc?.frequency.setTargetAtTime(Xt(l, 8, 1200), n, 0.04);
      this.lfo?.frequency.setTargetAtTime(
        8 + a * 28 + (t.firing === `crossplane` ? 6 : 0),
        n,
        0.05,
      );
    }
    let u = 280 + a * 3400 * (0.4 + t.body * 0.3) + i * 900;
    {
      this.bodyFilter?.frequency.setTargetAtTime(Xt(u, 200, 6200), n, 0.04);
      this.raspFilter?.frequency.setTargetAtTime(
        900 + a * 4200 + t.rasp * 800,
        n,
        0.05,
      );
      this.turboFilter?.frequency.setTargetAtTime(
        1800 + a * 7e3 * t.turboPitch + i * 800,
        n,
        0.05,
      );
    }
    let d = 420 + a * 2800 + i * 400;
    {
      this.screamFilter?.frequency.setTargetAtTime(d, n, 0.04);
      this.screamOsc?.frequency.setTargetAtTime(380 + a * 2400, n, 0.04);
      this.screamOsc2?.frequency.setTargetAtTime(402 + a * 2520, n, 0.04);
      this.turboOsc?.frequency.setTargetAtTime(
        1400 + a * 8200 * t.turboPitch,
        n,
        0.05,
      );
      this.updateDrive(t.distortion * (0.22 + i * 0.3));
      const dc = Xt(Number(e.dcGuard) || 0, 0, 1);
      this.dcDry?.gain.setTargetAtTime(1 - dc, n, 0.05);
      this.dcWet?.gain.setTargetAtTime(dc, n, 0.05);
    }
    let f = 0.08,
      p = 0.04,
      m = 0.03,
      h = 0.04,
      g = 0.02,
      _ = 0,
      v = 0;
    {
      if (t.voice === `combustion`) {
        f = (0.07 + t.growl * 0.12) * (0.35 + i * 0.75) * (0.55 + Math.min(o,4) * 0.12);
        p = (0.05 + t.rumble * 0.16) * (0.4 + i * 0.7);
        m =
          (0.03 + t.metallic * 0.08 + t.rasp * 0.05) *
          (0.3 + a * 0.5 + i * 0.4);
        h = (0.03 + t.exhaust * 0.1) * (0.25 + i * 0.8);
        g = (0.01 + t.rasp * 0.08 + t.air * 0.04) * (0.2 + a * 0.7);
        _ = t.turbo * (0.01 + i * 0.07 + a * 0.04) + t.air * 0.015 * i;
        if (e.overrun) {
          f *= 0.55;
          h *= 0.7;
          g *= 1.3;
        }
      } else {
        if (t.voice === `electric`) {
          f = 0.02 * (0.2 + a);
          p = 0.015 * (0.3 + i);
          m = (0.05 + t.metallic * 0.1) * (0.15 + a * 0.9);
          g = (0.04 + a * 0.1) * (0.4 + i * 0.6);
          v = 0.03 + a * 0.08;
          h = 0.008 * i;
        } else {
          if (t.voice === `turbine`) {
            const thrust=e.flight?.thrust??i, ab=e.flight?.afterburner??0;
            h = 0.012 + thrust * .14 * (1-ab*.4) + ab*.22;
            // Broad hot exhaust replaces the dry thrust texture at full power.
            this.raspFilter?.frequency.setTargetAtTime(900+thrust*2200+ab*3600,n,.12);
            g = .008 + thrust*.065 + ab*.19;
            v = 0.04 + a * 0.09;
            _ = 0.03 + a * 0.07;
            p = 0.03 + a * 0.02;
            f = 0.02;
          } else {
            if (t.voice === `starfighter`) {
              v = e.tieSignature===false ? 0 : 0.07 + a * 0.16 + i * 0.05;
              g = e.tieSignature===false ? .004 : 0.05 + a * 0.1;
              h = 0.04 + a * 0.06;
              p = 0.06 + t.rumble * 0.05;
              f = 0.03 + a * 0.04;
              _ = 0.02 + a * 0.05;
              m = 0.02 + t.metallic * 0.04;
            }
          }
        }
      }
      if (e.shifting) {
        f *= 0.45;
        m *= 0.5;
      }
      this.fundGain?.gain.setTargetAtTime(Math.max(1e-4, f), n, 0.04);
      this.subGain?.gain.setTargetAtTime(Math.max(1e-4, p), n, 0.05);
      this.harmGain?.gain.setTargetAtTime(Math.max(1e-4, m), n, 0.04);
      this.noiseGain?.gain.setTargetAtTime(Math.max(1e-4, h), n, 0.05);
      this.raspGain?.gain.setTargetAtTime(Math.max(1e-4, g), n, 0.05);
      this.turboGain?.gain.setTargetAtTime(Math.max(1e-4, _), n, 0.08);
      this.screamGain?.gain.setTargetAtTime(Math.max(1e-4, v), n, 0.05);
      if (
        e.overrun &&
        t.crackle > 0.05 &&
        r > t.idleRpm * 1.8 &&
        n > this.crackleAt
      ) {
        this.crackleAt = n + 0.04 + Math.random() * (0.16 - t.crackle * 0.1);
        this.pop(0.08 + t.crackle * 0.12, 900 + Math.random() * 2200);
      }
      if (
        this.lastLoad > 0.55 &&
        i < 0.22 &&
        t.blowoff > 0.1 &&
        n > this.blowoffAt
      ) {
        this.blowoffAt = n + 0.4;
        this.pop(0.12 + t.blowoff * 0.16, 2800 + t.turboPitch * 2400, 0.22);
      }
      this.lastRpm = r;
      this.lastLoad = i;
    }
  }
  pop(e, t, n = 0.09) {
    if (!this.ctx || !this.engineBus || !this.white) return;
    let r = this.ctx.currentTime,
      i = this.ctx.createGain();
    {
      i.gain.setValueAtTime(e, r);
      i.gain.exponentialRampToValueAtTime(1e-4, r + n);
    }
    let a = this.ctx.createBiquadFilter();
    {
      a.type = `bandpass`;
      a.frequency.value = t;
      a.Q.value = 3.2;
    }
    let o = this.ctx.createBufferSource();
    {
      o.buffer = this.white;
      o.connect(a);
      a.connect(i);
      i.connect(this.engineBus);
      o.start(r);
      o.stop(r + n + 0.02);
      o.onended = () => {
        try {
          o.disconnect();
          a.disconnect();
          i.disconnect();
        } catch {}
      };
    }
  }
  blip() {
    this.pop(0.1, 420, 0.06);
  }
  constructor(context, destination) {
    this.ctx = context;
    this.destination = destination;
  }
  track(node) {
    this.nodes.push(node);
    return node;
  }
  async start(patch, look) {
    const ctx = this.ctx;
    if (ctx.state === "suspended") await ctx.resume();
    if (this.started) {
      this.setLook(look);
      return;
    }
    this.patch = patch;
    this.look = look;
    this.pink = Jt(ctx, 2.4, "pink");
    this.white = Jt(ctx, 1.6, "white");
    this.brown = Jt(ctx, 2.4, "brown");
    this.master = ctx.createGain();
    this.master.gain.value = Yt(look.masterVolume);
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = Yt(look.engineVolume);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4.5;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.18;
    this.engineBus.connect(this.compressor);
    this.musicBus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(this.destination);
    this.buildGraph(ctx, patch);
    this.started = true;
  }
  applyPatch(patch) {
    this.patch = patch;
    if (this.started) {
      this.teardownGraph();
      this.buildGraph(this.ctx, patch);
      this.setLook(this.look);
    }
  }
  updateDrive(amount) {
    if (!this.drive) return;
    const curve = this.makeDrive(amount);
    try {
      this.drive.curve = curve;
    } catch {
      // Strict Web Audio implementations permit a curve assignment only once.
      // Preserve the same distortion curve by replacing only this processing node.
      const previous = this.drive;
      this.driveInput.disconnect(previous);
      previous.disconnect();
      this.nodes = this.nodes.filter((node) => node !== previous);
      this.drive = this.track(this.ctx.createWaveShaper());
      this.drive.curve = curve;
      this.drive.oversample = "2x";
      this.driveInput.connect(this.drive);
      this.drive.connect(this.engineBus);
    }
  }
  dispose() {
    this.teardownGraph();
    this.started = false;
    for (const node of [
      this.master,
      this.engineBus,
      this.musicBus,
      this.compressor,
    ])
      node?.disconnect();
  }
}
