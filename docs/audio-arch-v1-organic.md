# DriveSynth Audio Architecture v1 — Organic ICE / Aerospace

**Goal:** Beat thin “synth demo” tone stacks with a free procedural system that feels mechanical and continuous from parked idle → load → redline.  
**Stable API:** `EngineSynth.setDriving({speed,throttle,load?,reverse?})`, `getDiag()`, pack ids `v8-rumble`, `i4-zip`, `aerospace-f14`.  
**Out of scope (this pass):** Ion Twin / EV rewrites unless shared graph needs a clean cut.

## Design principles

1. **Layered buses, not one oscillator** — separate mechanical body vs combustion/air (ICE), or spool vs core vs exhaust (aerospace).
2. **Character changes with load** — throttle/load open intake, brighten exhaust body, raise roughness; do not only pitch-shift a sawtooth.
3. **Anti-digital** — minimize pure square/saw “carrier bite”; prefer irregular pulse trains, filtered noise beds, slow LFOs, waveguide/body resonance.
4. **Tesla-safe** — AudioWorklet-first for ICE pulses; keep osc fallback; keep `/diag` `iceMode` / `workletError`.
5. **100% procedural / free** — no dribe samples, no IP audio.

---

## ICE (reference: `v8-rumble`)

### Buses

| Bus | Role | Sources (procedural) |
|-----|------|----------------------|
| **Mechanical** | Block / valvetrain / idle lump | Low band-limited noise + slow AM lope; light tick noise gated by roughness; *not* a square lead |
| **Combustion** | Exhaust pressure pulses | Worklet pulse-train (per-cyl), uneven V8 spacing, pulse jitter; soft asymmetric pulse envelope (not brick-wall clicks) |
| **Air / Intake** | Aspiration whoosh | Highpass/bandpass noise × throttle (and parked Rev) |
| **Body / Exhaust** | Pipe / muffler color | Short delay waveguide / multi-tap feedback on combustion bus; lowpass “muffler”; growl = sub energy from pulse, not a sine lead |
| **Master** | Limiter + stereo lean from load | Existing compressor → `output` → destination |

### Idle → load → redline continuity

| Region | Feel target |
|--------|-------------|
| **Parked idle** | Soft irregular chuff / lope; mechanical bed audible; low combustion energy; Rev pad opens intake + pulse energy without jumping to a laser tone |
| **Light load** | Pulses clearer; intake rises; waveguide body fills mid |
| **High RPM** | Pulses blur into roar; still noise+body dominated; crackle only on throttle drop |

### Key params (keep + reinterpret)

`rpmIdle`, `rpmRedline`, `rpmCurve`, `cylinders`, `pulseWidth`, `pulseJitter`, `roughness`, `growl`, `intake`, `exhaust`, `muffling`, `exhaustLength`, `exhaustFeedback`, `mufflerMix`, `crackle`, `masterGain`, `stereoWidth`

### Implementation notes

- Rework `pulse-engine-processor.js`: softer pulse shapes, stronger noise/mechanical mix, less harmonic saw stack in the worklet output.
- Osc fallback: rebuild ICE fallback as noise+filtered pulse imitation — **no** triple saw/square lead.
- Idle chuff after Start: keep, but route through mechanical/combustion buses so it matches the new idle.

---

## Aerospace (`aerospace-f14` / Carrier Jet → Harrier rename later)

### Buses

| Bus | Role |
|-----|------|
| **Spool / compressor** | Rising band-limited noise + mild irregular whine (detuned, filtered — avoid pure saw scream) |
| **Core** | Dense mid noise roar |
| **Exhaust / AB** | Low roar + throttle-linked afterburner bed; optional light “nozzle” hiss |
| **Airframe** | Very low rumble / buffeting with load |

Throttle morphs **spool ↔ wet AB**, not one oscillator sliding up.

---

## Delivery order

1. Arch note (this file)  
2. Prototype **v8-rumble** idle→rev (worklet + fallback)  
3. **aerospace-f14** twin-spool rework  
4. i4 inherits V8 path with different defaults  
5. Ping Build Lead with green commit for Pages  

## Success criteria (V8)

- Parked idle sounds lumpy / organic, not a tone generator  
- Throttle changes timbre (intake + body), not only pitch  
- Redline is a roar/blur, not a supersaw  
- `npm run build` green; `getDiag()` still accurate

## Status — aerospace-f14 + living drive (landed)

Carrier Jet rebuilt as organic 4-bus (spool/compressor · core · exhaust/AB · airframe):
band-limited spool noise + buried BPF whine, spool inertia + wander, soft AB hysteresis,
airframe buffet × load. No saw/square pack identity.

**Living drive (all packs):** throttle/load hysteresis; continuous micro-jitter on timing/gain/filters
(ICE worklet + osc fallback); stochastic valvetrain ticks; EV inverter detune wander;
optional `getHud().driveMood` (`idle`/`lope`/`spooling`/`ab`/`regen`/`cruise`/`pull`).

**Also shipped:** `i6-silk` (even-fire ICE on V8 path); EV packs `ev-inverter-climb`,
`ev-regen-howl`, `ev-dual-motor`.


---

## Acoustic cue sheet v1 (public analysis only — no sample rips)

*Folded 2026-09-20 by Audio Synth. Sources: exhaust order-tracking literature (half-orders / roughness), NASA turbomachinery noise summaries, Burtt/ILM public interviews on starfighter-effect layering. Not a license to copy any recording.*

### Why our current packs sound “digital”

| Symptom | Cause in current synth | Fix target |
|---------|------------------------|------------|
| Steady “organ” / supersaw | Stacked saw/square fundamentals | Soft irregular pulses + noise beds dominate |
| Same timbre all RPM | Pitch/gain only | Load opens intake + body/waveguide; idle ≠ mid ≠ redline recipes |
| Clean periodic buzz | Even firing / low jitter | V8 half-order lope + pulse jitter + mechanical AM |
| Laser jet scream | Pure saw carriers | Broadband spool/core roar; BPF-ish whine only as *thin* layer |
| Sci-fi = detuned osc | Missing organic + hiss recipe | Formant howl + wet-road noise (Burtt language), not film audio |

### Real ICE (what to emulate procedurally)

1. **Orders, not tones** — Exhaust is order-tracked to RPM. Firing order + harmonics dominate; **half-orders** (uneven manifolds / cross-plane) create rumble & psychoacoustic roughness.
2. **Idle** — Strong periodic pulses with irregular amplitude; low broadband; “lumpy.”
3. **Loaded run-up** — More orders fill in; roughness rises; high-freq aspiration noise with throttle.
4. **Exhaust body** — Pipe/muffler filters and resonates pulses (waveguide), not a lead oscillator.

**Synth targets (V8):** worklet pulse train with soft envelopes + V8 uneven spacing; mechanical noise bed; intake noise × throttle; exhaust delay/waveguide on combustion bus; minimize harmonic osc leads.

### Real turbine / jet (Harrier / F-14 class — public acoustics)

1. **Compressor/fan whine** — Blade-passing frequency + harmonics (thin tonal layer), especially approach/spool.
2. **Core / combustion** — Broadband mid rumble (~hundreds of Hz peak region in literature), not a sine.
3. **Jet exhaust** — Low broadband roar; afterburner = much louder hot jet + shock-associated broadband.
4. **Turbine “haystack”** — Many tones scatter into broadband aft.

**Synth targets (aerospace-f14):** spool = band-limited noise + *quiet* irregular BPF whine; core = dense mid noise; AB = low roar bed that *morphs in* with throttle (not pitch-slide a saw); airframe rumble with load.

### Sci-fi ion / fighter *design language* (Burtt — public)

Documented starfighter-effect recipe: **slowed organic bellow** + **wet pavement pass-by hiss**, aiming at dive-bomber terror.  
**Our language (original only):** moving multi-formant howl (organic scream without animal samples) + wet-road filtered noise + twin pulsed carriers as *support*, not the whole sound.

### Concrete next build steps

1. Ship V8 worklet/fallback against this sheet (in flight).  
2. Merge Product Research parked A/B cues when they land.  
3. Rework `aerospace-f14` to spool/core/AB buses.  
4. Keep Ion Twin on Burtt-language path (already closer); no SW assets.

## Research cue sheet fold-in (Product Research, 2026-09-20)

Public-knowledge acoustic targets; see `/workspace/product-research/acoustic-cue-sheet-ice-jet-scifi.md`.

### ICE (`v8-rumble`)
- Default organic pulse schedule: **per-bank 180° / 90° / 180° / 270°** (cross-plane bank unevenness), not 8× equal 90° into one bus.
- Success check: energy emphasis near **4th / 8th / 12th** engine orders via pulse + waveguide (not a static oscillator harmonic list).
- Optional burble: slight **L/R collector delay/detune** between banks.
- Soft **asymmetric** pulse envelopes; `pulseJitter` + roughness mandatory for idle lope.
- Load morphs **intake + body brightness + roughness**; crackle only on throttle drop.

### Aerospace (`aerospace-f14` / Harrier-class)
- Keep buses: spool/compressor · core · exhaust/AB · airframe.
- Add **spool inertia** (lag) so whine/noise trail throttle.
- Whine = mild detuned filtered tones **under** band-limited noise; optional high-spool **buzz-saw** cluster (quiet shaft-order tones).
- Throttle morphs **spool ↔ wet AB**; airframe buffet rises with load/hover.
- Avoid continuous synthetic screech; ban pure saw/square as pack identity.

### Anti-digital QA checklist
- [ ] No pure saw/square lead
- [ ] Idle has irregular lope / mechanical bed
- [ ] Throttle changes timbre, not only pitch
- [ ] Redline / AB is roar/blur / wet noise, not supersaw
- [ ] Body/noise buses present

### Ion Twin (landed — twin-ion-ref-analysis.md)
- **Twin motor bed:** dual irregular pulse+filtered-noise ~50–200 Hz, detune beat, spool lag; short cabin waveguide on motor only.
- **Formant howl:** 4 BP stacks ~400/700/900/1300 Hz + phrase AM; intensity × smoothstep(rpmNorm).
- **Layer leadership:** throttle morphs motor ↔ howl ↔ air (not pitch-only); wet swoosh + formant bellow dominate high rpm.
- **Grit × load;** dry-leaning wet/dry; near-mono + subtle stereoTwin; surge = rising CF.
- **Anti-digital:** no saw/square lead; procedural only — never ship ref WAVs as samples.
- IP-safe naming only (“Ion Twin” / layered ion-fighter design language).

### Legal
- 100% procedural / free; no dribe rips; no commercial samples; no Star Wars audio assets.

---

## Real Engine Simulator lessons (method only, 2026-09-20)

Public product claims from https://realenginesimulator.com/engines — **do not** rip audio or clone their catalog.

**North star:** if dropping a cylinder doesn’t change the lope, we’re still in synth-demo land.

### Fold-in priorities
1. **P0** Sample-accurate firing-order pulse trains (cross-plane vs flat-plane vs i6 even); expand pack families by geometry, not more osc leads. **Landed:** `firingFamily` + crank-angle `nextPulseTime` schedule + `firingMask` (bit i set = slot i disabled; 0 = all fire) + cylinders mute; `misfire` stochastic skips.
2. **P0** Exhaust = pulse → waveguide/resonator body (already on organic V8 path).
3. **P1** Intake bus separate; misfire/lump first-class (living-drive + optional drop-cylinder control). **Landed:** `misfire` worklet param.
4. **P1** Jets = spool inertia + broadband core + wet AB (Carrier Jet path).
5. **P2** Layout diversity as pack identity (twin limp, boxer, rotary-like chamber pulse) — original packs only.

Full Product Research note: `/workspace/product-research/realenginesimulator-lessons.md`

---

## Soft UI cues (Frontend contract)

- **MANUAL upshift bark:** call `eng.triggerUiCue('upshift')` on paddle up when Customize toggle / `ds-upshift-sfx` is on (default off). Procedural noise+knock ~80–150ms; ICE/aerospace full, EV quieter, scifi skipped. Does not alter `setDriving`.

- **Ignition starter:** call `eng.triggerUiCue('starter')` (alias `'ignition'`) or `eng.playStarter()` after `start()` / on Ignition. Procedural one-shot from the **active pack** (not a shared clip):
  - ICE — irregular crank pulses → catch lope (`firingFamily`, cylinders, pulseJitter, roughness, growl)
  - Aerospace — spool inertia climb + light igniter hiss (`spoolPitch`, `spoolInertia`, compressor)
  - Ion Twin / scifi — twin-motor bed fade-in → formant breath (`motorMix`, `formantHowl`, `formantShift`)
  - EV — inverter wake / contactor click (`whinePitch`, `inverterBuzz`)
- **Shutdown shutoff:** call `eng.triggerUiCue('shutdown')` (alias `'shutoff'`) or `eng.playShutoff()` **before** `stop()` so the output bus holds for the tail:
  - ICE — fuel-cut rundown + mechanical settle
  - Aerospace — spool decay (no hard gate)
  - Ion Twin — howl collapses into motor bed → silence
  - EV — inverter spin-down
