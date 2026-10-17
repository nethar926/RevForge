/**
 * CJ MAP cell · TERR contour lines (pure half; the browser half is mounts/cjContours.ts).
 * Contours are generated on the fly by maplibre-contour (BSD-3-Clause, onthegomap) in its own web worker from the
 * same AWS terrarium DEM the hillshade uses (skins/carrier-jet/map/style.ts CJ_DEM_TILES, maxzoom 12).
 *
 * Layers (ids Meghan can define in her skin style to take over paint / layout):
 *   'contour'        normal lines   (level 0)
 *   'contour-index'  index lines, every 5th (level 1)
 * Source 'cj-contours', vector source-layer 'contours'; each line carries `ele` (elevation in FEET, the
 * multiplier below) and `level` (1 = index, 0 = normal). No labels / symbol layer (the map has no glyphs).
 * Order: directly above 'hillshade', below 'water' and the roads. Under RADAR they are base map and take the
 * same CJ_RADAR_MAP_DIM via radarDimPaint.
 */
import type { CjLayer } from '../../skins/carrier-jet/map/style.ts';

export const CJ_CONTOUR_SRC = 'cj-contours';
export const CJ_CONTOUR_SOURCE_LAYER = 'contours';
export const CJ_CONTOUR_ID = 'contour';
export const CJ_CONTOUR_INDEX_ID = 'contour-index';
export const CJ_CONTOUR_IDS = [CJ_CONTOUR_ID, CJ_CONTOUR_INDEX_ID] as const;
/** Inserted under this layer (so above hillshade, under water + roads). */
export const CJ_CONTOUR_BEFORE = 'water';
/** metres → feet (maplibre-contour `multiplier`); intervals are in feet in metric too (Meghan). */
export const CJ_CONTOUR_FT_PER_M = 3.28084;
/** DEM maxzoom, as the hillshade's `dem` source; contour tiles overzoom past it. */
export const CJ_CONTOUR_DEM_MAXZOOM = 12;
export const CJ_CONTOUR_MAXZOOM = 13;

/**
 * Interval (ft) by MAP range: [normal, index], index = every 5th line. The map's zoom comes from the range and the
 * cell height (zoomForRangeMi), so intervals key on the range itself, not on tile zoom: one threshold per URL,
 * swapped (source.setTiles) when the range changes. RADAR uses its scope range (2 / 5 / 10).
 */
export const CJ_CONTOUR_INTERVALS_FT: Readonly<Record<1 | 2 | 5 | 10, readonly [number, number]>> = {
  1: [40, 200],
  2: [80, 400],
  5: [200, 1000],
  10: [400, 2000],
};
/** Nearest defined range at or above `rangeMi` (beyond 10 mi: the 10 mi interval). */
export function contourInterval(rangeMi: number): readonly [number, number] {
  const keys = (Object.keys(CJ_CONTOUR_INTERVALS_FT).map(Number) as (1 | 2 | 5 | 10)[]).sort((a, b) => a - b);
  const k = keys.find((r) => rangeMi <= r) ?? keys[keys.length - 1];
  return CJ_CONTOUR_INTERVALS_FT[k];
}
/** maplibre-contour `contourProtocolUrl` options for a range (one threshold for every zoom). */
export function contourUrlOptions(rangeMi: number) {
  const [minor, major] = contourInterval(rangeMi);
  return {
    multiplier: CJ_CONTOUR_FT_PER_M,
    thresholds: { 0: [minor, major] },
    contourLayer: CJ_CONTOUR_SOURCE_LAYER,
    elevationKey: 'ele',
    levelKey: 'level',
    extent: 4096,
    buffer: 1,
  };
}

/** Mount defaults (Meghan's final spec, Oct 17). Move into the skin style by layer id to override. */
export const CJ_CONTOUR_STYLE = {
  normal: { 'line-color': '#1d5a33', 'line-width': 0.6, 'line-opacity': 0.8 },
  index: { 'line-color': '#2f7a48', 'line-width': 1.0, 'line-opacity': 0.85 },
  layout: { 'line-cap': 'round', 'line-join': 'round' },
} as const;

export type CjContourLayer = CjLayer & { type: 'line'; source: string; 'source-layer': string };

/**
 * The two contour line layers. When the skin style (buildCjMapStyle().layers) has a layer with the same id, its
 * paint, layout, minzoom and maxzoom win (Meghan owns the final look); source, source-layer, filter and visibility
 * stay ours. `visible`: TERR.
 */
export function contourLayers(skinLayers: readonly CjLayer[], visible: boolean): CjContourLayer[] {
  const skin = (id: string) => skinLayers.find((l) => l.id === id);
  const mk = (id: string, level: 0 | 1, paint: Record<string, unknown>): CjContourLayer => {
    const s = skin(id);
    return {
      id, type: 'line', source: CJ_CONTOUR_SRC, 'source-layer': CJ_CONTOUR_SOURCE_LAYER,
      ...(s?.minzoom != null ? { minzoom: s.minzoom } : {}),
      ...(s?.maxzoom != null ? { maxzoom: s.maxzoom } : {}),
      filter: ['==', ['get', 'level'], level],
      layout: { ...(s?.layout ?? CJ_CONTOUR_STYLE.layout), visibility: visible ? 'visible' : 'none' },
      paint: { ...(s?.paint ?? paint) },
    };
  };
  return [mk(CJ_CONTOUR_ID, 0, CJ_CONTOUR_STYLE.normal), mk(CJ_CONTOUR_INDEX_ID, 1, CJ_CONTOUR_STYLE.index)];
}
