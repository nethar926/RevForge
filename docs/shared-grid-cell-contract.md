# The cell contract: how a theme tells the app where things go

For Meghan (skins) and Ivy. Branch `frontend/shared-grid`. Code: `src/packs/grid/`.

Carrier Jet (CJ) is the first theme on this system and Night Pursuit (NP) is next. The idea is simple. **A theme
lists its boxes once, the app places them, and the app checks the safety rules for you.**

## 1. The words

- **Cell**: one box on the dashboard, such as SPEED, the MAP, or the drive-mode keys. Every cell has a short id (`speed`, `modes`).
- **Layout**: which screen shape the app is on. There are four, picked automatically (`src/packs/layout.ts`):
  - `board`: Tesla or desktop, full screen (1280×800, 1256×706).
  - `window`: the Tesla drive window, about 773×601.
  - `portrait`: a phone held upright (touch screen, at most 500 wide, taller than wide).
  - `phone-landscape`: a phone on its side (touch screen, at most 500 tall, at least 1.6:1).
- **Design box**: the space you draw in, in CSS pixels. The app scales it to fit the screen, the same scaler every
  pack uses (`useFitBox`). The width is fixed and the height can stretch between a minimum and a maximum.
- **Rect**: a cell's position and size inside the design box: `left`, `top`, `width`, `height`.

## 2. What a theme declares

One object, a `GridSpec`. In plain words:

| Field | What it means |
|---|---|
| `id` | The theme id, e.g. `night-pursuit`. |
| `fit` | The design box: `w` (fixed width), `minH` / `maxH` (how far the height may stretch), and `fallbackH`. |
| `fitFor` | Optional. A different design box for a layout. Use it: a phone is not a 1280 board shrunk to 30%. |
| `cells` | The list of cells (next table). |
| `layouts` | For each of the 4 layouts: the rects, or `null` if your own CSS handles that layout. |
| `rail` | Optional. Edge keys under cells: the key frame size, the gap between keys, and the pressable cap size. |

Each cell says:

| Field | What it means |
|---|---|
| `id`, `name` | Short id and the plain name used in warnings ("DRIVE MODE"). |
| `role` | `target` (the whole cell is tapped), `readout` (shows a value; it may hold small buttons, listed in `targets`), or `decoration` (art only). |
| `drawnBy` | `skin` (your art; the app only measures it) or `host` (the pack draws it). |
| `z` | Depth: higher sits on top. |
| `minSize` | The smallest box your art works in. Smaller is reported. |
| `minText` | The smallest font you use in the cell, in design px. It is checked after scaling. |
| `targets` | Fixed buttons inside a readout, e.g. `{ name: 'map credit (i)', w: 44, h: 44 }`. |
| `rail` | `true` if this cell has a row of edge keys under it. |
| `optionalIn` | Layouts where this cell may be left out. Say in the sheet where it went instead. |

A layout is one of three kinds:

- **Fixed rects** `{ kind: 'rects', rects: { speed: {…}, … } }`. This is the plug-and-play form. NP will use it.
- **Measured** `{ kind: 'derive', derive }`. The skin's own CSS grid lays the board out, and the app measures a
  few anchor boxes and works out the cells. CJ uses this, because Board 2 is a CSS grid in the skin.
- **`null`**: the grid stays out of this layout. Your CSS owns it, and the app adds no cells and no edge keys.

## 3. The rules (the app checks them)

1. **Drop nothing.** Every cell needs a rect in every layout you handle. To leave one out on a layout, list that
   layout in the cell's `optionalIn` and say on the sheet where its information went. A missing cell is a
   contract error (`validateSpec`). In the app, a board with a cell missing does not draw at all; it is never half drawn.
2. **Decoration never changes hit areas.** A `decoration` cell cannot have edge keys or buttons. The app draws it
   with `pointer-events: none`, so it can never steal a tap. Moving or resizing it never moves a button. If a
   decoration sits *above* a button it overlaps (higher `z`), you get a warning, because it would hide the button.
3. **Targets are at least 44×44 px on screen.** This is measured after scaling, so a 48 px key at 80% scale is
   38 px, and that fails. It applies to `target` cells, to every entry in `targets`, and to the edge-key cap.
4. **Text is at least 11 px on screen**, also after scaling. Put your smallest font in `minText`.
5. **Reduce Motion passes through.** The grid layer carries `data-motion="static"` or `"live"`, and `useGridMotion()`
   gives the same answer in code. It is on when the system asks for reduced motion OR the theme's own "animated"
   setting is off. Freeze sweeps, scanners and glides under `static`. Values still update.

When are the rules checked?
- **In tests**: `validateSpec` (rule 1 and the decoration rules) and `checkGrid` (rules 2 to 4) run on every
  declared layout (`tests/grid-contract.test.ts`).
- **In dev builds**: GridLayer runs `checkGrid` on the live rects and prints one console warning per problem, for example:
  `[grid:night-pursuit] target: DRIVE MODE: target renders 976×40 px in window (floor 44×44)`.

## 4. How Carrier Jet uses it (shipping now, no visual change)

`src/packs/carrier-jet/cells.ts` declares eight cells: SPEED, MACH+RPM, ACCEL, VDI, WING SWEEP, AOA/ENG, MAP and
COMPASS. All are readouts, each with an edge-key rail. MAP declares its 44×44 (i) button.
- `board` / `window`: **measured**. The app reads seven skin boxes (`.cj-a-speed`, the two `.cj-a-gr` children,
  the two `.cj-a-mid > .cj-crt`, `.cj-a-sweep`, `.cj-a-eng`) and turns them into the eight cells (`board2Cells`, or
  `board2CellsMapFirst` with the square MAP spanning both rows).
- `portrait` / `phone-landscape`: `null`. The skin's full-board phone CSS owns them, there are no edge keys, and everything is a direct tap.
- Rail: Meghan's BezelKey frame, 52×66 with a 44×44 cap, 4 px apart, up to 4 per strip (5 on MAP with WX).

The before/after pixel comparison is in `/workspace/frontend-handoff/shared-grid/pixel-diff.md`.

## 5. Worked example: a hypothetical Night Pursuit layout

This is **not** the NP design. It only shows the shape of a declaration, and it lives as a passing test
(`NP_EXAMPLE` in `tests/grid-contract.test.ts`). Meghan's NP sheet replaces every number.

**The cells** (each one is built from the current NP readouts in section 6):

| id | name | role | notes |
|---|---|---|---|
| `scanner` | SCANNER | decoration | 36-LED sweep bar. z 0. |
| `velocity` | VELOCITY | readout | MPH 7-seg. minText 12. |
| `gear` | GEAR | readout | Green 1-digit, N at 0. |
| `throttle` | THROTTLE | readout | 20-segment bar. |
| `tach` | TACH | readout | RPM 7-seg plus the 22-segment bar and its 0–8 scale. |
| `voice` | VOICE | decoration | 3×10 voice box. |
| `bars` | LOAD / ENGINE | readout | Two 20-segment bars. |
| `sensor` | SENSOR A | decoration | CRT A glyph (later the radar scope). |
| `feed` | SENSOR B FEED | readout | SYS line, % THR, % LOAD. |
| `modes` | DRIVE MODE | **target** | The mode keys. z 2, minSize 352×48. |
| `status` | STATUS | readout | Pack tag plus the status line. |
| `badge` | BADGE | decoration | `optionalIn: portrait, phone-landscape` (the tag in STATUS still names the pack). |

**Design boxes**: `fit` = 1280 wide, 520–740 tall (board). Each other layout gets its own box with `fitFor`:
- `window`: 780 wide, 400–520 tall
- `portrait`: 390 wide, 720–900 tall
- `phone-landscape`: 844 wide, 300–390 tall

**Rects** (left, top, width × height):

| cell | board (1280) | window (780) | portrait (390) | phone-landscape (844) |
|---|---|---|---|---|
| scanner | 16,8 1248×40 | 12,6 756×28 | 8,6 374×24 | 8,4 828×20 |
| velocity | 16,64 400×220 | 12,44 250×150 | 8,38 262×130 | 8,30 200×120 |
| gear | 432,64 120×220 | 270,44 90×150 | 278,38 104×130 | 214,30 70×120 |
| throttle | 16,300 536×60 | 12,202 348×44 | 8,176 374×40 | 8,156 276×40 |
| tach | 568,64 420×220 | 368,44 260×150 | 8,224 374×130 | 290,30 260×120 |
| voice | 1004,64 260×220 | 636,44 132×150 | 8,362 120×90 | 556,30 90×120 |
| bars | 568,300 420×140 | 368,202 260×90 | 136,362 246×90 | 290,156 356×72 |
| sensor | 1004,300 128×140 | 636,202 64×90 | 8,460 120×80 | 652,94 184×56 |
| feed | 1136,300 128×140 | 704,202 64×90 | 136,460 246×80 | 652,30 184×56 |
| modes | 16,456 976×64 | 12,300 616×56 | 8,548 374×104 (2×2 keys) | 8,234 638×56 |
| status | 1004,456 220×64 | 636,300 132×56 | 8,660 374×40 | 652,156 184×40 |
| badge | 1232,472 32×32 | 736,364 32×32 | (optional: left out) | (optional: left out) |

The cells reshape freely: the tach moves from beside velocity to under it on a portrait phone, and the mode keys
become a 2×2 block. **Nothing is dropped.** Compare the current NP compact layout, which drops the LOAD/ENGINE
bars, both sensor pods and the footer. Under the contract each of those needs a cell, or `optionalIn` and a note.

In code, the declaration looks like this (shortened):

```ts
export const NP_GRID: GridSpec<NpId> = {
  id: 'night-pursuit',
  fit: { w: 1280, minH: 520, maxH: 740, fallbackH: 720 },
  fitFor: { window: { w: 780, minH: 400, maxH: 520, fallbackH: 440 }, portrait: { w: 390, minH: 720, maxH: 900, fallbackH: 760 }, 'phone-landscape': { w: 844, minH: 300, maxH: 390, fallbackH: 340 } },
  cells: [
    { id: 'scanner', name: 'SCANNER', role: 'decoration', z: 0 },
    { id: 'velocity', name: 'VELOCITY', role: 'readout', minText: 12 },
    { id: 'modes', name: 'DRIVE MODE', role: 'target', z: 2, minSize: { w: 352, h: 48 } },
    // …every cell…
    { id: 'badge', name: 'BADGE', role: 'decoration', optionalIn: ['portrait', 'phone-landscape'] },
  ],
  layouts: { board: { kind: 'rects', rects: { scanner: { left: 16, top: 8, width: 1248, height: 40 }, /* … */ } }, window: { kind: 'rects', rects: { /* … */ } }, portrait: { /* … */ }, 'phone-landscape': { /* … */ } },
};
```

The mount then becomes (sketch, once the sheet lands):

```tsx
<GridFrame spec={NP_GRID} driveWindow={!!props.driveWindow} className="np-pack-mount">
  {({ layout, fit }) => (
    <GridLayer spec={NP_GRID} layout={layout} cells={resolveCells(NP_GRID, layout, null)} ready reduced={reduced} scale={fit.s}>
      <GridCell spec={NP_GRID} id="velocity"><NpVelocity … /></GridCell>
      <GridCell spec={NP_GRID} id="modes"><NpModeRail … /></GridCell>
      {/* … */}
    </GridLayer>
  )}
</GridFrame>
```

For the skin side this means splitting `NightPursuitOverlay` into per-cell parts (see `/workspace/frontend-handoff/shared-grid/MEGHAN-skin-changes.md`).

## 6. Everything NP shows and does today (map each one to a cell)

Read from `src/skins/night-pursuit/NightPursuitOverlay.tsx`, `night-pursuit.css` and
`src/packs/mounts/NightPursuitMount.tsx` at cf236b9 (read-only).

### Readouts
1. **Scanner bar**: 36 dim LED cells with a ping-pong eye. It sweeps every 2200 ms, or every 1100 ms when "hot" (PURSUIT / POWER). Under Reduce Motion it is a static centre glow. Each pass calls `onScannerPass('left'|'right')`, which feeds the audio scanner tick (none under Reduce Motion).
2. **Velocity, MPH**: a crimson 3-digit 7-segment display with unlit leading zeros, the unit "MPH", and the pod label "Primary · Velocity" ("Velocity" in compact).
3. **Gear**: a green 1-digit 7-segment display, "N" at 0, capped at 9, labelled "Gear". It only shows when the host passes a gear.
4. **Throttle bar**: 20 segments (green, then amber, then red), labelled "Throttle".
5. **Load bar**: 20 segments, labelled "Load".
6. **Engine bar**: 20 segments (amber to red) from rpmNorm, labelled "Engine".
7. **Tach, RPM**: an amber 4-digit 7-segment display rounded to 10 rpm, with unlit leading zeros, the unit "RPM", and the pod label "Tach · Envelope" ("Tach" in compact).
8. **Tach bar**: 22 segments with a red zone from the redline (default 7000), and a scale 0…8 (k rpm) whose labels turn red at or above the redline. The face grows past 8k only if redline × 1.1 > 8000.
9. **Voice box**: 3 columns × 10 segments, driven by the engine voice envelope (`readPackEnvelope`), or by a throttle / rpm / load blend without it. It runs larger when hot.
10. **Sensor pod A (CRT A)**: the orbit/chevron NP mark glyph (decoration today).
11. **Sensor pod B (CRT B feed)**: "SYS · MONITOR" or "SYS · PURSUIT", "{n}% THR", and "{n}% LOAD".
12. **Footer badge**: the NP mark (decoration).
13. **Pack tag**: "Night Pursuit · Experimental".
14. **Status line**: "Scanner idle" or "Scanner chase", then "· Mode {MODE}".
15. **Yoke motif**: decoration.
16. **Hot state**: the whole HUD restyles (`np-hot`, `data-mode`) in PURSUIT / POWER, including the faster scanner.

### Controls
1. **Drive mode rail**: the one interactive control. It is the "Drive mode" group of 4 toggle buttons: **POWER**, **AUTO** (amber), **NORM** (amber), **PURSUIT** (`aria-pressed`, at least 48 px tall, 84 px wide or 72 px stacked). The choice persists through the pack runtime (`setPackMode`) and is shared with audio.

### Not on the NP HUD, but on screen around it (the Drive shell; keep room)
- Hold to rev, Shutdown, the demo Throttle card, the Tuner, and Auto/Manual come from the Drive page, not NP. They are listed so the sheet leaves them space.

### Layout facts the sheet must replace
- The mount scales its own boxes: `wide` 880×400, or `stack` 600×640 at a window width of 900 or less, at a minimum scale of 0.5. It does not use `useFitBox` or `pickRfLayout` yet.
- Compact mode (in the drive window, or automatically when 9 px design text would render under 11 px) **drops** the
  Load and Engine bars, both sensor pods and the footer (badge, tag, status, yoke). Under the contract that is not allowed without `optionalIn` and a stated new home.
- Its smallest design text is 9 px (bar labels, tach scale). That is under the 11 px floor unless the scale is at least 1.23. The sheet should author 11 px or larger at the box size.

### Waiting on unmerged NP branches (not in cf236b9; the sheet may want cells for them)
- `skin/night-pursuit-radar`: CRT A becomes a half-moon radar scope (rings, 10° ticks, chevron, 3.5–1 s sweep, 7 contacts, afterglow; static under Reduce Motion).
- `skin/night-pursuit-mode-rail`: a "Drive mode" caption plus physical keycaps AUTO / CRUISE (was NORM) / PURSUIT, each with a lamp. POWER is retired.
- `frontend/np-drive-modes`: a real AUTO mode (it engages pursuit at throttle ≥ 0.80 held for 400 ms and drops out at ≤ 0.35 after 2 s), plus an "auto engaged" lamp.
