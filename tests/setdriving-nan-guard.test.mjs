/**
 * setDriving NaN / ±Infinity guard: a non-finite numeric DrivingInput field is treated as "not
 * supplied" (last good value or the engine's fallback) at the entry of CharacterEngine and
 * EngineSynthImpl, so nothing throws at an AudioParam and no drive model is poisoned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);
const { createJiti } = await import('jiti');
const jiti = createJiti(join(root, 'package.json'), { moduleCache: false });
const { sanitizeDrivingInput } = await jiti.import(join(root, 'src/audio/drivingInput.ts'));

const FIELDS = ['speed', 'throttle', 'load', 'rpm', 'rpmNorm', 'acceleration'];
const BAD = [NaN, Infinity, -Infinity];
const GOOD = { speed: 0.4, throttle: 0.8, load: 0.6, rpm: 5200, rpmNorm: 0.9, acceleration: 0.5, reverse: false, shifting: false, overrun: false };

const allFinite = (obj, label) => {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${label}.${k} = ${v}`);
  }
};

test('sanitizeDrivingInput: non-finite → last good value or not supplied; never returns a non-finite number', () => {
  const prev = sanitizeDrivingInput(GOOD);
  assert.deepEqual(prev, GOOD);
  for (const f of FIELDS) {
    for (const b of BAD) {
      const withPrev = sanitizeDrivingInput({ ...GOOD, [f]: b }, prev);
      allFinite(withPrev, `${f}=${b}`);
      assert.equal(withPrev[f], GOOD[f], `${f}=${b} holds the last good value`);
      const cold = sanitizeDrivingInput({ ...GOOD, [f]: b });
      allFinite(cold, `cold ${f}=${b}`);
      if (f === 'speed' || f === 'throttle') assert.equal(cold[f], 0, `${f} required → 0 without history`);
      else assert.equal(f in cold, false, `${f} not supplied → engine fallback`);
    }
  }
  // explicit omission stays omitted (no stale hold); a held value carries over consecutive glitches
  assert.equal('rpmNorm' in sanitizeDrivingInput({ speed: 0.1, throttle: 0.2 }, prev), false);
  const held = sanitizeDrivingInput({ ...GOOD, rpmNorm: NaN }, sanitizeDrivingInput({ ...GOOD, rpmNorm: Infinity }, prev));
  assert.equal(held.rpmNorm, 0.9);
  assert.deepEqual(sanitizeDrivingInput(undefined), { speed: 0, throttle: 0 });
  assert.deepEqual(sanitizeDrivingInput(null, prev).speed, 0.4);
});

// Carrier Jet (Tomcat voice), Night Pursuit, an ICE pack, Ion Twin.
const PACKS = [
  { patchId: 'aerospace-f14', label: 'Carrier Jet / Tomcat', params: { tcSpoolTime: 0 } },
  { patchId: 'night-pursuit', label: 'Night Pursuit' },
  { patchId: 'v8-rumble', label: 'ICE V8' },
  { patchId: 'ion-twin', label: 'Ion Twin', expectStage: 'kill' },
];

for (const pack of PACKS) {
  test(`${pack.label} (${pack.patchId}): NaN / ±Infinity in every numeric setDriving field never throws, output stays finite`, async () => {
    const DUR = 2.0;
    const W0 = 0.8;
    const W1 = 1.6;
    let k = 0;
    let stageBefore;
    let checked = 0;
    // The car loop itself also feeds one glitch per frame inside the window (render must not reject).
    const profile = (t) => {
      if (t < W0 || t > W1) return GOOD;
      const i = k++ % (FIELDS.length * BAD.length);
      return { ...GOOD, [FIELDS[Math.floor(i / BAD.length)]]: BAD[i % BAD.length] };
    };
    const buf = await renderLive(profile, DUR, {
      patchId: pack.patchId,
      params: pack.params,
      seed: `nan-guard-${pack.patchId}`,
      fps: 30,
      sampleRate: 8000,
      onFrame: (engine, t) => {
        if (t < W0 - 0.1) {
          stageBefore = engine.getLockStage();
          return;
        }
        if (t > W1) return;
        for (const f of FIELDS) {
          for (const b of BAD) {
            assert.doesNotThrow(() => engine.setDriving({ ...GOOD, [f]: b }), `${f}=${b}`);
            assert.equal(engine.getLockStage(), stageBefore, `lock stage changed after ${f}=${b}`);
            assert.equal(engine.getHud().lockStage ?? 'none', stageBefore);
            allFinite(engine.getHud(), `hud after ${f}=${b}`);
            const es = engine.getEngineState?.() ?? engine.base.getEngineState?.();
            if (es) allFinite(es, `getEngineState after ${f}=${b}`);
            checked++;
          }
        }
        // back to a good frame: still steady
        engine.setDriving(GOOD);
        assert.equal(engine.getLockStage(), stageBefore);
      },
    });
    assert.ok(checked >= FIELDS.length * BAD.length * 10, `checked ${checked} glitch calls`);
    if (pack.expectStage) assert.equal(stageBefore, pack.expectStage, 'lock stage was live before the glitches');
    let peak = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const x = buf.getChannelData(c);
      for (let i = 0; i < x.length; i++) {
        assert.ok(Number.isFinite(x[i]), `non-finite sample ch${c}[${i}]`);
        peak = Math.max(peak, Math.abs(x[i]));
      }
    }
    assert.ok(peak > 1e-4 && peak <= 4, `${pack.patchId} output peak ${peak}`);
  });
}
