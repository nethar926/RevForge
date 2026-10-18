import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { BezelKey } from '../../skins/carrier-jet/parts/index';
import { useCarrierJetVariant, writeCarrierJetVariant, type CarrierJetVariant } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { getPackShellState, onPackShellState, requestPackShell, sendPackEngineCommand, type PackEngineCommand } from '../runtime';
import { latestGpsFix, subscribeGpsFixes } from '../../hooks/gpsFixes';
import { compassFlowAvailable, getCompassSnapshot, subscribeCompass, toggleCompass } from '../heading';
import type { RfLayout } from '../layout';
import { ACCEL_INIT, accelEase, accelStep, accelTarget, accelText, type AccelState } from '../carrier-jet/accelBall';
import { mapSquareSide, keyXs, KEY_H, KEY_W, TOP_CELLS, TOP_CELLS_MAP_FIRST, type Box, type CellId } from '../carrier-jet/geometry';
import { CJ_GRID, type CjAnchors, type CjCellId, type CjHeroAnchors } from '../carrier-jet/cells';
import { heroKeyActive, splitCap, type CapCtx } from '../carrier-jet/heroRail';
import { KorryCap } from './CjHeroV2';
import { GridLayer } from '../grid/GridLayer';
import { rectStyle, useGrid, useGridMeasure, useSystemReducedMotion } from '../grid/useGrid';
import { railTop } from '../grid/rail';
import { applyMapKey, getMapView, radarCue, rangeRings, setMapView, subscribeMapView, type MapKeyId, type MapView } from '../carrier-jet/mapView';
import { cjRadarScopeAria } from '../../skins/carrier-jet/map/radarAria';
import { getCjPrefs, reducedMotion, setCjPrefs, subscribeCjPrefs, type CjPrefs } from '../carrier-jet/cjPrefs';
import { closeCjConfig, getCjConfig, registerCjConfigHost, setCjConfig, subscribeCjConfig } from '../carrier-jet/configStore';
import { cellOrderFor, TILE_SLOTS } from '../carrier-jet/configCells';
import { cellKeys, KEY_CELLS, rightBankFor, SPARE_INDEX, stripCount, wxSlot, type EdgeKey } from '../carrier-jet/edgeKeys';
import { cjNavAction, cjNavItems } from '../carrier-jet.nav';
import { disabledReason, itemAria, itemValue, MAP_CREDIT, pageTiles, runItem, visibleItems, type ConfigCtx, type ConfigEffect, type ConfigItem } from '../configTable';
import { CJ_CONFIG } from '../carrier-jet/configPages';
import { oatTempUnit, wxView, type WxView } from '../carrier-jet/wxView';
import { getWxObs, setWxObs, subscribeWxObs, wxValueAt } from '../carrier-jet/wxStore';
import { startWxPoller } from '../carrier-jet/weather/poller';
import { storageKey } from '../../lib/storageKey';
import { CjWxReadout } from './CjWxReadout';
import { getWxRadar, setWxRadar, subscribeWxRadar } from '../carrier-jet/wxRadar';
import { wxCreditRows } from '../carrier-jet/wxCredits';
import { CONFIG_HEADER_CELLS, configCellHeader, type ConfigHeaderCell } from '../carrier-jet/configHeaders';
import { getPreferTaps, setPreferTaps, subscribePreferTaps } from '../../lib/preferTaps.ts';
// live map + compass legend: a lazy chunk (CjLiveMap.tsx, Meghan's style + WMM2025); maplibre-gl is a further lazy chunk
const CjLiveMap = lazy(() => import('./CjLiveMap').then((m) => ({ default: m.CjLiveMap })));
const CjHeadingReadout = lazy(() => import('./CjLiveMap').then((m) => ({ default: m.CjHeadingReadout })));

/** OAT readout: the stored observation, re-aged once a minute (age suffix / dim / hide thresholds). */
function useWxValue() {
  const obs = useSyncExternalStore(subscribeWxObs, getWxObs, getWxObs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!obs) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [obs]);
  return wxValueAt(obs, now);
}
/** Live OAT (carrier-jet/weather): polls while the readout can show; position from the shared GPS fixes (no fix or
 * denied → no request, the slot stays empty / shows the persisted value aging out). */
function useWxPoller(active: boolean) {
  useEffect(() => {
    if (!active || typeof fetch === 'undefined') return;
    const p = startWxPoller({
      fetch: (u, i) => fetch(u, i),
      kv: typeof localStorage === 'undefined' ? null : localStorage,
      prefix: storageKey('revforge.pack.carrier-jet.wx.'),
      now: Date.now,
      random: Math.random,
      hidden: () => typeof document !== 'undefined' && document.hidden,
      getPos: () => {
        const f = latestGpsFix();
        return f && Number.isFinite(f.latitude) && Number.isFinite(f.longitude) && !(f.latitude === 0 && f.longitude === 0) ? { lat: f.latitude, lon: f.longitude } : null;
      },
      onObs: setWxObs,
      setInterval: (f, ms) => setInterval(f, ms),
      clearInterval: (t) => clearInterval(t as ReturnType<typeof setInterval>),
    });
    const offFix = subscribeGpsFixes(() => p.poke());
    const onVis = () => p.poke();
    document.addEventListener('visibilitychange', onVis);
    // back online: re-poll (debounced; only if the poller had failed), as the radar re-reads its frame list
    const onOnline = () => p.online();
    window.addEventListener('online', onOnline);
    return () => {
      p.stop();
      offFix();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, [active]);
}

/** Guarded jet cue (engine playJetCue?.(); silent on the base engine). Switch sound off → no cue. */
function cue(c: Extract<PackEngineCommand, { type: 'jet-cue' }>['cue']) {
  if (!getCjPrefs().switchSound && c !== 'radarOn') return;
  sendPackEngineCommand(ID.id, { type: 'jet-cue', cue: c });
}

/** Board 2's eight cells + the hero v2 plate / rail (CJ_GRID). */
type Cells = Record<CjCellId, Box>;
interface Geo {
  board2: boolean;
  cells: Cells | null;
  /** The .cj board rect (fallback CONFIG area for looks without Board 2). */
  board: Box;
  /** Gap between a cell's bottom and its key strip. */
  gap: number;
  /** Map-first Drive: the host is in the map-first DRIVE grid (.cjm[data-cj-mapfirst='drive']). */
  mapFirst?: boolean;
}
/** What the host measures: the board, the strip gap and (Board 2) the seven skin anchors CJ_GRID derives its cells from. */
interface Measured {
  board: Box;
  gap: number;
  mapFirst: boolean;
  anchors: CjAnchors | null;
  /** Hero v2: the annunciator plate / start rail boxes (portaled into the top bar / dock), when on screen. */
  hero: CjHeroAnchors | null;
}
const rel = (r: DOMRect, o: DOMRect): Box => ({ left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height });
/** Re-measure on these attribute changes under the host (look / layout / map-first swaps). */
const GEO_OBSERVE = { attributeFilter: ['data-variant', 'data-layout', 'class', 'data-cj-mapfirst'] };

/** Read the skin's Board 2 anchors off the host (.cjm). Pure DOM reads, plus the square-MAP column it sets first. */
function measureCj(host: HTMLElement, layout: RfLayout, hero: boolean): Measured | null {
  const root = host.querySelector<HTMLElement>('.cj');
  if (!root) return null;
  const o = host.getBoundingClientRect();
  const q = (s: string) => root.querySelector<HTMLElement>(s)?.getBoundingClientRect();
  const board2 = root.dataset.variant === 'carrier-jet' && (root.dataset.layout === 'reflow' || root.dataset.layout === 'full') && (layout === 'board' || layout === 'window');
  const board = rel(root.getBoundingClientRect(), o);
  let anchors: CjAnchors | null = null;
  let gap = 4;
  let mapFirst = false;
  const mf = board2 && host.dataset.cjMapfirst === 'drive';
  // Square MAP: size the MAP column from the two-row span (rows only, so one pass settles), then measure.
  // Not map-first: drop the side so Board 2 / phones keep their fr column.
  if (mf) {
    const m0 = q('.cj-a-gr > :first-child'), c0 = root.querySelectorAll<HTMLElement>(':scope .cj-a-mid > div.cj-crt')[1]?.getBoundingClientRect();
    if (m0 && c0) {
      const side = `${mapSquareSide({ mach: rel(m0, o), compass: rel(c0, o) })}px`;
      if (host.style.getPropertyValue('--cjv2-map-side') !== side) host.style.setProperty('--cjv2-map-side', side);
    }
  } else if (host.style.getPropertyValue('--cjv2-map-side')) host.style.removeProperty('--cjv2-map-side');
  if (board2) {
    const speed = q('.cj-a-speed'), mach = q('.cj-a-gr > :first-child'), rpm = q('.cj-a-gr > :last-child');
    const mids = root.querySelectorAll<HTMLElement>(':scope .cj-a-mid > div.cj-crt');
    const vdi = mids[0]?.getBoundingClientRect(), compass = mids[1]?.getBoundingClientRect();
    const sweep = q('.cj-a-sweep'), eng = q('.cj-a-eng');
    if (speed && mach && rpm && vdi && compass && sweep && eng) {
      mapFirst = mf;
      anchors = { speed: rel(speed, o), rpm: rel(rpm, o), mach: rel(mach, o), vdi: rel(vdi, o), sweep: rel(sweep, o), eng: rel(eng, o), compass: rel(compass, o) };
      const body = root.querySelector<HTMLElement>('.cj-body');
      gap = body ? parseFloat(getComputedStyle(body).rowGap) || 4 : 4;
    }
  }
  // hero v2 (CjHeroV2): the plate and rail live outside the host (top bar / dock portals); measured relative to it
  let heroBoxes: CjHeroAnchors | null = null;
  if (anchors && hero && (layout === 'board' || layout === 'window')) {
    const vp = host.closest<HTMLElement>('.rev-viewport') ?? document;
    const box = (s: string) => {
      const r = vp.querySelector<HTMLElement>(s)?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? rel(r, o) : null;
    };
    heroBoxes = { ann: box('.cjhv-ann'), rail: box('.cjhv-rail'), layout };
  }
  return { board, gap, mapFirst, anchors, hero: heroBoxes };
}

/**
 * The layer's geometry on the shared grid: the host measures the skin's anchors (useGridMeasure; `selfRef` is the
 * layer's own root, the host .cjm its parent) and CJ_GRID resolves the eight cells for the live layout
 * (board2Cells / board2CellsMapFirst; phones: none).
 */
function useGeo(selfRef: RefObject<HTMLElement | null>, layout: RfLayout, hero: string): Geo | null {
  // `hero` (the mount's hero v2 key: off / ann / ann+rail) re-measures when the plate or rail comes on screen
  const read = useCallback((host: HTMLElement) => measureCj(host, layout, hero !== ''), [layout, hero]);
  const m = useGridMeasure(selfRef, read, GEO_OBSERVE);
  const ctx = useMemo(() => (m?.anchors ? { anchors: m.anchors, mapFirst: m.mapFirst, hero: m.hero ?? { layout: layout === 'window' ? 'window' as const : 'board' as const } } : null), [m, layout]);
  const cells = useGrid(CJ_GRID, layout, ctx);
  return useMemo(() => (m ? { board2: !!cells, cells, board: m.board, gap: m.gap, mapFirst: m.mapFirst } : null), [m, cells]);
}
const boxStyle = rectStyle;

/** A host cell header. CONFIG open: `header` = the page under it (configHeaders); '' = blank, same box (zero shift). */
function CellLab({ text, header }: { text: string; header?: string }) {
  const t = header ?? text;
  return <span className="cjv2-lab" data-blank={t ? undefined : true} aria-hidden="true">{t || '\u00a0'}</span>;
}

/* ------------------------------------------------------------------ ACCEL BALL (GPS) */
function useAccel(demo: boolean, reduced: boolean) {
  const st = useRef<AccelState>(ACCEL_INIT);
  const [view, setView] = useState({ x: 0, lat: 0, lon: 0, live: false });
  useEffect(() => {
    const off = subscribeGpsFixes((f) => {
      st.current = accelStep(st.current, { speed: f.speed, heading: f.heading, timestamp: f.timestamp });
    });
    const f = latestGpsFix();
    if (f) st.current = accelStep(st.current, { speed: f.speed, heading: f.heading, timestamp: f.timestamp });
    let last = performance.now();
    let x = 0;
    // 1 Hz GPS → eased at 10 Hz (reduced motion: snaps, no glide).
    const t = setInterval(() => {
      const now = performance.now();
      const tg = demo ? { x: 0, lat: 0, lon: 0, live: false } : accelTarget(st.current, Date.now());
      x = accelEase(x, tg.x, (now - last) / 1000, reduced);
      last = now;
      setView((p) => (Math.abs(p.x - x) < 0.002 && p.live === tg.live && Math.abs(p.lat - tg.lat) < 0.005 ? p : { x, lat: tg.lat, lon: tg.lon, live: tg.live }));
    }, 100);
    return () => {
      off();
      clearInterval(t);
    };
  }, [demo, reduced]);
  return view;
}

function AccelCell({ box, demo, reduced, header }: { box: Box; demo: boolean; reduced: boolean; header?: string }) {
  const a = useAccel(demo, reduced);
  const W = 100, H = 60;
  const cx = 50 + a.x * 38;
  // ball rides a shallow arc (inclinometer tube)
  const cy = 30 + Math.pow(a.x, 2) * 12;
  return (
    <div className="cjv2-cell cjv2-acc" data-live={a.live} style={boxStyle(box)}>
      <CellLab text="ACCEL" header={header} />
      <div className="cjv2-crt" role="img" aria-label={accelText(a)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d="M8 26 Q50 50 92 26" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="14" strokeLinecap="round" />
          <path d="M8 26 Q50 50 92 26" fill="none" stroke="#000" strokeWidth="11" strokeLinecap="round" />
          <line x1="43" y1="27" x2="43" y2="46" stroke="currentColor" strokeWidth="1.2" />
          <line x1="57" y1="27" x2="57" y2="46" stroke="currentColor" strokeWidth="1.2" />
          <circle cx={cx} cy={cy + 6} r="5.2" fill="currentColor" />
        </svg>
        <span className="cjv2-cap">{a.live ? `${Math.abs(a.lat).toFixed(2)} G` : 'NO MOTION'}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ MAP / RADAR */
/**
 * The phosphor radar scope: no background of its own (transparent over the map). Layers, bottom up: range rings →
 * sweep (its own HTML-level svg, rotated as an element) → heading bug + own-ship → corners. The accessible name is on
 * the MAP cell (CjLiveMap: "Radar scope over map, …"), so the scope itself is aria-hidden. BR: the map's status when
 * it has one (GPS ACQ / DEMO / NO TILES), else NO RETURNS. No heading corner: COMPASS owns the heading (sheet panel 7;
 * the TR digits read "040" beside COMPASS "047 M"), the scope keeps its bug.
 */
function RadarScope({ view, reduced, status, label }: { view: MapView; reduced: boolean; status: string; label?: string }) {
  return (
    <div className="cjv2-scope" data-motion={reduced ? 'static' : 'live'} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle r="46" className="cjv2-ring-edge" />
        {rangeRings(view.range).map((r) => (
          <circle key={r.mi} r={46 * r.r} className="cjv2-ring" />
        ))}
      </svg>
      {/* sweep: its own HTML-level svg (same viewBox + inset), rotated as an element about its CSS box centre = the
          viewBox centre under meet. No CSS transform on SVG children (transform-box: view-box put the pivot at a
          corner, Wilson Oct 16). Reduce Motion: static beam, no trail. */}
      <svg className="cjv2-sweepsvg" viewBox="-50 -50 100 100" aria-hidden="true">
        {!reduced && <path className="cjv2-trail" d="M0 0 L0 -46 A46 46 0 0 0 -32.5 -32.5 Z" />}
        <line x1="0" y1="0" x2="0" y2="-46" className="cjv2-beam" />
      </svg>
      {/* heading bug + own-ship above the sweep */}
      <svg className="cjv2-scopetop" viewBox="-50 -50 100 100" aria-hidden="true">
        <path d="M0 -50 L-4 -43 L4 -43 Z" className="cjv2-bug" />
        <path d="M0 -4 L3 4 L0 2 L-3 4 Z" className="cjv2-own" />
      </svg>
      <span className="cjv2-corner cjv2-tl" data-cjmap-ob>{view.mode === 'map' ? 'MAP' : 'TERR'}</span>
      <span className="cjv2-corner cjv2-bl" data-cjmap-ob>{view.range} MI</span>
      <span className="cjv2-corner cjv2-br" data-cjmap-ob>{status || 'NO RETURNS'}</span>
    </div>
  );
}
type LiveMapCtx = { demo: boolean; park: boolean; hdgRef: 'M' | 'T' };
function MapCell({ box, view, heading, headingStale, reduced, live, wx, wxRadar, header }: { box: Box; view: MapView; heading: number | undefined; headingStale: boolean; reduced: boolean; live: LiveMapCtx; wx?: WxView | null; wxRadar?: boolean; header?: string }) {
  const [info, setInfo] = useState(false);
  const credits = wxCreditRows(wx?.source ?? null, !!wxRadar);
  return (
    <div className="cjv2-cell cjv2-map" data-radar={view.radar} style={boxStyle(box)}>
      <CellLab text={view.radar ? 'RADAR' : 'MAP'} header={header} />
      <div className="cjv2-crt">
        {/* Alerts: reserved top third (no alert source on base) */}
        <div className="cjv2-alerts" role="status" aria-live="polite" />
        {/* RADAR (Wilson, Oct 16 "Radar overlay should stack atop maps"): the scope is a transparent overlay ON the
            live map, inside CjLiveMap between the dimmed map and the street labels. Until
            the map chunk loads, or with no map (no fix / offline / Park without GPS), the scope stands alone on the CRT. */}
        <Suspense fallback={view.radar ? <RadarScope view={view} reduced={reduced} status="" label={cjRadarScopeAria({ range: view.range, mode: view.mode }, '', false)} /> : null}>
          <CjLiveMap view={view} heading={heading} headingStale={headingStale} reduced={reduced} demo={live.demo} park={live.park} hdgRef={live.hdgRef} wxRadar={!!wxRadar} radar={view.radar ? { range: view.range, mode: view.mode, scope: (st) => <RadarScope view={view} reduced={reduced} status={st} /> } : undefined} />
        </Suspense>
        <button type="button" className="cjv2-info" aria-expanded={info} aria-label="Map credit" data-covered={(info && credits.length > 0) || undefined} onClick={() => setInfo((v) => !v)}>i</button>
        {info && !credits.length && (
          <p className="cjv2-attr" role="note">
            {MAP_CREDIT}
          </p>
        )}
      </div>
      {/* with weather / radar credits: the map credit, then one full-width row per credit; links (Open-Meteo + its
          CC BY 4.0 licence, RainViewer) are >= 44px rows, the whole row the target, new tab. Outside the CRT (it clips):
          from the CRT top as before when it fits, else it grows UP from the CRT bottom (over the cell above; never down
          into the shelf). It carries its own (i) in its top-right corner, over the map credit, to close it. */}
      {info && credits.length > 0 && (
        <div className="cjv2-attrwrap">
          <div className="cjv2-attr" role="note" data-wx={wxRadar ? 'radar' : true} data-rows>
            <button type="button" className="cjv2-info cjv2-attr-close" aria-expanded={true} aria-label="Map credit" onClick={() => setInfo(false)}>i</button>
            <p className="cjv2-attr-map">{MAP_CREDIT}</p>
            {credits.map((c) =>
              c.href ? (
                <a key={c.id} className="cjv2-credrow" data-credit={c.id} href={c.href} target="_blank" rel="noopener noreferrer">{c.text}</a>
              ) : (
                <span key={c.id} className="cjv2-credrow" data-credit={c.id} data-plain>{c.text}</span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ CONFIG tiles */
function Tile({ it, c, box, onRun, next }: { it: ConfigItem | 'next'; c: ConfigCtx; box: Box; onRun: (it: ConfigItem | 'next') => void; next?: string }) {
  if (it === 'next') {
    return (
      <button type="button" className="cjv2-tile" style={boxStyle(box)} aria-label={`Next tiles, ${next}`} onClick={() => onRun('next')}>
        <strong>NEXT ▸</strong>
        <small>{next}</small>
      </button>
    );
  }
  const why = disabledReason(it, c);
  return (
    <button type="button" className="cjv2-tile" style={boxStyle(box)} data-tile={it.id} aria-disabled={why ? true : undefined} role={it.id === 'mute' ? 'switch' : undefined} aria-checked={it.id === 'mute' ? !!it.on?.(c) : undefined} aria-pressed={it.on && it.id !== 'mute' ? it.on(c) : undefined} aria-label={itemAria(it, c)} onClick={() => onRun(it)}>
      {it.group && <small className="cjv2-group" aria-hidden="true">{it.group}</small>}
      <strong aria-hidden="true">{it.label}</strong>
      <small aria-hidden="true">{why ?? itemValue(it, c)}</small>
      {it.note && <small className="cjv2-note" aria-hidden="true">{it.note}</small>}
    </button>
  );
}

/** Fallback CONFIG area (looks without Board 2, phones): tiles in a grid over the board. */
function gridBoxes(b: Box, n: number): Box[] {
  const cols = b.width < 520 ? 2 : b.width < 900 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const pad = 8, gap = 8;
  const w = (b.width - 2 * pad - (cols - 1) * gap) / cols;
  const h = Math.max(56, (b.height - 2 * pad - (rows - 1) * gap) / rows);
  return Array.from({ length: n }, (_, i) => ({ left: b.left + pad + (i % cols) * (w + gap), top: b.top + pad + Math.floor(i / cols) * (h + gap), width: w, height: h }));
}

/* ------------------------------------------------------------------ the layer */
export interface CjV2LayerProps {
  layout: RfLayout;
  /** Park (CarrierJetMount useCjPark: ≤ 0.5 mph for 1.5 s, leaves above 2) — shared with the cold start. */
  park: boolean;
  demo: boolean;
  /** ThemeStage "Animated environment"; MOTION AUTO also honours it. */
  motion: boolean;
  heading: number | undefined;
  headingStale: boolean;
  /** Speed unit pref (speed only; the OAT follows the TEMP pref, prefs.tempUnit). */
  unit?: 'mph' | 'kph';
  /** Hero v2 key from the mount ('' = off; else which hero parts are on screen): Korry caps on, plate / rail measured. */
  hero?: string;
}

export function CjV2Layer({ layout, park, demo, motion, heading, headingStale, hero = '' }: CjV2LayerProps) {
  const selfRef = useRef<HTMLDivElement>(null);
  const geo = useGeo(selfRef, layout, hero);
  const view = useSyncExternalStore(subscribeMapView, getMapView, getMapView);
  const wxRadar = useSyncExternalStore(subscribeWxRadar, getWxRadar, getWxRadar);
  const prefs = useSyncExternalStore(subscribeCjPrefs, getCjPrefs, getCjPrefs);
  const cfg = useSyncExternalStore(subscribeCjConfig, getCjConfig, getCjConfig);
  const shell = useSyncExternalStore(onPackShellState, getPackShellState, getPackShellState);
  const compass = useSyncExternalStore(subscribeCompass, getCompassSnapshot, getCompassSnapshot);
  const preferTaps = useSyncExternalStore(subscribePreferTaps, getPreferTaps, getPreferTaps);
  const sys = useSystemReducedMotion();
  const [look] = useCarrierJetVariant();
  const reduced = reducedMotion(prefs, sys || !motion);
  const [say, setSay] = useState('');
  const phone = layout === 'portrait' || layout === 'phone-landscape';
  useEffect(() => registerCjConfigHost(), []);

  // engine hooks (guarded; no-ops on the base engine)
  const firstPrefs = useRef(true);
  useEffect(() => {
    if (firstPrefs.current) {
      firstPrefs.current = false;
      return;
    }
    const { startMode: _s, ...rest } = prefs;
    sendPackEngineCommand(ID.id, { type: 'jet-prefs', prefs: rest as unknown as Record<string, string | boolean> });
  }, [prefs]);
  useEffect(() => sendPackEngineCommand(ID.id, { type: 'radar', on: view.radar }), [view.radar]);
  // RADAR warm-up hum: once per OFF → ON (plate switch or CONFIG tile); never on OFF, mount / restore, or while muted
  const prevRadar = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const c = radarCue(prevRadar.current, view.radar, shell.muted);
    prevRadar.current = view.radar;
    if (c) cue(c);
  }, [view.radar]); // eslint-disable-line react-hooks/exhaustive-deps
  // MORE sheet (the MORE edge key): the old MORE tray's items + the moved NAV switches' homes
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!sheetRef.current?.contains(t) && !t?.closest?.('[data-key="more"]')) setMoreOpen(false);
    };
    window.addEventListener('keydown', k);
    document.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('keydown', k);
      document.removeEventListener('pointerdown', away);
    };
  }, [moreOpen]);
  useEffect(() => {
    if (moreOpen) sheetRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [moreOpen]);

  const ctx: ConfigCtx = useMemo(
    () => ({ park, muted: shell.muted, look, map: view, prefs, ui: shell.connected ? shell.ui : undefined, compass: { available: compassFlowAvailable(layout), state: compass.state }, a11y: { preferTaps } }),
    [park, shell, look, view, prefs, layout, compass.state, preferTaps],
  );
  const page = CJ_CONFIG[cfg.page];
  const items = visibleItems(page, ctx);
  // tile slots by position (map-first swaps COMPASS ⇄ ACCEL, the slots stay put); the right bank is the bottom-right strip
  const order = cellOrderFor(geo?.mapFirst);
  const bank = rightBankFor(geo?.mapFirst);
  const slotBoxes: Box[] = geo?.board2 && geo.cells ? order.map((id) => geo.cells![id]) : geo ? gridBoxes(geo.board, Math.min(items.length + 1, 12)) : [];
  const slots = geo?.board2 ? TILE_SLOTS : slotBoxes.length;
  const paged = pageTiles(items, Math.max(2, slots), cfg.sub);
  // CONFIG headers: each relabelled cell names the page its tile opens (blank if not a page; Drive name if no tile)
  const hdr: Partial<Record<ConfigHeaderCell, string>> = {};
  if (cfg.open) for (const c of CONFIG_HEADER_CELLS) {
    const h = configCellHeader(paged.tiles[order.indexOf(c)], CJ_CONFIG);
    if (h !== undefined) hdr[c] = h;
  }

  const apply = (e: ConfigEffect) => {
    switch (e.type) {
      case 'page': cue('pageChange'); return setCjConfig({ page: e.page, sub: 0 });
      case 'rtn': cue('pageChange'); return cfg.page === 'home' ? closeCjConfig() : setCjConfig({ page: 'home', sub: 0 });
      case 'nav': closeCjConfig(); return void requestPackShell({ type: 'nav', action: e.action });
      case 'ui': return void requestPackShell({ type: 'set-ui', partial: e.partial });
      case 'mute': return void requestPackShell({ type: 'toggle-mute' });
      case 'prefs': return void setCjPrefs(e.partial as Partial<CjPrefs>);
      case 'map': return setMapView(e.next);
      // the skin's own store (same key the board's LOOK keys write)
      case 'look': return writeCarrierJetVariant(e.id as CarrierJetVariant);
      case 'retry-gps': return void requestPackShell({ type: 'retry-gps' });
      case 'compass': return toggleCompass();
      case 'prefer-taps': return void setPreferTaps(e.on);
      case 'info': return setSay(e.text);
    }
  };
  const runTile = (it: ConfigItem | 'next') => {
    if (it === 'next') {
      cue('cursorStep');
      return setCjConfig({ sub: cfg.sub + 1 });
    }
    const why = disabledReason(it, ctx);
    if (why) return setSay(`${it.label}: ${why}`);
    const e = runItem(it, ctx);
    if (!e) return;
    if (e.type !== 'page' && e.type !== 'rtn') cue('selectConfirm');
    apply(e);
  };
  const onMapKey = (id: MapKeyId) => {
    cue('bezelPress');
    setMapView(applyMapKey(view, id));
  };
  const onKey = (cell: CellId, k: EdgeKey) => {
    if (k.reason) {
      cue('bezelPress');
      return setSay(`${k.legend}: ${k.reason}`);
    }
    switch (k.id) {
      case 'drive':
        // DRIVE = RTN to the board (closes CONFIG and the MORE sheet); on the board it is the current page
        cue('bezelPress');
        setMoreOpen(false);
        if (cfg.open) return closeCjConfig();
        return setSay('Drive: board showing');
      case 'more': cue('bezelPress'); return setMoreOpen((o) => !o);
      case 'wx':
        cue('bezelPress');
        setWxRadar(!wxRadar);
        return setSay(`WX radar ${wxRadar ? 'off' : 'on'}`);
      case 'config': cue('pageChange'); setMoreOpen(false); return setCjConfig({ open: true, page: 'home', sub: 0 });
      case 'rtn': return apply({ type: 'rtn' });
      case 'prev': cue('cursorStep'); return setCjConfig({ sub: cfg.sub - 1 });
      case 'next': cue('cursorStep'); return setCjConfig({ sub: cfg.sub + 1 });
      case 'sel': {
        const i = order.indexOf(cell);
        const t = paged.tiles[i];
        if (t) runTile(t);
        return;
      }
      default: return onMapKey(k.id);
    }
  };
  // Escape closes CONFIG
  useEffect(() => {
    if (!cfg.open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCjConfig();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [cfg.open]);
  useEffect(() => {
    if (!say) return;
    const t = setTimeout(() => setSay(''), 4000);
    return () => clearTimeout(t);
  }, [say]);

  const wxValue = useWxValue();
  useWxPoller(!!geo?.board2 && !phone);
  // not measured yet: GridLayer renders the bare root (className only) so the host can be measured
  if (!geo) return <GridLayer ref={selfRef} className="cjv2" spec={CJ_GRID} layout={layout} cells={null} ready={false} reduced={reduced} />;
  const cells = geo.cells;
  const tileFor = (cell: CellId) => {
    const t = paged.tiles[order.indexOf(cell)];
    if (!t) return null;
    return t === 'next' ? { label: 'next tiles' } : { label: t.label, reason: disabledReason(t, ctx) };
  };
  const edge = geo.board2 && cells && !phone;
  // weather: Board 2 only (MATRIX look), in the COMPASS cell's top-left corner
  const wx = geo.board2 && !phone ? wxView(wxValue, oatTempUnit(prefs)) : null;
  // edge-key rails (grid rail slots): every key cell; the drive window drops the top row's strips but SPEED's (they sit in the ENG strip)
  // hero v2: every live key's blank cap carries a Korry split legend (function above, state below; decoration only)
  const capCtx: CapCtx = { zoom: view.zoom, range: view.range, northUp: view.northUp, terr: view.mode === 'terr', radar: view.radar, wx: wxRadar, driveActive: !cfg.open };
  const railCells = KEY_CELLS.filter((c) => !(layout === 'window' && ((geo.mapFirst ? TOP_CELLS_MAP_FIRST : TOP_CELLS).includes(c) && c !== 'speed' || c === 'eng')));
  return (
    <GridLayer ref={selfRef} className="cjv2" spec={CJ_GRID} layout={layout} cells={cells} ready reduced={reduced} railCells={edge ? railCells : []} data-config={cfg.open || undefined} data-hdr-sweep={hdr.sweep !== undefined || undefined} data-hdr-compass={hdr.compass !== undefined || undefined}>
      {cells && (
        <>
          <AccelCell box={cells.accel} demo={demo} reduced={reduced} header={hdr.accel} />
          <MapCell box={cells.map} view={view} heading={heading} headingStale={headingStale} reduced={reduced} live={{ demo, park, hdgRef: prefs.hdgRef }} wx={wx} wxRadar={edge ? wxRadar : false} header={hdr.map} />
          <div className="cjv2-hdgcell" style={boxStyle(cells.compass)}><Suspense fallback={null}><CjHeadingReadout heading={heading} headingStale={headingStale} hdgRef={prefs.hdgRef} /></Suspense></div>
          {wx && <CjWxReadout box={cells.compass} view={wx} />}
        </>
      )}
      {cfg.open && (
        <div className="cjv2-config" role="dialog" aria-label={`Config, ${page.title}${paged.subs > 1 ? `, ${cfg.sub % paged.subs + 1} of ${paged.subs}` : ''}`}>
          {cells && (['sweep', 'compass'] as const).map((c) => hdr[c] !== undefined && (
            <span key={c} className="cjv2-lab cjv2-config-hdr" data-cell={c} data-blank={hdr[c] ? undefined : true} style={{ left: cells[c].left + 4, top: cells[c].top - 16 }} aria-hidden="true">{hdr[c] || '\u00a0'}</span>
          ))}
          {cells && <span className="cjv2-config-title" style={{ left: cells.mach.left, top: cells.mach.top - 16, width: (geo.mapFirst ? cells.vdi : cells.accel).left + (geo.mapFirst ? cells.vdi : cells.accel).width - cells.mach.left }} aria-hidden="true">{cfg.page === 'home' ? 'CONFIG' : `CONFIG › ${page.title}`}</span>}
          {paged.tiles.map((t, i) =>
            slotBoxes[i] ? <Tile key={t === 'next' ? 'next' : t.id} it={t} c={ctx} box={slotBoxes[i]} onRun={runTile} next={`${(((cfg.sub % paged.subs) + paged.subs) % paged.subs) + 1} of ${paged.subs}`} /> : null,
          )}
        </div>
      )}
      {edge &&
        railCells.map((cell) => {
          // drive window: SPEED's keys sit in the ENG strip (no top key row; see carrier-jet-v2.css)
          const b = layout === 'window' && cell === 'speed' ? cells.eng : cells[cell];
          const kctx = { map: view, moreOpen, config: cfg.open ? { tiles: Object.fromEntries(order.map((c) => [c, tileFor(c)])), subs: paged.subs } : null, wx: { on: wxRadar, slot: wxSlot(cells.map.width, view) }, bank };
          const n = stripCount(cell, b.width, kctx);
          const keys = cellKeys(cell, n, kctx);
          const xs = keyXs(b, n);
          const top = railTop(b, geo.gap);
          return (
            <div key={cell} className="cjv2-keys" data-cell={cell} {...(keys.some((k) => k?.legend) ? { role: 'group', 'aria-label': `${(hdr as Partial<Record<CellId, string>>)[cell]?.toLowerCase() || cell} keys` } : { 'aria-hidden': true })}>
              {keys.map((k, i) => (
                // no action (no key or no legend): no cap and no legend well, plain rail metal in the same box (zero shift), not focusable,
                // hidden from VoiceOver (Meghan: dead caps under FLIGHT / AOA / VDI / COMPASS / WING SWEEP read as broken keys)
                k?.legend ? (
                  <div key={i} className="cjv2-key" style={{ left: xs[i], top, width: KEY_W, height: KEY_H }} data-key={k.id} data-reason={k.reason ? true : undefined} data-unlit={k.unlit || undefined}>
                    <BezelKey legend={k.legend} active={hero ? heroKeyActive(k.id, !!k.active) : !!k.active} ariaLabel={k.ariaLabel} onPress={() => onKey(cell, k)} />
                    {hero && <KorryCap cap={splitCap(k.id, capCtx)} />}
                  </div>
                ) : (
                  <div key={i} className="cjv2-key" style={{ left: xs[i], top, width: KEY_W, height: KEY_H }} data-rail="" data-reason={cell === bank && i >= SPARE_INDEX ? 'spare' : undefined} aria-hidden="true" />
                )
              ))}
            </div>
          );
        })}
      {moreOpen && edge && (() => {
        const b = cells[bank];
        const tray = cjNavItems({ current: 'drive', muted: shell.muted, moreOpen: true }).overflow;
        const go = (f: () => void) => {
          cue('selectConfirm');
          setMoreOpen(false);
          f();
        };
        return (
          <div ref={sheetRef} className="cjv2-more" role="dialog" aria-label="More" style={{ right: geo.board.left + geo.board.width - (b.left + b.width), bottom: `calc(100% - ${b.top + b.height}px)` }}>
            <span className="cjv2-more-h" aria-hidden="true">MORE</span>
            <button type="button" onClick={() => go(() => setCjConfig({ open: true, page: 'options', sub: 0 }))} aria-label="Options, opens config options">OPTIONS ▸</button>
            <button type="button" role="switch" aria-checked={shell.muted} aria-label="Audio mute" onClick={() => { cue('selectConfirm'); apply({ type: 'mute' }); }}>MUTE · {shell.muted ? 'ON' : 'OFF'}</button>
            {tray.map((it) => {
              const a = cjNavAction(it.id);
              return a ? <button key={it.id} type="button" onClick={() => go(() => requestPackShell({ type: 'nav', action: a }))}>{it.label.toUpperCase()} ▸</button> : null;
            })}
          </div>
        );
      })()}
      <p className="cjv2-say" role="status" aria-live="polite">{say}</p>
    </GridLayer>
  );
}
