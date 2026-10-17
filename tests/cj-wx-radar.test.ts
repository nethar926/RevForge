/** MOCK (mock/cj-map-first): WX radar overlay model (RainViewer frame pick, phosphor recolour, WX edge key slot). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dbzForRgb, getWxRadar, latestFrame, rampForDbz, recolorRgba, rvSourceTemplate, rvTileUrl, setWxRadar, UNIVERSAL_BLUE, WX_RADAR_CREDIT, WX_RADAR_REFRESH_MS } from '../src/packs/carrier-jet/wxRadar.ts';
import { cellKeys, stripCount, wxSlot } from '../src/packs/carrier-jet/edgeKeys.ts';
import { MAP_VIEW_DEFAULT } from '../src/packs/carrier-jet/mapView.ts';

test('wx radar: latest past frame only, tile + protocol urls, 10 min refresh, credit', () => {
  const j = { host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: 30, path: '/v2/radar/c' }, { time: 10, path: '/v2/radar/a' }, { time: 20, path: '/v2/radar/b' }] } };
  assert.deepEqual(latestFrame(j), { host: j.host, frame: { time: 30, path: '/v2/radar/c' } });
  assert.equal(latestFrame({ host: 'http://x', radar: { past: [{ time: 1, path: '/p' }] } }), null, 'https host only');
  assert.equal(latestFrame({ host: j.host, radar: { past: [] } }), null);
  assert.equal(latestFrame(null), null);
  assert.equal(rvTileUrl(j.host, '/v2/radar/c', 7, 35, 53), 'https://tilecache.rainviewer.com/v2/radar/c/256/7/35/53/2/1_0.png');
  assert.equal(rvSourceTemplate('/v2/radar/c'), 'cjrv://v2/radar/c/{z}/{x}/{y}');
  assert.equal(WX_RADAR_REFRESH_MS, 600000);
  assert.match(WX_RADAR_CREDIT, /RainViewer/);
});

test('wx radar: Universal Blue decodes to dBZ, ramp is green → amber → red at moderate alpha', () => {
  for (const [d, c] of UNIVERSAL_BLUE) if (d >= 10 && d < 65) assert.equal(dbzForRgb(c >> 16, (c >> 8) & 255, c & 255), d, `dBZ ${d}`);
  assert.equal(rampForDbz(5)[3], 0, 'mist below 10 dBZ is dropped');
  const [g, a, r] = [rampForDbz(25), rampForDbz(42), rampForDbz(58)];
  assert.ok(g[1] > g[0] && g[1] > g[2], 'moderate = green');
  assert.ok(a[0] === 255 && a[1] > 120 && a[2] < 60, 'heavy = amber');
  assert.ok(r[0] === 255 && r[1] < 80, 'extreme = red');
  for (let d = 10; d < 80; d += 5) assert.ok(rampForDbz(d)[3] <= 180, 'alpha ≤ 0.7 so roads read through');
  const px = new Uint8ClampedArray([0x00, 0xa3, 0xe0, 255, 0xff, 0xaa, 0x00, 255, 9, 9, 9, 20, 0xc1, 0, 0, 128]);
  assert.equal(recolorRgba(px), 3);
  assert.deepEqual([...px.slice(0, 4)], [...rampForDbz(20)]);
  assert.deepEqual([...px.slice(4, 8)], [...rampForDbz(40)]);
  assert.equal(px[11], 0, 'faint edge haze cleared');
  assert.equal(px[15], Math.round((rampForDbz(50)[3] * 128) / 255), 'source alpha kept (smoothed edges)');
});

test('wx key: 5th MAP key when it fits (1256/1280), right bank K3 at 773; lit when on, unlit when off; default off', () => {
  assert.equal(getWxRadar(), false, 'default off');
  setWxRadar(true);
  assert.equal(getWxRadar(), true);
  setWxRadar(false);
  const m = MAP_VIEW_DEFAULT;
  const wide = { map: m, config: null, wx: { on: false, slot: wxSlot(357, m) } };
  assert.equal(wide.wx.slot, 'map');
  assert.equal(stripCount('map', 357, wide), 5);
  const keys = cellKeys('map', 5, wide);
  assert.deepEqual(keys.map((k) => k?.legend), ['ZM+', 'ZM−', 'N/TRK-UP', 'MAP/TERR', 'WX']);
  assert.equal(keys[4]!.unlit, true);
  assert.equal(keys[4]!.active, false);
  assert.ok(cellKeys('compass', 4, wide).every((k) => k?.id !== 'wx'));
  const on = { ...wide, wx: { on: true, slot: 'map' as const } };
  assert.deepEqual([cellKeys('map', 5, on)[4]!.active, cellKeys('map', 5, on)[4]!.unlit], [true, false]);
  assert.equal(cellKeys('map', 5, on)[4]!.ariaLabel, 'Weather radar, on');
  // radar scope keys (3) + WX
  assert.deepEqual(cellKeys('map', stripCount('map', 357, { ...wide, map: { ...m, radar: true } }), { ...wide, map: { ...m, radar: true } }).map((k) => k?.legend), ['RNG+', 'RNG−', 'MODE', 'WX']);
  const narrow = { map: m, config: null, wx: { on: false, slot: wxSlot(219, m) } };
  assert.equal(narrow.wx.slot, 'bank');
  assert.equal(stripCount('map', 219, narrow), 3);
  assert.ok(cellKeys('map', 3, narrow).every((k) => k?.id !== 'wx'));
  assert.deepEqual(cellKeys('compass', 3, narrow).map((k) => k?.legend), ['DRIVE', 'MORE', 'WX']);
  // CONFIG: no WX key (the bank K3 is the spare again)
  const cfg = { map: m, config: { tiles: {}, subs: 1 }, wx: { on: false, slot: 'bank' as const } };
  assert.equal(cellKeys('compass', 3, cfg)[2], null);
});
