/**
 * WX radar overlay on the CJ live map (browser half of carrier-jet/wxRadar.ts).
 * One raster source + layer, inserted under the road layers so streets stay on top and readable. Tiles come through
 * a `cjrv://` MapLibre protocol that fetches RainViewer's Universal Blue PNG and recolours it to the phosphor ramp
 * (green → amber → red, moderate alpha). Latest frame only, re-read every 10 min (wxRadar.startWxRadarLoop: 10 s
 * timeout per frame-list fetch; a timeout / failure marks the frame held and the next refresh is still scheduled); no animation.
 * Offline / a failed fetch never blanks it: the frame list keeps the last good frame (wxRadar status store), a failed
 * tile is answered from the last good copy of that tile (WxTileCache, any frame), and every fetch reports to the
 * status store, which drives the 'RADAR · 12m' age label (CjLiveMap; shown whenever a frame is up). Back online →
 * re-read (debounced). Past 180 min since the last good fetch (OAT hide point) the frame, label and held tiles all go.
 */
import type { Map as MlMap, RasterTileSource } from 'maplibre-gl';
import { __setWxRadarStatus, expireWxRadarFrame, getWxRadarStatus, subscribeWxRadarStatus, wxRadarExpired, recolorRgba, reportWxRadarFetch, rvSourceTemplate, WxTileCache, WX_SCOPE_PREFIX, WX_RADAR_MAX_ZOOM, WX_RADAR_PROTOCOL, startWxRadarLoop, type RvLatest } from '../carrier-jet/wxRadar';

type Ml = typeof import('maplibre-gl');
export const WX_SRC = 'cjwx-radar';
const WX_LAYER = 'cjwx-radar';
/** Under the first road layer (above water / landcover / hillshade). */
const BEFORE = ['road_minor', 'road_tertiary', 'road_secondary', 'road_primary'];

let host = 'https://tilecache.rainviewer.com';
let registered = false;
const cache = new Map<number, number>();
const lastTiles = new WxTileCache();
export const wxRadarStats = { tiles: 0, lit: 0, errors: 0, held: 0, frame: '' as string, frameTime: 0 };

async function recolour(buf: ArrayBuffer, scope: boolean): Promise<ArrayBuffer> {
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
  const w = bmp.width, h = bmp.height;
  const cv: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) return buf;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  wxRadarStats.lit += recolorRgba(img.data, cache, { scope, width: w });
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
    const scope = m[1].startsWith(WX_SCOPE_PREFIX);
    const path = scope ? m[1].slice(WX_SCOPE_PREFIX.length) : m[1];
    const [z, x, y] = [m[2], m[3], m[4]];
    let data: ArrayBuffer;
    try {
      const res = await fetch(`${host}/${path}/256/${z}/${x}/${y}/2/1_0.png`, { signal: abort.signal });
      if (!res.ok) throw new Error(`cjrv ${res.status}`);
      data = await recolour(await res.arrayBuffer(), scope);
    } catch (e) {
      if (abort.signal.aborted) throw e;
      wxRadarStats.errors++;
      reportWxRadarFetch(false);
      // last good copy of this tile (any earlier frame): the rain stays instead of blanking (never once expired)
      const last = wxRadarExpired(getWxRadarStatus(), Date.now()) ? undefined : lastTiles.get(scope, z, x, y);
      if (last) {
        wxRadarStats.held++;
        return { data: last.slice(0) };
      }
      throw e;
    }
    wxRadarStats.tiles++;
    lastTiles.put(scope, z, x, y, data.slice(0));
    reportWxRadarFetch(true);
    return { data };
  });
}

/** RADAR over the map: the scope tint (teal + hatched light rain). Switches the source's tiles, no layer rebuild. */
let scopeTint = false;
export function setWxScopeTint(map: MlMap, on: boolean): void {
  scopeTint = on;
  const src = map.getSource(WX_SRC) as RasterTileSource | undefined;
  if (src && wxRadarStats.frame) src.setTiles([rvSourceTemplate(wxRadarStats.frame, on)]);
}

/** Turn the overlay on for this map; returns the off switch (removes layer + source, stops the 10-min refresh). */
export function attachWxRadar(ml: Ml, map: MlMap): () => void {
  register(ml);
  const ac = new AbortController();
  const put = (path: string) => {
    const tiles = [rvSourceTemplate(path, scopeTint)];
    const src = map.getSource(WX_SRC) as RasterTileSource | undefined;
    if (src) src.setTiles(tiles);
    else map.addSource(WX_SRC, { type: 'raster', tiles, tileSize: 256, maxzoom: WX_RADAR_MAX_ZOOM, attribution: '' });
    if (map.getLayer(WX_LAYER)) return;
    const before = BEFORE.find((id) => map.getLayer(id));
    map.addLayer({ id: WX_LAYER, type: 'raster', source: WX_SRC, paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, before);
  };
  const unput = () => {
    try {
      if (map.getLayer(WX_LAYER)) map.removeLayer(WX_LAYER);
      if (map.getSource(WX_SRC)) map.removeSource(WX_SRC);
    } catch {
      /* map already removed */
    }
    wxRadarStats.frame = '';
  };
  // 3h stale: the rain frame, its label (radarAgeView → null) and the held frame + tiles go together; WX off/on can't
  // bring it back (no held frame, no held tiles) until a fresh frame list arrives
  const drop = () => {
    lastTiles.clear();
    unput();
    expireWxRadarFrame();
  };
  const checkExpiry = () => {
    if (!ac.signal.aborted && wxRadarExpired(getWxRadarStatus(), Date.now()) && (getWxRadarStatus().frame || map.getSource(WX_SRC))) drop();
  };
  // the frame-list loop (wxRadar.startWxRadarLoop): 10 s timeout per list fetch, a failure / timeout reports to the
  // status store (held label) and the next 10-min refresh is always scheduled
  const show = (fr: RvLatest) => {
    host = fr.host;
    if (fr.frame.path === wxRadarStats.frame && map.getSource(WX_SRC)) return;
    wxRadarStats.frame = fr.frame.path;
    wxRadarStats.frameTime = fr.frame.time;
    // style may still be loading (fresh map): retry on the next idle instead of waiting for a styledata that has passed
    const go = () => {
      if (ac.signal.aborted) return;
      try {
        put(fr.frame.path);
      } catch {
        map.once('idle', go);
      }
    };
    go();
  };
  checkExpiry();
  const loop = startWxRadarLoop({
    fetch: (u, i) => fetch(u, i),
    now: Date.now,
    setTimeout: (f, ms) => window.setTimeout(f, ms),
    clearTimeout: (t) => window.clearTimeout(t as number),
    show,
    shown: () => !!map.getSource(WX_SRC),
    expire: drop,
    onError: () => void wxRadarStats.errors++,
  });
  const tick = () => void loop.refresh();
  const offExpiry = subscribeWxRadarStatus(checkExpiry);
  const expiryTimer = window.setInterval(checkExpiry, 30_000);
  // back online: re-read (debounced 2 s, skipped if the list was read fine within the last minute) instead of waiting
  // out the 10 min
  const onOnline = () => loop.online();
  window.addEventListener('online', onOnline);
  // shots / QA hooks: stats, the status store (backdate the last good fetch), a refresh now
  Object.assign(window as unknown as Record<string, unknown>, {
    __cjWxRadar: wxRadarStats,
    __cjWxRadarStatus: { get: getWxRadarStatus, set: __setWxRadarStatus, refresh: tick },
  });
  return () => {
    ac.abort();
    loop.stop();
    window.removeEventListener('online', onOnline);
    offExpiry();
    clearInterval(expiryTimer);
    unput();
  };
}
