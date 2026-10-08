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
  shared:                                         rear-arc rumble · afterburner · mechanical · ram airflow
  sum ─► 18 Hz DC-blocking high-pass ─► level ─► engine master ─► existing limiter ─► CharacterEngine (acoustic LP, mix limiter)
```

The node budget is about 22 oscillators, 4 looping runtime-noise sources, about 34 biquads and 3
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
* **Frontend rpm / gears are ignored.** A jet has no gearbox, so shift cliffs from the car sim never
  reach the voice. During `shifting` the throttle command is held.
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

**Demand** is `load` from `setDriving` when it is provided and finite. Throttle is used only when
`load` is `undefined` or `null` (`tomcatAbDemand`). Full pedal with a low load, for example coasting,
therefore never lights the burner.

| Zone | Lights at demand ≥ | Stays lit while demand ≥ | Intensity (`TC_AB_ZONE_LEVEL`) |
| --- | --- | --- | --- |
| 1 | 0.83 | 0.81 | 0.40 |
| 2 | 0.87 | 0.85 | 0.58 |
| 3 | 0.91 | 0.89 | 0.74 |
| 4 | 0.945 | 0.925 | 0.88 |
| 5 | 0.975 | 0.955 | 1.00 |

* Every threshold sits above military power (0.8). The 0.02 hysteresis keeps zone 1 from staying lit
  at mil.
* **Spool gate:** zone 1 lights only when both engines are at ≥ 90 % of the idle→mil spool range,
  and the burner stays lit while they are at ≥ 80 %. Slamming the throttle from idle therefore spools
  first and lights after.
* **Per-zone light delay:** zone 1 lights **0.15 s** after demand (ignition delay). Each further zone
  follows **0.16 s** after the previous one, one zone at a time, so 0 → 5 takes **0.79 s**.
* **De-stage:** zones go out top-first, one every **0.07 s**.
* **Sound per zone:** zone 1 gives an ignition *whump*, a ramped low-frequency pressure pulse with no
  step. Each later zone adds a smaller thump. The roar (band-passed noise opening upward), the deep
  low end (~52–78 Hz), the crackle (sparse pops from thresholded noise through an odd curve) and the
  nozzle hiss glide toward the zone intensity (attack τ ≈ 90 ms, release τ ≈ 160 ms). There are no
  raw level jumps.

### Zone API (for the visual skin)

The voice and the HUD read the same state, so the lights match the sound exactly.

```ts
engine.getAfterburnerZone(): number              // integer 0..5, 0 = off; 0 on non-Tomcat patches
engine.onAfterburnerZoneChange(cb: (zone: number) => void): () => void   // returns unsubscribe
```

Both methods live on `EngineSynthImpl` and are forwarded by `CharacterEngine`, which is what
`createEngineSynth` returns. They are optional on the `EngineSynth` interface. The subscription fires
once per zone step, including every intermediate zone (1, 2, 3, 4, 5 … 4, 3, 2, 1, 0), even if
one long frame moved several zones. It fires 0 on a plain `stop()`. `dispose()` drops all listeners. The skin reads them with `useSyncExternalStore(engine.onAfterburnerZoneChange,
engine.getAfterburnerZone)`. There is no storage of any kind.

## Layers and parameters

Each layer has an enable (0/1) and a gain (0..1). The defaults are in `TOMCAT_DEFAULTS`, and the
sliders appear in the Builder via `paramMetaForKind('aerospace', 'aerospace-f14')`.

| Layer | Params | What it is | Driven by |
| --- | --- | --- | --- |
| 1 · Idle + spool bed | `tcIdleOn`, `tcIdleGain` | band-passed airflow bed that breathes with spool rate | N2, spool rate |
| 2a · Turbine / compressor whine | `tcWhineOn`, `tcWhineGain` | three blade-pass tones on N2 (×17.6, ×35.2, ×29.3) with per-engine jitter and slow "haystack" AM | N2 (pitch + level) |
| 2b · Fan buzz-saw | `tcFanOn`, `tcFanGain` | fan blade-pass tone on N1 (×22) plus N1-order saw → presence peak → rasp shaper whose drive rises above ~80 % N1 | N1 |
| 3 · Thrust / core roar | `tcRoarOn`, `tcRoarGain` | three shaped-noise bands (low, body, hot) plus rear-arc rumble with slow AM | thrust ∝ spool^1.6 |
| 4 · Afterburner | `tcAbOn`, `tcAbGain`, `tcCrackle` | roar, low end, crackle, nozzle hiss, whumps | lit zone (above) |
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
throttle 0.22.

| State | Before (e2ace06) | Tomcat |
| --- | --- | --- |
| Idle | −35.0 LUFS | −33.3 LUFS / −23.7 dBFS |
| **Cruise** | **−30.9 LUFS** | **−30.9 LUFS** / −21.0 dBFS (Δ +0.03 dB) |
| Mid (throttle 0.5) | | −26.3 LUFS |
| Military power | −16.1 LUFS | −20.9 LUFS / −10.1 dBFS |
| AB zone 1 | | −19.9 LUFS |
| AB zone 3 | | −18.6 LUFS |
| **AB zone 5** | −12.2 LUFS (AB clip) | **−17.6 LUFS / −5.0 dBFS** |

* Cruise is matched to the previous voice (±0.5 dB rule).
* For reference, Night Pursuit's cruise is **−25.0 LUFS** on the same chain and profile, so the
  calibrated Tomcat sits about 6 dB under it, as the previous aerospace voice did. Setting
  `tcLevel` to **1.0** (+6 dB) puts Tomcat's cruise at about −24.9 LUFS, in line with Night Pursuit.
* At zone 5 the limiters do almost nothing: lowering `tcLevel` by 12 dB lowers the output by
  11.9 dB, which is about 0.1 dB of gain reduction.
* The engine-level limiter ceiling (`limiterCeiling` 0.95) is untouched.
* The output passes an 18 Hz high-pass, all shaper curves are odd-symmetric, and the transients
  are ramped. Tests assert that the mean is below 0.1 % FS at cruise, mil and zone 5.

Preview `public/snippets/aerospace-f14.wav` (7 s, rendered with `node scripts/render-snippets.mjs
aerospace-f14`) runs from settled idle to full throttle, spool-up and zones 1–5. It is level-matched
to the previous preview's integrated loudness (−19.8 LUFS target) with a −6.5 dBFS peak cap. The peak
cap wins, so it lands at −20.1 LUFS.

## A/B renders

Run `node scripts/tomcat-render.mjs ab <outDir> <baseRoot>`, where `baseRoot` is a checkout of the
older code (for example `git archive e2ace06`). It renders `01-idle`, `02-starter-spoolup`,
`03-turbine-whine`, `04-thrust`, `05-afterburner-kickin`, `06-mechanical` (mechanical layer soloed in
the "after" file), and `07-full-runup` (start, idle, taxi, AB takeoff run, cruise, throttle back,
shutdown). Each pair is level-matched on cruise. It writes `levels.json`, plus MP3 copies when ffmpeg
is available.

Offline note: node-web-audio-api mis-renders the specific automation sequence that `stop()` runs right
after a shutdown cue. The output gain jumps to about 2·10⁴. Browsers render it correctly. The A/B
runup therefore ends on the shutdown cue without calling `stop()`.
