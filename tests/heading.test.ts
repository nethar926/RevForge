import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPASS_FRESH_MS,
  HeadingFusion,
  angleDiff,
  distanceM,
  headingFromAlpha,
  initialBearing,
  normDeg,
  shouldEmit,
  smoothAngle,
} from '../src/packs/heading.ts';
import type { GpsFix } from '../src/hooks/gpsFixes.ts';

const near = (a: number, b: number, eps = 0.5, msg?: string) => assert.ok(Math.abs(angleDiff(a, b)) <= eps, msg ?? `${a} ≈ ${b}`);
// ~1e-4 deg latitude ≈ 11.1 m
const fix = (lat: number, lon: number, t: number, heading: number | null = null, speed: number | null = null, accuracy = 5): GpsFix => ({ latitude: lat, longitude: lon, accuracy, heading, speed, timestamp: t });

test('normDeg / angleDiff wrap', () => {
  assert.equal(normDeg(-10), 350);
  assert.equal(normDeg(720), 0);
  assert.equal(normDeg(-0), 0);
  assert.equal(angleDiff(5, 355), 10);
  assert.equal(angleDiff(355, 5), -10);
  assert.equal(angleDiff(180, 0), 180);
});

test('initial bearing: cardinal directions and a known great-circle value', () => {
  near(initialBearing(0, 0, 1, 0), 0, 1e-9);
  near(initialBearing(0, 0, 0, 1), 90, 1e-9);
  near(initialBearing(0, 0, -1, 0), 180, 1e-9);
  near(initialBearing(0, 0, 0, -1), 270, 1e-9);
  // JFK → LHR initial bearing ≈ 51.4°
  near(initialBearing(40.6413, -73.7781, 51.47, -0.4543), 51.4, 0.5);
  // ≈ 11.1 m per 1e-4° latitude
  assert.ok(Math.abs(distanceM(40, -74, 40.0001, -74) - 11.12) < 0.1);
});

test('compass alpha → heading', () => {
  assert.equal(headingFromAlpha(0), 0);
  assert.equal(headingFromAlpha(90), 270);
  assert.equal(headingFromAlpha(270), 90);
  assert.equal(headingFromAlpha(360), 0);
});

test('wrap smoothing goes the short way across 359 → 0', () => {
  const s = smoothAngle(350, 10, 0.5);
  near(s, 0, 1e-9);
  const t = smoothAngle(10, 350, 0.5);
  near(t, 0, 1e-9);
  assert.equal(smoothAngle(undefined, 370, 0.5), 10);
  // converges, never sweeping through 180
  let h = 355;
  for (let i = 0; i < 20; i++) {
    h = smoothAngle(h, 5, 0.6);
    assert.ok(h >= 355 || h <= 5, `stays in the short arc: ${h}`);
  }
  near(h, 5, 0.01);
});

test('GPS coords.heading drives the value; stopped (speed 0 / NaN heading) holds the last', () => {
  const f = new HeadingFusion();
  assert.equal(f.value(0), undefined);
  let t = 0;
  for (let i = 0; i < 12; i++) f.onGps(fix(40 + i * 1e-4, -74, (t += 1000), 90, 12));
  near(f.value(t)!, 90, 0.1);
  // stop: heading NaN / null, speed 0, GPS wanders a little
  f.onGps(fix(40.0012, -74, (t += 1000), NaN, 0));
  f.onGps(fix(40.00121, -74.00001, (t += 1000), null, 0));
  f.onGps(fix(40.00119, -74, (t += 1000), 0, 0)); // some devices report 0 while stopped
  near(f.value(t)!, 90, 0.1, 'held while stopped');
  // long after: still held, never undefined
  assert.notEqual(f.value(t + 600000), undefined);
  near(f.value(t + 600000)!, 90, 0.1);
});

test('heading null but moving fixes ≥ 8 m apart → computed great-circle bearing', () => {
  const f = new HeadingFusion();
  let t = 0;
  // due east, ~11 m/s: 1e-4° lon at 40°N ≈ 8.5 m per second
  f.onGps(fix(40, -74, (t += 1000)));
  assert.equal(f.value(t), undefined, 'one fix is not enough');
  for (let i = 1; i <= 10; i++) f.onGps(fix(40, -74 + i * 1e-4, (t += 1000)));
  near(f.value(t)!, 90, 0.5);
  // turn north-east
  for (let i = 1; i <= 12; i++) f.onGps(fix(40 + i * 1e-4, -74 + 10e-4 + i * 1.3e-4, (t += 1000)));
  near(f.value(t)!, initialBearing(40, -74 + 10e-4, 40 + 1e-4, -74 + 10e-4 + 1.3e-4), 1);
});

test('computed bearing needs distance ≥ 8 m and speed > 1.5 m/s; poor accuracy ignored', () => {
  const f = new HeadingFusion();
  const g = new HeadingFusion();
  let t = 0;
  // slow creep: 1 m/s (0.9e-5° lat ≈ 1 m) — reaches 8 m but speed 1 m/s → no bearing
  for (let i = 0; i <= 12; i++) f.onGps(fix(40 + i * 0.9e-5, -74, (t += 1000)));
  assert.equal(f.value(t), undefined, 'walking-speed creep gives no bearing');
  // reported speed below threshold also blocks it
  t = 0;
  g.onGps(fix(40, -74, (t += 1000), null, 1));
  g.onGps(fix(40.0002, -74, (t += 1000), null, 1));
  assert.equal(g.value(t), undefined);
  // inaccurate fixes never produce one
  const h = new HeadingFusion();
  t = 0;
  h.onGps(fix(40, -74, (t += 1000), null, null, 80));
  h.onGps(fix(40.0003, -74, (t += 1000), null, null, 80));
  assert.equal(h.value(t), undefined);
});

test('fresh compass wins; stale compass (≥ 1 s) falls back to GPS; held if GPS never had a value', () => {
  const f = new HeadingFusion();
  let t = 0;
  for (let i = 0; i < 10; i++) f.onGps(fix(40 + i * 1e-4, -74, (t += 1000), 180, 10));
  near(f.value(t)!, 180, 0.1);
  for (let i = 0; i < 40; i++) f.onCompass(45, (t += 16));
  assert.equal(f.source(t), 'compass');
  near(f.value(t)!, 45, 0.5);
  assert.equal(f.source(t + COMPASS_FRESH_MS - 1), 'compass');
  assert.equal(f.source(t + COMPASS_FRESH_MS), 'gps');
  near(f.value(t + COMPASS_FRESH_MS)!, 180, 0.1);
  // compass only, then it stops: hold its last value (no GPS heading yet)
  const c = new HeadingFusion();
  for (let i = 0; i < 40; i++) c.onCompass(300, i * 16);
  near(c.value(640)!, 300, 0.5);
  assert.equal(c.source(5000), 'hold');
  near(c.value(5000)!, 300, 0.5);
  // compass wrap smoothing 350 → 10
  const w = new HeadingFusion();
  for (let i = 0; i < 30; i++) w.onCompass(350, i * 16);
  for (let i = 30; i < 80; i++) w.onCompass(10, i * 16);
  near(w.value(80 * 16)!, 10, 0.5);
});

test('emit rule: first value, ≥ 1° changes (wrap-aware), or a new whole-degree readout; sub-degree jitter ignored', () => {
  assert.equal(shouldEmit(undefined, undefined), false);
  assert.equal(shouldEmit(undefined, 12), true);
  assert.equal(shouldEmit(12, 12.4), false);
  assert.equal(shouldEmit(12.2, 11.8), false);
  assert.equal(shouldEmit(12, 13), true);
  assert.equal(shouldEmit(359.6, 0.3), false);
  assert.equal(shouldEmit(359.6, 0.7), true);
  assert.equal(shouldEmit(179.4, 179.8), true, 'settles onto 180 instead of sticking at 179');
});

test('wiring: CJ mount passes heading; useGeolocation calls getCurrentPosition before watchPosition and publishes fixes', () => {
  const mount = readFileSync(new URL('../src/packs/mounts/CarrierJetMount.tsx', import.meta.url), 'utf8');
  assert.match(mount, /useHeading\(layout\)/);
  assert.match(mount, /<CarrierJetHud[^>]*heading=\{heading\}/);
  assert.doesNotMatch(mount, /Allow compass/, "the overlay button is gone: iOS permission is the COMPASS switch (CjNavRow)");
  const geo = readFileSync(new URL('../src/hooks/useGeolocation.ts', import.meta.url), 'utf8');
  assert.match(geo, /startGeolocation\(geo, onFix, onError, options\)/, 'start sequence lives in geoStart.ts (tests/geo-start.test.ts)');
  assert.doesNotMatch(geo, /watchPosition\(|getCurrentPosition\(/, 'no direct geolocation calls besides geoStart');
  assert.match(geo, /publishGpsFix\(/);
  const heading = readFileSync(new URL('../src/packs/heading.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(heading, /watchPosition|getCurrentPosition/, 'heading never opens its own geolocation watch');
});
