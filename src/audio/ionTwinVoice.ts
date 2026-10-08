/**
 * Twin Ion voice helpers (EngineSynthImpl.buildScifi / applyScifiDriving). 100 % procedural:
 * every constant below is a synthesis parameter (pitch, formant centre, rate, time) set by
 * listening + spectral analysis — no recorded audio, wavetable or convolution IR is used.
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
  { hz: 363, q: 7.0 },
  { hz: 501, q: 3.8 },
  { hz: 814, q: 4.8 },
  { hz: 1117, q: 4.5 },
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
  [0.35, 3.3],
  [1, 0.1],
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

/**
 * Interior hum (idle bed): faint 55 Hz core + dark noise through a low resonance into a
 * negative-feedback comb (clusters every ≈10 Hz around 45–80 Hz), darkened by an idle low-pass
 * that opens with speed / throttle.
 */
export const ION_HUM = {
  tone: 0.1,
  poleHz: 60,
  poleQ: 1.3,
  combSec: 0.099,
  combFb: -0.62,
  bed: 1.5,
  idleLpHz: 100,
  idleMakeupDb: 9,
  hiss: 0.002,
  wanderHz: 0.83,
  wander: 0.3,
} as const;

/** 0 parked → 1 by ≈15 % rpm or light throttle: how far the voice has opened out of the idle bed. */
export function ionIdleOpen(rpmNorm: number, thr: number): number {
  return Math.min(1, Math.max(0, rpmNorm * 6.5 + thr * 1.6));
}

/** Idle low-pass cutoff (Hz) for an idle-open amount (0 parked → 1 open): idleLpHz → 20 kHz. */
export function ionIdleLpHz(open: number): number {
  return ION_HUM.idleLpHz * Math.pow(20000 / ION_HUM.idleLpHz, Math.min(1, Math.max(0, open)));
}

/** Parked-idle makeup (linear): the dark hum bed carries the idle loudness on its own. */
export function ionIdleMakeup(open: number): number {
  return Math.pow(10, (ION_HUM.idleMakeupDb * (1 - Math.min(1, Math.max(0, open)))) / 20);
}

/** Idle-open glide (s): opening out of the parked bed / settling back into it. */
export const ION_IDLE_OPEN_TAU = { up: 0.45, down: 0.8 } as const;

/**
 * Sustain voicing EQ (on the voice bus, scaled in by how far the voice has opened out of idle):
 * the cruise howl's formant set ≈412 / 573 / 720 / 913 / 1258 Hz, a leaner 80–320 Hz motor
 * region and a band-limited top. [type, Hz, Q, dB at full open].
 */
export const ION_SUSTAIN_EQ: ReadonlyArray<readonly [BiquadFilterType, number, number, number]> = [
  ['peaking', 110, 0.9, 1.9],
  ['peaking', 220, 1.1, -16.8],
  ['peaking', 412, 4, 2.6],
  ['peaking', 573, 3.5, -1.8],
  ['peaking', 720, 4, 8.8],
  ['peaking', 913, 3.5, -6.6],
  ['peaking', 1258, 3, -0.7],
  ['peaking', 2600, 0.8, -5.8],
];
/** Top cut of the open voice (Hz): the refs are band-limited under ≈7 kHz. */
export const ION_SUSTAIN_TOP_HZ = 5800;

/**
 * Initial acceleration (pulling away from rest): the voice's throttle drive is capped along an
 * eased ≈2.7 s swell (from capFloor) with a level swell (swellDb at the start) and a motor-hum
 * bump mid-phrase; when the swell completes the cap is gone and the live sustain carries on.
 */
export const ION_ACCEL = {
  fromSpeed: 0.08,
  swellSec: 2.75,
  capFloor: 0.08,
  swellDb: -18,
  motorBoost: 3,
  bodyLiftHz: 90,
} as const;
/** Pull-away voicing on top of the sustain EQ (dB per ION_SUSTAIN_EQ band, × phrase activity), fitted
 *  to ref1 0.5–4 s: the first band glides up to lowHz, the 2.6 kHz presence and the top cut come down
 *  (the pull-away has less air than the settled sustain). */
export const ION_ACCEL_EQ = {
  db: [-1.9, 0.4, -1.7, 1.6, 0.7, 0.2, -1.0, -3.2] as readonly number[],
  lowHz: 130,
  topHz: 3606,
};
