# Carrier Jet · MATRIX · MAP cell live map (style only)

`style.ts` holds the MapLibre GL style and pure helpers for the MAP cell, after the approved
`drivesynth-skins/carrier-jet/live-map` sheet (BUILD.md). There is no renderer wiring yet and `maplibre-gl` is not a dependency.

- Sources: `ofm` OpenFreeMap vector (OpenMapTiles schema, TileJSON `https://tiles.openfreemap.org/planet`),
  `dem` AWS terrarium raster-dem (tileSize 256, maxzoom 12). No keys, no glyphs, no sprite, no symbol layers.
- Layers, bottom to top: background `#041009`, hillshade, water fill + outline, waterway, roads minor → motorway (glow under core).
- `buildCjMapStyle({ terrain: false })` drops `dem` and `hillshade`. Pair it with `CJ_MAP_CREDIT_NO_TERRAIN`.
- Wiring sketch:
  ```ts
  import { buildCjMapStyle, CJ_MAP_OPTIONS, zoomForRangeMi } from '../map/style'; // src/skins/carrier-jet/map/style.ts
  const map = new maplibregl.Map({ container, style: buildCjMapStyle() as StyleSpecification, ...CJ_MAP_OPTIONS,
    center: [lon, lat], zoom: zoomForRangeMi(2, lat, container.clientHeight), bearing: 0 });
  ```
  Use `jumpTo` at most 2 Hz (`CJ_MAP_UPDATE_HZ`), gate on `shouldRender(...)`, show `cjMapStatus(...)` in `.cjv2-br`,
  and draw ≤ `CJ_MAP_MAX_STREET_LABELS` street names as HTML spans (see BUILD.md).

## Heading (compass cell)

- `declination.ts`: `magneticDeclinationDeg(lat, lon, altKm = 0, date = new Date())`, east positive, offline NOAA WMM2025
  (public domain, coefficients embedded from WMM.COF, valid 2025–2030; matches NOAA's test values to 0.01°).
  `trueToMagnetic(trueHdg, decl)`.
- `heading.ts` (no React, import on its own): `smoothHeading(prev, next, alpha)` shortest-arc easing across 359/0,
  `formatHeading(deg, 'T' | 'M')` → `'040 T'`, `headingLegendLines(...)`.
- `HeadingLegend.tsx`: `<CjHeadingLegend trueHdg magHdg lead="M" stale={headingStale} />` shows 'HDG 047 M' large
  (18px) over 'HDG 040 T' small (11px). `lead` defaults to 'M'. `stale` dims both values to 0.45.
