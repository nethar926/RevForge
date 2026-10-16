/**
 * CJ MATRIX MAP cell live map: pure helpers (no React, no DOM, no maplibre; node-testable). The renderer is
 * mounts/CjLiveMap.tsx; the style, status, zoom and heading helpers are Meghan's (skins/carrier-jet/map).
 *  - Fix easing: GPS in the car is ~1.1–1.4 Hz, so the shown position glides from the previous fix to the latest
 *    one over one fix interval (one interval behind, never extrapolated). Reduce Motion: jump per fix.
 *  - MAG / TRUE: GPS course is TRUE; MAG = TRUE − declination (east positive, WMM2025 at the current fix).
 *  - Street labels: the BUILD.md collision walk (corner labels, (i), own-ship, bug, the other label, 6px edge).
 */
import { magneticDeclinationDeg, trueToMagnetic } from '../../skins/carrier-jet/map/declination.ts';
import type { CjMapStatus } from '../../skins/carrier-jet/map/style.ts';
import type { MapView } from './mapView.ts';

export interface TimedFix { lat: number; lon: number; t: number }
/** Below this the map loop runs at most ~12 fps (rAF-capped, jumpTo only). */
export const CJ_MAP_FRAME_MS = 83;
/** A fix older than this (ms, receipt time) is not live: status GPS ACQ, own-ship hollow. */
export const CJ_GPS_LIVE_MS = 5000;
/** Further than this between fixes (m) = a teleport (resume, demo switch): jump, don't glide. */
const JUMP_M = 2000;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export function distM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371008.8, r = Math.PI / 180;
  const x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * R;
}
/** Push a new fix: the latest becomes `prev` (unless it was a teleport, then both are the new fix). */
export function pushFix(s: { prev?: TimedFix; last?: TimedFix }, f: TimedFix): { prev?: TimedFix; last: TimedFix } {
  if (!s.last || distM(s.last, f) > JUMP_M) return { prev: undefined, last: f };
  return { prev: s.last, last: f };
}
/** Shown position at `now`: prev → last over one fix interval (≥ 300 ms); reduced = the latest fix. `k` 1 = settled. */
export function easedPosition(s: { prev?: TimedFix; last?: TimedFix }, now: number, reduced: boolean): { lat: number; lon: number; k: number } | null {
  const b = s.last;
  if (!b) return null;
  const a = s.prev;
  if (reduced || !a) return { lat: b.lat, lon: b.lon, k: 1 };
  const k = Math.max(0, Math.min(1, (now - b.t) / Math.max(300, b.t - a.t)));
  return { lat: lerp(a.lat, b.lat, k), lon: lerp(a.lon, b.lon, k), k };
}

/** TRUE and MAG for a TRUE heading at a position (null position: TRUE only). Declination is never hard-coded. */
export function headingPair(trueHdg: number, pos: { lat: number; lon: number } | null, date = new Date()): { t: number; m: number | null; decl: number | null } {
  if (!pos) return { t: trueHdg, m: null, decl: null };
  const decl = magneticDeclinationDeg(pos.lat, pos.lon, 0, date);
  return { t: trueHdg, m: trueToMagnetic(trueHdg, decl), decl };
}
const d3 = (d: number) => String(Math.round(((d % 360) + 360) % 360) % 360).padStart(3, '0');
/** VoiceOver: "heading 047 magnetic, 040 true" (lead first); no position → "heading 040 true". */
export function headingSpeech(p: { t: number; m: number | null }, lead: 'M' | 'T'): string {
  if (p.m == null) return `heading ${d3(p.t)} true`;
  return lead === 'M' ? `heading ${d3(p.m)} magnetic, ${d3(p.t)} true` : `heading ${d3(p.t)} true, ${d3(p.m)} magnetic`;
}

/** Map cell aria-label: mode (orientation + MAP / TERRAIN), range, status, heading. */
export function mapAria(v: Pick<MapView, 'northUp' | 'zoom' | 'mode'>, status: CjMapStatus, heading: string | null): string {
  const st = status === '' ? 'live' : status === 'GPS ACQ' ? 'acquiring GPS' : status === 'NO TILES' ? 'no tiles, offline' : status.toLowerCase();
  return `Map, ${v.northUp ? 'north up' : 'track up'}, ${v.mode === 'terr' ? 'terrain' : 'map'}, ${v.zoom} ${v.zoom === 1 ? 'mile' : 'miles'} range, ${st}${heading ? `, ${heading}` : ''}`;
}

/** MapLibre `error` event → tile state. 'network': offline / fetch failed; 'error': style / source error; null: ignore (a missing tile). */
export function classifyMapError(e: { error?: { status?: number; message?: string } | null; tile?: unknown; sourceId?: string }, online: boolean): 'network' | 'error' | null {
  if (!online) return 'network';
  const st = e.error?.status;
  const msg = e.error?.message ?? '';
  if (st === 0 || /failed to fetch|networkerror|network error|load failed/i.test(msg)) return 'network';
  if (e.tile && (st === 404 || st === 204)) return null; // tile not in the set (ocean / edge): not an outage
  return 'error';
}

/** Own-ship screen point in the cell: centre (N-UP) or the lower third (TRK-UP, padding top = h * 0.34). */
export const TRK_PAD = 0.34;
export function ownShip(w: number, h: number, northUp: boolean): { x: number; y: number } {
  return { x: w / 2, y: northUp ? h / 2 : (h * TRK_PAD + h) / 2 };
}
/** Heading bug on the cell edge (inset `m`): TRK-UP top centre; N-UP where the heading ray leaves the cell. */
export function bugPoint(w: number, h: number, northUp: boolean, hdg: number, m = 5): { x: number; y: number; rot: number } {
  const o = ownShip(w, h, northUp);
  if (!northUp) return { x: o.x, y: m, rot: 0 };
  const a = (hdg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const tx = dx > 0 ? (w - m - o.x) / dx : dx < 0 ? (m - o.x) / dx : Infinity;
  const ty = dy > 0 ? (h - m - o.y) / dy : dy < 0 ? (m - o.y) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: o.x + dx * t, y: o.y + dy * t, rot: hdg };
}

export interface Rect { x: number; y: number; w: number; h: number }
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export interface RoadCand { name: string; pts: { x: number; y: number }[] }
export interface PlacedLabel extends Rect { name: string }
/**
 * ≤ max street labels. Roads by distance to own-ship; for each, the nearest candidate point whose label rect
 * (centred on it) clears every obstacle, the already placed labels and the 6px edge; else the road is dropped.
 */
export function placeLabels(roads: RoadCand[], o: { x: number; y: number }, cell: { w: number; h: number }, obstacles: Rect[], measure: (s: string) => number, max = 2, lineH = 13): PlacedLabel[] {
  const EDGE = 6;
  const d = (p: { x: number; y: number }) => Math.hypot(p.x - o.x, p.y - o.y);
  const byName = new Map<string, { x: number; y: number }[]>();
  for (const r of roads) {
    const n = r.name.trim().toUpperCase();
    if (!n) continue;
    byName.set(n, [...(byName.get(n) ?? []), ...r.pts]);
  }
  const order = [...byName.entries()].map(([name, pts]) => ({ name, pts: pts.slice().sort((a, b) => d(a) - d(b)) })).filter((r) => r.pts.length).sort((a, b) => d(a.pts[0]) - d(b.pts[0]));
  const out: PlacedLabel[] = [];
  for (const r of order) {
    if (out.length >= max) break;
    const w = Math.ceil(measure(r.name)) + 4; // + 2px halo each side
    const hh = lineH + 4;
    for (const p of r.pts) {
      const rect = { x: p.x - w / 2, y: p.y - hh / 2, w, h: hh };
      if (rect.x < EDGE || rect.y < EDGE || rect.x + w > cell.w - EDGE || rect.y + hh > cell.h - EDGE) continue;
      if (obstacles.some((b) => hit(rect, b)) || out.some((b) => hit(rect, b))) continue;
      out.push({ ...rect, name: r.name });
      break;
    }
  }
  return out;
}
/** Densify a projected polyline so a label can sit between sparse vertices (every `step` px). */
export function densify(pts: { x: number; y: number }[], step = 16): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    const n = pts[i + 1];
    if (!n) break;
    const L = Math.hypot(n.x - pts[i].x, n.y - pts[i].y);
    for (let s = step; s < L; s += step) out.push({ x: lerp(pts[i].x, n.x, s / L), y: lerp(pts[i].y, n.y, s / L) });
  }
  return out;
}
