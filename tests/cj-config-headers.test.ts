/** CONFIG cell headers name the page under them (Meghan, Oct 17), blank if not a page, Drive name with no tile; no stray tab. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG_HEADER_CELLS, configCellHeader } from '../src/packs/carrier-jet/configHeaders.ts';
import { CJ_CONFIG } from '../src/packs/carrier-jet/configPages.ts';
import { pageTiles } from '../src/packs/configTable.ts';
import { CELL_ORDER } from '../src/packs/carrier-jet/configCells.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const homeHeaders = () => {
  const { tiles } = pageTiles(CJ_CONFIG.home.items, CELL_ORDER.length, 0);
  return Object.fromEntries(CONFIG_HEADER_CELLS.map((c) => [c, configCellHeader(tiles[CELL_ORDER.indexOf(c)], CJ_CONFIG)]));
};

test('home page: ACCEL → PILOT, MAP → OPTIONS, WING SWEEP → SOUND; COMPASS (no tile) keeps its Drive header', () => {
  const { tiles } = pageTiles(CJ_CONFIG.home.items, CELL_ORDER.length, 0);
  const at = (c: string) => tiles[CELL_ORDER.indexOf(c as never)];
  assert.equal((at('accel') as { label: string }).label, 'PLT');
  assert.equal((at('map') as { label: string }).label, 'OPT');
  assert.equal((at('sweep') as { label: string }).label, 'SND');
  assert.deepEqual(homeHeaders(), { accel: 'PILOT', map: 'OPTIONS', sweep: 'SOUND', compass: undefined });
});

test('non-page tiles blank the header (box kept); no tile keeps the Drive header', () => {
  assert.equal(configCellHeader('next', CJ_CONFIG), '');
  assert.equal(configCellHeader({ id: 'rtn', label: 'RTN' }, CJ_CONFIG), '');
  assert.equal(configCellHeader({ id: 'calls', label: 'CALLS' }, CJ_CONFIG), '');
  assert.equal(configCellHeader(undefined, CJ_CONFIG), undefined);
  assert.equal(configCellHeader({ id: 'tab-telemetry', label: 'TLM' }, CJ_CONFIG), 'TELEMETRY UI');
});

test('wiring: host labels take the header, skin WING SWEEP / COMPASS / VDI labels hidden in place (zero shift), aria in sync', () => {
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(layer, /<AccelCell [^>]*header=\{hdr\.accel\}/);
  assert.match(layer, /<MapCell [^>]*header=\{hdr\.map\}/);
  assert.match(layer, /data-hdr-sweep=\{hdr\.sweep !== undefined \|\| undefined\}/);
  assert.match(layer, /data-hdr-compass=\{hdr\.compass !== undefined \|\| undefined\}/);
  assert.match(layer, /className="cjv2-lab cjv2-config-hdr"[^>]*style=\{\{ left: cells\[c\]\.left \+ 4, top: cells\[c\]\.top - 16 \}\}/);
  assert.match(layer, /'aria-label': `\$\{\(hdr as [^`]+\)\[cell\]\?\.toLowerCase\(\) \|\| cell\} keys`/);
  assert.match(css, /\.cjv2-lab\[data-blank\] \{ visibility: hidden; \}/);
  assert.match(css, /\.cjm:has\(> \.cjv2\[data-config\]\) [^{]*\.cj-a-mid > \.cj-plab:not\(\.cj-plab-2\),/);
  assert.match(css, /\.cjm:has\(> \.cjv2\[data-hdr-sweep\]\) [^{]*\.cj-a-right > \.cj-plab,/);
  assert.match(css, /\.cjm:has\(> \.cjv2\[data-hdr-compass\]\) [^{]*\.cj-a-mid > \.cj-plab-2 \{ visibility: hidden; \}/);
  // only visibility (never display / size) so nothing moves
  assert.doesNotMatch(css.slice(css.indexOf('CONFIG headers (configHeaders.ts)')), /^\.cjm:has\(> \.cjv2\[data-(config|hdr-[a-z]+)\]\)[^{]*\{[^}]*(display|width|height|font-size)/m);
});

test('CONFIG open: the map (i) credit button no longer sits over the tile above MAP (whole tile is the target)', () => {
  const css = src('packs/mounts/carrier-jet-v2.css');
  assert.match(css, /\.cjv2\[data-config\] \.cjv2-map :is\(\.cjv2-info, \.cjv2-attr\) \{ visibility: hidden; \}/);
});
