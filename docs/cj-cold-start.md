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
| `setJetSystem(system, on, opts?) → boolean` | `system`: `'batt' \| 'seatbelt' \| 'apu' \| 'aircart' \| 'crossbleed' \| 'engL' \| 'engR'` + the extra systems below. **Permissive**: does exactly what it is told, in any order, no interlocks — an engine switched on with no battery / air source still starts. Returns `true` while cold start is on; `false` only when cold start is off, on another pack, or for an unknown id. A change plays the switch foley (`JET_DEFAULT_FOLEY`: toggles, engines `'hold'`); `opts.foley` picks another kind, `false` = silent (e.g. when Frontend plays its own cue). Same-value calls are silent no-ops. A manual call cancels a running auto sequence. |
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
* AIR CART (right side, external): distant diesel chug + broadband hose roar / hiss (see "Ground air cart vs APU").
* CROSSBLEED: valve thunk + air surge, then a steady rush while a source has pressure.
* Engines (independent): starter whine + start-duct air, igniter ticks and light-off thump panned ±0.5 to that engine's side, then the TF30 voice spools to idle. One engine ≈ −6 dB vs both (the dark side is missing); both = the existing full sound. Fuel cut runs down slower than the quick shutoff.
* All levels move on ramps / setTargetAtTime; every one-shot starts at 0 and ends on an exponential tail. The cold voice feeds the Tomcat headroom pad → engine master → limiter (same bus as the engine).

## Frontend notes

* **Park-only lockout and start order are Frontend concerns.** Only allow the manual sequence (and `jetAutoStart`) in Park; the audio layer never refuses a call.
* Drive the switches with `setJetSystem`, mirror state from `onJetSystemChange` / `getJetSystems`.
* Call `setJetColdStart(true)` before `start()` for a dark cockpit; calling it later keeps engines that are already running.

## Offline renders

`node tests/cj-cold-start-render.mjs <outDir> [apu|groundcart]` renders the demo timelines. node-web-audio-api's HRTF `PannerNode` (CharacterEngine `mainSpatial`) downmixes stereo to mono, unlike Chromium's; the demo / tests switch that one node to `'equalpower'` offline (a centred equal-power panner passes stereo straight through) so the engine panning is audible. Production code is unchanged.

## Extra systems (follow-up)

All permissive (`setJetSystem` returns true, any order), each with its own procedural sound:

| id | sound |
|---|---|
| `fuelPumpL` / `fuelPumpR` | boost pump motor whir + fuel flow band, on that side |
| `ignL` / `ignR` | igniter arm: relay click + exciter charging whine |
| `throttleL` / `throttleR` | `true` = idle, `false` = cutoff; detent click (heavier back to cutoff) |
| `avionics` | cooling fan air + 1.2 kHz power hum + faint inverter tone (separate from BATT) |
| `anticollision` | relay tick, then a faint flasher relay tick every 1.1 s |
| `navLights` | soft relay tick |
| `hydraulics` | valve click; pump whine + flow hiss as pressure rises once an engine runs (`hydPressure`) |
| `canopy` | kind 'hold'; `true` = closed: actuator motor ≈ 3.2 s, latch thunk (open: softer end-stop knock) |
| `oxygen` | soft regulator hiss with a slow breathing swell |
| `inertialNav` | nav platform gyro whir spinning up (≈ 6 s time constant) / down |
| `masterCaution` | momentary: original short reset tone |
| `quickStartGuard` | guard cover lift / close foley |
| `quickStart` | momentary: runs `jetQuickStart()` **only while `quickStartGuard` is open** (otherwise just the press foley) |
| `emergencyStop` | momentary: same as `jetEmergencyStop()` |

Momentary controls fire on `true`, report `{ system, on: true }` once and their state stays `false`.

**Throttle / ignition gate (permissive design note).** An engine lights only when its throttle is at
idle and its ignition is on — but those gates only engage once Frontend has used that switch
(`setJetSystem('throttleL', …)` / `('ignL', …)`). A Frontend that never wires throttles or igniters
gets the permissive start (the engine lights anyway). Throttle at cutoff while cranking: the engine
keeps motoring with no light-off until the throttle goes to idle. Throttle to cutoff on a running
engine: fuel cut (the `engL`/`engR` switch state is left as set; switch it off and on to restart).
Ignition off after light-off: the engine keeps running (no igniter ticks). The emergency stop / the
'shutdown' cue switch all powered systems off (`JET_POWERED`); throttles, canopy and guards stay put.
`jetQuickStart` also brings wired throttles to idle and wired igniters on.

`setJetSwitchSound(enabled)` / `getJetSwitchSound()` — default true. Off: `setJetSystem` plays no
switch foley (system sounds — hum, pumps, APU, chime, canopy motor — still play).

### Ground air cart vs APU

The APU is a tonal small-turbine whine. The ground air cart is deliberately untonal and external: a
distant diesel chug (pulsed low end, ≈ 10–14 Hz firing feel, low-passed) plus a loud broadband
high-pressure hose roar / hiss on the right side; hose coupling clunk + pressure spit on connect,
pressure-dump hiss then disconnect clunk on off. Crossbleed open: valve thunk and an obvious air rush
swell, then a steady rush while a source has pressure.

### Extra cues

`'detent'`, `'pamphletLift'`, `'pamphletOpen'`, `'pamphletClose'` (subtle filtered-noise paper foley
for the checklist card).

## Panel list (`getJetSystemList(variant)`)

Entries `{ id, label, group, kind, requires, side?, order, required }`; `variant` 'apu' | 'aircart'
('groundcart' accepted). `requires` is advisory only.

### 'apu'

| order | id | label | group | kind | requires (advisory) | side | required |
|---|---|---|---|---|---|---|---|
| 1 | `batt` | Battery | POWER | toggle |  |  | yes |
| 2 | `seatbelt` | Seat belt sign | SYSTEMS | toggle | batt |  |  |
| 3 | `avionics` | Avionics | POWER | toggle | batt |  |  |
| 4 | `inertialNav` | Nav platform | POWER | toggle | avionics |  |  |
| 5 | `navLights` | Position lights | LIGHTS | toggle | batt |  |  |
| 6 | `anticollision` | Beacon | LIGHTS | toggle | batt |  |  |
| 7 | `apu` | APU | POWER | toggle | batt |  | yes |
| 8 | `fuelPumpL` | L fuel pump | FUEL | toggle | batt | L | yes |
| 9 | `ignL` | L ignition | ENGINES | toggle | batt | L | yes |
| 10 | `engL` | L engine start | ENGINES | hold | batt, fuelPumpL, ignL, apu | L | yes |
| 11 | `throttleL` | L throttle idle | ENGINES | toggle | engL | L | yes |
| 12 | `fuelPumpR` | R fuel pump | FUEL | toggle | batt | R | yes |
| 13 | `ignR` | R ignition | ENGINES | toggle | batt | R | yes |
| 14 | `engR` | R engine start | ENGINES | hold | batt, fuelPumpR, ignR, apu | R | yes |
| 15 | `throttleR` | R throttle idle | ENGINES | toggle | engR | R | yes |
| 16 | `hydraulics` | Hydraulics | SYSTEMS | toggle | engL, engR |  |  |
| 17 | `canopy` | Canopy | SYSTEMS | hold | batt |  |  |
| 18 | `oxygen` | Oxygen | SYSTEMS | toggle |  |  |  |
| 19 | `masterCaution` | Caution reset | SYSTEMS | hold | batt |  |  |
| 20 | `quickStartGuard` | Quick start cover | ENGINES | guarded |  |  |  |
| 21 | `quickStart` | Quick start | ENGINES | hold | quickStartGuard |  |  |
| 22 | `emergencyStop` | Emergency stop | ENGINES | pull |  |  |  |

### 'aircart'

| order | id | label | group | kind | requires (advisory) | side | required |
|---|---|---|---|---|---|---|---|
| 1 | `batt` | Battery | POWER | toggle |  |  | yes |
| 2 | `seatbelt` | Seat belt sign | SYSTEMS | toggle | batt |  |  |
| 3 | `avionics` | Avionics | POWER | toggle | batt |  |  |
| 4 | `inertialNav` | Nav platform | POWER | toggle | avionics |  |  |
| 5 | `navLights` | Position lights | LIGHTS | toggle | batt |  |  |
| 6 | `anticollision` | Beacon | LIGHTS | toggle | batt |  |  |
| 7 | `aircart` | Ground air | POWER | toggle | batt |  | yes |
| 8 | `fuelPumpR` | R fuel pump | FUEL | toggle | batt | R | yes |
| 9 | `ignR` | R ignition | ENGINES | toggle | batt | R | yes |
| 10 | `engR` | R engine start | ENGINES | hold | batt, fuelPumpR, ignR, aircart | R | yes |
| 11 | `throttleR` | R throttle idle | ENGINES | toggle | engR | R | yes |
| 12 | `crossbleed` | Crossbleed | FUEL | toggle | engR |  | yes |
| 13 | `fuelPumpL` | L fuel pump | FUEL | toggle | batt | L | yes |
| 14 | `ignL` | L ignition | ENGINES | toggle | batt | L | yes |
| 15 | `engL` | L engine start | ENGINES | hold | batt, fuelPumpL, ignL, crossbleed | L | yes |
| 16 | `throttleL` | L throttle idle | ENGINES | toggle | engL | L | yes |
| 17 | `hydraulics` | Hydraulics | SYSTEMS | toggle | engL, engR |  |  |
| 18 | `canopy` | Canopy | SYSTEMS | hold | batt |  |  |
| 19 | `oxygen` | Oxygen | SYSTEMS | toggle |  |  |  |
| 20 | `masterCaution` | Caution reset | SYSTEMS | hold | batt |  |  |
| 21 | `quickStartGuard` | Quick start cover | ENGINES | guarded |  |  |  |
| 22 | `quickStart` | Quick start | ENGINES | hold | quickStartGuard |  |  |
| 23 | `emergencyStop` | Emergency stop | ENGINES | pull |  |  |  |

## Checklist (`getJetChecklist(variant)`)

Our own short plain-words lists (not taken from any manual).

### 'apu'

**Startup**

1. Battery on
2. Seat belt sign on
3. Avionics on, nav platform on
4. Position lights and beacon on
5. APU on, wait for steady hum
6. Left fuel pump on, left ignition on
7. Hold left engine start, throttle to idle when it turns
8. Wait for left engine idle
9. Right fuel pump on, right ignition on
10. Hold right engine start, throttle to idle when it turns
11. Wait for right engine idle
12. APU off
13. Hydraulics on, wait for pressure
14. Canopy closed, oxygen on
15. Caution reset

**Shutdown**

1. Throttles to cutoff
2. Ignition off, fuel pumps off
3. Hydraulics off, oxygen off
4. Canopy open
5. Lights off
6. Nav platform off, avionics off
7. Seat belt sign off
8. Battery off

### 'aircart'

**Startup**

1. Battery on
2. Seat belt sign on
3. Avionics on, nav platform on
4. Position lights and beacon on
5. Ground air on, wait for steady hiss
6. Right fuel pump on, right ignition on
7. Hold right engine start, throttle to idle when it turns
8. Wait for right engine idle
9. Crossbleed open
10. Left fuel pump on, left ignition on
11. Hold left engine start, throttle to idle when it turns
12. Wait for left engine idle
13. Crossbleed closed, ground air off
14. Hydraulics on, wait for pressure
15. Canopy closed, oxygen on
16. Caution reset

**Shutdown**

1. Throttles to cutoff
2. Ignition off, fuel pumps off
3. Hydraulics off, oxygen off
4. Canopy open
5. Lights off
6. Nav platform off, avionics off
7. Seat belt sign off
8. Battery off

## Flight phases, callouts and afterburner speeds

Frontend owns flight-phase detection (`regimeToAudioCalls()` on `frontend/cj-flight-phase`); the
audio layer only **consumes** its calls. Nothing here detects anything, and nothing is stored. Every
method is a safe no-op on the other packs.

| Call | What it does |
| --- | --- |
| `setFlightPhase(phase, info?)` | Takes `'TAXI' \| 'TAKEOFF_ROLL' \| 'AIRBORNE' \| 'APPROACH' \| 'ROLLOUT'` as-is (`'TOUCH_AND_GO'` is also accepted as an optional extra). `null` turns the shaping off. Unknown strings are ignored. |
| `info.gear` | `'down' \| 'up' \| 'transit'`. Only a change **into** `'up'` or `'down'` plays a sound: the gear motor followed by the uplock or down-lock thunk (about 2.6 s or 2.85 s). Nothing plays during `'transit'`, and nothing plays for the first report, which only sets the state. These are mechanical sounds, not alerts, so callout mode `'off'` leaves them on. |
| `info.launch` / `setAfterburnerLaunch(lit)` | Frontend's `afterburnerLit`. While it is true **and the burner is armed**, the afterburner is live at any speed and stages by demand as usual. When unarmed, nothing lights. |
| `playFlightCallout(id)` | Returns `'voice' \| 'tone' \| 'mechanical' \| 'suppressed'`. |
| `setCalloutMode(m)` / `getCalloutMode()` | `'voice'` (default), `'tone'` or `'off'`, or per level `{ warning, caution }`. `getCalloutMode()` returns `{ warning, caution }`; the default is `{ warning: 'voice', caution: 'tone' }`. |
| `setCautionVoice(on)` / `getCautionVoice()` | Default `false`: cautions play their tone even in `'voice'` mode. |
| `playAlertTone(level)` | `'caution'` / `'warning'` play the original tones. `'note'` is **silent** (no-op, returns `false`); the level stays in the API. |
| `getAudioSpeedConfig()` / `setAudioSpeedConfig(partial)` | `{ abEngageMph: 80, abDisengageMph: 77 }`. Disengage is kept at least 0.5 mph below engage. For the old feel, pass `{ abEngageMph: 75, abDisengageMph: 72 }` (also exported as `TC_AB_LEGACY_MPH`). |

### Callouts

| id | Level | Voice phrase | Default |
| --- | --- | --- | --- |
| `overspeedWarning` | warning | "Overspeed" | voice |
| `overspeedCaution` | caution | "Speed caution" | tone |
| `abUnarmed` | caution | "Afterburner unarmed" | tone |
| `gpsFail` | caution | "GPS signal lost" | tone |
| `gearUp` / `gearDown` | mechanical | — | gear motor + lock |
| `touchAndGo` | — | — | harmless no-op (`'suppressed'`) |

Touch-and-go, go-around and launch have **no** callout. GPS ACQ and AB LIVE are notes, so they are
silent.

* **Voice** uses the browser's `speechSynthesis` (no recorded audio): volume 0.6, pitch 0.85 (a
  little low), normal rate. If speech isn't available, it plays the tone instead.
* **Tones** are original. Caution is two soft rounded triangle pulses (880 → 698.5 Hz). Warning is
  four quicker alternating pulses (988 / 1319 Hz): more urgent, but still well under a car alert.
* **Never stacked.** A warning cancels a caution that is playing (speech is cancelled, or the tone
  fades out in about 12 ms). Any other callout that arrives while an alert is playing is dropped.
* **Per-id cooldown:** 20 s for alerts, 2 s for gear cues. A suppressed call doesn't start a cooldown.

### Thrust per phase

The phase reshapes the throttle and load that the Tomcat voice hears. Frontend's raw input is never
changed.

| Phase | Shaping |
| --- | --- |
| TAXI | Low thrust: pedal scaled into 0 – 0.36 |
| TAKEOFF_ROLL | At least MIL (0.8); more pedal still asks for burner demand |
| AIRBORNE | Cruise: 0.5 + 0.3 × pedal (MIL at full pedal) |
| APPROACH | Spool-down, capped at 0.3 |
| ROLLOUT | Idle |
| TOUCH_AND_GO (optional) | MIL with a fast re-spool (spool time at its brisk end) |

### Afterburner speeds

When armed, auto-engage is now at **≥ 80 mph**, and the burner drops out again **below 77 mph**
(previously 75 / 72). `afterburnerLit` overrides the speed gate while armed.

Note for Frontend: `src/skins/carrier-jet/model.ts` still describes the old 75 mph band. That file
is outside the audio layer, so it was left unchanged.

### Offline demo

`carrier-jet-flight-regimes.mp3` is rendered offline, and an offline render can't capture
`speechSynthesis`. So the callouts in the MP3 are the **tone** versions, rendered with
`setCalloutMode('tone')`. In the browser, the warning is spoken by default.
