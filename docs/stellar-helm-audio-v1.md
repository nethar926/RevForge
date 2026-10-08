# Stellar Helm — audio engine v1 (experimental)

An original starship drive hum. It is smooth, deep and calm, and it follows speed continuously with
no cliffs. Underneath is a sub-bass bed with slow beating. On top of that sits a harmonic core tone
whose pitch and brightness rise gently with speed and throttle, plus a soft airy shimmer, and the
whole voice breathes slowly so it never sounds static. Throttle adds warmth and power, and lifting
off relaxes it. Reverse makes it lower and softer. Boost adds intensity and brightness, but only
within a few dB. It is meant to sound premium and restrained: no surprise loudness (Apple HIG,
*Playing audio*).

| | |
|---|---|
| Identity constant | `STELLAR_HELM_PACK = { id: 'stellar-helm', name: 'Stellar Helm' }` in `src/audio/stellarHelmPack.ts`. This is the single source for the builtin id, topology id, display name and the preview snippet key |
| Engine kind | `ev-whine`: a continuous electric drive with no gearbox and no worklet. For this topology the EV whine graph is **replaced** by the Stellar Helm voice |
| Status | experimental (`meta.tags` includes `experimental`; `STELLAR_HELM_EXPERIMENTAL = true`) |
| Preview | `public/snippets/stellar-helm.wav` (4.3 s: power-up → cruise rising with speed → boost), wired in `EnginesPage` `SNIPPET_BY_ID` |

## Procedural only

Every sound is synthesised at runtime from Web Audio oscillators (sine, triangle and one
`PeriodicWave` harmonic spectrum), biquads, gains and one `ConstantSourceNode`. The only
`AudioBuffer` is the engine's pink noise buffer, filled with `Math.random()` at startup the same way
every other pack does it. Nothing calls `decodeAudioData` or `fetch`, and no audio files are bundled.
The preview WAV is rendered **offline from the same code**
(`node scripts/render-snippets.mjs stellar-helm`) and is only used by the Engines page preview button.

## Graph (compact, in-car Chromium friendly)

About 10 oscillators, 1 noise source, 6 biquads and no AudioWorklet (`src/audio/stellarHelmVoice.js`):

```
bed      sine f0 · sine f0+beat · sine 2·f0−beat/2 → LP 150 Hz ──────────────┐
core     2 × harmonic PeriodicWave (±4 cents, panned ±width/2)               │
         + power partials (triangle 1.5·fc, sine 2·fc, throttle/boost only)  │
         → warmth low-shelf 170 Hz → brightness LP (breathing-modulated) ────┼→ breathe → level → power → trim → graph master → limiter
shimmer  pink noise → HP 1.8 kHz → BP (slow AM) + 2 glass sines 12·fc (0.37 Hz apart) ┘
pitch    ConstantSource (cents) → every oscillator's detune (power-up glide / power-down fall)
LFOs     breathing 0.13–0.30 Hz (level ±4.5 %, cutoff ±6.75 %) · shimmer AM 0.071 Hz · core drift 0.043 Hz (±3 cents)
```

## Parameters (`STELLAR_HELM_PARAM_META`, returned by `paramMetaForKind('ev-whine', 'stellar-helm')`)

| param | default | range | what it does |
|---|---|---|---|
| `helmSubHz` | 38 | 28–60 Hz | Bed fundamental at rest (rises +0.32 oct with speed) |
| `helmCoreHz` | 73.4 | 45–130 Hz | Core fundamental at rest |
| `helmRise` | 0.85 | 0–1.5 oct | How far the core pitch rises across the speed range |
| `helmSub` | 0.8 | 0–1 | Sub bed level |
| `helmBeat` | 0.6 | 0–1 | Beating between bed partials (0.42 Hz parked → ~1.6 Hz at speed) |
| `helmCore` | 0.7 | 0–1 | Core tone level |
| `helmBright` | 0.55 | 0–1 | How far the core low-pass opens with speed, throttle and boost |
| `helmWarmth` | 0.6 | 0–1 | Throttle warmth (low shelf up to +3.6 dB) + fifth/octave power partials |
| `helmShimmer` | 0.45 | 0–1 | Airy noise band + glass partials |
| `helmBreath` | 0.5 | 0–1 | Slow breathing depth |
| `helmReverse` | 0.7 | 0–1 | Reverse depth: −0.22 oct core, −21 % level at default |
| `pursuitBoost` | 0 | 0–1 | Boost (see hooks). Silent at 0 |

Also: `masterGain 0.72`, `stereoWidth 0.45`, `lifecycleSounds 0` (the generic lifecycle chirps are
replaced by the pack cues), `gearCount 1` and `topSpeedKph 200` (Frontend drivetrain hints:
one continuous ratio).

## Drive contract (`EngineSynth.setDriving`)

`{ speed: 0..1, throttle: 0..1, load?, reverse?, rpmNorm?, rpm? }`

* **Speed drives the hum.** The lagged speed (τ 0.9 s, which gives it a sense of mass) is shaped
  `x = s·(1.5 − 0.5·s)`. That curve has a finite slope at 0, so there is no low-speed cliff.
  Over the range, the core goes from 73 Hz to 132 Hz (+0.85 oct) and the bed from 38 Hz to 47 Hz.
* **Throttle** (+12 % of positive `load`) has an attack of τ 0.45 s and a release of τ 1.0 s, so
  lifting off relaxes it more slowly than pressing builds it. It adds core pitch (+0.12 oct), level,
  low-shelf warmth, power partials and brightness.
* **`reverse: true`** glides (τ 0.6 s) to a lower and softer hum: −0.22 oct core, −0.14 oct bed,
  −21 % level, a darker low-pass and less shimmer (at the default `helmReverse` 0.7).
* **`rpm` / `rpmNorm` are deliberately ignored**, so a gearbox simulation can never put an rpm
  cliff into the hum. `getHud().rpmNorm` reports the shaped drive amount `x`, and
  `fundamentalHz` reports the live core pitch.
* Audio params are smoothed again (`setTargetAtTime` τ 80 ms) on top of the drive lags.

## Hooks (`src/packs/audioBridge.ts` → `PackAudioHooks`)

These live on both the `CharacterEngine` wrapper returned by `getEngine()` and the base `EngineSynthImpl`:

| method | behaviour |
|---|---|
| `getEnvelope(): number` | 0..1 post-gain loudness. An analyser RMS tap maps −54…−6 dBFS to 0..1, with 25 ms attack and 180 ms release. It returns 0 after dispose and is safe before start |
| `getVoiceEnvelope(): number` | Alias of `getEnvelope()` |
| `setPursuitBoost(amount: number): void` | 0..1, clamped (non-finite → 0). Sets `pursuitBoost`. The voice glides in (τ 0.45 s) and out (τ 0.8 s), adding brightness (cutoff +600 Hz at default), shimmer, core level, +0.1 oct pitch and faster breathing. It is safe on any pack and while stopped. Suggested mode mapping: boost 1, power 0.5, normal 0 |

UI cues (`triggerUiCue`):

* `starter` / `ignition` plays an original **power-up**: a 1.9 s harmonic sweep from 26 Hz up to the
  hum's live core pitch, with an airy noise band opening upward and a faint glassy settle as it
  hands over to the hum. `start()` itself powers the hum up (level 0→1, pitch −1 oct → 0 over 1.6 s)
  instead of the generic combustion chuff. Switching to this pack while running powers the hum up
  over 1.2 s, and a starter sent after a power-down brings the hum back up.
* `shutdown` / `shutoff` plays an original **power-down**: a 2.2 s harmonic sweep falling from the live
  core pitch toward 22 Hz, a descending noise band and a soft sub tail. The hum winds down at the
  same time (pitch −1.25 oct, level → 0), and the output is held for the tail before `stop()` fades.
* `upshift` / `downshift` are silent for this pack (it has no gearbox).

## Measurements

Offline renders of the real voice through the EngineSynthImpl master and limiter
(`node scripts/stellar-helm-qa.mjs [outDir]`). RMS and peak are dBFS. "In car" adds the
CharacterEngine output stage (EV acoustic low-pass, −12 dB mix limiter, ×0.65). Bands show the
share of energy: <80 Hz / 80–250 / 250–1k / 1–4k / >4k Hz.

| case | RMS | peak | in car RMS | centroid | bands % | mod p-p (50 ms) |
|---|---|---|---|---|---|---|
| parked | −23.9 | −13.8 | −22.5 | 75 Hz | 86.7 / 11.0 / 2.1 / 0.1 / 0.0 | 5.2 dB (bed beating) |
| ~30 mph, light throttle | −22.4 | −12.2 | −21.0 | 115 Hz | 44.8 / 48.4 / 6.2 / 0.4 / 0.2 | 4.5 dB |
| ~65 mph cruise | −21.6 | −12.1 | −20.3 | 156 Hz | 40.6 / 51.9 / 6.5 / 0.6 / 0.5 | 4.3 dB |
| ~108 mph, full throttle | −19.3 | −8.8 | −18.0 | 203 Hz | 28.2 / 57.9 / 12.6 / 0.6 / 0.7 | 5.1 dB |
| ~65 mph + boost 1 | −19.8 | −9.3 | −18.4 | 258 Hz | 31.4 / 60.2 / 5.9 / 0.9 / 1.6 | 4.5 dB |
| reverse (crawl) | −27.0 | −17.2 | −25.6 | 72 Hz | 88.1 / 9.6 / 2.2 / 0.1 / 0.0 | 4.8 dB |
| same crawl, forward | −22.9 | −14.3 | −21.6 | 87 Hz | 65.4 / 31.9 / 2.4 / 0.2 / 0.1 | 2.3 dB |
| lift-off: pressed → relaxed | −19.5 → −22.2 | | | 160 → 140 Hz | | |

* The whole drive range from parked to full throttle spans **4.6 dB RMS**. Boost adds **+1.8 dB** at
  65 mph, and full throttle with boost still peaks below −8 dBFS.
* Spectral peaks: parked 38.4 Hz (bed) and 73.3 Hz (core, −1 dB), with harmonics at 147/220/293 Hz.
  At 65 mph the peaks are 44.4 Hz and 109 Hz (−2 dB). With boost they are 45.8 Hz and 117 Hz.
* Power-up (preview 0–1.5 s): it starts near silence (−33.6 dB RMS in the first 0.5 s), and the
  sweep peak stays within +2.0 dB of the settled hum.
* Power-down: +2.3 dB RMS during the sweep, the centroid falls from 84 Hz to 57 Hz to 36 Hz, and it
  is silent after ~2.3 s.
* Retriggering the starter at cruise adds +2.6 dB for ~2 s.
* Preview WAV (4.3 s, 44.1 kHz stereo): RMS −22.8 dBFS, peak −10.6 dBFS after the ×0.9 snippet trim. That is within the
  range of the existing snippets (−18.9 to −29.7 dBFS RMS).
* Per-frame (60 Hz) motion in tests: a realistic 0→60 mph launch moves the core pitch by less than
  5 cents per frame. Even physically impossible hard steps (speed 0↔1, floored pedal, reverse,
  boost) stay under 30 cents per frame for pitch and under 100 cents per frame for brightness, before
  the extra 80 ms audio-param smoothing.

## Files

`src/audio/stellarHelmPack.ts` (identity, defaults, param meta, builtin) and
`src/audio/stellarHelmVoice.js` (+ `.d.ts`), which holds the drive model, targets, voice graph and
cues. The integration edits are additive and only active for this topology: `EngineSynthImpl.ts`
(graph build, drive, start power-up, starter/shutoff, teardown), `engineStartShutdown.ts` (cue
routing and durations), `builtins.ts`, `types.ts` (`TopologyId`), `index.ts` and `EnginesPage.tsx`
(preview). Renderer: `scripts/stellar-helm-render.mjs`. QA: `scripts/stellar-helm-qa.mjs`. Tests:
`tests/stellar-helm.test.mjs`. No other pack's sound, the worklet, `src/packs/*` and the app chrome
are untouched.
