# Chrono Coupe: rear-mounted 90° V6 voice

The Chrono Coupe now has its own engine voice. It is a dedicated AudioWorklet,
`src/audio/worklets/chrono-v6-processor.js`, driven from `src/audio/chronoV6Voice.js`. It replaces
the shared pulse worklet's odd-fire family for this pack. Night Pursuit and every other pack are
unchanged. Everything is synthesized procedurally, per sample: there are no samples, loops,
wavetables or convolution, and the only audio file is the offline-rendered preview
`public/snippets/chrono-coupe.wav`.

## The engine

| | |
|---|---|
| Layout | 90° V6, rear-mounted, odd-fire: crank intervals alternate **150° / 90°** (firing angles 0, 150, 240, 390, 480, 630° over the 720° cycle) |
| Character | lumpy and off-beat at idle, raspy but thin under load (modest low pipe mode, strong mid mode, rasp band 1.6–2.8 kHz, soft-clipped pulses) |
| Placement | intake breath, airbox honk, valvetrain ticks, cam-chain whir and engine-bay clatter are close (the engine sits right behind the cabin); the exhaust is behind, so it is darker |
| Banks | odd and even cylinders feed two unequal pipes (2.6 / 3.4 ms combs), which gives the rasp and the uneven beat |
| Idle | per-cylinder imbalance (fixed per seed), cycle-to-cycle variation, slow ±1.5 % hunt, light compression lump |
| Pops | sparse afterfire only while the shared lift-off gate (`overrunBurst.js`) is open: roughly 5/s at most, released on the next exhaust stroke. Never at steady speed, low-rpm coast or idle |

### Crank model (worklet)
θ advances by `rpm·6/sr` degrees per sample. Compression torque slows the crank just before each
TDC and speeds it up just after. The effect is strong while cranking or running down and faint at
idle, so both the starter rhythm and the run-down carry the 150/90 lope. Events are read from a
sorted crank-angle table:

| Event | Sound |
|---|---|
| firing TDC | exhaust blowdown pulse (alpha-shaped, width shrinks with rpm and throttle) plus rasp noise, sent to its bank pipe. With no combustion it becomes a dark air chuff |
| intake opening | sin² induction breath over about 200° of crank, band noise plus a 200–270 Hz airbox honk |
| valve closing | small valvetrain tick: 3-sample excitation into two resonators at 3.1 and 5.3 kHz |

Continuous layers: cam-chain whir that tracks rpm, engine-bay clatter that breathes with the crank,
and the starter motor. While the starter is in mesh, its armature speed follows the crank
(including the compression dips); when it is released, the armature spins down. Edge-triggered
layers: the solenoid clunk as the pinion meshes, the end-of-run-down rock, the settle sigh, and faint cooling
ticks. All parameters are k-rate and smoothed per sample. The PRNG is seeded through
`processorOptions.seed`, which comes from the main thread's `Math.random`, so offline renders are
deterministic.

## Startup and shutdown are played by the engine
Both cues automate the worklet's own crank (`rpm`, `fire`, `comp`, `starter`, `throttle`) along
plans built at 20 ms steps:

* **Startup** (`v6StartupAt`, 2.1 s). Solenoid clunk, then about 0.8 s of odd-fire cranking at
  225–245 rpm with no combustion. You hear compression chuffs in the 150/90 rhythm and the starter
  whine dips on each compression. First fires catch with misfires, the engine flares to about
  1850 rpm, the starter releases and spins down, and the revs settle with a small undershoot
  to the uneven idle. This is distinct from Night Pursuit's starter.
* **Shutdown** (`v6ShutdownAt`, about 2.6 s). The fuel cut leaves a few weakening fires
  (0.16 s), then the run-down falls from the current rpm to 0 in 1.35–1.6 s. As the revs drop,
  the air chuffs and compression lope become individually audible. It ends with a rock or
  shudder (34 Hz mount thump plus a small rattle), a short settle sigh, and two or three faint
  cooling ticks.
* **Never blocks controls.** A throttle press above 0.15 during either cue, or while start() is
  waiting for the key, cancels the plan and glides every parameter to the live targets
  (τ 0.1 s, settled in about 300 ms). The starter releases.
* **start() with no key.** This covers resume, layer engines and pack switches. After 0.4 s
  (`v6KeyWait`) the engine simply runs.
* `stop()` after `playShutoff()` keeps the output open until the run-down, rock and settle have
  finished, then fades in 50 ms. The generic lifecycle sweep is off for this pack
  (`lifecycleSounds: 0`, the same pattern Stellar Helm uses).
* The breath layers in the Chrono Coupe chain (wheeze, injection hiss) are gated by combustion,
  so they are silent while cranking and after key-off.

## Wiring
* `EngineSynthImpl.ensurePulseWorklet()` loads the V6 module for the Chrono Coupe topology
  (`new URL('./worklets/chrono-v6-processor.js', import.meta.url)`, which Vite emits as an asset),
  creates the node into `ChronoCoupeBus.input`, and switches the chain to V6 tone mapping (open
  tone, thinner shelf). If the module fails to load, the previous voice is used: pulse worklet
  family 5 with the old cues.
* Live targets: `chronoV6Targets(params, ccDrive, throttleLag, load)`. The rpm comes from the
  Chrono Coupe drive model (Frontend `rpm` / `rpmNorm` win), overrun comes from the lift-off gate,
  and `level` is the loudness calibration below.
* New pack params: `v6Rasp` 0.55, `v6Lump` 0.6, `v6Level` 1, `v6KeyWait` (seconds, default 0.4).
* No storage access anywhere in the voice.

## Measurements (`scripts/live-render.mjs`, shipped graph, seeded, settled 2–6 s)

| State | previous voice (pulse family 5) | V6 | Δ |
|---|---|---|---|
| idle | -30.51 LUFS | -30.64 LUFS | -0.13 dB |
| cruise (speed 0.5, throttle 0.35) | -19.85 LUFS | -20.15 LUFS | -0.30 dB |
| full (speed 0.9, throttle 1) | -11.19 LUFS | -11.69 LUFS | -0.50 dB |

| Cue (app call order, through the HIG master bus) | loudest 400 ms vs idle |
|---|---|
| V6 startup | +3.5 dB (previous: +7.7 dB) |
| V6 shutdown | -3.9 dB (previous: +7.7 dB) |

* Pops (`node scripts/ice-pops.mjs chrono-v6`) for steady 3k / low-rpm coast / idle / lift-off:
  **0 / 0 / 0 / 3**.
* Nodes created by the engine (build + start + 2 s idle): **222** (previous voice: 240). The V6 is
  one worklet node in place of the pulse node; the old idle chuff and generic sweep are gone.
* Worklet cost is about the same as the pulse worklet: 20 s at 48 kHz renders in about 0.6 s
  wall time on this box for each.
* Preview: `public/snippets/chrono-coupe.wav`, rendered by `node scripts/render-snippets.mjs
  chrono-coupe` from the shipped graph with seed `chrono-v6-preview` (byte-identical across runs).
  It covers key, cranking, catch, idle, pull-away with charge, discharge and lift-off, 6.4 s at
  **-22.10 LUFS** integrated. The preview trim table is regenerated.

## Tests
`tests/chrono-v6.test.mjs` covers:

* 150°/90° alternating firing intervals, measured from a worklet render
* the startup and shutdown plans
* the shipped engine using the V6, silent until the key, and running without one
* throttle take-over within about 300 ms
* the shutdown held to its end and never above idle +6 dB
* loudness within ±1 dB of the previous voice
* no pops at steady speed or idle
* procedural and storage-free sources
