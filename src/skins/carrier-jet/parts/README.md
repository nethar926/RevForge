# Carrier Jet · cold-start parts (presentational)

Stateless React parts for the cold-start hardware, after the approved v2 concept sheet
(`drivesynth-skins/carrier-jet/cold-start/v2`). Props in, intents out; the host owns every state machine,
timer and gesture. Prop interfaces: `../types.ts`. Sizes and pure helpers: `tokens.ts`. Import from
`./parts/index` (the sibling `../parts.tsx` is the HUD gauges).

- Fixed-viewBox SVGs that scale to their container width. 1 unit = 1 CSS px at the `*_MIN` size, smallest
  text 11 units, smallest target 44 units, so at or above `*_MIN` text stays >= 11px and targets >= 44x44.
- Ids are Dan's system ids from `getJetSystemList()`; the shelf renders whatever list it is given.
- Reduce Motion is CSS only: `@media (prefers-reduced-motion: reduce)` or any `[data-rf-reduce-motion]` ancestor.
- Dev gallery (not linked from the app): `npx vite`, then `/src/skins/carrier-jet/parts/gallery/index.html`.

| part | min (w×h) | slot |
|---|---|---|
| `BatToggle` | 60×96 | shelf cell |
| `GuardedCover` over a toggle | 60×140 | shelf cell (L/R ENG) |
| `ApuBlock` / `GndAirBlock` | 128×140 / 140×96 | shelf POWER group (`block` prop) |
| `SwitchShelf` | 735×374 (APU list, guards on L/R ENG) | reflow board box: 1248×641 (1280), 757×376 (773) |
| `PullHandle` | 76×118 / 66×118 narrow | bank, right of the AB guard (the guard stays leftmost, nearest the driver); grip 64×44 |
| `QuickStartGuard` | 118×118 / 96×118 narrow | bank |
| `GpsPlate` | 50×118 / 44×118 narrow | bank, beside the AB guard |
| `RadarToggle` | 56×118 / 44×118 narrow | beside GPS |
| `GpsRadarPlate` | 107×118 (1280) / 89×118 (773) | bank, guard end |
| `BezelKey` | 52×66 (key 44×44) | MFD edge |
| `ShutdownGuard` | 108.67×48 fixed (cover 108.67×48 closed / 46×48 open, switch 62.67×48) | bottom row, in place of the Shutdown plate |
