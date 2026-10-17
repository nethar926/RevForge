// SHELF key START lamp (Meghan): amber #ffc35a legend on a dark warm plate, >= 4.5:1 (was 3.2:1 on a 14% amber wash
// with a glow), lit steadily: the cjcs-start-glow animation is gone, so Reduce Motion has nothing to stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');
const nc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('START lamp: no animation anywhere (rule, keyframes, Reduce Motion overrides all gone)', () => {
  const css = nc(src('src/packs/mounts/carrier-jet-v2.css'));
  const rule = css.match(/\.cjcs-shelfkey \.cjcs-start \{[^}]*\}/)![0];
  assert.doesNotMatch(rule, /animation|transition/);
  assert.doesNotMatch(css, /cjcs-start-glow/);
  assert.doesNotMatch(css, /\.cjcs-start\s*\{\s*animation/);
  for (const f of ['src/packs/mounts/CjColdStart.tsx', 'src/packs/mounts/CarrierJetMount.tsx']) assert.doesNotMatch(src(f), /start-glow/);
});

test('START lamp contrast: #ffc35a on #3a3328 >= 4.5:1, and measured >= 4.5:1 on rendered pixels at 1256 / 773 / 390', () => {
  const rule = nc(src('src/packs/mounts/carrier-jet-v2.css')).match(/\.cjcs-shelfkey \.cjcs-start \{[^}]*\}/)![0];
  assert.match(rule, /color: #ffc35a;/);
  assert.match(rule, /background: #3a3328;/);
  assert.doesNotMatch(rule, /text-shadow/, 'no glow bleeding into the plate');
  assert.ok(ratio('#ffc35a', '#3a3328') >= 4.5, ratio('#ffc35a', '#3a3328').toFixed(2));
  const fx = JSON.parse(src('tests/fixtures/cj-start-contrast.json')) as { viewports: Record<string, { bg: string; text: string; contrast: number }> };
  for (const sz of ['1256', '773', '390']) {
    const m = fx.viewports[sz];
    assert.ok(m, sz);
    assert.ok(m.contrast >= 4.5, `${sz}: ${m.contrast}`);
    assert.ok(Math.abs(ratio(m.text, m.bg) - m.contrast) < 0.05, `${sz}: recorded pixels agree`);
    assert.equal(m.bg, '#3a3328', `${sz}: plate rendered as specified`);
  }
});
