// CJ TERR contour lines (maplibre-contour): intervals by range, layers + ids, Meghan's defaults and skin pickup,
// MAP hidden / TERR visible (no rebuild, nothing loaded in MAP), order above hillshade under water, radar dim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CJ_CONTOUR_BEFORE, CJ_CONTOUR_FT_PER_M, CJ_CONTOUR_ID, CJ_CONTOUR_INDEX_ID, CJ_CONTOUR_INTERVALS_FT, CJ_CONTOUR_SRC, CJ_CONTOUR_STYLE,
  contourInterval, contourLayers, contourUrlOptions,
} from '../src/packs/carrier-jet/contours.ts';
import { attachContours, contourStats } from '../src/packs/mounts/cjContours.ts';
import { buildCjMapStyle, CJ_DEM_TILES, type CjLayer } from '../src/skins/carrier-jet/map/style.ts';
import { CJ_RADAR_MAP_DIM, dimHex, radarDimPaint } from '../src/packs/carrier-jet/liveMap.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('intervals in feet by range (normal / index = every 5th), metres → feet multiplier, one threshold per range', () => {
  assert.deepEqual(CJ_CONTOUR_INTERVALS_FT, { 1: [40, 200], 2: [80, 400], 5: [200, 1000], 10: [400, 2000] });
  for (const [r, [a, b]] of Object.entries(CJ_CONTOUR_INTERVALS_FT)) {
    assert.equal(b, a * 5, `${r} mi: index every 5th`);
    assert.deepEqual(contourInterval(+r), [a, b]);
  }
  assert.deepEqual(contourInterval(0.5), [40, 200]);
  assert.deepEqual(contourInterval(3), [200, 1000], 'between ranges: the next coarser');
  assert.deepEqual(contourInterval(25), [400, 2000]);
  const o = contourUrlOptions(2);
  assert.equal(o.multiplier, CJ_CONTOUR_FT_PER_M);
  assert.equal(CJ_CONTOUR_FT_PER_M, 3.28084);
  assert.deepEqual(o.thresholds, { 0: [80, 400] }, 'zoom 0 key = every zoom');
  assert.equal(o.contourLayer, 'contours');
  assert.equal(o.elevationKey, 'ele');
  assert.equal(o.levelKey, 'level');
});

test("layers: ids 'contour' / 'contour-index', level filters, Meghan's defaults, no symbol layer", () => {
  const [n, i] = contourLayers(buildCjMapStyle({ terrain: true }).layers, true);
  assert.equal(n.id, CJ_CONTOUR_ID);
  assert.equal(i.id, CJ_CONTOUR_INDEX_ID);
  assert.deepEqual([n.id, i.id], ['contour', 'contour-index']);
  for (const l of [n, i]) {
    assert.equal(l.type, 'line');
    assert.equal(l.source, CJ_CONTOUR_SRC);
    assert.equal(l['source-layer'], 'contours');
  }
  assert.deepEqual(n.filter, ['==', ['get', 'level'], 0]);
  assert.deepEqual(i.filter, ['==', ['get', 'level'], 1]);
  assert.deepEqual(n.paint, { 'line-color': '#1d5a33', 'line-width': 0.6, 'line-opacity': 0.8 });
  assert.deepEqual(i.paint, { 'line-color': '#2f7a48', 'line-width': 1.0, 'line-opacity': 0.85 });
  assert.deepEqual(CJ_CONTOUR_STYLE.normal, n.paint);
  assert.doesNotMatch(src('packs/carrier-jet/contours.ts') + src('packs/mounts/cjContours.ts'), /type: 'symbol'|text-field/);
});

test('MAP mode: contours hidden; TERR: visible (layout visibility)', () => {
  const skin = buildCjMapStyle({ terrain: true }).layers;
  for (const l of contourLayers(skin, false)) assert.equal(l.layout?.visibility, 'none', `${l.id} in MAP`);
  for (const l of contourLayers(skin, true)) assert.equal(l.layout?.visibility, 'visible', `${l.id} in TERR`);
});

test("skin pickup: Meghan's style layers with the same id win paint / layout / zoom range; ours keep source + filter", () => {
  const skin: CjLayer[] = [
    ...buildCjMapStyle({ terrain: true }).layers,
    { id: 'contour', type: 'line', minzoom: 9, paint: { 'line-color': '#123456', 'line-width': 0.5 }, layout: { 'line-join': 'miter' } },
  ];
  const [n, i] = contourLayers(skin, false);
  assert.deepEqual(n.paint, { 'line-color': '#123456', 'line-width': 0.5 });
  assert.deepEqual(n.layout, { 'line-join': 'miter', visibility: 'none' }, 'visibility stays ours');
  assert.equal(n.minzoom, 9);
  assert.equal(n.source, CJ_CONTOUR_SRC);
  assert.deepEqual(n.filter, ['==', ['get', 'level'], 0]);
  assert.deepEqual(i.paint, CJ_CONTOUR_STYLE.index, 'no skin layer → mount default');
  // the skin style does not define them today (style.ts is Meghan's; read, not edited)
  assert.ok(!buildCjMapStyle({ terrain: true }).layers.some((l) => l.id.startsWith('contour')));
});

test('RADAR: contours are base map and take the same 0.62 dim (radarDimPaint)', () => {
  const ls = contourLayers(buildCjMapStyle({ terrain: true }).layers, true);
  const d = radarDimPaint(ls, CJ_RADAR_MAP_DIM);
  assert.deepEqual(d, [
    { id: 'contour', prop: 'line-color', value: dimHex('#1d5a33', 0.62) },
    { id: 'contour-index', prop: 'line-color', value: dimHex('#2f7a48', 0.62) },
  ]);
  assert.equal(CJ_RADAR_MAP_DIM, 0.62);
});

// a fake MapLibre map: records sources / layers / layout / paint
function fakeMap() {
  const layers: { id: string; before?: string; layout: Record<string, unknown>; paint: Record<string, unknown> }[] = [{ id: 'hillshade', layout: {}, paint: {} }, { id: 'water', layout: {}, paint: {} }, { id: 'road_minor', layout: {}, paint: {} }];
  const sources: Record<string, { tiles: string[]; setTiles(t: string[]): void }> = {};
  const map = {
    style: {},
    isStyleLoaded: () => true,
    once: () => undefined,
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (l: { id: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }, before?: string) => {
      const at = before ? layers.findIndex((x) => x.id === before) : layers.length;
      layers.splice(at, 0, { id: l.id, before, layout: { ...(l.layout ?? {}) }, paint: { ...(l.paint ?? {}) } });
    },
    addSource: (id: string, s: { tiles: string[] }) => {
      sources[id] = { tiles: s.tiles, setTiles(t) { this.tiles = t; } };
    },
    getSource: (id: string) => sources[id],
    setLayoutProperty: (id: string, k: string, v: unknown) => void (layers.find((l) => l.id === id)!.layout[k] = v),
    setPaintProperty: (id: string, k: string, v: unknown) => void (layers.find((l) => l.id === id)!.paint[k] = v),
  };
  return { map, layers, sources };
}
const tick = () => new Promise((f) => setTimeout(f, 0));

test('live map: MAP loads nothing; first TERR adds source + layers above hillshade / under water; MAP ↔ TERR = visibility only', async () => {
  const { map, layers, sources } = fakeMap();
  let loads = 0;
  const dem = async () => {
    loads++;
    return { contourProtocolUrl: (o: ReturnType<typeof contourUrlOptions>) => `dem-contour://{z}/{x}/{y}?t=${JSON.stringify(o.thresholds)}` };
  };
  const created0 = contourStats.created;
  const c = attachContours({} as never, map as never, { visible: false, rangeMi: 5, dim: 1 }, dem);
  await tick();
  assert.equal(loads, 0, 'MAP: maplibre-contour not loaded, no worker');
  assert.equal(Object.keys(sources).length, 0, 'MAP: no contour source');
  assert.ok(!layers.some((l) => l.id.startsWith('contour')));
  c.setRange(2); // in MAP: remembered, nothing loads
  c.setVisible(true);
  await tick();
  assert.equal(loads, 1);
  const ids = layers.map((l) => l.id);
  assert.deepEqual(ids, ['hillshade', 'contour', 'contour-index', 'water', 'road_minor'], 'directly above hillshade, under water + roads');
  assert.equal(layers.find((l) => l.id === 'contour')!.layout.visibility, 'visible', 'TERR: visible');
  assert.deepEqual(sources[CJ_CONTOUR_SRC].tiles, ['dem-contour://{z}/{x}/{y}?t={"0":[80,400]}'], 'the 2 mi interval');
  c.setVisible(false);
  assert.equal(layers.find((l) => l.id === 'contour')!.layout.visibility, 'none', 'MAP: hidden');
  assert.equal(layers.find((l) => l.id === 'contour-index')!.layout.visibility, 'none');
  c.setVisible(true);
  assert.equal(layers.filter((l) => l.id === 'contour').length, 1, 'no re-add / rebuild');
  assert.equal(loads, 1);
  c.setRange(10);
  assert.deepEqual(sources[CJ_CONTOUR_SRC].tiles, ['dem-contour://{z}/{x}/{y}?t={"0":[400,2000]}']);
  c.setDim(CJ_RADAR_MAP_DIM);
  assert.equal(layers.find((l) => l.id === 'contour')!.paint['line-color'], dimHex('#1d5a33', 0.62));
  c.setDim(1);
  assert.equal(layers.find((l) => l.id === 'contour')!.paint['line-color'], '#1d5a33');
  assert.equal(contourStats.created, created0, 'the real DemSource was never made');
});

test('live map: TERR under RADAR from the start → added already dimmed', async () => {
  const { map, layers } = fakeMap();
  attachContours({} as never, map as never, { visible: true, rangeMi: 5, dim: CJ_RADAR_MAP_DIM }, async () => ({ contourProtocolUrl: () => 'x' }));
  await tick();
  assert.equal(layers.find((l) => l.id === 'contour-index')!.paint['line-color'], dimHex('#2f7a48', 0.62));
});

test('wiring: CjLiveMap follows the TERR switch, range and RADAR dim; the DEM is the hillshade terrarium; worker on', () => {
  const m = src('packs/mounts/CjLiveMap.tsx');
  assert.match(m, /contours\.current = attachContours\(ml, map, \{ visible: terrRef\.current, \.\.\.contourInit\.current \}\);/);
  assert.match(m, /setLayoutProperty\('hillshade', 'visibility', view\.mode === 'terr' \? 'visible' : 'none'\);[\s\S]{0,200}contours\.current\?\.setVisible\(view\.mode === 'terr'\);/);
  assert.match(m, /const contourRange = radar \? radar\.range : view\.zoom;/);
  assert.match(m, /contours\.current\?\.setDim\(radarOn \? CJ_RADAR_MAP_DIM : 1\);/);
  const c = src('packs/mounts/cjContours.ts');
  assert.match(c, /import\('maplibre-contour'\)/, 'lazy chunk');
  assert.match(c, /new mlc\.DemSource\(\{ url: CJ_DEM_TILES, encoding: 'terrarium', maxzoom: CJ_CONTOUR_DEM_MAXZOOM, worker: true/);
  assert.equal(CJ_DEM_TILES, 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png');
  assert.equal(CJ_CONTOUR_BEFORE, 'water');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies['maplibre-contour'], '0.1.1', 'pinned');
});
