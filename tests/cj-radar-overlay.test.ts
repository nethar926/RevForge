/** CJ RADAR over the map (mock; Wilson Oct 16 "Radar overlay should stack atop maps"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CJ_RADAR_MAP_DIM, dimHex, radarDimPaint, scopeBugPoint, scopeRingPx } from '../src/packs/carrier-jet/liveMap.ts';
import { buildCjMapStyle } from '../src/skins/carrier-jet/map/style.ts';
import { SWEEP_PERIOD_MS } from '../src/packs/carrier-jet/mapView.ts';
import { cjRadarScopeAria } from '../src/skins/carrier-jet/map/radarAria.ts';
import { zoomForRangeMi } from '../src/skins/carrier-jet/map/style.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('dim: base map + roads at 62% (paint colours), the WX rain layer never dimmed; restore = the style values', () => {
  assert.ok(CJ_RADAR_MAP_DIM >= 0.55 && CJ_RADAR_MAP_DIM <= 0.7);
  assert.equal(dimHex('#8dffad', 0.62), '#579e6b');
  assert.equal(dimHex('#000', 0.62), '#000');
  const layers = [...buildCjMapStyle({ terrain: true }).layers, { id: 'cjwx-radar', paint: { 'raster-opacity': 1 } }];
  const dim = radarDimPaint(layers, CJ_RADAR_MAP_DIM, ['cjwx-radar']);
  assert.ok(dim.some((c) => c.id === 'road_motorway' && c.prop === 'line-color' && c.value === '#579e6b'));
  assert.ok(dim.some((c) => c.id === 'background'));
  assert.ok(!dim.some((c) => c.id === 'cjwx-radar'), 'rain untouched');
  for (const c of radarDimPaint(layers, 1)) assert.equal(c.value, (layers.find((l) => l.id === c.id)!.paint as Record<string, unknown>)[c.prop]);
  assert.doesNotMatch(nc(src('packs/mounts/carrier-jet-v2.css')), /\.cjv2-mapgl \{ filter/, 'no whole-canvas filter (would dim the rain too)');
});

// (rain under RADAR — teal + hatched light rain, own tile set — is tested on frontend/cj-radar-rain-on-weather)

test('scope geometry: outer ring px from the 14×8 inset square; the map zoom puts RNG mi on that ring', () => {
  assert.equal(scopeRingPx(400, 300), (272 * 46) / 100);
  assert.equal(scopeRingPx(200, 400), (184 * 46) / 100);
  const R = scopeRingPx(500, 330);
  // zoomForRangeMi maps `mi` to half the given height → 2R gives `range` mi on the ring
  const z = zoomForRangeMi(5, 40, 2 * R);
  const mPerPx = (78271.517 * Math.cos((40 * Math.PI) / 180)) / 2 ** z;
  assert.ok(Math.abs((R * mPerPx) / 1609.344 - 5) < 1e-9);
  const b = scopeBugPoint(500, 330);
  assert.equal(b.x, 250);
  assert.ok(b.y > 14 && b.y < 30);
});

test('aria: RADAR names both layers, no heading (COMPASS owns it); no map → the scope alone; no 040 corner', () => {
  assert.match(cjRadarScopeAria({ range: 5, mode: 'map' }, '', true), /^Radar scope over map, 5 mile range, map mode, no returns\. Map track up, dimmed$/);
  assert.match(cjRadarScopeAria({ range: 2, mode: 'terr' }, 'GPS ACQ', true), /^Radar scope over map, .*terrain mode.*acquiring GPS$/);
  assert.match(cjRadarScopeAria({ range: 10, mode: 'map' }, 'NO TILES', false), /^Radar scope, 10 mile range.*Map unavailable, no tiles, offline$/);
  const live = src('packs/mounts/CjLiveMap.tsx');
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.match(live, /const aria = radar \? cjRadarScopeAria\(\{ range: radar\.range, mode: radar\.mode \}, status, mapShown\)/);
  assert.match(layer, /label=\{cjRadarScopeAria\(\{ range: view\.range, mode: view\.mode \}, '', false\)\}/);
  assert.doesNotMatch(live + layer, /\bradarAria\(/, 'old heading-carrying label gone');
  assert.doesNotMatch(src('packs/carrier-jet/mapView.ts'), /export function radarAria/);
  // the scope's top-right heading digits ("040") are gone; TL / BL / BR corners stay
  const scope = layer.slice(layer.indexOf('function RadarScope('), layer.indexOf('function MapCell('));
  assert.doesNotMatch(scope, /cjv2-tr\b|\{hdg\}/);
  assert.match(scope, /cjv2-corner cjv2-tl/);
  assert.match(scope, /cjv2-corner cjv2-bl/);
  assert.match(scope, /cjv2-corner cjv2-br/);
});

test('stacking: map → scope → labels; MAP mode unchanged; RADAR no longer hides the map', () => {
  const live = src('packs/mounts/CjLiveMap.tsx');
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const i = (s: string) => live.indexOf(s);
  assert.ok(i('className="cjv2-mapgl"') < i('{radar?.scope(status)}'));
  assert.ok(i('{radar?.scope(status)}') < i('className="cjv2-street"'));
  assert.doesNotMatch(layer, /hidden=\{view\.radar\}/);
  assert.match(layer, /radar=\{view\.radar \? \{ range: view\.range/);
  // (WX rain layer checks live on frontend/cj-radar-rain-on-weather: no weather code on this base)
  // scope: no background; bug + own-ship above the sweep; sweep speed unchanged
  const css = nc(src('packs/mounts/carrier-jet-v2.css'));
  assert.match(css, /\.cjv2-hsd > \.cjv2-scope \{ background: transparent;/);
  assert.ok(layer.indexOf('className="cjv2-sweepsvg"') < layer.indexOf('className="cjv2-scopetop"'));
  assert.equal(SWEEP_PERIOD_MS, 4000);
  assert.match(css, /animation: cjv2-sweep 4s linear infinite/);
});
