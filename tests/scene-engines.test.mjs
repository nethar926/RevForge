/**
 * Scene engines (Oct 18 2026 cleanup): audio-owned RoadView scene presets on our own procedural
 * engines. Catalogue shape, derived schedules, retired-id resolution, and live-chain renders
 * (finite, no clipping, no DC) for every scene.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'), { moduleCache: false });
// builtins pulls EngineSynthImpl-free modules only, but nightPursuit etc. are fine under jiti
const scenes = await jiti.import(join(root, 'src/audio/sceneEngines.ts'));
const bridge = await jiti.import(join(root, 'src/audio/engineStateBridge.ts'));

const SCENE_IDS = [
  'copper-mile', 'ember-dusk', 'violet-grid', 'azure-bend', 'pink-current', 'silver-run',
  'lightline', 'sandwake', 'frostpass', 'deep-transit', 'blossom-run', 'trenchlight', 'light-grid',
];
const PROCEDURAL_TOPOLOGIES = new Set([
  'v8-rumble', 'i4-zip', 'i6-silk', 'rotary-hum', 'ev-whine', 'ev-inverter-climb',
  'ev-regen-howl', 'ev-dual-motor', 'aerospace-f14', 'ion-twin',
]);

async function loadBuiltins() {
  globalThis.AudioWorkletProcessor ??= class {};
  globalThis.registerProcessor ??= () => {};
  return jiti.import(join(root, 'src/audio/builtins.ts'));
}

test('13 scene engines, placeholder names, no taglines, no RevForge voice config', async () => {
  const { BUILTIN_PATCHES, getBuiltin } = await loadBuiltins();
  assert.deepEqual([...scenes.SCENE_ENGINE_IDS], SCENE_IDS);
  SCENE_IDS.forEach((id, i) => {
    const p = getBuiltin(`revforge-${id}`);
    assert.ok(p, `missing builtin revforge-${id}`);
    assert.equal(p.name, `Pack ${String(i + 1).padStart(2, '0')}`);
    assert.equal(p.meta?.blurb, undefined, `${id} carries a tagline`);
    assert.equal(p.revforge, undefined, `${id} would route to RevForgeSynth`);
    assert.ok(PROCEDURAL_TOPOLOGIES.has(p.topology), `${id} topology ${p.topology}`);
    assert.equal(p.layers, undefined);
    for (const [k, v] of Object.entries(p.params)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${id}.${k}`);
    }
  });
  assert.equal(getBuiltin('revforge-trenchlight').topology, 'ion-twin');
  assert.equal(getBuiltin('revforge-trenchlight').kind, 'scifi');
  // No builtin carries the forge voice config any more
  assert.equal(BUILTIN_PATCHES.filter((p) => p.revforge).length, 0);
  assert.equal(new Set(BUILTIN_PATCHES.map((p) => p.id)).size, BUILTIN_PATCHES.length);
});

test('audio owns its scene params: no forge catalogue / JSON import, no storage', () => {
  for (const rel of ['src/audio/sceneEngines.ts', 'src/audio/builtins.ts', 'src/audio/engineStateBridge.ts']) {
    const src = read(rel);
    assert.doesNotMatch(src, /from ['"][./]*\/?forge\//, `${rel} imports src/forge`);
    assert.doesNotMatch(src, /revforge-packs/, rel);
    assert.doesNotMatch(src, /REVFORGE_PATCHES/, rel);
  }
  const se = read('src/audio/sceneEngines.ts');
  assert.doesNotMatch(se, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(se, /decodeAudioData|fetch\(|\.wav|\.mp3|\.ogg/);
});

test('ICE schedules are derived from cylinders / firing order and match the patch params', async () => {
  const { getBuiltin } = await loadBuiltins();
  for (const spec of scenes.SCENE_ENGINE_SPECS) {
    const p = getBuiltin(`revforge-${spec.sceneId}`);
    if (!spec.ice) {
      assert.equal(bridge.resolveIcePackSchedule(p.id), undefined, spec.sceneId);
      continue;
    }
    const derived = scenes.deriveIceSchedule(spec.ice, spec.idleRpm);
    const live = bridge.resolveIcePackSchedule(p.id);
    assert.deepEqual(live, derived, spec.sceneId);
    assert.equal(live.cylinders, spec.ice.cylinders);
    assert.equal(live.eventAnglesDeg.length, spec.ice.firing === 'crossPlane' ? 4 : spec.ice.cylinders);
    assert.equal(live.firingFamily, { crossPlane: 1, flatPlane: 2, i6Even: 3 }[spec.ice.firing]);
    assert.equal(p.params.cylinders, live.cylinders);
    assert.equal(p.params.firingFamily, live.firingFamily);
    assert.equal(p.params.collectorDelayMs, live.collectorDelayMs);
    assert.equal(p.params.tauManifold, live.tauManifold);
    assert.equal(p.params.tauExhaust, live.tauExhaust);
    assert.ok(Math.abs(p.params.rpmIdle - (spec.idleRpm * live.cylinders) / 120) < 0.06);
    assert.ok(Math.abs(p.params.rpmRedline - (spec.limitRpm * live.cylinders) / 120) < 0.06);
    assert.ok(live.collectorDelayMs >= 0.3 && live.collectorDelayMs <= 3);
    assert.ok(live.pulseJitterFrac >= 0.005 && live.pulseJitterFrac <= 0.03);
    // cross-plane breathes slower and lopier than the even engines of this catalogue
    if (spec.ice.firing === 'crossPlane') assert.ok(live.collectorDelayMs > 1.5 && live.pulseJitterFrac > 0.014);
  }
});

test('drivetrain hints: every scene has a sane gear count, shift point and rev ceiling', async () => {
  const { getBuiltin } = await loadBuiltins();
  for (const id of SCENE_IDS) {
    const p = getBuiltin(`revforge-${id}`).params;
    assert.ok(p.gearCount >= 1 && p.gearCount <= 8, id);
    assert.ok(p.maxRpm > 3000 && p.maxRpm <= 18000, id);
    assert.ok(p.autoShiftRpm <= p.maxRpm, id);
  }
});

test('values are fresh: no scene keeps the retired catalogue idle / limiter / shift rpm', { skip: !existsSync(join(root, 'src/forge/revforge-packs.json')) }, () => {
  const packs = JSON.parse(read('src/forge/revforge-packs.json'));
  for (const spec of scenes.SCENE_ENGINE_SPECS) {
    const old = packs.find((p) => p.id === spec.sceneId)?.engine;
    if (!old || old.idleRpm === undefined) continue; // JSON already stripped of engine params
    if (spec.idleRpm > 0) assert.notEqual(spec.idleRpm, old.idleRpm, `${spec.sceneId} idle`);
    assert.notEqual(spec.limitRpm, old.redline, `${spec.sceneId} limiter`);
    assert.notEqual(spec.shiftRpm, old.shiftRpm, `${spec.sceneId} shift`);
  }
});

test('retired engine ids (frontend migration table) land on audio scene engines', async () => {
  const { BUILTIN_PATCHES, getBuiltin, LEGACY_PACK_IDS } = await loadBuiltins();
  const sceneTargets = Object.entries(LEGACY_PACK_IDS).filter(([, to]) => SCENE_IDS.includes(to.replace(/^revforge-/, '')));
  // 11 retired scene engines + the older trenchlight / dual-motor renames
  assert.ok(sceneTargets.length >= 12, `only ${sceneTargets.length} retired scene engine ids`);
  for (const [from, to] of sceneTargets) {
    assert.equal(getBuiltin(from)?.id, to, from);
    assert.equal(BUILTIN_PATCHES.some((p) => p.id === from), false, `${from} is still a builtin`);
  }
  // Every legacy target that is a revforge scene id exists as a builtin
  for (const to of Object.values(LEGACY_PACK_IDS).filter((t) => t.startsWith('revforge-'))) {
    assert.ok(getBuiltin(to), `${to} is not a builtin`);
  }
});

test('bridge works with no scene: unknown / missing pack id keeps topology defaults', () => {
  const b = new bridge.EngineStateBridge();
  b.applyPackId(undefined);
  b.applyPackId('revforge-no-such-scene');
  for (let i = 0; i < 60; i++) b.tick(1 / 60, { throttle: 0.5, speed: 0.3, load: 0.4 }, { cylinders: 8, firingFamily: 1 });
  assert.ok(Number.isFinite(b.rpm) && b.rpm > 0);
  assert.equal(b.firingFamily, 1);
});

// --- Live-chain renders (createEngineSynth → CharacterEngine → EngineSynthImpl; scripts/live-render.mjs) ---
const { renderLive, channels } = await import(pathToFileURL(join(root, 'scripts/live-render.mjs')).href);
const PROFILES = {
  idle: { speed: 0, throttle: 0.05, load: 0.1 },
  pull: { speed: 0.7, throttle: 0.9, load: 0.8 },
};
for (const id of SCENE_IDS) {
  test(`scene ${id}: renders finite, unclipped, DC-free at idle and under load`, async () => {
    // ICE (pulse worklet) renders are the slow ones and carry little LF energy → shorter window;
    // the turbine / ion / EV graphs are cheap but have slow LF swells → longer DC window.
    const ice = scenes.SCENE_ENGINE_SPECS.find((s) => s.sceneId === id).kind === 'ice';
    for (const [name, prof] of Object.entries(PROFILES)) {
      const buf = await renderLive(`revforge-${id}`, () => prof, ice ? 2.5 : 5, { seed: `scene-${id}-${name}` });
      const chans = channels(buf, Math.floor(buf.sampleRate * 1));
      let peak = 0;
      let sum = 0;
      let sq = 0;
      let n = 0;
      for (const c of chans) {
        for (const v of c) {
          assert.ok(Number.isFinite(v), `${id}/${name}: non-finite sample`);
          peak = Math.max(peak, Math.abs(v));
          sum += v;
          sq += v * v;
          n++;
        }
      }
      const rms = Math.sqrt(sq / n);
      const mean = sum / n;
      assert.ok(rms > 1e-3, `${id}/${name}: silent (rms ${rms})`);
      assert.ok(peak < 0.98, `${id}/${name}: clipping (peak ${peak})`);
      assert.ok(Math.abs(mean) < Math.max(5e-4, rms * 0.05), `${id}/${name}: DC ${mean} vs rms ${rms}`);
    }
  });
}
