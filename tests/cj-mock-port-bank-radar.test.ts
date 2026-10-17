// Port checks on top of Meghan's cj-vdi-bank / cj-radar-overlay tests: bank boundaries (cap both ways, 3 mph edge,
// stale edge), Reduce Motion shows the real angle at every tick (no easing), and the map stays mounted and visible
// under RADAR (no hidden prop, no CSS hiding, dimmed by paint colours, not a filter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCEL_INIT, ACCEL_STALE_MS, accelStep, G, type AccelState } from '../src/packs/carrier-jet/accelBall.ts';
import { BANK_MAX_DEG, BANK_MIN_MPS, bankEase, bankTarget } from '../src/packs/carrier-jet/bankAngle.ts';
import { CJ_RADAR_MAP_DIM } from '../src/packs/carrier-jet/liveMap.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
function turn(v: number, w: number, n = 12, t0 = 2_000_000): { st: AccelState; last: number } {
  let st = ACCEL_INIT, h = 10;
  for (let i = 0; i < n; i++) {
    st = accelStep(st, { speed: v, heading: ((h % 360) + 360) % 360, timestamp: t0 + i * 1000 });
    h += w;
  }
  return { st, last: t0 + (n - 1) * 1000 };
}
const wFor = (deg: number, v: number) => ((Math.tan((deg * Math.PI) / 180) * G) / v) * (180 / Math.PI);

test('bank cap: ±30° both ways for any turn harder than 30°, never beyond', () => {
  for (const sign of [1, -1]) for (const deg of [31, 45, 60]) {
    const r = turn(15, sign * wFor(deg, 15));
    assert.equal(bankTarget(r.st, r.last + 100), sign * BANK_MAX_DEG, `${sign * deg}°`);
  }
  const r = turn(15, wFor(29, 15));
  const b = bankTarget(r.st, r.last + 100);
  assert.ok(b > 28.5 && b < 30, String(b));
});

test('bank low speed: 0 just below 3 mph, live from 3 mph up', () => {
  const below = turn(BANK_MIN_MPS * 0.95, 20);
  assert.equal(bankTarget(below.st, below.last + 100), 0);
  const above = turn(BANK_MIN_MPS * 1.6, 20);
  assert.notEqual(bankTarget(above.st, above.last + 100), 0);
});

test('bank stale: real value up to the stale limit, 0 after it', () => {
  const r = turn(13.4, wFor(15, 13.4));
  assert.ok(Math.abs(bankTarget(r.st, r.last + ACCEL_STALE_MS) - 15) < 0.2);
  assert.equal(bankTarget(r.st, r.last + ACCEL_STALE_MS + 1), 0);
});

test('Reduce Motion: every tick shows the real angle (no easing, any dt), and the hook passes reduced through', () => {
  const targets = [0, 12.5, -20, 30, -30, 7, 0];
  let b = 0;
  for (const t of targets) for (const dt of [0.1, 0.016, 1, 0]) {
    b = bankEase(b, t, dt, true);
    assert.equal(b, t);
  }
  // without Reduce Motion the same step eases (so the snap is the RM path, not a coincidence)
  assert.notEqual(bankEase(0, 20, 0.1, false), 20);
  const hook = src('packs/mounts/useCjBank.ts');
  assert.match(hook, /bankEase\(b, demo \? 0 : bankTarget\(st\.current, Date\.now\(\)\), \(now - last\) \/ 1000, reduced\)/);
  assert.match(hook, /\}, \[on, demo, reduced\]\);/);
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /useCjBank\([^)]*reduced[^)]*\)/);
});

test('RADAR: the map stays mounted and visible under the scope (dimmed 62% by paint, not hidden, not filtered)', () => {
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const live = src('packs/mounts/CjLiveMap.tsx');
  // one CjLiveMap, always rendered in the MAP cell; RADAR passes a scope instead of hiding it
  assert.equal((layer.match(/<CjLiveMap /g) ?? []).length, 1);
  assert.doesNotMatch(layer, /<CjLiveMap [^>]*hidden=/);
  assert.match(layer, /<CjLiveMap [^>]*radar=\{view\.radar \?/);
  // the map canvas is always in the tree, before the scope; visibility only hides for the host's own hidden prop
  assert.match(live, /<div ref=\{glRef\} className="cjv2-mapgl" aria-hidden="true" \/>\s*<div className="cjv2-scan"/);
  assert.match(live, /const boxStyle: CSSProperties \| undefined = hidden \? \{ visibility: 'hidden' \} : undefined;/);
  assert.match(live, /data-radar=\{radar \? \(mapShown \? 'over-map' : 'alone'\) : undefined\}/);
  // no CSS rule hides or filters the map under RADAR
  const css = src('packs/mounts/carrier-jet-v2.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.match(/[^{}]*\{[^{}]*\}/g) ?? []) {
    const [sel, body] = rule.split('{');
    if (!/cjv2-mapgl|cjv2-hsd\[data-radar|cjv2-hsd > canvas/.test(sel)) continue;
    assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|opacity:\s*0[;\s}]|filter:/, sel.trim());
  }
  assert.equal(CJ_RADAR_MAP_DIM, 0.62);
});
