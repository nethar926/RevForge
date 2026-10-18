# Beat Box ICE voices (audio)

Six original, fully procedural ICE engine voices for RevForge, plus `np-original` (Night Pursuit's existing V8), all switchable live with `setEngine`. There are no samples, recordings, wavetables, convolution or storage: every Beat Box sound is computed per sample from the crank angle inside one AudioWorklet (`src/audio/beatbox/beatbox-processor.js`); `np-original` is Night Pursuit's procedural pulse-engine voice. The engines are modelled from engine acoustics only. No third-party audio, app or asset was used, inspected or measured.

Code: `src/audio/beatbox/` (`index.ts` API, `engines.ts` catalogue + voice specs, `testDrive.ts` sim, `beatbox-processor.js` worklet, `npOriginal.ts` Night Pursuit adapter, `voice.ts` internal voice contract). Tests: `tests/beatbox.test.mjs`, `tests/beatbox-swap.test.mjs`. Offline demo renderer: `tests/beatbox-render.mjs`.

## Engines (`BEATBOX_ENGINES`)

| id | name | cyl | firing order / crank | idle | redline | limiter |
|---|---|---|---|---|---|---|
| `crossplane-v8` | Cross-plane V8 | 8 | 1-8-4-3-6-5-7-2, 90° cross-plane, odd = left bank (per-bank 270/180/90/180) | 720 | 6400 | 6600 |
| `flatplane-v8` | Flat-plane V8 | 8 | 1-5-3-7-4-8-2-6, banks alternate every 90° | 950 | 9000 | 9200 |
| `turbo-i6` | Turbo Inline-6 | 6 | 1-5-3-6-2-4, 120°, twin-scroll pairs | 780 | 7200 | 7400 |
| `flat6-boxer` | Flat-6 Boxer | 6 | 1-6-2-4-3-5, 120°, banks alternate | 880 | 8800 | 9000 |
| `v12-gt` | V12 Grand Tourer | 12 | 1-7-5-11-3-9-6-12-2-8-4-10, 60° | 800 | 8400 | 8600 |
| `twin-rotor` | Twin-Rotor Rotary | 2 rotors | one chamber fire per rotor per eccentric-shaft turn, rotors 180° apart | 1000 | 9000 | 9300 |
| `np-original` | Original | 8 | Night Pursuit's own cross-plane big-block (pulse-engine family 1), 4-speed automatic hints | 660 | 5100 | 5200 |

`np-original` is not a Beat Box spec. It is Night Pursuit's existing V8 voice (commit 9841edc) played through an adapter (`npOriginal.ts`, see [Runtime engine swap](#runtime-engine-swap-setengine)), so its entry has `backend: 'np-pulse'` and no `voice`. The six Beat Box entries have `voice` and no `backend` (= `'beatbox'`).

`BEATBOX_DEFAULT_ENGINE_ID = 'crossplane-v8'` and `BEATBOX_FALLBACK_ENGINE_ID = 'turbo-i6'` are generic suggestions (first engine, and a backup if a build fails). They are not a pack mapping; the frontend decides which pack starts on which engine.

Each entry: `{ id, name, description, cylinders, layout, firingOrder, idleRpm, redline, limiterRpm, gears, backend?, voice? }`. `voice` is the worklet spec (firing table, pulse shape, pipes, resonances, intake, mechanics, turbo, level trim). Reuse it for car themes by copying an entry and changing the spec.

## API (`src/audio/beatbox/index.ts`)

```ts
import { BEATBOX_ENGINES, createBeatboxEngine, createTestDrive } from './audio/beatbox/index.ts';
const eng = await createBeatboxEngine(ctx, ctx.destination, 'crossplane-v8', { drive: 0.7, tone: 0.5, pops: 0.6 });
eng.start();
const td = createTestDrive({ engine: 'crossplane-v8', drive: 0.7 });
// per frame:
td.gas(gasDown); td.brake(brakeDown);
const s = td.tick(dt);                      // { rpm, throttle, gear, speed, shifting, limiter }
eng.update({ rpm: s.rpm, throttle: s.throttle, speed: s.speed });
```

| call | range | default | meaning |
|---|---|---|---|
| `createBeatboxEngine(ctx, destination, id, opts?)` | → `Promise<BeatboxEngine>` | | Loads the worklet once per context (`loadBeatboxWorklet`, or the pulse worklet for `np-original`), builds the voice, connects it to `destination`. It is silent until `start()`. `opts`: `drive`, `tone`, `pops`, `volumeDb`, `seed`, `workletUrl`, `npWorkletUrl`. |
| `setEngine(id, { crossfadeMs }?)` | crossfadeMs 0–2000 | 300 | Live engine swap with an equal-power crossfade on the same `output`. See below. |
| `update({ rpm, throttle, speed }, when?)` | rpm 0–12000, throttle 0–1, speed km/h 0–400 | | Live state. Call it every frame; the worklet smooths everything per sample (~12 ms), so you get no zipper noise. `speed` < ~8 km/h tells the turbo there is no road load. `when` = context time for offline scheduling. `setRpm` / `setThrottle` are shorthands. |
| `setDrive(x)` | 0–1 | 0.7 | Overall drive: loudness (−9 dB at 0 to 0 dB at 1) plus how hard and raspy it sounds under load (saturation, rasp, intake). The test-drive helper also uses `drive` for pedal eagerness and shift rpm. |
| `setTone(x)` | 0–1 | 0.5 | Smooth and muffled (0) to raw, lumpy and open (1): cylinder imbalance and cycle jitter, cam lope, exhaust pipe resonance, muffler opening and intake growl. Tuned per engine through the spec. |
| `setPops(x)` | 0–1 | 0 | Overrun pops and bangs after a genuine lift at revs (above roughly idle + 38 % of range, min 2600 rpm). Scales both rate (about 1.5–10 per second plus small crackles) and level. 0 = none, ever. Pops stay separate from tone. |
| `setVolume(db)` | −60 to +6 dB | 0 | Output gain stage (30 ms glide). |
| `start(when?)` / `stop(when?)` | | | 150 ms fade in / 250 ms fade out (the voice keeps running silently after stop). |
| `dispose()` | | | Disconnect and free every node (including a voice that is still fading out). |

Output safety (always on): zero-area blowdown pulses (no DC at the source), a 28 Hz second-order high-pass (DC guard and speaker protection), and a 1.5 ms look-ahead peak limiter at −1 dBFS with a soft safety clip above it. Levels are trimmed so the six engines sit within about 1.5 dB of each other at the same drive (about −19 LUFS at drive 0.7 on a scripted run).

UI labels are configurable. The API names (drive, tone, pops) are code names only. On-screen labels are for the UI owner and Wilson to decide.

## Runtime engine swap (`setEngine`)

```ts
setEngine(id: BeatboxEngineId, opts?: { crossfadeMs?: number }): Promise<void>
```

- Builds a new voice for `id`, warm-started with the live rpm, throttle, speed, drive, tone, pops and running state (start/stop), so it is at speed on its first sample. Seed policy carries over: with `opts.seed` at create time every new voice uses that seed (deterministic renders); without it each voice gets a fresh random seed.
- Equal-power crossfade (old gain cos, new gain sin, Σ gain² = 1) on the same `output` node. The default is 300 ms. `crossfadeMs` is clamped to 0–2000; below 5 ms a 5 ms de-click fade is used, so 0 means "as fast as possible" and never a hard cut.
- `id` and `info` switch to the new engine when the swap starts. The promise resolves once the new voice is playing and the fade is scheduled, not when the fade ends.
- The old voice is disconnected and freed when its fade ends (an audio-clock timer, so it works in realtime and offline contexts and pauses with a suspended context).
- Same id as the current engine: no-op (it also cancels a swap that is still pending). Unknown id: the promise rejects with `unknown Beat Box engine: <id>` and the current voice keeps playing.
- Rapid calls: the last call wins. Calls in the same tick that are superseded before their worklet is ready build nothing. A call that lands mid-fade fades every live voice out from where it is. Each fade-out is a fresh gain stage multiplied onto the voice, so an in-flight curve is never cancelled or re-scheduled (no jumps, no `cancelAndHoldAtTime`, which Firefox lacks), and Σ gain² stays 1. No nodes leak: each superseded voice is freed when its first fade-out reaches 0.
- Measured (offline, 2500 rpm, 30 % throttle, 300 ms, `tests/beatbox-swap.test.mjs`): the largest sample-to-sample step in the crossfade window stays within the steady level of the two engines, the 20 ms RMS stays flat, and the output stays finite. The peak can rise briefly mid-fade (up to the equal-power envelope √(a² + b²) of the two steady peaks) because two uncorrelated voices are summed at 0.71 each. That is a crest, not a click.
- `update`, `setDrive`, `setTone`, `setPops`, `start` and `stop` reach every live voice, including one that is fading out.
- Offline scripts that schedule `update(state, when)` far ahead: a voice built by a later `setEngine` starts at the latest values given to `update` (even ones scheduled for later) and only gets updates made after it exists. Swap from a `ctx.suspend(t)` callback and keep feeding updates after it, as `tests/beatbox-swap.test.mjs` does. Realtime per-frame use is unaffected.

### `np-original` (Night Pursuit's V8 as a Beat Box voice)

`src/audio/beatbox/npOriginal.ts` is an adapter, not a copy. It runs the same pieces EngineSynthImpl's Night Pursuit path runs: the shared `pulse-engine-processor` worklet, `nightPursuitVoice.js` (`stepNightPursuitDrive`, `nightPursuitWorkletTargets`, `NightPursuitBus` post chain), `NIGHT_PURSUIT_DEFAULTS`, and the master → limiter stage. It does not wrap `EngineSynthImpl` itself, because that class reads browser storage, needs a realtime `AudioContext` and owns its own output. Mapping:

| Beat Box | Night Pursuit |
|---|---|
| `rpm` | drive-contract `rpm` (absolute rpm wins, so the NP gearbox model is bypassed) |
| `throttle` | `throttle`, and `load` = throttle |
| `speed` (km/h) | normalized `speed` (1 = 120 mph) |
| `drive` | output level, −9 dB to 0 dB like the Beat Box voices (0.7 ≈ NP's own level, trimmed −0.7 dB to sit with the others), then a soft safety clip that never passes 0.9 |
| `tone` | `camLope` = 0.82 × (0.5 + tone), `roughness` = 0.58 × (0.7 + 0.6 × tone) (0.5 = NP defaults) |
| `pops` | `overrunBurble` = pops, worklet `crackle` = 0.5 × pops (0.6 = NP defaults; 0 = no afterfire) |

Offline renders that schedule `update(state, when)` ahead run the bus morph at a faked `currentTime` with the module's piecewise-linear offline scheduling, at most every 40 ms, the same way `scripts/night-pursuit-render.mjs` does. The pulse worklet uses `Math.random`, so `seed` does not make `np-original` deterministic.

### Frontend wiring (Night Pursuit pack, any pack)

Create the engine once with the pack's default, call `setEngine` when the picker changes, and persist the choice per pack in the frontend. The audio layer never touches localStorage, sessionStorage or IndexedDB.

```ts
import { BEATBOX_ENGINES, BEATBOX_FALLBACK_ENGINE_ID, createBeatboxEngine, getBeatboxEngine, type BeatboxEngineId } from '../audio/beatbox/index.ts';

// frontend-owned: pack default + persisted choice
const saved = prefs.get(`beatbox-engine:${pack.id}`);              // your own prefs layer
const first = (getBeatboxEngine(saved ?? '')?.id ?? pack.defaultEngine) as BeatboxEngineId; // e.g. 'crossplane-v8'
const eng = await createBeatboxEngine(ctx, bus, first).catch(() => createBeatboxEngine(ctx, bus, BEATBOX_FALLBACK_ENGINE_ID));
eng.start();

// picker: BEATBOX_ENGINES.map((e) => ({ value: e.id, label: e.name }))  → includes 'np-original' ("Original")
async function onPick(id: BeatboxEngineId) {
  await eng.setEngine(id);                                           // ~300 ms crossfade, keeps driving
  prefs.set(`beatbox-engine:${pack.id}`, id);                        // frontend persists per pack
}
// per frame, whatever engine is active: eng.update({ rpm, throttle, speed });
```

## Test drive (`createTestDrive(opts)`)

Pure TS with no DOM and no storage. Options: `engine` (id or info), or `idleRpm`, `redline`, `limiterRpm`, `gears`; plus `drive` (0–1, default 0.7). Methods: `gas(bool)`, `brake(bool)`, `setDrive(x)`, `tick(dt) → { rpm, throttle, gear, speed (km/h), shifting, limiter }`, `state`, `reset()`. `gear 0` = neutral.

- Idle: idle rpm with a slow wander of about ±30 rpm.
- Launch: clutch slip holds the revs up until the wheels catch up.
- Upshift at `redline × (0.62 + 0.33·drive)`: 80–150 ms fuel cut (throttle 0, which is a dip, not a click), then rpm glides down by the ratio step (about 1,300–1,800 rpm here).
- Lift: overrun (throttle 0, same gear, slow coast), so the pop gate fires on this.
- Brake: holds the gear while the rpm falls with speed, steps down near the bottom of the range with a short rev-match blip, then goes to neutral at a stop and settles to idle.
- Standing with the brake held: neutral, so gas free-revs (blips).
- Limiter: fuel-cut bounce only at `limiterRpm` (free-revving or at the cap).

## How the voice works (acoustics)

- Crank: θ over the 720° cycle advances at rpm·6 per second. Events come from the real firing table: exhaust blowdown, intake opening, valve ticks. Idle hunt and big-cam lope (rpm and amplitude) fade out with revs and load.
- Blowdown pulse per cylinder: an alpha-function lobe minus an equal-area rarefaction lobe. The rise is set by crank angle and clamped to gas-dynamic limits (rotary: very short, peripheral port). On top come turbulent rasp noise, a fixed per-cylinder imbalance, cycle-to-cycle amplitude and timing jitter, and the cylinder's primary-pipe delay to the collector (unequal log manifolds on the cross-plane give the uneven arrival that makes the burble).
- Exhaust: two bank pipes (L/R with H-pipe crossfeed), each a damped waveguide loop with a negative open-end reflection (quarter-wave modes, fixed while rpm sweeps), a tail/muffler loop, fixed shell modes, load-driven soft saturation, a muffler low-pass that opens with load, rpm and tone, a rasp band, and tailpipe radiation high-pass. The flat-6 also gets thin-wall metallic ringing modes.
- Load timbre: combustion follows the pedal (25 ms) and timbre follows smoothed load (60 ms attack, 220 ms release). Closed throttle above idle is fuel-cut overrun: weak, irregular pumping pulses plus gas rush.
- Engine-order body: low-passed partials phase-locked to θ (main order N/2 plus half and multiple orders), scaled by the real pulse envelope, so lope and cuts move it too. This gives the low end on cabin speakers.
- Intake: per-cylinder sin² breath over about 220° times band noise, plus airbox honk and growl. It grows with throttle² and tone.
- Mechanics: valvetrain pings, timing-drive whir, bay noise.
- Turbo (I6): boost with spool lag (and little boost when standing still), shaft speed driving the compressor whine (narrow-band noise plus wandering partials), intake hiss, and blow-off on a lift with boost (falling band-pass, flutter grows with tone). The turbine softens the exhaust as boost rises.
- Pops: lift-off gate with the same rules as `overrunBurst.js` (pulling ≥ 0.3, fast close, high rpm, decays with time and rpm, back on the gas ends it). A sparse Poisson clock arms afterfire on the next exhaust stroke (bank-correct), and doubles are occasionally added. Each bang (low-mid thump, brief snap, short pipe ring) bypasses the muffler.
- Cabin: a gentle top roll-off plus a 55–75 Hz body boom.

## v2 changes (after listening feedback)

- Cross-plane V8 reworked to read tight and dry instead of wet. It now uses short `k2` blowdown lobes with a narrow rarefaction, gas noise high-passed at 700 Hz before the pipes (`pulse.noiseHpHz`), short low-feedback pipes (no 12.5 ms tail loop and its 40 Hz mode), damped 110/200 Hz resonances plus an 1.8 kHz bite mode, harder saturation, a firmer cam lope, an 80 Hz cabin boom instead of 55 Hz, a 32 Hz output high-pass (`hpHz`) and drier reflections (`refl`). New optional spec fields default to the previous behaviour, so the other engines are unchanged by this commit.
- Pops v2 (all engines): afterfire is now sparse, single band-limited bangs instead of a crackle. Each bang is a damped low-mid thump (a sine falling from 110–280 Hz toward 70 Hz, ~9 ms decay), a ~2 ms band-passed snap (1.2–4 kHz) and a short ring at the pipe's third quarter-wave mode. The dense micro-crackle layer is gone, the pop clock is slower (about 1–4 per second at most), doubles are rarer, and the in-pipe gas noise of a pop is short. The limiter attack is now 0.25 ms (inside the 1.5 ms look-ahead), so sharp bangs stay under −1 dBFS. Pops 0 is still silent.
- Flat-6 v2: the primaries are equal length (the old 0–0.8 ms per-cylinder spread made a lopsided once-per-cycle beat that reached +5 dB over the firing line at 6000 rpm). Cam lope is off, imbalance is halved, pipe and tail feedback are lowered (0.74/0.55 to 0.5/0.35, so the comb ring is about half as long), modes and metal rings have lower Q, and bank B's detune is scaled to 0.3 (`bankDetune`), which cuts L/R beating between the high-Q modes.
- Twin-rotor v2: the primaries are equal (rotor 2 was 0.25 ms late), so the two rotors' pulses are evenly spaced, 2 per eccentric-shaft turn. The brap now fades out over 1,200 rpm above idle (`brapRpm`, default 2600), so it stays a brappy idle and low-rpm tip-in but no longer wobbles at cruise. Amplitude jitter is lower, pipe feedback and H-pipe crossfeed are lower and the bank pipes are near-equal (3.1/3.3 to 3.2/3.25 ms; two different combs summed made a flange-like ripple as harmonics swept through it), bank detune is 0.3 and the reflections are drier.

## Demos

Run `node tests/beatbox-render.mjs <id|all> [outDir] [--scene drive|crackle-off|crackle-full]`. It writes 16-bit WAVs matched to −16 LUFS with a −1.2 dBFS peak ceiling. The MP3s are on the `demos-beatbox` branch.
