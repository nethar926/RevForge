# Tomcat engine (builtin `aerospace-f14`)

A procedural twin afterburning-turbofan voice for RevForge. It is modelled on the character of the
F-14A's pair of TF30-class low-bypass turbofans: rough, with a strong low-pressure fan buzz, hot core
roar and a 5-zone afterburner. **Everything is synthesised live with Web Audio**: oscillators,
filters, gains, three fixed waveshaper curves and runtime-generated noise. No samples, recordings,
loops, wavetables or impulse responses are used. The only audio file is the offline-rendered preview
`public/snippets/aerospace-f14.wav`.

| Item | Value |
| --- | --- |
| Builtin id / topology / snippet | `aerospace-f14` / `aerospace-f14` / `aerospace-f14.wav` (unchanged keys for saved settings and migrations) |
| Display label | **Tomcat** |
| Code | `src/audio/tomcatVoice.js` (drive model, mapping, graph), `src/audio/tomcatVoice.d.ts`, `src/audio/tomcatPack.ts` (identity, defaults, slider meta) |
| Engine wiring | `EngineSynthImpl.ts` (`buildGraph`, `applyTomcatDriving`, start/shutdown, zone API), `CharacterEngine.ts` (forwarding + acoustic cutoff hint) |
| Renders / QA | `scripts/tomcat-render.mjs`, `scripts/live-engine-render.mjs` (real live chain, offline), `tests/tomcat.test.mjs` |

## Which patches use it

The voice runs for the `aerospace-f14` builtin and for any `aerospace` patch whose params contain
`tomcatVoice: 1` (*Tune This Engine* copies inherit it). Other patches on the same topology, such as
catalogue scenes that carry their own turbine voice, keep the legacy aerospace graph unchanged
(`isTomcatPatch()` in `tomcatPack.ts`).

## Signal flow

```
DrivingInput ─► stepTomcatDrive (60 Hz, JS) ─► tomcatTargets ─► TomcatVoice.update (setTargetAtTime)
                 twin N1/N2 spools, phases,                        │
                 AB zone staging, events                           ▼
  per engine (A panned left, B panned right):   whine · fan tone · buzz-saw · idle bed · core roar · starter
  shared:                                         heavy sub · rear-arc rumble · afterburner · mechanical · ram airflow
  sum ─► 2 × 25 Hz high-pass (DC + subsonic) ─► level ─► headroom pad (−4 dB) ─► engine master ─► existing limiter
      ─► CharacterEngine (acoustic LP, mix limiter, output +4 dB back)
```

The node budget is about 22 oscillators, 4 looping runtime-noise sources, about 38 biquads and 4
waveshapers (each curve is assigned once). There is no AudioWorklet, so it stays cheap in the car's
Chromium.

## Drive model (`stepTomcatDrive`)

* **Throttle → N2 target.** Ground idle is 62 % N2 and military power (100 % N2) is throttle
  **0.8** (`TC_MIL_THROTTLE`). The spool target is `(throttle / 0.8)^0.75`, plus a small ram-air
  bias from speed.
* **Inertia.** Acceleration is rate-limited and slow near idle, then quicker as the core winds up.
  Idle → 90 % mil takes about **3.4 s** at default `tcSpoolTime`. Deceleration is faster, about
  1.9 s back to near idle. N1 lags N2.
* **Twin detune.** Engine B targets N2 slightly higher (`tcDetune`, up to 0.4 %) and spools about 6 %
  slower. Both engines get a slow random wander, so their tones beat gently and the beat drifts.
* **No gears.** Carrier Jet has no gearbox. The pack flag `TOMCAT_PACK.gearless`
  (`isGearlessPatch()` in `tomcatPack.ts`) opts this pack out of every gearbox output that a car
  sim sends. Other packs are unchanged.
  * `EngineSynthImpl.setDriving` drops `rpm` / `rpmNorm`, so there is no gear-based rpm sawtooth.
  * `triggerUiCue('upshift' | 'downshift')` is a no-op: no bark, no blip, no cue.
  * `CharacterEngine` gives its wrapper layers the input without `rpm`, `rpmNorm` or `shifting`
    (`gearlessDrivingInput()`).
  * While a car sim flags `shifting` and dips the throttle it sends, the command may rise but never
    fall (no shift dip). Spool tracks throttle, plus a little ram air from speed, continuously.
  * The drive model emits no gear or shift events, and its snapshot has no gear field.
  * Tests feed a 0→150 mph six-gear sweep (rpm sawtooth, shift flags, throttle dips, up/downshift
    cues). The Tomcat output stays sample-identical to a clean sweep, while `ev-whine` still follows
    the gearbox.
* **Roughness (`tcStall`).** A hard throttle snap at high spool can, rarely, trigger a soft
  compressor-stall "chug" (a ramped low pressure pulse with a cooldown).
* **Phases.** The phases are `off → starting → run → shutdown → off`. `settled` tells the engine
  when it can stop re-stepping.

### Start sequence (gesture-only)

`start()` (called from the user's tap) or the `starter` UI cue begins the sequence. Engine A spins
up first and engine B follows **0.55 s** later. For each engine, the air-turbine starter whine rises
with N2 and the igniters tick. Light-off happens at about 16 % N2 with a ramped low "whoomp", and the
core then accelerates to idle while the starter whine fades out. The whole sequence takes about
**3.4 s** (`TC_STARTER_SECONDS`). Nothing sounds before `start()`: calling `setDriving` before the
gesture is silent, and this is tested. A plain `stop()` resets the state, so the next `start()` runs a
fresh start sequence.

### Shutdown

The `shutdown` cue cuts fuel: the afterburner de-stages through its normal sequence, combustion roar
fades and both spools run down. The audible tail is about **2.8 s** (`TC_SHUTOFF_SECONDS`). The
generic lifecycle chirps are disabled for this patch (`lifecycleSounds: 0`), because the voice is the
cue.

## Afterburner staging

**Engage by speed.** The afterburner engages at **75 mph and up** and disengages **below 72 mph**
(`TC_AB_ENGAGE_MPH`, `TC_AB_DISENGAGE_MPH`, `tomcatAbEngaged`). The 3 mph hysteresis stops it from
chattering around one speed. The speed is the normalised `setDriving` speed, where 1.0 = 120 mph
(`mphToSpeed`). So 75 mph = 120.7 km/h = 33.53 m/s = **0.625**, and 72 mph = **0.6**. The gate reads
the raw input speed, so it switches on the frame the speed crosses.

* **Not engaged:** the lit zone is 0 at any throttle or load.
* **Engaged:** zone 1 is the minimum, even with the pedal up while coasting from 90 mph. Zones 2–5
  stage by demand exactly as in the approved 5be9cc1 retune, with the same thresholds, hysteresis,
  delays and glide (table below). So the sound of each zone is unchanged.
* Engage uses the normal zone-1 ignition delay (0.15 s). At full throttle it then stages straight
  on to zone 5. Disengage de-stages top-first, as before.
* Shutdown still puts the burner out at any speed.

**Demand** is `load` from `setDriving` when it is provided and finite. Throttle is used only when
`load` is `undefined` or `null` (`tomcatAbDemand`).

| Zone | Lights at demand ≥ (while engaged) | Stays lit while demand ≥ | Intensity (`TC_AB_ZONE_LEVEL`) |
| --- | --- | --- | --- |
| 1 | engaged (≥ 75 mph) | engaged (≥ 72 mph) | 0.40 |
| 2 | 0.87 | 0.85 | 0.58 |
| 3 | 0.91 | 0.89 | 0.74 |
| 4 | 0.945 | 0.925 | 0.88 |
| 5 | 0.975 | 0.955 | 1.00 |

* Zones 2–5 sit above military power (0.8), so at mil an engaged burner holds zone 1.
* **Spool gate (zones 2–5):** above zone 1, a zone stages only while both engines are at ≥ 80 % of
  the idle→mil spool range. This is the approved hold gate, because zone 1 is already lit once
  engaged. Slamming the throttle at speed therefore holds zone 1 while the spools wind up, then
  stages on.
* **Per-zone light delay:** zone 1 lights **0.15 s** after demand (ignition delay). Each further zone
  follows **0.16 s** after the previous one, one zone at a time, so 0 → 5 takes **0.79 s**.
* **De-stage:** zones go out top-first, one every **0.07 s**.
* **Sound per zone:** each zone adds low-frequency roar and chest weight, not top end.
  * Zone 1 gives an ignition *whump*, a ramped low-frequency pressure pulse with no step. Each later
    zone lands a lower, heavier thump (46 → 36 Hz).
  * The roar is dark: a moving low-pass (700 → 450 Hz across the zones) feeds a fixed 1.2 kHz
    low-pass.
  * A chest-weight body band (160 → 110 Hz) sits under it.
  * A deep rumble (45–70 Hz) runs as a decorrelated stereo pair that widens with each zone, from
    ±0.25 to ±0.85 pan at zone 5.
  * Everything glides toward the zone intensity (attack τ ≈ 90 ms, release τ ≈ 160 ms), and the
    whole afterburner bus rolls with the slow random AM. There are no raw level jumps.
  * The crackle (sparse pops from thresholded noise through an odd curve) is sparser and lower
    (≈520 Hz band, ≤1.6 kHz). The nozzle hiss is only a trace.

### Zone API (for the visual skin)

The voice and the HUD read the same state, so the lights match the sound exactly.

```ts
engine.getAfterburnerZone(): number              // integer 0..5; 0 when not engaged (< 75 mph) and on non-Tomcat patches
engine.onAfterburnerZoneChange(cb: (zone: number) => void): () => void   // returns unsubscribe
```

Both methods live on `EngineSynthImpl` and are forwarded by `CharacterEngine`, which is what
`createEngineSynth` returns. They are optional on the `EngineSynth` interface.

* The subscription fires once per zone step, including every intermediate zone
  (1, 2, 3, 4, 5 … 4, 3, 2, 1, 0), even if one long frame moved several zones. It never fires the
  same zone twice in a row.
* Engaging at 75 mph fires 1 (then 2…5 as demand stages). Dropping below 72 mph fires the de-stage
  down to 0.
* It fires 0 on a plain `stop()`. `dispose()` drops all listeners. The skin reads them with `useSyncExternalStore(engine.onAfterburnerZoneChange,
engine.getAfterburnerZone)`. There is no storage of any kind.

## Layers and parameters

Each layer has an enable (0/1) and a gain (0..1). The defaults are in `TOMCAT_DEFAULTS`, and the
sliders appear in the Builder via `paramMetaForKind('aerospace', 'aerospace-f14')`.

| Layer | Params | What it is | Driven by |
| --- | --- | --- | --- |
| 1 · Idle + spool bed | `tcIdleOn`, `tcIdleGain` | band-passed airflow bed that breathes with spool rate | N2, spool rate |
| 2a · Turbine / compressor whine | `tcWhineOn`, `tcWhineGain` | three blade-pass tones on N2 (×17.6, ×35.2, ×29.3) with per-engine jitter and slow "haystack" AM; ducks up to −32 % at full spool and a further −25 % at zone 5 | N2 (pitch + level) |
| 2b · Fan buzz-saw | `tcFanOn`, `tcFanGain` | fan blade-pass tone on N1 (×22) plus N1-order saw → presence peak → rasp shaper whose drive rises above ~80 % N1; same duck as the whine | N1 |
| 3 · Thrust / core roar | `tcRoarOn`, `tcRoarGain` | deep rumble (LP 90–150 Hz), body band (BP 130–280 Hz), a small hot band (BP 650–1100 Hz) and the rear-arc rumble (LP 85 Hz), all rolled by a slow random AM (runtime random walks, ≈2.5 Hz, depth grows with thrust) | thrust ∝ spool^1.6; the low bands grow faster (× (0.47 + 0.53·spool)) |
| 4 · Afterburner | `tcAbOn`, `tcAbGain`, `tcCrackle` | dark roar (≤1.2 kHz), chest-weight body, wide stereo deep rumble, sparse low crackle, faint hiss, per-zone thumps | lit zone (above) |
| 5 · Mechanical | `tcMechOn`, `tcMechGain` | accessory gearbox hum (N2 × 0.47) and gear mesh (×10.8), N1/N2 shaft tones, idle ticks/rattles, intake rumble | N2/N1; strongest at idle, ducks with speed |
| Airflow (speed) | `tcRamOn`, `tcRamGain` | ram-air wind and buffet | speed |
| Starter | `tcStarterOn`, `tcStarterGain` | air-turbine starter whine, starter air hiss, igniter ticks | start sequence |
| Character | `tcDetune` (twin beat), `tcStall` (roughness), `tcSpoolTime` (0 brisk … 1 sluggish), `tcLevel` (0.5 = calibrated, 1 = +6 dB) | | |

The legacy aerospace sliders (`spoolPitch`, `intakeWhine`, `compressor`, `turbine`, `jetRoar`,
`afterburn`, `jetScream`, `idleSpool`, `spoolInertia`, `airframe`) still act as macro scalers. Their
`aerospace-f14` defaults map to ×1.0.

The `CharacterEngine` acoustic low-pass follows an N1-derived cutoff (`getAcousticCutoffHint`), so
the wrapper opens with the jet's spool rather than with the car's rpm.

## Levels

These are measured through the real live chain (`createEngineSynth` → `CharacterEngine` →
`EngineSynthImpl`, offline, seeded) with `node scripts/tomcat-render.mjs levels`. Integrated LUFS
(BS.1770, K-weighted, gated) and sample peak in dBFS at the car output. Cruise means 45 mph at
throttle 0.22. Military power is measured at 70 mph, below the engage speed. The AB zones are
measured at 90–100 mph.

| State | Before (e2ace06) | Tomcat 5be9cc1 | Tomcat (heavy bass) |
| --- | --- | --- | --- |
| Idle | −35.0 LUFS | −33.4 LUFS / −23.3 dBFS | −33.4 LUFS / −23.4 dBFS |
| **Cruise** | **−30.9 LUFS** | **−31.0 LUFS** / −20.5 dBFS | **−31.0 LUFS** / −20.6 dBFS |
| Mid (throttle 0.5) | | −25.7 LUFS | −25.6 LUFS / −14.0 dBFS |
| Military power (70 mph) | −16.1 LUFS | −20.9 LUFS / −8.7 dBFS | **−17.2 LUFS / −6.3 dBFS** |
| AB zone 1 | | −19.8 LUFS / −5.6 dBFS | −15.1 LUFS / −3.4 dBFS |
| AB zone 3 | | −18.7 LUFS / −5.9 dBFS | −13.4 LUFS / −2.4 dBFS |
| **AB zone 5** | −12.2 LUFS (AB clip) | −17.6 LUFS / −5.0 dBFS | **−12.4 LUFS / −1.9 dBFS** |

### Heavy bass (full power + afterburner)

Full power and the afterburner are louder, and the lift is bass. Idle, cruise and mid are unchanged.

* **Heavy sub layer** (`TC_HEAVY`, `tomcatVoice.js`): one mono layer. White noise goes through a
  30 Hz HP and a 120 Hz LP, then a soft saturator (`tomcatHeavyCurve`, odd tanh, no DC), then two
  LPs at 110 Hz (95 Hz at zone 5). The saturator makes the rumble dense, with a low crest factor, so
  it adds loudness without driving the limiters.
* **Gating:** `tomcatHeavyGate` keeps the layer shut up to spool 0.75 and fully open at military.
  The afterburner share grows with the zone level (`abSub × abLevel^1.2`). The level glides with a
  0.16 s time constant, so the engage swell spreads out instead of stepping.
* **Limiter headroom** (`TOMCAT_PACK.headroomDb` = 4, Tomcat only):
  * The voice enters the engine limiter and the mix limiter 4 dB lower. The `CharacterEngine` output
    adds the same 4 dB back, so the linear (idle / cruise / mid) gain is unchanged.
  * Sound Builder layers on the same patch are padded at the wrapper input and restored at its
    output, so their balance is unchanged.
  * Other packs get a pad of 1 and are byte-identical.
* **Output high-passes** are two cascaded 25 Hz HPs (24 dB/oct). Nothing below about 25 Hz gets
  through.

Master bus (HIG `createMasterBus`: limiter −3 dB / 20:1, −1 dBFS soft ceiling), steady states.
Columns: LUFS / true peak (4× oversampled) / RMS below 120 Hz / RMS above 2 kHz / limiter gain
reduction (all limiters, from a −12 dB `tcLevel` render).

| State | 5be9cc1 | Heavy bass |
| --- | --- | --- |
| Idle | −33.37 / −23.3 / −50.3 / −44.3 / 0 | −33.35 / −23.4 / −50.2 / −44.3 / 0 |
| Mid (40 mph, 0.5) | −25.65 / −13.9 / −33.2 / −39.7 / 0 | −25.59 / −14.0 / −33.6 / −39.7 / 0 |
| Military (70 mph, 0.8) | −20.95 / −8.7 / −26.3 / −37.5 / 0 | −17.19 / −6.3 / −19.8 / −37.5 / 0 |
| Full (70 mph, 1.0) | −17.41 / −5.8 / −22.9 / −38.5 / 0.3 (AB lit: no speed gate) | −17.45 / −5.7 / −20.3 / −37.7 / 0 (no AB) |
| AB zone 5 (100 mph) | −17.59 / −5.4 / −23.9 / −38.4 / 0.2 | **−12.46 / −1.9 / −13.8 / −38.7 / 0.6** |

* At zone 5 the afterburner sits 5.0 dB above full power without AB, so the engage is a clear jump.
* The band above 2 kHz is within 0.3 dB of 5be9cc1 at zone 5, and identical at military.
* The lift comes from below 120 Hz: +10.1 dB at zone 5 and +6.5 dB at military.

**Low-end retune.** The low-end pass kept every state within ±0.35 dB of the first Tomcat voice and
moved the energy down. Centroid and share of energy below 200 Hz, first voice → retuned:

| State | Centroid | < 200 Hz | > 1 kHz |
| --- | --- | --- | --- |
| Military power | 1255 → 337 Hz | 35 → 53 % | 31 → 5 % |
| AB zone 1 | 806 → 301 Hz | 50 → 52 % | 18 → 4 % |
| AB zone 3 | 652 → 292 Hz | 50 → 51 % | 15 → 4 % |
| AB zone 5 | 543 → 245 Hz | 54 → 57 % | 14 → 3 % |

The low-end gains are in `TC_LOW` (`tomcatVoice.js`).

* Idle, cruise and mid are matched to 5be9cc1 (±0.1 dB). Full power and the AB zones carry the
  heavy-bass lift.
* For reference, Night Pursuit's cruise is **−25.0 LUFS** on the same chain and profile, so the
  calibrated Tomcat sits about 6 dB under it, as the previous aerospace voice did. Setting
  `tcLevel` to **1.0** (+6 dB) puts Tomcat's cruise at about −24.9 LUFS, in line with Night Pursuit.
* At zone 5 the limiters barely act, about 0.6 dB of gain reduction (lowering `tcLevel` by 12 dB
  lowers the output by 11.4 dB). Full power gets none.
* The engine-level limiter ceiling (`limiterCeiling` 0.95) is untouched.
* The output passes two cascaded 25 Hz high-passes (DC and subsonic safety, 24 dB/oct). All shaper
  curves are odd-symmetric, and the transients are ramped.
* Tests assert:
  * the mean is below 0.1 % FS at cruise, mil and zone 5;
  * the zone-5 peak stays under −1 dBFS on the car output;
  * the zone-5 centroid is below 400 Hz, with more than 45 % of the energy below 200 Hz;
  * zone 5 sits at least 3 dB above full power, with more than half its energy below 120 Hz.

**No gears + afterburner at 75 mph.** The engage change itself does not touch the voice. Only the
heavy-bass lift above changes the levels.

* Comparable run: cruise 45 mph, then mil at 70 mph, then full throttle 70 → 95 mph, so the
  afterburner happens above 75 mph in both versions. Integrated loudness is −15.0 vs −19.3 LUFS
  (5be9cc1). True peak is −2.2 vs −5.6 dBFS.
* **0 → 90 mph check run** (full throttle, hold 90 mph, lift to cruise throttle, coast to 60 mph):
  * Zone 1 lights at 7.60 s (76.6 mph) and stages to zone 5 by 8.23 s.
  * The zones de-stage to 1 at the lift (12.25–12.45 s, about 88 mph).
  * The AB drops out at 16.24 s (71.7 mph).
  * Over the whole run: −16.1 LUFS, true peak −1.6 dBFS on the car output and −2.0 dBFS through the
    master bus.
* **Transitions.** On 200 ms RMS windows the engage swell rises at most +3.1 dB per 200 ms, against
  +4.9 dB for the approved zone-1 entry. The total engage swell is +5.3 dB, spread over about
  0.5 s. The disengage falls at most −6.3 dB per 200 ms, against −5.5 dB for the approved exit.
* On 50 ms windows the engage reads +6.9 dB against the approved +5.5 dB. The steady zone-5 rumble
  alone reads +7.4 dB on the same metric, because 50 ms holds only a few cycles of the sub. So that
  figure is the rumble's texture, not a step.
* The largest sample step is 0.045, against 0.085 for the approved entry, so there are no clicks.

Preview `public/snippets/aerospace-f14.wav` (7 s, rendered with `node scripts/render-snippets.mjs
aerospace-f14`) starts from settled idle. The throttle goes to full and the spools wind up while the
speed climbs to 100 mph. The afterburner engages as the speed passes 75 mph (≈ 4.0 s) and stages to
zone 5. The preview is level-matched to the previous preview's integrated loudness (−19.8 LUFS
target) with a −6.5 dBFS peak cap. It lands at −19.8 LUFS with a −8.4 dBTP true peak, because the
denser heavy-bass rumble keeps the crest factor low.

## A/B renders

Run `node scripts/tomcat-render.mjs ab <outDir> <baseRoot>`, where `baseRoot` is a checkout of the
older code (for example `git archive e2ace06`). It renders `01-idle`, `02-starter-spoolup`,
`03-turbine-whine`, `04-thrust` (mil at 70 mph), `05-afterburner-kickin` (mil at 70 mph, then full
throttle through 75 mph, then lift and coast back below 72 mph), `06-mechanical` (mechanical layer
soloed in the "after" file), and `07-full-runup` (start, idle, taxi, AB takeoff run, cruise,
throttle back, shutdown). Each pair is level-matched on cruise. Optional trailing arguments pick clips and file labels, for example `04,05,07 prev,retune`. It writes `levels.json`, plus MP3 copies when ffmpeg
is available.

Offline note: node-web-audio-api mis-renders the specific automation sequence that `stop()` runs right
after a shutdown cue. The output gain jumps to about 2·10⁴. Browsers render it correctly. The A/B
runup therefore ends on the shutdown cue without calling `stop()`.
