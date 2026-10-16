import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cjMaxDemote, cjNavItems } from '../src/packs/carrier-jet.nav.ts';
import { cjPanelNeed } from '../src/packs/mounts/cjNavFit.ts';

const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-controls.css', import.meta.url), 'utf8');
const mount = readFileSync(new URL('../src/packs/mounts/CarrierJetMount.tsx', import.meta.url), 'utf8');
const row = readFileSync(new URL('../src/packs/mounts/CjNavRow.tsx', import.meta.url), 'utf8');

const ALL7 = ['drive', 'garage', 'visuals', 'options', 'sound-builder', 'mute', 'more'];
// 773x601@1.53 cell widths measured in the browser (13px labels, 56px tall): MORE is 68 closed ("N INSIDE"), 56 open.
const W: Record<string, number> = { drive: 56, garage: 62, visuals: 63, options: 71, 'sound-builder': 115, mute: 56, compass: 52 };
const CHROME = 22; // panel padding 1 6 1 14 + border, measured: panel 531 = row 509 + 22
const GAP = 3;
const box = (left: number, scrollWidth: number) => ({ getBoundingClientRect: () => ({ left }), scrollWidth });

/** A fake .cjs panel for one demote level; with MORE open it carries the 560px-wide absolute tray. */
function panelFor(ids: string[], moreOpen: boolean) {
  const widths = ids.map((id) => (id === 'more' ? (moreOpen ? 56 : 68) : W[id]));
  const rowW = widths.reduce((a, b) => a + b, 0) + GAP * (ids.length - 1);
  const rowBox = box(15, rowW);
  const tray = box(1, 560);
  const kids = moreOpen ? [rowBox, tray] : [rowBox];
  return {
    ...box(0, moreOpen ? Math.max(rowW + CHROME, 560) : rowW + CHROME),
    children: kids,
    querySelector: (s: string) => (moreOpen && s.includes('cjs-tray') ? tray : null),
  };
}
/** CjNavRow's fit loop: demote until the panel's need fits the host. */
function fit(hostW: number, moreOpen: boolean, measure: (p: ReturnType<typeof panelFor>) => number) {
  let demote = 0;
  for (;;) {
    const ids = cjNavItems({ current: 'drive', muted: false, moreOpen, demote }).items.map((i) => i.id);
    if (!(measure(panelFor(ids, moreOpen)) > hostW + 0.5 && demote < cjMaxDemote(false))) return ids;
    demote++;
  }
}

test('773@1.53: all 7 switches stay in the row: demo and GPS (same full-dock tier), MORE closed and open', () => {
  const tier = 773 - 2 * 24; // the tier spans the whole dock (725px), in demo and GPS alike
  for (const moreOpen of [false, true]) assert.deepEqual(fit(tier, moreOpen, cjPanelNeed), ALL7, `MORE ${moreOpen ? 'open' : 'closed'}`);
  // regressions this fixes: the old bank-wide tier in demo (458px, beside Hold to rev) demoted SOUND BUILDER …
  assert.notDeepEqual(fit(458, false, cjPanelNeed), ALL7);
  // … and measuring panel.scrollWidth with the 560px open tray collapsed that row to MORE alone; cjPanelNeed does not
  assert.deepEqual(fit(458, true, (p) => p.scrollWidth), ['more']);
  assert.ok(fit(458, true, cjPanelNeed).length > 1);
});

test('cjPanelNeed ignores the open MORE tray, and is panel.scrollWidth when it is closed', () => {
  assert.equal(cjPanelNeed(panelFor(ALL7, false)), 509 + CHROME);
  assert.equal(cjPanelNeed(panelFor(ALL7, true)), 15 + 497); // row only (left 15 + 497), never the 560px tray
  assert.match(row, /cjPanelNeed\(panel\) > host\.clientWidth \+ 0\.5/);
  assert.doesNotMatch(row, /panel\.scrollWidth > host\.clientWidth/);
});

test('drive-window row tier spans the dock; Hold to rev keeps ≥ 24px from the guard', () => {
  assert.match(css, /\.rev-dock > \.cjm-bank\[data-rf-layout='window'\] \{ position: static; \}/, 'dock is the tier containing block');
  assert.match(css, /\.rev-dock > \.cjm-bank\[data-rf-layout='window'\] > \.cjm-bank-nav \{ position: absolute; left: 0; bottom: calc\(100% \+ 12px\); width: var\(--cjm-nav-w, 100%\); max-width: 100%; \}/);
  assert.match(mount, /nav\?\.offsetParent as HTMLElement \| null\) \?\? bankEl/, 'throttle clearance measured from the tier containing block');
  // dock gap 8px + 16px margin = 24px clear between Hold to rev and the AB guard (Tesla dock, demo)
  assert.match(css, /\.rev-dock > \.rev-chip:not\(\.rev-stop\) ~ \.cjm-bank \{ margin-left: 16px; \}/);
});
