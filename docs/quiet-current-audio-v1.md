# Quiet Current: audio v1 (Audio Synth)

Experimental EV pack voice. It's a subtle, refined electric-motor voice that is quiet by default, plus a **Cyber** variant: the same voice, brighter and more metallic. Everything is original procedural Web Audio synthesis. There are no samples, loops, or decoded or fetched audio. The only audio files are the two offline-rendered preview WAVs.

- **Identity:** `QUIET_CURRENT = { id: 'quiet-current', displayName: 'Quiet Current' }` in `src/audio/quietCurrentPack.ts`. To rename, edit that one constant. Every other module derives from it. Only the preview WAVs, this page and the test file name carry the id literally.
- **Patch:** kind `'ev-whine'`, topology `QUIET_CURRENT.id`, tags include `experimental`.
- **Voice:** `src/audio/quietCurrentVoice.js` (+ `.d.ts`). This is shared by `EngineSynthImpl` (browser) and `scripts/quiet-current-render.mjs` (offline), so previews and QA run the same code as the app.

## Layers

All layers are continuous and smoothed. There are no switches or cliffs.

| Layer | What it does |
| --- | --- |
| Motor orders | Three sine partials (1×, 2×, 3×) tracking motor speed: f0 = 150 → 1400 Hz over motor-norm 0 → 1. They are quiet at rest and grow with speed. |
| Inverter tone | Soft triangle → band-pass, pitch 560 Hz · 2^(2.6·m) (≈ 560 Hz → 3.4 kHz), rising smoothly with speed. Below about 25 % speed it glides through **gentle switching-carrier steps** (step width 0.044 motor-norm, each step glides over about 70 ms, with hysteresis so a held speed never flutters). The steps fade out by about 26 %. |
| PWM shimmer | Faint band-limited noise (random-PWM spread) plus carrier ± 2·f_e sidebands around 7.6 kHz (Cyber 8.2 kHz). Measured at **−32 dB** vs the main partial at cruise (Cyber −27 dB). |
| Warm hum | Sine plus triangle at 46 → 236 Hz → LP 420 Hz. Kept low. |
| Gear mesh | One light inharmonic partial (2.37 × f0). Faint at low speed and fades in above about 55 % speed. |
| Low-speed hum | A soft fifth (210 / 315 Hz) that fades out by **30 km/h**. |
| Road / tyre | Pink noise → LP (220 → 920 Hz) plus a tyre band (700 → 1200 Hz), growing with speed. |
| Wind | Pink noise → BP (650 → 2150 Hz), growing with speed². |
| Throttle | Adds presence: motor-order level, upper partials, tone opening, a little body. |
| Regen | On lift-off while rolling, or when Frontend sends `overrun: true` or negative `load`. It's a **slightly lower (≈ −6.6 %), softer partial set with a gentle downward glide** (≈ 0.45 s) and a darker tone. |
| Reverse | Soft, lower tone (−16 % pitch, darker, quieter, no mesh). |
| Output | Own compressor (−26 dB, 3:1, soft knee) → LP 9.5 kHz ×2 → engine master / limiter → CharacterEngine EV acoustic LP. Nothing piercing above 10 kHz. |

**Cyber** (`params.cyber` 0..1; crossfades over about 0.35 s):
- Brighter inverter partials: a band-passed saw partial at 3 × the inverter tone, a higher band-pass Q, and 4th / 6th motor orders.
- A slightly ringing **chamfered-steel resonance**: three narrow peaking modes at 1.48, 3.39 and 6.12 kHz (Q 16 / 21 / 26), up to about +5 dB at default `steelRing`.
- A tighter, more angular response: all drive lags are 40 % shorter and the throttle-presence curve is straighter.
- Level is trimmed 12 % so that brightness doesn't turn into loudness.

**Boost** (`setPursuitBoost(amount)`): sport-style presence. It adds a 2nd-order partial and opens the tone. At boost 1 it's ≈ +2.7 dB (measured at speed 0.5 / throttle 0.4).

## Hooks

The hooks exist on both `CharacterEngine` (wrapper) and `EngineSynthImpl`. They're optional on `EngineSynth` and safe when inactive.

```ts
getEnvelope(): number                 // 0..1 post-gain loudness (0 when stopped / disposed)
getEnvelope(true): QuietCurrentEnvelope | null   // HUD power state (below); null on other packs
getPowerState(): QuietCurrentEnvelope | null     // same object
getVoiceEnvelope(): number            // alias
setPursuitBoost(amount: number): void // 0..1, clamped (NaN → 0); stored as params.pursuitBoost
setVariant(variant: 'standard' | 'cyber' | number): void
  // 'cyber' → params.cyber = 1, 'standard' → 0, number → clamped 0..1 blend.
  // Crossfades; harmless on other packs (param ignored); no-op after dispose.
```

`EngineSynth` (types.ts) gains `setVariant?(variant: QuietCurrentVariant | number): void` and `getPowerState?(): QuietCurrentEnvelope | null`.

### HUD power state (`getEnvelope(true)` / `getPowerState()`)

These fields feed the Visual Quiet Current HUD (`powerKw`, `maxPowerKw`, `maxRegenKw`, `rpm`, `redlineRpm`). They come from the **same smoothed throttle / regen / motor-speed state** that drives the inverter whine and the regen tone, so what the HUD shows and what you hear always agree.

| Field | Meaning |
| --- | --- |
| `level` | 0..1 loudness, the same as `getEnvelope()`. |
| `powerKw` | **Simulated kW-equivalent** (not real vehicle data). Positive = drive, **negative = regen** on lift-off (or `overrun` / negative `load`). Drive = maxPowerKw × smoothed throttle × min(1, (m + 0.05) / 0.35) (constant torque, then constant power) × (0.92 + 0.08 × boost). Regen = maxRegenKw × regen × min(1, m / 0.3), fading at a crawl. |
| `powerNorm` | −1..1: `powerKw / maxPowerKw` when ≥ 0, `powerKw / maxRegenKw` when < 0. Use it for a %-only HUD. |
| `maxPowerKw` | Standard 300 · Cyber 390. Blends with `cyber`. |
| `maxRegenKw` | Standard 120 · Cyber 150 (a positive number). |
| `motorRpm` | Motor-norm × redlineRpm. Map it to the HUD's `rpm`. |
| `redlineRpm` | 18000 (both variants). |

- The limits are plausible dual-motor figures. Override them with the params `maxPowerKw`, `maxRegenKw`, `redlineRpm` and `cyberMaxPowerKw`, `cyberMaxRegenKw`, `cyberRedlineRpm`.
- When stopped, `powerKw`, `powerNorm` and `motorRpm` are 0 and the limits are still reported.
- The no-argument `getEnvelope()` stays a number for every pack. This is because `src/packs/audioBridge.ts` types it as `(): number` and feeds it straight to the voice box.

The cues use the existing dispatch: `triggerUiCue('starter')` / `playStarter()` plays the **power-on** cue, a soft rising chime-tone (392→523 Hz, then 659→784 Hz, a faint octave, about 1.5 s). `triggerUiCue('shutdown')` / `playShutoff()` plays the **power-off** cue, a soft falling tone (659→330 Hz with a 5th above, about 1.1 s). Cyber adds one faint bright triangle partial. These are cues only. There are no decorative sounds while driving: the upshift bark is skipped for this voice. The pack sets `lifecycleSounds: 0` so the generic character lifecycle one-shots don't stack on top of its own cues.

Drive contract: `setDriving({ speed, throttle, load?, reverse?, overrun?, rpmNorm? })`.
- `rpmNorm`, when given, is the motor norm. Otherwise motor speed follows road speed (single-speed reduction), with a tiny parked-throttle nudge that fades out continuously by 3 % speed.
- If Frontend only calls `setDriving` on change (e.g. BuilderPage), a settle loop keeps the model gliding every 40 ms until every smoothed value reaches its target. A per-frame caller simply supersedes it.

## Measurements

Offline renders through the real voice, engine master / limiter and EV acoustic LP; mono mix, 44.1 kHz. Commands: `node scripts/quiet-current-qa.mjs`, `node scripts/render-snippets.mjs quiet-current quiet-current-cyber`.

| Case | Standard RMS / peak | Cyber RMS / peak |
| --- | --- | --- |
| Rest (parked) | −41.6 / −31.5 dB | −41.9 / −32.0 dB |
| Creep (≤ 12 %) | −32.9 / −21.9 | −31.9 / −21.4 |
| Pull-away (0 → 60 %, throttle 0.75) | −23.3 / −11.0 | −23.0 / −11.5 |
| Cruise (50 %, throttle 0.25) | −24.5 / −14.5 | −23.7 / −13.8 |
| Fast cruise (85 %) | −21.7 / −10.9 | −21.2 / −10.5 |
| Regen lift (50 → 25 %) | −26.7 / −14.4 | −26.8 / −13.8 |
| Reverse creep | −37.2 / −26.6 | −36.4 / −26.2 |
| Power-on cue | −35.3 / −21.1 | −35.3 / −20.8 |
| Power-off cue | −37.0 / −21.6 | −37.1 / −21.5 |

**Preview WAVs** (`public/snippets/quiet-current.wav`, `quiet-current-cyber.wav`; 11.8 s: rest → pull-away → cruise → regen lift → gentle re-apply):
- Standard: **−26.6 dB** RMS, peak −13.9 dB.
- Cyber: **−26.2 dB** RMS, peak −12.9 dB.
- V8 preview: −22.6 dB. So the previews sit **4.0 / 3.6 dB below** it.
- Max 20 ms RMS step inside the driving part: 2.4 / 2.7 dB (no cliffs).

**Spectra** (band energy relative to total):

| Segment | Centroid | 0–200 | 0.2–1k | 1–3k | 3–6k | 6–9.5k | > 9.5k |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Cruise std | 859 Hz | −9.4 | −1.4 | −8.1 | −23.0 | −29.2 | −51.9 |
| Cruise Cyber | 1015 Hz | −9.3 | −2.1 | −6.3 | −14.8 | −28.7 | −52.4 |
| Regen hold std | 548 Hz | −8.3 | −1.0 | −13.1 | −26.7 | −34.5 | −59.0 |
| Regen hold Cyber | 580 Hz | −7.7 | −1.2 | −11.3 | −23.2 | −33.1 | −58.2 |
| Fast cruise std | 1369 Hz | −8.4 | −9.8 | −1.6 | −12.8 | −19.0 | −35.8 |
| Fast cruise Cyber | 1620 Hz | −9.6 | −10.6 | −1.6 | −10.4 | −17.6 | −36.7 |
| Preview std | 785 Hz | −9.4 | −1.3 | −8.4 | −25.1 | −30.9 | −54.5 |
| Preview Cyber | 1003 Hz | −11.6 | −2.0 | −5.5 | −16.0 | −29.7 | −53.8 |

- Cyber at cruise is **+18 % centroid and +8 dB in 3–6 kHz for +0.8 dB loudness**: brighter, not louder.
- Regen is −6.6 % pitch at the same speed. It is softer (regen hold −28.9 dB vs cruise −24.4 dB) and darker (centroid 548 vs 859 Hz).
- The stepped carrier is visible in the drive trace: the inverter tone holds plateaus (≈ 584 → 630 → 680 → 740 → 790 Hz) up to about 20 % speed, then follows the continuous curve.

## Notes for Frontend

- **Variant toggle:** call `engine.setVariant('standard' | 'cyber')`. Persist it at `QUIET_CURRENT_VARIANT_STORAGE_KEY` (`revforge.pack.<id>.variant`, per the brief) and re-apply it after a patch load. `setParams({ cyber })` also works, and the Sound Lab `Cyber` slider blends it.
- **Previews:** `SNIPPET_BY_ID` has `[QUIET_CURRENT.id]` (standard) and `[QUIET_CURRENT_CYBER_PREVIEW_ID]` (`<id>-cyber`). The Engines card looks up `SNIPPET_BY_ID[p.id]`, so it plays the standard preview. To play the Cyber preview when the variant is Cyber, select `SNIPPET_BY_ID[QUIET_CURRENT_CYBER_PREVIEW_ID]`. No card has that id, so the entry is inert until Frontend uses it.
- **HUD power:** poll `engine.getEnvelope(true)` (or `getPowerState()`) per frame. Pass `powerKw`, `maxPowerKw`, `maxRegenKw`, `motorRpm` → `rpm`, and `redlineRpm` to the HUD, or show `powerNorm` as % only. Label it as simulated, not real vehicle data.
- **Boost:** `setPursuitBoost(1)` for the sport-style mode (0.5 for a milder step, 0 normal).
- **Regen:** sending `overrun: true` (or negative `load`) on lift-off gives the regen tone a clean cue. Lift-off while rolling engages it anyway.
- **Reverse:** send `reverse: true`.
- **Cues:** call `triggerUiCue('starter')` after start for the power-on chime, and `triggerUiCue('shutdown')` before stop for the power-off tone.
- **Don't** describe the low-speed hum as a pedestrian alert or claim any regulatory compliance in UI copy.
