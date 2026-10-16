// Carrier Jet · MATRIX look · MAP cell live map: MapLibre GL style + pure helpers (no renderer wiring).
// Spec: drivesynth-skins/carrier-jet/live-map/BUILD.md + sheet.html (approved). See ./README.md.
// Plain objects only; maplibre-gl is not a dependency yet, so the style type below is a local subset of
// maplibre-gl's StyleSpecification (structurally assignable to it).

export type CjLayer = {
  id: string;
  type: 'background' | 'hillshade' | 'fill' | 'line';
  source?: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown[];
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

export type CjMapStyle = {
  version: 8;
  name?: string;
  sources: Record<string, Record<string, unknown>>;
  layers: CjLayer[];
};

export const CJ_MAP_BG = '#041009'; // dark CRT colour (.cj-crt / --cj-bar-bg)
const HI = '#8dffad';
const MID = '#45ad66';
const DIM = '#2f7a48';
const DIMMER = '#1d5a33';

/** TileJSON referenced by the OpenFreeMap liberty style (`sources.openmaptiles.url`). */
export const CJ_OFM_TILEJSON = 'https://tiles.openfreemap.org/planet';
export const CJ_DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export const CJ_MAP_CREDIT =
  '© OpenStreetMap contributors · © OpenMapTiles · Tiles: OpenFreeMap · Terrain: Mapzen / AWS Terrain Tiles (SRTM, USGS and others)';
export const CJ_MAP_CREDIT_NO_TERRAIN = '© OpenStreetMap contributors · © OpenMapTiles · Tiles: OpenFreeMap';

export const CJ_MAP_RANGES_MI = [1, 2, 5, 10] as const;
export const CJ_MAP_MAX_STREET_LABELS = 2;

/** OpenMapTiles `transportation.class` → line width (px) and colour. Bottom to top. */
export const CJ_ROAD_CLASSES = [
  { id: 'road_minor', classes: ['minor', 'residential', 'service'], width: 0.8, color: DIM, minzoom: 12 },
  { id: 'road_tertiary', classes: ['tertiary'], width: 1.1, color: MID },
  { id: 'road_secondary', classes: ['secondary'], width: 1.6, color: MID },
  { id: 'road_primary', classes: ['trunk', 'primary'], width: 2.2, color: HI },
  { id: 'road_motorway_glow', classes: ['motorway'], width: 7.7, color: HI, opacity: 0.28, blur: 4 },
  { id: 'road_motorway', classes: ['motorway'], width: 3.2, color: HI },
] as const;

const ROUND = { 'line-cap': 'round', 'line-join': 'round' };

/** MapLibre style for the MATRIX MAP cell. `terrain: false` drops the `dem` source and the hillshade layer. */
export function buildCjMapStyle(opts: { terrain?: boolean } = {}): CjMapStyle {
  const terrain = opts.terrain ?? true;
  const sources: CjMapStyle['sources'] = { ofm: { type: 'vector', url: CJ_OFM_TILEJSON } };
  // DEM maxzoom 12: hillshade overzooms above z12 (BUILD.md "hillshade maxzoom 12"), fewer PNG fetches.
  if (terrain) sources.dem = { type: 'raster-dem', tiles: [CJ_DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 12 };

  const layers: CjLayer[] = [{ id: 'background', type: 'background', paint: { 'background-color': CJ_MAP_BG } }];
  if (terrain) {
    layers.push({
      id: 'hillshade', type: 'hillshade', source: 'dem',
      paint: { 'hillshade-shadow-color': '#000', 'hillshade-highlight-color': DIMMER, 'hillshade-accent-color': CJ_MAP_BG, 'hillshade-exaggeration': 0.25 },
    });
  }
  layers.push(
    { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water', paint: { 'fill-color': DIMMER, 'fill-opacity': 0.35 } },
    { id: 'water-line', type: 'line', source: 'ofm', 'source-layer': 'water', layout: ROUND, paint: { 'line-color': DIM, 'line-width': 1 } },
    { id: 'waterway', type: 'line', source: 'ofm', 'source-layer': 'waterway', layout: ROUND, paint: { 'line-color': DIM, 'line-width': 1.5, 'line-opacity': 0.7 } },
  );
  for (const r of CJ_ROAD_CLASSES) {
    const paint: Record<string, unknown> = { 'line-color': r.color, 'line-width': r.width };
    if ('opacity' in r) paint['line-opacity'] = r.opacity;
    if ('blur' in r) paint['line-blur'] = r.blur;
    layers.push({
      id: r.id, type: 'line', source: 'ofm', 'source-layer': 'transportation',
      ...('minzoom' in r ? { minzoom: r.minzoom } : {}),
      filter: ['match', ['get', 'class'], [...r.classes], true, false],
      layout: ROUND, paint,
    });
  }
  // No symbol layers, so no `glyphs` / `sprite` (MapLibre only requires glyphs for text symbols).
  return { version: 8, name: 'RevForge CJ MATRIX', sources, layers };
}

/**
 * MapLibre zoom at which the cell's half-height spans `rangeMi` (own-ship centred, N-UP, pitch 0).
 * Web mercator, MapLibre's 512px world: metres/px at zoom z = 40075016.686 * cos(lat) / (512 * 2^z)
 * = 78271.517 * cos(lat) / 2^z. Solve (cellHeightPx / 2) * mPerPx = rangeMi * 1609.344 for z:
 *   z = log2(78271.517 * cos(lat) * (cellHeightPx / 2) / (rangeMi * 1609.344))
 * (BUILD.md writes 156543, the 256px-tile constant; in MapLibre that would show half the range.)
 * Latitude is clamped to ±85°. Monotonic: larger range → smaller zoom.
 */
export function zoomForRangeMi(rangeMi: number, latDeg: number, cellHeightPx: number): number {
  const lat = Math.max(-85, Math.min(85, latDeg)) * (Math.PI / 180);
  return Math.log2((78271.517 * Math.cos(lat) * (cellHeightPx / 2)) / (rangeMi * 1609.344));
}

export type CjMapStatus = 'GPS ACQ' | 'DEMO' | 'NO TILES' | 'NO MAP DATA' | '';

/**
 * BR corner status. `tilesFailed`: false = OK, 'network' = a source fetch failed with a network error,
 * 'error' (or true) = a style/source load `error`. Tile problems win (the map is blank), then DEMO, then GPS ACQ.
 */
export function cjMapStatus(s: { gps: boolean; demo: boolean; online: boolean; tilesFailed: boolean | 'network' | 'error' }): CjMapStatus {
  if (!s.online || s.tilesFailed === 'network') return 'NO TILES';
  if (s.tilesFailed) return 'NO MAP DATA';
  if (s.demo) return 'DEMO';
  if (!s.gps) return 'GPS ACQ';
  return '';
}

/** Tesla performance constants (BUILD.md). Spread `CJ_MAP_OPTIONS` into `new maplibregl.Map({...})`. */
export const CJ_MAP_PIXEL_RATIO = 1; // cap even at DPR 2
export const CJ_MAP_OPTIONS = {
  interactive: false, attributionControl: false, fadeDuration: 0, pixelRatio: CJ_MAP_PIXEL_RATIO, maxTileCacheSize: 64,
} as const;
export const CJ_MAP_UPDATE_HZ = 2; // jumpTo (never easeTo), throttled
export const CJ_MAP_REMOVE_AFTER_HIDDEN_MS = 30_000; // map.remove() after 30s hidden, recreate on show

/** Feed GPS updates only while the cell is visible and not (parked with no live GPS); else map.stop(). */
export function shouldRender(s: { cellVisible: boolean; parked: boolean; gpsLive: boolean }): boolean {
  return s.cellVisible && !(s.parked && !s.gpsLive);
}
