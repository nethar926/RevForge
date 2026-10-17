// Guarded SHUTDOWN toggle (bottom row): flip-up striped cover in the AB guard's paint over a bat-handle toggle.
// Closed by default, switch not operable while closed (aria-disabled + reason, unlit legends), cover named
// "Shutdown, guarded" / expanded when open, targets >= 44x44 at the Shutdown plate footprint, Reduce Motion static.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SHUTDOWN_GUARD_COVER, SHUTDOWN_GUARD_LIFT_MS, SHUTDOWN_GUARD_MIN, SHUTDOWN_GUARD_REASON, SHUTDOWN_GUARD_STRIP_W, SHUTDOWN_GUARD_SWITCH,
  SHUTDOWN_PLATE_AT, TARGET_MIN_UNITS, TEXT_MIN_UNITS, shutdownGuardView,
} from '../src/skins/carrier-jet/parts/tokens.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIN = join(root, 'src/skins/carrier-jet');
const PARTS = join(SKIN, 'parts');
const read = (f: string) => readFileSync(join(SKIN, f), 'utf8');
const CSS = read('parts/shutdown-guard.css');
const SRC = read('parts/ShutdownGuard.tsx');
/** Engraved legend tones, read from art.tsx (white backlit, grey unlit). */
const ENG = { white: read('parts/art.tsx').match(/white: '(#[0-9a-f]{6})'/)![1], grey: read('parts/art.tsx').match(/grey: '(#[0-9a-f]{6})'/)![1] };

let loaded: Promise<{ mod: Record<string, unknown>; render: (p: object) => string }> | undefined;
function load() {
  loaded ??= (async () => {
    const { rolldown } = await import('rolldown');
    const bundle = await rolldown({
      input: join(PARTS, 'index.ts'),
      external: (id: string) => id === 'react' || id.startsWith('react/') || id.startsWith('react-dom'),
      plugins: [{ name: 'empty-css', resolveId: (id: string) => (/\.(css|woff2|svg)$/.test(id) ? '\0sdg-empty' : null), load: (id: string) => (id === '\0sdg-empty' ? 'export default ""' : null) }],
      transform: { jsx: 'react-jsx' },
      logLevel: 'silent',
    } as never);
    const { output } = await bundle.generate({ format: 'esm' });
    const dir = mkdtempSync(join(root, 'node_modules/.sdg-test-'));
    const file = join(dir, 'parts.mjs');
    writeFileSync(file, output[0].code);
    const mod = await import(pathToFileURL(file).href);
    rmSync(dir, { recursive: true, force: true });
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    return { mod, render: (p: object) => renderToStaticMarkup(React.createElement(mod.ShutdownGuard as never, { onGuardToggle: noop, onToggle: noop, on: true, ...p } as never)) };
  })();
  return loaded;
}
const noop = () => {};
const tag = (h: string, cls: string) => h.match(new RegExp(`<button[^>]*class="${cls}"[^>]*>`))?.[0] ?? '';
const attr = (t: string, a: string) => t.match(new RegExp(`\\s${a}="([^"]*)"`))?.[1];
const unlitGroups = (h: string) => [...h.matchAll(/<g class="cjp-unlit"[^>]*>([\s\S]*?)<\/g>/g)].map((m) => m[0]);
const rule = (sel: string) => CSS.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';

/* WCAG relative luminance / contrast, alpha-composited when needed */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const over = (fg: number[], a: number, bg: number[]) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lum = (c: number[]) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('default closed: no guardOpen → lid down, cover aria-expanded false, switch not operable', async () => {
  const { render } = await load();
  const h = render({});
  assert.match(h, /class="cjp cjp-metal cjp-sdg" data-open="false"/);
  assert.equal(attr(tag(h, 'cjp-sdg-cover'), 'aria-expanded'), 'false');
  assert.equal(attr(tag(h, 'cjp-sdg-switch'), 'aria-disabled'), 'true');
  assert.equal(render({ guardOpen: false }), h, 'omitting guardOpen = guardOpen false');
  assert.deepEqual(shutdownGuardView(true, false).operable, false);
});

test('switch inert while closed: aria-disabled + aria-describedby reason (cjp-unlit legends, never LOCKED), out of tab order, tap ignored', async () => {
  const { render } = await load();
  for (const on of [true, false]) {
    const h = render({ on });
    const sw = tag(h, 'cjp-sdg-switch');
    assert.equal(attr(sw, 'role'), 'switch');
    assert.equal(attr(sw, 'aria-checked'), String(on));
    assert.equal(attr(sw, 'aria-label'), 'Engine run');
    assert.equal(attr(sw, 'aria-disabled'), 'true');
    assert.equal(attr(sw, 'tabindex'), '-1');
    const why = attr(sw, 'aria-describedby');
    assert.ok(why, 'described');
    assert.match(h, new RegExp(`<span id="${why}" class="cjp-sr">${SHUTDOWN_GUARD_REASON}</span>`));
    assert.doesNotMatch(sw, /\sinert/, 'aria-disabled, not inert: VoiceOver still reads the reason');
    // RUN / OFF throw legends drawn unlit: grey, no glow halo
    const unlit = unlitGroups(h).filter((g) => />(RUN|OFF)</.test(g));
    assert.equal(unlit.length, 2, 'RUN and OFF unlit');
    for (const g of unlit) { assert.match(g, new RegExp(`fill="${ENG.grey}"`)); assert.doesNotMatch(g, /stroke=/, 'no glow'); }
    assert.doesNotMatch(h, /LOCKED/i);
  }
  // the host's onToggle only runs when the view says operable (cover up and not disabled)
  assert.match(SRC, /onClick=\{\(\) => \{ if \(v\.operable\) onToggle\(\); \}\}/);
  for (const [open, dis, ok] of [[false, false, false], [true, false, true], [true, true, false], [false, true, false]] as const) {
    const v = shutdownGuardView(true, open, dis, 'Engine starting');
    assert.equal(v.operable, ok);
    assert.equal(v.sw.tabIndex, ok ? 0 : -1);
    assert.equal(v.sw['aria-disabled'], ok ? undefined : true);
    assert.equal(v.reason, ok ? undefined : dis ? 'Engine starting' : SHUTDOWN_GUARD_REASON);
  }
  // open: live switch, legends lit (active throw glows), no description
  const o = render({ guardOpen: true, on: true });
  const sw = tag(o, 'cjp-sdg-switch');
  assert.equal(attr(sw, 'aria-disabled'), undefined);
  assert.equal(attr(sw, 'aria-describedby'), undefined);
  assert.equal(attr(sw, 'tabindex'), '0');
  assert.equal(unlitGroups(o).length, 0);
  assert.match(o, /<g data-eng="white"><text[^>]*stroke=[^>]*>RUN<\/text>/, 'RUN backlit while running');
  // Escape on the switch folds the cover (as the AB guard's ARM)
  assert.match(SRC, /e\.key === 'Escape' && guardOpen && !disabled/);
});

test('aria name: "Shutdown, guarded" closed, "Shutdown guard, open" + aria-expanded true when open; controls the switch', async () => {
  const { render } = await load();
  const c = tag(render({}), 'cjp-sdg-cover');
  assert.equal(attr(c, 'aria-label'), 'Shutdown, guarded');
  assert.equal(attr(c, 'aria-expanded'), 'false');
  const h = render({ guardOpen: true });
  const o = tag(h, 'cjp-sdg-cover');
  assert.equal(attr(o, 'aria-label'), 'Shutdown guard, open');
  assert.equal(attr(o, 'aria-expanded'), 'true');
  assert.equal(attr(o, 'aria-controls'), attr(tag(h, 'cjp-sdg-switch'), 'id'));
  // disabled: both buttons aria-disabled with the host's reason; cover tap ignored
  const d = render({ disabled: true, disabledReason: 'Engine starting' });
  const dc = tag(d, 'cjp-sdg-cover');
  assert.equal(attr(dc, 'aria-disabled'), 'true');
  assert.match(d, new RegExp(`<span id="${attr(dc, 'aria-describedby')}" class="cjp-sr">Engine starting</span>`));
  assert.match(SRC, /onClick=\{\(\) => \{ if \(!disabled\) onGuardToggle\(\); \}\}/);
  assert.doesNotMatch(d, /LOCKED/i);
});

test('target size tokens: footprint = the Shutdown plate at 1280×800 / 1256×706 / 773×601, cover and switch >= 44×44, never transformed', async () => {
  assert.deepEqual(SHUTDOWN_GUARD_MIN, { w: 108.67, h: 48 });
  for (const k of ['1280x800', '1256x706', '773x601'] as const) assert.deepEqual(SHUTDOWN_PLATE_AT[k], SHUTDOWN_GUARD_MIN, k);
  assert.deepEqual(SHUTDOWN_GUARD_COVER.closed, { w: 108.67, h: 48 });
  assert.deepEqual(SHUTDOWN_GUARD_COVER.open, { w: 46, h: 48 });
  assert.deepEqual(SHUTDOWN_GUARD_SWITCH, { w: 62.67, h: 48 });
  for (const s of [SHUTDOWN_GUARD_COVER.closed, SHUTDOWN_GUARD_COVER.open, SHUTDOWN_GUARD_SWITCH]) { assert.ok(s.w >= TARGET_MIN_UNITS && s.h >= TARGET_MIN_UNITS, JSON.stringify(s)); }
  assert.ok(Math.abs(SHUTDOWN_GUARD_STRIP_W + SHUTDOWN_GUARD_SWITCH.w - SHUTDOWN_GUARD_MIN.w) < 0.01, 'strip + switch tile the part');
  const { render } = await load();
  const px = (t: string, k: string) => +(attr(t, 'style')?.match(new RegExp(`${k}:([\\d.]+)px`))?.[1] ?? NaN);
  const c = render({}), o = render({ guardOpen: true });
  assert.equal(px(c.match(/<div class="cjp cjp-metal cjp-sdg"[^>]*>/)![0], 'width'), 108.67);
  assert.equal(px(tag(c, 'cjp-sdg-cover'), 'width'), SHUTDOWN_GUARD_COVER.closed.w);
  assert.equal(px(tag(c, 'cjp-sdg-cover'), 'height'), 48);
  assert.equal(px(tag(o, 'cjp-sdg-cover'), 'width'), SHUTDOWN_GUARD_COVER.open.w);
  assert.equal(px(tag(o, 'cjp-sdg-cover'), 'height'), 48);
  assert.equal(px(tag(o, 'cjp-sdg-switch'), 'left'), SHUTDOWN_GUARD_STRIP_W);
  // the buttons carry no transform / scale (the lift moves only the aria-hidden lid art)
  for (const sel of ['.cjp-sdg-cover', '.cjp-sdg-switch']) {
    for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) if (m[1].includes(sel)) assert.doesNotMatch(m[2], /transform|scale|zoom/, `${sel}: ${m[1].trim()}`);
  }
  assert.doesNotMatch(SRC, /scale\(.*cover|cover.*scale\(/i);
  // text >= 11px; legend contrast >= 4.5 (target 4.6) on what sits behind it
  const sizes = [...c.matchAll(/font-size="([\d.]+)"/g), ...o.matchAll(/font-size="([\d.]+)"/g)].map((m) => +m[1]);
  assert.ok(sizes.length > 0 && Math.min(...sizes) >= TEXT_MIN_UNITS, `min font ${Math.min(...sizes)}`);
  const lightestPlate = rgb('#51585d'), well = rgb('#1a1d1f'), tab = rgb('#17191a');
  const smoked = (c0: number[]) => over([12, 14, 16], 0.3, c0);
  const pairs: [string, number[], number[]][] = [
    ['SHUTDOWN name, white on plate', rgb(ENG.white), lightestPlate],
    ['SHUTDOWN name unlit (disabled), grey on plate', rgb(ENG.grey), lightestPlate],
    ['RUN/OFF unlit through the smoked window', smoked(rgb(ENG.grey)), smoked(well)],
    ['RUN/OFF lit, white in the well', rgb(ENG.white), well],
    ['LIFT tab', rgb(ENG.white), tab],
  ];
  for (const [n, fg, bg] of pairs) { const r = contrast(fg, bg); if (process.env.SDG_LOG) console.log(`${n}: ${r.toFixed(2)}:1`); assert.ok(r >= 4.6, `${n}: ${r.toFixed(2)}:1`); }
});

test('reduced motion static: lift is transform + opacity 160ms, off under prefers-reduced-motion, [data-rf-reduce-motion] and the reduceMotion prop', async () => {
  assert.equal(SHUTDOWN_GUARD_LIFT_MS, 160);
  assert.match(rule('.cjp-sdg > .cjp-sdg-lid'), /transition: transform 160ms ease-out, opacity 160ms ease-out;/);
  assert.match(rule('.cjp-sdg > .cjp-sdg-under'), /transition: transform 160ms ease-out, opacity 160ms ease-out;/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{\s*\.cjp-sdg > \.cjp-sdg-lid, \.cjp-sdg > \.cjp-sdg-under \{ transition: none; \}\s*\}/);
  assert.match(CSS, /\[data-rf-reduce-motion\] \.cjp-sdg > \.cjp-sdg-lid, \[data-rf-reduce-motion\] \.cjp-sdg > \.cjp-sdg-under,\s*\.cjp-sdg\[data-rf-reduce-motion\] > \.cjp-sdg-lid, \.cjp-sdg\[data-rf-reduce-motion\] > \.cjp-sdg-under \{ transition: none; \}/);
  // no flashing: no keyframes / animation, no infinite anything
  assert.doesNotMatch(CSS, /@keyframes|animation|infinite/);
  assert.doesNotMatch(SRC, /<animate|setInterval|requestAnimationFrame/);
  const { render } = await load();
  assert.match(render({ reduceMotion: true }), /class="cjp cjp-metal cjp-sdg"[^>]*data-rf-reduce-motion="true"/);
  assert.doesNotMatch(render({}), /data-rf-reduce-motion/);
  // open / closed are the two end states only (the static swap): lid hidden + strip shown when open
  assert.match(CSS, /\.cjp-sdg\[data-open='true'\] > \.cjp-sdg-lid \{ opacity: 0; transform: perspective\(160px\) rotateY\(-80deg\); \}/);
  assert.match(CSS, /\.cjp-sdg\[data-open='true'\] > \.cjp-sdg-under \{ opacity: 1; transform: none; \}/);
});

test('AB-guard style: same stripes, hinge pin, Dzus leaf, window over the switch; matte (no gloss, no heavy shadow); exported like the other parts', async () => {
  const ab = read('switches.css');
  assert.match(ab, /repeating-linear-gradient\(-45deg, #c8261b 0 12px, #f2c21b 12px 24px\)/, 'AB guard paint');
  assert.match(SRC, /'red-yellow': \['#c8261b', '#f2c21b'\]/, 'same colours');
  assert.match(SRC, /width=\{24\} height=\{24\} patternUnits="userSpaceOnUse" patternTransform="rotate\(45\)"/, '12px bands, same diagonal');
  const { render } = await load();
  const h = render({});
  assert.equal((h.match(/data-fastener="dzus"/g) ?? []).length, 2, 'two Dzus studs');
  assert.match(h, /class="cjp-sdg-pin"/);
  assert.match(h, /fill-rule="evenodd"/, 'window cut in the lid');
  assert.match(h, />SHUTDOWN</);
  assert.match(h, />LIFT</);
  for (const m of CSS.matchAll(/drop-shadow\(([^)]*)\)/g)) for (const n of m[1].match(/[\d.]+(?=px)/g) ?? []) assert.ok(+n <= 2, `small cast shadow only: ${m[0]}`);
  assert.doesNotMatch(CSS + SRC, /leather|gloss|backdrop|blur\(/i);
  assert.match(read('parts/index.ts'), /^export \{ ShutdownGuard \} from '\.\/ShutdownGuard';$/m);
  assert.match(read('index.ts'), /^export \{ ShutdownGuard \} from '\.\/parts\/ShutdownGuard';$/m);
  assert.match(read('parts/gallery/gallery.tsx'), /<Sec id="shutdown"/);
});
