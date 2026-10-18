# Night Pursuit readout labels (draft, Ivy, 2026-10-18, for Meghan's review)

Today every NP pod is `aria-hidden`; the only spoken readout is ThemeStage's line
("Speed N miles per hour, N RPM, gear N"). These labels cover the readouts it misses.
Reid wires them only after Meghan approves.

| Readout | Role | aria-label | aria-valuetext | Source |
|---|---|---|---|---|
| MPH 7-seg (velocity pod) | labeled wrapper | Speed | none; hidden span reads "{n} miles per hour" (NP always draws MPH) | `mph` |
| RPM 7-seg (tach pod) | labeled wrapper | Engine RPM | none; hidden span reads "{n} RPM" | `rpmShown` |
| GEAR readout | labeled wrapper | Gear | none; hidden span reads "{n}", or "neutral" for N; no gear readout at all when gear is null | `gearText` |
| THROTTLE bar (full, and compact at 773x601 only) | meter, 0 to 100 | Throttle | "{n} percent" | `thr` |
| LOAD bar | meter, 0 to 100 | Engine load | "{n} percent" | `load` |
| ENGINE bar | meter, 0 to 100 | Engine speed | "{n} percent of redline" | `rpm`, n = round(clamp(rpm, 0, 1) x 100) |
| CRT B screen | group | Sensor pods | none | wraps the three lines below |
| CRT B line 1 | text | none | reads "System pursuit" in PURSUIT or POWER mode, otherwise "System monitor" | `pursuitHot` |
| CRT B line 2 | text | none | reads "{n} percent throttle" | `thr` |
| CRT B line 3 | text | none | reads "{n} percent load" | `load` |

Rules
- Whole percents, rounded the same way as the visible CRT B text.
- No aria-live on any of these: the values change many times a second and would talk over the driver. They read when focused or browsed.
- Speed, Engine RPM and Gear replace ThemeStage's combined line for this pack (Meghan, 2026-10-18). ThemeStage is shared code outside src/skins, so Scott or Reid decides how the combined line is suppressed for NP.
- Keep the individual 7-seg digit SVGs, scanner, voice box and glyph `aria-hidden` (decorative; the readout wrappers above carry the labels).
- CRT B lines use a visually hidden span for the spoken words; the visible "THR"/"LOAD" abbreviations stay as drawn.
- Meters carry aria-valuemin 0, aria-valuemax 100 and aria-valuenow n. Role and name go on a wrapper around SegBar, because SegBar's own `.np-bar` div is `aria-hidden`.
- aria-valuetext is only for the meters. Speed, Engine RPM and Gear speak through a visually hidden span inside a labeled wrapper around each 7-seg, the same way CRT B does.
- Unhide only the speed, RPM and gear wrappers, the bar stack and the CRT B screen from their pods' `aria-hidden`. In compact, the speed and gear wrappers and `np-c-thr` sit inside the hidden `np-c-speed` section and the RPM wrapper inside `np-c-tach`, so pull them out or unhide them on their own.
- 844x390 has no bars and neither compact size has CRT B today; the new cell plans bring them back and these labels apply there too.
- Open for Meghan: in full layout CRT B lines 2 and 3 repeat the THROTTLE and LOAD bars, so screen readers hear each value twice. Kept as written; the alternative is aria-hidden on lines 2 and 3.
