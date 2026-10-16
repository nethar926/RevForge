/**
 * Twin Ion recorded stems (optional layer under the procedural voice).
 *
 * If `public/audio/ion-twin/manifest.json` is present, each source segment ships as band / transient
 * stems that line up with the Twin Ion layer families (motor < 200 Hz, howl 200 Hz–1.5 kHz,
 * scream 1.5–6 kHz, air > 6 kHz, grit = transients). Continuous roles (sustain, interior hum) are
 * built once at load into long seamless loops (see buildIonLoop) that play as one looping source
 * per stem, started once and never restarted; cues play the stems as one-shots.
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
  /** Seamless loops of the continuous roles (built from the sustain / hum stems at load). */
  loops?: Partial<Record<'sustain' | 'hum', IonLoopBuffers[]>>;
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
  // Seamless loops: one region at a time, yielding in between (≈0.1 s of work each; the
  // procedural voice plays meanwhile and the UI thread is never held for long)
  const loops: IonStemSet['loops'] = { sustain: [], hum: [] };
  for (const role of ['sustain', 'hum'] as const) {
    for (const region of ION_LOOP_SPEC[role].regions) {
      await new Promise<void>((r) => setTimeout(r, 0));
      loops[role]!.push(...buildIonRoleLoops(ctx, segments[role], { ...ION_LOOP_SPEC[role], regions: [region] }));
    }
  }
  return { manifest, segments, norm: (seg) => norms[seg] ?? 1, loops };
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

// ── Seamless loop beds (cruise roar + interior hum) ──
//
// The continuous roles used to be granular: grains from random positions anywhere in the clip,
// 70 ms crossfades, per-grain level compensation. ref6 is not stationary (it swells in, and its
// howl formant sits at ≈930 Hz over 0.5–2.1 s, ≈400 Hz over 2.2–3.6 s, ≈720 Hz over 3.6–4.7 s),
// so every grain landed on a different formant / level → the "chopping". Now each continuous
// role is built once, at load, into long seamless loops: level-flattened stationary regions,
// cut into ~1 s chunks (forward or reversed), joined with long correlation-aware equal-power
// crossfades, with a baked crossfade at the loop point. Each region gets its own loop
// (incommensurate lengths), all loops of a role sum (power weights → the LTAS of ref6 as a whole),
// and every loop plays as ONE looping AudioBufferSourceNode per stem, started once and never
// restarted; speed only moves the shared playbackRate (setTargetAtTime), filters and gains.

/** Small seeded PRNG (loop plans are reproducible for a given seed). */
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

export interface IonLoopRegion {
  /** Source span (s) of the segment buffer. */
  from: number;
  to: number;
  /** Power weight of this loop in the role (weights sum to 1). */
  weight: number;
  /** Loop length (s); lengths are incommensurate so the sum never repeats as a whole. */
  length: number;
  seed: number;
}
export interface IonLoopSpec {
  regions: readonly IonLoopRegion[];
  /** Chunk length range (s) and crossfade (s). */
  seg: readonly [number, number];
  xfade: number;
  /** Level-flattening window (s). */
  flattenWin: number;
}

/**
 * Sustain: three stationary regions of ref6 (≈930 / 400 / 720 Hz howl formant), power weights
 * .25 / .5 / .25 (third-octave LTAS of the sum within 0.5 dB of ref6 0.4–5 s). Hum: ref2 is
 * stationary over 0.1–7.4 s, one long loop.
 */
export const ION_LOOP_SPEC: Record<'sustain' | 'hum', IonLoopSpec> = {
  sustain: {
    regions: [
      { from: 0.5, to: 2.15, weight: 0.25, length: 17.3, seed: 11 },
      { from: 2.15, to: 3.6, weight: 0.5, length: 19.9, seed: 23 },
      { from: 3.6, to: 4.7, weight: 0.25, length: 23.1, seed: 37 },
    ],
    seg: [0.75, 1.15],
    xfade: 0.4,
    flattenWin: 0.3,
  },
  hum: {
    regions: [{ from: 0.1, to: 7.4, weight: 1, length: 24.7, seed: 5 }],
    seg: [1.4, 2.4],
    xfade: 0.6,
    flattenWin: 0.4,
  },
};

export interface IonLoopSeam {
  /** Output sample where the crossfade starts, source sample, orientation, correlation used. */
  out: number;
  src: number;
  rev: boolean;
  r: number;
}
export interface IonBuiltLoop {
  channels: Partial<Record<IonStemId, Float32Array[]>>;
  /** Loop length (samples); the crossfade at the loop point is baked into [0, xfade). */
  length: number;
  xfade: number;
  seams: IonLoopSeam[];
  closeR: number;
}

/** Centered moving mean (prefix sums, edge-clamped). */
function movingMean(x: Float32Array, w: number): Float32Array {
  const n = x.length;
  const ps = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + x[i];
  const h = Math.max(1, Math.floor(w / 2));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h);
    const b = Math.min(n, i + h + 1);
    out[i] = (ps[b] - ps[a]) / (b - a);
  }
  return out;
}

/** Circular centered moving mean (the loop wraps, so its envelopes must too). */
function movingMeanCirc(x: Float32Array, w: number): Float32Array {
  const n = x.length;
  const h = Math.min(n - 1, Math.max(1, Math.floor(w / 2)));
  const ext = new Float32Array(n + 2 * h);
  ext.set(x.subarray(n - h), 0);
  ext.set(x, h);
  ext.set(x.subarray(0, h), n + h);
  const ps = new Float64Array(ext.length + 1);
  for (let i = 0; i < ext.length; i++) ps[i + 1] = ps[i] + ext[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (ps[i + 2 * h + 1] - ps[i]) / (2 * h + 1);
  return out;
}

/** Normalised correlation of a[ai…ai+n) and b[bi…bi+n) (every `step`th sample). */
function corrAt(a: Float32Array, ai: number, b: Float32Array, bi: number, n: number, step: number): number {
  let xy = 0;
  let xx = 1e-20;
  let yy = 1e-20;
  for (let i = 0; i < n; i += step) {
    const x = a[ai + i];
    const y = b[bi + i];
    xy += x * y;
    xx += x * x;
    yy += y * y;
  }
  return xy / Math.sqrt(xx * yy);
}

/**
 * Crossfade law for two signals of correlation r (clamped −0.8..1): fin² + fout² + 2r·fin·fout = 1,
 * i.e. equal-power for uncorrelated material, equal-gain for identical material. u: 0 → 1.
 */
export function ionXfade(u: number, r: number): [number, number] {
  const rr = Math.min(1, Math.max(-0.8, r));
  const th = ((1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2) * (Math.PI / 2);
  const s = Math.sin(th);
  const c = Math.cos(th);
  const k = Math.sqrt(1 + 2 * rr * s * c);
  return [s / k, c / k];
}

/**
 * Build one seamless loop from `region` of a segment's stems (all stems share one plan, so they
 * stay sample-aligned and still sum to the source). `targetPow` = mean power the role should
 * carry (the loop is scaled to weight × targetPow).
 */
export function buildIonLoop(
  stems: Partial<Record<IonStemId, Float32Array[]>>,
  sr: number,
  region: IonLoopRegion,
  spec: IonLoopSpec,
  targetPow: number,
): IonBuiltLoop | null {
  const ids = ION_STEM_IDS.filter((k) => (stems[k]?.length ?? 0) > 0);
  if (!ids.length) return null;
  const total = Math.min(...ids.map((k) => stems[k]![0].length));
  const a0 = Math.min(total - 1, Math.max(0, Math.round(region.from * sr)));
  const a1 = Math.min(total, Math.max(a0 + 1, Math.round(region.to * sr)));
  const n = a1 - a0;
  const X = Math.round(spec.xfade * sr);
  if (n < 2 * X + Math.round(0.1 * sr)) return null;
  // Region mix (channel mean per stem, stems summed) → slow level flattening (±6 dB)
  const mix = new Float32Array(n);
  for (const k of ids) {
    const ch = stems[k]!;
    for (const c of ch) for (let i = 0; i < n; i++) mix[i] += c[a0 + i] / ch.length;
  }
  const W = Math.max(1, Math.round(spec.flattenWin * sr));
  const sq = new Float32Array(n);
  let mp = 0;
  for (let i = 0; i < n; i++) {
    sq[i] = mix[i] * mix[i];
    mp += sq[i];
  }
  mp /= n;
  const env = movingMean(sq, W);
  const g0 = new Float32Array(n);
  for (let i = 0; i < n; i++) g0[i] = Math.min(2, Math.max(0.5, Math.sqrt(mp / (env[i] + 1e-12))));
  const gs = movingMean(g0, W);
  const flat = (x: Float32Array, off: number) => {
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = x[off + i] * gs[i];
    return y;
  };
  const rev = (x: Float32Array) => x.slice().reverse();
  const fMix = flat(mix, 0);
  const rMix = rev(fMix);
  let fp = 0;
  for (let i = 0; i < n; i++) fp += fMix[i] * fMix[i];
  fp /= n;
  const scale = Math.sqrt((region.weight * targetPow) / Math.max(1e-20, fp));

  // Plan: chunks of seg[0]..seg[1] s, each joined to the last at the best-correlating lag
  const rng = ionStemRng(region.seed);
  const N = Math.round(region.length * sr);
  const LAG = Math.round(0.012 * sr);
  const Wc = Math.round(0.04 * sr);
  const mid = Math.floor(X / 2) - Math.floor(Wc / 2);
  const need = N + LAG + X + 1;
  const lmin = Math.min(n, Math.max(2 * X + Math.round(0.05 * sr), Math.round(spec.seg[0] * sr)));
  const lmax = Math.min(n, Math.max(lmin, Math.round(spec.seg[1] * sr)));
  const segLen = () => Math.round(lmin + rng() * (lmax - lmin));
  type Chunk = { p: number; s: number; l: number; rev: boolean; r: number };
  const chunks: Chunk[] = [];
  let l = segLen();
  let s = Math.floor(rng() * (n - l + 1));
  let rv = rng() < 0.5;
  let p = 0;
  chunks.push({ p, s, l, rev: rv, r: 0 });
  while (p + l < need) {
    const np = p + l - X;
    const cs = s + l - X;
    const nl = segLen();
    const A = rv ? rMix : fMix;
    let best: { s: number; rev: boolean; score: number } | null = null;
    for (let k = 0; k < 8; k++) {
      const crev = rng() < 0.5;
      const cand = Math.floor(rng() * (n - nl + 1));
      // Not a plain continuation (that would just replay the region) nor the chunk we came from
      if (crev === rv && (Math.abs(cand - cs) < 0.2 * sr || Math.abs(cand - s) < 0.1 * sr)) continue;
      const B = crev ? rMix : fMix;
      let bl = 0;
      let br = -2;
      for (let lag = -LAG; lag <= LAG; lag += 4) {
        const c = cand + lag;
        if (c < 0 || c + nl > n) continue;
        const r = corrAt(A, cs + mid, B, c + mid, Wc, 4);
        if (r > br) {
          br = r;
          bl = lag;
        }
      }
      for (let lag = bl - 3; lag <= bl + 3; lag++) {
        const c = cand + lag;
        if (c < 0 || c + nl > n) continue;
        const r = corrAt(A, cs + mid, B, c + mid, Wc, 2);
        if (r > br) {
          br = r;
          bl = lag;
        }
      }
      const c = cand + bl;
      if (c < 0 || c + nl > n || br <= -2) continue;
      // Score = worst local correlation across the fade (a pitch drift inside a long fade
      // would otherwise pass through anti-phase and dip the low band)
      let score = br;
      for (const q of [0.1, 0.3, 0.7, 0.9]) {
        const o = Math.min(X - Wc, Math.max(0, Math.round(q * X) - (Wc >> 1)));
        score = Math.min(score, corrAt(A, cs + o, B, c + o, Wc, 4));
      }
      if (!best || score > best.score) best = { s: c, rev: crev, score };
    }
    if (!best) best = { s: Math.floor(rng() * (n - nl + 1)), rev: !rv, score: 0 };
    const B = best.rev ? rMix : fMix;
    const r = corrAt(A, cs, B, best.s, X, 8);
    chunks.push({ p: np, s: best.s, l: nl, rev: best.rev, r });
    p = np;
    l = nl;
    s = best.s;
    rv = best.rev;
  }
  // Crossfade curves per seam (seam k joins chunk k−1 → k), shared by every stem / channel
  const fadeIn: Float32Array[] = [];
  const fadeOut: Float32Array[] = [];
  for (let k = 1; k < chunks.length; k++) {
    const fi = new Float32Array(X);
    const fo = new Float32Array(X);
    for (let i = 0; i < X; i++) [fi[i], fo[i]] = ionXfade(i / X, chunks[k].r);
    fadeIn[k] = fi;
    fadeOut[k] = fo;
  }
  const render = (F: Float32Array, R: Float32Array): Float32Array => {
    const y = new Float32Array(need);
    for (let k = 0; k < chunks.length; k++) {
      const ch = chunks[k];
      const S = ch.rev ? R : F;
      const fi = k > 0 ? fadeIn[k] : null;
      const fo = k + 1 < chunks.length ? fadeOut[k + 1] : null;
      const end = Math.min(ch.l, need - ch.p);
      const tail = ch.l - X;
      for (let i = 0; i < end; i++) {
        let w = 1;
        if (fi && i < X) w = fi[i];
        if (fo && i >= tail) w *= fo[i - tail];
        y[ch.p + i] += S[ch.s + i] * w;
      }
    }
    return y;
  };
  // Loop point: the tail (from Nc) crossfades into the head, at the best-matching Nc
  const ym = render(fMix, rMix);
  let Nc = N;
  let bestR = -2;
  for (let L = N - LAG; L <= N + LAG; L += 3) {
    const r = corrAt(ym, L + mid, ym, mid, Wc, 4);
    if (r > bestR) {
      bestR = r;
      Nc = L;
    }
  }
  for (let L = Nc - 2, c0 = Nc; L <= c0 + 2; L++) {
    const r = corrAt(ym, L + mid, ym, mid, Wc, 1);
    if (L === c0 - 2) bestR = -2;
    if (r > bestR) {
      bestR = r;
      Nc = L;
    }
  }
  const closeR = corrAt(ym, Nc, ym, 0, X, 8);
  const fin = new Float32Array(X);
  const fout = new Float32Array(X);
  for (let i = 0; i < X; i++) [fin[i], fout[i]] = ionXfade(i / X, closeR);
  const close = (y: Float32Array): Float32Array => {
    const z = new Float32Array(Nc);
    for (let i = 0; i < Nc; i++) z[i] = y[i] * scale;
    for (let i = 0; i < X; i++) z[i] = (y[i] * fin[i] + y[Nc + i] * fout[i]) * scale;
    return z;
  };
  // Seam level repair: inside the crossfades, short dips (local cancellation of the two chunks)
  // more than 2 dB under the 0.4 s level are lifted back (≤ +8 dB, 20 ms-smoothed gain)
  const zm = close(ym);
  const sq2 = new Float32Array(Nc);
  for (let i = 0; i < Nc; i++) sq2[i] = zm[i] * zm[i];
  const eS = movingMeanCirc(sq2, Math.round(0.015 * sr));
  const eL = movingMeanCirc(sq2, Math.round(0.4 * sr));
  const inZone = new Uint8Array(Nc);
  for (const c of [{ p: 0 }, ...chunks.slice(1)]) for (let i = c.p; i < Math.min(Nc, c.p + X); i++) inZone[i] = 1;
  const g1 = new Float32Array(Nc).fill(1);
  const lim = Math.pow(10, -2 / 20);
  for (let i = 0; i < Nc; i++) {
    if (!inZone[i]) continue;
    const ratio = Math.sqrt(eL[i] / (eS[i] + 1e-20)) * lim;
    if (ratio > 1) g1[i] = Math.min(2.5, ratio);
  }
  const rep = movingMeanCirc(g1, Math.round(0.02 * sr));
  const channels: Partial<Record<IonStemId, Float32Array[]>> = {};
  for (const k of ids) {
    channels[k] = stems[k]!.map((c) => {
      const f = flat(c, a0);
      const z = close(render(f, rev(f)));
      for (let i = 0; i < Nc; i++) z[i] *= rep[i];
      return z;
    });
  }
  return {
    channels,
    length: Nc,
    xfade: X,
    seams: chunks.slice(1).map((c) => ({ out: c.p, src: c.s, rev: c.rev, r: c.r })),
    closeR,
  };
}

export interface IonLoopBuffers {
  buffers: IonStemBuffers;
  seconds: number;
  /** Crossfade length (samples). */
  xfade: number;
  seams: IonLoopSeam[];
  closeR: number;
}

/** Build every loop of a continuous role from the decoded segment stems. */
export function buildIonRoleLoops(ctx: BaseAudioContext, bufs: IonStemBuffers | undefined, spec: IonLoopSpec): IonLoopBuffers[] {
  if (!bufs) return [];
  const stems: Partial<Record<IonStemId, Float32Array[]>> = {};
  let sr = 0;
  for (const k of ION_STEM_IDS) {
    const b = bufs[k];
    if (!b) continue;
    sr = b.sampleRate;
    stems[k] = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  }
  if (!sr) return [];
  // Role power target = the whole clip's mean power (the old per-grain level target)
  const ids = Object.keys(stems) as IonStemId[];
  const len = Math.min(...ids.map((k) => stems[k]![0].length));
  const sum = new Float32Array(len);
  for (const k of ids) {
    const ch = stems[k]!;
    const w = 1 / ch.length;
    for (const c of ch) for (let i = 0; i < len; i++) sum[i] += c[i] * w;
  }
  let pw = 0;
  for (let i = 0; i < len; i++) pw += sum[i] * sum[i];
  pw /= Math.max(1, len);
  const out: IonLoopBuffers[] = [];
  for (const region of spec.regions) {
    const loop = buildIonLoop(stems, sr, region, spec, pw);
    if (!loop) continue;
    const buffers: IonStemBuffers = {};
    for (const k of ids) {
      const ch = loop.channels[k];
      if (!ch) continue;
      const b = ctx.createBuffer(ch.length, loop.length, sr);
      ch.forEach((x, c) => b.getChannelData(c).set(x));
      buffers[k] = b;
    }
    out.push({ buffers, seconds: loop.length / sr, xfade: loop.xfade, seams: loop.seams, closeR: loop.closeR });
  }
  return out;
}

/**
 * One continuous role: per stem, every loop of the role plays through one looping source,
 * all started together once (so the stems stay sample-aligned) and never restarted.
 */
export class IonLoopBank {
  readonly stemOut: Partial<Record<IonStemId, GainNode>> = {};
  readonly sources: AudioBufferSourceNode[] = [];
  /** Source starts so far (stays at the source count: nothing is ever restarted). */
  starts = 0;
  rate = 1;
  private stopped = false;

  constructor(ctx: BaseAudioContext, loops: IonLoopBuffers[], at: number) {
    for (const loop of loops) {
      for (const stem of ION_STEM_IDS) {
        const b = loop.buffers[stem];
        if (!b) continue;
        let out = this.stemOut[stem];
        if (!out) {
          out = ctx.createGain();
          this.stemOut[stem] = out;
        }
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = b.duration;
        src.connect(out);
        src.start(at);
        this.starts += 1;
        this.sources.push(src);
      }
    }
  }

  /** Glide every source to `rate` (one shared rate keeps the stems aligned). */
  setRate(r: number, now: number, tau: number): void {
    const rate = Math.min(ION_LOOP_MAX_RATE, Math.max(0.5, r));
    if (Math.abs(rate - this.rate) < 1e-5) return;
    this.rate = rate;
    for (const s of this.sources) {
      try {
        s.playbackRate.setTargetAtTime(rate, now, tau);
      } catch {
        /* stopped */
      }
    }
  }

  stop(at: number): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const s of this.sources) {
      try {
        s.stop(at);
      } catch {
        /* already stopped */
      }
    }
  }
}

/** Highest loop playback rate (≈ +5 semitones). */
export const ION_LOOP_MAX_RATE = Math.pow(2, 5 / 12);

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

/** Sustain pitch range (semitones, drive 0 → 1), shared by every stem so they stay aligned. */
export const ION_LOOP_SEMIS: readonly [number, number] = [-3.5, 3.5];

/**
 * Motion voicing (speed changes; there is no steering input): `glide` is the extra pitch on a pull
 * (semitones per unit accel, negative on a lift), the rate glide time constants (s) up / down,
 * the speed-slope that counts as a full pull (speed units / s; 0 → 100 mph in ≈8 s ≈ 0.1/s), its
 * deadband, and how fast the motion envelope rises / settles.
 */
export const ION_MOTION = {
  glideUp: 1.2,
  glideDown: -0.9,
  tauUp: 0.35,
  tauDown: 0.6,
  fullSlope: 0.07,
  deadband: 0.12,
  speedTau: 0.35,
  envUp: 0.3,
  envDown: 0.55,
} as const;

/** Rasp (tearing distortion) layer: cruise level and pull boost (dB re the sustain stems). */
export const ION_RASP = { cruiseDb: -17, pullDb: 7, drive: 5, hz: 2600 } as const;
/** Upper-band shimmer (flanger on scream + air) and the howl "twin" (detuned copy) — steady → maneuver. */
export const ION_SHIMMER = {
  baseSec: 0.0042,
  depthSec: [0.0011, 0.0024] as readonly [number, number],
  rateHz: [0.19, 0.55] as readonly [number, number],
  wet: [0.32, 0.5] as readonly [number, number],
} as const;
export const ION_TWIN_COPY = {
  baseSec: 0.009,
  depthSec: [0.0005, 0.0016] as readonly [number, number],
  rateHz: [0.37, 1.1] as readonly [number, number],
  wet: [0.07, 0.38] as readonly [number, number],
} as const;
/** Low-shelf lift on the roar (dB at full drive; corner Hz). */
export const ION_LOW_SHELF = { db: 1.5, hz: 115 } as const;
/** Howl stem lift (dB) — the ref6 howl is the voice's character. */
export const ION_STEM_HOWL_DB = 1.5;
const ION_STEM_HOWL_LIFT = Math.pow(10, ION_STEM_HOWL_DB / 20);

export interface IonStemDrive {
  speed: number;
  /** Effective throttle 0..1. */
  thr: number;
  /** Load 0..1 (filter, gain). */
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Modulated delay (LFO → delayTime) with a wet send; the dry path stays outside. */
interface IonModDelay {
  delay: DelayNode;
  lfo: OscillatorNode;
  depth: GainNode;
  wet: GainNode;
}
function modDelay(ctx: BaseAudioContext, input: AudioNode, dest: AudioNode, base: number, phase: number): IonModDelay {
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = base;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.3;
  const depth = ctx.createGain();
  depth.gain.value = 0;
  lfo.connect(depth);
  depth.connect(delay.delayTime);
  const wet = ctx.createGain();
  wet.gain.value = 0;
  input.connect(delay);
  delay.connect(wet);
  wet.connect(dest);
  lfo.start(ctx.currentTime + phase);
  return { delay, lfo, depth, wet };
}

export class IonStemBed {
  readonly out: GainNode;
  readonly sustainBank: IonLoopBank;
  readonly humBank: IonLoopBank;
  private readonly sus: { stem: IonStemId; g: GainNode; lp?: BiquadFilterNode }[] = [];
  private readonly hum: { stem: IonStemId; g: GainNode }[] = [];
  private readonly humLp: BiquadFilterNode;
  private readonly susNorm: number;
  private readonly humNorm: number;
  private readonly satIn: GainNode;
  private readonly satOut: GainNode;
  private readonly shelf: BiquadFilterNode;
  private readonly raspIn: GainNode;
  private readonly raspOut: GainNode;
  private readonly shimmer: IonModDelay;
  private readonly twin: IonModDelay;
  private lastNow = -1;
  private speedLag = -1;
  private motionEnv = 0;
  /** Last motion value (−1 lift … +1 pull) and rate target (diagnostics / tests). */
  motion = 0;
  rateTarget = 1;

  constructor(ctx: BaseAudioContext, set: IonStemSet, _seed = 1) {
    this.out = ctx.createGain();
    const at = ctx.currentTime;
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
    // Low shelf (rumble) after the saturation, on the roar only
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = 'lowshelf';
    this.shelf.frequency.value = ION_LOW_SHELF.hz;
    this.shelf.gain.value = 0;
    this.satOut.connect(this.shelf);
    this.shelf.connect(this.out);
    // Rasp: howl + scream → high-pass → asymmetric drive → presence band → shelf bus
    this.raspIn = ctx.createGain();
    this.raspIn.gain.value = ION_RASP.drive;
    const raspHp = ctx.createBiquadFilter();
    raspHp.type = 'highpass';
    raspHp.frequency.value = 650;
    raspHp.Q.value = 0.6;
    const rshaper = ctx.createWaveShaper();
    const rc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 3;
      rc[i] = (Math.tanh(x * 1.6 + 0.25) - Math.tanh(0.25)) / 1.6;
    }
    rshaper.curve = rc;
    rshaper.oversample = '2x';
    const raspBp = ctx.createBiquadFilter();
    raspBp.type = 'bandpass';
    raspBp.frequency.value = ION_RASP.hz;
    raspBp.Q.value = 0.7;
    const raspLp = ctx.createBiquadFilter();
    raspLp.type = 'lowpass';
    raspLp.frequency.value = 6500;
    raspLp.Q.value = 0.5;
    this.raspOut = ctx.createGain();
    this.raspOut.gain.value = 0;
    this.raspIn.connect(raspHp);
    raspHp.connect(rshaper);
    rshaper.connect(raspBp);
    raspBp.connect(raspLp);
    raspLp.connect(this.raspOut);
    this.raspOut.connect(this.shelf);
    // Upper band (scream + air): dry into the saturation, plus a slow flanger (shimmer)
    const upper = ctx.createGain();
    upper.connect(this.satIn);
    this.shimmer = modDelay(ctx, upper, this.satIn, ION_SHIMMER.baseSec, 0);
    // Howl: dry, plus a slightly detuned copy (modulated delay) — "twin engines" beating
    const howlBus = ctx.createGain();
    howlBus.connect(this.satIn);
    this.twin = modDelay(ctx, howlBus, this.satIn, ION_TWIN_COPY.baseSec, 0.7);

    this.susNorm = set.norm('sustain');
    this.humNorm = set.norm('hum');
    const susLoops = set.loops?.sustain ?? [];
    const humLoops = set.loops?.hum ?? [];
    this.sustainBank = new IonLoopBank(ctx, susLoops, at);
    this.humBank = new IonLoopBank(ctx, humLoops, at);
    for (const stem of ION_STEM_IDS) {
      const src = this.sustainBank.stemOut[stem];
      if (!src) continue;
      const g = ctx.createGain();
      g.gain.value = 0;
      let lp: BiquadFilterNode | undefined;
      if (stem === 'howl' || stem === 'scream') {
        lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.5;
        lp.frequency.value = 20000;
        src.connect(lp);
        lp.connect(g);
        g.connect(this.raspIn);
      } else {
        src.connect(g);
      }
      if (stem === 'howl') g.connect(howlBus);
      else if (stem === 'scream' || stem === 'air') g.connect(upper);
      else g.connect(this.satIn);
      this.sus.push({ stem, g, lp });
    }
    this.humLp = ctx.createBiquadFilter();
    this.humLp.type = 'lowpass';
    this.humLp.Q.value = 0.5;
    this.humLp.frequency.value = 900;
    this.humLp.connect(this.out);
    for (const stem of ION_STEM_IDS) {
      const src = this.humBank.stemOut[stem];
      if (!src) continue;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(this.humLp);
      this.hum.push({ stem, g });
    }
  }

  /** Source starts across both roles (constant once built: nothing is restarted). */
  sourceStarts(): number {
    return this.sustainBank.starts + this.humBank.starts;
  }

  update(now: number, d: IonStemDrive, tc = 0.12): void {
    const set = (p: AudioParam, v: number, t = tc) => {
      try {
        p.setTargetAtTime(v, now, t);
      } catch {
        p.value = v;
      }
    };
    const M = ION_MOTION;
    // Motion: slope of a lagged speed (GPS steps don't read as pulls), deadbanded, enveloped
    const dt = this.lastNow < 0 ? 0 : Math.min(0.25, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    const sp = clamp01(d.speed);
    if (this.speedLag < 0 || dt === 0) this.speedLag = sp;
    const prev = this.speedLag;
    if (dt > 0) this.speedLag += (sp - this.speedLag) * (1 - Math.exp(-dt / M.speedTau));
    const slope = dt > 0 ? (this.speedLag - prev) / dt : 0;
    let m = slope / M.fullSlope;
    m = Math.sign(m) * clamp01((Math.abs(m) - M.deadband) / (1 - M.deadband));
    if (dt > 0) {
      const tau = Math.abs(m) > Math.abs(this.motionEnv) ? M.envUp : M.envDown;
      this.motionEnv += (m - this.motionEnv) * (1 - Math.exp(-dt / tau));
    }
    const mo = Math.max(-1, Math.min(1, this.motionEnv));
    this.motion = mo;
    const acc = Math.max(0, mo);
    const dec = Math.max(0, -mo);
    const turn = Math.abs(mo);

    const drive = clamp01(0.7 * d.speed + 0.3 * d.thr);
    const load = clamp01(d.load);
    const [s0, s1] = ION_STEM_SAT.driveDb;
    const satLin = Math.pow(10, (s0 + (s1 - s0) * sstep(drive, 0.45, 1)) / 20);
    set(this.satIn.gain, satLin / ION_STEM_SAT.range);
    set(this.satOut.gain, ION_STEM_SAT.range);

    // Pitch: one smoothed rate (portamento: quicker up than down) for every sustain stem
    const [lo, hi] = ION_LOOP_SEMIS;
    const semis = lo + (hi - lo) * drive + acc * M.glideUp + dec * M.glideDown;
    const rate = Math.pow(2, Math.min(4.5, semis) / 12);
    const tau = rate >= this.rateTarget ? M.tauUp : M.tauDown;
    this.rateTarget = rate;
    this.sustainBank.setRate(rate, now, tau);

    const base = d.sustainGain * this.susNorm;
    for (const v of this.sus) {
      let shape = 1;
      if (v.stem === 'scream') {
        shape = ION_STEM_SCREAM_LIFT * (0.6 + 0.8 * sstep(d.thr, 0.2, 0.95)) * (1 + 0.7 * acc) * (1 - 0.45 * dec);
      } else if (v.stem === 'air') shape = (0.45 + 0.9 * sp) * (1 - 0.5 * dec);
      else if (v.stem === 'grit') shape = 0.7 + 2.4 * clamp01(d.surge) * d.surgeLayer + 0.5 * acc;
      else if (v.stem === 'howl') shape = ION_STEM_HOWL_LIFT * (1 + 0.35 * clamp01(d.surge) * d.surgeLayer) * (1 + 0.3 * dec);
      else if (v.stem === 'motor') shape = 0.95 + 0.1 * load;
      set(v.g.gain, base * shape * d.layer[v.stem]);
      if (v.lp) {
        const b = v.stem === 'howl' ? 1800 : 4500;
        const open = clamp01(0.35 + 0.65 * load + 0.3 * acc - 0.5 * dec);
        set(v.lp.frequency, b * Math.pow(20000 / b, open), acc > dec ? M.tauUp : M.tauDown);
      }
    }
    // Rasp: present at cruise, opens hard on a pull (gated with the sustain level)
    const raspDb = ION_RASP.cruiseDb + ION_RASP.pullDb * acc - 6 * dec;
    const raspAmt = d.sustainGain > 1e-4 ? sstep(drive, 0.15, 0.7) : 0;
    set(this.raspOut.gain, (raspAmt * Math.pow(10, raspDb / 20)) / ION_RASP.drive, acc > dec ? M.tauUp : M.tauDown);
    // Shimmer (upper band flanger) and the twin copy: deeper / faster while the speed changes
    const S = ION_SHIMMER;
    set(this.shimmer.depth.gain, lerp(S.depthSec[0], S.depthSec[1], turn), 0.4);
    set(this.shimmer.lfo.frequency, lerp(S.rateHz[0], S.rateHz[1], turn), 0.5);
    set(this.shimmer.wet.gain, lerp(S.wet[0], S.wet[1], turn), 0.4);
    const T = ION_TWIN_COPY;
    set(this.twin.depth.gain, lerp(T.depthSec[0], T.depthSec[1], turn), 0.4);
    set(this.twin.lfo.frequency, lerp(T.rateHz[0], T.rateHz[1], turn), 0.5);
    set(this.twin.wet.gain, lerp(T.wet[0], T.wet[1], turn), 0.4);
    // Rumble: low shelf in with drive
    set(this.shelf.gain, ION_LOW_SHELF.db * sstep(drive, 0.25, 0.85), 0.4);

    const hs = clamp01(d.speed * 3);
    set(this.humLp.frequency, 900 * Math.pow(20000 / 900, hs));
    this.humBank.setRate(Math.pow(2, (-0.5 + 1.5 * hs) / 12), now, 0.5);
    for (const v of this.hum) set(v.g.gain, d.humGain * this.humNorm * d.layer[v.stem]);
  }

  stop(at: number): void {
    this.sustainBank.stop(at);
    this.humBank.stop(at);
    for (const x of [this.shimmer, this.twin]) {
      try {
        x.lfo.stop(at);
      } catch {
        /* already stopped */
      }
    }
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
    [0.25, -6.7],
    [0.4, 5.9],
    [0.58, 12.0],
    [0.8, 11.05],
    [1, 12.3],
  ] as ReadonlyArray<readonly [number, number]>,
  humDb: -13.9,
  humFade: 1,
  /** The ref2 interior hum stays under the cruise roar at this level (dB re the sustain level). */
  humUnderDb: -18,
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
