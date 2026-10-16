import test from 'node:test';
import assert from 'node:assert/strict';
import { GCP_FALLBACK_MS, startGeolocation, type GeoLike, type Timers } from '../src/hooks/geoStart.ts';

// Fake clock + fake geolocation: every case is deterministic.
function harness(gcpMode: 'success' | 'denied' | 'unavailable' | 'silent' | 'throw') {
  let now = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let tid = 0;
  const T: Timers = {
    setTimeout: (fn, ms) => { timers.set(++tid, { at: now + ms, fn }); return tid; },
    clearTimeout: (id) => { timers.delete(id as number); },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = end;
  };
  const log = { gcp: 0, watch: 0, watchAt: [] as number[], cleared: [] as number[], fixes: 0, errors: [] as number[] };
  let gcpOk: PositionCallback | null = null, gcpErr: PositionErrorCallback | null | undefined = null;
  let watchErr: PositionErrorCallback | null | undefined = null;
  const err = (code: number) => ({ code, message: `e${code}`, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;
  const pos = { coords: { latitude: 40, longitude: -74, accuracy: 5, heading: null, speed: 10 }, timestamp: 0 } as unknown as GeolocationPosition;
  const geo: GeoLike = {
    getCurrentPosition(ok, e) {
      log.gcp++; gcpOk = ok; gcpErr = e;
      if (gcpMode === 'throw') throw new Error('mock gcp throw');
      if (gcpMode === 'success') ok(pos);
      if (gcpMode === 'denied') e?.(err(1));
      if (gcpMode === 'unavailable') e?.(err(2));
    },
    watchPosition(_ok, e) { log.watch++; log.watchAt.push(now); watchErr = e; return 7; },
    clearWatch(id) { log.cleared.push(id); },
  };
  const s = startGeolocation(geo, () => { log.fixes++; }, (e) => { log.errors.push(e.code); }, {}, T);
  return { s, log, advance, timers, late: () => gcpOk?.(pos), lateErr: (c: number) => gcpErr?.(err(c)), watchDeny: () => watchErr?.(err(1)) };
}

test('fallback is ~3 s', () => assert.equal(GCP_FALLBACK_MS, 3000));

test('success → one watch, opened right away, fallback timer cleared', () => {
  const h = harness('success');
  assert.deepEqual([h.log.gcp, h.log.watch, h.log.fixes], [1, 1, 1]);
  assert.equal(h.log.watchAt[0], 0);
  assert.equal(h.timers.size, 0, 'no pending fallback');
  h.advance(10000);
  assert.equal(h.log.watch, 1);
});

test('PERMISSION_DENIED from getCurrentPosition → denied reported, watch still opens; watch denial reports denied again', () => {
  const h = harness('denied');
  assert.deepEqual(h.log.errors, [1]);
  assert.equal(h.log.watch, 1);
  h.watchDeny();
  assert.deepEqual(h.log.errors, [1, 1], 'status stays denied when the watch also denies');
  h.advance(10000);
  assert.equal(h.log.watch, 1);
});

test('other getCurrentPosition errors → watch opens (unchanged)', () => {
  const h = harness('unavailable');
  assert.deepEqual(h.log.errors, [2]);
  assert.equal(h.log.watch, 1);
});

test('getCurrentPosition never calls back → watch opens at 3 s, not before', () => {
  const h = harness('silent');
  assert.equal(h.log.watch, 0);
  h.advance(2999);
  assert.equal(h.log.watch, 0);
  h.advance(1);
  assert.deepEqual(h.log.watchAt, [3000]);
  h.advance(60000);
  assert.equal(h.log.watch, 1);
});

test('getCurrentPosition throws → watch opens immediately, no exception escapes', () => {
  let h!: ReturnType<typeof harness>;
  assert.doesNotThrow(() => { h = harness('throw'); });
  assert.equal(h.log.watch, 1);
  assert.equal(h.timers.size, 0);
  h.advance(10000);
  assert.equal(h.log.watch, 1);
});

test('late callback after the fallback fired → fix handled, still exactly one watch', () => {
  const h = harness('silent');
  h.advance(3000);
  assert.equal(h.log.watch, 1);
  h.late();
  assert.equal(h.log.fixes, 1, 'late fix still delivered');
  h.lateErr(1);
  assert.equal(h.log.watch, 1, 'no second watchPosition');
});

test('cancel (stop / unmount) clears the timer and the watch; later callbacks ignored', () => {
  const a = harness('silent');
  a.s.cancel();
  assert.equal(a.timers.size, 0, 'fallback timer cleared');
  a.advance(10000);
  a.late();
  assert.deepEqual([a.log.watch, a.log.fixes], [0, 0], 'no watch, no fix after cancel');
  const b = harness('success');
  b.s.cancel();
  assert.deepEqual(b.log.cleared, [7], 'watch cleared');
});
