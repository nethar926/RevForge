# Quiet Current HUD overlay

A calm, flat EV instrument card: one teal accent, monochrome neutrals, a big
tabular speed numeral, a 240° motor-output arc and a centre-zero power/regen
bar. Two variants share the same markup:

- **standard**: soft-radius surfaces, no texture.
- **cyber**: brushed-steel frame (CSS gradients only), chamfered top-left and
  bottom-right corners, 1px hairline edges, text only on solid plates. The
  accent stays teal here too.

The overlay is display-only. It reads its props and never writes app settings,
storage or global state. Frontend owns mounting, the pack registry and any
controls.

```tsx
import { QuietCurrentOverlay } from './skins/quiet-current';

<QuietCurrentOverlay
  speed={47} units="mph" powerKw={62} driveState="D" rpmNorm={0.42}
  appearance={settings.appearance} variant="standard"
  solidSurfaces={settings.solidSurfaces} isMoving={useIsMoving()}
  motion={settings.animatedEnvironment}
/>
```

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `speed` | number | — | Speed already in `units`. Wins over `speedMph`. |
| `speedMph` | number | — | Converted to km/h when `units="kph"`. |
| `units` / `unit` | `'mph' \| 'kph'` | `'mph'` | `unit` is an alias. |
| `powerKw` | number | — | Signed: positive = power, negative = regen. |
| `maxPowerKw` | number | 250 | Full scale for the power side. |
| `maxRegenKw` | number | 80 | Full scale for the regen side. |
| `power` | number | — | Signed fraction -1..1, used when `powerKw` is absent. |
| `driveState` | `'P' \| 'R' \| 'N' \| 'D'` | — | Wins over `gear`. |
| `gear` | number | — | 0 = N, > 0 = D, < 0 = R. |
| `rpm` / `redlineRpm` | number | — / 7000 | Arc = rpm / redlineRpm. |
| `rpmNorm` | number | — | 0..1, wins over rpm. |
| `appearance` | `'auto' \| 'light' \| 'dark'` | `'dark'` | From app settings. `auto` follows `prefers-color-scheme` live. |
| `variant` | `'standard' \| 'cyber'` | `'standard'` | |
| `solidSurfaces` | boolean | false | From app settings. Replaces the steel texture with a solid plate. |
| `isMoving` | boolean | false | From `useIsMoving()`. Hides the kW readout (at most 3 numbers) and turns off all transitions. |
| `motion` | boolean | true | `false` = no transitions (same as a `.motion-off` ancestor). |
| `demo` | boolean | false | Caption reads "Demo" instead of "GPS". |

`appearance`, `solidSurfaces` and `isMoving` are read-only inputs. The
component only reflects them as `data-appearance`, `data-solid` and
`data-moving` on `.qc-root`.

## Design notes

- **Tokens**: literal hex custom properties on `.qc-root` (dark default,
  `[data-appearance="light"]`, and both cyber appearances). No `color-mix()`,
  so it works on Chromium 88.
- **Type**: Inter 400/500/600 if the app provides it, else the system UI font.
  Speed `clamp(4.5rem, 15vmin, 8rem)`, meter `clamp(2.5rem, 8vmin, 4rem)`,
  drive state 1.75rem, 13px minimum for any HUD text. Sizes are in rem so
  the in-app Text Size setting scales them. Tabular figures throughout.
- **Not colour alone**: the active drive state is bold, full-contrast and
  underlined; regen is hatched and labelled; PEAK is a text badge plus a
  thicker arc stroke.
- **Contrast** (measured from computed colours): speed numeral ≥ 15:1 in all
  appearances; every text label ≥ 4.99:1; arc fill and drive underline
  ≥ 4.25:1 against their backgrounds.
- **Motion**: only a 200ms (cyber 140ms) colour cross-fade when switching
  appearance. Nothing animates under `prefers-reduced-motion`, a
  `.motion-off` ancestor, `data-motion="off"` or while moving.
- **Solid fallback**: `prefers-reduced-transparency`, `prefers-contrast: more`,
  `forced-colors` and `solidSurfaces` all swap the steel texture for a solid
  plate; high contrast also thickens hairlines and borders.
- **Layout**: speed and arc sit side by side on wide windows and stack below
  ~620px. Tested at 760×560, 1254×784 and 1920×1200 with no overflow. No
  hover- or pointer-based device detection.
- **Screen readers**: the root is a labelled group; drive-state letters carry
  full words; a polite live summary updates at most every 5 s, or immediately
  when the drive state changes.
- **Focus**: `:focus-visible` draws a 2px teal outline (inset in cyber so the
  chamfer clip never cuts it) for any control Frontend puts inside the card.

## Fonts

No font files are bundled here. To get Inter, self-host InterVariable.woff2
(SIL OFL 1.1) with its licence text and an `@font-face` named "Inter".
