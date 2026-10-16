import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARRIER_JET_VARIANTS } from '../src/skins/carrier-jet/model.ts';
import { PALETTES } from '../src/skins/carrier-jet/palettes.ts';

// Carrier Jet hardware pass: stale-heading dim levels, NEEDS MOTION chip geometry, and the drive-dock hardware CSS.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');

const rgb = (hex: string) => { const h = hex.replace('#', ''); const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Grounds the heading readouts sit on (CRT / card / deck fills from carrier-jet.css, plus the palette's own grounds).
const GROUNDS: Record<string, string[]> = {
  'carrier-jet': ['#0b2213', '#08190e', '#041009'],
  tomcat: ['#000000'],
  'swing-wing': ['#132235', '#101722', '#0e141d', '#0b1018'],
};

test('stale heading: ticks drop to ~40% of the live symbol colour, digits to a darker cast that keeps >= 4.5:1', () => {
  for (const v of CARRIER_JET_VARIANTS) {
    const P = PALETTES[v.id];
    const grounds = GROUNDS[v.id];
    assert.ok(grounds, `${v.id}: grounds listed`);
    // line tone = 40% of the live symbol over the darkest panel ground (an opacity-0.4 equivalent), within 1/255 a channel
    const g = rgb(grounds.at(-1) === '#0b1018' ? '#0e141d' : grounds.at(-1)!);
    const s = rgb(P.sym);
    rgb(P.hdgStaleLine).forEach((c, i) => assert.ok(Math.abs(c - (0.4 * s[i] + 0.6 * g[i])) <= 1, `${v.id}: line tone is 40% sym (channel ${i})`));
    // text tone: well under half the live luminance (a strong drop, darker + greyer), yet >= 4.5:1 on every ground
    const ratio = lum(P.hdgStaleText) / lum(P.symText);
    assert.ok(ratio <= 0.4, `${v.id}: stale digits ${(ratio * 100).toFixed(0)}% of live luminance`);
    for (const gr of grounds) assert.ok(contrast(P.hdgStaleText, gr) >= 4.5, `${v.id}: stale digits ${contrast(P.hdgStaleText, gr).toFixed(2)}:1 on ${gr}`);
    // the old dim tone (winText) was barely dimmer than live; the new one must be clearly darker than it
    assert.ok(lum(P.hdgStaleText) < lum(P.winText) * 0.6, `${v.id}: visibly dimmer than the old stale tone`);
    // NEEDS MOTION chip (winText on boxBg) keeps >= 9.5:1
    assert.ok(contrast(P.winText, P.boxBg) >= 9.5, `${v.id}: chip ${contrast(P.winText, P.boxBg).toFixed(2)}:1`);
  }
});

test('NEEDS MOTION chip (Swing Wing reflow column): layout-neutral margins, lifted off the tape / dropped under it on phone landscape', () => {
  const css = readFileSync(join(SKIN, 'carrier-jet.css'), 'utf8');
  const gap = Number(css.match(/\.cj-c-lh \{[^}]*gap:\s*(\d+)px/)![1]);
  const margins = (body: string) => body.match(/margin:\s*([^;]+);/)![1].trim().split(/\s+/).map((x) => parseFloat(x));
  const m = css.match(/\n\.cj-c-lh > \.cj-hstale \{([^}]*)\}/);
  assert.ok(m, 'reflow rule present');
  const h = Number(m[1].match(/height:\s*(\d+(?:\.\d+)?)px/)![1]);
  const [top, , bottom] = margins(m[1]);
  assert.equal(h + top + bottom, -gap, 'chip takes no space in the column (height + margins = -gap)');
  assert.ok(top <= -22 && bottom >= 2, `chip lifted >= 2px over the old -20px / 0: ${top} / ${bottom}`);
  const p = css.match(/\[data-rf-layout="phone-landscape"\] \.cj \.cj-c-lh > \.cj-hstale \{([^}]*)\}/);
  assert.ok(p, 'phone-landscape rule present');
  assert.match(p[1], /order:\s*1;/, 'drawn under the heading tape');
  const [pt, , pb] = margins(p[1]);
  assert.equal(h + pt + pb, -gap, 'phone: still layout-neutral');
  assert.ok(pt >= 7, `phone: >= 7px under the tape so it clears STBY: ${pt}px`);
});

test('drive-dock hardware CSS: scoped to the Carrier Jet board, no glass / blur / pills / motion, legends >= 11px and >= 4.5:1', () => {
  const css = readFileSync(join(SKIN, 'hardware.css'), 'utf8');
  const hud = readFileSync(join(SKIN, 'CarrierJetHud.tsx'), 'utf8');
  assert.match(hud, /import '\.\/hardware\.css';/, 'loaded with the HUD');
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...body.matchAll(/([^{}@]+)\{([^{}]*)\}/g)];
  assert.ok(rules.length >= 10, 'rules');
  for (const [, sel, decl] of rules) {
    for (const s of sel.split(/,(?![^(]*\))/)) assert.match(s.trim(), /^\.forge \.rev-viewport:has\((\.cj\[data-variant\]|\[data-rf-layout='(portrait|phone-landscape)'\] \.cj\[data-variant\])\)/, `scoped: ${s.trim().slice(0, 80)}`);
    for (const f of decl.matchAll(/backdrop-filter:\s*([^;!]+)/g)) assert.equal(f[1].trim(), 'none', 'no frosted blur');
    for (const f of decl.matchAll(/(?:^|;)\s*(animation|transition):\s*([^;!]+)/g)) assert.equal(f[2].trim(), 'none', `static: ${f[1]}`);
    for (const f of decl.matchAll(/border-radius:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(f[1]) <= 4, `no pills: ${f[1]}px`);
    for (const f of decl.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(f[1]) >= 11, `text >= 11px: ${f[1]}px`);
  }
  // legends vs the lightest stop of their plate (switch-row gray for the toggles, the bezel face for the card)
  const plate = '#5a6166', face = '#3a4044';
  for (const c of ['#f3efe4', '#fff6e6', '#d8dde0']) { assert.match(css, new RegExp(`color: ${c}`)); assert.ok(contrast(c, plate) >= 4.5, `${c} on ${plate}: ${contrast(c, plate).toFixed(2)}`); }
  assert.ok(contrast('#ece8dc', face) >= 4.5, 'THROTTLE placard');
  assert.ok(contrast('#f6f1e4', '#111315') >= 4.5, '% window');
  // pressed Hold to rev throws the lever up; Shutdown has its own lever; disabled keeps opacity 1 (unlit legend instead)
  assert.match(css, /:active:not\(:disabled\) \{\s*--cjh-lever: url\("data:image\/svg\+xml,/, 'pressed lever swap');
  assert.match(css, /opacity: 1 !important/, 'no washed-out disabled plate');
});
