/** CJ RADAR RNG± regression (Wilson, Oct 18): RNG± must re-zoom the live map, not only redraw the scope rings. The map
 * was paused in Park once the GPS went quiet (no fix for CJ_GPS_LIVE_MS), and a paused map ignored every view change. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldRender } from '../src/skins/carrier-jet/map/style.ts';
import { cameraMode, cameraZoom, removeWhenPaused, scopeRingPx } from '../src/packs/carrier-jet/liveMap.ts';
import { applyMapKey, MAP_VIEW_DEFAULT, rangeRings } from '../src/packs/carrier-jet/mapView.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const MI = 1609.344;
/** Ground metres per CSS px at a MapLibre zoom (512px world). */
const mPerPx = (z: number, lat: number) => (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

test('RNG 2 / 5 / 10: the map zoom puts that range on the scope outer ring, and the rings follow', () => {
  const lat = 35.6, w = 452, h = 330;
  let v = { ...MAP_VIEW_DEFAULT, radar: true, range: 5 as const };
  const z5 = cameraZoom({ radar: v.range, zoomMi: v.zoom, w, h }, lat);
  v = applyMapKey(v, 'rngUp');
  assert.equal(v.range, 10);
  const z10 = cameraZoom({ radar: v.range, zoomMi: v.zoom, w, h }, lat);
  v = applyMapKey(applyMapKey(v, 'rngDown'), 'rngDown');
  assert.equal(v.range, 2);
  const z2 = cameraZoom({ radar: v.range, zoomMi: v.zoom, w, h }, lat);
  assert.ok(z2 > z5 && z5 > z10, `${z2} > ${z5} > ${z10}`);
  assert.ok(Math.abs(z5 - z10 - 1) < 1e-9, '10 mi is one zoom level out from 5 mi');
  for (const [z, r] of [[z2, 2], [z5, 5], [z10, 10]] as const) {
    const ringMi = (scopeRingPx(w, h) * mPerPx(z, lat)) / MI;
    assert.ok(Math.abs(ringMi - r) < 1e-6, `outer ring = ${r} mi (got ${ringMi})`);
    assert.equal(rangeRings(r).at(-1)!.r, 1, 'the outer drawn ring is the range');
  }
  // RADAR off: ZM keys still drive the cell half-height
  const zm = cameraZoom({ radar: 0, zoomMi: 2, w, h }, lat);
  assert.ok(Math.abs(((h / 2) * mPerPx(zm, lat)) / MI - 2) < 1e-6);
});

test('Park with the GPS quiet: the map is paused but still on screen, so a view change still re-frames it', () => {
  const paused = shouldRender({ cellVisible: true, parked: true, gpsLive: false });
  assert.equal(paused, false, 'the glide loop pauses in Park without a live fix');
  assert.equal(cameraMode({ active: paused, cellVisible: true, hasMap: true }), 'still', 'RNG± must still jump the camera');
  assert.equal(cameraMode({ active: true, cellVisible: true, hasMap: true }), 'live');
  assert.equal(cameraMode({ active: false, cellVisible: false, hasMap: true }), 'off', 'hidden: nothing moves');
  assert.equal(cameraMode({ active: true, cellVisible: true, hasMap: false }), 'off');
  assert.equal(removeWhenPaused(true), false, 'a visible paused map is kept (else the scope is left alone with no map)');
  assert.equal(removeWhenPaused(false), true);
});

test('CjLiveMap wiring: kick() goes through cameraMode, the frame does one still jump, zoom from cameraZoom, range in the deps', () => {
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.match(live, /kick\.current = \(\) => \{\s*if \(raf\.current \|\| cameraMode\(\{ active: activeRef\.current, cellVisible, hasMap: !!mapRef\.current \}\) === 'off'\) return;/);
  assert.doesNotMatch(live, /if \(!activeRef\.current \|\| !mapRef\.current \|\| raf\.current\) return/, 'the old gate dropped view changes while paused');
  assert.match(live, /const still = !activeRef\.current;/);
  assert.match(live, /const zoom = cameraZoom\(c, pos\.lat\);/);
  assert.match(live, /useEffect\(\(\) => kick\.current\(\), \[[^\]]*radar\?\.range[^\]]*\]\)/);
  assert.match(live, /removeWhenPaused\(cellVisible\)/);
});
