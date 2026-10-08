# Carrier Jet skin (`src/skins/carrier-jet/`)

One swing-wing HUD with three looks, chosen with a CARRIER JET / TOMCAT / SWING WING tab group.
Each tab shows the same name as that look's header label:

| variant id | tab = header label | concept board |
|---|---|---|
| `carrier-jet` | CARRIER JET | A · faithful cockpit (B612 + VT323, green CRTs) |
| `tomcat` | TOMCAT | B · modern glass (Barlow Semi Condensed, HUD on black) |
| `swing-wing` (**default**) | SWING WING | C · carrier-deck night (Oswald numerals + Barlow Semi Condensed labels) |

Every header also carries the small `F-14` chip. `src/skins/aerospace-f14/` is untouched.

## API

```ts
import { CarrierJetHud, CARRIER_JET_VARIANTS } from '../skins/carrier-jet';
<CarrierJetHud {...packHudProps} abZone={zone} driveWindow={dw} compact={dw || undefined} />
```

- PackHudProps (speed, unit, rpm, gear, throttle, load, motion, redlineRpm, running, demo, …). Only speed, rpm and gear are required.
- `variant?: 'carrier-jet' | 'tomcat' | 'swing-wing'` with `onVariantChange?(v)`. Without a handler the skin persists
  the choice itself under `storageKey('revforge.pack.carrier-jet.variant')`, which becomes `rf.preview.carrier-jet.…` on the preview build.
  It uses the same pattern as Stellar Helm's frame toggle.
- `driveWindow?: boolean`. An ancestor `[data-drive-window="true"]` also turns it on.
- `compact?: boolean | 'auto'`. `true` gives the essential layout. `'auto'` switches to it when the container is under 980×520.
- `abZone?: number` (0..5). It is used as given, in the same render. Without it the zone comes from load, then throttle.
- `parked?`, `heading?`, `accel?` are optional extras. Parked defaults to speed < 0.5 mph held for 2 s.

Drive window and compact use the essential layout: speed, gear, RPM + bar, wing sweep (digits, planform, tape), label
and one status pill. No tab group is rendered there, which matches Stellar Helm's toggle. Everything else is not rendered.
Hosts that mount full-bleed can reserve space at the bottom with the CSS variable `--cj-reserve-bottom: 120px`.

## Preview harness (dev only)

    npm run dev
    open /src/skins/carrier-jet/preview/index.html?cjDemo=cruise&cjVariant=swing-wing
    #   cjDemo=parked|cruise|high|sweep  cjVariant=carrier-jet|tomcat|swing-wing  cjDw=1|0  cjStill=1  cjDock=0
    #   omit cjVariant to exercise the skin's own persistence

## Fonts (SIL OFL 1.1)
`fonts/B612-700.woff2`, `fonts/VT323-400.woff2` and `fonts/BarlowSemiCondensed-{500,600,700}.woff2` are Latin subsets
(none of these fonts has a Reserved Font Name). Their licences sit next to them and are copied to `public/fonts/`.
Oswald is reused from `src/assets/fonts` (licence already in `public/fonts/OFL-Oswald.txt`).
Saira SemiCondensed, from concept C, was swapped for Barlow Semi Condensed: one font family fewer, and Saira has a Reserved Font Name.
