# Night Pursuit — audio engine v1 (experimental)

An original late-70s / early-80s American big-block V8 pursuit-car voice. It's a heavy cross-plane
burble with a lumpy cam at idle, a broad and slightly rough midrange, and a hoarse top end. There
are no samples. Every sound is synthesised at runtime.

| | |
|---|---|
| Pack / skin / builtin / topology id | `night-pursuit` |
| Display name | Night Pursuit |
| Status | experimental (patch `meta.tags` has `experimental`; the flag that users see lives in the theme pack) |
| Engine kind | `ice`, rendered by `pulse-engine-processor` (8 cylinders, cross-plane `firingFamily: 1`, 90° banks) |

## Procedural only

The voice is built from the pulse worklet (firing pulses → per-bank waveguides → collector) and
Web Audio nodes (biquads, waveshapers, oscillators). The only `AudioBuffer`s are the white and pink
noise buffers that the engine fills with `Math.random()` at startup, the same way every other pack
does it. Nothing calls `decodeAudioData` or `fetch`, and no audio files are bundled. The
`public/snippets/night-pursuit.wav` preview is rendered **offline from the same code** by
`scripts/render-snippets.mjs night-pursuit` and is only used by the Engines page preview button.

## Character parameters (`NIGHT_PURSUIT_PARAM_META`, shown only for this topology)

| param | default | range | what it does |
|---|---|---|---|
| `camLope` | 0.82 | 0–1 | Long-duration cam lope: idle rpm hunt, uneven cylinder fill, lazy firing. Fades out above ~2.1k rpm and under throttle |
| `bankSplit` | 0.8 | 0–1 | Dual exhaust with unequal pipe lengths per bank, plus stereo width |
| `overrunBurble` | 0.6 | 0–1 | Off-throttle fuel cut that hollows the tone, with irregular afterfire pops |
| `loadRich` | 0.7 | 0–1 | Under load the tone opens up with a rich low-mid push and a hoarse rasp near redline |
| `bodyDepth` | 0.65 | 0–1 | Big-block chest (low shelf) |
| `pursuitBoost` | 0 | 0–1 | PURSUIT seasoning: forced-induction whistle, intake whoosh, more aggressive load mapping. Silent at 0 |
| `turboWhistle` | 0.5 | 0–1 | Level of the PURSUIT whistle |
| `intakeWhoosh` | 0.6 | 0–1 | Level of the PURSUIT intake whoosh and lag |
| `wastegate` | 0.35 | 0–1 | Blow-off flutter on lift-off while boosted |
| `scannerTick` | 0 | 0–1 | Level of the scanner-pass tick (**off by default**) |

Base ICE params: rpmIdle 44 (≈ 660 rpm), rpmRedline 340 (≈ 5100 rpm), collectorDelayMs 2.5,
gearCount 4, autoShiftRpm 4300, maxRpm 5200, topSpeedKph 200.

New worklet k-rate params, all **default 0** so no other pack changes: `camLope`, `bankSplit`,
`overrun`, `overrunBurble`, `dcGuard`.

## Drive contract (`setDriving`)

`{ speed: 0..1, throttle: 0..1, load?, reverse?, rpmNorm?, rpm?, overrun?, shifting? }`

* If Frontend sends `rpm` (absolute) or `rpmNorm`, that value wins (`modelled: false`). Both are honoured.
* Otherwise a fallback **4-speed automatic** derives rpm from speed. It uses ratios 2.74/1.57/1.00/0.67,
  a 3.23 final drive, a torque converter that flashes to ~2100 rpm on launch and locks up at cruise,
  a throttle-dependent shift schedule, kickdown, and shifts that glide (no rpm cliffs).
* Overrun / burble opens on lift-off at speed. The `overrun` input overrides it when Frontend sends one.

## Pack hooks (`src/packs/audioBridge.ts` → `PackAudioHooks`)

These are exposed on both the `CharacterEngine` wrapper returned by `getEngine()` and the base `EngineSynthImpl`:

| method | behaviour |
|---|---|
| `getEnvelope(): number` | 0..1 post-gain loudness. An analyser RMS tap maps −54…−6 dBFS to 0..1, with 25 ms attack and 180 ms release. Feeds the HUD `voiceEnvelope` |
| `getVoiceEnvelope()` | alias of `getEnvelope()` |
| `scannerTick(edge: 'left' \| 'right')` | Soft original two-tone tick, panned to the edge. Only sounds while running, with the Night Pursuit voice active and `scannerTick > 0` |
| `setPursuitBoost(amount)` | 0..1. Mode mapping: **PURSUIT 1, POWER 0.5, AUTO/NORM 0** (`nightPursuitBoostForMode`). `pursuitBoost` in params works as a fallback |

UI cues (`triggerUiCue`): `starter`/`ignition` and `shutdown`/`shutoff` play the pack-specific heavy crank
→ catch → flare and lumpy run-down. `scanner-tick`, `scanner-left` and `scanner-right` (also `scanner`) play the tick.

## Measured (offline renders with the real worklet, `scripts/night-pursuit-qa.mjs`)

| case | Night Pursuit | stock V8 path |
|---|---|---|
| idle | spectral centroid ~74 Hz, ~94 % energy < 150 Hz, 5.6–5.8 Hz half-order lope | 131 Hz, 79 % < 150 Hz, even buzz |
| 45 mph cruise | ~130 Hz, mellow, lockup in 4th ~1200 rpm | 254 Hz |
| WOT ~4.5k rpm | centroid ~416 Hz, 33 % 150–500 Hz, 12 % 0.5–2 kHz, RMS −11.5 dB | collapses to about −21 dB |
| lift-off | 6–13 Hz burble modulation, envelope depth ~0.31 | — |

### Note: pre-existing high-rpm collapse in the pulse worklet
Above ~3k rpm the overlapping pulses push DC into the waveguide. The `tanh` stage then saturates and
the DC blocker leaves near-silence; the stock V8 loses ~25 dB at 4500 rpm. The new `dcGuard`
(12 Hz DC removal on the excitation) fixes this. It is only enabled for Night Pursuit (rpm-gated
1500→2800), and we recommend turning it on for all ICE packs.

## Files
`src/audio/nightPursuitPack.ts`, `src/audio/nightPursuitVoice.js` (+ `.d.ts`), `src/audio/envelopeMeter.ts`,
the worklet (`src/audio/worklets/` and `public/worklets/`, kept identical), and integration edits in `EngineSynthImpl.ts`,
`CharacterEngine.ts`, `builtins.ts`, `types.ts`, `engineStateBridge.ts`, `engineStartShutdown.ts`, `index.ts` and `EnginesPage.tsx`.
Tests: `tests/night-pursuit.test.mjs`. QA renders: `node scripts/night-pursuit-qa.mjs [outDir] [case...]`.
