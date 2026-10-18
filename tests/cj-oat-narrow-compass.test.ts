/**
 * OAT readout vs the narrowed COMPASS (COMPASS ⇄ ACCEL swap + Meghan's narrow compass 7b558e6): the HDG chip is
 * centred at the cell top; where the corner left of it is narrower than the OAT column (1280 board: 165 px cell,
 * 115 px chip; 773 window: 105 px cell, 85 px chip) the readout sits UNDER the chip instead of beside it.
 * Browser-measured in frontend-handoff/cj-board-batch (gate.mjs, oat.overlapsHdg = false at 773 / 1256 / 1280).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-v2.css', import.meta.url), 'utf8');
const num = (re: RegExp) => { const m = css.match(re); assert.ok(m, String(re)); return +m[1]; };

test('corner too narrow for the OAT column: the readout goes under the HDG chip (board and window)', () => {
  const chipTop = num(/\.cjv2-hdgro \{[^}]*top: (\d+)px;/);
  const boardMax = num(/@container \(max-width: (\d+)px\) \{ \.cjwx \{ top: 31px; \} \}/);
  const winMax = num(/@container \(max-width: (\d+)px\) \{ \.cjwx \{ top: 25px; left: 5px; \} \.cjwx-line \{ flex-direction: row;/);
  // measured chip boxes (CSS px): 115 x 24.7 on the board, 85 x 18.9 in the window; OAT column 6 px + 21 px + 3 px clear
  const need = (chip: number) => chip + 2 * (6 + 21 + 3);
  assert.ok(165 <= boardMax && boardMax < 179.8 && boardMax < need(115) + 1, '1280 (165) under, 1256 (179.8) beside');
  assert.ok(104.8 <= winMax && winMax < need(85), '773 (104.8) under');
  assert.ok(31 >= chipTop + 24.7 + 2, 'board: below the chip');
  assert.ok(25 >= chipTop + 18.9 + 2, 'window: below the chip');
});

test('no heading yet (Park): the host chip still shows, dashed, in the Drive spot, so the OAT line clears it the same way', async () => {
  const live = readFileSync(new URL('../src/packs/mounts/CjLiveMap.tsx', import.meta.url), 'utf8');
  const body = live.slice(live.indexOf('export function CjHeadingReadout'));
  assert.doesNotMatch(body.slice(0, body.indexOf('const label')), /if \(!pair\) return null;/);
  assert.match(body, /<div className="cjv2-hdgro" data-hdg-none>\s*<span className="cjv2-hdg-dash" role="img" aria-label="Compass, no heading yet" data-cj-hdg-chip="">\{`HDG --- \$\{hdgRef\}`\}<\/span>/);
  // same box rules as the live chip; lead size as Meghan's legend (18px, 13px in the 773 window), >= 11px
  assert.match(css, /\.cjv2-hdg-dash \{ display: block; font: 700 18px\/1\.15 /);
  assert.match(css, /\.cjm\[data-rf-layout='window'\] \.cjv2-hdg-dash \{ font-size: 13px; \}/);
  // Meghan's rose '---' box hides under any host chip (her hook); every host chip variant carries it
  assert.match(readFileSync(new URL('../src/skins/carrier-jet/carrier-jet.css', import.meta.url), 'utf8'), /:root:has\(\[data-cj-hdg-chip\]\) \[data-cj-rose='narrow'\] \.cj-rose-box \{ visibility: hidden; \}/);
  assert.equal((body.match(/data-cj-hdg-chip=""/g) ?? []).length, 2, 'dashed chip + TRUE-only chip (the M/T legend sets its own)');
});
