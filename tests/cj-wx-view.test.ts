/** CJ OAT readout model + glyph data (pure; Meghan's mock fixtures live here, not in the app) + the observation store. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtAge, WX_CONDS, WX_NIGHT_CONDS, wxView, type WxCond, type WxSource, type WxValue } from '../src/packs/carrier-jet/wxView.ts';
import { getWxObs, setWxObs, subscribeWxObs, wxValueAt } from '../src/packs/carrier-jet/wxStore.ts';
import { readFileSync } from 'node:fs';

/** Meghan's mock states as fixtures (Jacksonville evening: 26.1 °C = 79 °F). */
type WxState = 'live' | 'aged' | 'dim' | 'hidden' | 'tempOnly';
function wxMockValue(state: WxState, o: { cond?: WxCond | null; night?: boolean; tempC?: number; source?: WxSource } = {}): WxValue | null {
  const cond = o.cond === undefined ? 'partly_cloudy' : o.cond;
  const base = { tempC: o.tempC ?? 26.1, isDay: !o.night, source: o.source ?? 'om' } as const;
  switch (state) {
    case 'live': return { ...base, cond, ageMin: 4 };
    case 'aged': return { ...base, cond, ageMin: 25 };
    case 'dim': return { ...base, cond, ageMin: 105 };
    case 'tempOnly': return { ...base, cond: null, ageMin: 4 };
    case 'hidden': return null;
  }
}
import { wxGlyph } from '../src/packs/carrier-jet/wxGlyphs.ts';

test('wx: states → live / aged / dim / hidden / temp only, units follow the speed pref', () => {
  const live = wxView(wxMockValue('live'), 'f')!;
  assert.equal(live.temp, '79°');
  assert.equal(live.age, null);
  assert.equal(live.dim, false);
  assert.equal(wxView(wxMockValue('live'), 'c')!.temp, '26°');
  const aged = wxView(wxMockValue('aged', { cond: 'drizzle' }), 'f')!;
  assert.equal(aged.age, '25m');
  assert.equal(aged.aria, 'Outside air 79 degrees Fahrenheit, light rain, 25 minutes old');
  const dim = wxView(wxMockValue('dim'), 'f')!;
  assert.equal(dim.dim, true);
  assert.equal(dim.age, '1h45');
  assert.equal(wxView(wxMockValue('hidden'), 'f'), null);
  const t = wxView(wxMockValue('tempOnly'), 'f')!;
  assert.equal(t.cond, null);
  assert.equal(t.aria, 'Outside air 79 degrees Fahrenheit, live');
  assert.equal(wxView({ tempC: 20, cond: 'rain', isDay: true, ageMin: 181, source: 'om' }, 'f'), null);
  assert.equal(wxView({ tempC: null, cond: 'rain', isDay: true, ageMin: 1, source: 'om' }, 'f'), null);
  assert.equal(fmtAge(120), '2h');
});

test('wx: credit by source, night only where it makes sense; no weather mock flag left in the app', () => {
  const v = wxView(wxMockValue('aged', { cond: 'thunder', night: true, source: 'nws' }), 'f')!;
  assert.equal(v.credit, 'Weather: NOAA/NWS');
  assert.equal(v.night, false);
  assert.equal(wxView(wxMockValue('live'), 'f')!.credit, 'Weather data by Open-Meteo.com');
  assert.equal(wxView(wxMockValue('live', { cond: 'clear', night: true }), 'f')!.night, true);
  for (const f of ['packs/carrier-jet/wxView.ts', 'packs/mounts/CjV2Layer.tsx', 'packs/mounts/CarrierJetMount.tsx', 'packs/mounts/CjWxReadout.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'), /cjWxMock|cjWxCond|cjWxNight|cjWxTemp|cjWxSrc|MOCK_|wxMock/, f);
  }
});

test('wx store: observation time → age (20 min suffix, 90 min dim, 3 h hide); subscribers hear changes', () => {
  const now = Date.UTC(2026, 9, 16, 23, 0);
  const obs = { tempC: 26.1, cond: 'drizzle' as const, isDay: false, obsAt: now - 25 * 60000, source: 'nws' as const };
  assert.equal(wxView(wxValueAt(obs, now), 'f')!.aria, 'Outside air 79 degrees Fahrenheit, light rain, 25 minutes old');
  assert.equal(wxView(wxValueAt(obs, now), 'f')!.age, '25m');
  assert.equal(wxView(wxValueAt(obs, now + 70 * 60000), 'f')!.dim, true);
  assert.equal(wxView(wxValueAt(obs, now + 160 * 60000), 'f'), null);
  assert.equal(wxValueAt(null, now), null);
  let n = 0; const off = subscribeWxObs(() => n++);
  setWxObs(obs); setWxObs(obs); setWxObs(null); off(); setWxObs(obs);
  assert.equal(n, 2); assert.equal(getWxObs(), obs); setWxObs(null);
});

test('wx glyphs: every condition draws, night variants differ from day', () => {
  for (const c of WX_CONDS) {
    const d = wxGlyph(c, false);
    assert.ok(d.length > 0 && d.every((p) => /^M[-\d.]/.test(p.d) && !/NaN/.test(p.d)), c);
  }
  for (const c of WX_NIGHT_CONDS) assert.notDeepEqual(wxGlyph(c, true), wxGlyph(c, false), c);
});

// Gate 016dcd6 fail #2: the OAT followed the SPEED unit (TEMP °C + MPH still read 71°F). It follows the TEMP pref only.
test('OAT unit = CONFIG › TLM › UNITS › TEMP pref, independent of the speed unit (TEMP °C + MPH, TEMP °F + KM/H)', async () => {
  const { oatTempUnit } = await import('../src/packs/carrier-jet/wxView.ts');
  const { CJ_PREFS_DEFAULT } = await import('../src/packs/carrier-jet/cjPrefs.ts');
  const v: WxValue = { tempC: 21.4, cond: 'rain', isDay: true, ageMin: 4, source: 'nws' };
  const cases = [
    { tempUnit: 'c', speed: 'mph', temp: '21°', aria: 'Outside air 21 degrees Celsius, rain, live' },
    { tempUnit: 'f', speed: 'kph', temp: '71°', aria: 'Outside air 71 degrees Fahrenheit, rain, live' },
    { tempUnit: 'c', speed: 'kph', temp: '21°', aria: 'Outside air 21 degrees Celsius, rain, live' },
    { tempUnit: 'f', speed: 'mph', temp: '71°', aria: 'Outside air 71 degrees Fahrenheit, rain, live' },
  ] as const;
  for (const c of cases) {
    const prefs = { ...CJ_PREFS_DEFAULT, tempUnit: c.tempUnit };
    const w = wxView(v, oatTempUnit(prefs))!;
    assert.equal(w.temp, c.temp, `TEMP ${c.tempUnit} + ${c.speed}`);
    assert.equal(w.aria, c.aria, `TEMP ${c.tempUnit} + ${c.speed}`);
  }
  assert.equal(oatTempUnit(CJ_PREFS_DEFAULT), 'f', 'default °F');
  // the mount feeds the TEMP pref, never the speed unit
  const layer = readFileSync(new URL('../src/packs/mounts/CjV2Layer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /wxView\(wxValue, oatTempUnit\(prefs\)\)/);
  assert.doesNotMatch(layer, /wxView\([^)]*\bunit\b/);
});
