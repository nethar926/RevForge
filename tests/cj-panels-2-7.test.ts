// Meghan's sheet panels 2 (unified guard animation) and 7 (one heading readout), ported host-side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapAria } from '../src/packs/carrier-jet/liveMap.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('panel 2: one LIFT 220 ms ease-out / CLOSE 180 ms ease-in token pair on every guard cover; Reduce Motion jumps', () => {
  const css = src('src/packs/mounts/carrier-jet-v2.css');
  assert.match(css, /--cj-guard-lift: 220ms cubic-bezier\(0, 0, 0\.58, 1\); --cj-guard-close: 180ms cubic-bezier\(0\.42, 0, 1, 1\);/);
  const closed = css.match(/\n(\.cjp-guarded > :is\(\.cjp-lid, \.cjp-under\)[^{]*)\{\s*transition: transform var\(--cj-guard-close\), opacity var\(--cj-guard-close\);/);
  const open = css.match(/\n(\.cjp-guarded\[data-open='true'\][^{]*)\{\s*transition: transform var\(--cj-guard-lift\), opacity var\(--cj-guard-lift\);/);
  assert.ok(closed && open);
  for (const sel of [closed![1], open![1]]) for (const part of ['cjp-lid', 'cjp-under', 'cjg-lid', 'cjg-strip', 'cjp-sdg-lid', 'cjp-sdg-under']) assert.ok(sel.includes(part), `${part} in ${sel}`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.cjp-guarded > :is\(\.cjp-lid, \.cjp-under\)[^{]*\{ transition: none !important; \}/);
  assert.match(css, /\[data-rf-reduce-motion\] :is\(\.cjp-guarded > \.cjp-lid,[^)]*\.cjg \.cjg-strip[^)]*\)/);
  // no bounce: no overshooting curve in the tokens
  assert.doesNotMatch(css.match(/--cj-guard-lift[^;]*;[^;]*;/)![0], /cubic-bezier\([^)]*(1\.[1-9]|-0\.[1-9])/);
  // the app's Reduce Motion reaches the dock guards (AB on the bank, QUICK START on bank B)
  const mount = src('src/packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /className="cjm-bank"[^>]*data-rf-reduce-motion=\{reduced \|\| undefined\}/);
  assert.match(mount, /className="cjm-bank-b"[^>]*data-rf-reduce-motion=\{reduced \|\| undefined\}/);
});

test('panel 7: no HDG / MAG legend on the map, heading not in the map name; COMPASS keeps it; the map keeps its bug', () => {
  const map = src('src/packs/mounts/CjLiveMap.tsx');
  const live = map.slice(0, map.indexOf('export function CjHeadingReadout'));
  assert.doesNotMatch(live, /<CjHeadingLegend/);
  assert.doesNotMatch(live, /cjv2-hdg"/);
  assert.match(live, /mapAria\(view, status, null\)/);
  assert.match(live, /className="cjv2-bug"/);
  assert.match(map.slice(map.indexOf('export function CjHeadingReadout')), /<CjHeadingLegend trueHdg=\{pair\.t\} magHdg=\{pair\.m\} lead=\{hdgRef\}/);
  assert.doesNotMatch(mapAria({ northUp: false, zoom: 2, mode: 'map' }, '', null), /heading/);
});
