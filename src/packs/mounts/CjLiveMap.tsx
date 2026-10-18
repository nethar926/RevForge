/**
 * CJ MATRIX · MAP cell live map (non-radar view): a MapLibre canvas under the HSD overlay (own-ship, heading bug,
 * corners, ≤ 2 street names). Spec: drivesynth-skins/carrier-jet/live-map/BUILD.md + Meghan's
 * skins/carrier-jet/map (style, status, zoom, heading legend, WMM2025 declination).
 *  - maplibre-gl is LAZY: `import()` only once this cell is visible (MATRIX look), so the main bundle and
 *    the root build don't carry it.
 *  - Camera: jumpTo only (never easeTo), from rAF capped at ~12 fps while the shown fix / heading is still moving,
 *    then the loop stops (MapLibre redraws only on change). Position glides prev fix → latest fix over one interval;
 *    bearing = the v3 eased heading (CjHeadingEase, shortest arc). Reduce Motion: jump per fix, nothing animates.
 *  - RADAR (Wilson, Oct 16): the scope is a transparent overlay ON the live map (`radar` prop, drawn between the map
 *    and the labels). Under it the base map + roads are dimmed (CJ_RADAR_MAP_DIM, paint colours; WX rain stays full strength), heading-up, centred, scaled to the scope range.
 *  - Pause: hidden (IntersectionObserver / tab hidden) or Park with no live GPS → no glide + map.stop(); a paused map
 *    that is still on screen re-frames once on a view change (RNG± / ZM± / N-TRK / resize; cameraMode 'still').
 *    30 s hidden → map.remove(), recreated on show (a visible paused map stays). Other looks unmount the cell (map removed).
 *  - MAP / TERR (the mode key): the hillshade layer's visibility, no map rebuild; DEM tiles load only for TERR.
 *  - TERR contour lines (cjContours.ts, maplibre-contour, lazy on first TERR): 'contour' / 'contour-index' above the
 *    hillshade, under water + roads; same visibility switch, interval by range, radar dim like the base map.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Map as MlMap, StyleSpecification, MapLibreEvent } from 'maplibre-gl';
import { buildCjMapStyle, cjMapStatus, CJ_MAP_MAX_STREET_LABELS, CJ_MAP_OPTIONS, CJ_MAP_REMOVE_AFTER_HIDDEN_MS, shouldRender, type CjMapStatus } from '../../skins/carrier-jet/map/style';
import { latestGpsFix, subscribeGpsFixes } from '../../hooks/gpsFixes';
import { type MapView } from '../carrier-jet/mapView';
import { cjRadarScopeAria } from '../../skins/carrier-jet/map/radarAria';
import { CjHeadingLegend } from '../../skins/carrier-jet/map/HeadingLegend';
import { attachContours, contourStats, type CjContours } from './cjContours';
import { CJ_CONTOUR_SRC } from '../carrier-jet/contours';
import { bugPoint, cameraMode, cameraZoom, removeWhenPaused, classifyMapError, CJ_RADAR_MAP_DIM, radarDimPaint, scopeBugPoint, CJ_GPS_LIVE_MS, CJ_MAP_FRAME_MS, densify, easedPosition, compassSpeech, headingPair, mapAria, ownShip, placeLabels, pushFix, TRK_PAD, type PlacedLabel, type Rect, type TimedFix } from '../carrier-jet/liveMap';
import { attachWxRadar, setWxScopeTint, WX_SRC } from './cjWxRadarLayer';
import { getWxRadarStatus, radarAgeView, subscribeWxRadarStatus, type WxRadarAgeView } from '../carrier-jet/wxRadar';

type Ml = typeof import('maplibre-gl');
let mlPromise: Promise<Ml> | null = null;
/** The one lazy entry point (separate chunk + its CSS). */
export function loadMapLibre(): Promise<Ml> {
  mlPromise ??= Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([m]) => ((m as unknown as { default?: Ml }).default ?? m) as Ml);
  return mlPromise;
}

/** Classes of BUILD.md's labelled layers (road_primary / road_secondary / road_tertiary). */
const LABEL_CLASSES = ['trunk', 'primary', 'secondary', 'tertiary'];
const FONT = "700 11px 'B612', system-ui, sans-serif";
let measureCtx: CanvasRenderingContext2D | null | undefined;
const measure = (s: string) => {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * 7.4;
  measureCtx.font = FONT;
  return measureCtx.measureText(s).width;
};
const useOnline = () => {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const f = () => setOn(navigator.onLine !== false);
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    return () => {
      window.removeEventListener('online', f);
      window.removeEventListener('offline', f);
    };
  }, []);
  return on;
};

/**
 * WX radar age label while the radar is stale (offline / last fetch failed; the overlay keeps the last good frame):
 * 'RADAR · 12m', dimmed on the OAT schedule. Re-read on each radar fetch, online / offline, and every 30 s.
 */
function useWxRadarAge(on: boolean): WxRadarAgeView | null {
  const read = () => (on ? radarAgeView(getWxRadarStatus(), typeof navigator === 'undefined' || navigator.onLine !== false, Date.now()) : null);
  const [v, setV] = useState<WxRadarAgeView | null>(read);
  useEffect(() => {
    const f = () => setV((p) => {
      const n = read();
      return p && n && p.text === n.text && p.dim === n.dim && p.stale === n.stale ? p : n;
    });
    f();
    if (!on) return;
    const off = subscribeWxRadarStatus(f);
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    const t = setInterval(f, 30_000);
    return () => {
      off();
      window.removeEventListener('online', f);
      window.removeEventListener('offline', f);
      clearInterval(t);
    };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export interface CjLiveMapProps {
  view: MapView;
  /** TRUE heading (GPS course), already eased by CjHeadingEase (raw under Reduce Motion). */
  heading: number | undefined;
  headingStale: boolean;
  reduced: boolean;
  demo: boolean;
  park: boolean;
  hdgRef: 'M' | 'T';
  /** Map hidden (paused, removed after 30 s). RADAR no longer hides it (see `radar`). */
  hidden?: boolean;
  /**
   * RADAR on: the scope, drawn as a transparent overlay above the (dimmed) map and WX, under the street labels.
   * `scope(status)` renders it; the map follows the scope (heading-up, centred, outer ring = `range` mi).
   */
  radar?: { range: 2 | 5 | 10; mode: 'map' | 'terr'; scope: (status: CjMapStatus) => ReactNode };
  /** WX key: precipitation radar overlay (RainViewer, recoloured) under the roads. */
  wxRadar?: boolean;
}

export function CjLiveMap({ view, heading, headingStale, reduced, demo, park, hidden = false, wxRadar, radar }: CjLiveMapProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const fixes = useRef<{ prev?: TimedFix; last?: TimedFix }>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [inView, setInView] = useState(false);
  const [docVisible, setDocVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [fixAt, setFixAt] = useState<number | null>(null); // receipt time of the latest fix (perf ms)
  const [, setTick] = useState(0);
  const [tiles, setTiles] = useState<false | 'network' | 'error'>(false);
  const [labels, setLabels] = useState<PlacedLabel[]>([]);
  const [hasMap, setHasMap] = useState(false);
  // WX radar stale: the last good frame stays on the map with its age (TR corner, free in MAP and RADAR); spoken last
  const radarAge = useWxRadarAge(!!wxRadar && hasMap);
  const online = useOnline();

  // --- fixes (the app's one geolocation watch, via gpsFixes)
  useEffect(() => {
    const take = (f: { latitude: number; longitude: number }) => {
      const t = performance.now();
      fixes.current = pushFix(fixes.current, { lat: f.latitude, lon: f.longitude, t });
      setFixAt(t);
      kick.current();
    };
    const f0 = latestGpsFix();
    if (f0) take(f0);
    return subscribeGpsFixes(take);
  }, []);
  const gpsLive = fixAt != null && performance.now() - fixAt < CJ_GPS_LIVE_MS;
  // re-evaluate liveness when a fix goes stale (no fix for CJ_GPS_LIVE_MS → GPS ACQ)
  useEffect(() => {
    if (fixAt == null) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.max(0, fixAt + CJ_GPS_LIVE_MS - performance.now()) + 50);
    return () => clearTimeout(t);
  }, [fixAt]);

  // --- visibility
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => setSize((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight })));
    ro?.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)));
    if (io) io.observe(el);
    else setInView(true);
    const vis = () => setDocVisible(!document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => {
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  const cellVisible = !hidden && inView && docVisible && size.h > 0;
  const active = shouldRender({ cellVisible, parked: park, gpsLive });

  // --- camera target (read by the rAF loop through refs)
  // RADAR: heading-up, centred on own-ship (padding 0), zoom so the scope's outer ring = radar.range
  const camOf = () => ({ northUp: view.northUp, zoomMi: view.zoom, heading, reduced, h: size.h, w: size.w, radar: radar ? radar.range : 0 });
  const cam = useRef(camOf());
  cam.current = camOf();
  const lastApplied = useRef<{ lat: number; lon: number; bearing: number; zoom: number; top: number } | null>(null);
  const raf = useRef(0);
  const lastJump = useRef(0);
  const labelAt = useRef(0);
  const stats = useRef<{ jumps: number; labels?: { feats: number; roads: number; placed: number } }>({ jumps: 0 });
  const relabel = useRef<() => void>(() => undefined);

  const frame = (now: number) => {
    raf.current = 0;
    const map = mapRef.current;
    const c = cam.current;
    if (!map || !c.h) return;
    // paused but on screen (Park, GPS quiet): one jump at the last fix, no glide, no loop
    const still = !activeRef.current;
    const pos = easedPosition(fixes.current, now, c.reduced || still);
    if (!pos) return;
    if (now - lastJump.current < CJ_MAP_FRAME_MS && !c.reduced && !still) {
      raf.current = requestAnimationFrame(frame);
      return;
    }
    const bearing = c.northUp && !c.radar ? 0 : (c.heading ?? lastApplied.current?.bearing ?? 0);
    const zoom = cameraZoom(c, pos.lat);
    const top = c.northUp || c.radar ? 0 : Math.round(c.h * TRK_PAD);
    const p = lastApplied.current;
    const moved = !p || Math.abs(p.lat - pos.lat) > 1e-7 || Math.abs(p.lon - pos.lon) > 1e-7 || Math.abs(((p.bearing - bearing + 540) % 360) - 180) > 0.05 || Math.abs(p.zoom - zoom) > 1e-4 || p.top !== top;
    if (moved) {
      map.jumpTo({ center: [pos.lon, pos.lat], zoom, bearing, padding: { top, bottom: 0, left: 0, right: 0 } });
      lastApplied.current = { lat: pos.lat, lon: pos.lon, bearing, zoom, top };
      lastJump.current = now;
      stats.current.jumps++;
      if (now - labelAt.current > 500) relabel.current();
    }
    // keep going while the glide is unfinished (heading changes re-kick from the effect below)
    if (pos.k < 1 && !c.reduced && !still) raf.current = requestAnimationFrame(frame);
  };
  const kick = useRef<() => void>(() => undefined);
  kick.current = () => {
    if (raf.current || cameraMode({ active: activeRef.current, cellVisible, hasMap: !!mapRef.current }) === 'off') return;
    raf.current = requestAnimationFrame(frame);
  };
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => kick.current(), [heading, view.northUp, view.zoom, size.h, size.w, active, cellVisible, reduced, radar?.range]);

  // --- street labels: BUILD.md collision walk, on idle and ≤ 2 Hz while moving
  relabel.current = () => {
    const map = mapRef.current, box = boxRef.current;
    const c = cam.current;
    if (!map || !box || !c.h) return;
    labelAt.current = performance.now();
    const o = ownShip(c.w, c.h, c.northUp || !!c.radar);
    const b0 = box.getBoundingClientRect();
    const obstacles: Rect[] = [...(box.parentElement?.querySelectorAll<HTMLElement>('[data-cjmap-ob], .cjv2-info') ?? [])].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - b0.left, y: r.top - b0.top, w: r.width, h: r.height };
    });
    obstacles.push({ x: o.x - 12, y: o.y - 12, w: 24, h: 24 });
    const bp = c.radar ? scopeBugPoint(c.w, c.h) : bugPoint(c.w, c.h, c.northUp, c.northUp ? (c.heading ?? 0) : 0);
    obstacles.push({ x: bp.x - 9, y: bp.y - 9, w: 18, h: 18 });
    // OpenMapTiles keeps road names in `transportation_name` (no layer of ours draws it), so read the loaded tiles of
    // that source-layer for the classes the labelled layers draw (primary / secondary / tertiary; trunk with primary).
    let feats: { properties?: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[] = [];
    try {
      feats = map.querySourceFeatures('ofm', { sourceLayer: 'transportation_name', filter: ['match', ['get', 'class'], LABEL_CLASSES, true, false] }) as unknown as typeof feats;
    } catch {
      feats = [];
    }
    const roads = feats.flatMap((f) => {
      const name = String(f.properties?.name ?? f.properties?.['name:latin'] ?? '');
      if (!name) return [];
      const lines = (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []) as [number, number][][];
      return lines.map((ln) => ({ name, pts: densify(ln.map(([x, y]) => map.project([x, y])).map((p) => ({ x: p.x, y: p.y }))) }));
    });
    const next = placeLabels(roads, o, { w: c.w, h: c.h }, obstacles, measure, CJ_MAP_MAX_STREET_LABELS);
    stats.current.labels = { feats: feats.length, roads: roads.length, placed: next.length };
    setLabels((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
  };

  // --- create / pause / remove
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terrRef = useRef(view.mode === 'terr');
  terrRef.current = view.mode === 'terr';
  const contours = useRef<CjContours | null>(null);
  // the contour range / dim the next map creation starts with: synced in an effect (declared before the create effect,
  // so it runs first in the same commit), never written during render
  const contourInitRange = radar ? radar.range : view.zoom, contourInitDim = radar ? CJ_RADAR_MAP_DIM : 1;
  const contourInit = useRef({ rangeMi: contourInitRange, dim: contourInitDim });
  useEffect(() => {
    contourInit.current = { rangeMi: contourInitRange, dim: contourInitDim };
  }, [contourInitRange, contourInitDim]);
  const haveFix = fixAt != null;
  useEffect(() => {
    if (!active || !haveFix) return;
    if (removeTimer.current) {
      clearTimeout(removeTimer.current);
      removeTimer.current = null;
    }
    if (mapRef.current) {
      kick.current();
      return;
    }
    let dead = false;
    loadMapLibre().then((ml) => {
      if (dead || mapRef.current || !glRef.current) return;
      const pos = easedPosition(fixes.current, performance.now(), true);
      if (!pos) return;
      const style = buildCjMapStyle({ terrain: true });
      for (const l of style.layers) if (l.id === 'hillshade') l.layout = { ...(l.layout ?? {}), visibility: terrRef.current ? 'visible' : 'none' };
      const c = cam.current;
      const map = new ml.Map({
        container: glRef.current, style: style as unknown as StyleSpecification, ...CJ_MAP_OPTIONS,
        center: [pos.lon, pos.lat], zoom: cameraZoom({ ...c, h: c.h || 100 }, pos.lat), bearing: c.northUp && !c.radar ? 0 : (c.heading ?? 0),
      });
      map.on('error', (e: MapLibreEvent & { error?: { status?: number; message?: string }; tile?: unknown; sourceId?: string }) => {
        if (e.sourceId === WX_SRC) return; // WX radar is an extra: its failures never flag the map itself
        const k = classifyMapError(e, navigator.onLine !== false);
        // contours are an extra on TERR: a contour-only decode / worker error is not a map outage (network still counts)
        if (k === 'error' && e.sourceId === CJ_CONTOUR_SRC) return;
        if (k) setTiles((p) => (p === 'network' ? p : k));
      });
      map.on('data', (e: { dataType?: string; tile?: unknown }) => {
        if (e.dataType === 'source' && e.tile && navigator.onLine !== false) setTiles((p) => (p === 'network' ? false : p));
      });
      map.on('idle', () => relabel.current());
      mapRef.current = map;
      // contours: nothing loads until TERR is on (then maplibre-contour + its worker, once)
      contours.current = attachContours(ml, map, { visible: terrRef.current, ...contourInit.current });
      lastApplied.current = null;
      (window as unknown as { __cjMap?: unknown }).__cjMap = { map, stats: stats.current, contours: contourStats };
      setHasMap(true);
      kick.current();
    }).catch(() => setTiles('error'));
    return () => {
      dead = true;
    };
  }, [active, haveFix]);
  useEffect(() => {
    if (active) return;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    mapRef.current?.stop();
    // on screen (Park, GPS quiet): keep the frozen map (view keys still re-frame it); back on screen cancels a removal
    if (!removeWhenPaused(cellVisible)) {
      if (removeTimer.current) clearTimeout(removeTimer.current);
      removeTimer.current = null;
      return;
    }
    if (!mapRef.current || removeTimer.current) return;
    removeTimer.current = setTimeout(() => {
      removeTimer.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      contours.current = null;
      setHasMap(false);
      setLabels([]);
    }, CJ_MAP_REMOVE_AFTER_HIDDEN_MS);
  }, [active, cellVisible]);
  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    if (removeTimer.current) clearTimeout(removeTimer.current);
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);
  // MAP / TERR: hillshade visibility only (no rebuild); DEM tiles are fetched only while it is visible
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasMap) return;
    const apply = () => map.getLayer('hillshade') && map.setLayoutProperty('hillshade', 'visibility', view.mode === 'terr' ? 'visible' : 'none');
    if (map.isStyleLoaded()) apply();
    else map.once('styledata', apply);
    // contours follow the same switch (first TERR loads them)
    contours.current?.setVisible(view.mode === 'terr');
  }, [view.mode, hasMap]);
  // contour interval follows the shown range (RADAR: the scope range)
  const contourRange = radar ? radar.range : view.zoom;
  useEffect(() => {
    if (hasMap) contours.current?.setRange(contourRange);
  }, [contourRange, hasMap]);
  // WX radar overlay: attached while on (re-attached when the map is re-created)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasMap || !wxRadar) return;
    let off: (() => void) | null = null, dead = false;
    void loadMapLibre().then((ml) => {
      if (!dead) off = attachWxRadar(ml, map);
    });
    return () => {
      dead = true;
      off?.();
    };
  }, [wxRadar, hasMap]);
  // RADAR: dim the base map + roads (paint colours × CJ_RADAR_MAP_DIM; WX rain untouched) and switch the rain to the
  // scope tint (teal + hatched light rain). Restored when RADAR goes off. No rebuild, no tile reload for the base map.
  const radarOn = !!radar;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasMap) return;
    const apply = () => {
      for (const c of radarDimPaint(buildCjMapStyle({ terrain: true }).layers, radarOn ? CJ_RADAR_MAP_DIM : 1)) if (map.getLayer(c.id)) map.setPaintProperty(c.id, c.prop, c.value);
      setWxScopeTint(map, radarOn);
      contours.current?.setDim(radarOn ? CJ_RADAR_MAP_DIM : 1); // contours are base map under RADAR
    };
    if (map.isStyleLoaded()) apply();
    else map.once('styledata', apply);
  }, [radarOn, hasMap, wxRadar]);
  useEffect(() => {
    if (online) setTiles((p) => (p === 'network' ? false : p));
  }, [online]);
  useEffect(() => {
    if (!cellVisible) return;
    mapRef.current?.resize();
    kick.current();
  }, [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- overlay
  const status: CjMapStatus = cjMapStatus({ gps: gpsLive, demo, online, tilesFailed: tiles });
  // corners change (status pill, TRK-UP legend): re-run the collision walk even while the map is paused
  useEffect(() => {
    if (hasMap) queueMicrotask(() => relabel.current());
  }, [status, view.northUp, hasMap, size.w, size.h, !!radar, !!radarAge]);
  const { w, h } = size;
  const o = ownShip(w, h, view.northUp);
  const bp = bugPoint(w, h, view.northUp, view.northUp ? (heading ?? 0) : 0);
  const shipRot = view.northUp ? (heading ?? 0) : 0;
  const acq = status === 'GPS ACQ' || fixAt == null;
  // RADAR: the map shows under the scope once it exists and has tiles; else the scope alone on the dark CRT
  const mapShown = hasMap && status !== 'NO TILES' && status !== 'NO MAP DATA';
  const aria = radar ? cjRadarScopeAria({ range: radar.range, mode: radar.mode }, status, mapShown) : mapAria(view, status, null); // heading: once, on COMPASS (sheet panel 7)
  const ariaFull = radarAge ? `${aria}. ${radarAge.aria}` : aria;
  const boxStyle: CSSProperties | undefined = hidden ? { visibility: 'hidden' } : undefined;
  return (
    <div ref={boxRef} className="cjv2-hsd" role="img" aria-label={ariaFull} style={boxStyle} data-status={status || 'ok'} data-radar={radar ? (mapShown ? 'over-map' : 'alone') : undefined}>
      <div ref={glRef} className="cjv2-mapgl" aria-hidden="true" />
      <div className="cjv2-scan" aria-hidden="true" />
      {/* RADAR: the scope (transparent) above map + WX + roads, under the street labels; it draws its own bug, own-ship
          and corners (the HSD's are off so nothing doubles up) */}
      {radar?.scope(status)}
      {w > 0 && !radar && (
        <svg className="cjv2-hsd-ov" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          {heading != null && <path d="M0 -6 L-6 4 L6 4 Z" className="cjv2-bug" data-stale={headingStale || undefined} transform={`translate(${bp.x} ${bp.y + (view.northUp ? 0 : 1)}) rotate(${bp.rot})`} />}
          <path d="M0 -9 L7 9 L0 4.5 L-7 9 Z" className="cjv2-own" data-acq={acq || undefined} transform={`translate(${o.x} ${o.y}) rotate(${shipRot})`} />
        </svg>
      )}
      {labels.map((l) => (
        <span key={l.name} className="cjv2-street" style={{ left: l.x, top: l.y, width: l.w }} aria-hidden="true">{l.name}</span>
      ))}
      {!radar && <>
      <span className="cjv2-corner cjv2-tl" data-cjmap-ob aria-hidden="true">{view.northUp ? 'N-UP' : w > 0 && w < 300 ? 'TRK' : 'TRK-UP'}</span>
      {/* Meghan's sheet panel 7, one heading readout: no HDG / MAG legend on the map (COMPASS carries it; the bug stays) */}
      <span className="cjv2-corner cjv2-bl" data-cjmap-ob aria-hidden="true">{view.zoom} MI · {view.mode === 'terr' ? 'TERR' : 'MAP'}</span>
      {status && <span className="cjv2-corner cjv2-br" data-cjmap-ob aria-hidden="true">{status}</span>}
      </>}
      {radarAge && <span className="cjv2-corner cjv2-tr cjwx-rage" data-cjmap-ob data-dim={radarAge.dim || undefined} data-held={radarAge.stale || undefined} aria-hidden="true"><span className="cjwx-rage-t">{radarAge.text}</span></span>}
    </div>
  );
}

/**
 * Compass-cell heading readout: ONE heading in the CONFIG › HDG REF reference (default M, "HDG 047 M"; sheet panel 7:
 * COMPASS shows magnetic, TRUE stays available in CONFIG › HDG REF), laid over the HSD rose's top digit box. MAG uses
 * the declination at the latest fix; no fix yet → TRUE only. Meghan's CjHeadingLegend `single` draws the lead reference
 * only (no second line), and the VoiceOver name reads that one reference.
 */
export function CjHeadingReadout({ heading, headingStale, hdgRef }: { heading: number | undefined; headingStale: boolean; hdgRef: 'M' | 'T' }) {
  const [fix, setFix] = useState(() => latestGpsFix());
  useEffect(() => subscribeGpsFixes((f) => setFix((p) => (p && Math.abs(p.latitude - f.latitude) < 0.01 && Math.abs(p.longitude - f.longitude) < 0.01 ? p : f))), []);
  const pos = fix ? { lat: fix.latitude, lon: fix.longitude } : null;
  const pair = useMemo(() => (heading == null ? null : headingPair(heading, pos)), [heading, fix]); // eslint-disable-line react-hooks/exhaustive-deps
  // no heading yet (Park from a cold load, no fix): the host chip still shows, dashed, in the Drive spot (Meghan's rose
  // box hides under it via its data-cj-hdg-chip hook), so the OAT line sits under the chip exactly as in Drive
  if (!pair) {
    return (
      <div className="cjv2-hdgro" data-hdg-none>
        <span className="cjv2-hdg-dash" role="img" aria-label="Compass, no heading yet" data-cj-hdg-chip="">{`HDG --- ${hdgRef}`}</span>
      </div>
    );
  }
  const label = `Compass, ${compassSpeech(pair, hdgRef)}${headingStale ? ', held' : ''}`;
  return (
    // the accessible name sits on Meghan's legend (ariaLabel → role=group); the wrapper carries none
    <div className="cjv2-hdgro">
      {pair.m != null ? <CjHeadingLegend trueHdg={pair.t} magHdg={pair.m} lead={hdgRef} stale={headingStale} ariaLabel={label} single /> : <span role="img" aria-label={label} data-stale={headingStale || undefined} data-cj-hdg-chip="">{`HDG ${String(Math.round(pair.t) % 360).padStart(3, '0')} T`}</span>}
    </div>
  );
}
