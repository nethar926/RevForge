# Galactic Enforcer — targeting-computer HUD (film styling, original craft)

`GalacticEnforcerHud` is a drop-in replacement for `src/themes/GalacticEnforcer.tsx`
(same props, plus optional `motion`, `targetCraft`, `statusCraft`). Not mounted
yet — Visual Skins stays inside `src/skins`; Frontend flips it on.

Dev preview (not in the prod bundle; mounted inside the same ThemeStage
wrappers/CSS so the `.galactic-type` cascade is real):

    npm run dev
    open /src/skins/galactic-enforcer/preview/index.html?mph=74&rpm=4200&gear=4
    #   lock=none|identified|lock|kill  unit=kph  still=1  demo=1  old=1 (current HUD)

## Frontend wiring (2 lines in src/themes/ThemeStage.tsx)

```diff
-import {GalacticEnforcer} from './GalacticEnforcer';
+import {GalacticEnforcerHud} from '../skins/galactic-enforcer';
 ...
-{theme.id==='galactic-enforcer'&&<GalacticEnforcer lockStage={lockStage} state={state} redline={redline} unit={unit} demo={demo} running={running}/>}
+{theme.id==='galactic-enforcer'&&<GalacticEnforcerHud lockStage={lockStage} state={state} redline={redline} unit={unit} demo={demo} running={running} motion={motion}/>}
```

Then `src/themes/GalacticEnforcer.tsx` and the `.enforcer-*` rules in
`special-dashes.css` can be deleted (or kept for rollback). No catalog,
id, migration or theme-name change: id `galactic-enforcer`, name
"Galactic Enforcer", saved prefs untouched. `src/packs/migrations.ts` unchanged.

Verified with that exact temporary swap (not committed): HUD renders in Drive,
631 px tall at 1280×800 (old HUD: 656 px); IGNITION splash pixel-identical.
The Drive throttle card still overlaps the bottom-right of the HUD exactly as it
overlapped the old Ship Status pod — Drive chrome, Frontend's call.

## What it shows

* Rectangular scope: flattened perspective "eye" tick arcs (tapered, evenly
  spaced), centre crosshair, side triple dashes, terrain line, numbered
  badges, pink-red wireframe **crescent drone** (drifts; stops on lock).
  Lock = yellow corner brackets + stage text (shape + words, not colour only).
* Left: red range ladder = live speed, scale in 5s, highlighted value in a
  yellow-on-dark-red box (Latin digits).
* Right: red indicator column — ▲/▼ blocks (solid when accelerating /
  braking, outlined otherwise), CHG (RPM charge) and LOAD slots, gear block.
* Strip: round **Ship Status** scope (blue tick fans, crosshair, red
  wireframe swept-delta **interceptor**), big SPEED, RPM, GEAR, LOAD.
* FT Aurebesh only for the two decorative glyph lines (aria-hidden).
  Speed/RPM/gear/load/ladder are Inter/system digits — the old HUD rendered
  speed and RPM in FT Aurebesh via `.galactic-type .skin-number`; the new HUD
  doesn't use `.skin-number`, so that rule no longer affects data.

## Swapping craft art later

`craft.ts` → `CRAFT: Record<CraftId, { label, viewBox, cx, cy, art }>`;
art lives in `craftArt.tsx`. Add an entry and pass `targetCraft` /
`statusCraft`. The HUD only knows id/viewBox/centre.

## HIG

Text ≥12px at 760×560, 773×601@1.53 and 1280×800 @1/@1.53; text contrast
≥5.65:1 measured at every pixel behind each text box (Playwright);
Reduce Motion/`motion=false`: no drift, no ladder/slot transitions;
Reduce Transparency: no glow filters, opaque craft fills; `role="meter"`
for speed ("Speed 74 miles per hour") and RPM ("RPM 4,200"), labelled gear/load.
