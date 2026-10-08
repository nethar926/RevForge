import test from 'node:test';
import assert from 'node:assert/strict';
import { isDriveWindow, freeRects, bestFit } from '../src/themes/useDriveWindow.ts';

test('drive-window threshold: parked 16:10 off, Tesla driving window on', () => {
  assert.equal(isDriveWindow(1280, 800), false);
  assert.equal(isDriveWindow(1255, 784), false);
  assert.equal(isDriveWindow(773, 601), true);
  assert.equal(isDriveWindow(760, 560), true);
  assert.equal(isDriveWindow(1024, 600), true);
});

test('free rects avoid the throttle card and pick the best uniform fit', () => {
  const throttle = { x: 449, y: 447, w: 300, h: 58 };
  const rects = freeRects(773, 68, 522, [throttle]);
  for (const r of rects) assert.ok(!(r.x < throttle.x + throttle.w && throttle.x < r.x + r.w && r.y < throttle.y + throttle.h && throttle.y < r.y + r.h));
  const wide = bestFit(1240, 500, rects);
  assert.ok(wide.rect.w > 700 && wide.s > 0.55);
  const tall = bestFit(600, 640, rects);
  assert.ok(tall.rect.h > 400);
});
