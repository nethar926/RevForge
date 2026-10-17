/** CJ VDI bank from GPS (mock): bank = atan(v·ω/g) from the ACCEL ball's own state, ±30°, 0 below 3 mph / stale. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCEL_INIT, accelStep, accelTarget, G, type AccelState } from '../src/packs/carrier-jet/accelBall.ts';
import { BANK_MAX_DEG, BANK_MIN_MPS, BANK_TICKS, bankEase, bankFromLateralG, bankTarget, bankText } from '../src/packs/carrier-jet/bankAngle.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
/** n fixes at 1 Hz, speed v (m/s), heading rate w (deg/s). */
function turn(v: number, w: number, n = 12, t0 = 1_000_000): { st: AccelState; now: number } {
  let st = ACCEL_INIT, h = 40;
  for (let i = 0; i < n; i++) {
    st = accelStep(st, { speed: v, heading: ((h % 360) + 360) % 360, timestamp: t0 + i * 1000 });
    h += w;
  }
  return { st, now: t0 + (n - 1) * 1000 + 200 };
}
const wFor = (deg: number, v: number) => ((Math.tan((deg * Math.PI) / 180) * G) / v) * (180 / Math.PI);

test('bank = atan(v·ω/g): 15° R and 25° L at 30 mph; agrees with the ACCEL ball (tan bank = lateral g)', () => {
  const v = 13.4;
  const r = turn(v, wFor(15, v));
  assert.ok(Math.abs(bankTarget(r.st, r.now) - 15) < 0.1, String(bankTarget(r.st, r.now)));
  assert.ok(Math.abs(Math.tan((bankTarget(r.st, r.now) * Math.PI) / 180) - accelTarget(r.st, r.now).lat) < 1e-9, 'same turn as the ball');
  const l = turn(v, -wFor(25, v));
  assert.ok(Math.abs(bankTarget(l.st, l.now) + 25) < 0.1);
  const s = turn(v, 0);
  assert.equal(bankTarget(s.st, s.now), 0, 'straight = wings level');
});

test('clamp ±30°, no exaggeration; 0 below 3 mph; 0 when stale', () => {
  assert.equal(BANK_MAX_DEG, 30);
  assert.equal(bankFromLateralG(5), 30);
  assert.equal(bankFromLateralG(-5), -30);
  assert.ok(Math.abs(bankFromLateralG(Math.tan(Math.PI / 12)) - 15) < 1e-9);
  const hard = turn(13.4, 40);
  assert.equal(bankTarget(hard.st, hard.now), 30);
  assert.ok(Math.abs(BANK_MIN_MPS - 1.341) < 0.001);
  const slow = turn(1.2, 30);
  assert.equal(bankTarget(slow.st, slow.now), 0, 'GPS course is noise below 3 mph');
  const r = turn(13.4, wFor(15, 13.4));
  assert.equal(bankTarget(r.st, r.now + 10_000), 0, 'stale fix');
  assert.equal(bankTarget(ACCEL_INIT, 0), 0);
});

test('ease: glides toward the target; Reduce Motion snaps (value, no easing)', () => {
  const b = bankEase(0, 20, 0.1);
  assert.ok(b > 0 && b < 20);
  assert.equal(bankEase(0, 20, 0.1, true), 20);
  assert.equal(bankEase(0.03, 0, 0.1), 0);
  assert.equal(bankText(0), 'wings level');
  assert.equal(bankText(15.2), 'bank 15 degrees right');
  assert.equal(bankText(-25), 'bank 25 degrees left');
});

test('VDI: every Ladder gets bank; bank scale ticks at 0/10/20/30; host feeds it from GPS', () => {
  const hud = src('skins/carrier-jet/CarrierJetHud.tsx');
  assert.equal((hud.match(/<Ladder /g) ?? []).length, (hud.match(/<Ladder [^>]*bank=\{v\.bank\}/g) ?? []).length);
  assert.match(hud, /bank: Math\.max\(-30, Math\.min\(30,/);
  assert.deepEqual([...BANK_TICKS], [-30, -20, -10, 0, 10, 20, 30]);
  assert.match(src('skins/carrier-jet/parts.tsx'), /\{\[-30, -20, -10, 0, 10, 20, 30\]\.map\(\(a\) =>/);
  assert.match(src('packs/mounts/CarrierJetMount.tsx'), /bank=\{vdiBank\}/);
  assert.match(src('packs/mounts/useCjBank.ts'), /bankEase\(b, demo \? 0 : bankTarget\(st\.current, Date\.now\(\)\), \(now - last\) \/ 1000, reduced\)/);
});
