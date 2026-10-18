// Gate 016dcd6 (medium): the RainViewer frame-list fetch had no timeout. If api.rainviewer.com hung, that tick never
// finished, the 10-min refresh stopped and lastFailAt was never set (the label aged without the held state).
// Now each list fetch aborts after WX_RADAR_FETCH_TIMEOUT_MS (raced, so even a fetch that ignores its signal settles),
// the failure reaches the status store (held) and the next refresh is always scheduled. The OAT weather fetch keeps its
// 12 s timeout, raced the same way. Never-resolving fetch stubs; fake clocks; no network.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setWxRadarStatus, getWxRadarStatus, radarAgeView, reportWxRadarFetch, startWxRadarLoop, WX_RADAR_API, WX_RADAR_FETCH_TIMEOUT_MS, WX_RADAR_REFRESH_MS, type RvFetch,
} from '../src/packs/carrier-jet/wxRadar.ts';
import { startWxPoller, WX_FETCH_TIMEOUT_MS, WX_RETRY_MS } from '../src/packs/carrier-jet/weather/poller.ts';
import { abortable } from '../src/packs/carrier-jet/weather/abortable.ts';

const T = 1_700_000_000_000;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

/** Fake clock for the injected timers. */
function clock(start = T) {
  let now = start, id = 0;
  const timers = new Map<number, { at: number; f: () => void }>();
  return {
    now: () => now,
    setTimeout: (f: () => void, ms: number) => (timers.set(++id, { at: now + ms, f }), id),
    clearTimeout: (t: unknown) => void timers.delete(t as number),
    pending: () => [...timers.values()].map((t) => t.at - now).sort((a, b) => a - b),
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].f();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
const FRAMES = (time: number, path = `/v2/radar/${time}`) => ({ host: 'https://tilecache.rainviewer.com', radar: { past: [{ time, path }] } });
const okRes = (j: unknown) => ({ ok: true, status: 200, json: async () => j });
const never = () => new Promise<never>(() => undefined);

test('abortable: rejects on abort even if the wrapped promise never settles', async () => {
  const ac = new AbortController();
  const p = abortable(never(), ac.signal);
  ac.abort(new Error('timeout'));
  await assert.rejects(p, /timeout/);
  await assert.rejects(abortable(Promise.resolve(1), ac.signal), /timeout/, 'already aborted');
  assert.equal(await abortable(Promise.resolve(2), new AbortController().signal), 2);
});

test('radar frame list: a never-resolving fetch times out (~10 s), reports a failure (held) and the 10-min refresh continues', async () => {
  __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });
  const c = clock();
  let hang = false, calls = 0, sawSignal: AbortSignal | null = null;
  const shown: string[] = [];
  let onMap = false, errors = 0;
  // the stub ignores its signal on purpose: the loop's race must still settle it
  const f: RvFetch = async (u, i) => {
    assert.equal(u, WX_RADAR_API);
    calls++;
    sawSignal = i.signal;
    if (hang) return never();
    return okRes(FRAMES(Math.floor(c.now() / 1000) - 300));
  };
  const loop = startWxRadarLoop({ fetch: f, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, show: (fr) => { shown.push(fr.frame.path); onMap = true; }, shown: () => onMap, expire: () => { onMap = false; }, onError: () => errors++ });
  await flush();
  assert.equal(WX_RADAR_FETCH_TIMEOUT_MS, 10_000);
  assert.equal(calls, 1);
  assert.equal(shown.length, 1, 'first frame up');
  assert.deepEqual(c.pending(), [WX_RADAR_REFRESH_MS], 'next refresh scheduled (timeout cleared)');
  const firstGood = getWxRadarStatus().lastGoodAt;

  // api.rainviewer.com hangs
  hang = true;
  await c.advance(WX_RADAR_REFRESH_MS);
  assert.equal(calls, 2);
  assert.equal(loop.busy(), true, 'in flight');
  assert.deepEqual(c.pending(), [WX_RADAR_FETCH_TIMEOUT_MS], 'only the timeout is pending while it hangs');
  await c.advance(WX_RADAR_FETCH_TIMEOUT_MS - 1);
  assert.equal(loop.busy(), true, 'not before 10 s');
  await c.advance(1);
  assert.equal(loop.busy(), false, 'settled at 10 s');
  assert.equal(sawSignal!.aborted, true, 'the request itself is aborted too');
  assert.equal(errors, 1);
  const st = getWxRadarStatus();
  assert.ok(st.lastFailAt! > (st.lastGoodAt ?? 0), 'failure recorded after the last good fetch');
  assert.equal(st.lastGoodAt, firstGood);
  assert.equal(radarAgeView(st, true, c.now())?.stale, true, 'held state shows (online, but the list failed)');
  assert.equal(onMap, true, 'held frame stays up');
  assert.deepEqual(c.pending(), [WX_RADAR_REFRESH_MS], 'the next 10-min refresh is still scheduled');

  // still hanging: every refresh times out and re-schedules, never stacks
  await c.advance(WX_RADAR_REFRESH_MS + WX_RADAR_FETCH_TIMEOUT_MS);
  assert.equal(calls, 3);
  assert.deepEqual(c.pending(), [WX_RADAR_REFRESH_MS]);

  // API back: next refresh recovers, held clears
  hang = false;
  await c.advance(WX_RADAR_REFRESH_MS);
  assert.equal(calls, 4);
  assert.equal(radarAgeView(getWxRadarStatus(), true, c.now())?.stale, false, 'held clears');
  assert.deepEqual(c.pending(), [WX_RADAR_REFRESH_MS]);
  loop.stop();
  assert.deepEqual(c.pending(), [], 'stop clears the refresh');
});

test('radar frame list: refresh() while a request is in flight does not start a second one; stop() mid-flight schedules nothing', async () => {
  __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });
  const c = clock();
  let calls = 0, errors = 0;
  const loop = startWxRadarLoop({ fetch: () => (calls++, never()), now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, show: () => undefined, shown: () => false, expire: () => undefined, onError: () => errors++ });
  await flush();
  void loop.refresh();
  void loop.refresh();
  await flush();
  assert.equal(calls, 1, 'one fetch at a time');
  loop.stop();
  await c.advance(WX_RADAR_FETCH_TIMEOUT_MS * 2);
  assert.equal(errors, 0, 'a stop is not a failure');
  assert.equal(getWxRadarStatus().lastFailAt, null);
  assert.deepEqual(c.pending(), []);
});

test('radar frame list: an HTTP error also reports a failure and re-schedules', async () => {
  __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });
  reportWxRadarFetch(true, T - 60_000, { host: 'https://h', path: '/v2/radar/x', time: T / 1000 - 300 });
  const c = clock();
  let put = 0;
  const loop = startWxRadarLoop({ fetch: async () => ({ ok: false, status: 503, json: async () => null }), now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, show: () => void put++, shown: () => false, expire: () => undefined });
  await flush();
  assert.equal(getWxRadarStatus().lastFailAt, T);
  assert.equal(put, 1, 're-created map offline: the held frame is put back');
  assert.deepEqual(c.pending(), [WX_RADAR_REFRESH_MS]);
  loop.stop();
});

test('OAT weather fetch: a never-resolving fetch (ignoring its signal) times out at 12 s and retries on the backoff', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let now = T, calls = 0;
    let tick: (() => void) | null = null;
    const p = startWxPoller({
      fetch: () => (calls++, never()), kv: null, prefix: 'p.', now: () => now, random: () => 0.5, hidden: () => false,
      getPos: () => ({ lat: 30.33, lon: -81.66 }), onObs: () => undefined, setInterval: (fn) => ((tick = fn), 1), clearInterval: () => { tick = null; },
    });
    await flush();
    assert.equal(calls, 1, 'NWS points request in flight');
    mock.timers.tick(WX_FETCH_TIMEOUT_MS - 1);
    await flush();
    assert.equal(p.state().fails, 0, 'not before 12 s');
    now += WX_FETCH_TIMEOUT_MS;
    mock.timers.tick(1);
    await flush();
    assert.equal(p.state().fails, 1, 'timed out → failure');
    assert.equal(p.state().retryAt, now + WX_RETRY_MS[0], 'retry in 30 s');
    now += WX_RETRY_MS[0];
    tick!();
    await flush();
    assert.equal(calls, 2, 'the poller was freed and retried');
    p.stop();
  } finally {
    mock.timers.reset();
  }
});
