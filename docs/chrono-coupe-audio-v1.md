# Chrono Coupe — audio engine v1 (experimental)

> **Superseded for the engine voice:** the Chrono Coupe now runs its own rear-mounted odd-fire
> V6 worklet with engine-played startup / shutdown, see [chrono-coupe-v6.md](chrono-coupe-v6.md).
> The pulse family-5 voice described here remains the fallback (and the charge bus is unchanged).

An original, fully procedural voice: a 2.85 L rear-mounted 90° V6 with a common-pin crank, so it
fires unevenly (150° / 90° alternating). It's uneven, slightly wheezy and modest in power, with
a continuous mechanical-injection hiss, a mild stainless body-shell ring and gentle overrun pops.
Charge mode layers an electrical whine and crackle that build with the charge level, then a bright
discharge event.

| | |
|---|---|
| Pack / builtin / topology id | `chrono-coupe`, from `CHRONO_COUPE.id` in `src/audio/chronoCoupePack.ts` |
| Display name | Chrono Coupe (`CHRONO_COUPE.displayName`) |
| Status | experimental (patch `meta.tags` has `experimental`) |
| Engine kind | `ice`, rendered by `pulse-engine-processor` **firing family 5** (6 cylinders, angles 0/150/240/390/480/630, banks alternate) |

**Renaming:** edit the `CHRONO_COUPE` constant (one line each for id and name). Builtins, the
topology switch, the bridge schedule, engine routing, the Engines preview map and the tests all
derive from it. Only the file names `public/snippets/chrono-coupe.wav`, this docs page and
`tests/chrono-coupe.test.mjs` carry the id literally.

## Procedural only

The sound comes from the pulse worklet (odd-fire pulses → waveguide exhaust → crossover collector)
plus Web Audio oscillators, biquads, compressors and gains. The only buffers are white and pink
noise filled with `Math.random()` at runtime, the same as every other pack. Nothing calls
`decodeAudioData` or `fetch`, and no audio files are bundled. `public/snippets/chrono-coupe.wav`
(cruise → charge build → discharge) is rendered **offline from the same code** by
`node scripts/render-snippets.mjs chrono-coupe` and is only used by the Engines preview button.

## Parameters (`CHRONO_COUPE_PARAM_META`, shown only for this topology)

| param | default | what it does |
|---|---|---|
| `camLope` (Idle Hunt) | 0.16 | slight idle unevenness, fading out with rpm and throttle |
| `bankSplit` | 0.35 | per-bank pipes, for a little stereo width |
| `overrunBurble` (Overrun Pops) | 0.32 | gentle lift-off pops |
| `injectionHiss` | 0.5 | continuous mechanical-injection hiss (4–9 kHz band) that follows airflow |
| `shellResonance` (Shell Ring) | 0.45 | two mild stainless-shell panel modes (~385 Hz, ~1.16 kHz; peaks of about +1–4 dB) |
| `wheeze` | 0.55 | intake breath (band-passed noise, amplitude-modulated at crank order 1) |
| `chargeIntensity` | 0.75 | charge whine / crackle / discharge level |
| `chargeLevel` | 0 | fallback for `setChargeLevel()` (0..1) |
| `pursuitBoost` | 0 | boost; scales charge intensity ×(0.6 + 0.4·boost) and crackle density |

Base ICE params: rpmIdle 43 (≈ 860 rpm), rpmRedline 300 (≈ 6000 rpm), collectorDelayMs 1.4,
gearCount 5, autoShiftRpm 5400, maxRpm 6200, topSpeedKph 210. `dcGuard` is applied
(rpm-gated 1500 → 2800), so there is no high-rpm collapse.

Worklet change: `firingFamily` maxValue goes from 4 to 5, and family 5 is used only by this pack.
Families 0–4 are unchanged. In family 5 the fire after the long 150° gap is ~16 % stronger than
the one after the 90° gap (it breathes better), which gives the uneven character.

## Drive contract (`setDriving`)

`{ speed: 0..1, throttle: 0..1, load?, reverse?, rpmNorm?, rpm?, overrun? }`. This is the same as Night Pursuit.

* If Frontend sends `rpm` (absolute) or `rpmNorm`, that value wins (`modelled: false`).
* Otherwise a fallback **5-speed manual** derives rpm from speed. It uses ratios 3.36/2.06/1.38/1.03/0.82,
  a 3.44 final drive, clutch slip at launch, and a throttle-dependent shift schedule. Each upshift
  glides over ~0.6 s; per-frame rpm steps stay under 150 rpm (tested), so there are no cliffs.
* Overrun pops open on lift-off above ~1.8k rpm, with a small coasting floor.

## Hooks (both the `CharacterEngine` wrapper from `getEngine()` and `EngineSynthImpl`)

All hooks are optional on `EngineSynth`. They are safe to call when the pack is inactive, stopped or disposed (they do nothing).

| method | behaviour |
|---|---|
| `getEnvelope(): number` | 0..1 post-gain loudness (RMS tap, −54…−6 dBFS → 0..1) |
| `getVoiceEnvelope(): number` | alias of `getEnvelope()` |
| `setPursuitBoost(amount: number): void` | 0..1 → charge intensity / boost (also accepted as the `pursuitBoost` param) |
| `setChargeLevel(level: number): void` | 0..1 charge (Frontend: speed ÷ jump threshold). Smoothed (attack 0.18 s / release 0.3 s). Whine pitch is 180 Hz → ~2.6 kHz, continuous. Audible only while Chrono Coupe is running; the value is kept otherwise |
| `triggerDischarge(): void` | One-shot. Ignored unless running and Chrono Coupe is active. **Rate-limited to one per 1.0 s** (`CC_DISCHARGE_COOLDOWN_S`) so mashing the jump button stays polite |

UI cues: `triggerUiCue('discharge')` (alias `charge-discharge`); `starter`/`ignition` plays a
fuel-pump prime whir → brisk odd-fire crank → catch → flare; `shutdown`/`shutoff` plays uneven
last fires, the hiss tailing off, pump run-down and a settle.

### Loudness safety (Apple HIG, *Playing audio*: no surprise loudness)

* Charge sounds run through their own compressor (−28 dB threshold, 10:1). Over a full charge
  build the overall level rises ~1 dB, while the high-band share rises from 1.5 % to 13 %
  (27 % with boost 1).
* Discharge runs through a separate gentle compressor (−14 dB, 4:1). Its level tracks the running
  engine (quieter at idle), every envelope has a 3–6 ms attack (no clicks), and the engine dips
  ≈ 5 dB for ~0.25 s, then recovers.
* Measured short-term (100 ms) loudness over the engine just before the event: **cruise +1.3 dB,
  cruise with boost +2.3 dB, idle +1.9 dB**. The release still reads clearly: the >1.5 kHz band rises
  +4 to +21 dB.
* Everything goes through the engine master gain and the master limiter, so user volume always applies.

## Measured (offline renders with the real worklet, `node scripts/chrono-coupe-qa.mjs`)

| case | RMS | centroid | energy split (<150 / 150–500 / 0.5–2k / 2–6k / >6k Hz) |
|---|---|---|---|
| idle (~860 rpm) | −33 dB | 199 Hz | 71 / 26 / 2.4 / 0.2 / 0.6 % |
| 45 mph cruise (4th, ~2160 rpm) | −25 dB | 161 Hz | 67 / 31 / 1.7 / 0.1 / 0.2 % |
| WOT pull (to ~5.4k) | −14 dB | 329 Hz | 60 / 31 / 5.5 / 2.7 / 0.4 % |
| hold 4500 rpm | −14 dB | 266 Hz | 59 / 35 / 5.4 / 1.4 / 0.2 % |

**Odd-fire signature** at a fixed 1200 rpm (firing order 3 = 60 Hz): order 1.5 is at **−9.7 dB** and
order 4.5 at **−3.9 dB** relative to the firing order. The same patch forced to even-fire (family 3)
gives −24.7 dB and −20.6 dB, so the odd-fire voice carries ~15 dB more of the uneven half-order content.

Preview WAV: 6.2 s, whole-file RMS −22.8 dB (V8 Rumble preview −22.6 dB), peak 0.43.

## Files
`src/audio/chronoCoupePack.ts`, `src/audio/chronoCoupeVoice.js` (+ `.d.ts`), the worklet (`src/audio/worklets/` and
`public/worklets/`, kept identical), and integration in `EngineSynthImpl.ts`, `CharacterEngine.ts`, `builtins.ts`,
`types.ts`, `engineStateBridge.ts`, `engineStartShutdown.ts`, `index.ts` and `EnginesPage.tsx`.
Renderer: `scripts/chrono-coupe-render.mjs`. QA: `scripts/chrono-coupe-qa.mjs`. Tests: `tests/chrono-coupe.test.mjs`.
