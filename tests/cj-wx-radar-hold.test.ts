// WX radar offline / failed fetch: the overlay keeps the last good frame (frame list + per-tile last good copy) and the
// map shows 'RADAR · 12m' (minutes since the last good fetch; hours past 60), dimmed on the OAT staleness schedule
// (wxView.wxStaleness, the one function both use). VoiceOver: 'Radar, last updated 12 minutes ago'.
// A frame never shows without its age: the label is up whenever a frame is. Past the OAT hide point (> 180 min) the
// stale frame, its label, the spoken age and the held frame/tiles all go together until a fresh frame arrives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  __setWxRadarStatus, expireWxRadarFrame, getWxRadarStatus, radarAgeView, reportWxRadarFetch, subscribeWxRadarStatus, WxTileCache, wxRadarExpired, wxRadarStale,
} from '../src/packs/carrier-jet/wxRadar.ts';
import { WX_DIM_MIN, WX_HIDE_MIN, wxStaleness, wxView } from '../src/packs/carrier-jet/wxView.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const T = 1_700_000_000_000;
const min = (m: number) => m * 60_000;
const reset = () => __setWxRadarStatus({ lastGoodAt: null, lastFailAt: null, frame: null });

test('a frame never shows without its age: label whenever a frame is up (fresh or held), age since the last good fetch', () => {
  reset();
  assert.equal(radarAgeView(getWxRadarStatus(), true, T), null, 'nothing shown yet');
  reportWxRadarFetch(true, T, { host: 'https://h', path: '/v2/radar/1', time: 1 });
  assert.deepEqual(radarAgeView(getWxRadarStatus(), true, T + min(5)), { text: 'RADAR · 5m', aria: 'Radar, last updated 5 minutes ago', dim: false, stale: false }, 'fresh');
  assert.deepEqual(radarAgeView(getWxRadarStatus(), false, T + min(12)), { text: 'RADAR · 12m', aria: 'Radar, last updated 12 minutes ago', dim: false, stale: true }, 'offline');
  reportWxRadarFetch(false, T + min(10));
  assert.equal(wxRadarStale(getWxRadarStatus(), true), true);
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(12))?.text, 'RADAR · 12m');
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(1))?.aria, 'Radar, last updated 1 minute ago');
  reportWxRadarFetch(true, T + min(13));
  const v = radarAgeView(getWxRadarStatus(), true, T + min(14));
  assert.equal(v?.text, 'RADAR · 1m', 'a good fetch resets the age; the label stays');
  assert.equal(v?.stale, false);
  for (let m = 0; m <= WX_HIDE_MIN; m += 7) assert.ok(radarAgeView(getWxRadarStatus(), m % 2 === 0, T + min(13 + m)), `label up at ${m} min`);
});

test('hours past 60 min (the OAT age format)', () => {
  reset();
  reportWxRadarFetch(true, T, { host: 'https://h', path: '/v2/radar/1', time: 1 });
  reportWxRadarFetch(false, T + 1);
  const at = (m: number) => radarAgeView(getWxRadarStatus(), true, T + min(m));
  assert.equal(at(59)?.text, 'RADAR · 59m');
  assert.equal(at(60)?.text, 'RADAR · 1h');
  assert.equal(at(60)?.aria, 'Radar, last updated 1 hour ago');
  assert.equal(at(105)?.text, 'RADAR · 1h45');
  assert.equal(at(105)?.aria, 'Radar, last updated 1 hour 45 minutes ago');
  assert.equal(at(180)?.text, 'RADAR · 3h', 'still up at exactly 3h');
});

test('3h stale: the frame, the label and the spoken age go together (the OAT hide point, wxStaleness)', () => {
  reset();
  reportWxRadarFetch(true, T, { host: 'https://h', path: '/v2/radar/1', time: 1 });
  reportWxRadarFetch(false, T + 1);
  for (const m of [12, 179, 180, 181, 400]) {
    assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(m)), wxStaleness(m).hidden, `${m} min`);
    // label null exactly when expired: never a frame without its age, never an age without a frame
    assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(m)) === null, wxStaleness(m).hidden, `${m} min label`);
  }
  assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(180)), false);
  assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(180.5)), true);
  // the layer drops the held frame: WX off/on (re-attach offline) has nothing to put back
  expireWxRadarFrame();
  assert.equal(getWxRadarStatus().frame, null, 'held frame cleared');
  assert.equal(radarAgeView(getWxRadarStatus(), false, T + min(181)), null);
  reportWxRadarFetch(false, T + min(200));
  assert.equal(getWxRadarStatus().frame, null, 'a further failure brings nothing back');
  // good tiles alone (no frame list) do not resurrect it either
  reportWxRadarFetch(true, T + min(201));
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(201)), null);
  // a fresh frame list: frame + label back
  reportWxRadarFetch(true, T + min(202), { host: 'https://h', path: '/v2/radar/2', time: 2 });
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(203))?.text, 'RADAR · 1m');
  assert.equal(wxRadarExpired(getWxRadarStatus(), T + min(203)), false);
});

test('expiry is never before a frame exists and clearing is quiet when nothing is held', () => {
  reset();
  assert.equal(wxRadarExpired(getWxRadarStatus(), T), false);
  let n = 0;
  const off = subscribeWxRadarStatus(() => n++);
  expireWxRadarFrame();
  assert.equal(n, 0);
  off();
});

test('dims on the OAT schedule: the same wxStaleness, no second set of thresholds', () => {
  reset();
  reportWxRadarFetch(true, T, { host: 'https://h', path: '/v2/radar/1', time: 1 });
  reportWxRadarFetch(false, T + 1);
  for (const m of [12, WX_DIM_MIN, WX_DIM_MIN + 1, 150, 400]) {
    assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(m))?.dim ?? true, wxStaleness(m).dim || wxStaleness(m).hidden, `${m} min`);
    assert.equal(wxView({ tempC: 20, cond: null, isDay: true, source: 'om', ageMin: m }, 'mph')?.dim ?? true, wxStaleness(m).dim || wxStaleness(m).hidden);
  }
  assert.equal(radarAgeView(getWxRadarStatus(), true, T + min(91))?.dim, true);
  const radar = src('packs/carrier-jet/wxRadar.ts');
  assert.match(radar, /const st = wxStaleness\(min\);\n\s*if \(st\.hidden\) return null;/);
  assert.match(radar, /dim: st\.dim/);
  assert.match(radar, /export const wxRadarExpired = \(s: WxRadarStatus, now: number\) => s\.lastGoodAt != null && wxStaleness\(\(now - s\.lastGoodAt\) \/ 60000\)\.hidden;/);
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
  assert.match(l, /const last = wxRadarExpired\(getWxRadarStatus\(\), Date\.now\(\)\) \? undefined : lastTiles\.get\(scope, z, x, y\);\n\s*if \(last\) \{/);
  assert.match(l, /lastTiles\.put\(scope, z, x, y, data\.slice\(0\)\);\n\s*reportWxRadarFetch\(true\);/);
  assert.match(l, /const last = getWxRadarStatus\(\)\.frame;\n\s*if \(!last \|\| map\.getSource\(WX_SRC\)\) throw e;/);
  assert.match(l, /window\.addEventListener\('online', onOnline\)/);
  assert.match(l, /window\.removeEventListener\('online', onOnline\)/);
  // 3h: drop = clear held tiles + remove layer/source + clear held frame; checked on attach, on every status change
  // and every 30 s; a failed frame list past 3h drops instead of putting the held frame back
  assert.match(l, /const drop = \(\) => \{\n\s*lastTiles\.clear\(\);\n\s*unput\(\);\n\s*expireWxRadarFrame\(\);/);
  assert.match(l, /checkExpiry\(\);\n\s*void tick\(\);\n\s*const offExpiry = subscribeWxRadarStatus\(checkExpiry\);\n\s*const expiryTimer = window\.setInterval\(checkExpiry, 30_000\);/);
  assert.match(l, /if \(wxRadarExpired\(getWxRadarStatus\(\), Date\.now\(\)\)\) \{\n\s*drop\(\);\n\s*throw e;\n\s*\}\n\s*const last = getWxRadarStatus\(\)\.frame;/);
  assert.match(l, /offExpiry\(\);\n\s*clearInterval\(expiryTimer\);/);
  assert.doesNotMatch(l + src('packs/carrier-jet/wxRadar.ts'), /forecast|hourly/i, 'no hourly forecast cache');
});

test('map: label in the TR corner (both modes), dim attr, spoken after the map name', () => {
  const m = src('packs/mounts/CjLiveMap.tsx');
  assert.match(m, /const radarAge = useWxRadarAge\(!!wxRadar && hasMap\);/);
  assert.match(m, /const ariaFull = radarAge \? `\$\{aria\}\. \$\{radarAge\.aria\}` : aria;/);
  assert.match(m, /aria-label=\{ariaFull\}/);
  assert.match(m, /\{radarAge && <span className="cjv2-corner cjv2-tr cjwx-rage" data-cjmap-ob data-dim=\{radarAge\.dim \|\| undefined\} data-held=\{radarAge\.stale \|\| undefined\} aria-hidden="true"><span className="cjwx-rage-t">\{radarAge\.text\}<\/span><\/span>\}\n\s*<\/div>/);
  assert.doesNotMatch(m, /cjwx-rage[^\n]*data-stale=/, 'not data-stale: .cjv2-tr[data-stale] greys the whole chip to 0.45');
  // outside the MAP-only corner block, so RADAR shows it too
  assert.ok(m.indexOf('cjwx-rage') > m.indexOf('{!radar && <>') && m.indexOf('cjwx-rage') > m.indexOf('</>}', m.indexOf('{!radar && <>')));
  const css = src('packs/mounts/carrier-jet-v2.css');
  // one dim level for OAT and the radar age; the age dims its text, not the chip
  assert.match(css, /\.cjv2 \{ --cjwx-dim: 0\.62; \}/);
  assert.match(css, /\.cjwx\[data-dim\] \{ opacity: var\(--cjwx-dim, 0\.62\);/, 'OAT');
  assert.match(css, /\.cjv2-hsd > \.cjwx-rage\[data-dim\] > \.cjwx-rage-t \{ opacity: var\(--cjwx-dim, 0\.62\); \}/, 'radar age');
  // the N-UP chip: same classes (.cjv2-corner → backing, padding, 11px font), full brightness, phosphor
  assert.match(css, /\.cjv2-hsd > \.cjwx-rage \{ right: 60px; color: #8dffad; opacity: 1; z-index: 1; \}/);
});

// WCAG relative luminance / contrast, sRGB
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg: number[], a: number, bg: number[]) => fg.map((v, i) => v * a + bg[i] * (1 - a));
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test('radar age chip contrast (from the CSS): >= 4.5:1 lit, >= 3:1 dimmed, even over the brightest thing under it', () => {
  const css = src('packs/mounts/carrier-jet-v2.css');
  const chip = /\.cjv2-hsd > \.cjv2-corner \{ background: rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\);/.exec(css)!;
  assert.ok(chip, 'N-UP chip backing');
  const chipRgb = [+chip[1], +chip[2], +chip[3]], chipA = +chip[4];
  const text = hex(/\.cjv2-hsd > \.cjwx-rage \{[^}]*color: (#[0-9a-f]{6});/.exec(css)![1]);
  const dim = +/--cjwx-dim: ([\d.]+);/.exec(css)![1];
  // under the chip: map black, a phosphor road (#8dffad), the brightest rain ramp colours, and pure white (worst case)
  for (const under of [[4, 16, 9], hex('#8dffad'), hex('#ffb000'), hex('#ff4a3a'), [255, 255, 255]]) {
    const bg = over(chipRgb, chipA, under);
    const lit = ratio(text, bg), dimmed = ratio(over(text, dim, bg), bg);
    assert.ok(lit >= 4.5, `lit ${lit.toFixed(2)} over ${under}`);
    assert.ok(dimmed >= 3, `dimmed ${dimmed.toFixed(2)} over ${under}`);
  }
  // the rendered-pixel numbers from the shots (radar-*-label.png, measured the same way) sit in shots.json
});
