// Tucked pamphlet tag (Wilson's in-car photo, GND AIR 7b · 17/22 at 773): the cream tag sat on SYSTEMS › OXY 7d and
// butted into MASTER CAUTION 9a. Root cause: when neither measured bay fit (GND AIR at 773 / phone landscape), the tag
// fell back to a fixed `right: 14px; bottom: 14px` corner, which is where SYSTEMS ends. Now: tagSpot.ts picks measured
// free space against every switch, guard, key, lamp, badge, annunciator and MASTER CAUTION; title = the cover's.
// Live geometry: tests/fixtures/cj-tucked-tag-geometry.json, recorded by the Playwright gate
// (/workspace/frontend-handoff/cj-tucked-tag/gate.mjs) at EVERY step of both start modes, then in Drive, at 1256 ×
// 706, 773 × 601 and the phone layouts (844 × 390 landscape, 390 × 844 portrait).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickTagSpot, tagHits, TAG_H, TAG_H_MIN, TAG_W, TAG_W_FULL, type TagRect } from '../src/packs/carrier-jet/tagSpot.ts';
import { CK_BOOK_SHORT, CK_BOOK_SPOKEN, CK_BOOK_TITLE, ckBookAria } from '../src/packs/carrier-jet/checklistModes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('pickTagSpot: anchors first, then a gap clear of group frames, then clear of controls only; null when full', () => {
  const area = { x: 0, y: 0, w: 400, h: 200 };
  const ctl: TagRect[] = [{ x: 0, y: 0, w: 400, h: 40 }, { x: 0, y: 120, w: 400, h: 80 }];
  // anchor wins when clear
  assert.deepEqual(pickTagSpot({ area, obstacles: ctl, frames: [], anchors: [{ x: 200, y: 56 }], w: 136, h: 54 }), { x: 200, y: 56, w: 136, h: 54 });
  // anchor over a control is skipped
  const s = pickTagSpot({ area, obstacles: ctl, frames: [{ x: 0, y: 44, w: 200, h: 70 }], anchors: [{ x: 0, y: 0 }], w: 136, h: 54 })!;
  assert.ok(s.x >= 204 - 0 && !ctl.some((c) => tagHits(s, c, 4)), JSON.stringify(s));
  // frames everywhere: second pass still finds a control-free spot
  const t = pickTagSpot({ area, obstacles: ctl, frames: [{ x: 0, y: 40, w: 400, h: 80 }], w: 136, h: 54 })!;
  assert.ok(t && !ctl.some((c) => tagHits(t, c, 4)));
  // no room: null (the tag hides rather than covering a switch)
  assert.equal(pickTagSpot({ area, obstacles: [{ x: 0, y: 0, w: 400, h: 200 }], frames: [], w: 136, h: 54 }), null);
  assert.equal(TAG_W, 136); assert.equal(TAG_W_FULL, 192); assert.ok(TAG_H >= 44 && TAG_H_MIN === 44);
});

test('VoiceOver name stays full whatever the tag shows; the step code is spelled "7 b"', () => {
  assert.equal(CK_BOOK_SPOKEN, 'MATRIX pilot checklist');
  assert.equal(ckBookAria({ code: '7b', index: 17, total: 22, text: 'HYD, OFF' }), 'MATRIX pilot checklist, step 7 b, 17 of 22: HYD, OFF');
  assert.equal(ckBookAria({ code: '1a', index: 1, total: 21, text: 'BATT Switch, ON' }), 'MATRIX pilot checklist, step 1 a, 1 of 21: BATT Switch, ON');
  assert.equal(ckBookAria(null), 'MATRIX pilot checklist');
  assert.doesNotMatch(ckBookAria({ code: '7b', index: 17, total: 22, text: 'x' }), /7b/);
});

test('mount: measured spot, no fixed corner, cover title (MATRIX dropped only where it does not fit), 44 px+ target, text >= 11 px', () => {
  const cs = src('src/packs/mounts/CjColdStart.tsx');
  assert.match(cs, /for \(const \[w, h\] of \[\[TAG_W_FULL, TAG_H\], \[TAG_W, TAG_H\], \[TAG_W, TAG_H_MIN\]\]\) if \(\(spot = pickTagSpot\(\{ area, obstacles, frames, anchors, w, h \}\)\)\) break;/);
  assert.match(cs, /card\.dataset\.title = 'full';\s*if \(title\.scrollWidth > title\.clientWidth \+ 0\.5\) card\.dataset\.title = 'short';/);
  assert.match(cs, /<strong aria-hidden="true"><span className="cjcs-card-mx">\{CK_BOOK_BRAND\} <\/span>\{CK_BOOK_SHORT\}<\/strong>/);
  assert.match(cs, /aria-label=\{ckBookAria\(step\)\}/);
  assert.match(cs, /\.cjp-toggle, \.cjp-guarded, \.cjp-apu, \.cjp-cover, \.cjp-shelf button, \.cjp-ann, \.cjp-group-title, \.cjp-shelf svg text, \.cjp-shelf svg circle, \.cjp-shelf-head > \*, \.cjcs-mc/);
  assert.match(cs, /data-bay=\{bay\?\.at \?\? 'none'\}/);
  assert.doesNotMatch(cs, /'corner'/);
  assert.equal(CK_BOOK_TITLE, 'MATRIX PILOT CHECKLIST');
  assert.equal(CK_BOOK_SHORT, 'PILOT CHECKLIST');
  assert.match(cs, /<strong>\{CK_BOOK_TITLE\}<\/strong>/, 'cover: same source string');
  const css = nc(src('src/packs/mounts/carrier-jet-v2.css'));
  assert.match(css, /\.cjcs-shelf > \.cjcs-card \{[^}]*width: 136px; height: 54px;/);
  assert.match(css, /\.cjcs-card strong \{ font-size: 12px;[^}]*white-space: nowrap; \}/);
  assert.match(css, /\.cjcs-card\[data-title='short'\] \.cjcs-card-mx \{ display: none; \}/);
  assert.doesNotMatch(css.slice(css.indexOf('.cjcs-shelf > .cjcs-card'), css.indexOf('.cjcs-shelf > .cjcs-pamph')), /text-overflow|ellipsis/);
  assert.match(css, /\.cjcs-card small \{ font-size: 11px;/);
  assert.match(css, /\.cjcs-card\[data-bay='none'\] \{ display: none; \}/);
});

type Txt = { t: string; sw: number; cw: number; sh: number; ch: number; px: number; nat: number };
type Row = { sz: string; mode: string; phase: string; step: number | 'done' | 'live'; open: string; bay: string; title: string; card: { x: number; y: number; w: number; h: number } | null;
  overlaps: string[]; mcBlocked: number[][] | null; texts: Txt[]; cardScroll: number[]; aria: string; kinds: string[];
  narrow?: { full: { sw: number; cw: number; text: string }; short: { sw: number; cw: number; text: string; cardSw: number; cardCw: number } } };
const fx = JSON.parse(src('tests/fixtures/cj-tucked-tag-geometry.json')) as { built: string; rows: Row[] };
const VIEWPORTS = ['1256', '773', '844', '390'];

test('live geometry: every step, both modes, 1256 / 773 / phone, Park + Drive: the tag covers no switch, badge, lamp, guard, key or MASTER CAUTION', () => {
  const N: Record<string, number> = { apu: 21, gndAir: 22 };
  for (const sz of VIEWPORTS) for (const mode of ['apu', 'gndAir']) {
    const rows = fx.rows.filter((r) => r.sz === sz && r.mode === mode);
    const steps = new Set(rows.filter((r) => r.phase === 'park').map((r) => r.step));
    for (let i = 1; i <= N[mode]; i++) assert.ok(steps.has(i), `${sz} ${mode}: step ${i} measured`);
    assert.ok(rows.some((r) => r.phase === 'drive' && r.step === 17), `${sz} ${mode}: Drive mid-sequence (step 17) measured`);
    assert.ok(rows.some((r) => r.phase === 'drive' && r.step === 'live'), `${sz} ${mode}: Drive, board live measured`);
    for (const r of rows) {
      const at = `${sz} ${mode} ${r.phase} step ${r.step}`;
      if (r.step === 'done') { assert.equal(r.open, 'closed', `${at}: shelf tucks itself away once the board is live`); continue; }
      assert.equal(r.open, 'open', at);
      assert.ok(r.card && r.bay !== 'none', `${at}: tag shown (bay ${r.bay})`);
      assert.ok(['control', 'badge', 'lamp', 'mastercaution'].every((k) => r.kinds.includes(k)), `${at}: rects collected ${r.kinds}`);
      assert.deepEqual(r.overlaps, [], `${at}: overlaps`);
      assert.deepEqual(r.mcBlocked ?? [], [], `${at}: MASTER CAUTION taps reach the key`);
      assert.ok(r.card!.h >= 44 && r.card!.w >= 44, `${at}: 44 px target`);
      const [sw, cw, sh, ch] = r.cardScroll;
      assert.ok(sw <= cw && sh <= ch, `${at}: card content fits ${r.cardScroll}`);
      const title = r.texts[0];
      assert.ok(title.t === (r.title === 'short' ? CK_BOOK_SHORT : CK_BOOK_TITLE), `${at}: title "${title.t}" (${r.title})`);
      for (const t of r.texts) {
        assert.ok(t.sw <= t.cw && t.nat <= t.cw + 0.5, `${at}: "${t.t}" unclipped (${t.nat} / ${t.cw})`);
        assert.ok(t.sh < t.ch * 1.5, `${at}: "${t.t}" one line (glyph ink may rise 2 px past the 13 px line box, inside the padding)`);
        assert.ok(t.px >= 11, `${at}: "${t.t}" ${t.px}px`);
      }
      if (typeof r.step === 'number') assert.match(r.aria, new RegExp(`^MATRIX pilot checklist, step \\d [a-z], ${r.step} of ${N[mode]}: .+$`), at);
      else assert.equal(r.aria, 'MATRIX pilot checklist', at);
    }
  }
});

test('title by width: MATRIX PILOT CHECKLIST where it fits (192 px tag), PILOT CHECKLIST at 136 px; never clipped', () => {
  const shown = fx.rows.filter((r) => r.card);
  const wide = shown.filter((r) => r.card!.w >= TAG_W_FULL - 0.5 && r.card!.w < TAG_W_FULL + 8);
  assert.ok(wide.length > 0);
  for (const r of wide) assert.equal(r.title, 'full', `${r.sz} ${r.mode} ${r.step}`);
  for (const sz of VIEWPORTS) for (const mode of ['apu', 'gndAir']) {
    const n = fx.rows.find((r) => r.sz === sz && r.mode === mode && r.narrow)?.narrow;
    assert.ok(n, `${sz} ${mode}: narrow check recorded`);
    assert.ok(n!.full.sw > n!.full.cw, `${sz} ${mode}: full title overflows 136 px (${n!.full.sw} > ${n!.full.cw}) → mount picks short`);
    assert.equal(n!.short.text, CK_BOOK_SHORT);
    assert.ok(n!.short.sw <= n!.short.cw && n!.short.cardSw <= n!.short.cardCw, `${sz} ${mode}: PILOT CHECKLIST fits 136 px`);
  }
});
