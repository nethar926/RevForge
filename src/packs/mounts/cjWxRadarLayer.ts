/**
 * MOCK (mock/cj-map-first, not shipped): WX radar overlay on the CJ live map (browser half of carrier-jet/wxRadar.ts).
 * One raster source + layer, inserted under the road layers so streets stay on top and readable. Tiles come through
 * a `cjrv://` MapLibre protocol that fetches RainViewer's Universal Blue PNG and recolours it to the phosphor ramp
 * (green → amber → red, moderate alpha). Latest frame only, re-read every 10 min; no animation.
 */
import type { Map as MlMap, RasterTileSource } from 'maplibre-gl';
import { latestFrame, recolorRgba, rvSourceTemplate, WX_RADAR_API, WX_RADAR_MAX_ZOOM, WX_RADAR_PROTOCOL, WX_RADAR_REFRESH_MS } from '../carrier-jet/wxRadar';

type Ml = typeof import('maplibre-gl');
export const WX_SRC = 'cjwx-radar';
const WX_LAYER = 'cjwx-radar';
/** Under the first road layer (above water / landcover / hillshade). */
const BEFORE = ['road_minor', 'road_tertiary', 'road_secondary', 'road_primary'];

let host = 'https://tilecache.rainviewer.com';
let registered = false;
const cache = new Map<number, number>();
export const wxRadarStats = { tiles: 0, lit: 0, errors: 0, frame: '' as string, frameTime: 0 };

async function recolour(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
  const w = bmp.width, h = bmp.height;
  const cv: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) return buf;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  wxRadarStats.lit += recolorRgba(img.data, cache);
  ctx.putImageData(img, 0, 0);
  const blob = 'convertToBlob' in cv ? await cv.convertToBlob({ type: 'image/png' }) : await new Promise<Blob>((ok, no) => (cv as HTMLCanvasElement).toBlob((b) => (b ? ok(b) : no(new Error('toBlob'))), 'image/png'));
  return blob.arrayBuffer();
}

function register(ml: Ml) {
  if (registered) return;
  registered = true;
  ml.addProtocol(WX_RADAR_PROTOCOL, async (params, abort) => {
    // cjrv://v2/radar/<id>/{z}/{x}/{y}
    const m = /^cjrv:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m) throw new Error('cjrv: bad url');
    const res = await fetch(`${host}/${m[1]}/256/${m[2]}/${m[3]}/${m[4]}/2/1_0.png`, { signal: abort.signal });
    if (!res.ok) {
      wxRadarStats.errors++;
      throw new Error(`cjrv ${res.status}`);
    }
    wxRadarStats.tiles++;
    return { data: await recolour(await res.arrayBuffer()) };
  });
}

async function fetchFrame(signal: AbortSignal) {
  const r = await fetch(WX_RADAR_API, { signal, cache: 'no-store' });
  if (!r.ok) throw new Error(`weather-maps ${r.status}`);
  return latestFrame(await r.json());
}

/** Turn the overlay on for this map; returns the off switch (removes layer + source, stops the 10-min refresh). */
export function attachWxRadar(ml: Ml, map: MlMap): () => void {
  register(ml);
  const ac = new AbortController();
  let timer = 0;
  const put = (path: string) => {
    const tiles = [rvSourceTemplate(path)];
    const src = map.getSource(WX_SRC) as RasterTileSource | undefined;
    if (src) src.setTiles(tiles);
    else map.addSource(WX_SRC, { type: 'raster', tiles, tileSize: 256, maxzoom: WX_RADAR_MAX_ZOOM, attribution: '' });
    if (map.getLayer(WX_LAYER)) return;
    const before = BEFORE.find((id) => map.getLayer(id));
    map.addLayer({ id: WX_LAYER, type: 'raster', source: WX_SRC, paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before);
  };
  const tick = async () => {
    try {
      const f = await fetchFrame(ac.signal);
      if (ac.signal.aborted || !f) return;
      host = f.host;
      if (f.frame.path !== wxRadarStats.frame || !map.getSource(WX_SRC)) {
        wxRadarStats.frame = f.frame.path;
        wxRadarStats.frameTime = f.frame.time;
        // style may still be loading (fresh map): retry on the next idle instead of waiting for a styledata that has passed
        const go = () => {
          if (ac.signal.aborted) return;
          try {
            put(f.frame.path);
          } catch {
            map.once('idle', go);
          }
        };
        go();
      }
    } catch {
      wxRadarStats.errors++;
    } finally {
      if (!ac.signal.aborted) timer = window.setTimeout(tick, WX_RADAR_REFRESH_MS);
    }
  };
  void tick();
  (window as unknown as { __cjWxRadar?: unknown }).__cjWxRadar = wxRadarStats;
  return () => {
    ac.abort();
    clearTimeout(timer);
    try {
      if (map.getLayer(WX_LAYER)) map.removeLayer(WX_LAYER);
      if (map.getSource(WX_SRC)) map.removeSource(WX_SRC);
    } catch {
      /* map already removed */
    }
    wxRadarStats.frame = '';
  };
}
