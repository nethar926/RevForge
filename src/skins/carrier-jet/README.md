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

- PackHudProps (speed, unit, rpm, throttle, load, motion, redlineRpm, running, demo, …). Only speed and rpm are required.
  There is no gear readout in any look or layout (`gear` is accepted and ignored; no shift indicator or animation).
  The old gear slot holds a MACH readout (`M 0.85`, number from speed via `mphToMach`: 0..75 mph → M 0..1.00,
  75..120 mph → M 1.00..2.30, clamped) over a small sound-barrier tape with a fixed M 1.0 barrier mark. The vapor cone
  and SUPERSONIC tag follow `abZone > 0` (Audio's zone), not road speed. Screen readers get `Mach 0.85` (+ `, supersonic`).
  Static art, no animation.
- `variant?: 'carrier-jet' | 'tomcat' | 'swing-wing'` with `onVariantChange?(v)`. Without a handler the skin persists
  the choice itself under `storageKey('revforge.pack.carrier-jet.variant')`, which becomes `rf.preview.carrier-jet.…` on the preview build.
  It uses the same pattern as Stellar Helm's frame toggle.
- `driveWindow?: boolean`. An ancestor `[data-drive-window="true"]` also turns it on. It only sets `data-drive-window`; nothing is dropped.
- `compact?: boolean | 'auto'`. `true` sets `data-compact` and reflows the board; `'auto'` does so when the container is under 980×500
  (a 1280×800 screen mounts at about 1248×518 and keeps the full layout). An explicit `false` wins (no ancestor flag turns compact
  on), but the board still lays itself out to fit: any container under 980×500 gets the reflowed arrangement (`data-layout="reflow"`).
- `abZone?: number` (0..5) from Audio's getAfterburnerZone / onAfterburnerZoneChange drives the AB lights, the AB readout and the status
  pill, as given, in the same render. The skin has no AB thresholds of its own (Audio decides when the burner engages, e.g. by speed);
  without a zone the AB display reads AB OFF.
- `parked?`, `heading?`, `accel?` are optional extras. Parked defaults to speed < 0.5 mph held for 2 s.

### Compact = the full board, reflowed (Wilson's rule)
There is no separate compact design. `CockpitCompact` / `GlassCompact` / `DeckCompact` render every block of the full board
for that look (header label, F-14 chip, GPS + status pills, the Look tabs, speed, RPM + bar, wing sweep digits, planform,
tape + mode windows, pitch ladder, heading, AoA + indexer, accel ball, engine strips and AB ladder) and only rearrange them:
dense SVG instruments get their own cells, the grid follows the container (container units, numeral cells are size containers).
Text stays >= 11px after the SVG viewBox shrink (`--cj-sv` floor), the Look tabs stay >= 44px, no `transform: scale()`.
Every block carries `data-cj-el="…"`, so tests and gates compare compact against the full board element by element.
The Look tabs (CARRIER JET / TOMCAT / SWING WING) render in every layout, including compact and the drive window.
### Phone layouts (Frontend's layout picker)
The picker puts `data-rf-layout="board|window|portrait|phone-landscape"` on the pack mount root. The HUD reads it from its
ancestors; `portrait` and `phone-landscape` always use the reflowed board, and every phone CSS rule is scoped under
`[data-rf-layout="portrait"] .cj …` or `[data-rf-layout="phone-landscape"] .cj …` (no width-only media rules), so the
board, window and desktop layouts are untouched.
- `phone-landscape`: each look laid out natively at 16:9 (about 656×369 inside a 750×369 safe area), centred with side
  padding. The mount supplies the safe-area rect (env(safe-area-inset-*)); the skin adds none of its own.
- `portrait`: the same reflowed board with its three groups stacked (header wraps, Look tabs get their own full-width row).
No transform scale; text >= 11px, targets >= 44px.

Hosts that mount full-bleed can reserve space at the bottom with the CSS variable `--cj-reserve-bottom: 120px`.

## Preview harness (dev only)

    npm run dev
    open /src/skins/carrier-jet/preview/index.html?cjDemo=cruise&cjVariant=swing-wing
    #   cjDemo=parked|cruise|high|sweep  cjVariant=carrier-jet|tomcat|swing-wing  cjDw=1|0  cjStill=1  cjDock=0
    #   hudCompact=1|auto|0  cjBox=757x347 (pin the container)  cjRf=portrait|phone-landscape  cjSafe=T,R,B,L
    #   omit cjVariant to exercise the skin's own persistence

## Fonts (SIL OFL 1.1)
`fonts/B612-700.woff2`, `fonts/VT323-400.woff2` and `fonts/BarlowSemiCondensed-{500,600,700}.woff2` are Latin subsets
(none of these fonts has a Reserved Font Name). Their licences sit next to them and are copied to `public/fonts/`.
Oswald is reused from `src/assets/fonts` (licence already in `public/fonts/OFL-Oswald.txt`).
Saira SemiCondensed, from concept C, was swapped for Barlow Semi Condensed: one font family fewer, and Saira has a Reserved Font Name.
