# ICE overrun pops — release gate fix

Build Lead's gate: exhaust pops / crackle are counted on one lift-off from about 5k rpm down to
idle; there must be **zero** pops at steady speed, while coasting at low rpm, and at idle.

## What was wrong

* Night Pursuit and Chrono Coupe opened their overrun burble from (a) any throttle drop below
  0.14, (b) Frontend's `overrun` flag, and (c) a permanent coasting floor (`thr < 0.06 && speed > 0.08`).
  In GPS mode Frontend sends `throttle = load = 0.12 + accel/5` and `overrun = accel < −0.25 …`,
  so ordinary GPS speed noise at a steady speed flickers the flag and dips the throttle → pops at
  cruise; any coast above ~1.2k rpm popped continuously.
* Every ICE pack pushed the worklet `crackle` amount permanently, so the worklet's own
  throttle-drop crackle fired on any quick dip at > 2.8k rpm (including pedal / GPS noise), and a
  stale `overrun` value from a previous pack was never cleared on generic packs.

## The gate (`src/audio/overrunBurst.js`, shared by browser + offline renders)

Pops open only on a **genuine lift-off from high rpm**:

| condition | value |
|---|---|
| driver was pulling (throttle peak-hold, decays τ 0.8 s) | ≥ 0.30 |
| throttle now closed | < 0.10, and ≥ 0.25 below the peak (a lift slower than ~1 s never qualifies) |
| rpm at the lift | ≥ `max(2800, idle + 0.4·(redline − idle))` |
| re-arm | throttle must go back ≥ 0.30 before another burst |

The burst is bounded: full strength for 0.8 s, then τ ≈ 1.4 s, tapered to 0 by 3.2 s, and scaled by
`((rpm − floor)/(liftRpm − floor))^0.2` with `floor = max(1150, 1.6·idle)`, so it dies away as the
revs fall and is 0 long before idle. Back on the throttle (> 0.2) ends it at once. The envelope is
smoothed (30 ms attack / 60 ms release), so the pop amount itself never steps.

* Night Pursuit / Chrono Coupe: `drive.overrun` = this envelope (no coasting floor, Frontend
  `overrun` flag ignored); worklet `crackle` = `crackle · clip(2.5·env)`.
* Generic ICE (v8-rumble, i4-zip, i6-silk, rotary-hum): EngineSynthImpl runs its own gate for the
  worklet `crackle` and forces `overrun` = 0.
* No worklet change (the shipped `pulse-engine-processor.js` and its public copy are untouched).

## Measurement — `node scripts/ice-pops.mjs [--json out] [--wav dir] [--scenario s] [engine…]`

Deterministic: every render is seeded (main thread + a seeded temp copy of the worklet,
`scripts/seeded-random.mjs`), 44.1 kHz, the real worklet + shared voice code per engine
(`chrono-coupe-render.mjs`, `night-pursuit-render.mjs`, `ice-generic-render.mjs`).

Scenarios (explicit rpm, like Frontend's drive simulation): **steady3k** 10 s at 3000 rpm with
GPS-style throttle (0.12 + accel/5, deterministic ±0.45 m/s² wobble, `overrun` flag flickering);
**coastLow** 10 s, 1700 → 1150 rpm, throttle 0.04, `overrun` true; **idle** 10 s;
**liftoff** 2 s at ~5000 rpm / throttle 0.85, lift in 0.1 s, rpm falls to idle (τ 1.15 s); pops
counted from the lift.

Detector: mono → sample-to-sample difference → 1 ms RMS windows (0.5 ms hop) → a pop is a window
more than **2.5× (+8 dB)** above the 95th percentile of the preceding 400 ms (ending 6 ms
earlier) and above −80 dBFS; hits within 30 ms merge; first 0.6 s skipped. The engines with
overrun/crackle forced to 0 score 0 everywhere (largest clean ratio 2.34).

| engine | steady3k | coastLow | idle | liftoff |
|---|---|---|---|---|
| night-pursuit before → after | 8 → **0** | 5 → **0** | 0 → **0** | 7 → **3** (3.05 / 3.23 / 3.68 s, 2.4k → 1.6k rpm) |
| chrono-coupe | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 (its 0.32 burble is below the detector) |
| v8-rumble / i4-zip / i6-silk / rotary-hum | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
