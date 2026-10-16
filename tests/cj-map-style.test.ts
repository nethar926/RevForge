import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCjMapStyle, cjMapStatus, shouldRender, zoomForRangeMi,
  CJ_MAP_CREDIT, CJ_MAP_CREDIT_NO_TERRAIN, CJ_MAP_MAX_STREET_LABELS, CJ_MAP_OPTIONS, CJ_MAP_RANGES_MI,
} from '../src/skins/carrier-jet/map/style.ts';

const style = buildCjMapStyle();
const layer = (id: string) => style.layers.find((l) => l.id === id);

test('style v8 with ofm vector + dem terrarium sources, no glyphs/sprite', () => {
  assert.equal(style.version, 8);
  assert.deepEqual(style.sources.ofm, { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });
  assert.equal(style.sources.dem.type, 'raster-dem');
  assert.deepEqual(style.sources.dem.tiles, ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']);
  assert.equal(style.sources.dem.encoding, 'terrarium');
  assert.equal(style.sources.dem.tileSize, 256);
  assert.ok(!('glyphs' in style) && !('sprite' in style));
  assert.equal(layer('background')?.paint?.['background-color'], '#041009');
});

test('no symbol layers; no building/poi/place/transit layers', () => {
  for (const l of style.layers) {
    assert.notEqual(l.type as string, 'symbol', l.id);
    assert.ok(!['building', 'poi', 'place', 'transit', 'transportation_name', 'housenumber', 'aerodrome_label'].includes(l['source-layer'] ?? ''), l.id);
  }
});

test('hillshade under roads, water flat fill + outline', () => {
  const ids = style.layers.map((l) => l.id);
  assert.ok(ids.indexOf('hillshade') < ids.indexOf('road_minor'));
  assert.deepEqual(layer('hillshade')?.paint, {
    'hillshade-shadow-color': '#000', 'hillshade-highlight-color': '#1d5a33', 'hillshade-accent-color': '#041009', 'hillshade-exaggeration': 0.25,
  });
  assert.deepEqual(layer('water')?.paint, { 'fill-color': '#1d5a33', 'fill-opacity': 0.35 });
  assert.equal(layer('water-line')?.paint?.['line-color'], '#2f7a48');
  assert.ok(style.layers.every((l) => !l.paint || !('fill-pattern' in l.paint)));
});

test('every road class mapped with exact width and colour, round caps/joins', () => {
  const want: Record<string, [string, number, string]> = {
    motorway: ['road_motorway', 3.2, '#8dffad'], trunk: ['road_primary', 2.2, '#8dffad'], primary: ['road_primary', 2.2, '#8dffad'],
    secondary: ['road_secondary', 1.6, '#45ad66'], tertiary: ['road_tertiary', 1.1, '#45ad66'],
    minor: ['road_minor', 0.8, '#2f7a48'], residential: ['road_minor', 0.8, '#2f7a48'], service: ['road_minor', 0.8, '#2f7a48'],
  };
  const roads = style.layers.filter((l) => l['source-layer'] === 'transportation');
  for (const [cls, [id, w, c]] of Object.entries(want)) {
    const l = roads.find((r) => r.id === id);
    assert.ok(l, id);
    assert.ok((l.filter?.[2] as string[]).includes(cls), `${id} filters ${cls}`);
    assert.equal(l.paint?.['line-width'], w, id);
    assert.equal(l.paint?.['line-color'], c, id);
  }
  const glow = layer('road_motorway_glow');
  assert.deepEqual([glow?.paint?.['line-width'], glow?.paint?.['line-opacity'], glow?.paint?.['line-color']], [7.7, 0.28, '#8dffad']);
  const ids = style.layers.map((l) => l.id);
  assert.ok(ids.indexOf('road_motorway_glow') < ids.indexOf('road_motorway'), 'glow casing under the core');
  for (const r of roads) assert.deepEqual(r.layout, { 'line-cap': 'round', 'line-join': 'round' }, r.id);
});

test('credit strings exact', () => {
  assert.equal(CJ_MAP_CREDIT, '© OpenStreetMap contributors · © OpenMapTiles · Tiles: OpenFreeMap · Terrain: Mapzen / AWS Terrain Tiles (SRTM, USGS and others)');
  assert.equal(CJ_MAP_CREDIT_NO_TERRAIN, '© OpenStreetMap contributors · © OpenMapTiles · Tiles: OpenFreeMap');
});

test('cjMapStatus cases', () => {
  const ok = { gps: true, demo: false, online: true, tilesFailed: false as const };
  assert.equal(cjMapStatus(ok), '');
  assert.equal(cjMapStatus({ ...ok, gps: false }), 'GPS ACQ');
  assert.equal(cjMapStatus({ ...ok, gps: false, demo: true }), 'DEMO');
  assert.equal(cjMapStatus({ ...ok, online: false }), 'NO TILES');
  assert.equal(cjMapStatus({ ...ok, tilesFailed: 'network' }), 'NO TILES');
  assert.equal(cjMapStatus({ ...ok, tilesFailed: 'error' }), 'NO MAP DATA');
  assert.equal(cjMapStatus({ ...ok, tilesFailed: true }), 'NO MAP DATA');
  assert.equal(cjMapStatus({ ...ok, online: false, tilesFailed: 'error' }), 'NO TILES', 'offline beats NO MAP DATA');
});

test('zoomForRangeMi: monotonic, web-mercator correct', () => {
  assert.deepEqual([...CJ_MAP_RANGES_MI], [1, 2, 5, 10]);
  for (const [lat, h] of [[0, 99], [37.4, 156], [60, 99]]) {
    const z = CJ_MAP_RANGES_MI.map((mi) => zoomForRangeMi(mi, lat, h));
    for (let i = 1; i < z.length; i++) assert.ok(z[i] < z[i - 1], `lat ${lat}: ${z}`);
    // half-height in metres at that zoom equals the range
    const mPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z[1]);
    assert.ok(Math.abs((mPerPx * h) / 2 - 2 * 1609.344) < 0.01);
  }
  assert.ok(zoomForRangeMi(2, 60, 99) < zoomForRangeMi(2, 0, 99), 'higher latitude → lower zoom');
});

test('terrain off removes dem source and hillshade layer', () => {
  const s = buildCjMapStyle({ terrain: false });
  assert.ok(!('dem' in s.sources));
  assert.ok(!s.layers.some((l) => l.type === 'hillshade' || l.source === 'dem'));
  assert.ok('ofm' in s.sources);
});

test('perf + label constants', () => {
  assert.equal(CJ_MAP_OPTIONS.pixelRatio, 1);
  assert.equal(CJ_MAP_MAX_STREET_LABELS, 2);
  assert.equal(shouldRender({ cellVisible: true, parked: false, gpsLive: true }), true);
  assert.equal(shouldRender({ cellVisible: true, parked: true, gpsLive: true }), true);
  assert.equal(shouldRender({ cellVisible: true, parked: true, gpsLive: false }), false);
  assert.equal(shouldRender({ cellVisible: false, parked: false, gpsLive: true }), false);
});

// --- declination (WMM2025) + heading helpers ---
import { readFileSync } from 'node:fs';
import { magneticDeclinationDeg, trueToMagnetic } from '../src/skins/carrier-jet/map/declination.ts';
import { formatHeading, headingLegendLines, smoothHeading, CJ_HEADING_STALE_OPACITY } from '../src/skins/carrier-jet/map/heading.ts';

test('WMM2025: NOAA published test values within 0.1°', () => {
  // [decimal year, alt km, lat, lon, D] from WMM2025_TEST_VALUES.txt (NOAA NCEI)
  const T: [number, number, number, number, number][] = [
    [2025, 0, 80, 0, 1.28], [2025, 0, 0, 120, -0.16], [2025, 0, -80, 240, 68.78],
    [2025, 100, 80, 0, 0.85], [2025, 100, 0, 120, -0.15], [2025, 100, -80, 240, 68.21],
    [2027.5, 0, 80, 0, 2.59], [2027.5, 0, 0, 120, -0.24], [2027.5, 0, -80, 240, 68.49],
    [2027.5, 100, 80, 0, 2.16], [2027.5, 100, 0, 120, -0.23], [2027.5, 100, -80, 240, 67.93],
  ];
  for (const [y, alt, lat, lon, d] of T) {
    const date = y === 2025 ? new Date(Date.UTC(2025, 0, 1)) : new Date(Date.UTC(2027, 6, 2, 12)); // 2027.5
    const got = magneticDeclinationDeg(lat, lon, alt, date);
    assert.ok(Math.abs(got - d) < 0.1, `${y} ${alt}km ${lat},${lon}: ${got} vs ${d}`);
  }
});

test('Jacksonville FL 2026 is about 7° west; trueToMagnetic', () => {
  const d = magneticDeclinationDeg(30.22, -81.69, 0, new Date(Date.UTC(2026, 9, 16)));
  assert.ok(d < -6.5 && d > -7.5, `JAX ${d}`);
  assert.equal(trueToMagnetic(40, -7), 47);
  assert.equal(trueToMagnetic(5, 10), 355);
  assert.equal(trueToMagnetic(355, -10), 5);
});

test('smoothHeading: shortest-arc easing across 359/0', () => {
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  near(smoothHeading(359, 1, 0.5), 0);
  near(smoothHeading(1, 359, 0.5), 0);
  near(smoothHeading(350, 10, 0.25), 355);
  near(smoothHeading(10, 350, 0.25), 5);
  near(smoothHeading(90, 100, 0.5), 95);
  near(smoothHeading(40, 200, 0), 40);
  near(smoothHeading(40, 200, 1), 200);
  near(smoothHeading(359, 1, 1), 1);
});

test('formatHeading + legend lines (lead defaults to M)', () => {
  assert.equal(formatHeading(40, 'T'), '040 T');
  assert.equal(formatHeading(47.4, 'M'), '047 M');
  assert.equal(formatHeading(359.6, 'T'), '000 T');
  assert.equal(formatHeading(-3, 'M'), '357 M');
  assert.deepEqual(headingLegendLines(40, 47), ['HDG 047 M', 'HDG 040 T']);
  assert.deepEqual(headingLegendLines(40, 47, 'T'), ['HDG 040 T', 'HDG 047 M']);
  assert.equal(CJ_HEADING_STALE_OPACITY, 0.45);
});

test('CjHeadingLegend: lead default M, stale dims, text >= 11px, CJ green', () => {
  const src = readFileSync(new URL('../src/skins/carrier-jet/map/HeadingLegend.tsx', import.meta.url), 'utf8');
  assert.match(src, /lead = 'M'/);
  assert.match(src, /opacity: stale \? CJ_HEADING_STALE_OPACITY : 1/);
  const sizes = [...src.matchAll(/fontSize: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length >= 2 && sizes.every((s) => s >= 11), `${sizes}`);
  assert.match(src, /#8dffad/);
  assert.doesNotMatch(readFileSync(new URL('../src/skins/carrier-jet/map/heading.ts', import.meta.url), 'utf8'), /from 'react'/, 'heading.ts stays React-free');
});
