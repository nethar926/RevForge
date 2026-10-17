/** CJ MATRIX MAP cell live map (3.5): status, MAG/TRUE, T/M pref, MAP/TERR, ranges, lazy-load, credit, fix easing, labels;
 * cold-start shelf discoverability (auto-open, tuck, toggle off, START legend). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { cjMapStatus, CJ_MAP_CREDIT, zoomForRangeMi } from '../src/skins/carrier-jet/map/style.ts';
import { magneticDeclinationDeg } from '../src/skins/carrier-jet/map/declination.ts';
import { bugPoint, classifyMapError, easedPosition, headingPair, headingSpeech, mapAria, ownShip, placeLabels, pushFix } from '../src/packs/carrier-jet/liveMap.ts';
import { applyMapKey, MAP_VIEW_DEFAULT, MAP_ZOOMS, mapKeys, parseMapView, setMapView, getMapView, resetMapViewCache } from '../src/packs/carrier-jet/mapView.ts';
import { CJ_PREFS_DEFAULT, CJ_PREFS_KEY, getCjPrefs, parseCjPrefs, resetCjPrefsCache, setCjPrefs } from '../src/packs/carrier-jet/cjPrefs.ts';
import { CJ_CONFIG } from '../src/packs/carrier-jet/configPages.ts';
import { ABOUT_TEXT, MAP_CREDIT, runItem, type ConfigCtx } from '../src/packs/configTable.ts';
import { cellKeys, RIGHT_BANK, SPARE_INDEX } from '../src/packs/carrier-jet/edgeKeys.ts';
import { SHELF_START_ARIA, shelfAutoStep, shelfStartLit } from '../src/packs/carrier-jet/coldStart.ts';
import { storageKey } from '../src/lib/storageKey.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
const ctx = (over: Partial<ConfigCtx> = {}) => ({ park: true, muted: false, look: 'carrier-jet', map: { ...MAP_VIEW_DEFAULT }, prefs: { ...CJ_PREFS_DEFAULT }, ...over }) as ConfigCtx;

test('status: GPS ACQ / DEMO / NO TILES (offline or network) / NO MAP DATA (style or source error online) / blank', () => {
  const ok = { gps: true, demo: false, online: true, tilesFailed: false as const };
  assert.equal(cjMapStatus(ok), '');
  assert.equal(cjMapStatus({ ...ok, gps: false }), 'GPS ACQ');
  assert.equal(cjMapStatus({ ...ok, demo: true }), 'DEMO');
  assert.equal(cjMapStatus({ ...ok, online: false }), 'NO TILES');
  assert.equal(cjMapStatus({ ...ok, tilesFailed: 'network' }), 'NO TILES');
  assert.equal(cjMapStatus({ ...ok, tilesFailed: 'error' }), 'NO MAP DATA');
  // MapLibre error events → tile state
  assert.equal(classifyMapError({ error: { status: 0, message: 'AJAXError' } }, true), 'network');
  assert.equal(classifyMapError({ error: { message: 'Failed to fetch' } }, true), 'network');
  assert.equal(classifyMapError({ error: { status: 500, message: 'x' }, sourceId: 'ofm' }, false), 'network', 'offline: always NO TILES');
  assert.equal(classifyMapError({ error: { status: 404, message: 'Not Found' }, tile: {} }, true), null, 'one missing tile is not an outage');
  assert.equal(classifyMapError({ error: { status: 500, message: 'style' } }, true), 'error');
  assert.match(mapAria({ northUp: false, zoom: 2, mode: 'terr' }, 'NO TILES', 'heading 047 magnetic, 040 true'), /^Map, track up, terrain, 2 miles range, no tiles, offline, heading 047 magnetic/);
  assert.match(mapAria({ northUp: true, zoom: 1, mode: 'map' }, '', null), /north up, map, 1 mile range, live/);
  assert.match(mapAria({ northUp: true, zoom: 5, mode: 'map' }, 'GPS ACQ', null), /acquiring GPS/);
});

test('MAG = TRUE − declination (east positive) at the fix; Jacksonville ≈ −6.97° so MAG reads higher; never hard-coded', () => {
  const jax = { lat: 30.22233, lon: -81.68625 };
  const p = headingPair(40, jax, new Date('2026-10-16T12:00:00Z'));
  assert.ok(p.decl! < -6.5 && p.decl! > -7.5, `decl ${p.decl}`);
  assert.ok(Math.abs(p.m! - (40 - p.decl!)) < 1e-9, 'MAG = TRUE − decl');
  assert.ok(p.m! > p.t, 'west declination → MAG higher');
  assert.equal(Math.round(p.m!), 47);
  // east declination (Seattle-ish is east) → MAG lower; differs by place, so it is computed, not a constant
  const sea = headingPair(40, { lat: 47.6, lon: -122.3 });
  assert.ok(sea.decl! > 10 && sea.m! < sea.t);
  assert.notEqual(Math.round(magneticDeclinationDeg(35.6, -82.55)), Math.round(magneticDeclinationDeg(47.6, -122.3)));
  assert.equal(headingPair(5, { lat: 47.6, lon: -122.3 }).m! > 300, true, 'wraps below 0');
  assert.equal(headingPair(40, null).m, null, 'no fix: TRUE only');
  assert.equal(headingSpeech({ t: 40, m: 47 }, 'M'), 'heading 047 magnetic, 040 true');
  assert.equal(headingSpeech({ t: 40, m: 47 }, 'T'), 'heading 040 true, 047 magnetic');
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.doesNotMatch(live + src('packs/carrier-jet/liveMap.ts'), /6\.97|\bdecl\w*\s*[:=]\s*-?\d/);
});

test('T/M pref: TLM › UNITS › HDG REF, default M (magnetic), persisted with the CJ prefs', () => {
  assert.equal(CJ_PREFS_DEFAULT.hdgRef, 'M');
  assert.equal(parseCjPrefs(null).hdgRef, 'M');
  assert.equal(parseCjPrefs('{"hdgRef":"T"}').hdgRef, 'T');
  assert.equal(parseCjPrefs('{"hdgRef":"x"}').hdgRef, 'M');
  const it = CJ_CONFIG.telemetry.items.find((i) => i.id === 'hdg')!;
  assert.equal(it.group, 'UNITS');
  assert.equal(it.label, 'HDG REF');
  assert.equal(it.value!(ctx()), 'MAG');
  assert.equal(it.aria!(ctx()), 'Heading reference, magnetic. Compass shows magnetic heading');
  assert.deepEqual(runItem(it, ctx({ park: false })), { type: 'prefs', partial: { hdgRef: 'T' } }, 'a view setting: live while moving');
  const kv = mem();
  resetCjPrefsCache();
  setCjPrefs({ hdgRef: 'T' }, kv);
  assert.equal(JSON.parse(kv.getItem(storageKey(CJ_PREFS_KEY))!).hdgRef, 'T');
  resetCjPrefsCache();
  assert.equal(parseCjPrefs(kv.getItem(storageKey(CJ_PREFS_KEY))).hdgRef, 'T', 'restored after reload');
  resetCjPrefsCache();
  assert.equal(getCjPrefs().hdgRef, 'M');
});

test('MAP / TERR: the mode key on the live map (4th key), persisted; TERR = hillshade visible, switched without a rebuild', () => {
  const keys = mapKeys(MAP_VIEW_DEFAULT).map((k) => k.legend);
  assert.deepEqual(keys, ['ZM+', 'ZM−', 'N/TRK-UP', 'MAP/TERR']);
  assert.deepEqual(cellKeys('map', 4, { map: MAP_VIEW_DEFAULT, config: null }).map((k) => k?.id), ['zoomIn', 'zoomOut', 'orient', 'mode']);
  assert.equal(cellKeys('map', 4, { map: { ...MAP_VIEW_DEFAULT, mode: 'terr' }, config: null })[3]!.active, true);
  const t = applyMapKey(MAP_VIEW_DEFAULT, 'mode');
  assert.equal(t.mode, 'terr');
  const kv = mem();
  setMapView(t, kv);
  assert.equal(parseMapView(kv.getItem(storageKey('revforge.pack.carrier-jet.mapView'))).mode, 'terr');
  resetMapViewCache();
  assert.equal(getMapView().mode, 'map');
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.match(live, /setLayoutProperty\('hillshade', 'visibility', view\.mode === 'terr' \? 'visible' : 'none'\)/);
  assert.match(live, /\{view\.zoom\} MI · \{view\.mode === 'terr' \? 'TERR' : 'MAP'\}/);
  assert.match(mapAria({ northUp: true, zoom: 5, mode: 'terr' }, '', null), /terrain/);
});

test('ranges 1 / 2 / 5 / 10 MI (ZM+ / ZM−, clamped, end stops say why); zoom = 512px-tile constant', () => {
  assert.deepEqual([...MAP_ZOOMS], [1, 2, 5, 10]);
  let v = { ...MAP_VIEW_DEFAULT, zoom: 2 as const };
  v = applyMapKey(v, 'zoomIn'); assert.equal(v.zoom, 1);
  assert.equal(mapKeys(v)[0].disabledReason, 'Already at 1 mile');
  v = applyMapKey(applyMapKey(applyMapKey(v, 'zoomOut'), 'zoomOut'), 'zoomOut'); assert.equal(v.zoom, 10);
  assert.equal(parseMapView('{"zoom":1}').zoom, 1);
  const z = zoomForRangeMi(1, 30.22, 100);
  assert.ok(Math.abs(z - Math.log2((78271.517 * Math.cos(30.22 * Math.PI / 180) * 50) / 1609.344)) < 1e-9);
});

test('lazy-load: maplibre-gl only via dynamic import() in CjLiveMap; no static import anywhere in src; built main chunk clean', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
  walk(new URL('../src', import.meta.url).pathname);
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /^import\s+(?!type\b)[^;]*from\s+['"]maplibre-gl/m, f);
  }
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.match(live, /import\('maplibre-gl'\)/);
  assert.match(live, /^import type \{[^}]+\} from 'maplibre-gl';/m);
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.match(layer, /lazy\(\(\) => import\('\.\/CjLiveMap'\)/, 'the map module itself is a lazy chunk (root main bundle unchanged)');
  assert.doesNotMatch(layer, /^import [^;]*from '\.\/CjLiveMap'/m);
  // optional: a fresh build in dist/ — the entry chunk must not contain MapLibre
  const dist = new URL('../dist/assets', import.meta.url).pathname;
  let entries: string[] = [];
  try { entries = readdirSync(dist).filter((f) => /^index-.*\.js$/.test(f)); } catch { /* no build */ }
  for (const e of entries) assert.doesNotMatch(readFileSync(`${dist}/${e}`, 'utf8'), /maplibregl|MapLibre GL JS/, e);
});

test('credit: MAP_CREDIT exact, = the skin CJ_MAP_CREDIT; popover CSS top 3 / padding 2 5 / line-height 13', () => {
  assert.equal(MAP_CREDIT, '© OpenStreetMap contributors · © OpenMapTiles · Tiles: OpenFreeMap · Terrain: Mapzen / AWS Terrain Tiles (SRTM, USGS and others)');
  assert.equal(MAP_CREDIT, CJ_MAP_CREDIT);
  assert.ok(ABOUT_TEXT.endsWith(MAP_CREDIT));
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(css, /\.cjv2-attr \{ position: absolute; left: 4px; right: 44px; top: 3px; margin: 0; padding: 2px 5px;[^}]*font-size: 11px; line-height: 13px;/);
});

test('fix easing: prev → latest over one interval; Reduce Motion jumps; teleport jumps; jumpTo only, never easeTo', () => {
  let s = pushFix({}, { lat: 30, lon: -81, t: 0 });
  assert.deepEqual(easedPosition(s, 100, false), { lat: 30, lon: -81, k: 1 });
  s = pushFix(s, { lat: 30.0001, lon: -81, t: 800 });
  const mid = easedPosition(s, 1200, false)!;
  assert.ok(Math.abs(mid.lat - 30.00005) < 1e-9 && Math.abs(mid.k - 0.5) < 1e-9);
  assert.equal(easedPosition(s, 1200, true)!.lat, 30.0001, 'reduce motion: the latest fix');
  assert.equal(easedPosition(s, 5000, false)!.k, 1);
  assert.equal(pushFix(s, { lat: 31, lon: -81, t: 1600 }).prev, undefined, '> 2 km: jump');
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.match(live, /map\.jumpTo\(/);
  assert.doesNotMatch(live, /\.(easeTo|flyTo|panTo)\(/);
  assert.match(live, /map\.stop\(\)/);
  assert.match(live, /CJ_MAP_REMOVE_AFTER_HIDDEN_MS/);
  assert.match(live, /IntersectionObserver/);
  assert.doesNotMatch(live, /smoothHeading/, 'bearing = the v3 eased heading (CjHeadingEase), no second smoother');
});

test('own-ship, bug, ≤2 street labels with the BUILD.md collision walk', () => {
  assert.deepEqual(ownShip(200, 100, true), { x: 100, y: 50 });
  assert.equal(ownShip(200, 100, false).y, 67, 'TRK-UP: lower third');
  assert.deepEqual(bugPoint(200, 100, false, 123), { x: 100, y: 5, rot: 0 });
  const e = bugPoint(200, 100, true, 90); assert.equal(Math.round(e.x), 195); assert.equal(Math.round(e.y), 50);
  const pts = (y: number) => Array.from({ length: 20 }, (_, i) => ({ x: 10 + i * 10, y }));
  const m = (s: string) => s.length * 7;
  const L = placeLabels([{ name: 'kestrel rd', pts: pts(30) }, { name: 'harbor ave', pts: pts(70) }, { name: 'third st', pts: pts(52) }], { x: 100, y: 50 }, { w: 200, h: 100 }, [{ x: 0, y: 0, w: 40, h: 20 }], m);
  assert.ok(L.length <= 2);
  assert.ok(L.every((l) => l.name === l.name.toUpperCase()));
  for (const l of L) assert.ok(l.x >= 6 && l.y >= 6 && l.x + l.w <= 194 && l.y + l.h <= 94, 'clear of the 6px edge');
  const own = { x: 88, y: 38, w: 24, h: 24 };
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const L2 = placeLabels([{ name: 'a road', pts: [{ x: 100, y: 50 }] }], { x: 100, y: 50 }, { w: 200, h: 100 }, [own], m);
  assert.equal(L2.length, 0, 'only spot hits own-ship → dropped');
  if (L.length === 2) assert.ok(!hit(L[0], L[1]));
});

test('edge keys: every inert key under COMPASS after DRIVE · MORE is a dim spare (data-reason=spare), incl. the 4th at 1280 / 1256', () => {
  const k = cellKeys(RIGHT_BANK, 4, { map: MAP_VIEW_DEFAULT, config: null });
  assert.deepEqual(k.map((x) => x?.id ?? null), ['drive', 'more', null, null]);
  assert.match(src('packs/mounts/CjV2Layer.tsx'), /cell === RIGHT_BANK && i >= SPARE_INDEX && !k \? 'spare'/);
  assert.equal(SPARE_INDEX, 2);
});

test('cold start shelf: auto-opens once per Park entry with engines off (Tesla), tucks away when live / leaving Park, toggle off = manual', () => {
  const base = { park: true, live: false, on: true, auto: true, tesla: true };
  let r = shelfAutoStep(true, base);
  assert.deepEqual(r, { armed: false, open: true }, 'Park + engines off → open');
  r = shelfAutoStep(r.armed, base);
  assert.equal(r.open, false, 'once per entry: a manual close stays closed');
  assert.deepEqual(shelfAutoStep(false, { ...base, live: true }), { armed: true, open: false }, 'engines live → tuck (the shelf close rule) + re-arm');
  assert.deepEqual(shelfAutoStep(false, { ...base, park: false }), { armed: true, open: false }, 'left Park → tuck + re-arm');
  assert.equal(shelfAutoStep(true, { ...base, auto: false }).open, false, 'toggle off: manual only');
  assert.equal(shelfAutoStep(true, { ...base, tesla: false }).open, false, 'phones keep auto quick start');
  const cs = src('packs/mounts/CjColdStart.tsx');
  // tuck rule (Wilson, shelf reachable at all times): no level close on live / leaving Park; only the completion edge
  assert.doesNotMatch(cs, /if \(\(!park \|\| live \|\| !on\) && shelf !== 'closed'\)/);
  assert.match(cs, /shelfAutoClose\(prev, \{ park, complete: view\.complete, on \}\)/, 'completion-edge auto-close');
  assert.match(cs, /shelfAutoStep\(autoArmed\.current/);
  // START legend: lit until the first successful start, even with auto off
  assert.equal(shelfStartLit({ on: true, firstStartDone: false }), true);
  assert.equal(shelfStartLit({ on: true, firstStartDone: true }), false);
  assert.equal(SHELF_START_ARIA, 'Shelf, start engines here');
  assert.match(cs, /if \(on && live && !prefs\.cjFirstStartDone\) setCjPrefs\(\{ cjFirstStartDone: true \}\)/);
  assert.equal(CJ_PREFS_DEFAULT.shelfAutoOpen, true);
  assert.equal(CJ_PREFS_DEFAULT.cjFirstStartDone, false);
  assert.equal(parseCjPrefs('{"shelfAutoOpen":false,"cjFirstStartDone":true}').shelfAutoOpen, false);
  assert.equal(parseCjPrefs('{"shelfAutoOpen":false,"cjFirstStartDone":true}').cjFirstStartDone, true);
  const it = CJ_CONFIG.options.items.find((i) => i.id === 'shelfAuto')!;
  assert.equal(it.aria!(ctx()), 'Auto-open start shelf in Park, on');
  assert.deepEqual(runItem(it, ctx()), { type: 'prefs', partial: { shelfAutoOpen: false } });
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.doesNotMatch(css, /cjcs-start-glow/, 'START lamp lit steadily: no glow animation (nothing for Reduce Motion to stop)');
  assert.match(css, /--cjcs-leg: max\(11\.2px, calc\(11\.2px \/ \(var\(--hud-scale, 1\) \* var\(--fit-scale, 1\)\)\)\)/, '≥ 11px rendered after scale');
  assert.match(css, /\.cjcs-shelfkey small \{ font-size: var\(--cjcs-leg\)/);
});

test("cold start checklist (Dan's 902c056): engine start steps say Tap, not Hold", () => {
  const js = src('audio/jetColdStart.js');
  assert.match(js, /'Tap left engine start/);
  assert.match(js, /'Tap right engine start/);
  assert.doesNotMatch(js, /'Hold (left|right) engine start/);
});
