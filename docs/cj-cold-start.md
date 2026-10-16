# Carrier Jet (Tomcat) cold start — audio API

Opt-in cold start for the Tomcat pack (builtin id `aerospace-f14`). 100 % procedural Web Audio
(oscillators, runtime noise, biquads, gain envelopes) — no samples, loops, wavetables, IRs or
convolution. Code: `src/audio/jetColdStart.js` (systems + foley voice), per-engine model in
`src/audio/tomcatVoice.js` (`tomcatSetColdMode`, `tomcatColdEngine`), API on `EngineSynthImpl`,
forwarded by `CharacterEngine`. Types: `src/audio/types.ts` (`JetSystem`, `JetCue`, `JetSystemsState`, …).

## Defaults

* `setJetColdStart(false)` is the default. While off, nothing is built and the drive model / render
  are sample-identical to `ef4021e` (tested): `start()` and the `'starter'` / `'shutdown'` cues
  work exactly as before (quick Start).
* Start mode `'apu'`. AB arm switch untouched (`setAfterburnerArmed`, default true).
* The audio layer stores nothing — Frontend owns any preference persistence.

## API (all on the engine returned by `createEngineSynth`)

| call | notes |
|---|---|
| `setJetColdStart(on)` / `getJetColdStart()` | On: `start()` only unlocks audio, the engines stay dark until switched on. Running engines keep running when it is turned on (switches follow). Off: legacy phases take over. |
| `setJetStartMode('apu' \| 'groundcart')` / `getJetStartMode()` | Only picks which sequence `jetAutoStart()` runs. Gates nothing. |
| `setJetSystem(system, on, opts?) → boolean` | `system`: `'batt' \| 'seatbelt' \| 'apu' \| 'aircart' \| 'crossbleed' \| 'engL' \| 'engR'`. **Permissive**: does exactly what it is told, in any order, no interlocks — an engine switched on with no battery / air source still starts. Returns `true` while cold start is on; `false` only when cold start is off, on another pack, or for an unknown id. A change plays the switch foley (`JET_DEFAULT_FOLEY`: toggles, engines `'hold'`); `opts.foley` picks another kind, `false` = silent (e.g. when Frontend plays its own cue). Same-value calls are silent no-ops. A manual call cancels a running auto sequence. |
| `getJetSystems() → JetSystemsState` | switch booleans + `engines: { L, R }` (`'off' \| 'starting' \| 'run' \| 'shutdown'`), `apuSpool`, `apuReady`, `cartSpool`, `cartReady`, `autoRunning`, `emergency`, `coldStart`, `mode`. |
| `onJetSystemChange(cb) → unsubscribe` | `cb(state, change)`; `change = { system \| null, on, source }`, `source`: `'api' \| 'auto' \| 'emergency' \| 'engine' \| 'mode' \| 'stop' \| 'shutdown'`. Fires on every switch change and when an engine reaches idle / finishes its rundown (`'engine'`). |
| `jetEmergencyStop() → boolean` | PULL: handle drag + latch foley, short original warning tone (3 soft pulses), then after 0.6 s fuel cut + every switch off. Engines, APU, cart and gyro spool down naturally — no pops. |
| `jetAutoStart(mode?) → boolean` | Runs the recommended sequence (below); waits for APU / cart ready and each engine at idle. |
| `jetQuickStart() → boolean` | BATT → L ENG → R ENG straight away. |
| `playJetCue(cue, { pan?, level? }) → boolean` | One-shot foley, works with cold start on or off (Tomcat only). |

`stop()` resets every switch. The `'shutdown'` cue in cold mode = fuel cut + all switches off (no warning). The `'starter'` cue is ignored in cold mode (engines start from their switches).

### Cues (`JetCue`)

* switches: `'toggle'` (bat-handle detent snap + tiny spring ring), `'guardOpen'` (hinge + spring-loaded cover snap), `'guardClose'` (solid clack), `'hold'` (ratchety press), `'pull'` (handle drag + latch release)
* afterburner guard: `'abGuardOpen'`, `'abGuardClose'` (bigger cover variants; not tied to `setAfterburnerArmed` — Frontend plays them on the cover)
* cockpit display config menu: `'bezelPress'` (firm rubber/metal pushbutton), `'cursorStep'` (very short soft tick), `'selectConfirm'` (original low two-note acknowledge), `'pageChange'` (relay / display flip)
* `'chime'` (the seat-belt chime), `'warning'` (the emergency tone)

## Recommended sequences (`jetAutoStart`)

* `'apu'`: BATT → APU (spools ≈ 7 s) → SEAT BELT → L ENG → R ENG → APU off
* `'groundcart'`: BATT → AIR CART → SEAT BELT → R ENG (cart air) → CROSSBLEED → L ENG (bleed from the running right engine) → CROSSBLEED off → AIR CART off (disconnect clunk)

## Sounds

* BATT: contactor clunk, 400 Hz avionics hum + cooling-fan air, gyro whir spinning up (≈ 10 s) / down.
* SEAT BELT: original soft two-tone chime (rising fourth, mallet-like), once on; falling and softer once off. Well under the engine idle peak.
* APU: crank, small light-off, two blade tones + shaft + combustion band rising to a steady hum; ≈ 8 s spool-down.
* AIR CART (right side): duct hiss + cart turbine whine + low rumble; disconnect clunk on off.
* CROSSBLEED: valve thunk + air surge, then a steady rush while a source has pressure.
* Engines (independent): starter whine + start-duct air, igniter ticks and light-off thump panned ±0.5 to that engine's side, then the TF30 voice spools to idle. One engine ≈ −6 dB vs both (the dark side is missing); both = the existing full sound. Fuel cut runs down slower than the quick shutoff.
* All levels move on ramps / setTargetAtTime; every one-shot starts at 0 and ends on an exponential tail. The cold voice feeds the Tomcat headroom pad → engine master → limiter (same bus as the engine).

## Frontend notes

* **Park-only lockout and start order are Frontend concerns.** Only allow the manual sequence (and `jetAutoStart`) in Park; the audio layer never refuses a call.
* Drive the switches with `setJetSystem`, mirror state from `onJetSystemChange` / `getJetSystems`.
* Call `setJetColdStart(true)` before `start()` for a dark cockpit; calling it later keeps engines that are already running.

## Offline renders

`node tests/cj-cold-start-render.mjs <outDir> [apu|groundcart]` renders the demo timelines. node-web-audio-api's HRTF `PannerNode` (CharacterEngine `mainSpatial`) downmixes stereo to mono, unlike Chromium's; the demo / tests switch that one node to `'equalpower'` offline (a centred equal-power panner passes stereo straight through) so the engine panning is audible. Production code is unchanged.
