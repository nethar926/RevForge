import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carrier Jet fasteners are Dzus quarter-turn studs (art only): same boxes and positions as the old Phillips screws.
const SKIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/skins/carrier-jet');
const read = (f: string) => readFileSync(join(SKIN, f), 'utf8');
const rule = (css: string, sel: string) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

for (const [file, cls, size, rotVar] of [['parts/parts.css', '.cjp-screw', 11, '--cjp-dzus-rot'], ['switches.css', '.cjs-screw', 14, '--cjs-dzus-rot']] as const) {
  test(`${cls}: Dzus stud in the same ${size}px box, one slot, locked rotations within ±15°`, () => {
    const css = read(file);
    assert.match(rule(css, cls), new RegExp(`position: absolute; width: ${size}px; height: ${size}px; border-radius: 50%`));
    assert.match(rule(css, `${cls}::before`), /inset: 1\.3px; border-radius: 50%; background: radial-gradient\(circle at 36% 32%/, 'domed head lit top-left');
    const slot = rule(css, `${cls}::after`);
    assert.match(slot, new RegExp(`rotate\\(var\\(${rotVar}`), 'single slot, rotated per corner');
    assert.doesNotMatch(css, new RegExp(`\\${cls}::after \\{ transform: rotate\\(\\d+deg\\); \\}`), 'no Phillips cross arm');
    const rots = [...css.matchAll(new RegExp(`\\${cls}\\[data-pos='(tl|tr|bl|br)'\\] \\{[^}]*${rotVar}: (-?\\d+)deg`, 'g'))].map((m) => +m[2]);
    assert.equal(rots.length, 4);
    assert.ok(new Set(rots).size === 4, 'each corner a little different');
    for (const r of rots) assert.ok(Math.abs(r) <= 15, `${r}deg within ±15° of level`);
    for (const [pos, at] of [['tl', /left: 6px; top: (6|10)px/], ['tr', /right: 6px; top: (6|10)px/], ['bl', /left: 6px; bottom: 6px/], ['br', /right: 6px; bottom: 6px/]] as const)
      assert.match(rule(css, `${cls}[data-pos='${pos}']`), at, `${pos} position unchanged`);
    assert.doesNotMatch(slot + rule(css, `${cls}::before`), /rgba\(255, 255, 255, 0\.[6-9]/, 'matte: no gloss highlight');
  });
}

test('HUD panel fasteners (.cj-panel corners) are Dzus studs in the same 7px boxes', () => {
  const css = read('carrier-jet.css');
  const r = rule(css, '.cj-panel::before, .cj-panel::after');
  assert.match(r, /position: absolute; top: 6px; left: 6px; width: 7px; height: 7px; border-radius: 50%;/);
  assert.match(r, /--cj-dzus-slot: linear-gradient\(173deg/);
  assert.match(css, /\.cj-panel::after \{ left: auto; right: 6px; --cj-dzus-slot: linear-gradient\(189deg/);
});

test('SVG fastener art: Dzus component, Screw alias kept, decorative', () => {
  const art = read('parts/art.tsx');
  assert.match(art, /export function Dzus\(/);
  assert.match(art, /export const Screw = Dzus;/);
  assert.match(art, /data-fastener="dzus"/);
  assert.match(art.slice(art.indexOf('export function Dzus(')), /aria-hidden="true"/);
  assert.doesNotMatch(art, /Phillips/);
  for (const f of ['SwitchPanel.tsx', 'parts/SwitchShelf.tsx']) for (const m of read(f).matchAll(/<i className="cj[sp]-screw"[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/);
});
