/**
 * Twin Ion recorded stems (optional layer under the procedural voice).
 *
 * If `public/audio/ion-twin/manifest.json` is present, each source segment ships as band / transient
 * stems that line up with the Twin Ion layer families (motor < 200 Hz, howl 200 Hz–1.5 kHz,
 * scream 1.5–6 kHz, air > 6 kHz, grit = transients). Continuous roles (sustain, interior hum) run
 * every stem through its own granular overlap-add player (seeded random grain position, length
 * jitter, load-driven overlap), so nothing repeats audibly; cues play the stems as one-shots.
 *
 * Missing folder / manifest, a failed fetch or a failed decode all resolve to `null` and the
 * procedural voice carries on alone (it is never held back waiting for the network).
 */

export const ION_STEM_IDS = ['motor', 'howl', 'scream', 'air', 'grit'] as const;
export type IonStemId = (typeof ION_STEM_IDS)[number];
export type IonStemSegmentId = 'sustain' | 'hum' | 'target' | 'shutdown' | 'accel';
export type IonStemBuffers = Partial<Record<IonStemId, AudioBuffer>>;

export interface IonStemManifestSegment {
  /** Segment length (s) at the source rate. */
  seconds: number;
  /** Gain (dB) that brings the summed stems to −20 LUFS integrated. */
  normDb: number;
  stems: Partial<Record<IonStemId, { file: string; channels: number }>>;
}
export interface IonStemManifest {
  version: number;
  /** Encoded variants, best first (file stem + '.' + format). */
  formats: string[];
  /** Source sample rate of the stems (default 44100). */
  sampleRate?: number;
  segments: Partial<Record<IonStemSegmentId, IonStemManifestSegment>>;
}

export interface IonStemSet {
  manifest: IonStemManifest;
  /** Segment → decoded stems (ignition = the shutdown stems reversed). */
  segments: Partial<Record<IonStemSegmentId | 'ignition', IonStemBuffers>>;
  /** Linear gain bringing a segment's summed stems to −20 LUFS. */
  norm: (seg: IonStemSegmentId | 'ignition') => number;
}

/** Layer that each stem belongs to (layer enable / mix / recorded share). */
export const ION_STEM_LAYER: Record<IonStemId, 'motor' | 'howl' | 'scream' | 'air' | 'grit'> = {
  motor: 'motor',
  howl: 'howl',
  scream: 'scream',
  air: 'air',
  grit: 'grit',
};

/** Fetches a path relative to the stem folder; resolves null when it isn't there. */
export type IonStemFetcher = (name: string) => Promise<ArrayBuffer | null>;

/** Loader / playback status (diagnostics: `getIonTwinStemStatus()`, `window.__ionTwinStems()`). */
export interface IonStemStatus {
  /** Manifest fetched and every listed stem attempted. */
  loaded: boolean;
  /** 'absent' = no manifest (synth-only build), 'error' = manifest unreadable. */
  manifest: 'pending' | 'absent' | 'ok' | 'error';
  /** Stems decoded / listed; format actually decoded (webm | m4a). */
  decoded: number;
  listed: number;
  failed: string[];
  format: string | null;
  /** A running engine is playing the stems (share > 0, not switched off). */
  active: boolean;
  /** Current recorded share 0..1 and the loudest continuous stem-role gain (dB, −∞ when silent). */
  share: number;
  stemGainDb: number;
  /** ?ionStems=0|1 override in the page URL (null = none). */
  override: 0 | 1 | null;
  /** Base URL the stems are fetched from. */
  base: string;
}

const status: IonStemStatus = {
  loaded: false,
  manifest: 'pending',
  decoded: 0,
  listed: 0,
  failed: [],
  format: null,
  active: false,
  share: 0,
  stemGainDb: -Infinity,
  override: null,
  base: '',
};

/** `?ionStems=0` forces the synth-only voice, `?ionStems=1` forces the stems on (no storage). */
export function ionStemsQueryOverride(): 0 | 1 | null {
  try {
    // ?ionStems=… before the hash, or inside a hash route (#/drive?ionStems=…)
    const loc = (globalThis as { location?: { search?: string; hash?: string } }).location;
    const hash = loc?.hash ?? '';
    const q = hash.indexOf('?');
    const v =
      new URLSearchParams(loc?.search ?? '').get('ionStems') ??
      (q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('ionStems') : null);
    if (v === '0' || v === 'off' || v === 'false') return 0;
    if (v === '1' || v === 'on' || v === 'true') return 1;
  } catch {
    /* no URL */
  }
  return null;
}

/** Snapshot of the stem loader / playback status. */
export function getIonTwinStemStatus(): IonStemStatus {
  return { ...status, failed: [...status.failed], override: ionStemsQueryOverride(), base: stemBaseUrl() };
}

/** Engines report their live stem share / gain each control frame. */
export function reportIonStemLive(active: boolean, share: number, gainLin: number): void {
  status.active = active;
  status.share = share;
  status.stemGainDb = gainLin > 0 ? 20 * Math.log10(gainLin) : -Infinity;
}

try {
  const w = globalThis as unknown as { window?: Record<string, unknown> };
  if (w.window && typeof w.window === 'object') w.window.__ionTwinStems = getIonTwinStemStatus;
} catch {
  /* not a browser */
}

let customFetcher: IonStemFetcher | null = null;
let formatPreference: string[] | null = null;
const cache = new Map<number, Promise<IonStemSet | null>>();
const ready = new Map<number, IonStemSet | null>();

/** Override how stem files are fetched (offline renders / tests). Clears the cache. */
export function setIonStemFetcher(f: IonStemFetcher | null, formats?: string[]): void {
  customFetcher = f;
  formatPreference = formats ?? null;
  cache.clear();
  ready.clear();
  Object.assign(status, { loaded: false, manifest: 'pending', decoded: 0, listed: 0, failed: [], format: null });
}

function stemBaseUrl(): string {
  try {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL;
    return `${base || './'}audio/ion-twin/`;
  } catch {
    return './audio/ion-twin/';
  }
}

const browserFetcher: IonStemFetcher = async (name) => {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(stemBaseUrl() + name);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
};

function canPlay(mime: string): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const a = document.createElement('audio');
    return typeof a.canPlayType === 'function' && a.canPlayType(mime) !== '';
  } catch {
    return false;
  }
}

/** Preferred encoded format order for this runtime. */
function formatOrder(m: IonStemManifest): string[] {
  if (formatPreference) return formatPreference.filter((f) => m.formats.includes(f));
  const opus = canPlay('audio/webm; codecs="opus"');
  const order = opus ? ['webm', 'm4a'] : ['m4a', 'webm'];
  return order.filter((f) => m.formats.includes(f));
}

function parseManifest(buf: ArrayBuffer | null): IonStemManifest | null {
  if (!buf) return null;
  try {
    const m = JSON.parse(new TextDecoder().decode(buf)) as IonStemManifest;
    if (!m || typeof m !== 'object' || !m.segments || !Array.isArray(m.formats)) return null;
    return m;
  } catch {
    return null;
  }
}

function reversed(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return out;
}

/** AAC encoder priming (samples at the source rate) that some decoders leave at the head. */
const AAC_PRIMING = 1024;

/**
 * Trim a decoded stem to its manifest length so every decoder lines up sample-for-sample
 * (the ignition is the reversed shutdown, so a codec delay left at the head would skew it).
 * AAC: drop the 1024-sample priming when the decoder kept it; Opus pre-skip is always trimmed.
 */
function alignDecoded(ctx: BaseAudioContext, b: AudioBuffer, seconds: number, fmt: string, srcRate: number): AudioBuffer {
  const n = Math.round(seconds * b.sampleRate);
  if (!(n > 0) || b.length < n) return b;
  const priming = Math.round((AAC_PRIMING * b.sampleRate) / srcRate);
  const lead = fmt === 'm4a' && b.length - n >= priming ? priming : 0;
  if (lead === 0 && b.length === n) return b;
  const out = ctx.createBuffer(b.numberOfChannels, n, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    out.getChannelData(c).set(b.getChannelData(c).subarray(lead, lead + n));
  }
  return out;
}

async function loadSet(ctx: BaseAudioContext): Promise<IonStemSet | null> {
  const fetcher = customFetcher ?? browserFetcher;
  const raw = await fetcher('manifest.json');
  const manifest = parseManifest(raw);
  if (!manifest) {
    status.manifest = raw ? 'error' : 'absent';
    status.loaded = true;
    return null;
  }
  status.manifest = 'ok';
  const order = formatOrder(manifest);
  if (!order.length) {
    status.loaded = true;
    return null;
  }
  const srcRate = Number(manifest.sampleRate ?? 44100);
  const decode = async (file: string, seconds: number): Promise<AudioBuffer | null> => {
    status.listed += 1;
    for (const fmt of order) {
      const data = await fetcher(`${file}.${fmt}`);
      if (!data) continue;
      try {
        const b = await ctx.decodeAudioData(data);
        status.decoded += 1;
        status.format = status.format && status.format !== fmt ? 'mixed' : fmt;
        return alignDecoded(ctx, b, seconds, fmt, srcRate);
      } catch {
        /* try the next format */
      }
    }
    status.failed.push(file);
    return null;
  };
  const segments: IonStemSet['segments'] = {};
  const norms: Partial<Record<IonStemSegmentId | 'ignition', number>> = {};
  const jobs: Promise<void>[] = [];
  for (const [seg, def] of Object.entries(manifest.segments) as [IonStemSegmentId, IonStemManifestSegment][]) {
    if (!def?.stems) continue;
    const bufs: IonStemBuffers = {};
    segments[seg] = bufs;
    norms[seg] = Math.pow(10, Number(def.normDb ?? 0) / 20);
    for (const [stem, info] of Object.entries(def.stems) as [IonStemId, { file: string }][]) {
      if (!info?.file || !ION_STEM_IDS.includes(stem)) continue;
      jobs.push(
        decode(info.file, Number(def.seconds ?? 0)).then((b) => {
          if (b) bufs[stem] = b;
        }),
      );
    }
  }
  await Promise.all(jobs);
  status.loaded = true;
  const sd = segments.shutdown;
  if (sd) {
    const ign: IonStemBuffers = {};
    for (const [k, b] of Object.entries(sd) as [IonStemId, AudioBuffer][]) ign[k] = reversed(ctx, b);
    segments.ignition = ign;
    norms.ignition = norms.shutdown;
  }
  const any = Object.values(segments).some((s) => s && Object.keys(s).length > 0);
  if (!any) return null;
  return { manifest, segments, norm: (seg) => norms[seg] ?? 1 };
}

/** Lazy, cached per sample rate. Resolves null when no stems ship (synth-only voice). */
export function ionTwinStems(ctx: BaseAudioContext): Promise<IonStemSet | null> {
  const sr = ctx.sampleRate;
  let p = cache.get(sr);
  if (!p) {
    p = loadSet(ctx)
      .catch(() => null)
      .then((set) => {
        ready.set(sr, set);
        return set;
      });
    cache.set(sr, p);
  }
  return p;
}

/** Synchronous view: the decoded set, or null while loading / when absent. */
export function readyIonTwinStems(sampleRate: number): IonStemSet | null {
  return ready.get(sampleRate) ?? null;
}

// ── Granular overlap-add player ──

/** Small seeded PRNG (grain positions are reproducible for a given seed). */
export function ionStemRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sine window (equal-power overlap of free grains). */
const WINDOW = (() => {
  const n = 129;
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = Math.sin((Math.PI * i) / (n - 1));
  return w;
})();

/** Waveform-alignment search (s): correlation window and ± lag range. */
const ION_ALIGN_WIN = 0.02;
const ION_ALIGN_LAG = 0.012;
/** Crossfade (s) between waveform-aligned grains. */
const ION_ALIGN_XFADE = 0.07;

/** Grain level-compensation window (s) and limit (dB). */
const ION_GRAIN_LEVEL_WIN = 0.05;
const ION_GRAIN_LEVEL_MAX_DB = 6;
/** Grains read only from material within this many dB of the clip's mean level. */
const ION_GRAIN_USABLE_DB = 6;

/** Mean-square per ION_GRAIN_LEVEL_WIN window of a buffer (channels averaged). */
export function stemPowerTable(buf: AudioBuffer, win = ION_GRAIN_LEVEL_WIN): Float32Array {
  const n = Math.max(1, Math.round(win * buf.sampleRate));
  const m = Math.max(1, Math.floor(buf.length / n));
  const out = new Float32Array(m);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let j = 0; j < m; j++) {
    let s = 0;
    for (let i = j * n, e = i + n; i < e; i++) {
      let v = 0;
      for (const ch of chans) v += ch[i];
      v /= chans.length;
      s += v * v;
    }
    out[j] = s / n;
  }
  return out;
}

/** Highest playback rate a grain is cut for (≈ +5 semitones headroom). */
export const ION_GRAIN_MAX_RATE = Math.pow(2, 5 / 12);

export interface IonGrainOptions {
  /** Mean grain length (s, real time). */
  grain: number;
  /** ± fraction of grain length jitter. */
  jitter: number;
  seed: number;
  /**
   * Waveform-aligned overlap-add (WSOLA): each grain's start is nudged (±12 ms) to line up with
   * the grain it crossfades from, and Hann windows sum to unity. Tonal stems need this — free
   * grains of a pitched source beat against each other in the crossfades.
   */
  align?: boolean;
}

export interface IonGrainEvent {
  at: number;
  offset: number;
  length: number;
}

/**
 * Continuous player: sine-windowed grains from random buffer positions, hop = grain / density,
 * window scaled by √(2 / density) so overlapping (uncorrelated) grains hold constant power.
 */
export class IonGrainPlayer {
  readonly out: GainNode;
  rate = 1;
  density = 2;
  /** Optional log of scheduled grains (seam analysis). */
  log: IonGrainEvent[] | null = null;
  private nextAt = -1;
  private readonly rng: () => number;
  private live: { src: AudioBufferSourceNode; g: GainNode; end: number; level: number }[] = [];
  private stopped = false;
  private readonly ctx: BaseAudioContext;
  private readonly buf: AudioBuffer;
  private readonly opts: IonGrainOptions;
  /** Power per ION_GRAIN_LEVEL_WIN window (mono) and the buffer's mean power. */
  private readonly pow: Float32Array;
  private readonly meanPow: number;
  private readonly usable: Uint8Array;
  private prev: { at: number; offset: number; end: number } | null = null;

  constructor(ctx: BaseAudioContext, buf: AudioBuffer, opts: IonGrainOptions) {
    this.ctx = ctx;
    this.buf = buf;
    this.opts = opts;
    this.out = ctx.createGain();
    this.rng = ionStemRng(opts.seed);
    this.pow = stemPowerTable(buf);
    let m = 0;
    for (let i = 0; i < this.pow.length; i++) m += this.pow[i];
    this.meanPow = m / Math.max(1, this.pow.length);
    // Usable read positions: 0.3 s neighbourhoods within ION_GRAIN_USABLE_DB of the mean level
    // (skips the swell-in / lift-off ends of a clip, which compensation alone can't lift)
    const half = Math.max(1, Math.round(0.15 / ION_GRAIN_LEVEL_WIN));
    const thr = this.meanPow * Math.pow(10, -ION_GRAIN_USABLE_DB / 10);
    this.usable = new Uint8Array(this.pow.length);
    for (let i = 0; i < this.pow.length; i++) {
      let q = 0;
      let c = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(this.pow.length - 1, i + half); j++, c++) q += this.pow[j];
      this.usable[i] = q / Math.max(1, c) >= thr ? 1 : 0;
    }
  }

  /** Random read position (s) in [0, room] whose start and end both sit in usable material. */
  private pickOffset(room: number, readLen: number): number {
    const w = ION_GRAIN_LEVEL_WIN;
    const ok = (t: number) => this.usable[Math.min(this.usable.length - 1, Math.max(0, Math.floor(t / w)))] === 1;
    let t = this.rng() * room;
    for (let k = 0; k < 12 && !(ok(t) && ok(t + readLen / 2) && ok(t + readLen)); k++) t = this.rng() * room;
    return t;
  }

  /**
   * Level compensation for a grain read over [t0, t1] s of the buffer: the recordings swell and
   * dip, and the engine (not the clip) owns the dynamics, so each grain is brought towards the
   * buffer's mean level (±ION_GRAIN_LEVEL_MAX_DB).
   */
  private levelComp(t0: number, t1: number): number {
    const w = ION_GRAIN_LEVEL_WIN;
    const a = Math.max(0, Math.floor(t0 / w));
    const b = Math.min(this.pow.length, Math.max(a + 1, Math.ceil(t1 / w)));
    let p = 0;
    for (let i = a; i < b; i++) p += this.pow[i];
    p /= Math.max(1, b - a);
    if (!(p > 0) || !(this.meanPow > 0)) return 1;
    const lim = Math.pow(10, ION_GRAIN_LEVEL_MAX_DB / 20);
    return Math.min(lim, Math.max(1 / lim, Math.sqrt(this.meanPow / p)));
  }

  /** Schedule grains up to now + lookahead (call every control frame). */
  tick(now: number, lookahead = 0.2): void {
    if (this.stopped) return;
    if (this.nextAt < now - 0.5) this.nextAt = now + 0.005;
    while (this.nextAt < now + lookahead) this.spawn(this.nextAt);
    if (this.live.length > 8) this.live = this.live.filter((v) => v.end > now);
  }

  setRate(r: number, now: number, tc = 0.08): void {
    const rate = Math.min(ION_GRAIN_MAX_RATE, Math.max(0.5, r));
    this.rate = rate;
    for (const v of this.live) {
      if (v.end <= now) continue;
      try {
        v.src.playbackRate.setTargetAtTime(rate, now, tc);
      } catch {
        /* ended */
      }
    }
  }

  stop(at: number): void {
    this.stopped = true;
    for (const v of this.live) {
      try {
        v.src.stop(Math.max(at, this.ctx.currentTime));
      } catch {
        /* already stopped */
      }
    }
    this.live = [];
  }

  /** Best-matching start (s) near `target` for a grain continuing from buffer time `cont`, with its correlation. */
  private alignTo(cont: number, target: number, room: number): { t: number; r: number } {
    const sr = this.buf.sampleRate;
    const x = this.buf.getChannelData(0);
    const W = Math.round(ION_ALIGN_WIN * sr);
    const L = Math.round(ION_ALIGN_LAG * sr);
    const ci = Math.round(cont * sr);
    const lo = Math.max(0, Math.round(target * sr) - L);
    const hi = Math.min(Math.floor(room * sr), Math.round(target * sr) + L);
    if (ci < 0 || ci + W >= x.length || hi <= lo) return { t: target, r: 0 };
    let xx = 1e-12;
    for (let i = 0; i < W; i++) xx += x[ci + i] * x[ci + i];
    const score = (o: number, step: number) => {
      let xy = 0;
      let yy = 1e-12;
      for (let i = 0; i < W; i += step) {
        const y = x[o + i];
        xy += x[ci + i] * y;
        yy += y * y;
      }
      return xy / Math.sqrt(yy);
    };
    let best = lo;
    let bs = -Infinity;
    for (let o = lo; o <= hi; o += 4) {
      const v = score(o, 4);
      if (v > bs) {
        bs = v;
        best = o;
      }
    }
    const c = best;
    bs = -Infinity;
    for (let o = Math.max(lo, c - 3); o <= Math.min(hi, c + 3); o++) {
      const v = score(o, 1);
      if (v > bs) {
        bs = v;
        best = o;
      }
    }
    return { t: best / sr, r: bs / Math.sqrt(xx) };
  }

  /**
   * Waveform-aligned mode: grains hold at unity and only their short ends overlap (one grain
   * sounds most of the time, so a pitched source never beats against itself). The previous
   * grain's fade-out is scheduled here, once the match is known: equal-gain when the aligned
   * waveforms correlate, equal-power when they don't.
   */
  private spawnAligned(at: number): void {
    const o = this.opts;
    const dens = Math.min(4, Math.max(1.5, this.density));
    const len = Math.max(0.12, (o.grain * (2 / dens)) * (1 + o.jitter * (this.rng() * 2 - 1)));
    const F = Math.min(ION_ALIGN_XFADE, len / 3);
    const span = len * ION_GRAIN_MAX_RATE + 0.02;
    const room = Math.max(0, this.buf.duration - span);
    let offset = this.pickOffset(room, len * this.rate);
    let r = 0;
    const prev = this.live.length ? this.live[this.live.length - 1] : null;
    const cont = prev && this.prev && at < this.prev.end ? this.prev : null;
    if (cont) {
      const m = this.alignTo(cont.offset + (at - cont.at) * this.rate, offset, room);
      offset = m.t;
      r = m.r;
    }
    const eqGain = r >= 0.6;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buf;
    src.playbackRate.setValueAtTime(this.rate, at);
    const g = ctx.createGain();
    const comp = this.levelComp(offset, offset + len * this.rate);
    const n = 64;
    const fin = new Float32Array(n);
    const fout = new Float32Array(n);
    const pc = cont && prev ? prev.level : 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      fin[i] = (eqGain ? 0.5 - 0.5 * Math.cos(Math.PI * t) : Math.sin((Math.PI / 2) * t)) * comp;
      fout[i] = (eqGain ? 0.5 + 0.5 * Math.cos(Math.PI * t) : Math.cos((Math.PI / 2) * t)) * pc;
    }
    g.gain.setValueAtTime(0, at);
    g.gain.setValueCurveAtTime(fin, at, F);
    if (cont && prev) {
      try {
        prev.g.gain.cancelScheduledValues(at);
        prev.g.gain.setValueCurveAtTime(fout, at, F);
      } catch {
        /* previous grain already gone */
      }
    }
    src.connect(g);
    g.connect(this.out);
    src.start(at, offset, span);
    // Held until the next grain fades it out (or the tail fade if none follows in time)
    const end = at + len + F;
    g.gain.setValueAtTime(comp, at + len);
    g.gain.linearRampToValueAtTime(0, end);
    src.stop(end + 0.01);
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    this.live.push({ src, g, end: end + 0.01, level: comp });
    this.log?.push({ at, offset, length: len + F });
    this.prev = { at, offset, end };
    this.nextAt = at + len;
  }

  private spawn(at: number): void {
    if (this.opts.align) {
      this.spawnAligned(at);
      return;
    }
    const o = this.opts;
    const dens = Math.min(4, Math.max(1.5, this.density));
    const len = Math.max(0.08, o.grain * (1 + o.jitter * (this.rng() * 2 - 1)));
    const span = len * ION_GRAIN_MAX_RATE + 0.02;
    const room = Math.max(0, this.buf.duration - span);
    const offset = this.pickOffset(room, len * this.rate);
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buf;
    src.playbackRate.setValueAtTime(this.rate, at);
    const g = ctx.createGain();
    const comp = this.levelComp(offset, offset + len * this.rate);
    const k = Math.sqrt(2 / dens) * comp;
    const curve = new Float32Array(WINDOW.length);
    for (let i = 0; i < curve.length; i++) curve[i] = WINDOW[i] * k;
    g.gain.setValueAtTime(0, at);
    g.gain.setValueCurveAtTime(curve, at, len);
    src.connect(g);
    g.connect(this.out);
    src.start(at, offset, span);
    src.stop(at + len + 0.01);
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    this.live.push({ src, g, end: at + len + 0.01, level: comp });
    this.log?.push({ at, offset, length: len });
    this.prev = { at, offset, end: at + len };
    this.nextAt = at + len / dens;
  }
}

/** Play a segment's stems as one aligned one-shot; returns the sources (all start at `at`). */
export function playIonStemOneShot(
  ctx: BaseAudioContext,
  stems: IonStemBuffers,
  dest: AudioNode,
  at: number,
  gainFor: (stem: IonStemId) => number,
): AudioBufferSourceNode[] {
  const out: AudioBufferSourceNode[] = [];
  for (const stem of ION_STEM_IDS) {
    const b = stems[stem];
    if (!b) continue;
    const gv = gainFor(stem);
    if (!(gv > 0)) continue;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = gv;
    src.connect(g);
    g.connect(dest);
    src.start(at);
    src.onended = () => {
      try {
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    out.push(src);
  }
  return out;
}

// ── Continuous stem bed (sustain + interior hum) ──

/** Per-stem granular settings and drive mapping for the continuous roles. */
export const ION_STEM_GRAIN: Record<IonStemId, { grain: number; jitter: number; align?: boolean }> = {
  motor: { grain: 1.4, jitter: 0.25, align: true },
  howl: { grain: 1.1, jitter: 0.25, align: true },
  scream: { grain: 0.75, jitter: 0.3, align: true },
  air: { grain: 0.45, jitter: 0.3 },
  grit: { grain: 0.35, jitter: 0.35 },
};

/** Sustain pitch range per stem: semitones at drive 0 → drive 1 (speed-led drive). */
export const ION_STEM_SEMIS: Record<IonStemId, readonly [number, number]> = {
  motor: [-3, 3],
  howl: [-4, 4],
  scream: [-4, 4],
  air: [-2, 2],
  grit: [-2, 2],
};

export interface IonStemDrive {
  speed: number;
  /** Effective throttle 0..1. */
  thr: number;
  /** Load 0..1 (filter, gain, grain density). */
  load: number;
  /** Surge envelope 0..1. */
  surge: number;
  /** Linear gains for the two continuous roles (already include the duck-free role curves). */
  sustainGain: number;
  humGain: number;
  /** Per-stem layer factor (layer enable × mix scale × recorded share). */
  layer: Record<IonStemId, number>;
  /** Extra surge share on the grit / howl stems (surge layer). */
  surgeLayer: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const sstep = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export class IonStemBed {
  readonly out: GainNode;
  private readonly sus: { stem: IonStemId; p: IonGrainPlayer; g: GainNode; lp?: BiquadFilterNode }[] = [];
  private readonly hum: { stem: IonStemId; p: IonGrainPlayer; g: GainNode }[] = [];
  private readonly humLp: BiquadFilterNode;
  private readonly susNorm: number;
  private readonly humNorm: number;

  private readonly satIn: GainNode;
  private readonly satOut: GainNode;

  constructor(ctx: BaseAudioContext, set: IonStemSet, seed = 1) {
    this.out = ctx.createGain();
    // Sustain-stem saturation: the recordings carry more crest than the synth, so at high drive
    // a soft tanh stage rounds their peaks before the master limiter (unity gain for small signals).
    this.satIn = ctx.createGain();
    this.satOut = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const n = 2048;
    const curve = new Float32Array(n);
    const { range: R, ceiling: C } = ION_STEM_SAT;
    for (let i = 0; i < n; i++) curve[i] = (Math.tanh((((i / (n - 1)) * 2 - 1) * R) / C) * C) / R;
    shaper.curve = curve;
    shaper.oversample = '2x';
    this.satIn.connect(shaper);
    shaper.connect(this.satOut);
    this.satOut.connect(this.out);
    this.susNorm = set.norm('sustain');
    this.humNorm = set.norm('hum');
    const sustain = set.segments.sustain ?? {};
    ION_STEM_IDS.forEach((stem, i) => {
      const b = sustain[stem];
      if (!b) return;
      const p = new IonGrainPlayer(ctx, b, { ...ION_STEM_GRAIN[stem], seed: seed * 97 + i * 13 + 1 });
      const g = ctx.createGain();
      g.gain.value = 0;
      let lp: BiquadFilterNode | undefined;
      if (stem === 'howl' || stem === 'scream') {
        lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.5;
        lp.frequency.value = 20000;
        p.out.connect(lp);
        lp.connect(g);
      } else {
        p.out.connect(g);
      }
      g.connect(this.satIn);
      this.sus.push({ stem, p, g, lp });
    });
    this.humLp = ctx.createBiquadFilter();
    this.humLp.type = 'lowpass';
    this.humLp.Q.value = 0.5;
    this.humLp.frequency.value = 900;
    this.humLp.connect(this.out);
    const hum = set.segments.hum ?? {};
    ION_STEM_IDS.forEach((stem, i) => {
      const b = hum[stem];
      if (!b) return;
      const grain = stem === 'motor' ? { grain: 1.6, jitter: 0.25, align: true } : ION_STEM_GRAIN[stem];
      const p = new IonGrainPlayer(ctx, b, { ...grain, seed: seed * 89 + i * 17 + 7 });
      const g = ctx.createGain();
      g.gain.value = 0;
      p.out.connect(g);
      g.connect(this.humLp);
      this.hum.push({ stem, p, g });
    });
  }

  /** All grain players (seam analysis / logging). */
  players(): { role: 'sustain' | 'hum'; stem: IonStemId; player: IonGrainPlayer }[] {
    return [
      ...this.sus.map((v) => ({ role: 'sustain' as const, stem: v.stem, player: v.p })),
      ...this.hum.map((v) => ({ role: 'hum' as const, stem: v.stem, player: v.p })),
    ];
  }

  update(now: number, d: IonStemDrive, tc = 0.06): void {
    const set = (p: AudioParam, v: number) => {
      try {
        p.setTargetAtTime(v, now, tc);
      } catch {
        p.value = v;
      }
    };
    const drive = clamp01(0.7 * d.speed + 0.3 * d.thr);
    const load = clamp01(d.load);
    const density = 2 + load;
    const [s0, s1] = ION_STEM_SAT.driveDb;
    const satLin = Math.pow(10, (s0 + (s1 - s0) * sstep(drive, 0.45, 1)) / 20);
    set(this.satIn.gain, satLin / ION_STEM_SAT.range);
    set(this.satOut.gain, ION_STEM_SAT.range);
    for (const v of this.sus) {
      const [lo, hi] = ION_STEM_SEMIS[v.stem];
      const semis = lo + (hi - lo) * drive + (v.stem === 'scream' ? 0.6 * d.thr : 0);
      v.p.setRate(Math.pow(2, Math.min(4.5, semis) / 12), now);
      v.p.density = density;
      let shape = 1;
      if (v.stem === 'scream') shape = ION_STEM_SCREAM_LIFT * (0.6 + 0.8 * sstep(d.thr, 0.2, 0.95));
      else if (v.stem === 'air') shape = 0.45 + 0.9 * clamp01(d.speed);
      else if (v.stem === 'grit') shape = 0.7 + 2.4 * clamp01(d.surge) * d.surgeLayer;
      else if (v.stem === 'howl') shape = 1 + 0.35 * clamp01(d.surge) * d.surgeLayer;
      else if (v.stem === 'motor') shape = 0.85 + 0.3 * load;
      set(v.g.gain, d.sustainGain * this.susNorm * shape * d.layer[v.stem]);
      if (v.lp) {
        const base = v.stem === 'howl' ? 1800 : 4500;
        set(v.lp.frequency, base * Math.pow(20000 / base, clamp01(0.35 + 0.65 * load)));
      }
      if (d.sustainGain > 1e-4) v.p.tick(now);
    }
    const hs = clamp01(d.speed * 3);
    set(this.humLp.frequency, 900 * Math.pow(20000 / 900, hs));
    for (const v of this.hum) {
      v.p.setRate(Math.pow(2, (-0.5 + 1.5 * hs) / 12), now);
      v.p.density = 2;
      set(v.g.gain, d.humGain * this.humNorm * d.layer[v.stem]);
      if (d.humGain > 1e-4) v.p.tick(now);
    }
  }

  stop(at: number): void {
    for (const v of this.sus) v.p.stop(at);
    for (const v of this.hum) v.p.stop(at);
  }
}

// ── Levels / defaults (re the −20 LUFS normalised stems) ──

/**
 * Sustain-stem soft saturation: tanh with a `ceiling` (linear amplitude) over a ±`range` input
 * window, pushed by `driveDb` (drive 0 → 1); small signals pass at unity.
 */
export const ION_STEM_SAT = { range: 8, ceiling: 1.5, driveDb: [0, 12] as readonly [number, number] };

/**
 * The scream stem is the core of the voice: lifted over its natural share of ref6 (where the
 * 1.5–6 kHz band sits ≈12 dB under the howl), which also brings the spectral centroid onto ref6's.
 */
export const ION_STEM_SCREAM_DB = 4;
const ION_STEM_SCREAM_LIFT = Math.pow(10, ION_STEM_SCREAM_DB / 20);

/** Default recorded share per layer (0 = synth only, 1 = stem only) and for cues. */
export const ION_STEM_REC_DEFAULT = {
  motor: 0.9,
  howl: 0.9,
  scream: 1,
  surge: 0.75,
  air: 1,
  grit: 0.9,
  cue: 0.9,
};

/** Stock layer mixes (stem gain follows a layer's mix relative to these). */
export const ION_STEM_MIX_REF = { motor: 0.58, howl: 0.92, scream: 0.35, surge: 0.7, air: 0.78, grit: 0.42 };

/** Cue stem level (dB re −20 LUFS) matching the procedural cue it layers with. */
export const ION_STEM_CUE_DB: Record<'target' | 'shutdown' | 'ignition', number> = {
  target: 0,
  shutdown: -2.5,
  ignition: -2.5,
};

/**
 * Continuous-role levels (dB re −20 LUFS): sustain by level drive (see driveSpeed) anchors,
 * interior hum, how far the hum gives way as the voice opens, and the pull-away one-shot.
 */
export const ION_STEM_LEVEL = {
  /** Sustain level drive = driveSpeed·speed + (1 − driveSpeed)·throttle (the synth's loudness leans on throttle). */
  driveSpeed: 1 / 3,
  sustain: [
    [0, -11.0],
    [0.25, -4.5],
    [0.4, 7.6],
    [0.58, 12.2],
    [0.8, 11.6],
    [1, 12.5],
  ] as ReadonlyArray<readonly [number, number]>,
  humDb: -13.9,
  humFade: 1,
  /** Pull-away one-shot level re the sustain's level at the same drive. */
  accelDb: 0,
};

export function ionStemSustainDb(drive: number): number {
  const a = ION_STEM_LEVEL.sustain;
  const x = clamp01(drive);
  for (let i = 1; i < a.length; i++) {
    if (x <= a[i][0]) {
      const [x0, y0] = a[i - 1];
      const [x1, y1] = a[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return a[a.length - 1][1];
}
