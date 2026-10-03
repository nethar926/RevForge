# Gradient gauges — Sweep + Twin Dial (Visual Skins)

Pack-agnostic, original gauge components. Nothing here is mounted in the app
yet; Frontend owns pickers/ThemeStage. Dev preview (not in the prod bundle):

    npm run dev
    open /src/skins/gradient-gauges/preview/index.html?g=sweep&v=74
    #   g=sweep|twin|twin-gear  v  max  rl  rpm  redline  maxRpm  gear
    #   units=mph|kph  compact=1  ink=light|dark  rm=1  demo=1

## Components

```tsx
import { SweepGauge, TwinDialCluster } from '../skins/gradient-gauges';

<SweepGauge value={74} max={160} redlineFrom={135} units="mph" label="Speed"
            compact={false} ink="light" reduceMotion={!motion} />

<TwinDialCluster speed={74} maxSpeed={160} rpm={6800} redlineRpm={7000}
                 maxRpm={8000} gear={4} units="mph" showGearRpm compact={false}
                 reduceMotion={!motion} />
```

* `SweepGauge` fills its parent (`width/height: 100%`, min 240px tall); give it a
  sized box. `TwinDialCluster` is width-driven (container units), max 1180px.
* Each component imports `gradient-gauges.css` itself.
* PackHudProps adapters (same props ThemeStage already passes to `pack.Hud`):
  `SweepHud`, `TwinDialHud` (gear+RPM variant), `TwinDialSpeedHud`.
  Extra optional props: `maxSpeed`, `compact`.

## What Frontend must wire (outside src/skins)

1. `src/themes/catalog.ts` — extend `ThemeLayout` with `'sweep' | 'twin-dial'`
   and add two presets (names are original, no brands):
   ```ts
   skin('sweep','RF Sweep','Gauge Cluster','Gradient','sweep','#19d3ff','#1a6fe6','Full-screen conic light sweep with a hard cyan edge at your speed.','Conic light sweep'),
   skin('twin-dial','RF Twin Dial','Gauge Cluster','Gradient','twin-dial','#ff4a4d','#19d3ff','Speed and RPM light discs around a glowing centre readout, with gear and RPM.','Twin light discs'),
   ```
2. `src/themes/ThemeStage.tsx` — mount next to the existing gradient lines:
   ```tsx
   import { SweepHud, TwinDialHud } from '../skins/gradient-gauges';
   const hudProps = { rpmNorm: rev, rpm, speedNorm: speedPct, speed, unit, load: state.load,
     throttle: state.overrun ? 0 : state.load, gear: state.gear, distanceM: state.distance,
     shifting: state.shifting, overrun: state.overrun, running, demo, redlineRpm: redline, motion,
     maxSpeed: speedScale(maxSpeedMps, unit) };
   {theme.layout==='sweep' && <SweepHud {...hudProps} compact={/* ≤800px wide */} />}
   {theme.layout==='twin-dial' && <TwinDialHud {...hudProps} />}
   ```
   (`motion=false` → gauges jump to value, no glow pulse; OS Reduce Motion is
   honoured regardless.)
3. `src/themes/ThemePicker.tsx` — thumbnail cases for `sweep` / `twin-dial`
   (or reuse the `gradient` / `gradient-macro` thumbnails).
4. Optional: replace the older `gradient` / `gradient-macro` layouts with these
   (they cover the same refs with the a11y fixes below); keep old ids → new
   ids if you retire them.
5. The redundant ThemeStage `pack-sr-readout` is not needed for these — each
   dial is its own `role="meter"`.

## HIG / a11y decisions

* **Contrast**: the reference's navy numerals (#0d1b33) on mid-blue (#1a6fe6)
  measure 3.7:1 (even #000 would be 4.46:1) — fails. Default `ink="light"`
  uses white numerals on the reference's mid-blue (≥6.9:1 measured at every
  pixel behind the glyph boxes). `ink="dark"` keeps the navy numerals and
  brightens only the static readout sector (≥4.56:1 measured).
  The readout sector of the conic gradient is *pinned* (does not rotate with
  the needle) and the cyan fade is clamped so it never reaches it — so the
  guarantee holds at every value (unit-tested in tests/gradient-gauges.test.mjs).
* **Redline not by colour alone**: Sweep redline ticks are hollow outlined
  pills (vs recessed filled ticks) on a black keyline, plus a "REDLINE" chip;
  Twin Dial draws an outlined redline band on the RPM rim, thickens the RPM
  needle and swaps the pill to "▲ 7300 REDLINE". Coral outline (#ff8a7e) on
  black keyline clears 3:1 against every arc colour (the reference's #e85a4f
  could not).
* **Reduce Motion**: no rAF smoothing (needle = value), no redline pulse.
* **Reduce Transparency**: glows/halos removed, translucent fills solid.
* **ARIA**: Sweep root `role="meter"`; Twin Dial: group with two meters
  ("Speed 74 miles per hour", "RPM 6,800" / "RPM 7,300, redline") + gear text.
* Fonts: Inter / -apple-system / system-ui, weight 900 (no bundled font).
