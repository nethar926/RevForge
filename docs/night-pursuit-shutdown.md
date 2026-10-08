# Night Pursuit: key-off (shutdown cue)

Only the shutdown cue changed. The running voice, the starter and the levels at idle, cruise
and full are untouched. The cue is synthesized per sample in `src/audio/npShutdownCue.js`
(pure function `renderNightPursuitShutdown(sr, opts, rand)`) and plays through one
buffer-source node and one gain node. It uses no recordings, samples or convolution.

## What you hear (about 2.45 s from idle, about 2.8 s from 2.5k)
1. **Ignition cut.** The running engine (post chain and PURSUIT bus) fades out in 30 ms through
   a new key gain in `NightPursuitBus` (`keyOff`). In the same instant, one to three residual
   fires continue the firing rhythm, so there is no gap and no click.
2. **Run-down.** The crank coasts from the current rpm to rest, following
   `rpm = r0·(1 − t/T)^1.45` with T = 1.2–1.6 s. Compression lope grows as it slows. Every 90° of
   crank there is a cylinder pulse in the cross-plane bank pattern (L R L L R L R R, with per-cylinder
   imbalance). Each pulse is a half-sine gas pulse into two unequal bank pipes (67 / 74 Hz plus
   158 Hz) and a 46 Hz block mode, with a turbulent air tail. As the revs fall, the pulses get
   wider and farther apart until each one is heard on its own: about 23 ms apart at the cut and
   more than 100 ms at the end. A dark coast bed (block, pump and air below about 170 Hz) fills
   the gaps about 25 dB under the pulses.
3. **Shudder and clunk.** When the crank can't make the next compression, the block rocks back on
   its mounts (24 / 52 Hz mount modes plus a short rattle), followed by a low clunk.
4. **Settle.** A short, dark exhaust and air sigh out of the pipes (τ 0.2 s).
5. **Tick (optional).** One or two faint metallic cooling ticks (1.6 / 2.6 kHz) 0.75–1.3 s later.
   `npShutdownTick: 0` turns them off.

## Behaviour
* `playShutoff()` → `EngineSynthImpl.playNightPursuitKeyOff()`:
  * starts the cue from the drive model's rpm
  * keys the engine off
  * holds the output until the cue ends (`ownShutdownUntil`), so the app's
    `playShutoff(); stop()` plays the whole thing, then a 50 ms fade
* **Interruptible.** A throttle press above 0.15 while running, a restart (`start()`) or a
  `playStarter()` during or after the cue fades the cue out and brings the engine back
  (key-on ramp 300 ms).
* The generic character shutdown sweep (`ProceduralCharacter`) is no longer layered on top:
  `EngineSynth.ownsShutdownCue()` tells `CharacterEngine.stop()` to skip it for engines that play
  their own key-off (Night Pursuit, Chrono V6). Other packs keep it. The startup sweep is unchanged.
* The cue for the current idle is rendered ahead of time, 1.5 s after start
  (`prepareNightPursuitShutdown`), so key-off does no synthesis work. If the rpm at key-off is
  more than 120 rpm away from that, it renders fresh (about 20 ms warm). It renders at half the
  context rate, since the content sits below about 4 kHz. Seeds come from a per-engine counter,
  not `Math.random`, so renders are reproducible.
* `NP_SHUTOFF_SECONDS` is now 2.45. `playNightPursuitShutoff()` (standalone path used by
  `engineStartShutdown`) plays the same cue.
* Level knob: `npShutdownLevel` (0..2, default 1). No storage access.

## Measurements (shipped graph via `scripts/live-render.mjs`, HIG master bus, seeded)

| | previous cue | new cue |
|---|---|---|
| loudest 400 ms vs idle (key-off from idle) | **+6.56 dB** | **+0.25 dB** |
| loudest 100 ms vs idle (key-off from idle / from 2.5k) | — | +2.95 / +3.26 dB (limit +6, tested) |
| length | ~1.25 s, plus the generic 1.65 s sweep | 2.45 s from idle, ~2.8 s from 2.5k |
| nodes created per key-off | ~83 (11 thumps × 6, crackle, shudder, clunk), plus the generic sweep | 2 |
| engine nodes (build + start + 2 s idle) | 230 | 231 (key gain) |

The running voice is unchanged: idle -29.97, cruise -19.74, full -12.53 LUFS (the 0.08 dB cruise
difference is render-frame jitter on a loaded box). Pops for steady / coast / idle / lift-off are
0 / 0 / 0 / 3, the same as before.

Offline-renderer note: ramping the key gain to exactly 0 made node-web-audio-api drop the
post-chain limiter's look-ahead tail with a click, and it also attenuated the cue by about 5 dB.
The key fades to -80 dB instead, which makes no audible difference in a browser.

## Tests
`tests/np-shutdown.test.mjs` covers:

* the event structure: residual fires, decelerating cross-plane pulses, shudder after the last
  pulse, and a length of 2–3 s
* separate pulses, the optional tick and seed reproducibility
* in the shipped engine: the engine is cut at the key, the cue is held through `stop()`, it is
  never above idle +6 dB (from idle and from 2.5k), and the output is silent afterwards
* throttle take-over and restart within about 300 ms
* no generic sweep on Night Pursuit, while other packs keep it
* procedural and storage-free sources
