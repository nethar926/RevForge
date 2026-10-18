/** WX radar overlay model (RainViewer frame pick, phosphor recolour, WX edge key slot). */
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

test('wx key: always the MAP strip\'s last key (5th at 1256/1280, swapped in for MAP/TERR at 773); lit when on, unlit when off; default off', () => {
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
  // 773 (MAP 231 px, 4 keys): WX swaps in for MAP/TERR, the strip's last key, as at 1256/1280; MAP/TERR moves to the
  // right bank's K3 spare (still one tap); RADAR on: 3 scope keys + WX, nothing moves
  const narrow = { map: m, config: null, wx: { on: false, slot: wxSlot(231, m) }, bank: 'accel' as const };
  assert.equal(narrow.wx.slot, 'swap');
  assert.equal(stripCount('map', 231, narrow), 4);
  assert.deepEqual(cellKeys('map', 4, narrow).map((k) => k?.legend), ['ZM+', 'ZM−', 'N/TRK-UP', 'WX']);
  assert.deepEqual(cellKeys('accel', 3, narrow).map((k) => k?.legend), ['DRIVE', 'MORE', 'MAP/TERR']);
  assert.equal(cellKeys('accel', 3, narrow)[2]!.ariaLabel, 'Map, switch to terrain');
  const nr = { ...narrow, map: { ...m, radar: true } };
  assert.equal(wxSlot(231, nr.map), 'map');
  const nrw = { ...nr, wx: { on: false, slot: wxSlot(231, nr.map) } };
  assert.deepEqual(cellKeys('map', stripCount('map', 231, nrw), nrw).map((k) => k?.legend), ['RNG+', 'RNG−', 'MODE', 'WX']);
  assert.equal(cellKeys('accel', 3, nrw)[2], null, 'bank K3 spare again');
  // CONFIG: no WX key, nothing displaced (the bank K3 is the spare again)
  const cfg = { map: m, config: { tiles: {}, subs: 1 }, wx: { on: false, slot: 'swap' as const }, bank: 'accel' as const };
  assert.equal(cellKeys('accel', 3, cfg)[2], null);
  assert.ok(cellKeys('map', 4, cfg).every((k) => k?.id !== 'wx'));
});

test('wx radar layer: clamped to RainViewer max zoom 7 (overzoomed above), under the roads, failures never flag the map', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  const layer = src('packs/mounts/cjWxRadarLayer.ts');
  assert.match(layer, /maxzoom: WX_RADAR_MAX_ZOOM/);
  const { WX_RADAR_MAX_ZOOM } = await import('../src/packs/carrier-jet/wxRadar.ts');
  assert.equal(WX_RADAR_MAX_ZOOM, 7);
  assert.match(layer, /'raster-fade-duration': 0/, 'static: no fade / animation');
  assert.match(layer, /BEFORE = \['road_minor'/);
  assert.match(src('packs/mounts/CjLiveMap.tsx'), /if \(e\.sourceId === WX_SRC\) return;/);
  // the key is labelled with its state and is a 52×66 bezel key
  const v2 = src('packs/mounts/CjV2Layer.tsx');
  assert.match(v2, /data-unlit=\{k\.unlit \|\| undefined\}/);
  assert.match(src('packs/mounts/carrier-jet-v2.css'), /\.cjv2-key\[data-unlit\] \.cjp-bezel text \{ fill: #ccd2d6; \}/);
});

test('WX key: the same place at every Tesla size (the MAP strip\'s last key, under the square map)', async () => {
  const { keyCount } = await import('../src/packs/carrier-jet/geometry.ts');
  const m = MAP_VIEW_DEFAULT;
  // square MAP cell widths measured at 773 / 1256 / 1280 (cj-board-batch gate: 231 / 334 / 428)
  for (const [size, w] of [['773', 231], ['1256', 334], ['1280', 428]] as const) {
    for (const radar of [false, true]) {
      const map = { ...m, radar };
      const c = { map, config: null, wx: { on: true, slot: wxSlot(w, map) }, bank: 'accel' as const };
      const keys = cellKeys('map', stripCount('map', w, c), c);
      assert.equal(keys[keys.length - 1]?.id, 'wx', `${size} radar ${radar}: WX last under MAP`);
      assert.ok(keys.length <= keyCount(w, 5));
      for (const cell of ['speed', 'mach', 'vdi', 'sweep', 'eng', 'compass', 'accel'] as const) assert.ok(cellKeys(cell, 3, c).every((k) => k?.id !== 'wx'), `${size}: no WX under ${cell}`);
    }
  }
});
