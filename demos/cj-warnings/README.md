# Carrier Jet cockpit-warning demos (review only)

DEMO sounds for review — not wired into the app.

All four files were **procedurally generated** by `generate.mjs` in this folder
(pure oscillators + envelopes, Node, offline). No samples, recordings, film/game
audio, real cockpit recordings, or speech synthesis were used.

| File | Description |
|---|---|
| `stall-warning-a.mp3` | Hi-Lo two-tone, 1000/700 Hz, ~5 Hz alternation (Hi+Lo cycle), 4 s |
| `stall-warning-b.mp3` | Softer Hi-Lo, 800/600 Hz, ~4 Hz, near-pure sine, 4 s |
| `master-caution-a.mp3` | Original short double chime, ~3 s, pattern played twice |
| `master-caution-b.mp3` | Original single descending two-note chime (A5→E5), ~3 s, played twice |

Peaks ≤ -3 dBFS (≈ -4.8 dBFS decoded), DC removed, raised-cosine fades.

Regenerate:

```sh
node generate.mjs /tmp/out
for f in /tmp/out/*.wav; do ffmpeg -i "$f" -codec:a libmp3lame -b:a 192k "$(basename "${f%.wav}").mp3"; done
```
