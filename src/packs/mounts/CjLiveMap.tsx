/**
 * CJ MATRIX · MAP cell live map (non-radar view): a MapLibre canvas under the HSD overlay (own-ship, heading bug,
 * corners, ≤ 2 street names). Spec: drivesynth-skins/carrier-jet/live-map/BUILD.md + Meghan's
 * skins/carrier-jet/map (style, status, zoom, heading legend, WMM2025 declination).
 *  - maplibre-gl is LAZY: `import()` only once this cell is visible (MATRIX look, RADAR off), so the main bundle and
 *    the root build don't carry it.
 *  - Camera: jumpTo only (never easeTo), from rAF capped at ~12 fps while the shown fix / heading is still moving,
 *    then the loop stops (MapLibre redraws only on change). Position glides prev fix → latest fix over one interval;
 *    bearing = the v3 eased heading (CjHeadingEase, shortest arc). Reduce Motion: jump per fix, nothing animates.
 *  - Pause: hidden (IntersectionObserver / RADAR / tab hidden) or Park with no live GPS → no updates + map.stop();
 *    30 s hidden → map.remove(), recreated on show. Other looks unmount the cell (map removed).
 *  - MAP / TERR (the mode key): the hillshade layer's visibility, no map rebuild; DEM tiles load only for TERR.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MlMap, StyleSpecification, MapLibreEvent } from 'maplibre-gl';
import { buildCjMapStyle, cjMapStatus, CJ_MAP_MAX_STREET_LABELS, CJ_MAP_OPTIONS, CJ_MAP_REMOVE_AFTER_HIDDEN_MS, shouldRender, zoomForRangeMi, type CjMapStatus } from '../../skins/carrier-jet/map/style';
import { CjHeadingLegend } from '../../skins/carrier-jet/map/HeadingLegend';
import { latestGpsFix, subscribeGpsFixes } from '../../hooks/gpsFixes';
import type { MapView } from '../carrier-jet/mapView';
import { bugPoint, classifyMapError, CJ_GPS_LIVE_MS, CJ_MAP_FRAME_MS, densify, easedPosition, headingPair, headingSpeech, mapAria, ownShip, placeLabels, pushFix, TRK_PAD, type PlacedLabel, type Rect, type TimedFix } from '../carrier-jet/liveMap';

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

export interface CjLiveMapProps {
  view: MapView;
  /** TRUE heading (GPS course), already eased by CjHeadingEase (raw under Reduce Motion). */
  heading: number | undefined;
  headingStale: boolean;
  reduced: boolean;
  demo: boolean;
  park: boolean;
  hdgRef: 'M' | 'T';
  /** RADAR on: the map is hidden (paused, removed after 30 s). */
  hidden: boolean;
}

export function CjLiveMap({ view, heading, headingStale, reduced, demo, park, hdgRef, hidden }: CjLiveMapProps) {
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
  const cam = useRef({ northUp: view.northUp, zoomMi: view.zoom, heading, reduced, h: size.h, w: size.w });
  cam.current = { northUp: view.northUp, zoomMi: view.zoom, heading, reduced, h: size.h, w: size.w };
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
    const pos = easedPosition(fixes.current, now, c.reduced);
    if (!pos) return;
    if (now - lastJump.current < CJ_MAP_FRAME_MS && !c.reduced) {
      raf.current = requestAnimationFrame(frame);
      return;
    }
    const bearing = c.northUp ? 0 : (c.heading ?? lastApplied.current?.bearing ?? 0);
    const zoom = zoomForRangeMi(c.zoomMi, pos.lat, c.h);
    const top = c.northUp ? 0 : Math.round(c.h * TRK_PAD);
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
    if (pos.k < 1 && !c.reduced) raf.current = requestAnimationFrame(frame);
  };
  const kick = useRef<() => void>(() => undefined);
  kick.current = () => {
    if (!activeRef.current || !mapRef.current || raf.current) return;
    raf.current = requestAnimationFrame(frame);
  };
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => kick.current(), [heading, view.northUp, view.zoom, size.h, size.w, active, reduced]);

  // --- street labels: BUILD.md collision walk, on idle and ≤ 2 Hz while moving
  relabel.current = () => {
    const map = mapRef.current, box = boxRef.current;
    const c = cam.current;
    if (!map || !box || !c.h) return;
    labelAt.current = performance.now();
    const o = ownShip(c.w, c.h, c.northUp);
    const b0 = box.getBoundingClientRect();
    const obstacles: Rect[] = [...(box.parentElement?.querySelectorAll<HTMLElement>('[data-cjmap-ob], .cjv2-info') ?? [])].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - b0.left, y: r.top - b0.top, w: r.width, h: r.height };
    });
    obstacles.push({ x: o.x - 12, y: o.y - 12, w: 24, h: 24 });
    const bp = bugPoint(c.w, c.h, c.northUp, c.northUp ? (c.heading ?? 0) : 0);
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
        center: [pos.lon, pos.lat], zoom: zoomForRangeMi(c.zoomMi, pos.lat, c.h || 100), bearing: c.northUp ? 0 : (c.heading ?? 0),
      });
      map.on('error', (e: MapLibreEvent & { error?: { status?: number; message?: string }; tile?: unknown; sourceId?: string }) => {
        const k = classifyMapError(e, navigator.onLine !== false);
        if (k) setTiles((p) => (p === 'network' ? p : k));
      });
      map.on('data', (e: { dataType?: string; tile?: unknown }) => {
        if (e.dataType === 'source' && e.tile && navigator.onLine !== false) setTiles((p) => (p === 'network' ? false : p));
      });
      map.on('idle', () => relabel.current());
      mapRef.current = map;
      lastApplied.current = null;
      (window as unknown as { __cjMap?: unknown }).__cjMap = { map, stats: stats.current };
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
    if (!mapRef.current || removeTimer.current) return;
    removeTimer.current = setTimeout(() => {
      removeTimer.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setHasMap(false);
      setLabels([]);
    }, CJ_MAP_REMOVE_AFTER_HIDDEN_MS);
  }, [active]);
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
  }, [view.mode, hasMap]);
  useEffect(() => {
    if (online) setTiles((p) => (p === 'network' ? false : p));
  }, [online]);
  useEffect(() => {
    if (!active) return;
    mapRef.current?.resize();
    kick.current();
  }, [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- overlay
  const status: CjMapStatus = cjMapStatus({ gps: gpsLive, demo, online, tilesFailed: tiles });
  // corners change (status pill, TRK-UP legend): re-run the collision walk even while the map is paused
  useEffect(() => {
    if (hasMap) queueMicrotask(() => relabel.current());
  }, [status, view.northUp, hasMap, size.w, size.h]);
  const pos = fixes.current.last ? { lat: fixes.current.last.lat, lon: fixes.current.last.lon } : null;
  const declKey = pos ? `${pos.lat.toFixed(2)},${pos.lon.toFixed(2)}` : '';
  const pair = useMemo(() => (heading == null ? null : headingPair(heading, pos)), [heading, declKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { w, h } = size;
  const o = ownShip(w, h, view.northUp);
  const bp = bugPoint(w, h, view.northUp, view.northUp ? (heading ?? 0) : 0);
  const shipRot = view.northUp ? (heading ?? 0) : 0;
  const acq = status === 'GPS ACQ' || fixAt == null;
  const speech = pair ? headingSpeech(pair, hdgRef) : null;
  return (
    <div ref={boxRef} className="cjv2-hsd" role="img" aria-label={mapAria(view, status, speech)} style={hidden ? { visibility: 'hidden' } : undefined} data-status={status || 'ok'}>
      <div ref={glRef} className="cjv2-mapgl" aria-hidden="true" />
      <div className="cjv2-scan" aria-hidden="true" />
      {w > 0 && (
        <svg className="cjv2-hsd-ov" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          {heading != null && <path d="M0 -6 L-6 4 L6 4 Z" className="cjv2-bug" data-stale={headingStale || undefined} transform={`translate(${bp.x} ${bp.y + (view.northUp ? 0 : 1)}) rotate(${bp.rot})`} />}
          <path d="M0 -9 L7 9 L0 4.5 L-7 9 Z" className="cjv2-own" data-acq={acq || undefined} transform={`translate(${o.x} ${o.y}) rotate(${shipRot})`} />
        </svg>
      )}
      {labels.map((l) => (
        <span key={l.name} className="cjv2-street" style={{ left: l.x, top: l.y, width: l.w }} aria-hidden="true">{l.name}</span>
      ))}
      <span className="cjv2-corner cjv2-tl" data-cjmap-ob aria-hidden="true">{view.northUp ? 'N-UP' : w > 0 && w < 300 ? 'TRK' : 'TRK-UP'}</span>
      {!view.northUp && pair && (
        <span className="cjv2-corner cjv2-tr cjv2-hdg" data-cjmap-ob aria-hidden="true">
          {pair.m != null ? <CjHeadingLegend trueHdg={pair.t} magHdg={pair.m} lead={hdgRef} stale={headingStale} /> : <span data-stale={headingStale || undefined}>{`HDG ${String(Math.round(pair.t) % 360).padStart(3, '0')} T`}</span>}
        </span>
      )}
      <span className="cjv2-corner cjv2-bl" data-cjmap-ob aria-hidden="true">{view.zoom} MI · {view.mode === 'terr' ? 'TERR' : 'MAP'}</span>
      {status && <span className="cjv2-corner cjv2-br" data-cjmap-ob aria-hidden="true">{status}</span>}
    </div>
  );
}

/**
 * Compass-cell heading readout (HDG 047 M over HDG 040 T, the chosen reference leading), laid over the HSD rose's
 * top digit box. MAG uses the declination at the latest fix; no fix yet → TRUE only.
 */
export function CjHeadingReadout({ heading, headingStale, hdgRef }: { heading: number | undefined; headingStale: boolean; hdgRef: 'M' | 'T' }) {
  const [fix, setFix] = useState(() => latestGpsFix());
  useEffect(() => subscribeGpsFixes((f) => setFix((p) => (p && Math.abs(p.latitude - f.latitude) < 0.01 && Math.abs(p.longitude - f.longitude) < 0.01 ? p : f))), []);
  const pos = fix ? { lat: fix.latitude, lon: fix.longitude } : null;
  const pair = useMemo(() => (heading == null ? null : headingPair(heading, pos)), [heading, fix]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pair) return null;
  return (
    <div className="cjv2-hdgro" role="img" aria-label={`Compass, ${headingSpeech(pair, hdgRef)}${headingStale ? ', held' : ''}`}>
      {pair.m != null ? <CjHeadingLegend trueHdg={pair.t} magHdg={pair.m} lead={hdgRef} stale={headingStale} /> : <span data-stale={headingStale || undefined}>{`HDG ${String(Math.round(pair.t) % 360).padStart(3, '0')} T`}</span>}
    </div>
  );
}
