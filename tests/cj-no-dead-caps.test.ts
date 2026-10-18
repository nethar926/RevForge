// CJ edge keys: a round cap only where the key has an action (Meghan: 18 of 25 caps were dead). Dead slots are the
// plain CRT slot rail: no button, not focusable, aria-hidden; same .cjv2-key box, so zero layout shift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cellKeys, KEY_CELLS, rightBankFor } from '../src/packs/carrier-jet/edgeKeys.ts';
import { MAP_VIEW_DEFAULT } from '../src/packs/carrier-jet/mapView.ts';

const layer = readFileSync(new URL('../src/packs/mounts/CjV2Layer.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-v2.css', import.meta.url), 'utf8');

test('cap only for a key with a legend; dead slot = rail, aria-hidden, no BezelKey, same box', () => {
  assert.match(layer, /k\?\.legend \? \(/);
  const rail = layer.slice(layer.indexOf('data-rail=""') - 200, layer.indexOf('cjv2-rail') + 40);
  assert.match(rail, /style=\{\{ left: xs\[i\], top, width: KEY_W, height: KEY_H \}\}/, 'same box as a capped key');
  assert.match(rail, /aria-hidden="true"/);
  assert.doesNotMatch(rail, /BezelKey|<button|tabIndex/);
  assert.match(css, /\.cjv2-key\[data-rail\] \{ pointer-events: none; \}/);
  assert.match(css, /\.cjv2-key > \.cjv2-rail \{[^}]*height: calc\(100% \* 18 \/ 66\)/);
});

test('a key group with no live key is hidden from VoiceOver (no empty "vdi keys" group)', () => {
  assert.match(layer, /keys\.some\(\(k\) => k\?\.legend\) \? \{ role: 'group', 'aria-label':/);
  assert.match(layer, /: \{ 'aria-hidden': true \}/);
});

test('drive board: live keys = CONFIG, map four, DRIVE · MORE; every other slot is dead', () => {
  const live: string[] = [];
  for (const cell of KEY_CELLS) for (const k of cellKeys(cell, 4, { map: MAP_VIEW_DEFAULT, config: null, bank: rightBankFor(true) })) if (k?.legend) live.push(k.legend);
  assert.deepEqual(live.sort(), ['CONFIG', 'DRIVE', 'MAP/TERR', 'MORE', 'N/TRK-UP', 'ZM+', 'ZM−'].sort());
});
