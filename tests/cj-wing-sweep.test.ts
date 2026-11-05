/** Wilson wing sweep: pivot A, the README rotation, the held GPS course, and the marker size. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARC_LABELS,
  ARC_LEFT,
  ARC_R,
  ARC_RIGHT,
  JET_H,
  PIVOT_L,
  PIVOT_R,
  WING_R,
  arcLabelR,
  dialPoint,
  gaugeFrame,
  holdGpsHeading,
  markerPx,
  wingSweepLabel,
  wingTransform,
} from '../src/packs/carrier-jet/wingSweep.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('pivot A and the wing drawn at 20° match the README', () => {
  assert.deepEqual(PIVOT_R, { x: 28.74, y: 74.73 });
  assert.deepEqual(PIVOT_L, { x: -28.74, y: 74.73 });
  assert.match(WING_R, /^M7 75\.7 /);
});

test('sweep rotation: right is (s − 20) about the right pivot, left is (20 − s) about the mirror then scale(-1 1)', () => {
  assert.equal(wingTransform(20, 'r'), 'rotate(0.00 28.74 74.73)');
  assert.equal(wingTransform(20, 'l'), 'rotate(0.00 -28.74 74.73) scale(-1 1)');
  assert.equal(wingTransform(45, 'r'), 'rotate(25.00 28.74 74.73)');
  assert.equal(wingTransform(45, 'l'), 'rotate(-25.00 -28.74 74.73) scale(-1 1)');
  assert.equal(wingTransform(68, 'r'), 'rotate(48.00 28.74 74.73)');
  assert.equal(wingTransform(68, 'l'), 'rotate(-48.00 -28.74 74.73) scale(-1 1)');
  assert.equal(wingTransform(75, 'r'), 'rotate(55.00 28.74 74.73)');
  assert.equal(wingTransform(75, 'l'), 'rotate(-55.00 -28.74 74.73) scale(-1 1)');
  assert.equal(wingTransform(Number.NaN, 'r'), wingTransform(20, 'r'));
});

test('GPS course holds the last finite heading and ignores null / NaN', () => {
  assert.equal(holdGpsHeading(null, null), null);
  assert.equal(holdGpsHeading(null, Number.NaN), null);
  assert.equal(holdGpsHeading(12, null), 12);
  assert.equal(holdGpsHeading(12, Number.NaN), 12);
  assert.equal(holdGpsHeading(null, 90), 90);
  assert.equal(holdGpsHeading(90, 370), 10);
  assert.equal(holdGpsHeading(90, -10), 350);
  assert.equal(holdGpsHeading(90, 360), 0);
  assert.equal(holdGpsHeading(90, 0), 0);
});

test('marker is 32 px, 24 px on a short map cell', () => {
  assert.equal(markerPx(400), 32);
  assert.equal(markerPx(160), 32);
  assert.equal(markerPx(159), 24);
  assert.equal(markerPx(0), 32);
});

test('the scale is a wide arc on the centreline: 75 on the left, 20/45/68 on the right, jet at 67.7% of the face', () => {
  const frame = gaugeFrame(249 / 171, false);
  assert.ok(Math.abs(frame.x + frame.w / 2) < 0.01);
  assert.ok(Math.abs(JET_H / frame.h - 0.677) < 0.001);
  assert.equal(ARC_LEFT.a0, 180 - ARC_RIGHT.a1);
  assert.equal(ARC_LEFT.a1, 180 - ARC_RIGHT.a0);
  assert.ok(ARC_R > 80);
  const r = arcLabelR(12);
  const at = (text: string) => dialPoint(ARC_LABELS.find((l) => l.text === text)!.deg, r);
  assert.ok(at('20').x > 0 && at('45').x > 0 && at('68').x > 0);
  assert.ok(at('75').x < 0);
  assert.equal(ARC_LABELS.find((l) => l.text === '75')!.faint, true);
  // A short cell still keeps the centreline in the middle of its art box.
  const short = gaugeFrame(1.1, true);
  assert.ok(Math.abs(short.x + short.w / 2) < 0.01);
  assert.ok(short.h < frame.h);
});

test('meter name is the degree readout, and parked says oversweep', () => {
  assert.equal(wingSweepLabel(45, false), 'Wing sweep 45 degrees');
  assert.equal(wingSweepLabel(74.6, true), 'Wing sweep 75 degrees, parked oversweep');
});

test('the map marker follows the held GPS course, not a second heading smoother', () => {
  const live = src('packs/mounts/CjLiveMap.tsx');
  assert.match(live, /holdGpsHeading\(courseRef\.current, f\.heading\)/);
  assert.match(live, /c\.course \?\? lastApplied\.current\?\.bearing/);
  assert.match(live, /const shipRot = view\.northUp \? \(course \?\? 0\) : 0/);
  assert.doesNotMatch(live, /smoothHeading/);
  assert.match(live, /<WingSweepMarker /);
  assert.doesNotMatch(live, /className="cjv2-own"/);
});
