/**
 * Twin Ion voice helpers (EngineSynthImpl.buildScifi / applyScifiDriving). 100 % procedural:
 * every constant below is a synthesis parameter (pitch, formant centre, rate, time) set by
 * listening + spectral analysis — no recorded audio, wavetable or impulse response is used.
 * See docs/ion-twin-closer-match.md for the cue sheet behind these numbers.
 */
import { clamp, lerp } from './utils';

/**
 * Soft-clip curve for the Twin Ion shapers. Odd length, so a silent input maps to exactly 0:
 * the shared makeShaper() curve (even length) maps 0 → a small negative value, which rode the
 * howl/scream gain moves as a DC offset (sub-audible thumps + wasted limiter headroom).
 */
export function ionShaper(amount: number): Float32Array<ArrayBuffer> {
  const n = 257;
  const curve = new Float32Array(n);
  const k = Math.max(0.001, amount * 40);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve as Float32Array<ArrayBuffer>;
}

/** Shaper drive quantised to 1/40 steps — only re-write a curve when the step changes. */
export function ionShaperStep(drive: number): number {
  return Math.round(clamp(drive) * 40) / 40;
}

/** Shaper drive scale (drive 0..1 × this × 40 = curve k) and the make-up gain that keeps level. */
export const ION_HOWL_SAT = 0.08;
export const ION_HOWL_MAKEUP = 2.4;
export const ION_SCREAM_SAT = 0.1;
export const ION_SCREAM_MAKEUP = 2.2;

/** Formant bank (Hz, Q) for the howl at shift 1: ~420 / 575 / 900 / 1300 (cue sheet §2). */
export const ION_HOWL_FORMANTS = [
  { hz: 420, q: 7.0 },
  { hz: 575, q: 4.2 },
  { hz: 900, q: 5.0 },
  { hz: 1300, q: 5.2 },
] as const;

/** Scream accent stack (Hz, Q): ~255 / 1260 / 1500 (cue sheet §3). */
export const ION_SCREAM_FORMANTS = [
  { hz: 480, q: 7.0 },
  { hz: 1260, q: 9.0 },
  { hz: 1500, q: 8.0 },
] as const;

/**
 * Twin-howl voice spectrum: a saw-like 1/n harmonic series with the fundamental removed and
 * the 2nd harmonic softened — a synthetic recipe, so the formant bank picks thin partial lines
 * out of it without a drone at f0 under the bellow.
 */
export function ionHowlWave(ctx: BaseAudioContext, harmonics = 32): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 2; n <= harmonics; n++) imag[n] = (n === 2 ? 0.3 : 1) / n;
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Twin howl voice: vibrato (Hz) shared with the scream flutter AM, slow pitch drift (Hz). */
export const ION_VIBRATO_HZ = 5.7;
export const ION_DRIFT_HZ = 0.23;

/**
 * Pitched twin-howl fundamental (Hz). Glides up with spool (150 → 240 Hz), lifts on surge
 * gestures and sags when the throttle is released (the pass-by droop of the refs).
 */
export function ionHowlF0(spool: number, thr: number, surge: number, lift: number, reverse = false): number {
  const f0 = lerp(150, 240, clamp(spool)) * (1 + clamp(thr) * 0.05) * (1 + clamp(surge, 0, 1.2) * 0.16);
  return f0 * (1 - clamp(lift) * 0.14) * (reverse ? 0.92 : 1);
}

/** Twin motor carrier: fundamental, soft 2nd (−14 dB) and a trace of 3rd — a rounded pole. */
export function ionMotorWave(ctx: BaseAudioContext): PeriodicWave {
  const real = new Float32Array([0, 0, 0, 0]);
  const imag = new Float32Array([0, 1, 0.2, 0.05]);
  return ctx.createPeriodicWave(real, imag);
}

/**
 * Output trim (dB) vs smoothed throttle: keeps integrated loudness on the pre-voicing reference
 * at idle (thr 0), cruise (≈0.35) and full (1). Piecewise-linear between those anchors.
 */
export const ION_TRIM_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1.4],
  [0.35, 0.75],
  [1, -0.4],
];
export function ionLevelTrimDb(thr: number): number {
  const t = Math.min(1, Math.max(0, thr));
  const a = ION_TRIM_ANCHORS;
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i][0]) {
      const [x0, y0] = a[i - 1];
      const [x1, y1] = a[i];
      return y0 + ((t - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return a[a.length - 1][1];
}
