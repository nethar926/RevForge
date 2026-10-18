# Scene engines v1 (audio side of the Oct 18 2026 scene cleanup)

**Owner:** Dan (audio). **Branch:** `audio/dribe-cleanup`, based on origin/main `510870f` (pairs with `frontend/dribe-cleanup`).
**Module:** `src/audio/sceneEngines.ts`

The RoadView scene engine presets are now audio-owned. `BUILTIN_PATCHES` no longer spreads
`REVFORGE_PATCHES` from `src/forge/catalog.ts`. It spreads `sceneEnginePatches(defaultsForTopology)`,
which is built only from `SCENE_ENGINE_SPECS`. No audio file imports `src/forge/*` or
`revforge-packs.json` any more.

- Every scene runs on one of our own procedural engines in `EngineSynthImpl`. The patches carry
  no `revforge` voice config, so `createEngineSynth` never sends them to `RevForgeSynth`.
- Every value was set fresh (engine type kept, e.g. a V8 scene stays a V8). ICE firing schedules
  are derived by `deriveIceSchedule()` from cylinder count, firing order, displacement, plenum,
  header length, silencer volume and cam overlap:
  - collector delay = header transit time, with a longer crossover on cross-plane engines
  - manifold τ = plenum ÷ idle intake flow
  - exhaust τ = silencer ÷ hot exhaust flow
  - jitter and misfire come from firing order and cam overlap
- Display names are placeholders (`Pack 01` …). There are no taglines or blurbs. The frontend
  owns the names.
- Patch ids are `revforge-<sceneId>`. `ICE_PACK_SCHEDULES` spreads `SCENE_ICE_SCHEDULES`, keyed
  by scene id. The old per-scene tables and the special-case scene exclusion are gone from
  `engineStateBridge.ts`.

## Scene engines (scene id → engine)

| Scene | Patch id | Engine (topology) | idle / limit rpm | gears |
|---|---|---|---|---|
| copper-mile | revforge-copper-mile | cross-plane V8 (v8-rumble) | 690 / 6450 | 5 |
| ember-dusk | revforge-ember-dusk | flat-plane V8 (v8-rumble) | 960 / 8350 | 7 |
| violet-grid | revforge-violet-grid | flat-plane V8, open/resonant (v8-rumble) | 880 / 8650 | 5 |
| azure-bend | revforge-azure-bend | high-rev NA flat-plane V8 (v8-rumble) | 1020 / 9150 | 6 |
| pink-current | revforge-pink-current | big-block cross-plane V8 (v8-rumble) | 620 / 5950 | 4 |
| silver-run | revforge-silver-run | smooth flat-plane V8 (v8-rumble) | 720 / 7350 | 8 (per rename sheet) |
| lightline | revforge-lightline | dual-motor EV (ev-dual-motor) | – / 15200 | 1 |
| sandwake | revforge-sandwake | boosted cross-plane V8 (v8-rumble) | 590 / 5650 | 6 |
| frostpass | revforge-frostpass | turbo I6 (i6-silk) | 760 / 7550 | 7 |
| deep-transit | revforge-deep-transit | generic procedural turbine (aerospace-f14, not the Tomcat voice) | – / 13200 | 1 |
| blossom-run | revforge-blossom-run | twin-turbo I6 (i6-silk) | 880 / 7950 | 5 |
| trenchlight | revforge-trenchlight | procedural Twin Ion (ion-twin, no samples) | – / 10400 | 1 |
| light-grid | revforge-light-grid | inverter climb EV (ev-inverter-climb) | – / 14800 | 1 |

Retired ids are not listed here. Retired scene, engine and theme ids are migrated by the
frontend table in `src/packs/migrations.ts` (`RETIRED_SCENE_IDS`, plus the `revforge-<old>` →
`revforge-<new>` engine renames folded into `PACK_ENGINE_MIGRATIONS`). `LEGACY_PACK_IDS` /
`getBuiltin()` already spread that table, so a saved old engine id lands on the scene engine above.

## Drivetrain hints

Each scene patch carries `params.gearCount`, `params.autoShiftRpm` and `params.maxRpm`. The
frontend `drivetrainFor()` already reads these. ICE idle comes from `params.rpmIdle × 120 /
cylinders`. Final drive comes from the frontend default (3.31) because audio sets none.

## Previews

No scene engine has a `public/snippets` WAV (`SNIPPET_BY_ID` lists only topology and pack
builtins), so no snippets needed regenerating.

## Tests

- `tests/scene-engines.test.mjs` checks:
  - catalogue shape
  - no forge import and no storage
  - derived schedules match the patch params
  - drivetrain hints
  - values differ from the retired JSON (while it still has engine params)
  - retired engine ids from the frontend table land on these builtins
  - a no-scene bridge
  - live-chain renders of all 13 scenes at idle and under load (finite, peak < 0.98, |DC| < 5 % rms)
- `tests/engine-state-bridge.test.mjs` is re-keyed to the new ids.
