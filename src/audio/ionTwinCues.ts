/**
 * Twin Ion lifecycle + targeting cues — 100 % procedural Web Audio.
 *
 * The shutdown voice and the targeting cue are small oscillator / filtered-noise graphs with
 * scheduled automation, rendered ONCE per sample rate into AudioBuffers through an
 * OfflineAudioContext (cheap to replay, no live node cost). Ignition is that same generated
 * shutdown played time-reversed. Noise comes from a fixed-seed generator, so every render is
 * byte-identical. Every number below is a synthesis parameter (band levels per 0.25 s, partial
 * frequencies, modulation rates, envelope times) chosen from listening + summary analysis; no
 * recorded audio, slice, wavetable or IR is used anywhere.
 * See docs/ion-twin-closer-match.md §cue map.
 */

export const ION_SHUTDOWN_SECONDS = 12;
/** The shutdown voice is silent after this point (a 0.24 s fade lands here). */
export const ION_SHUTDOWN_END = 11.76;
export const ION_TARGET_SECONDS = 2.2;
/** Keyframe hop for the shutdown spectral-envelope trajectory (frame centres at 0.125 + k·hop). */
export const ION_CUE_HOP = 0.25;

/**
 * Shutdown band levels (dB, 48 frames × 0.25 s) — rumble < 80 Hz, low 80–250, mid 250–800,
 * presence 800–2500, air 2500–8000. Shape: full twin-hum + stack for ~2 s, a 2.8 kHz whine
 * episode (2–4.5 s), bursts near 5.8 / 7.2 / 9.8 s, then a falling glide into silence.
 */
export const ION_SHUTDOWN_BANDS: number[][] = [
  [-14, -12.3, -14.6, -16.4, -49.9],
  [-14, -12.3, -14.6, -16.4, -49.9],
  [-18, -2.6, -33.1, -25, -61.5],
  [-21, -8.2, -12.3, -11.5, -62.4],
  [-16.8, -18.1, -10.2, -13.3, -64.1],
  [-16.6, -7.7, -12.3, -13.7, -40.5],
  [-16.7, -4.4, -16.6, -11.9, -34.1],
  [-19, -8.8, -14.6, -13.8, -19.3],
  [-15.6, -10.2, -15.3, -14.7, -28.6],
  [-21.3, -7, -36.7, -19.6, -29.5],
  [-19.4, -13.5, -21.6, -15, -28.8],
  [-15.3, -11.5, -18, -21.7, -28.9],
  [-16.3, -8, -17.2, -14.4, -31.9],
  [-27.2, -14.9, -13.5, -22.3, -32.4],
  [-17.5, -9.9, -24.1, -19.2, -30.8],
  [-15.6, -10.6, -25.5, -18.9, -34.2],
  [-21.5, -17, -16.1, -16.5, -35.6],
  [-18.1, -13, -21.6, -22.1, -35.4],
  [-16.4, -17.3, -15.1, -27.8, -27.8],
  [-18.7, -11.1, -16.5, -29.2, -27.3],
  [-17.9, -12.9, -14.6, -23.8, -28.8],
  [-16.3, -4.9, -53.5, -27, -35.5],
  [-14.7, -3.8, -26.4, -21.9, -35.8],
  [-18.9, -2.9, -15.9, -14.4, -44.1],
  [-22.4, -15.8, -17.5, -12.1, -47.8],
  [-26.3, -17.3, -21, -16.4, -47.5],
  [-26.9, -12.9, -24.1, -20, -38.1],
  [-25, -12.5, -24.9, -20.6, -22.9],
  [-20.7, -2, -42.7, -16.8, -18.1],
  [-26.8, -12.9, -17.3, -16.1, -29.9],
  [-23.5, -12.6, -17.3, -20.1, -28.9],
  [-25.8, -7.7, -30.8, -22.9, -23.5],
  [-27.3, -10.3, -21.8, -20.7, -24.4],
  [-27.7, -12.3, -23.6, -16.8, -21],
  [-31.4, -12.3, -28.6, -19.7, -19.8],
  [-30.2, -14.8, -20.5, -20.1, -26.4],
  [-32.5, -21.5, -17.1, -23.4, -31.7],
  [-37.4, -27.8, -19.6, -16.3, -41],
  [-34, -15.1, -21.1, -23.1, -30.5],
  [-36.5, -14.2, -19.7, -15.8, -33.3],
  [-41.4, -14.8, -42.5, -32.7, -35.9],
  [-42, -18.2, -36.2, -33.1, -34.8],
  [-36.5, -22.5, -18, -59.5, -36.2],
  [-44.8, -11.2, -56.5, -65.8, -41.5],
  [-47.9, -13.8, -28, -67.1, -60.6],
  [-36.1, -10.4, -65.8, -72, -72],
  [-36.1, -10.4, -65.8, -72, -72],
  [-36.1, -10.4, -65.8, -72, -72],
];

/** Howl partial pair f0 (Hz) keyframes: rises into the 2 s swell, then a slow fall into the end. */
export const ION_SHUTDOWN_F0: ReadonlyArray<readonly [number, number]> = [
  [0, 85],
  [1.2, 100],
  [1.8, 121],
  [2.4, 115],
  [4.8, 90],
  [8, 82],
  [10.5, 77],
  [11.76, 62],
];

/** Shutdown flutter on the mid / presence bands: [rate Hz, depth] + slow random jitter. */
export const ION_SHUTDOWN_FLUTTER: ReadonlyArray<readonly [number, number]> = [
  [5.5, 0.12],
  [10.5, 0.1],
];
export const ION_SHUTDOWN_JITTER = 1.5;
/** Howl-comb level relative to the louder of the two resonance bands. */
export const ION_SHUTDOWN_TONE = 1.2;

/** Targeting cue partials [Hz, level dB, vibrato group]. Narrow stable lines + weak noise bed. */
export const ION_TARGET_PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [75, -21.2, 0],
  [261, -12.1, 0],
  [480, -11.8, 1],
  [646, -24.6, 1],
  [1261, 0, 1],
  [1499, -0.2, 1],
  [1744, -30.4, 1],
  [2099, -11.2, 1],
];
/** Targeting modulation: 6.4 Hz pulse (AM) + vibrato on the lines, 23 / 32 Hz roughness above 1 kHz. */
export const ION_TARGET_VIB_HZ = 6.4;
export const ION_TARGET_VIB_CENTS = 9;
export const ION_TARGET_PULSE_DEPTH = 0.14;
export const ION_TARGET_ROUGH: ReadonlyArray<readonly [number, number]> = [
  [32, 0.2],
  [23, 0.14],
];
/** Breath around each line (narrow noise band, dB re the line) and the broad floor bands. */
export const ION_TARGET_LINE_BREATH_DB = -14;
export const ION_TARGET_FLOOR: ReadonlyArray<readonly [BiquadFilterType, number, number, number]> = [
  ['bandpass', 75, 2.5, -10.7],
  ['bandpass', 135, 1.5, -14.3],
  ['bandpass', 600, 0.7, -6.1],
  ['bandpass', 1600, 1, -4.9],
];

export interface IonTargetParams {
  partials: ReadonlyArray<readonly [number, number, number]>;
  floor: ReadonlyArray<readonly [BiquadFilterType, number, number, number]>;
  breathDb: number;
  pulseDepth: number;
  rough: ReadonlyArray<readonly [number, number]>;
  jitter: number;
}
export const ION_TARGET_JITTER = 1;
export const ION_TARGET_PARAMS: IonTargetParams = {
  partials: ION_TARGET_PARTIALS,
  floor: ION_TARGET_FLOOR,
  breathDb: ION_TARGET_LINE_BREATH_DB,
  pulseDepth: ION_TARGET_PULSE_DEPTH,
  rough: ION_TARGET_ROUGH,
  jitter: ION_TARGET_JITTER,
};

export interface IonTwinCueBuffers {
  shutdown: AudioBuffer;
  ignition: AudioBuffer;
  target: AudioBuffer;
}

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/** Fixed-seed PRNG (mulberry32) — cue noise never depends on Math.random. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pinkBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = prng(seed);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1;
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

const dbToGain = (db: number) => Math.pow(10, db / 20);

function pw(points: ReadonlyArray<readonly [number, number]>, t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-9, t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/** Keyframes (frame centres) → param curve over the whole cue (holds the ends). */
function keyCurve(param: AudioParam, values: number[], hop: number, total: number): void {
  const t0 = hop / 2;
  param.setValueAtTime(values[0], 0);
  const span = hop * (values.length - 1);
  param.setValueCurveAtTime(Float32Array.from(values), t0, span);
  if (t0 + span < total) param.setValueAtTime(values[values.length - 1], t0 + span + 1e-4);
}

function fundamentalFreeWave(ctx: BaseAudioContext, n = 40): PeriodicWave {
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let k = 2; k <= n; k++) imag[k] = (k === 2 ? 0.3 : 1) / k;
  return ctx.createPeriodicWave(real, imag);
}

/** Builds the shutdown voice into `dest` (starting at t = 0) for an offline context. */
export function buildIonShutdown(
  ctx: BaseAudioContext,
  dest: AudioNode,
  bands: number[][] = ION_SHUTDOWN_BANDS,
): void {
  const T = ION_SHUTDOWN_SECONDS;
  const H = ION_CUE_HOP;
  const col = (b: number) => bands.map((r) => r[b]);
  const noise = ctx.createBufferSource();
  noise.buffer = pinkBuffer(ctx, T + 0.5, 0x51a7);
  const out = ctx.createGain();
  out.connect(dest);
  // Fade in / out on the bus (click-free both ways; the reversed copy inherits them)
  out.gain.setValueAtTime(0, 0);
  out.gain.linearRampToValueAtTime(1, 0.05);
  out.gain.setValueAtTime(1, ION_SHUTDOWN_END - 0.24);
  out.gain.linearRampToValueAtTime(0, ION_SHUTDOWN_END);

  // Flutter on the mid + presence bands (≈5.5 / 10.5 Hz + slow random jitter)
  const flutter = ctx.createGain();
  flutter.gain.value = 1 - ION_SHUTDOWN_FLUTTER.reduce((a, [, d]) => a + d, 0);
  flutter.connect(out);
  const lfos: AudioScheduledSourceNode[] = [];
  for (const [hz, depth] of ION_SHUTDOWN_FLUTTER) {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const d = ctx.createGain();
    d.gain.value = depth;
    o.connect(d);
    d.connect(flutter.gain);
    lfos.push(o);
  }
  {
    const j = ctx.createBufferSource();
    j.buffer = pinkBuffer(ctx, T + 0.5, 0x2b4d);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 30;
    const d = ctx.createGain();
    d.gain.value = ION_SHUTDOWN_JITTER;
    j.connect(lp);
    lp.connect(d);
    d.connect(flutter.gain);
    lfos.push(j);
  }
  // Band filters: rumble, the two broad resonances (≈240 / 412 Hz), presence, air
  const specs: Array<[BiquadFilterType, number, number]> = [
    ['lowpass', 115, 0.7],
    ['bandpass', 240, 1.8],
    ['bandpass', 412, 1.8],
    ['bandpass', 1400, 0.9],
    ['bandpass', 4000, 0.8],
  ];
  const filters = specs.map(([type, hz, q], b) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = ctx.createGain();
    keyCurve(g.gain, col(b).map(dbToGain), H, T);
    noise.connect(f);
    f.connect(g);
    g.connect(b === 2 || b === 3 ? flutter : out);
    return f;
  });

  // Twin interior hum (≈56.5 / 75.4 Hz) under the opening — the reversed ignition lands on it
  const rumbleLevel = col(0).map((db, k) => dbToGain(db) * 0.15 * Math.max(0, 1 - (k * H) / 3.5));
  for (const hz of [56.5, 75.4]) {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const g = ctx.createGain();
    keyCurve(g.gain, rumbleLevel, H, T);
    o.connect(g);
    g.connect(out);
    o.start(0);
    o.stop(T);
  }
  // Late low drone (≈38 Hz) under the bursts
  {
    const o = ctx.createOscillator();
    o.frequency.value = 38;
    const g = ctx.createGain();
    keyCurve(
      g.gain,
      col(0).map((db, k) => dbToGain(db) * 0.4 * Math.min(1, Math.max(0, (k * H - 5) / 1.5))),
      H,
      T,
    );
    o.connect(g);
    g.connect(out);
    o.start(0);
    o.stop(T);
  }

  // Howl partial pair (fundamental-free comb) excites the two upper resonances; level follows them
  const wave = fundamentalFreeWave(ctx);
  const tone = ctx.createGain();
  keyCurve(tone.gain, bands.map((r) => ION_SHUTDOWN_TONE * dbToGain(Math.max(r[2], r[3]))), H, T);
  for (const det of [1, 1.006]) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(wave);
    const steps = Math.ceil(T / 0.05) + 1;
    const f0 = new Float32Array(steps);
    for (let i = 0; i < steps; i++) f0[i] = pw(ION_SHUTDOWN_F0, i * 0.05) * det;
    o.frequency.setValueCurveAtTime(f0, 0, T);
    o.connect(tone);
    o.start(0);
    o.stop(T);
  }
  tone.connect(filters[2]);
  tone.connect(filters[3]);

  // Whine episode ≈2.77 kHz with 366 Hz FM sidebands (2–4.6 s)
  {
    const car = ctx.createOscillator();
    car.frequency.value = 2767;
    const mod = ctx.createOscillator();
    mod.frequency.value = 366;
    const idx = ctx.createGain();
    idx.gain.value = 150;
    mod.connect(idx);
    idx.connect(car.frequency);
    const g = ctx.createGain();
    const lv = bands.map((r, k) => {
      const t = H / 2 + k * H;
      const w = t < 1.9 || t > 4.7 ? 0 : Math.min(1, (t - 1.9) / 0.3, (4.7 - t) / 0.4);
      return dbToGain(r[4]) * 0.5 * w;
    });
    keyCurve(g.gain, lv, H, T);
    car.connect(g);
    g.connect(out);
    car.start(0);
    mod.start(0);
    car.stop(T);
    mod.stop(T);
  }
  for (const o of lfos) {
    o.start(0);
    o.stop(T);
  }
  noise.start(0);
  noise.stop(T);
}

/** Builds the targeting cue into `dest` (t = 0 … ION_TARGET_SECONDS). */
export function buildIonTarget(
  ctx: BaseAudioContext,
  dest: AudioNode,
  p: IonTargetParams = ION_TARGET_PARAMS,
): void {
  const T = ION_TARGET_SECONDS;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(1, 0.03);
  env.gain.setValueAtTime(1, T - 0.25);
  env.gain.linearRampToValueAtTime(0, T - 0.01);
  // Band-limit: no sub rumble below the 75 Hz line, dark above ~6 kHz
  const hpOut = ctx.createBiquadFilter();
  hpOut.type = 'highpass';
  hpOut.frequency.value = 48;
  hpOut.Q.value = 0.9;
  const lpOut = ctx.createBiquadFilter();
  lpOut.type = 'lowpass';
  lpOut.frequency.value = 7600;
  lpOut.Q.value = 0.6;
  env.connect(hpOut);
  hpOut.connect(lpOut);
  lpOut.connect(dest);
  const lfos: OscillatorNode[] = [];
  const lfo = (hz: number) => {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    lfos.push(o);
    return o;
  };
  // Pulse AM on every line group, roughness only on the upper group
  const vib = lfo(ION_TARGET_VIB_HZ);
  const pulse = ctx.createGain();
  pulse.gain.value = 1 - p.pulseDepth;
  const pulseDepth = ctx.createGain();
  pulseDepth.gain.value = p.pulseDepth;
  vib.connect(pulseDepth);
  pulseDepth.connect(pulse.gain);
  pulse.connect(env);
  const hi = ctx.createGain();
  let rough = 0;
  for (const [hz, depth] of p.rough) {
    const d = ctx.createGain();
    d.gain.value = depth;
    lfo(hz).connect(d);
    d.connect(hi.gain);
    rough += depth;
  }
  hi.gain.value = 1 - rough;
  hi.connect(pulse);
  const lo = ctx.createGain();
  lo.connect(pulse);
  const noise = ctx.createBufferSource();
  noise.buffer = pinkBuffer(ctx, T + 0.1, 0x7a26);
  // Random envelope jitter (slow noise into the pulse gain) — the ref's fluctuation is broad
  const jit = ctx.createBufferSource();
  jit.buffer = pinkBuffer(ctx, T + 0.1, 0x3c11);
  const jitLp = ctx.createBiquadFilter();
  jitLp.type = 'lowpass';
  jitLp.frequency.value = 40;
  const jitG = ctx.createGain();
  jitG.gain.value = p.jitter;
  jit.connect(jitLp);
  jitLp.connect(jitG);
  jitG.connect(pulse.gain);
  jit.start(0);
  jit.stop(T);
  for (const [hz, db, group] of p.partials) {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    if (group === 1) {
      const d = ctx.createGain();
      d.gain.value = ION_TARGET_VIB_CENTS;
      vib.connect(d);
      d.connect(o.detune);
    }
    const g = ctx.createGain();
    g.gain.value = dbToGain(db) * 0.25;
    o.connect(g);
    const bus = hz >= 1000 ? hi : lo;
    g.connect(bus);
    o.start(0);
    o.stop(T);
    // Narrow breath band around the line (widens it into the slightly blurred ref line)
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz;
    bp.Q.value = Math.max(4, hz / 40);
    const bg = ctx.createGain();
    bg.gain.value = dbToGain(db + p.breathDb) * 0.25 * Math.sqrt(hz / 40);
    noise.connect(bp);
    bp.connect(bg);
    bg.connect(bus);
  }
  for (const [type, hz, q, db] of p.floor) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = dbToGain(db) * 0.25 * 6;
    noise.connect(f);
    f.connect(g);
    g.connect(hz >= 1000 ? env : lo);
  }
  for (const o of lfos) {
    o.start(0);
    o.stop(T);
  }
  noise.start(0);
  noise.stop(T);
}

function normalisePeak(buf: AudioBuffer, peak: number): void {
  let p = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  }
  const g = p > 0 ? peak / p : 1;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
}

/** Renders a cue graph offline (mono graph, 2-channel buffer), peak-normalised to 0.5. */
export async function renderIonCue(
  sampleRate: number,
  seconds: number,
  build: (ctx: BaseAudioContext, dest: AudioNode) => void,
  reversed = false,
): Promise<{ buffer: AudioBuffer; reversed: AudioBuffer | null }> {
  const Ctor = offlineCtor();
  if (!Ctor) throw new Error('OfflineAudioContext unavailable');
  const ctx = new Ctor(2, Math.ceil(seconds * sampleRate), sampleRate);
  build(ctx, ctx.destination);
  const buffer = await ctx.startRendering();
  normalisePeak(buffer, 0.5);
  let rev: AudioBuffer | null = null;
  if (reversed) {
    rev = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const x = buffer.getChannelData(c);
      const y = rev.getChannelData(c);
      for (let i = 0, n = x.length; i < n; i++) y[i] = x[n - 1 - i];
    }
  }
  return { buffer, reversed: rev };
}

const cache = new Map<number, Promise<IonTwinCueBuffers>>();
const ready = new Map<number, IonTwinCueBuffers>();

/** Renders (once per sample rate) the shutdown, its reversed ignition and the targeting cue. */
export function ionTwinCues(sampleRate: number): Promise<IonTwinCueBuffers> {
  let p = cache.get(sampleRate);
  if (!p) {
    p = (async () => {
      const sd = await renderIonCue(sampleRate, ION_SHUTDOWN_SECONDS, (c, d) => buildIonShutdown(c, d), true);
      const tg = await renderIonCue(sampleRate, ION_TARGET_SECONDS, buildIonTarget);
      const set = { shutdown: sd.buffer, ignition: sd.reversed!, target: tg.buffer };
      ready.set(sampleRate, set);
      return set;
    })();
    p.catch(() => cache.delete(sampleRate));
    cache.set(sampleRate, p);
  }
  return p;
}

/** Synchronous access once ionTwinCues(sampleRate) has resolved (null until then). */
export function readyIonTwinCues(sampleRate: number): IonTwinCueBuffers | null {
  return ready.get(sampleRate) ?? null;
}
