/**
 * Wilson's wing-sweep art (wilson-plane-2026-10-29, pivot A).
 * Shared frame: viewBox -80 -4 160 144, 1 unit = 10 PSD px, x = 0 centreline, y = 0 nose tip.
 * Layer order, bottom to top: wings, fuselage, horizontal stabilizers + canopy.
 * Right wing is drawn at the 20° spread. Sweep s:
 *   right  rotate(s − 20, 28.74, 74.73)
 *   left   rotate(20 − s, −28.74, 74.73) scale(−1, 1)
 * The gauge and the map marker read the same s (the skin's live wing-sweep angle).
 */

/** Right glove pivot. Left is the mirror. */
export const PIVOT_R = { x: 28.74, y: 74.73 } as const;
export const PIVOT_L = { x: -28.74, y: 74.73 } as const;

/** Right wing, drawn at 20°. */
export const WING_R =
  'M7 75.7 L7 91.1 L17.7 96.9 L71.7 102 L69.6 95.8 L68.3 93.2 L66.2 90.8 L63.3 89 L17.7 72.7 L16 72.4 L14 72.4 L11.9 72.8 L9.3 73.9 Z';
/** Fixed fuselage (layer 2, hides the wing roots). */
export const BODY =
  'M0 0 L0.4 0 L1.3 0.8 L2.3 2.8 L3.5 7.2 L4.5 13.2 L5.1 18.9 L5.7 29.9 L5.7 45.5 L6.4 45.5 L6.4 42.9 L6.9 42.4 L11.7 42.5 L12 42.9 L12 45.5 L13.2 45.6 L15.6 51.8 L23.3 62 L20.9 62.8 L23.3 73.8 L22.7 81.4 L21.2 82.9 L21.2 85.4 L16.9 94.2 L17.8 101.4 L18.1 107.1 L18 118.4 L16.9 128 L16.2 128.1 L15.9 130.1 L7.9 130.1 L7.6 128.1 L6.8 128 L6.4 126.1 L5.4 131.3 L2.7 131.5 L2.7 134.6 L2.1 135.4 L1.7 135.6 L0 135.6 L-1.7 135.6 L-2.1 135.4 L-2.7 134.6 L-2.7 131.5 L-5.4 131.3 L-6.4 126.1 L-6.8 128 L-7.6 128.1 L-7.9 130.1 L-15.9 130.1 L-16.2 128.1 L-16.9 128 L-18 118.4 L-18.1 107.1 L-17.8 101.4 L-16.9 94.2 L-21.2 85.4 L-21.2 82.9 L-22.7 81.4 L-23.3 73.8 L-20.9 62.8 L-23.3 62 L-15.6 51.8 L-13.2 45.6 L-12 45.5 L-12 42.9 L-11.7 42.5 L-6.9 42.4 L-6.4 42.9 L-6.4 45.5 L-5.7 45.5 L-5.7 29.9 L-5.1 18.9 L-4.5 13.2 L-3.5 7.2 L-2.3 2.8 L-1.3 0.8 L-0.4 0 Z';
export const TAIL_L =
  'M-15.4 101.3 L-15.4 123 L-15.1 123.1 L-15.4 123.8 L-15.4 126.5 L-16.6 126.6 L-19.6 133.5 L-34.7 136.3 L-36.7 134.6 L-37.4 133.3 L-37.6 131.7 L-36.9 129.7 Z';
export const TAIL_R =
  'M15.4 101.3 L15.4 123 L15.1 123.1 L15.4 123.8 L15.4 126.5 L16.6 126.6 L19.6 133.5 L34.7 136.3 L36.7 134.6 L37.4 133.3 L37.6 131.7 L36.9 129.7 Z';
export const CANOPY_A = 'M-3.4 38.5 L-3.4 41.7 L-3.1 46.5 L-2.1 52.6 L2.1 52.6 L2.6 50.4 L3.1 46.5 L3.4 41.7 L3.4 38.5 Z';
export const CANOPY_B = 'M-0.3 20 L-1 20.7 L-1.6 22 L-2.6 26.1 L-3.3 32.5 L-3.4 38.1 L3.4 38.1 L3.4 34.8 L3.1 30 L2.3 24.5 L1.6 22 L1 20.7 L0.3 20 Z';

/** Spread and full in-flight sweep. 75 is the parked oversweep. */
export const SWEEP_SPREAD = 20;
export const SWEEP_FULL = 68;
export const SWEEP_PARKED = 75;

/**
 * Wide scale arc from the approved sheet. It is centred on the jet centreline (x = 0), above the
 * glove pivots, and wraps under both wings. Angles are degrees clockwise from +x (y down).
 * The right segment carries 20 / 45 / 68. The left segment is its mirror and carries 75.
 * Measured off the sheet: centre near the nose, radius outside the 20° wing tip.
 */
export const ARC_C = { x: 0, y: 48 } as const;
export const ARC_R = 97;
export const ARC_RIGHT = { a0: 27, a1: 63 } as const;
export const ARC_LEFT = { a0: 180 - ARC_RIGHT.a1, a1: 180 - ARC_RIGHT.a0 } as const;
/** Label angles. 75 sits at the lower end of the left arc; the others are on the right arc. */
export const ARC_LABELS = [
  { deg: 28.6, text: '20', faint: false },
  { deg: 44.4, text: '45', faint: false },
  { deg: 59.0, text: '68', faint: false },
  { deg: 116.6, text: '75', faint: true },
] as const;
/** Unlabeled ticks on the left arc: the mirrors of 20 and 45. 75 is the labeled lower end. */
export const ARC_MIRROR_TICKS = [180 - 28.6, 180 - 44.4] as const;

/** Nose y = 0, tail y. The jet is this tall in the shared art frame. */
export const JET_H = 136;
const PAD_TOP = 8;

/**
 * Gauge viewBox. x = 0 is the centre of the box, so the jet centreline is the face centre.
 * On a normal cell the jet is 70% of the face height and the degree readout sits in the well under the tail.
 * On a short cell the readout sits beside the jet, so the well is only deep enough for the arc labels.
 * `aspect` is the art box width / height. The box is never narrower than the arc labels.
 */
export function gaugeFrame(aspect: number, short: boolean): { x: number; y: number; w: number; h: number } {
  const h = short ? JET_H + PAD_TOP + 18 : JET_H / 0.7;
  const y = -PAD_TOP;
  const a = aspect > 0.25 ? aspect : 1;
  const w = Math.max(h * a, 230);
  return { x: -w / 2, y, w, h };
}
/** Marker frame from the approved 32 px sheet (square, centre on the fuselage). */
export const MARKER_VB = { x: -75, y: -7, w: 150, h: 150 } as const;
/** Centre of MARKER_VB, the rotation origin (nose up at 0°). */
export const MARKER_CENTER = { x: 0, y: MARKER_VB.y + MARKER_VB.h / 2 } as const;

/** Map marker edge length. Short map cells use 24 px; the sheet's marker is 32. */
export function markerPx(cellH: number): number {
  return cellH > 0 && cellH < 160 ? 24 : 32;
}

const n2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * SVG transform for one wing at sweep `s` degrees.
 * Right wing rotates about the right glove pivot; left is the mirrored path rotated the other way.
 */
export function wingTransform(sweep: number, side: 'r' | 'l'): string {
  const s = Number.isFinite(sweep) ? sweep : SWEEP_SPREAD;
  if (side === 'r') return `rotate(${n2(s - SWEEP_SPREAD)} ${PIVOT_R.x} ${PIVOT_R.y})`;
  return `rotate(${n2(SWEEP_SPREAD - s)} ${PIVOT_L.x} ${PIVOT_L.y}) scale(-1 1)`;
}

/** Point on the scale arc. `deg` is clockwise from +x (y down). */
export function dialPoint(deg: number, r: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: ARC_C.x + r * Math.cos(t), y: ARC_C.y + r * Math.sin(t) };
}

/** Arc from a0 to a1 (clockwise, y down), centred on the scale arc. */
export function dialArc(a0: number, a1: number, r: number): string {
  const p0 = dialPoint(a0, r);
  const p1 = dialPoint(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${n2(p0.x)} ${n2(p0.y)} A${n2(r)} ${n2(r)} 0 ${large} 1 ${n2(p1.x)} ${n2(p1.y)}`;
}

/** Label radius. The numeral sits outside the stroke, and grows with the type so an 11px label still clears it. */
export function arcLabelR(fs: number): number {
  return ARC_R + Math.max(8, fs * 0.55);
}

/**
 * Last good GPS course. coords.heading is null or NaN when the car is stopped; hold the previous
 * finite value. Compass and motion-sensor headings are not inputs.
 */
export function holdGpsHeading(prev: number | null, heading: number | null): number | null {
  if (typeof heading === 'number' && Number.isFinite(heading)) {
    const n = ((heading % 360) + 360) % 360;
    return n === 360 ? 0 : n;
  }
  return prev;
}

/** Spoken meter value. Parked adds the oversweep. The scale's 75 tick stays drawn either way. */
export function wingSweepLabel(deg: number, parked: boolean): string {
  const n = Math.round(deg);
  return parked ? `Wing sweep ${n} degrees, parked oversweep` : `Wing sweep ${n} degrees`;
}
