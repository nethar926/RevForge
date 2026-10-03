/**
 * Pure helpers for the Sweep and Twin Dial gauges (no React, no DOM) so the
 * colour/contrast guarantees can be unit-tested in Node.
 *
 * Angles: CSS conic-gradient convention, 0° = 12 o'clock, clockwise positive.
 */

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export const clamp01 = (v: number) => clamp(v, 0, 1);

/* ------------------------------------------------------------------ */
/* Units + accessible text                                             */
/* ------------------------------------------------------------------ */

export type SpeedUnits = 'mph' | 'kph' | 'km/h';

export function unitShort(units: string): string {
  const u = units.toLowerCase();
  if (u === 'kph' || u === 'km/h' || u === 'kmh') return 'KM/H';
  if (u === 'mph') return 'MPH';
  return units.toUpperCase();
}

export function unitWords(units: string, n: number): string {
  const u = units.toLowerCase();
  const one = Math.round(n) === 1;
  if (u === 'kph' || u === 'km/h' || u === 'kmh') return one ? 'kilometer per hour' : 'kilometers per hour';
  if (u === 'mph') return one ? 'mile per hour' : 'miles per hour';
  return units;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

/** "Speed 42 miles per hour" (+ ", redline" when flagged). */
export function speedValueText(label: string, value: number, units: string, redline = false): string {
  return `${label} ${fmtInt(value)} ${unitWords(units, value)}${redline ? ', redline' : ''}`;
}

/** "RPM 3,200" (+ ", redline"). */
export function rpmValueText(rpm: number, redline = false): string {
  return `RPM ${fmtInt(rpm)}${redline ? ', redline' : ''}`;
}

export const defaultMaxSpeed = (unit: string) => (unitShort(unit) === 'KM/H' ? 260 : 160);
export const defaultMaxRpm = (redlineRpm: number) =>
  Math.max(1000, Math.ceil((Math.max(1, redlineRpm) * 1.12) / 1000) * 1000);

/* ------------------------------------------------------------------ */
/* Sweep geometry + gradient                                           */
/* ------------------------------------------------------------------ */

/** Sweep arc: ~10 o'clock-and-a-bit (left) over the top to the mirrored right. */
export const SWEEP_START = -105;
export const SWEEP_END = 105;
export const SWEEP_SPAN = SWEEP_END - SWEEP_START;
/** Max width of the cyan fade past the needle. */
export const SWEEP_FADE = 34;
/** Cyan fade never runs further than this past the arc end (keeps the readout sector static). */
export const SWEEP_FADE_OVERRUN = 6;

export function sweepAngle(value: number, max: number): number {
  const m = max > 0 ? max : 1;
  return SWEEP_START + clamp01(value / m) * SWEEP_SPAN;
}

export type SweepInk = 'light' | 'dark';

export const SWEEP_COLORS = {
  edge: '#19d3ff',
  past: '#1a6fe6',
  pastDeep: '#0f4fbf',
  filledStart: '#0c3d94',
  filledEnd: '#03133a',
} as const;

/**
 * Readout ("bottom") sector stops as [colour, degrees relative to SWEEP_START].
 * Static (they never rotate), so text contrast is a fixed property.
 *  - light ink: mid-blue as in the reference; white numerals.
 *  - dark ink: a brighter blue core so the reference's navy numerals pass
 *    4.5:1; short blends back to the arc colours at both ends.
 * `core` = the stops the numerals sit on (asserted ≥4.5:1 in tests).
 */
export const SWEEP_BOTTOM: Record<SweepInk, { stops: readonly (readonly [string, number])[]; core: readonly string[] }> = {
  light: {
    stops: [['#1257c9', 220], ['#0f4fbf', 269], ['#0d48b0', 318], ['#0c3d94', 360]],
    core: ['#1257c9', '#0f4fbf', '#0d48b0', '#0c3d94'],
  },
  dark: {
    stops: [['#2a78ea', 218], ['#3584f5', 226], ['#3584f5', 342], ['#0c3d94', 360]],
    core: ['#3584f5', '#3584f5'],
  },
};

export const SWEEP_INK: Record<SweepInk, string> = {
  light: '#ffffff',
  dark: '#031029',
};

/** Degrees (relative to SWEEP_START) where the readout sector colours are pinned. */
export const SWEEP_BOTTOM_FROM = 218;

/** Full conic-gradient for the sweep at needle angle `needleDeg` (absolute). */
export function sweepGradient(needleDeg: number, ink: SweepInk = 'light'): string {
  const n = clamp(needleDeg - SWEEP_START, 0, SWEEP_SPAN);
  const fadeEnd = n + Math.min(SWEEP_FADE, Math.max(SWEEP_FADE_OVERRUN, SWEEP_SPAN - n));
  const c = SWEEP_COLORS;
  const stops: string[] = [
    `${c.filledStart} 0deg`,
    `${c.filledEnd} ${n.toFixed(2)}deg`,
    `${c.edge} ${n.toFixed(2)}deg`,
    `${c.past} ${fadeEnd.toFixed(2)}deg`,
  ];
  if (fadeEnd < SWEEP_SPAN) stops.push(`${c.pastDeep} ${SWEEP_SPAN}deg`);
  for (const [col, d] of SWEEP_BOTTOM[ink].stops) stops.push(`${col} ${d}deg`);
  return `conic-gradient(from ${SWEEP_START}deg at 50% 50%, ${stops.join(', ')})`;
}

export interface SweepTick {
  deg: number;
  value: number;
  redline: boolean;
}

export function sweepTicks(max: number, redlineFrom?: number, step = 21): SweepTick[] {
  const out: SweepTick[] = [];
  for (let d = SWEEP_START; d <= SWEEP_END + 1e-6; d += step) {
    const value = ((d - SWEEP_START) / SWEEP_SPAN) * max;
    out.push({ deg: d, value, redline: redlineFrom != null && value >= redlineFrom - 1e-6 });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Twin Dial geometry + gradients                                      */
/* ------------------------------------------------------------------ */

export const DIAL_START = -135;
export const DIAL_SPAN = 270;

export function dialAngle(value: number, max: number): number {
  const m = max > 0 ? max : 1;
  return DIAL_START + clamp01(value / m) * DIAL_SPAN;
}

export const SPEED_DISC_STOPS = ['#19d3ff', '#2079f5', '#1257c8', '#0a3576', '#031634'] as const;

/** Speed disc: cyan at the needle's leading edge, deep navy trailing back to it. */
export function speedDiscGradient(needleDeg: number): string {
  const s = SPEED_DISC_STOPS;
  return `conic-gradient(from ${needleDeg.toFixed(2)}deg, ${s[0]} 0%, ${s[1]} 12%, ${s[2]} 45%, ${s[3]} 75%, ${s[4]} 100%)`;
}

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}
export function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  const k = clamp01(t);
  return toHex([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
}

/** 0 at ≤35% of redline, 1 at redline. */
export function rpmHeat(rpm: number, redlineRpm: number): number {
  const r = redlineRpm > 0 ? rpm / redlineRpm : 0;
  const t = clamp01((r - 0.35) / 0.65);
  return t * t * (3 - 2 * t);
}

/** RPM disc: cyan → blue ahead of the needle; trail warms from navy to red with RPM. */
export function rpmDiscGradient(needleDeg: number, heat: number): string {
  const trailMid = mix('#0a3576', '#8a2f45', heat);
  const trailEnd = mix('#031634', '#ef4146', heat);
  return `conic-gradient(from ${needleDeg.toFixed(2)}deg, #19d3ff 0%, #1f7cf5 18%, #1257c8 38%, #071c44 58%, ${trailMid} 82%, ${trailEnd} 100%)`;
}

/** Redline sector on the RPM disc rim, as a conic mask band (absolute degrees). */
export function redlineArc(redlineRpm: number, maxRpm: number): { from: number; to: number } {
  return { from: dialAngle(redlineRpm, maxRpm), to: DIAL_START + DIAL_SPAN };
}

/* ------------------------------------------------------------------ */
/* WCAG contrast                                                       */
/* ------------------------------------------------------------------ */

export function relLuminance(c: string): number {
  const [r, g, b] = hex(c).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Minimum contrast of `fg` against every interpolated point of a stop list. */
export function minContrastAlong(fg: string, stops: readonly string[], samples = 24): number {
  let min = Infinity;
  for (let i = 0; i < stops.length - 1; i++) {
    for (let s = 0; s <= samples; s++) {
      min = Math.min(min, contrast(fg, mix(stops[i], stops[i + 1], s / samples)));
    }
  }
  return min;
}
