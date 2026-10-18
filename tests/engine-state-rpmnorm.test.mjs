/**
 * getEngineState().rpmNorm: normalised 0..1 drive value, always finite, 0 when the engine is off,
 * and the exact value the Ion Twin lock ladder reads (so a Frontend scope % agrees with lockStage).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);

const ENTER = { identified: 0.5, lock: 0.7, kill: 0.86 };
const H = 0.04;

test('EngineStateSnapshot documents rpmNorm (0..1, finite, 0 when off, lock-ladder value)', () => {
  const types = readFileSync(join(root, 'src/audio/types.ts'), 'utf8');
  const iface = types.slice(types.indexOf('export interface EngineStateSnapshot'), types.indexOf('export interface DrivingInput'));
  assert.match(iface, /\n  rpmNorm: number;\n/);
  assert.match(iface, /lock ladder/);
  assert.match(iface, /0 while the engine is stopped/);
  assert.match(iface, /finite/);
});

test('ion-twin getEngineState().rpmNorm: 0 before start, tracks the lock ladder, agrees with lockStage, 0 after stop', async () => {
  const rows = [];
  let beforeStart;
  let afterStop = [];
  let stopped = false;
  const profile = (t) => ({ speed: 0, throttle: t < 5 ? 0.99 : 0.3, load: 0.5 });
  await renderLive(profile, 7.5, {
    patchId: 'ion-twin',
    seed: 'engine-state-rpmnorm',
    fps: 60,
    sampleRate: 8000,
    driveBeforeStart: true,
    startAt: 0.2,
    onFrame: (engine, t) => {
      const es = engine.getEngineState();
      if (t < 0.2) {
        beforeStart = es.rpmNorm;
        return;
      }
      if (stopped) {
        afterStop.push(es.rpmNorm);
        return;
      }
      rows.push({
        t,
        v: es.rpmNorm,
        base: engine.base.getEngineState().rpmNorm,
        ladder: engine.base.lockLadder.input,
        stage: engine.getLockStage(),
        hud: engine.getHud().rpmNorm,
      });
      if (t >= 6.5) {
        engine.stop();
        stopped = true;
        afterStop.push(engine.getEngineState().rpmNorm, engine.base.getEngineState().rpmNorm);
      }
    },
  });
  assert.equal(beforeStart, 0, 'engines off before start → 0');
  assert.ok(rows.length > 100);
  for (const r of rows) {
    assert.ok(Number.isFinite(r.v) && r.v >= 0 && r.v <= 1, `finite 0..1 at ${r.t}: ${r.v}`);
    assert.equal(r.v, r.base, 'wrapper forwards the base value');
    assert.equal(r.v, r.ladder, 'same value the lock stage uses');
    // Stage can only sit in a band the value has reached (enter on the way up, exit = enter − h).
    if (r.stage !== 'none') assert.ok(r.v >= ENTER[r.stage] - H - 1e-9 || r.t >= 5, `${r.stage} with rpmNorm ${r.v}`);
  }
  const steady = rows.filter((r) => r.t > 3 && r.t < 5);
  assert.ok(steady.every((r) => r.stage === 'kill' && Math.abs(r.v - 0.99) < 0.005), 'parked 0.99 → ≈0.99 and kill');
  assert.ok(steady.every((r) => Math.abs(r.hud - 0.5445) < 1e-6), 'HUD rpmNorm stays acoustic (0.55 × throttle)');
  const partial = rows.filter((r) => r.t > 6.2);
  assert.ok(partial.every((r) => Math.abs(r.v - 0.3) < 0.01), 'follows a partial lift');
  assert.ok(afterStop.length >= 2 && afterStop.every((v) => v === 0), `stopped → 0: ${afterStop.slice(0, 4)}`);
});

test('getEngineState().rpmNorm stays finite and clamped with out-of-range input, also on non-ladder packs', async () => {
  for (const patchId of ['ion-twin', 'v8-rumble']) {
    const seen = [];
    await renderLive(
      (t) => (t < 0.5 ? { speed: -3, throttle: -2, rpmNorm: -4 } : { speed: 2, throttle: 5, rpmNorm: 7 }),
      1.5,
      {
        patchId,
        seed: `rpmnorm-finite-${patchId}`,
        fps: 30,
        sampleRate: 8000,
        onFrame: (engine) => seen.push(engine.getEngineState().rpmNorm),
      },
    );
    assert.ok(seen.length > 10, patchId);
    assert.ok(seen.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), `${patchId}: ${seen.filter((v) => !(v >= 0 && v <= 1))}`);
    assert.ok(seen.at(-1) > 0.9, `${patchId}: clamped rpmNorm 7 → ≤ 1 and approaching 1 (${seen.at(-1)})`);
  }
});
