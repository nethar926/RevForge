import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { BezelKey } from '../../skins/carrier-jet/parts/index';
import { useCarrierJetVariant, writeCarrierJetVariant, type CarrierJetVariant } from '../../skins/carrier-jet';
import ID from '../carrier-jet.identity';
import { getPackShellState, onPackShellState, requestPackShell, sendPackEngineCommand, type PackEngineCommand } from '../runtime';
import { latestGpsFix, subscribeGpsFixes } from '../../hooks/gpsFixes';
import { compassFlowAvailable, getCompassSnapshot, subscribeCompass, toggleCompass } from '../heading';
import type { RfLayout } from '../layout';
import { ACCEL_INIT, accelEase, accelStep, accelTarget, accelText, type AccelState } from '../carrier-jet/accelBall';
import { board2Cells, keyCount, keyXs, KEY_H, KEY_W, TOP_CELLS, type Box, type CellId } from '../carrier-jet/geometry';
import { applyMapKey, getMapView, radarCue, rangeRings, setMapView, subscribeMapView, type MapKeyId, type MapView } from '../carrier-jet/mapView';
import { getCjPrefs, reducedMotion, setCjPrefs, subscribeCjPrefs, type CjPrefs } from '../carrier-jet/cjPrefs';
import { closeCjConfig, getCjConfig, registerCjConfigHost, setCjConfig, subscribeCjConfig } from '../carrier-jet/configStore';
import { CELL_ORDER, TILE_SLOTS } from '../carrier-jet/configCells';
import { cellKeys, KEY_CELLS, RIGHT_BANK, SPARE_INDEX, type EdgeKey } from '../carrier-jet/edgeKeys';
import { cjNavAction, cjNavItems } from '../carrier-jet.nav';
import { disabledReason, itemAria, itemValue, MAP_CREDIT, pageTiles, runItem, visibleItems, type ConfigCtx, type ConfigEffect, type ConfigItem } from '../configTable';
import { CJ_CONFIG } from '../carrier-jet/configPages';

const sysReduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const subSysReduced = (f: () => void) => {
  if (typeof matchMedia === 'undefined') return () => undefined;
  const m = matchMedia('(prefers-reduced-motion: reduce)');
  m.addEventListener?.('change', f);
  return () => m.removeEventListener?.('change', f);
};

/** Guarded jet cue (engine playJetCue?.(); silent on the base engine). Switch sound off → no cue. */
function cue(c: Extract<PackEngineCommand, { type: 'jet-cue' }>['cue']) {
  if (!getCjPrefs().switchSound && c !== 'radarOn') return;
  sendPackEngineCommand(ID.id, { type: 'jet-cue', cue: c });
}

type Cells = Record<CellId, Box>;
interface Geo {
  board2: boolean;
  cells: Cells | null;
  /** The .cj board rect (fallback CONFIG area for looks without Board 2). */
  board: Box;
  /** Gap between a cell's bottom and its key strip. */
  gap: number;
}
const rel = (r: DOMRect, o: DOMRect): Box => ({ left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height });

/** `selfRef` is the layer's own root; the host (.cjm) is its parent (a parent's ref is not attached yet when a
 * child's layout effect first runs, so the mount's ref can't be read here). */
function useGeo(selfRef: RefObject<HTMLElement | null>, layout: RfLayout): Geo | null {
  const [geo, setGeo] = useState<Geo | null>(null);
  useLayoutEffect(() => {
    const host = selfRef.current?.parentElement ?? null;
    if (!host) return;
    let queued = false;
    let dead = false;
    const read = () => {
      queued = false;
      if (dead) return;
      const root = host.querySelector<HTMLElement>('.cj');
      if (!root) return setGeo(null);
      const o = host.getBoundingClientRect();
      const q = (s: string) => root.querySelector<HTMLElement>(s)?.getBoundingClientRect();
      const board2 = root.dataset.variant === 'carrier-jet' && (root.dataset.layout === 'reflow' || root.dataset.layout === 'full') && (layout === 'board' || layout === 'window');
      const board = rel(root.getBoundingClientRect(), o);
      let cells: Cells | null = null;
      let gap = 4;
      if (board2) {
        const speed = q('.cj-a-speed'), mach = q('.cj-a-gr > :first-child'), rpm = q('.cj-a-gr > :last-child');
        const mids = root.querySelectorAll<HTMLElement>(':scope .cj-a-mid > div.cj-crt');
        const vdi = mids[0]?.getBoundingClientRect(), compass = mids[1]?.getBoundingClientRect();
        const sweep = q('.cj-a-sweep'), eng = q('.cj-a-eng');
        if (speed && mach && rpm && vdi && compass && sweep && eng) {
          cells = board2Cells({ speed: rel(speed, o), rpm: rel(rpm, o), mach: rel(mach, o), vdi: rel(vdi, o), sweep: rel(sweep, o), eng: rel(eng, o), compass: rel(compass, o) });
          const body = root.querySelector<HTMLElement>('.cj-body');
          gap = body ? parseFloat(getComputedStyle(body).rowGap) || 4 : 4;
        }
      }
      setGeo((p) => {
        const n = { board2: !!cells, cells, board, gap };
        return p && JSON.stringify(p) === JSON.stringify(n) ? p : n;
      });
    };
    // microtask, not rAF: measured after the DOM change settles, and works under paused animation clocks
    const sched = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(read);
    };
    read();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sched);
    ro?.observe(host);
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sched);
    mo?.observe(host, { subtree: true, attributes: true, attributeFilter: ['data-variant', 'data-layout', 'class'], childList: true });
    window.addEventListener('resize', sched);
    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', sched);
      dead = true;
    };
  }, [selfRef, layout]);
  return geo;
}
const boxStyle = (b: Box): CSSProperties => ({ left: b.left, top: b.top, width: b.width, height: b.height });

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

function AccelCell({ box, demo, reduced }: { box: Box; demo: boolean; reduced: boolean }) {
  const a = useAccel(demo, reduced);
  const W = 100, H = 60;
  const cx = 50 + a.x * 38;
  // ball rides a shallow arc (inclinometer tube)
  const cy = 30 + Math.pow(a.x, 2) * 12;
  return (
    <div className="cjv2-cell cjv2-acc" data-live={a.live} style={boxStyle(box)}>
      <span className="cjv2-lab" aria-hidden="true">ACCEL</span>
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
function MapCell({ box, view, heading, headingStale, reduced }: { box: Box; view: MapView; heading: number | undefined; headingStale: boolean; reduced: boolean }) {
  const [info, setInfo] = useState(false);
  const hdg = heading == null ? '---' : String(Math.round(heading) % 360).padStart(3, '0');
  return (
    <div className="cjv2-cell cjv2-map" data-radar={view.radar} style={boxStyle(box)}>
      <span className="cjv2-lab" aria-hidden="true">{view.radar ? 'RADAR' : 'MAP'}</span>
      <div className="cjv2-crt">
        {/* Alerts: reserved top third (no alert source on base) */}
        <div className="cjv2-alerts" role="status" aria-live="polite" />
        {view.radar ? (
          <div className="cjv2-scope" data-motion={reduced ? 'static' : 'live'} role="img" aria-label={`Radar scope, ${view.range} mile range, ${view.mode === 'map' ? 'map' : 'terrain'} mode, heading ${hdg}, no returns`}>
            <svg viewBox="-50 -50 100 100" aria-hidden="true">
              <circle r="46" className="cjv2-ring-edge" />
              {rangeRings(view.range).map((r) => (
                <circle key={r.mi} r={46 * r.r} className="cjv2-ring" />
              ))}
              <path d="M0 -50 L-4 -43 L4 -43 Z" className="cjv2-bug" />
              <path d="M0 -4 L3 4 L0 2 L-3 4 Z" className="cjv2-own" />
            </svg>
            {/* sweep: its own HTML-level svg (same viewBox + inset), rotated as an element about its CSS box centre = the
                viewBox centre under meet. No CSS transform on SVG children (transform-box: view-box put the pivot at a
                corner, Wilson Oct 16). Reduce Motion: static beam, no trail. */}
            <svg className="cjv2-sweepsvg" viewBox="-50 -50 100 100" aria-hidden="true">
              {!reduced && <path className="cjv2-trail" d="M0 0 L0 -46 A46 46 0 0 0 -32.5 -32.5 Z" />}
              <line x1="0" y1="0" x2="0" y2="-46" className="cjv2-beam" />
            </svg>
            <span className="cjv2-corner cjv2-tl">{view.mode === 'map' ? 'MAP' : 'TERR'}</span>
            <span className="cjv2-corner cjv2-tr" data-stale={headingStale}>{hdg}</span>
            <span className="cjv2-corner cjv2-bl">{view.range} MI</span>
            <span className="cjv2-corner cjv2-br">NO RETURNS</span>
          </div>
        ) : (
          <div className="cjv2-hsd" role="img" aria-label={`Map, ${view.northUp ? 'north up' : 'track up'}, ${view.zoom} mile scale, no map data`}>
            <svg viewBox="-50 -50 100 100" aria-hidden="true">
              <g transform={`rotate(${view.northUp || heading == null ? 0 : -heading})`}>
                {[-30, -15, 0, 15, 30].map((v) => (
                  <g key={v}>
                    <line x1={v} y1="-46" x2={v} y2="46" className="cjv2-grid" />
                    <line x1="-46" y1={v} x2="46" y2={v} className="cjv2-grid" />
                  </g>
                ))}
                <text x="0" y="-30" className="cjv2-n">N</text>
              </g>
              <path d={`M0 -5 L4 5 L0 2.5 L-4 5 Z`} className="cjv2-own" transform={`rotate(${view.northUp && heading != null ? heading : 0})`} />
            </svg>
            <span className="cjv2-corner cjv2-tl">{view.northUp ? 'N-UP' : 'TRK-UP'}</span>
            <span className="cjv2-corner cjv2-bl">{view.zoom} MI</span>
            <span className="cjv2-corner cjv2-br">NO MAP DATA</span>
          </div>
        )}
        <button type="button" className="cjv2-info" aria-expanded={info} aria-label="Map credit" onClick={() => setInfo((v) => !v)}>i</button>
        {info && <p className="cjv2-attr" role="note">{MAP_CREDIT}</p>}
      </div>
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
}

export function CjV2Layer({ layout, park, demo, motion, heading, headingStale }: CjV2LayerProps) {
  const selfRef = useRef<HTMLDivElement>(null);
  const geo = useGeo(selfRef, layout);
  const view = useSyncExternalStore(subscribeMapView, getMapView, getMapView);
  const prefs = useSyncExternalStore(subscribeCjPrefs, getCjPrefs, getCjPrefs);
  const cfg = useSyncExternalStore(subscribeCjConfig, getCjConfig, getCjConfig);
  const shell = useSyncExternalStore(onPackShellState, getPackShellState, getPackShellState);
  const compass = useSyncExternalStore(subscribeCompass, getCompassSnapshot, getCompassSnapshot);
  const sys = useSyncExternalStore(subSysReduced, sysReduced, () => false);
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
    () => ({ park, muted: shell.muted, look, map: view, prefs, ui: shell.connected ? shell.ui : undefined, compass: { available: compassFlowAvailable(layout), state: compass.state } }),
    [park, shell, look, view, prefs, layout, compass.state],
  );
  const page = CJ_CONFIG[cfg.page];
  const items = visibleItems(page, ctx);
  const slotBoxes: Box[] = geo?.board2 && geo.cells ? CELL_ORDER.map((id) => geo.cells![id]) : geo ? gridBoxes(geo.board, Math.min(items.length + 1, 12)) : [];
  const slots = geo?.board2 ? TILE_SLOTS : slotBoxes.length;
  const paged = pageTiles(items, Math.max(2, slots), cfg.sub);

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
      case 'config': cue('pageChange'); setMoreOpen(false); return setCjConfig({ open: true, page: 'home', sub: 0 });
      case 'rtn': return apply({ type: 'rtn' });
      case 'prev': cue('cursorStep'); return setCjConfig({ sub: cfg.sub - 1 });
      case 'next': cue('cursorStep'); return setCjConfig({ sub: cfg.sub + 1 });
      case 'sel': {
        const i = CELL_ORDER.indexOf(cell);
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

  if (!geo) return <div ref={selfRef} className="cjv2" />;
  const cells = geo.cells;
  const tileFor = (cell: CellId) => {
    const t = paged.tiles[CELL_ORDER.indexOf(cell)];
    if (!t) return null;
    return t === 'next' ? { label: 'next tiles' } : { label: t.label, reason: disabledReason(t, ctx) };
  };
  const edge = geo.board2 && cells && !phone;
  return (
    <div ref={selfRef} className="cjv2" data-config={cfg.open || undefined} data-motion={reduced ? 'static' : 'live'}>
      {cells && (
        <>
          <AccelCell box={cells.accel} demo={demo} reduced={reduced} />
          <MapCell box={cells.map} view={view} heading={heading} headingStale={headingStale} reduced={reduced} />
        </>
      )}
      {cfg.open && (
        <div className="cjv2-config" role="dialog" aria-label={`Config, ${page.title}${paged.subs > 1 ? `, ${cfg.sub % paged.subs + 1} of ${paged.subs}` : ''}`}>
          {cells && <span className="cjv2-config-title" style={{ left: cells.mach.left, top: cells.mach.top - 16, width: cells.accel.left + cells.accel.width - cells.mach.left }} aria-hidden="true">{cfg.page === 'home' ? 'CONFIG' : `CONFIG › ${page.title}`}</span>}
          {paged.tiles.map((t, i) =>
            slotBoxes[i] ? <Tile key={t === 'next' ? 'next' : t.id} it={t} c={ctx} box={slotBoxes[i]} onRun={runTile} next={`${(((cfg.sub % paged.subs) + paged.subs) % paged.subs) + 1} of ${paged.subs}`} /> : null,
          )}
        </div>
      )}
      {edge &&
        KEY_CELLS.filter((c) => !(layout === 'window' && (TOP_CELLS.includes(c) && c !== 'speed' || c === 'eng'))).map((cell) => {
          // drive window: SPEED's keys sit in the ENG strip (no top key row; see carrier-jet-v2.css)
          const b = layout === 'window' && cell === 'speed' ? cells.eng : cells[cell];
          const n = keyCount(b.width);
          const keys = cellKeys(cell, n, { map: view, moreOpen, config: cfg.open ? { tiles: Object.fromEntries(CELL_ORDER.map((c) => [c, tileFor(c)])), subs: paged.subs } : null });
          const xs = keyXs(b, n);
          const top = b.top + b.height + geo.gap;
          return (
            <div key={cell} className="cjv2-keys" data-cell={cell} role="group" aria-label={`${cell} keys`}>
              {keys.map((k, i) => (
                <div key={i} className="cjv2-key" style={{ left: xs[i], top, width: KEY_W, height: KEY_H }} data-key={k?.id} data-reason={k?.reason ? true : cell === RIGHT_BANK && i === SPARE_INDEX && !k ? 'spare' : undefined}>
                  <BezelKey legend={k?.legend} active={!!k?.active} ariaLabel={k?.ariaLabel} onPress={k ? () => onKey(cell, k) : undefined} />
                </div>
              ))}
            </div>
          );
        })}
      {moreOpen && edge && (() => {
        const b = cells[RIGHT_BANK];
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
    </div>
  );
}
