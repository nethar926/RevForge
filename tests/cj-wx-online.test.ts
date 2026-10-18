// Gate 016dcd6 (low): the OAT poller had no 'online' listener, so after an outage it could wait out its backoff (up to
// 15 min) while the radar re-read at once. Both now re-poll on the window 'online' event, debounced (a flapping
// connection polls once), never while a fetch is in flight and not when the last fetch was fine: no double polling.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startWxPoller, WX_ONLINE_DEBOUNCE_MS, WX_REFRESH_MS, WX_RETRY_MS } from '../src/packs/carrier-jet/weather/poller.ts';
import { __setWxRadarStatus, startWxRadarLoop, WX_RADAR_ONLINE_DEBOUNCE_MS, WX_RADAR_ONLINE_FRESH_MS, type RvFetch } from '../src/packs/carrier-jet/wxRadar.ts';

const T = 1_700_000_000_000;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const OM = { current: { time: '2026-10-16T23:45', temperature_2m: 26.2, weather_code: 3, is_day: 0 } };

function clock(start = T) {
  let now = start, id = 0;
  const timers = new Map<number, { at: number; f: () => void }>();
  return {
    now: () => now,
    setTimeout: (f: () => void, ms: number) => (timers.set(++id, { at: now + ms, f }), id),
    clearTimeout: (t: unknown) => void timers.delete(t as number),
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

function poller(c: ReturnType<typeof clock>, answer: () => { ok: boolean; status: number; body?: unknown }) {
  let calls = 0;
  const f = async (u: string) => {
    calls++;
    if (u.includes('/points/')) return { ok: false, status: 404, json: async () => ({}) }; // → Open-Meteo
    const a = answer();
    return { ok: a.ok, status: a.status, json: async () => a.body };
  };
  const p = startWxPoller({
    fetch: f, kv: null, prefix: 'p.', now: c.now, random: () => 0.5, hidden: () => false, getPos: () => ({ lat: 51.5, lon: -0.12 }),
    onObs: () => undefined, setInterval: () => 1, clearInterval: () => undefined, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout,
  });
  return { p, calls: () => calls };
}

test('OAT: back online after failing offline → one re-poll after the debounce (not the 2-15 min backoff)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] }); // the 12 s fetch timeout (never reached here)
  try {
    const c = clock();
    let offline = true;
    const { p, calls } = poller(c, () => (offline ? { ok: false, status: 0 } : { ok: true, status: 200, body: OM }));
    await flush();
    assert.equal(p.state().fails, 1, 'failed while offline');
    const before = calls();
    offline = false;
    // a flapping connection: three 'online' events in a row → one poll
    p.online(); await c.advance(500); p.online(); await c.advance(500); p.online();
    await c.advance(WX_ONLINE_DEBOUNCE_MS - 1);
    assert.equal(calls(), before, 'debounced');
    await c.advance(1);
    assert.ok(calls() > before, 're-polled');
    assert.equal(p.state().fails, 0, 'recovered');
    assert.ok(c.now() - T < WX_RETRY_MS[0], 'well before the 30 s retry');
    // a second 'online' with fresh data: nothing (the 15-min schedule stands)
    const n = calls();
    p.online(); await c.advance(WX_ONLINE_DEBOUNCE_MS);
    assert.equal(calls(), n, 'no double poll when the last fetch was fine');
    assert.ok(p.state().dueAt - c.now() > WX_REFRESH_MS - 120_000);
    p.stop();
  } finally {
    mock.timers.reset();
  }
});

test('OAT: online keeps a 429/503 wait; stop() cancels a pending online re-poll', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const c = clock();
    const { p, calls } = poller(c, () => ({ ok: false, status: 503 }));
    await flush();
    assert.equal(p.state().throttled, true);
    const n = calls();
    p.online(); await c.advance(WX_ONLINE_DEBOUNCE_MS);
    assert.equal(calls(), n, '503: the ≥ 5 min wait stands');
    p.online(); p.stop(); await c.advance(WX_ONLINE_DEBOUNCE_MS);
    assert.equal(calls(), n);
  } finally {
    mock.timers.reset();
  }
});

test('radar: online → debounced re-read after a failure; skipped when the list was read fine < 1 min ago', async () => {
  __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });
  const c = clock();
  let down = false, calls = 0;
  const f: RvFetch = async () => {
    calls++;
    if (down) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, json: async () => ({ host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Math.floor(c.now() / 1000) - 300, path: '/v2/radar/x' }] } }) };
  };
  const loop = startWxRadarLoop({ fetch: f, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, show: () => undefined, shown: () => true, expire: () => undefined });
  await flush();
  assert.equal(calls, 1);
  // fresh: an 'online' right after a good read does nothing
  loop.online(); await c.advance(WX_RADAR_ONLINE_DEBOUNCE_MS);
  assert.equal(calls, 1, 'no double poll');
  // offline: a refresh fails; back online (flapping) → one re-read after the debounce
  down = true;
  await loop.refresh();
  assert.equal(calls, 2);
  down = false;
  loop.online(); await c.advance(300); loop.online();
  await c.advance(WX_RADAR_ONLINE_DEBOUNCE_MS - 1);
  assert.equal(calls, 2, 'debounced');
  await c.advance(1);
  assert.equal(calls, 3, 're-read once');
  // a minute later with no failure: online re-reads (the list may have moved on)
  await c.advance(WX_RADAR_ONLINE_FRESH_MS);
  loop.online(); await c.advance(WX_RADAR_ONLINE_DEBOUNCE_MS);
  assert.equal(calls, 4);
  loop.stop();
});

test('wiring: CjV2Layer and the radar layer listen for online (and remove the listener)', () => {
  const l = src('packs/mounts/CjV2Layer.tsx');
  assert.match(l, /const onOnline = \(\) => p\.online\(\);\n\s*window\.addEventListener\('online', onOnline\);/);
  assert.match(l, /window\.removeEventListener\('online', onOnline\);/);
  const r = src('packs/mounts/cjWxRadarLayer.ts');
  assert.match(r, /const onOnline = \(\) => loop\.online\(\);/);
});
