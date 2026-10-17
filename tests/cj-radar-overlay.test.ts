/** CJ RADAR over the map (mock; Wilson Oct 16 "Radar overlay should stack atop maps"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CJ_RADAR_MAP_DIM, scopeBugPoint, scopeRingPx } from '../src/packs/carrier-jet/liveMap.ts';
import { radarAria, SWEEP_PERIOD_MS } from '../src/packs/carrier-jet/mapView.ts';
import { zoomForRangeMi } from '../src/skins/carrier-jet/map/style.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('dim: map at 55–70% brightness under the scope', () => {
  assert.ok(CJ_RADAR_MAP_DIM >= 0.55 && CJ_RADAR_MAP_DIM <= 0.7);
  assert.match(nc(src('packs/mounts/carrier-jet-v2.css')), /\.cjv2-hsd\[data-radar\] > \.cjv2-mapgl \{ filter: brightness\(var\(--cjv2-radar-dim, 0\.62\)\)/);
});

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

test('aria: RADAR names both layers; no map → the scope alone', () => {
  assert.match(radarAria({ range: 5, mode: 'map' }, '047', '', true), /^Radar scope over map, 5 mile range, map mode, heading 047, no returns\. Map track up, dimmed$/);
  assert.match(radarAria({ range: 2, mode: 'terr' }, '---', 'GPS ACQ', true), /^Radar scope over map, .*terrain mode.*acquiring GPS$/);
  assert.match(radarAria({ range: 10, mode: 'map' }, '047', 'NO TILES', false), /^Radar scope, 10 mile range.*Map unavailable, no tiles, offline$/);
});

test('stacking: map (+ WX under the roads) → scope → labels; MAP mode unchanged; RADAR no longer hides the map', () => {
  const live = src('packs/mounts/CjLiveMap.tsx');
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const i = (s: string) => live.indexOf(s);
  assert.ok(i('className="cjv2-mapgl"') < i('{radar?.scope(status)}'));
  assert.ok(i('{radar?.scope(status)}') < i('className="cjv2-street"'));
  assert.doesNotMatch(layer, /hidden=\{view\.radar\}/);
  assert.match(layer, /radar=\{view\.radar \? \{ range: view\.range/);
  // WX layer still goes under the first road layer, attached in both modes (no radar condition on it)
  assert.match(src('packs/mounts/cjWxRadarLayer.ts'), /const BEFORE = \['road_minor'/);
  assert.match(live, /if \(!map \|\| !hasMap \|\| !wxRadar\) return;/);
  // scope: no background; bug + own-ship above the sweep; sweep speed unchanged
  const css = nc(src('packs/mounts/carrier-jet-v2.css'));
  assert.match(css, /\.cjv2-hsd > \.cjv2-scope \{ background: transparent;/);
  assert.ok(layer.indexOf('className="cjv2-sweepsvg"') < layer.indexOf('className="cjv2-scopetop"'));
  assert.equal(SWEEP_PERIOD_MS, 4000);
  assert.match(css, /animation: cjv2-sweep 4s linear infinite/);
});
