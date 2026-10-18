/**
 * RadialMenu logic (pure). Items sit clockwise from 12 o'clock, each owning an equal sector centred on it.
 * A drag from the hub selects the sector under the pointer once it leaves the dead zone; releasing inside the
 * dead zone (or on a disabled item) cancels.
 */
export const RADIAL_DEADZONE_PX = 24;

/** Sector index under (dx, dy) from the hub (screen y down), or -1 inside the dead zone / no items. */
export function radialIndex(dx: number, dy: number, count: number, deadzone = RADIAL_DEADZONE_PX): number {
  if (count <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return -1;
  if (Math.hypot(dx, dy) < deadzone) return -1;
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const sector = 360 / count;
  return Math.floor(((deg + sector / 2) % 360) / sector);
}
/** Item centre for index i of count on a ring of radius r (relative to the hub; screen y down). */
export function radialPosition(i: number, count: number, r: number): { x: number; y: number } {
  const a = ((count > 0 ? i / count : 0) * 2 * Math.PI);
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}
/** Roving focus: next enabled index in `dir`, wrapping; -1 when none is enabled. */
export function nextEnabled(i: number, dir: 1 | -1, enabled: readonly boolean[]): number {
  const n = enabled.length;
  for (let k = 1; k <= n; k++) {
    const j = (((i + dir * k) % n) + n) % n;
    if (enabled[j]) return j;
  }
  return -1;
}
