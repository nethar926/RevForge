import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'));

test('dcGuard is rpm-gated: 0 through idle/low rpm, full by 2800 rpm, per-patch override', async () => {
  const { iceDcGuardForRpm, ICE_DC_GUARD_RPM_START, ICE_DC_GUARD_RPM_FULL } = await jiti.import(
    join(root, 'src/audio/iceDcGuard.ts'),
  );
  assert.equal(ICE_DC_GUARD_RPM_START, 1500);
  assert.equal(ICE_DC_GUARD_RPM_FULL, 2800);
  for (const rpm of [0, 650, 900, 1200, 1500]) assert.equal(iceDcGuardForRpm(rpm), 0);
  assert.ok(iceDcGuardForRpm(2150) > 0.4 && iceDcGuardForRpm(2150) < 0.6);
  for (const rpm of [2800, 4500, 9000]) assert.equal(iceDcGuardForRpm(rpm), 1);
  assert.equal(iceDcGuardForRpm(5000, 0), 0, 'params.dcGuard = 0 disables');
  assert.equal(iceDcGuardForRpm(5000, 0.5), 0.5);
  assert.equal(iceDcGuardForRpm(Number.NaN), 0);
});

test('every worklet ICE pack pushes dcGuard (shared branch, not Night-Pursuit-only)', () => {
  const impl = read('src/audio/EngineSynthImpl.ts');
  assert.match(impl, /import \{ iceDcGuardForRpm \} from '\.\/iceDcGuard'/);
  const i = impl.indexOf("this.setWorkletParam('dcGuard', iceDcGuardForRpm(wp.rpm, p.dcGuard), tc);");
  const np = impl.indexOf('if (nightPursuit && this.npDrive)');
  assert.ok(i > 0 && i < np, 'generic dcGuard push precedes the Night Pursuit override block');
  assert.match(read('src/audio/worklets/pulse-engine-processor.js'), /name: 'dcGuard', defaultValue: 0,/);
});

test('real worklet: stock V8 no longer collapses above 3k rpm; idle untouched', async () => {
  const { renderIcePack } = await import(pathToFileURL(join(root, 'scripts/ice-render.mjs')).href);
  const rms = (buf) => {
    const x = buf.getChannelData(0);
    let s = 0;
    const i0 = Math.floor(buf.sampleRate * 0.8);
    for (let i = i0; i < x.length; i++) {
      assert.ok(Number.isFinite(x[i]));
      s += x[i] * x[i];
    }
    return 20 * Math.log10(Math.sqrt(s / (x.length - i0)) + 1e-12);
  };
  const hi = { speed: 0.7, throttle: 0.9, load: 0.6, rpm: 4500 };
  const off = await renderIcePack('v8-rumble', () => hi, 1.6, { dcGuard: 'off', sampleRate: 22050 });
  const on = await renderIcePack('v8-rumble', () => hi, 1.6, { sampleRate: 22050 });
  assert.ok(rms(on) - rms(off) > 8, `guard should recover the 4.5k collapse (${rms(off).toFixed(1)} → ${rms(on).toFixed(1)})`);
  const idle = await renderIcePack('v8-rumble', () => ({ speed: 0, throttle: 0 }), 1.2, { sampleRate: 22050 });
  assert.ok(idle.trace.every((f) => f.dc === 0), 'guard is exactly 0 at idle');
});
