/**
 * Carrier Jet v2 MAP cell view state (framework; pure store, persisted). RADAR (the bat toggle on the GPS+RADAR plate)
 * lays the round radar scope over the live map (dimmed, heading-up; mock, Wilson Oct 16); the MAP edge keys follow it:
 *   RADAR off: ZM+ / ZM− (live map range 1 · 2 · 5 · 10 mi) · N/TRK-UP (north-up ↔ track-up) · MAP/TERR (4th key:
 *              the live map's hillshade off ↔ on; the same `mode` the radar's MODE key sets)
 *   RADAR on:  RNG+ / RNG− (scope range 2 · 5 · 10 mi) · MODE (MAP ↔ TERR returns)
 * All of it is a view change, so it works while driving. Default: radar off, 5 mi, MAP returns, north-up.
 */
import { storageKey } from '../../lib/storageKey.ts';
import type { KV } from '../abArmed.ts';

export const RANGES = [2, 5, 10] as const;
export type RangeMi = (typeof RANGES)[number];
/** Live map ranges (cell half-height in mi; zoomForRangeMi). */
export const MAP_ZOOMS = [1, 2, 5, 10] as const;
export type ZoomMi = (typeof MAP_ZOOMS)[number];
export interface MapView {
  radar: boolean;
  /** Radar scope range (mi). */
  range: RangeMi;
  /** Radar returns: roads (MAP) or terrain contours (TERR). Live map: TERR = hillshade on, MAP = off. */
  mode: 'map' | 'terr';
  /** HSD map scale (mi across the half-cell). */
  zoom: ZoomMi;
  northUp: boolean;
}
export const MAP_VIEW_DEFAULT: MapView = { radar: false, range: 5, mode: 'map', zoom: 5, northUp: true };
export const MAP_VIEW_KEY = 'revforge.pack.carrier-jet.mapView';

const isRange = (v: unknown): v is RangeMi => v === 2 || v === 5 || v === 10;
const isZoom = (v: unknown): v is ZoomMi => v === 1 || isRange(v);
export function parseMapView(raw: string | null): MapView {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<MapView>) : {};
    return {
      // round 3: RADAR is OFF on every load / cold start (never restored); MX / WX only by the switch or QUICK START
      radar: false,
      range: isRange(o.range) ? o.range : MAP_VIEW_DEFAULT.range,
      mode: o.mode === 'terr' ? 'terr' : 'map',
      zoom: isZoom(o.zoom) ? o.zoom : MAP_VIEW_DEFAULT.zoom,
      northUp: o.northUp !== false,
    };
  } catch {
    return { ...MAP_VIEW_DEFAULT };
  }
}

/** Step 2 ↔ 5 ↔ 10 (clamped). */
export const stepRange = (r: RangeMi, dir: 1 | -1): RangeMi => RANGES[Math.max(0, Math.min(RANGES.length - 1, RANGES.indexOf(r) + dir))];

/** Step 1 ↔ 2 ↔ 5 ↔ 10 (clamped). */
export const stepZoom = (z: ZoomMi, dir: 1 | -1): ZoomMi => MAP_ZOOMS[Math.max(0, Math.min(MAP_ZOOMS.length - 1, MAP_ZOOMS.indexOf(z) + dir))];

export type MapKeyId = 'zoomIn' | 'zoomOut' | 'orient' | 'rngUp' | 'rngDown' | 'mode';
export interface MapKey { id: MapKeyId; legend: string; ariaLabel: string; disabledReason?: string }

/** The MAP cell's edge keys for the current view (never dead: an end-stop key says why). */
export function mapKeys(v: MapView): MapKey[] {
  if (v.radar) {
    return [
      { id: 'rngUp', legend: 'RNG+', ariaLabel: `Radar range up, ${v.range} miles`, disabledReason: v.range === 10 ? 'Already at 10 miles' : undefined },
      { id: 'rngDown', legend: 'RNG−', ariaLabel: `Radar range down, ${v.range} miles`, disabledReason: v.range === 2 ? 'Already at 2 miles' : undefined },
      { id: 'mode', legend: 'MODE', ariaLabel: `Radar mode ${v.mode === 'map' ? 'map' : 'terrain'}, switch to ${v.mode === 'map' ? 'terrain' : 'map'}` },
    ];
  }
  return [
    // ZM+ zooms in = smaller scale
    { id: 'zoomIn', legend: 'ZM+', ariaLabel: `Zoom in, ${v.zoom} ${v.zoom === 1 ? 'mile' : 'miles'}`, disabledReason: v.zoom === 1 ? 'Already at 1 mile' : undefined },
    { id: 'zoomOut', legend: 'ZM−', ariaLabel: `Zoom out, ${v.zoom} miles`, disabledReason: v.zoom === 10 ? 'Already at 10 miles' : undefined },
    { id: 'orient', legend: 'N/TRK-UP', ariaLabel: v.northUp ? 'North up, switch to track up' : 'Track up, switch to north up' },
    { id: 'mode', legend: 'TERRAIN', ariaLabel: v.mode === 'terr' ? 'Terrain on, switch to map' : 'Map, switch to terrain' },
  ];
}

/** Apply a MAP key. */
export function applyMapKey(v: MapView, id: MapKeyId): MapView {
  switch (id) {
    case 'zoomIn': return { ...v, zoom: stepZoom(v.zoom, -1) };
    case 'zoomOut': return { ...v, zoom: stepZoom(v.zoom, 1) };
    case 'orient': return { ...v, northUp: !v.northUp };
    case 'rngUp': return { ...v, range: stepRange(v.range, 1) };
    case 'rngDown': return { ...v, range: stepRange(v.range, -1) };
    case 'mode': return { ...v, mode: v.mode === 'map' ? 'terr' : 'map' };
  }
}

/** Range rings drawn for a scope range: 2 / 5 / 10 mi, those within range, as fractions of the scope radius. */
export function rangeRings(range: RangeMi): { mi: number; r: number }[] {
  return RANGES.filter((m) => m <= range).map((m) => ({ mi: m, r: m / range }));
}

/** Sweep angle (deg, clockwise from 12 o'clock) at time t (ms): ~4 s a revolution. Reduce Motion: fixed at 0. */
export const SWEEP_PERIOD_MS = 4000;
export const sweepAngle = (t: number, reduced: boolean) => (reduced ? 0 : ((t % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360);

// ---- store
const local = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const listeners = new Set<() => void>();
let cur: MapView | null = null;
export function getMapView(): MapView {
  if (cur === null) {
    let raw: string | null = null;
    try {
      raw = local()?.getItem(storageKey(MAP_VIEW_KEY)) ?? null;
    } catch {
      raw = null;
    }
    cur = parseMapView(raw);
  }
  return cur;
}
export function subscribeMapView(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function setMapView(next: MapView, kv: KV | null = local()): void {
  cur = next;
  try {
    kv?.setItem(storageKey(MAP_VIEW_KEY), JSON.stringify(next));
  } catch {
    /* session only */
  }
  for (const l of [...listeners]) l();
}
export const setRadar = (on: boolean) => setMapView({ ...getMapView(), radar: on });
export const resetMapViewCache = () => {
  cur = null;
};

/**
 * RADAR warm-up hum (Dan's playJetCue('radarOn')): once per OFF → ON flip of the switch. Never on OFF, never on mount
 * or a restore of a saved ON (prev undefined = first render), never while muted.
 */
export const radarCue = (prev: boolean | undefined, next: boolean, muted: boolean): 'radarOn' | null =>
  prev === false && next && !muted ? 'radarOn' : null;
