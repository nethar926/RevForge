// Look tabs (MATRIX / VECTOR / HOLO) fit (Ivy's 789ed99 phone sweep, item 3): at 390 × 844 portrait the v2 mount held
// every LOOK key at a fixed 136px (112px in window), so Look + 3 keys ran past the 374px board and HOLO was cut
// 64-71px on the right. Now the row wraps onto a second line (keys keep their width; a key only shrinks if one key
// alone is wider than its line, never below 44px). Layout only: no skin change, no colour / border / font change.
// Live geometry: tests/fixtures/cj-look-tabs-geometry.json, recorded by the Playwright sweep
// (/workspace/frontend-handoff/cj-look-tabs/sweep.mjs) at 320 × 568, 390 × 844, 430 × 932, 844 × 390 (touch and fine
// pointer), 773 × 601 and 1280 × 800, all three Looks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('mount CSS: the Look row wraps, keys keep 136 / 112 px but may shrink to a 44 px floor; no fixed min-width', () => {
  const css = nc(src('src/packs/mounts/carrier-jet-v2.css'));
  const sel = ".cjm[data-cjm-v2] .cj:is([data-layout='reflow'], [data-layout='full']) .cj-tabs";
  const rule = (s: string) => { const i = css.indexOf(s + ' {'); assert.ok(i >= 0, s); return css.slice(i, css.indexOf('}', i)); };
  assert.match(rule(sel), /flex-wrap: wrap;/);
  assert.match(rule(sel), /min-width: 0;/);
  assert.match(rule(sel), /max-width: 100%;/);
  const key = rule(sel + ' .cj-tab');
  assert.match(key, /flex: 0 1 136px;/);
  assert.match(key, /min-width: 44px;/);
  assert.match(key, /min-height: 44px; height: 44px;/);
  assert.doesNotMatch(css, /\.cj-tab \{[^}]*min-width: (136|112)px/, 'no fixed min-width that forces HOLO off-screen');
  assert.match(rule(".cjm[data-cjm-v2][data-rf-layout='window'] .cj:is([data-layout='reflow'], [data-layout='full']) .cj-tabs .cj-tab"), /flex-basis: 112px; width: 112px;/);
  // layout only: the mount adds no paint to the keys
  assert.doesNotMatch(key + rule(sel), /(?:^|[\s;{])(?:background|border|border-[a-z-]+|color|font|font-[a-z-]+|box-shadow|text-shadow|letter-spacing|padding)\s*:/);
});

test('skin untouched: VariantTabs keeps the radiogroup / radio roles, aria-checked and roving tabindex', () => {
  const vt = src('src/skins/carrier-jet/VariantTabs.tsx');
  assert.match(vt, /role="radiogroup" aria-label="Look"/);
  assert.match(vt, /role="radio"\s+aria-checked=\{on\}\s+tabIndex=\{on \? 0 : -1\}/);
  assert.match(vt, /<span className="cj-tabs-cap" aria-hidden="true">Look<\/span>/);
});

type Rect = { x: number; y: number; w: number; h: number; r: number; b: number };
type Tab = { label: string; rect: Rect; text: { x: number; r: number; w: number }; fontPx: number; role: string; checked: string; tabIndex: number; sw: number; cw: number; clipPx: number };
type Row = { sz: string; pointer: string; look: string; variant: string; layout: string; vw: number; vh: number; errs: number;
  group: { rect: Rect; role: string; label: string; wrap: string }; cap: { rect: Rect; fontPx: number; hidden: string } | null; tabs: Tab[] };
const fx = JSON.parse(src('tests/fixtures/cj-look-tabs-geometry.json')) as { built: string; rows: Row[] };
const SIZES = ['320x568', '390x844', '430x932', '844x390', '773x601', '1280x800'];
const LOOKS: Record<string, string> = { matrix: 'carrier-jet', vector: 'tomcat', holo: 'swing-wing' };

test('live geometry: every Look key inside the viewport, >= 44 px, text >= 11 px, unclipped, no overlap, VoiceOver intact', () => {
  for (const sz of SIZES) for (const look of Object.keys(LOOKS)) assert.ok(fx.rows.some((r) => r.sz === sz && r.look === look), `${sz} ${look} measured`);
  for (const sz of ['320x568', '390x844', '430x932', '844x390']) for (const p of ['touch', 'fine']) assert.ok(fx.rows.some((r) => r.sz === sz && r.pointer === p), `${sz} ${p}`);
  for (const r of fx.rows) {
    const at = `${r.sz} ${r.pointer} ${r.look}`;
    assert.equal(r.variant, LOOKS[r.look], at);
    assert.equal(r.errs, 0, `${at}: page errors`);
    assert.deepEqual(r.tabs.map((t) => t.label), ['MATRIX', 'VECTOR', 'HOLO'], at);
    assert.equal(r.group.role, 'radiogroup'); assert.equal(r.group.label, 'Look');
    assert.equal(r.tabs.filter((t) => t.checked === 'true').length, 1, `${at}: one checked`);
    assert.equal(r.tabs.find((t) => t.checked === 'true')!.label, { matrix: 'MATRIX', vector: 'VECTOR', holo: 'HOLO' }[r.look], at);
    assert.deepEqual(r.tabs.map((t) => t.tabIndex).sort(), [-1, -1, 0], `${at}: roving tabindex`);
    const boxes: [string, Rect][] = r.tabs.map((t) => [t.label, t.rect]);
    if (r.cap) { boxes.push(['Look', r.cap.rect]); assert.ok(r.cap.fontPx >= 11, `${at}: cap ${r.cap.fontPx}px`); assert.equal(r.cap.hidden, 'true'); }
    for (const t of r.tabs) {
      const b = t.rect; const k = `${at} ${t.label}`;
      assert.equal(t.role, 'radio', k);
      assert.ok(b.x >= -0.5 && b.y >= -0.5 && b.r <= r.vw + 0.5 && b.b <= r.vh + 0.5, `${k}: inside ${r.vw}x${r.vh} (${JSON.stringify(b)})`);
      assert.ok(b.w >= 44 && b.h >= 44, `${k}: ${b.w}x${b.h}`);
      assert.ok(t.fontPx >= 11, `${k}: ${t.fontPx}px`);
      assert.ok(t.clipPx <= 0.5, `${k}: clipped ${t.clipPx}px by an overflow ancestor`);
      assert.ok(t.text.x >= b.x - 0.5 && t.text.r <= b.r + 0.5 && t.sw <= t.cw + 0.5, `${k}: label inside its key`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [na, a] = boxes[i]; const [nb, b] = boxes[j];
      const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x); const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      assert.ok(!(ox > 0.5 && oy > 0.5), `${at}: ${na} overlaps ${nb} (${ox.toFixed(1)}x${oy.toFixed(1)})`);
    }
  }
});

test('wrap, not squash: 390 portrait puts HOLO on a second line at full width; 773 / 1280 / 844 landscape stay one row as before', () => {
  for (const r of fx.rows) {
    const at = `${r.sz} ${r.pointer} ${r.look}`;
    const ys = new Set(r.tabs.map((t) => t.rect.y));
    for (const t of r.tabs) assert.equal(t.rect.w, r.layout === 'window' ? 112 : 136, `${at} ${t.label}: key keeps its width`);
    if (['773x601', '1280x800', '844x390'].includes(r.sz)) assert.equal(ys.size, 1, `${at}: one row`);
    if (r.sz === '390x844' && r.pointer === 'touch') {
      const [m, v, h] = r.tabs;
      assert.equal(m.rect.y, v.rect.y, at);
      assert.ok(h.rect.y >= m.rect.b, `${at}: HOLO wraps below`);
    }
  }
});
