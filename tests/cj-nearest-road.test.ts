/** CJ MAP road label = the road the car is on / the closest named road (not the biggest road nearby); pure selection. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEAREST_ROAD_INIT, nearestRoad, nearestRoadRadiusM, nearestRoadStep, type RoadFeature } from '../src/packs/carrier-jet/nearestRoad.ts';
import { placeLabels } from '../src/packs/carrier-jet/liveMap.ts';

const LAT = 35.6, LON = -82.55;
const mLat = (m: number) => m / 111195, mLon = (m: number) => m / (111195 * Math.cos((LAT * Math.PI) / 180));
/** A straight road through (east m, north m) offsets, given as lon/lat. */
const road = (name: string, cls: string, pts: [number, number][]): RoadFeature => ({ name, cls, lines: [pts.map(([e, n]) => [LON + mLon(e), LAT + mLat(n)] as [number, number])] });
const car = (e = 0, n = 0) => ({ lat: LAT + mLat(n), lon: LON + mLon(e) });
// the car drives north on Elm St (residential); a primary 25 m east, a motorway 300 m west
const elm = road('Elm St', 'minor', [[0, -500], [0, 500]]);
const main = road('Main St', 'primary', [[25, -500], [25, 500]]);
const hwy = road('I-26', 'motorway', [[-300, -500], [-300, 500]]);

test('picks the road under the car, not the biggest one nearby', () => {
  const p = nearestRoad([hwy, main, elm], car(2, 0), 0);
  assert.equal(p?.name, 'Elm St');
  assert.ok(p!.distM > 1.9 && p!.distM < 2.1, `${p!.distM}`);
  // between two roads: the closer one
  assert.equal(nearestRoad([main, elm], car(15, 0), 0)?.name, 'Main St');
  // nothing within the radius: no label (never a far road)
  assert.equal(nearestRoad([hwy], car(0, 0), 0), null);
  assert.equal(nearestRoad([hwy], car(0, 0), 0, { radiusM: 400 })?.name, 'I-26');
});

test('point-to-segment distance (not vertices only), road split across tiles, unnamed and non-car classes ignored', () => {
  const long = road('Long Rd', 'secondary', [[-2000, 10], [2000, 10]]); // vertices 2 km away, segment 10 m away
  assert.equal(nearestRoad([long], car(), 0)?.name, 'Long Rd');
  const a = road('Oak Ave', 'tertiary', [[-500, 30], [0, 30]]), b = road('Oak Ave', 'tertiary', [[0, 30], [500, 30]]);
  assert.ok(Math.abs(nearestRoad([a, b], car(), 90)!.distM - 30) < 0.1);
  assert.equal(nearestRoad([road('', 'minor', [[0, -9], [0, 9]]), road('Rail Line', 'rail', [[1, -9], [1, 9]]), road('Greenway', 'path', [[1, -9], [1, 9]])], car(), 0), null);
});

test('intersection tie: the road along the heading wins', () => {
  // Elm (N-S) crosses Pine (E-W) at the car; both ~0 m
  const pine = road('Pine St', 'minor', [[-500, 1], [500, 1]]);
  assert.equal(nearestRoad([elm, pine], car(0, 0.5), 0)?.name, 'Elm St', 'heading north');
  assert.equal(nearestRoad([elm, pine], car(0, 0.5), 268)?.name, 'Pine St', 'heading west');
  assert.equal(nearestRoad([elm, pine], car(0, 0.5), 181)?.name, 'Elm St', 'south is the same axis');
  // a clear (> tie) distance beats the heading
  assert.equal(nearestRoad([elm, pine], car(0, 20), 90)?.name, 'Elm St');
});

test('hysteresis: a new best road must hold for 2 s; leaving the shown road switches at once', () => {
  const pine = road('Pine St', 'minor', [[-500, 0], [500, 0]]);
  let s = nearestRoadStep(NEAREST_ROAD_INIT, [elm, pine], car(0, -30), 0, 0);
  assert.equal(s.shown?.name, 'Elm St');
  // driving north through the Pine St intersection: Pine is momentarily nearest (heading east-ish GPS jitter)
  s = nearestRoadStep(s, [elm, pine], car(3, 0.5), 90, 500);
  assert.equal(s.shown?.name, 'Elm St', 'held');
  assert.equal(s.pending?.name, 'Pine St');
  s = nearestRoadStep(s, [elm, pine], car(0, 15), 0, 1500);
  assert.equal(s.shown?.name, 'Elm St');
  assert.equal(s.pending, null, 'back on Elm: the pending switch is dropped');
  // a real turn onto Pine (stays the best for 2 s)
  s = nearestRoadStep(s, [elm, pine], car(30, 1), 90, 3000);
  assert.equal(s.shown?.name, 'Elm St', 'Elm is still within 1.5 x radius: wait');
  s = nearestRoadStep(s, [elm, pine], car(70, 1), 90, 4000);
  assert.equal(s.shown?.name, 'Pine St', 'Elm left behind (> 60 m): switch at once');
  // no fix: keep what we have
  assert.equal(nearestRoadStep(s, [elm, pine], null, 90, 5000), s);
  // held 2 s while both stay in range
  let t = nearestRoadStep(NEAREST_ROAD_INIT, [main, elm], car(10, 0), 0, 0);
  assert.equal(t.shown?.name, 'Elm St');
  t = nearestRoadStep(t, [main, elm], car(16, 0), 0, 100);
  assert.equal(t.shown?.name, 'Elm St');
  t = nearestRoadStep(t, [main, elm], car(16, 0), 0, 2099);
  assert.equal(t.shown?.name, 'Elm St');
  t = nearestRoadStep(t, [main, elm], car(16, 0), 0, 2100);
  assert.equal(t.shown?.name, 'Main St');
});

test('radius scales with zoom (simplified low-zoom tiles), 40..250 m', () => {
  assert.equal(nearestRoadRadiusM(16, LAT), 40);
  assert.ok(nearestRoadRadiusM(12, LAT) > 40);
  assert.equal(nearestRoadRadiusM(8, LAT), 250);
});

test('placeLabels puts the road under the car first; CjLiveMap feeds it from loaded tiles, no geocoder', () => {
  const m = (s: string) => s.length * 7;
  const pts = (x: number) => Array.from({ length: 20 }, (_, i) => ({ x, y: 10 + i * 5 }));
  const L = placeLabels([{ name: 'big blvd', pts: pts(110) }, { name: 'elm st', pts: pts(160) }, { name: 'other rd', pts: pts(60) }], { x: 100, y: 50 }, { w: 200, h: 100 }, [], m, 1, 13, 'Elm St');
  assert.deepEqual(L.map((l) => l.name), ['ELM ST']);
  const live = readFileSync(new URL('../src/packs/mounts/CjLiveMap.tsx', import.meta.url), 'utf8');
  assert.match(live, /nearestRoadStep\(road\.current, named, car, c\.heading/);
  assert.match(live, /querySourceFeatures\('ofm', \{ sourceLayer: 'transportation_name' \}\)/);
  assert.doesNotMatch(live + readFileSync(new URL('../src/packs/carrier-jet/nearestRoad.ts', import.meta.url), 'utf8'), /nominatim|geocod\w*\(|fetch\(/i);
});
