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
| `sustain` | ref6 | 0–6.545 s (loops from 0.5–2.15, 2.15–3.6, 3.6–4.7 s) | steady roar (seamless loops) |
| `target` | ref3 | 0–2.18 s | targeting / lock cue (one-shot) |
| `hum` | ref2 | 0–8 s (loop from 0.1–7.4 s) | interior hum at idle, a touch of it under the cruise (seamless loop) |
| `shutdown` | ref5 | 0–12 s | shutdown cue; played reversed it is the ignition |
| `accel` | ref1 | 0.5–3.45 s | pull-away acceleration (no Doppler), crossfades into the ref6 roar |

Each segment is split offline into band stems (motor < 200 Hz, howl 200 Hz–1.5 kHz,
scream 1.5–6 kHz, air > 6 kHz) plus a transient (grit) stem. The masks sum to one, so the
stems add back up to the source. Every stem ships as Opus/WebM and AAC/M4A. `manifest.json`
lists segment lengths and loudness normalisation. Stems load from
`import.meta.env.BASE_URL + 'audio/ion-twin/'`, so they also work under sub-path deploys.

## Seamless continuous bed (Oct 2026)

The continuous roles used to be granular (random grain positions over the whole clip, 70 ms
crossfades, per-grain level compensation). ref6 is not stationary: its howl formant sits near
930 Hz over 0.5–2.15 s, 400 Hz over 2.15–3.6 s and 720 Hz over 3.6–4.7 s, and its level swells,
so each grain landed on a different formant / level and the cruise sounded chopped.

Now, once at load (`buildIonLoop` in `src/audio/ionTwinStems.ts`, from the same decoded stems, no
other audio), each stationary region is level-flattened, cut into ~1 s chunks (forward or
reversed), joined with 0.4 s correlation-aware equal-power crossfades at the best-matching lag,
dips inside a crossfade are lifted back, and the loop point carries a baked crossfade. The three
ref6 loops (17.3 / 19.9 / 23.1 s, power weights .25 / .5 / .25 → third-octave spectrum within
0.5 dB of ref6 as a whole) and the 24.7 s ref2 hum loop each play as one looping source per stem,
started once and never restarted. Speed only moves one shared, smoothed playbackRate
(τ 0.35 s up / 0.6 s down), filter cutoffs and gains. On top: a rasp (tearing distortion) send of
the howl + scream stems, a slow flanger shimmer on scream + air, a slightly detuned (modulated
delay) copy of the howl that deepens / beats while the speed changes, and a gentle low shelf.

## Fallback

The procedural Twin Ion voice is still the base layer and the fallback:

- `?ionStems=0` forces the procedural voice only. `?ionStems=1` forces the stems on.
  This is a URL-only switch; nothing is stored.
- If the manifest is missing, or a fetch or decode fails, the procedural voice plays alone.
- `getIonTwinStemStatus()` / `window.__ionTwinStems()` report what loaded and what is playing.
