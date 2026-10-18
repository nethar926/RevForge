// Headless controls: SlideConfirm's two-tap arm / 3 s disarm (never a single tap) and drag threshold, RangeDial's
// stepping, clamping, keyboard and tap-to-cycle; RadialMenu / MagneticSelect geometry.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARM_IDLE, ARM_TIMEOUT_MS, armRemaining, expireArm, isArmed, SLIDE_ARMED_LABEL, SLIDE_CONFIRM_AT, slideFraction, slideLabel, slideReleased, tapConfirm, type ArmState } from '../src/controls/slideConfirmModel.ts';
import { angleDelta, atMax, atMin, clampValue, cycleStops, keyValue, nextStop, pointerAngle, rotationToDelta, snapValue, stepValue, valueToAngle } from '../src/controls/rangeDialModel.ts';
import { nextEnabled, radialIndex, radialPosition } from '../src/controls/radialMenuModel.ts';
import { nearestOption, optionFraction, trackFraction } from '../src/controls/magneticSelectModel.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f: string) => readFileSync(join(root, 'src/controls', f), 'utf8');

test('SlideConfirm tap mode: first tap arms, second within 3 s confirms; a single tap never confirms', () => {
  let s: ArmState = ARM_IDLE;
  let r = tapConfirm(s, 1000);
  assert.equal(r.confirmed, false, 'tap 1 only arms');
  s = r.state;
  assert.equal(isArmed(s, 1000), true);
  assert.equal(slideLabel({ label: 'Shut down', mode: 'tap', armed: true }), SLIDE_ARMED_LABEL);
  assert.equal(SLIDE_ARMED_LABEL, 'Tap again to confirm');
  r = tapConfirm(s, 1000 + ARM_TIMEOUT_MS - 1);
  assert.equal(r.confirmed, true, 'tap 2 inside the window confirms');
  assert.deepEqual(r.state, ARM_IDLE, 'and resets');
  // after a confirm the next tap arms again (not a confirm)
  assert.equal(tapConfirm(r.state, 5000).confirmed, false);
});

test('SlideConfirm tap mode: disarms after 3 s (fake timers); a late second tap re-arms instead of confirming', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10_000 });
  try {
    let s: ArmState = tapConfirm(ARM_IDLE, Date.now()).state;
    let disarmedAt = -1;
    // the component's timer: setTimeout(ARM_TIMEOUT_MS) → expireArm
    setTimeout(() => {
      s = expireArm(s, Date.now());
      disarmedAt = Date.now();
    }, ARM_TIMEOUT_MS);
    mock.timers.tick(ARM_TIMEOUT_MS - 1);
    assert.equal(isArmed(s, Date.now()), true, 'still armed at 2.999 s');
    assert.equal(armRemaining(s, Date.now()), 1);
    mock.timers.tick(1);
    assert.equal(disarmedAt, 13_000);
    assert.deepEqual(s, ARM_IDLE, 'disarmed at 3 s');
    const late = tapConfirm(s, Date.now() + 10);
    assert.equal(late.confirmed, false, 'a tap after the window arms again');
    assert.equal(isArmed(late.state, Date.now() + 10), true);
    // even if the timer had not fired, a lapsed arm never confirms
    const stale: ArmState = { armedAt: 0 };
    assert.equal(tapConfirm(stale, ARM_TIMEOUT_MS).confirmed, false);
  } finally {
    mock.timers.reset();
  }
});

test('SlideConfirm: disabled never arms or confirms; drag confirms only at ≥ 85 % of the travel', () => {
  assert.deepEqual(tapConfirm({ armedAt: 1 }, 2, true), { state: ARM_IDLE, confirmed: false });
  assert.equal(SLIDE_CONFIRM_AT, 0.85);
  assert.equal(slideReleased(slideFraction(84, 100)), 'reset');
  assert.equal(slideReleased(slideFraction(85, 100)), 'confirm');
  assert.equal(slideReleased(slideFraction(400, 100)), 'confirm');
  assert.equal(slideFraction(-30, 100), 0);
  assert.equal(slideFraction(10, 0), 0);
  assert.equal(slideLabel({ label: 'Shut down', mode: 'drag', armed: false }), 'Slide to shut down');
  assert.equal(slideLabel({ label: 'Shut down', mode: 'tap', armed: false }), 'Shut down');
  // component: the armed timer is ARM_TIMEOUT_MS, the tap path goes through tapConfirm in both modes
  const c = src('SlideConfirm.tsx');
  assert.match(c, /setTimeout\([\s\S]*?ARM_TIMEOUT_MS\)/);
  assert.equal((c.match(/tapConfirm\(/g) ?? []).length, 1);
  assert.match(c, /touch-action|className="rf-slide__track"/);
});

test('RangeDial: stepping snaps to the grid and clamps at min / max', () => {
  const s = { min: 0, max: 10, step: 2 };
  assert.equal(stepValue(4, 1, s), 6);
  assert.equal(stepValue(4, -1, s), 2);
  assert.equal(stepValue(10, 1, s), 10, 'clamped at max');
  assert.equal(stepValue(0, -1, s), 0, 'clamped at min');
  assert.equal(stepValue(5, 1, s), 8, 'off-grid value snaps (5→6) then steps');
  assert.equal(atMin(0, s), true);
  assert.equal(atMax(10, s), true);
  assert.equal(atMax(8, s), false);
  assert.equal(clampValue(-4, s), 0);
  assert.equal(clampValue(99, s), 10);
  assert.equal(clampValue(Number.NaN, s), 0);
  // float steps stay clean
  const f = { min: 0, max: 1, step: 0.1 };
  assert.equal(stepValue(0.2, 1, f), 0.3);
  assert.equal(stepValue(0.9, 1, f), 1);
  // a max off the grid is still reachable and never exceeded
  const odd = { min: 0, max: 10, step: 3 };
  assert.equal(snapValue(10, odd), 10);
  assert.equal(stepValue(9, 1, odd), 10);
  // a broken spec is repaired (min/max swapped, step 0 → 1)
  assert.equal(stepValue(5, 1, { min: 10, max: 0, step: 0 }), 6);
});

test('RangeDial: keyboard (arrows, PageUp/Down ×10, Home/End) and tap-to-cycle stops', () => {
  const s = { min: 0, max: 100, step: 1 };
  assert.equal(keyValue('ArrowUp', 50, s), 51);
  assert.equal(keyValue('ArrowRight', 50, s), 51);
  assert.equal(keyValue('ArrowDown', 50, s), 49);
  assert.equal(keyValue('ArrowLeft', 0, s), 0);
  assert.equal(keyValue('PageUp', 95, s), 100);
  assert.equal(keyValue('PageDown', 50, s), 40);
  assert.equal(keyValue('Home', 50, s), 0);
  assert.equal(keyValue('End', 50, s), 100);
  assert.equal(keyValue('a', 50, s), null);
  assert.deepEqual(cycleStops(s), [0, 25, 50, 75, 100]);
  assert.equal(nextStop(30, cycleStops(s)), 50);
  assert.equal(nextStop(100, cycleStops(s)), 0, 'wraps');
});

test('RangeDial: rotation maps the 270° sweep onto the range; slider ARIA on the face', () => {
  const s = { min: 0, max: 270, step: 1 };
  assert.equal(rotationToDelta(90, s), 90);
  assert.equal(valueToAngle(0, s), -135);
  assert.equal(valueToAngle(270, s), 135);
  assert.equal(Math.round(pointerAngle(10, 0)), 90, '3 o’clock');
  assert.equal(Math.round(pointerAngle(0, -10)), 0, '12 o’clock');
  assert.equal(angleDelta(170, -170), 20, 'shortest arc across ±180');
  const c = src('RangeDial.tsx');
  for (const a of ['role="slider"', 'aria-valuenow={value}', 'aria-valuemin={spec.min}', 'aria-valuemax={spec.max}', 'aria-valuetext={valueText}']) assert.ok(c.includes(a), a);
  assert.match(c, /aria-label=\{`Decrease \$\{label\}`\}/);
  assert.match(c, /aria-label=\{`Increase \$\{label\}`\}/);
  const css = src('controls.css');
  assert.match(css, /\.rf-dial__step \{ width: 44px; height: 44px;/);
});

test('RadialMenu / MagneticSelect geometry', () => {
  assert.equal(radialIndex(0, -50, 4), 0, 'up = item 0');
  assert.equal(radialIndex(50, 0, 4), 1, 'right = item 1');
  assert.equal(radialIndex(0, 50, 4), 2);
  assert.equal(radialIndex(-50, 0, 4), 3);
  assert.equal(radialIndex(5, 5, 4), -1, 'dead zone cancels');
  const p = radialPosition(1, 4, 80);
  assert.equal(Math.round(p.x), 80);
  assert.equal(Math.abs(Math.round(p.y)), 0);
  assert.equal(nextEnabled(0, 1, [true, false, true]), 2);
  assert.equal(nextEnabled(2, 1, [true, false, true]), 0, 'wraps');
  assert.equal(nextEnabled(0, 1, [false, false]), -1);
  assert.equal(optionFraction(0, 3), 0);
  assert.equal(optionFraction(2, 3), 1);
  assert.equal(nearestOption(0.3, [true, true, true]), 1);
  assert.equal(nearestOption(0.2, [true, true, true]), 0);
  assert.equal(nearestOption(0.9, [true, true, false]), 1, 'disabled options never win');
  assert.equal(trackFraction(150, 100, 100), 0.5);
});

test('every control: pointer events, touch-action, Reduce Motion, no hover-only state, text ≥ 11 px', () => {
  const css = src('controls.css');
  assert.ok(!/:hover/.test(css), 'no hover');
  assert.ok(!/@keyframes|animation:\s*[a-z]/.test(css.replace(/animation: none !important/g, '')), 'no animation / flashing');
  assert.ok(!/backdrop-filter|border-radius:\s*(999|[2-9]\d)px/.test(css), 'matte, no pills');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\[data-rf-reduce-motion\] \.rf-ctl/);
  for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 11, `font-size ${m[1]}px`);
  for (const f of ['SlideConfirm.tsx', 'RangeDial.tsx', 'RadialMenu.tsx', 'MagneticSelect.tsx']) {
    const c = src(f);
    assert.match(c, /onPointerDown=/, f);
    assert.match(c, /useReducedMotion\(props\.reduceMotion\)/, f);
    assert.match(c, /useInteractionMode\(\)/, f);
    assert.match(c, /key=\{mode\}/, `${f} remounts on a mode change`);
    assert.ok(!/onMouse(Enter|Over|Leave)/.test(c), `${f}: no hover`);
  }
  assert.match(css, /\.rf-dial__face \{[^}]*touch-action: none/);
  assert.match(css, /\.rf-radial__hub \{[^}]*touch-action: none/);
  assert.match(css, /\.rf-slide__track \{[^}]*touch-action: pan-y/);
  assert.match(css, /\.rf-magnet__track \{[^}]*touch-action: pan-y/);
  assert.match(src('MagneticSelect.tsx'), /role="radiogroup"/);
  assert.match(src('MagneticSelect.tsx'), /role="radio"/);
});
