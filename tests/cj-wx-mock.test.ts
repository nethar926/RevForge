/** MOCK (mock/cj-map-first): CJ OAT readout model + glyph data (pure). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtAge, WX_CONDS, WX_NIGHT_CONDS, wxMockFromQuery, wxMockValue, wxView } from '../src/packs/carrier-jet/wxMock.ts';
import { wxGlyph } from '../src/packs/carrier-jet/wxGlyphs.ts';

test('wx mock: states → live / aged / dim / hidden / temp only, units follow the speed pref', () => {
  const live = wxView(wxMockValue('live'), 'mph')!;
  assert.equal(live.temp, '79°');
  assert.equal(live.age, null);
  assert.equal(live.dim, false);
  assert.equal(wxView(wxMockValue('live'), 'kph')!.temp, '26°');
  const aged = wxView(wxMockValue('aged', { cond: 'drizzle' }), 'mph')!;
  assert.equal(aged.age, '25m');
  assert.equal(aged.aria, 'Outside air 79 degrees Fahrenheit, light rain, 25 minutes old');
  const dim = wxView(wxMockValue('dim'), 'mph')!;
  assert.equal(dim.dim, true);
  assert.equal(dim.age, '1h45');
  assert.equal(wxView(wxMockValue('hidden'), 'mph'), null);
  const t = wxView(wxMockValue('tempOnly'), 'mph')!;
  assert.equal(t.cond, null);
  assert.equal(t.aria, 'Outside air 79 degrees Fahrenheit, live');
  assert.equal(wxView({ tempC: 20, cond: 'rain', isDay: true, ageMin: 181, source: 'om' }, 'mph'), null);
  assert.equal(wxView({ tempC: null, cond: 'rain', isDay: true, ageMin: 1, source: 'om' }, 'mph'), null);
  assert.equal(fmtAge(120), '2h');
});

test('wx mock: query flag, credit by source, night only where it makes sense', () => {
  assert.equal(wxMockFromQuery('?cjMapFirst=1'), undefined);
  assert.equal(wxMockFromQuery('?cjWxMock=bogus'), undefined);
  const q = wxMockFromQuery('?cjWxMock=aged&cjWxCond=thunder&cjWxNight=1&cjWxSrc=nws')!;
  assert.equal(q.value!.cond, 'thunder');
  const v = wxView(q.value, 'mph')!;
  assert.equal(v.credit, 'Weather: NOAA/NWS');
  assert.equal(v.night, false);
  assert.equal(wxView(wxMockFromQuery('?cjWxMock=live')!.value, 'mph')!.credit, 'Weather data by Open-Meteo.com');
  assert.equal(wxView(wxMockFromQuery('?cjWxMock=live&cjWxCond=clear&cjWxNight=1')!.value, 'mph')!.night, true);
  assert.equal(wxMockFromQuery('?cjWxMock=hidden')!.value, null);
});

test('wx glyphs: every condition draws, night variants differ from day', () => {
  for (const c of WX_CONDS) {
    const d = wxGlyph(c, false);
    assert.ok(d.length > 0 && d.every((p) => /^M[-\d.]/.test(p.d) && !/NaN/.test(p.d)), c);
  }
  for (const c of WX_NIGHT_CONDS) assert.notDeepEqual(wxGlyph(c, true), wxGlyph(c, false), c);
});
