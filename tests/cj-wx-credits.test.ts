// Gate 016dcd6 fail #1 (Lana ask 1): the Open-Meteo credit must be a link (to open-meteo.com, plus its CC BY 4.0
// licence). In the (i) map-credit popover each link credit is its own full-width row >= 44px tall (Apple HIG 44pt; the
// whole row is the target), new tab, rel=noopener noreferrer, 11px text >= 4.5:1. RainViewer (asks for a link) gets
// the same row; NWS (courtesy) stays a plain row. Rendered checks: frontend-handoff/cj-weather-fix/credits-*.png.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WX_LICENSE_TEXT, WX_LICENSE_URL, wxCreditRows } from '../src/packs/carrier-jet/wxCredits.ts';
import { WX_CREDIT, WX_CREDIT_URL, wxView } from '../src/packs/carrier-jet/wxView.ts';
import { WX_RADAR_CREDIT, WX_RADAR_URL } from '../src/packs/carrier-jet/wxRadar.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('credit rows by source: Open-Meteo + CC BY 4.0 links, RainViewer link, NWS plain; text unchanged', () => {
  assert.equal(WX_CREDIT.om, 'Weather data by Open-Meteo.com');
  assert.equal(WX_CREDIT.nws, 'Weather: NOAA/NWS');
  assert.equal(WX_RADAR_CREDIT, 'Radar: RainViewer.com');
  assert.equal(WX_CREDIT_URL, 'https://open-meteo.com/');
  assert.equal(WX_LICENSE_TEXT, 'CC BY 4.0');
  assert.equal(WX_LICENSE_URL, 'https://creativecommons.org/licenses/by/4.0/');
  assert.deepEqual(wxCreditRows('om', false), [
    { id: 'om', text: 'Weather data by Open-Meteo.com', href: 'https://open-meteo.com/' },
    { id: 'om-license', text: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' },
  ]);
  assert.deepEqual(wxCreditRows('nws', true), [
    { id: 'nws', text: 'Weather: NOAA/NWS' },
    { id: 'radar', text: 'Radar: RainViewer.com', href: WX_RADAR_URL },
  ]);
  assert.deepEqual(wxCreditRows(null, true).map((r) => r.id), ['radar']);
  assert.deepEqual(wxCreditRows(null, false), [], 'no weather on screen: the plain map credit as before');
  for (const r of [...wxCreditRows('om', true), ...wxCreditRows('nws', true)]) if (r.href) assert.match(r.href, /^https:\/\//);
  // the view carries its source, so the rows follow the value on screen
  assert.equal(wxView({ tempC: 20, cond: null, isDay: true, ageMin: 1, source: 'om' }, 'f')!.source, 'om');
});

test('popover markup: link rows open a new tab with rel=noopener noreferrer; own (i) closes; plain panel unchanged without credits', () => {
  const l = src('packs/mounts/CjV2Layer.tsx');
  assert.match(l, /const credits = wxCreditRows\(wx\?\.source \?\? null, !!wxRadar\);/);
  assert.match(l, /<a key=\{c\.id\} className="cjv2-credrow" data-credit=\{c\.id\} href=\{c\.href\} target="_blank" rel="noopener noreferrer">\{c\.text\}<\/a>/);
  assert.match(l, /<span key=\{c\.id\} className="cjv2-credrow" data-credit=\{c\.id\} data-plain>\{c\.text\}<\/span>/);
  assert.match(l, /className="cjv2-info cjv2-attr-close" aria-expanded=\{true\} aria-label="Map credit" onClick=\{\(\) => setInfo\(false\)\}/);
  assert.match(l, /\{info && !credits\.length && \(\n\s*<p className="cjv2-attr" role="note">\n\s*\{MAP_CREDIT\}/);
});

// WCAG relative luminance / contrast, sRGB
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test('popover CSS: rows >= 44px full width, 11px, >= 4.5:1 (also pressed); grows up from the CRT bottom, never down', () => {
  const css = src('packs/mounts/carrier-jet-v2.css');
  const row = /\n\.cjv2-credrow \{([^}]*)\}/.exec(css)![1];
  assert.match(row, /display: flex;/);
  assert.match(row, /min-height: 44px;/);
  assert.match(row, /font-size: 11px;/);
  const link = /\.cjv2-attr > a\.cjv2-credrow \{([^}]*)\}/.exec(css)![1];
  assert.match(link, /color: #8dffad;/, 'beats .forge a { color: inherit }');
  assert.match(link, /text-decoration: underline;/, 'beats .forge a { text-decoration: none }');
  const panelBg = hex(/\.cjv2-attr \{[^}]*background: (#[0-9a-f]{6});/.exec(css)![1]);
  const pressed = hex(/a\.cjv2-credrow:active \{ background: (#[0-9a-f]{6}); \}/.exec(css)![1]);
  for (const bg of [panelBg, pressed]) assert.ok(ratio(hex('#8dffad'), bg) >= 4.5, `${ratio(hex('#8dffad'), bg).toFixed(2)}:1`);
  // the wrap: bottom-anchored with the CRT inner box as min-height (short panel = at the CRT top as before)
  assert.match(css, /\.cjv2-map > \.cjv2-attrwrap \{ position: absolute; left: 7px; right: 7px; bottom: 6px; min-height: calc\(100% - 12px\); display: flex; flex-direction: column;/);
  assert.match(css, /\.cjv2-attrwrap > \.cjv2-attr\[data-rows\] \{[^}]*pointer-events: auto;/);
  assert.match(css, /\.cjv2-info\[data-covered\] \{ visibility: hidden; \}/);
  // the panel's (i) (44px box, top-right): the map credit keeps 44 + 6px clear on the right and is >= 44px tall, so
  // neither its text nor the first link row sits under the (i)
  assert.match(css, /\.cjv2-attr-map \{ margin: 0; padding: 2px 50px 2px 5px; min-height: 44px; box-sizing: border-box; \}/);
  assert.match(css, /\.cjv2-attr > \.cjv2-attr-close \{ top: 0; right: 0;/);
  assert.match(css, /\.cjv2-info \{[^}]*width: 44px; height: 44px;/);
});
