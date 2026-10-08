# Twin Ion — closer match pass (cue sheet + metrics)

**Pack:** `ion-twin` (kind `scifi`) · **Branch:** `audio/ion-twin-closer` from `audio/packs-integration` (e2ace06)
**Legal / method:** the six reference clips were used as *listening targets only*. Nothing from
them is in the repo or product: no samples, slices, wavetables, impulse responses or
sample-by-sample derived data. Only summary analysis (pitch / formant centres and bandwidths,
spectral slopes, modulation rates, attack / decay times) was used to choose synthesis
parameters. The voice is 100 % procedural Web Audio.

## 1. Cue sheet (analysis summary)

| Ref | Gesture | Spectral character | Time / modulation |
|-----|---------|--------------------|-------------------|
| A (ref1, 4.1 s) | swelling howl, release | formants ≈445 (BW≈70) / 575 (≈210) / 890 (≈160) / 1370 (≈200) Hz + low hum ≈130 Hz; centroid ≈930 → 550 Hz on release; −19 dB/oct above 2 kHz; thin inharmonic partial lines 450–1500 Hz drifting down | swell attack ≈2.1 s, peak ≈2.7 s; mono |
| B (ref2, 7.6 s) | parked motor | one tonal pole ≈57 Hz, centroid ≈66 Hz; 50–80 Hz band −5 dB, 125 Hz −18, 160–200 Hz −28…−30, ≥315 Hz −45…−50 (re peak); faint ticks ≈500 Hz | steady level; tick pulses ≈5.5 Hz |
| C (ref3, 2.2 s) | bright scream accent | narrow stable lines ≈260 / 480 / 1260 / 1500 Hz on f0 ≈240–250 Hz (1260/1500 ≈ 5th/6th harmonic); centroid ≈1250 Hz | AM peak 5.7–6.4 Hz; widest stereo (corr 0.92) |
| D (ref4, 2.9 s) | power surge | low blob 100–600 Hz at 0.3–1 s, then lines ≈1050–1100 Hz; centroid rises ≈450 → 2100 Hz; band-limited < 8 kHz | attack ≈0.37 s, decays to 30 % in ≈1.1 s |
| E (ref5, 11.7 s) | full stack fly-by | flat-ish LTAS (−11…−15 dB) from 31 Hz to 1 kHz, −7 dB/oct above; rumble-led first 2 s (centroid 165–220 Hz) | level holds −2…−7 dB the whole clip; vertical bursts ≈5.8 / 7.2 / 9.8 s; descending glides at the end |
| F (ref6, 5.7 s) | sustained howl | formants ≈412 (60) / 573 (150) / 720 (110) / 913 (190) / 1258 (280) Hz; very clean below 300 Hz (≈−30 dB/oct); −40 dB/oct above 2 kHz; band-limited < 8 kHz | attack ≈2 s, centroid ≈1130 → 790 Hz |

Common to all: twin, slightly inharmonic partial pairs (e.g. 1168/1190 Hz) rather than a strict
harmonic comb; modulation dominated by slow (< 1.4 Hz) drift — the old voice had excess
32–64 Hz fluctuation.

## 2. Drive inputs used for the offline A/B (scripts/ion-twin-render.mjs)

`ION_TWIN_GESTURES.ref1…ref6` are `setDriving({speed, throttle})` curves sketched from the
gestures above (e.g. A: speed 0.45, throttle 0.12 → 0.85 at 2.7 s → 0; B: parked, throttle
0.08; E: full-stack arc with stabs at 2.7 / 5.8 / 7.4 / 9.8 s). Each render runs the live voice
(`createEngineSynth` → `CharacterEngine` → `EngineSynthImpl` scifi graph) in an
`OfflineAudioContext` with 60 Hz control frames, seeded noise and a 3 s pre-roll (skips the
start-up sweep). Old and new voices are rendered with identical inputs and seeds.

## 3. What changed in the voice

* **Howl** — the twin howl oscillators are now audible: a fundamental-free partial set
  (`ionHowlWave`) at f0 ≈150–240 Hz with ≈1.5 % twin detune, 5.7 Hz vibrato and a 0.23 Hz drift,
  feeding the formant bank re-centred on ≈420 / 575 / 900 / 1300 Hz (pink-fed, narrower Q).
  A post-formant high-pass (340 Hz, opened to ≈170 Hz by surges) removes the 215 Hz line comb.
  Light saturation (k ≤ ≈3, `ION_HOWL_SAT`) instead of k 15–34, which had whitened the formants
  into broadband hiss.
* **Scream** — narrow lines ≈480 / 1260 / 1500 Hz with a tonal component, 5.7 Hz flutter.
* **Surge** — formant glide restarts low on a stab (≈0.65×) and climbs (≈1.35×) as it settles.
* **Motor bed** — clean ≈57 Hz pole at idle: rounded carriers (`ionMotorWave`) through a padded,
  near-linear bite (old clip produced a 110–350 Hz intermod buzz); the craft voice no longer plays
  the digital acceleration sine (`digitalCueLevel: 0`); motor bands climb with spool (≈57 →
  ≈150 Hz) and the motor bus rides up with the howl so a low twin hum stays under the bellow.
  The idle hum fades out by ≈30 % rpm.
* **Air / grit** — wet hiss, grit and ion spark are pink-fed and band-limited (≈1–3 kHz)
  instead of white (the old bright top above 6 kHz).
* **Bus** — fixed 2-channel dry/delay bus (no mono↔stereo flip when wet sends idle).
* **Full-stack preset** — more motor/body, less howl/scream, more air (flatter LTAS, ref E).
* **Level** — `ionLevelTrimDb(throttle)` holds integrated loudness at idle / cruise / full.

Cost: one full engine build creates 262 audio nodes vs 255 before (≈1.03×).

## 4. Objective distances (old = e2ace06, new = this branch)

log-mel = RMS dB over 64 mel bands 30 Hz–12 kHz (mean-normalised, 80 dB floor);
centroid = energy-weighted |Δ spectral centroid|; formant = mean nearest-peak error of the
ref's 5 LTAS peaks (semitones); modulation = envelope-modulation-spectrum RMS dB (3 bands,
0.5–64 Hz). Lower is better.

| Ref | log-mel dB old → new | centroid Hz old → new | formant st old → new | modulation dB old → new |
|-----|------|------|------|------|
| A ref1 | 11.99 → 10.52 | 614 → 196 | 3.45 → 2.49 | 5.55 → 3.98 |
| B ref2 | 14.24 → 11.94 | 6 → 11 | 0.00 → 1.12 | 10.02 → 12.91 |
| C ref3 | 8.05 → 7.43 | 723 → 146 | 1.87 → 1.93 | 6.17 → 8.36 |
| D ref4 | 12.12 → 12.68 | 1116 → 683 | 5.68 → 4.54 | 7.62 → 7.81 |
| E ref5 | 10.84 → 11.79 | 1222 → 566 | 3.51 → 6.44 | 5.63 → 5.26 |
| F ref6 | 11.55 → 9.50 | 603 → 159 | 2.40 → 1.90 | 8.69 → 7.98 |

Still open: D and E log-mel (surge low blob 100–200 Hz and the stack's sub-100 Hz rumble are
still thin; 1–2 kHz still a few dB proud in the stack); B/C modulation (the tick / flutter
texture is steadier than the refs). D and F refs are band-limited at 8 kHz, which the
voice does not imitate.

## 5. Loudness (BS.1770 integrated, live chain, seeded, 6 s after 3 s pre-roll, no −2 dB trim)

| State (speed, throttle) | before | after | Δ |
|------|------|------|------|
| idle (0, 0) | −33.51 | −33.57 | −0.06 |
| cruise (0.5, 0.35) | −13.76 | −13.78 | −0.02 |
| full (1, 1) | −8.43 | −8.08 | +0.35 |

Preview `public/snippets/ion-twin.wav` is now rendered from the live voice
(`scripts/render-snippets.mjs ion-twin`, seeded, byte-identical re-renders) at −20.4 LUFS.

## 6. Files

* `src/audio/ionTwinVoice.ts` — voice constants and helpers (shaper, waves, formants, trim)
* `src/audio/EngineSynthImpl.ts` — `buildScifi` / `applyScifiDriving` only
* `src/audio/builtins.ts`, `src/audio/ionTwinLayers.ts` — Twin Ion defaults / full-stack preset
* `scripts/ion-twin-render.mjs` — live-voice offline renderer + drive gestures
* `scripts/render-snippets.mjs` — preview now uses the live renderer
* `tests/ion-twin.test.mjs`
