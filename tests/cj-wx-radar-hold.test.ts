// WX radar offline / failed fetch: the overlay keeps the last good frame (frame list + per-tile last good copy) and the
// map shows 'RADAR · 12m' (minutes since the last good fetch; hours past 60), dimmed on the OAT staleness schedule
// (wxView.wxStaleness, the one function both use). VoiceOver: 'Radar, last updated 12 minutes ago'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  __setWxRadarStatus, getWxRadarStatus, radarAgeView, reportWxRadarFetch, subscribeWxRadarStatus, WxTileCache, wxRadarStale,
} from '../src/packs/carrier-jet/wxRadar.ts';
import { WX_DIM_MIN, wxStaleness, wxView } from '../src/packs/carrier-jet/wxView.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const T = 1_700_000_000_000;
const min = (m: number) => m * 60_000;
const reset = () => __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });

test('fresh: no label; stale (last fetch failed or offline): RADAR · age since the last good fetch', () => {
  reset();
  assert.equal(radarAgeView(getWxRadarStatus(), true, T), null, 'nothing shown yet');
  reportWxRadarFetch(true, T, { host: 'https://h', path: '/v2/radar/1', time: 1 });
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(5)), null, 'fresh');
  assert.deepEqual(radarAgeView(getWxRadarStatus(), false, T + min(12)), { text: 'RADAR · 12m', aria: 'Radar, last updated 12 minutes ago', dim: false }, 'offline');
  reportWxRadarFetch(false, T + min(10));
  assert.equal(wxRadarStale(getWxRadarStatus(), true), true);
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(12))?.text, 'RADAR · 12m');
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(1))?.aria, 'Radar, last updated 1 minute ago');
  reportWxRadarFetch(true, T + min(13));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(14)), null, 'a good fetch clears it');
});

test('hours past 60 min (the OAT age format)', () => {
  reset();
  reportWxRadarFetch(true, T);
  reportWxRadarFetch(false, T + 1);
  const at = (m: number) => radarAgeView(getWxRadarStatus(), true, T + min(m));
  assert.equal(at(59)?.text, 'RADAR · 59m');
  assert.equal(at(60)?.text, 'RADAR · 1h');
  assert.equal(at(60)?.aria, 'Radar, last updated 1 hour ago');
  assert.equal(at(105)?.text, 'RADAR · 1h45');
  assert.equal(at(105)?.aria, 'Radar, last updated 1 hour 45 minutes ago');
  assert.equal(at(180)?.text, 'RADAR · 3h');
});

test('dims on the OAT schedule: the same wxStaleness, no second set of thresholds', () => {
  reset();
  reportWxRadarFetch(true, T);
  reportWxRadarFetch(false, T + 1);
  for (const m of [12, WX_DIM_MIN, WX_DIM_MIN + 1, 150, 400]) {
    assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(m))?.dim, wxStaleness(m).dim, `${m} min`);
    assert.equal(wxView({ tempC: 20, cond: null, isDay: true, source: 'om', ageMin: m }, 'mph')?.dim ?? true, wxStaleness(m).dim || wxStaleness(m).hidden);
  }
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(91))?.dim, true);
  const radar = src('packs/carrier-jet/wxRadar.ts');
  assert.match(radar, /dim: wxStaleness\(min\)\.dim/);
  assert.doesNotMatch(radar, /WX_DIM_MIN|WX_AGE_SHOW_MIN|WX_HIDE_MIN|min >=? \d/, 'no copied thresholds');
  assert.match(src('packs/carrier-jet/wxView.ts'), /const st = v \? wxStaleness\(v\.ageMin\) : null;/);
});

test('status store: a failure keeps the last good frame; good tiles while fresh do not re-render per tile', () => {
  reset();
  let n = 0;
  const off = subscribeWxRadarStatus(() => n++);
  reportWxRadarFetch(true, T, { host: 'https://h', path: '/v2/radar/1', time: 1 });
  reportWxRadarFetch(true, T + 100);
  reportWxRadarFetch(true, T + 200);
  assert.equal(n, 1, 'quiet while fresh');
  assert.equal(getWxRadarStatus().lastGoodAt, T + 200);
  reportWxRadarFetch(false, T + 300);
  assert.equal(n, 2);
  assert.deepEqual(getWxRadarStatus().frame, { host: 'https://h', path: '/v2/radar/1', time: 1 }, 'frame kept');
  reportWxRadarFetch(true, T + 400);
  assert.equal(n, 3, 'recovery is heard');
  off();
});

test('tile cache: last good copy per z/x/y from any frame, other tint as a fallback, LRU bound', () => {
  const c = new WxTileCache(3);
  const b = (v: number) => new Uint8Array([v]).buffer;
  c.put(false, 7, 1, 2, b(1));
  c.put(false, 7, 1, 2, b(2)); // newer frame replaces
  assert.equal(new Uint8Array(c.get(false, 7, 1, 2)!)[0], 2);
  assert.equal(new Uint8Array(c.get(true, 7, 1, 2)!)[0], 2, 'scope tint toggled offline: map-tint copy');
  c.put(false, 7, 1, 3, b(3));
  c.put(false, 7, 1, 4, b(4));
  c.get(false, 7, 1, 2); // touch
  c.put(false, 7, 1, 5, b(5));
  assert.equal(c.size, 3);
  assert.equal(c.get(false, 7, 1, 3), undefined, 'least recent evicted');
  assert.ok(c.get(false, 7, 1, 2));
});

test('layer wiring: failed tile → last good copy; failed frame list → last good frame; online → refresh now', () => {
  const l = src('packs/mounts/cjWxRadarLayer.ts');
  assert.match(l, /const last = lastTiles\.get\(scope, z, x, y\);\n\s*if \(last\) \{/);
  assert.match(l, /lastTiles\.put\(scope, z, x, y, data\.slice\(0\)\);\n\s*reportWxRadarFetch\(true\);/);
  assert.match(l, /const last = getWxRadarStatus\(\)\.frame;\n\s*if \(!last \|\| map\.getSource\(WX_SRC\)\) throw e;/);
  assert.match(l, /window\.addEventListener\('online', onOnline\)/);
  assert.match(l, /window\.removeEventListener\('online', onOnline\)/);
  assert.doesNotMatch(l + src('packs/carrier-jet/wxRadar.ts'), /forecast|hourly/i, 'no hourly forecast cache');
});

test('map: label in the TR corner (both modes), dim attr, spoken after the map name', () => {
  const m = src('packs/mounts/CjLiveMap.tsx');
  assert.match(m, /const radarAge = useWxRadarAge\(!!wxRadar && hasMap\);/);
  assert.match(m, /const ariaFull = radarAge \? `\$\{aria\}\. \$\{radarAge\.aria\}` : aria;/);
  assert.match(m, /aria-label=\{ariaFull\}/);
  assert.match(m, /\{radarAge && <span className="cjv2-corner cjv2-tr cjwx-rage" data-cjmap-ob data-dim=\{radarAge\.dim \|\| undefined\} aria-hidden="true">\{radarAge\.text\}<\/span>\}\n\s*<\/div>/);
  // outside the MAP-only corner block, so RADAR shows it too
  assert.ok(m.indexOf('cjwx-rage') > m.indexOf('{!radar && <>') && m.indexOf('cjwx-rage') > m.indexOf('</>}', m.indexOf('{!radar && <>')));
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(css, /\.cjv2-hsd > \.cjwx-rage\[data-dim\] \{ opacity: 0\.62; \}/);
  assert.match(css, /\.cjwx\[data-dim\] \{ opacity: 0\.62;/, 'same dim look as the OAT');
});
