# Night Pursuit readout labels (approved by Meghan, signed off by Nova, 2026-10-18)

Today every NP pod is `aria-hidden`; the only spoken readout is ThemeStage's line
("Speed N miles per hour, N RPM, gear N"). These labels cover the readouts it misses.
Approved; Reid builds from this file.

| Readout | Role | aria-label | aria-valuetext | Source |
|---|---|---|---|---|
| MPH 7-seg (velocity pod) | hidden span, no role | none | none; span reads "Speed {n} miles per hour" (NP always draws MPH) | `mph` |
| RPM 7-seg (tach pod) | hidden span, no role | none | none; span reads "Engine RPM {n}" | `rpmShown` |
| GEAR readout | hidden span, no role | none | none; span reads "Gear {n}", or "Gear neutral" for N; no gear readout at all when gear is null | `gearText` |
| THROTTLE bar (full, and compact at 773x601 only) | meter, 0 to 100 | Throttle | "{n} percent" | `thr` |
| LOAD bar | meter, 0 to 100 | Engine load | "{n} percent" | `load` |
| ENGINE bar | meter, 0 to 100 | Engine speed | "{n} percent of redline" | `rpm`, n = round(clamp(rpm, 0, 1) x 100) |
| CRT B screen | group | Sensor pods | none | wraps the three lines below |
| CRT B line 1 | text | none | reads "System pursuit" in PURSUIT or POWER mode, otherwise "System monitor" | `pursuitHot` |
| CRT B line 2 | text | none | reads "{n} percent throttle"; aria-hidden while the THROTTLE bar is on screen | `thr` |
| CRT B line 3 | text | none | reads "{n} percent load"; aria-hidden while the LOAD bar is on screen | `load` |

Rules
- Whole percents, rounded the same way as the visible CRT B text.
- No aria-live on any of these: the values change many times a second and would talk over the driver. They read when focused or browsed.
- One exception (Meghan, 2026-10-18): the AUTO transition announcer (91f183b, "Auto: Pursuit engaged" / "Auto: back to Cruise") is the pack's single polite live region, because it is one event per change. Guard it: at most one announcement every 3 seconds; if AUTO flips back and forth near the threshold inside that window, only the latest state is spoken when the window ends; never announce the same state twice in a row.
- Speed, Engine RPM and Gear replace ThemeStage's combined line for this pack (Meghan, 2026-10-18). ThemeStage is shared code outside src/skins, so Scott or Reid decides how the combined line is suppressed for NP.
- Keep the individual 7-seg digit SVGs, scanner, voice box and glyph `aria-hidden` (decorative; the hidden spans and meters above carry the spoken values).
- CRT B lines use a visually hidden span for the spoken words; the visible "THR"/"LOAD" abbreviations stay as drawn.
- Meters carry aria-valuemin 0, aria-valuemax 100 and aria-valuenow n. Role and name go on a wrapper around SegBar, because SegBar's own `.np-bar` div is `aria-hidden`.
- aria-valuetext is only for the meters. Speed, Engine RPM and Gear speak through a visually hidden span next to each 7-seg that holds the whole phrase, the same way CRT B does. No aria-label on plain divs or spans, since ARIA doesn't allow it there.
- Unhide only the speed, RPM and gear hidden spans, the bar stack and the CRT B screen from their pods' `aria-hidden`. In compact, the speed and gear spans and `np-c-thr` sit inside the hidden `np-c-speed` section and the RPM span inside `np-c-tach`, so pull them out or unhide them on their own.
- 844x390 has no bars and neither compact size has CRT B today; the new cell plans bring them back and these labels apply there too.
- Each value is spoken once (Meghan, 2026-10-18): whenever the matching THROTTLE or LOAD bar is rendered, its CRT B line is aria-hidden, so CRT B reads only "System monitor" or "System pursuit". If a layout drops a bar, unhide that bar's CRT B line so the value is still announced.
