/**
 * Twin Ion: CharacterEngine must mirror the base lock ladder (parked Hold-to-Rev
 * throttle→rpmNorm fallback), not recompute from rpmNorm??speed alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);

test('CharacterEngine derives lockStage from base after setDriving (no local nextLockStage)', () => {
  const ce = readFileSync(join(root, 'src/audio/CharacterEngine.ts'), 'utf8');
  assert.doesNotMatch(ce, /nextLockStage/);
  assert.match(ce, /this\.base\.setDriving\(input\)/);
  assert.match(ce, /this\.base\.getLockStage\(\)/);
  assert.match(ce, /this\.running\?this\.base\.getLockStage\(\):'none'/);
});

test('ion-twin parked Hold-to-Rev: CharacterEngine lockStage matches base (first step identified)', async () => {
  // Parked, full throttle, no Frontend rpmNorm → HUD rpmNorm ≈ throttle*0.55 ≈ 0.5445 (acoustic). The
  // ladder reads the smoothed Rev throttle and escalates one stage per LOCK_MIN_HOLD_S, so at
  // 0.2–0.35 s the first step (identified) is in; KILL follows (tests/ion-lockstage-dwell.test.mjs).
  const profile = () => ({ speed: 0, throttle: 0.99, load: 0.99 });
  let seen;
  await renderLive(profile, 0.35, {
    patchId: 'ion-twin',
    seed: 'ion-lockstage-parked',
    fps: 30,
    onFrame: (engine, t) => {
      if (t < 0.2) return;
      const wrap = engine.getLockStage();
      const hud = engine.getHud().lockStage;
      const base = engine.base.getLockStage();
      const baseHud = engine.base.getHud().lockStage;
      const rpmNorm = engine.getHud().rpmNorm;
      seen = { wrap, hud, base, baseHud, rpmNorm, t };
    },
  });
  assert.ok(seen, 'onFrame captured a sample');
  assert.ok(seen.rpmNorm > 0.5 && seen.rpmNorm < 0.6, `hud rpmNorm ${seen.rpmNorm} (parked throttle fallback)`);
  assert.equal(seen.base, 'identified', `base getLockStage ${seen.base}`);
  assert.equal(seen.baseHud, 'identified', `base hud.lockStage ${seen.baseHud}`);
  assert.equal(seen.wrap, 'identified', `CharacterEngine getLockStage ${seen.wrap}`);
  assert.equal(seen.hud, 'identified', `CharacterEngine getHud().lockStage ${seen.hud}`);
  assert.equal(seen.wrap, seen.base);
  assert.equal(seen.hud, seen.baseHud);
});
