/**
 * CJ MAP road label: the road the car is ON (or the closest named road), not the biggest road nearby (Wilson, Oct 18).
 * Pure (no maplibre, no DOM): CjLiveMap feeds it the named `transportation_name` features of the vector tiles it has
 * already loaded (querySourceFeatures, lon/lat GeoJSON) and the latest fix. No geocoding / lookup service, ever.
 *  - Distance: point-to-segment in local metres (equirectangular about the car; exact enough at < 100 m).
 *  - Radius: only roads within `radiusM` count (the caller scales it with the zoom: low-zoom tiles are simplified).
 *  - Tie (two roads within `tieM` of the best, e.g. at an intersection): the one whose segment runs along the heading.
 *  - Hysteresis: a different road must stay the best for `holdMs` (2 s) before the label switches, so it does not
 *    flicker at intersections; the shown road is dropped at once only when it is no longer within `radiusM * 1.5`.
 */
export interface RoadFeature { name: string; cls?: string; lines: [number, number][][] }
export interface RoadPick { name: string; distM: number }
export interface NearestRoadState { shown: RoadPick | null; pending: { name: string; since: number } | null }
export const NEAREST_ROAD_INIT: NearestRoadState = { shown: null, pending: null };
export const NEAREST_ROAD_HOLD_MS = 2000;
/** OpenMapTiles transportation_name classes a car is never on (rail, paths, ferries...). */
export const NOT_CAR_CLASSES: readonly string[] = ['rail', 'transit', 'ferry', 'aerialway', 'path', 'track', 'bridleway', 'pier', 'busway'];

const R = 6371008.8, RAD = Math.PI / 180;
/** Distance (m) from the car to segment a-b (lon/lat) and that segment's bearing (deg, 0..180, direction-free). */
function segDist(car: { lat: number; lon: number }, a: [number, number], b: [number, number]): { d: number; brg: number } {
  const kx = Math.cos(car.lat * RAD) * RAD * R, ky = RAD * R;
  const ax = (a[0] - car.lon) * kx, ay = (a[1] - car.lat) * ky, bx = (b[0] - car.lon) * kx, by = (b[1] - car.lat) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
  const d = Math.hypot(ax + t * dx, ay + t * dy);
  const brg = ((Math.atan2(dx, dy) / RAD) % 180 + 180) % 180;
  return { d, brg };
}
/** Smallest angle (deg) between a heading and a direction-free road bearing: 0..90. */
const axisDiff = (hdg: number, brg: number) => {
  const x = Math.abs((((hdg - brg) % 180) + 180) % 180);
  return Math.min(x, 180 - x);
};

/** The best named road for this instant (no hysteresis): nearest within radius; heading breaks near-ties. */
export function nearestRoad(roads: readonly RoadFeature[], car: { lat: number; lon: number }, heading: number | undefined, opts: { radiusM?: number; tieM?: number } = {}): RoadPick | null {
  const radiusM = opts.radiusM ?? 40, tieM = opts.tieM ?? 6;
  const best = new Map<string, { d: number; brg: number }>(); // per name (one road is many tile pieces)
  for (const r of roads) {
    const name = r.name.trim();
    if (!name || (r.cls && NOT_CAR_CLASSES.includes(r.cls))) continue;
    for (const ln of r.lines) {
      for (let i = 0; i + 1 < ln.length; i++) {
        const s = segDist(car, ln[i], ln[i + 1]);
        const p = best.get(name);
        if (!p || s.d < p.d) best.set(name, s);
      }
      if (ln.length === 1) {
        const s = segDist(car, ln[0], ln[0]);
        const p = best.get(name);
        if (!p || s.d < p.d) best.set(name, s);
      }
    }
  }
  const c = [...best.entries()].filter(([, s]) => s.d <= radiusM).sort((a, b) => a[1].d - b[1].d || a[0].localeCompare(b[0]));
  if (!c.length) return null;
  let pick = c[0];
  if (heading != null && Number.isFinite(heading)) {
    const ties = c.filter(([, s]) => s.d - c[0][1].d <= tieM);
    if (ties.length > 1) pick = ties.slice().sort((a, b) => axisDiff(heading, a[1].brg) - axisDiff(heading, b[1].brg) || a[1].d - b[1].d)[0];
  }
  return { name: pick[0], distM: pick[1].d };
}

/** One label update with hysteresis (see the header). `now` in ms. */
export function nearestRoadStep(st: NearestRoadState, roads: readonly RoadFeature[], car: { lat: number; lon: number } | null, heading: number | undefined, now: number, opts: { radiusM?: number; tieM?: number; holdMs?: number } = {}): NearestRoadState {
  if (!car) return st;
  const radiusM = opts.radiusM ?? 40, holdMs = opts.holdMs ?? NEAREST_ROAD_HOLD_MS;
  const cand = nearestRoad(roads, car, heading, { radiusM, tieM: opts.tieM });
  const cur = st.shown;
  if (!cur) return cand ? { shown: cand, pending: null } : st.pending ? { shown: null, pending: null } : st;
  // the shown road's own distance now (it may no longer be the best)
  const still = nearestRoad(roads.filter((r) => r.name.trim() === cur.name), car, undefined, { radiusM: radiusM * 1.5 });
  if (!still) return cand ? { shown: cand, pending: null } : { shown: null, pending: null }; // left it: switch at once
  if (!cand || cand.name === cur.name) return { shown: { name: cur.name, distM: still.distM }, pending: null };
  const pending = st.pending?.name === cand.name ? st.pending : { name: cand.name, since: now };
  if (now - pending.since >= holdMs) return { shown: cand, pending: null };
  return { shown: { name: cur.name, distM: still.distM }, pending };
}

/** Search radius (m) for a camera zoom: 40 m, wider at low zoom where tile geometry is simplified (~10 px). */
export function nearestRoadRadiusM(zoom: number, lat: number): number {
  const mPerPx = (78271.517 * Math.cos(lat * RAD)) / 2 ** zoom;
  return Math.max(40, Math.min(250, 10 * mPerPx));
}
