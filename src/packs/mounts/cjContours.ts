/**
 * CJ MAP cell · TERR contour lines, browser half (pure half + ids + intervals: carrier-jet/contours.ts).
 *  - maplibre-contour (BSD-3-Clause) is LAZY: imported, its DemSource (and web worker) created, and the source +
 *    layers added only the first time TERR is shown. MAP mode does no DEM or contour work at all.
 *  - Contour tiles are made in maplibre-contour's worker from the hillshade's terrarium DEM (same URL + maxzoom, so the
 *    PNGs come from the HTTP cache where the hillshade already fetched them).
 *  - MAP / TERR = layout visibility of 'contour' / 'contour-index' (no rebuild); a hidden layer's source fetches nothing.
 *  - Range change → one setTiles with that range's interval (contour tiles regenerate; the DEM stays cached).
 *  - RADAR: the layers take the base map's CJ_RADAR_MAP_DIM via radarDimPaint (setDim), also when added under RADAR.
 */
import type { Map as MlMap, VectorTileSource, LayerSpecification } from 'maplibre-gl';
import { buildCjMapStyle, CJ_DEM_TILES } from '../../skins/carrier-jet/map/style.ts';
import { radarDimPaint } from '../carrier-jet/liveMap.ts';
import { CJ_CONTOUR_BEFORE, CJ_CONTOUR_DEM_MAXZOOM, CJ_CONTOUR_IDS, CJ_CONTOUR_MAXZOOM, CJ_CONTOUR_SRC, contourLayers, contourUrlOptions } from '../carrier-jet/contours.ts';

type Ml = typeof import('maplibre-gl');
type DemSourceT = InstanceType<typeof import('maplibre-contour').default.DemSource>;

/** Tile-generation timings (maplibre-contour onTiming), for perf measurement (window.__cjContours). */
export const contourStats = { tiles: 0, errors: 0, cached: 0, duration: [] as number[], process: [] as number[], fetch: [] as number[], decode: [] as number[], urlSwaps: 0, created: 0 };

let demPromise: Promise<DemSourceT> | null = null;
function demSource(ml: Ml): Promise<DemSourceT> {
  demPromise ??= import('maplibre-contour').then((m) => {
    const mlc = ((m as unknown as { default?: typeof m.default }).default ?? m) as typeof m.default;
    const dem = new mlc.DemSource({ url: CJ_DEM_TILES, encoding: 'terrarium', maxzoom: CJ_CONTOUR_DEM_MAXZOOM, worker: true, cacheSize: 100, timeoutMs: 10_000 });
    dem.setupMaplibre(ml as unknown as Parameters<DemSourceT['setupMaplibre']>[0]);
    dem.onTiming((t) => {
      if (t.error) contourStats.errors++;
      else contourStats.tiles++;
      if (t.process == null) contourStats.cached++;
      const keep = (a: number[], v: number | undefined) => v != null && a.push(Math.round(v * 10) / 10) > 400 && a.shift();
      keep(contourStats.duration, t.duration);
      keep(contourStats.process, t.process);
      keep(contourStats.fetch, t.fetch);
      keep(contourStats.decode, t.decode);
    });
    contourStats.created++;
    return dem;
  });
  return demPromise;
}

export interface CjContours {
  setVisible(on: boolean): void;
  setRange(rangeMi: number): void;
  setDim(k: number): void;
}

/** `loadDem` (tests): stands in for the lazy maplibre-contour DemSource. */
type DemLike = { contourProtocolUrl(o: ReturnType<typeof contourUrlOptions>): string };
export function attachContours(ml: Ml, map: MlMap, init: { visible: boolean; rangeMi: number; dim: number }, loadDem: (ml: Ml) => Promise<DemLike> = demSource): CjContours {
  let visible = init.visible, rangeMi = init.rangeMi, dim = init.dim;
  let added = false, adding = false;
  let urlFor = (r: number) => `${r}`; // replaced by the DemSource's contourProtocolUrl once loaded
  let shownUrl = '';
  const layers = () => contourLayers(buildCjMapStyle({ terrain: true }).layers, visible);
  const applyDim = () => {
    for (const c of radarDimPaint(layers(), dim)) if (map.getLayer(c.id)) map.setPaintProperty(c.id, c.prop, c.value);
  };
  const whenStyle = (f: () => void) => (map.isStyleLoaded() ? f() : map.once('idle', f));
  const add = () => {
    if (added || adding) return;
    adding = true;
    loadDem(ml).then((dem) => {
      adding = false;
      if (added || !(map as unknown as { style?: unknown }).style) return;
      urlFor = (r) => dem.contourProtocolUrl(contourUrlOptions(r));
      whenStyle(() => {
        if (added) return;
        shownUrl = urlFor(rangeMi);
        map.addSource(CJ_CONTOUR_SRC, { type: 'vector', tiles: [shownUrl], maxzoom: CJ_CONTOUR_MAXZOOM, attribution: '' });
        const before = map.getLayer(CJ_CONTOUR_BEFORE) ? CJ_CONTOUR_BEFORE : undefined;
        for (const l of layers()) map.addLayer(l as unknown as LayerSpecification, before);
        added = true;
        applyDim();
      });
    }).catch(() => {
      adding = false;
    });
  };
  if (visible) add();
  return {
    setVisible(on) {
      visible = on;
      if (!added) {
        if (on) add();
        return;
      }
      for (const id of CJ_CONTOUR_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    },
    setRange(r) {
      rangeMi = r;
      if (!added) return;
      const u = urlFor(r);
      if (u === shownUrl) return;
      shownUrl = u;
      contourStats.urlSwaps++;
      (map.getSource(CJ_CONTOUR_SRC) as VectorTileSource | undefined)?.setTiles([u]);
    },
    setDim(k) {
      dim = k;
      if (added) applyDim();
    },
  };
}
