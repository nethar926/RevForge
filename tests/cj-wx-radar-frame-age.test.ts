// Gate 016dcd6 (low): the radar age label counted from the last good fetch, so a frame that was 5 min old when fetched
// read 'RADAR · 0m'. It now comes from the shown frame's own RainViewer `time` (unix seconds). An implausible frame
// time (device clock skew / bogus value) falls back to the fetch time, so a bad clock never hides a live frame.
// Expiry (3 h) uses the same age, so the frame and its label still go together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { __setWxRadarStatus, getWxRadarStatus, radarAgeView, reportWxRadarFetch, wxRadarAgeMin, wxRadarExpired, WX_RADAR_FUTURE_SKEW_MS } from '../src/packs/carrier-jet/wxRadar.ts';
import { WX_HIDE_MIN, wxStaleness } from '../src/packs/carrier-jet/wxView.ts';

const T = 1_700_000_000_000;
const min = (m: number) => m * 60_000;
const sec = (ms: number) => Math.floor(ms / 1000);
const reset = () => __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });
const frame = (timeMs: number) => ({ host: 'https://tilecache.rainviewer.com', path: '/v2/radar/f', time: sec(timeMs) });

test("age from the frame's own time: a 5-min-old frame reads 'RADAR · 5m' right after the fetch", () => {
  reset();
  reportWxRadarFetch(true, T, frame(T - min(5)));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T)?.text, 'RADAR · 5m');
  assert.equal(radarAgeView(getWxRadarStatus(), true, T)?.aria, 'Radar, last updated 5 minutes ago');
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(7))?.text, 'RADAR · 12m');
  // a newer list with the same frame: age keeps counting from the frame, not the fetch
  reportWxRadarFetch(true, T + min(10), frame(T - min(5)));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(10))?.text, 'RADAR · 15m');
  // a new frame: its own age
  reportWxRadarFetch(true, T + min(20), frame(T + min(18)));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(20))?.text, 'RADAR · 2m');
  // good tiles do not reset it (they bump lastGoodAt only)
  reportWxRadarFetch(true, T + min(25));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(25))?.text, 'RADAR · 7m');
});

test('dim and expiry follow the frame age (frame and label still go together)', () => {
  reset();
  reportWxRadarFetch(true, T, frame(T - min(10)));
  reportWxRadarFetch(false, T + 1);
  for (const m of [70, 80, 81, 169, 170, 171, 300]) {
    const age = m + 10;
    const v = radarAgeView(getWxRadarStatus(), false, T + min(m));
    assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(m)), wxStaleness(age).hidden, `${m} min after fetch`);
    assert.equal(v === null, wxStaleness(age).hidden, `label ${m}`);
    if (v) assert.equal(v.dim, wxStaleness(age).dim);
  }
  assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(WX_HIDE_MIN - 10)), false);
  assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(WX_HIDE_MIN - 9)), true, '3 h of frame age, 2h51 after the fetch');
});

test('implausible frame times fall back to the fetch time (clock skew never hides a live frame)', () => {
  reset();
  // device clock 1 h behind: frame "in the future"
  reportWxRadarFetch(true, T, frame(T + min(60)));
  assert.equal(wxRadarAgeMin(getWxRadarStatus(), T + min(3)), 3);
  // within the allowed skew: clamped at 0
  reportWxRadarFetch(true, T, frame(T + WX_RADAR_FUTURE_SKEW_MS - 1000));
  assert.equal(wxRadarAgeMin(getWxRadarStatus(), T), 0);
  // device clock far ahead / bogus time (1970): the fetch time
  reportWxRadarFetch(true, T, frame(1000));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(4))?.text, 'RADAR · 4m');
  assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(4)), false);
  reportWxRadarFetch(true, T, frame(T - min(200)));
  assert.equal(wxRadarAgeMin(getWxRadarStatus(), T), 0, '> 3 h older than the fetch: not trusted');
  // no frame: fetch time; nothing yet: 0
  __setWxRadarStatus({ frame: null });
  assert.equal(wxRadarAgeMin(getWxRadarStatus(), T + min(2)), 2);
  reset();
  assert.equal(wxRadarAgeMin(getWxRadarStatus(), T), 0);
});
