/** Live OAT module (carrier-jet/weather): NWS → Open-Meteo chain, caching, observation pick, schedule. Mocked fetch only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nwsIconCond, sunUp, textCond, wmoCond } from '../src/packs/carrier-jet/weather/conditions.ts';
import { cellKey, fetchWeather, NWS, nwsStations, OM, pickStation, type Fetch } from '../src/packs/carrier-jet/weather/sources.ts';
import { km, POLL_INIT, startWxPoller, WX_MIN_GAP_MS, WX_REFRESH_MS, wxDue, wxFail, wxOk } from '../src/packs/carrier-jet/weather/poller.ts';
import { WX_CONDS } from '../src/packs/carrier-jet/wxView.ts';

// any real network call fails the suite
globalThis.fetch = (() => { throw new Error('network used in a test'); }) as typeof fetch;

const NOW = Date.UTC(2026, 9, 17, 0, 3); // 8:03 PM EDT, as in RESEARCH.md
const iso = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString();
const ob = (minAgo: number, temp: number | null, text = '', icon: string | null = null, qc = 'V') => ({ properties: { timestamp: iso(minAgo), temperature: { unitCode: 'wmoUnit:degC', value: temp, qualityControl: qc }, textDescription: text, icon } });
const POINTS = { properties: { observationStations: `${NWS}/gridpoints/JAX/66,64/stations` } };
const STATIONS = { features: ['KNIP', 'KCRG', 'KJAX'].map((stationIdentifier) => ({ properties: { stationIdentifier } })) };
const OM_JSON = { current: { time: '2026-10-16T23:45', interval: 900, temperature_2m: 26.2, weather_code: 3, is_day: 0 } };

type Route = (url: string) => { status: number; body?: unknown } | undefined;
function fakeFetch(route: Route) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f: Fetch = async (url, init) => {
    calls.push({ url, headers: { ...(init?.headers ?? {}) } });
    const r = route(url) ?? { status: 599 };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f, calls };
}
const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

test('conditions: WMO, NWS icons (day/night, PoP suffix, wind_*), text keywords; all land on Meghan\'s glyph set', () => {
  assert.equal(wmoCond(0), 'clear'); assert.equal(wmoCond(2), 'partly_cloudy'); assert.equal(wmoCond(3), 'cloudy');
  assert.equal(wmoCond(53), 'drizzle'); assert.equal(wmoCond(63), 'rain'); assert.equal(wmoCond(65), 'heavy_rain');
  assert.equal(wmoCond(66), 'sleet'); assert.equal(wmoCond(75), 'snow'); assert.equal(wmoCond(95), 'thunder'); assert.equal(wmoCond(45), 'fog');
  assert.equal(wmoCond(7), 'unknown'); assert.equal(wmoCond(undefined), null);
  assert.deepEqual(nwsIconCond('https://api.weather.gov/icons/land/night/bkn?size=medium'), { cond: 'cloudy', isDay: false });
  assert.deepEqual(nwsIconCond('https://api.weather.gov/icons/land/day/tsra_sct,40/rain?size=small'), { cond: 'thunder', isDay: true });
  assert.deepEqual(nwsIconCond('https://api.weather.gov/icons/land/day/wind_few'), { cond: 'wind', isDay: true });
  assert.deepEqual(nwsIconCond('https://api.weather.gov/icons/land/night/few'), { cond: 'clear', isDay: false });
  assert.equal(nwsIconCond(null), null);
  assert.equal(textCond('Mostly Cloudy'), 'cloudy'); assert.equal(textCond('Partly Cloudy'), 'partly_cloudy');
  assert.equal(textCond('Light Drizzle'), 'drizzle'); assert.equal(textCond('Heavy Rain'), 'heavy_rain'); assert.equal(textCond('Freezing Rain'), 'sleet');
  assert.equal(textCond('Thunderstorms and Rain'), 'thunder'); assert.equal(textCond('Haze'), 'fog'); assert.equal(textCond('Fair'), 'clear'); assert.equal(textCond(''), null);
  for (const c of [wmoCond(0), wmoCond(99), textCond('Windy'), nwsIconCond('/icons/land/day/hurricane')!.cond]) assert.ok(WX_CONDS.includes(c!));
  assert.equal(sunUp(30.33, -81.66, Date.UTC(2026, 9, 16, 17)), true, 'Jacksonville 1 PM EDT');
  assert.equal(sunUp(30.33, -81.66, Date.UTC(2026, 9, 17, 4)), false, 'midnight EDT');
});

test('NWS pick: newest temp ≤ 75 min (null / QC X skipped), condition ≤ 90 min (icon, then text)', () => {
  const s = pickStation([ob(23, 25, 'Mostly Cloudy', `${NWS}/icons/land/night/bkn`), ob(28, 26), ob(3, null, 'Clear'), ob(1, 40, '', null, 'X')], NOW, 30.33, -81.66);
  assert.deepEqual(s.temp, { c: 25, t: NOW - 23 * 60000 });
  assert.deepEqual(s.cond, { cond: 'clear', isDay: false }, 'newest non-empty condition wins (text, night by sun)');
  const old = pickStation([ob(80, 28.9), ob(130, 30, 'Partly Cloudy', `${NWS}/icons/land/day/sct`)], NOW, 30.33, -81.66);
  assert.equal(old.temp, null, '> 75 min');
  assert.equal(old.cond, null, '> 90 min');
});

test('NWS chain: points + stations cached 24 h per 2-dp cell; nearest station with a temp wins, condition borrowed; only Accept sent', async () => {
  const kv = mem();
  const { f, calls } = fakeFetch((u) => {
    if (u === `${NWS}/points/30.33,-81.66`) return { status: 200, body: POINTS };
    if (u === `${NWS}/gridpoints/JAX/66,64/stations?limit=3`) return { status: 200, body: STATIONS };
    if (u.includes('/stations/KNIP/')) return { status: 200, body: { features: [ob(70, 28.9)] } };
    if (u.includes('/stations/KCRG/')) return { status: 200, body: { features: [ob(23, 26, 'Clear', `${NWS}/icons/land/night/skc`)] } };
    return undefined;
  });
  const o = await fetchWeather(f, kv, 'p.', 30.33333, -81.65555, NOW);
  assert.deepEqual(o, { tempC: 28.9, cond: 'clear', isDay: false, obsAt: NOW - 70 * 60000, source: 'nws' });
  assert.ok(calls.every((c) => JSON.stringify(c.headers) === '{"Accept":"application/geo+json"}'), 'Accept only, no User-Agent');
  assert.ok(kv.m.has(`p.points:${cellKey(30.33333, -81.65555)}`));
  assert.equal(cellKey(30.33333, -81.65555), '30.33,-81.66');
  calls.length = 0;
  await fetchWeather(f, kv, 'p.', 30.331, -81.659, NOW + 15 * 60000);
  assert.ok(!calls.some((c) => c.url.includes('/points/') || c.url.endsWith('?limit=3')), 'cache hit: observations only');
  // 24 h later: re-resolved
  calls.length = 0;
  await nwsStations(f, kv, 'p.', 30.33, -81.66, NOW + 25 * 3600000);
  assert.ok(calls.some((c) => c.url.includes('/points/')));
});

test('outside the US (/points 404) → Open-Meteo, cached as non-NWS; NWS failure / stale stations → Open-Meteo; both down → throws', async () => {
  const kv = mem();
  const { f, calls } = fakeFetch((u) => (u.startsWith(`${NWS}/points/51.5,-0.12`) ? { status: 404 } : u.startsWith(OM) ? { status: 200, body: OM_JSON } : undefined));
  const o = await fetchWeather(f, kv, 'p.', 51.5, -0.12, NOW);
  assert.deepEqual(o, { tempC: 26.2, cond: 'cloudy', isDay: false, obsAt: Date.UTC(2026, 9, 16, 23, 45), source: 'om' });
  assert.match(calls.at(-1)!.url, /latitude=51\.5&longitude=-0\.12&current=temperature_2m,weather_code,is_day&timezone=GMT/);
  calls.length = 0;
  await fetchWeather(f, kv, 'p.', 51.5, -0.12, NOW + 60000);
  assert.equal(calls.length, 1, 'non-US cell goes straight to Open-Meteo');
  const stale = fakeFetch((u) => (u.includes('/points/') ? { status: 200, body: POINTS } : u.endsWith('?limit=3') ? { status: 200, body: STATIONS } : u.includes('/observations') ? { status: 200, body: { features: [ob(100, 20)] } } : u.startsWith(OM) ? { status: 200, body: OM_JSON } : undefined));
  assert.equal((await fetchWeather(stale.f, mem(), 'p.', 30.33, -81.66, NOW)).source, 'om');
  const down = fakeFetch((u) => (u.startsWith(OM) ? { status: 503 } : { status: 500 }));
  await assert.rejects(fetchWeather(down.f, mem(), 'p.', 30.33, -81.66, NOW), (e: Error & { status?: number }) => e.status === 503);
});

test('schedule: first fix, 15 min ± jitter, > 10 km move (≥ 5 min apart), paused while hidden, backoff 30 s / 2 min / 5 min, 429/503 ≥ 5 min', () => {
  const jax = { lat: 30.33, lon: -81.66 };
  assert.equal(wxDue(POLL_INIT, null, NOW, false), false, 'no fix → no request');
  assert.equal(wxDue(POLL_INIT, jax, NOW, true), false, 'hidden');
  assert.equal(wxDue(POLL_INIT, jax, NOW, false), true);
  const s = wxOk(POLL_INIT, jax, NOW, 0.5);
  assert.equal(s.dueAt, NOW + WX_REFRESH_MS);
  assert.equal(wxOk(POLL_INIT, jax, NOW, 1).dueAt, NOW + WX_REFRESH_MS + 60000);
  assert.equal(wxDue(s, jax, NOW + 14 * 60000, false), false);
  assert.equal(wxDue(s, jax, NOW + 15 * 60000, false), true);
  const far = { lat: 30.45, lon: -81.66 };
  assert.ok(km(jax, far) > 10);
  assert.equal(wxDue(s, far, NOW + 4 * 60000, false), false, 'moved but < 5 min');
  assert.equal(wxDue(s, far, NOW + WX_MIN_GAP_MS, false), true, 'moved > 10 km');
  let f = wxFail(s, NOW, null);
  assert.equal(f.retryAt - NOW, 30000);
  f = wxFail(f, NOW, null); assert.equal(f.retryAt - NOW, 120000);
  f = wxFail(f, NOW, null); assert.equal(f.retryAt - NOW, 300000);
  f = wxFail(f, NOW, null); assert.equal(f.retryAt - NOW, WX_REFRESH_MS, 'then the normal schedule');
  assert.equal(wxFail(s, NOW, 429).retryAt - NOW, WX_MIN_GAP_MS);
  assert.equal(wxDue(wxFail(s, NOW, null), jax, NOW + 10000, false), false);
  assert.equal(wxDue(wxFail(s, NOW, null), jax, NOW + 30000, false), true);
});

test('poller: fetches on the first fix, keeps the last value on failure, stops cleanly', async () => {
  let now = NOW, pos: { lat: number; lon: number } | null = null, fail = false;
  const got: unknown[] = [];
  const { f, calls } = fakeFetch((u) => (fail ? { status: 503 } : u.includes('/points/') ? { status: 404 } : u.startsWith(OM) ? { status: 200, body: OM_JSON } : undefined));
  let tick: (() => void) | null = null;
  const p = startWxPoller({ fetch: f, kv: mem(), prefix: 'p.', now: () => now, random: () => 0.5, hidden: () => false, getPos: () => pos, onObs: (o) => got.push(o), setInterval: (fn) => ((tick = fn), 1), clearInterval: () => { tick = null; } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.length, 0, 'no fix, no request');
  pos = { lat: 51.5, lon: -0.12 };
  p.poke();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(got.length, 1);
  now += 16 * 60000; fail = true; tick!();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(got.length, 1, 'failure: last value kept (no new obs)');
  assert.equal(p.state().fails, 1);
  assert.ok(p.state().retryAt - now >= WX_MIN_GAP_MS, '503 waits ≥ 5 min');
  p.stop();
  assert.equal(tick, null);
});
