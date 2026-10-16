# Twin Ion — recorded stems (provenance)

The Twin Ion voice (hidden sci-fi twin-ion engine pack) can lead with recorded stems from
`public/audio/ion-twin/`. This note records where that audio comes from and how it is used.

## Provenance

- Source: six clips, `refs/ion-twin-2026-09-20/ref1.wav` … `ref6.wav`.
- Wilson Nicklaus attested on **Oct 8 2026** that these are his own original recordings.
- On that basis, and only for these clips, recorded stems are allowed in this repo. They are
  used **only** by the Twin Ion pack. No other pack loads them, and no other third-party or
  external audio is included.
- `ref4` is not used.

## Segment map

| Stem segment | Source | Span used | Role |
| --- | --- | --- | --- |
| `sustain` | ref6 | 0–6.545 s | steady roar (granular loop) |
| `target` | ref3 | 0–2.18 s | targeting / lock cue (one-shot) |
| `hum` | ref2 | 0–8 s | interior hum at idle (granular loop) |
| `shutdown` | ref5 | 0–12 s | shutdown cue; played reversed it is the ignition |
| `accel` | ref1 | 0.5–3.45 s | pull-away acceleration (no Doppler), crossfades into the ref6 roar |

Each segment is split offline into band stems (motor < 200 Hz, howl 200 Hz–1.5 kHz,
scream 1.5–6 kHz, air > 6 kHz) plus a transient (grit) stem. The masks sum to one, so the
stems add back up to the source. Every stem ships as Opus/WebM and AAC/M4A. `manifest.json`
lists segment lengths and loudness normalisation. Stems load from
`import.meta.env.BASE_URL + 'audio/ion-twin/'`, so they also work under sub-path deploys.

## Fallback

The procedural Twin Ion voice is still the base layer and the fallback:

- `?ionStems=0` forces the procedural voice only. `?ionStems=1` forces the stems on.
  This is a URL-only switch; nothing is stored.
- If the manifest is missing, or a fetch or decode fails, the procedural voice plays alone.
- `getIonTwinStemStatus()` / `window.__ionTwinStems()` report what loaded and what is playing.
