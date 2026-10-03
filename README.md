# RevForge

The default drive dashboard now combines **RevForge’s native synthesis and 13 animated scenes** with DriveSynth’s engine library, builder and cockpit themes. RevForge voices retain their original sound algorithms; nine DriveSynth voices remain available in the Garage.

Start in **Demo**, tap **Start engine**, and raise Throttle. Choose **Manual** to shift (↑ / ↓), **N** to free-rev, hold **Space** to accelerate, or hold **B** to brake. Open settings and turn **Demo mode** off to grant browser location access. DEMO appears beneath the speedometer whenever simulation is selected. The native **Synth studio** edits and saves RevForge voices, including turbo, crackle, blow-off.

Use Node 24. Run `npm ci`, `npm test`, `npm run dev`, and `npm run build`. The production build and 30 audio/drivetrain/media-action/flight-envelope tests pass. **Tesla hardware validation is still pending.** See [merge notes](docs/revforge-merge.md) for provenance, behavior and review details. The original cockpit is retained at `#/cockpit`; its manual gear display is legacy behavior. New physical gearing is on `#/drive`.

Theme Lab adds Minimal, Gauge Cluster, Cockpit and RoadView families. Galactic Enforcer and Ion Twin HUDs use FT Aurebesh numbers and Oswald descriptors (both SIL OFL 1.1; licences ship in `public/fonts/`).

Experimental media controls are off by default in settings: pause upshifts in Manual when enabled, next/previous shift up/down, and pause stops in Automatic. Touch Stop always stops. Settings includes GPS and received-media-action diagnostics. The user’s Tesla field test found no media-button shifting and no background audio. These are unsupported in the tested build; use touch shifting or Automatic and keep the browser visible. GPS still needs a live speed/accuracy reading; API availability is not hardware verification.

Idle jitter has a persistent toggle and intensity slider in settings. Jet Simulation and Twin-Ion signature are per-sound options in Builder and Synth studio, stored in custom voices and combinations. Thrust starts 300 RPM above idle, and afterburner requires high RPM and throttle; lifting off removes thrust/afterburner. The F-14 theme reuses the original DriveSynth AerospaceF14Overlay. Existing storage keys and repository URL remain stable.

The original project notes below describe the retained DriveSynth engine and editor.

**Free** Tesla in-car engine-sound web app. Procedural Web Audio only — original software.

## Quick start

```bash
cd DriveSynth
npm install
npm run dev      # http://localhost:5173
npm run build    # production → dist/
npm run preview  # serve dist locally
```

Open on a phone or laptop first, then bookmark the HTTPS URL in **Tesla Browser**.

## Tesla Browser tips

1. **Bookmark** the deployed HTTPS URL (do not rely on PWA / add-to-home-screen).
2. Complete setup **Parked**: tap **Start / Resume Engine** (user gesture unlocks `AudioContext`).
3. Tap the GPS badge to allow location — speed drives pitch; Δspeed proxies throttle.
4. No GPS / denied? Enable **Manual speed** + hold the **REV** pad.
5. **Keep the Browser tab open** — backgrounding may pause audio and sensors.
6. Avoid native OS volume extremes that mask sirens/nav; entertainment only.
7. Prefer landscape; targets are ≥48px for capacitive glass.

## Routes

| Route | Purpose |
|-------|---------|
| `/` or `/drive` | Driving HUD (default) |
| `/engines` | Free pack picker (all unlocked) |
| `/customize` | Themes, density, gauges, mapping (`localStorage` `drivesynth.ui.v1`) |
| `/builder` | Independent skin + sound combinations, 40 dynamic themes and audition preview |
| `/sound-builder` | Advanced node graph editor and sound patch import/export |

Hash routing (`#/drive`) is used so static hosts work without rewrite rules.

## Built-in engines (procedural)

- **V8 Rumble** (`v8-rumble`) — AudioWorklet pulse-train ICE + Karplus–Strong exhaust (oscillator fallback)
- **I4 Zip** (`i4-zip`) — even-fire four-cylinder pulse path
- **Rotary Hum** (`rotary-hum`) — chamber-pulse rotary ICE
- **EV Whine** (`ev-whine`) — inverter-style whine + buzz
- **Twin Ion** (`ion-twin`; remaps legacy `tie-fighter`) — twin-ion carriers + multi-formant howl + wet-road hiss — **procedural only, no samples**

## Audio API

```ts
interface EngineSynth {
  start(): Promise<void>;
  stop(): void;
  dispose(): void;
  setDriving(d: { speed: number; throttle: number; load?: number; reverse?: boolean }): void;
  setParams(p: Partial<EngineParams>): void;
  getParams(): EngineParams;
  toPatch(): EnginePatch;
  fromPatch(patch: EnginePatch): void;
  /** Soft UI cues: 'upshift' | 'starter' | 'shutdown' (see docs/frontend-starter-shutoff-cues.md). */
  triggerUiCue?(cue: 'upshift' | 'starter' | 'shutdown' | string): void;
  playStarter?(): void;
  playShutoff?(): void;
  setUpshiftSfxEnabled(enabled: boolean): void;
  getUpshiftSfxEnabled(): boolean;
}
```

Frontend maps mph → `speed` 0..1 via `mphToSpeed`. Audio owns RPM curves and smoothing.

**Frontend upshift cue:** when MANUAL paddle up and upshift SFX is on, call `eng.triggerUiCue('upshift')` (short mechanical bark; does not pitch-jump the drive stack). Pref key `ds-upshift-sfx` / Customize “MANUAL upshift bark”.

**Ignition / Shutdown SFX:** call `eng.triggerUiCue('starter')` after Start and `eng.triggerUiCue('shutdown')` before Stop — procedural per active pack (ICE / jet / Ion Twin / EV). See `docs/frontend-starter-shutoff-cues.md`.

## Key files

```
src/audio/EngineSynthImpl.ts   # Web Audio graphs + pulse worklet + driving mapping
src/audio/worklets/             # AudioWorklet processors (also copied to public/worklets)
src/audio/types.ts             # EngineSynth / EnginePatch contracts
src/audio/builtins.ts          # Free built-in patches
src/pages/DrivePage.tsx        # HUD, GPS, Rev pad
src/pages/EnginesPage.tsx      # Pack picker
src/pages/CustomizePage.tsx    # Themes / gauges
src/pages/BuilderPage.tsx      # Synth builder
src/hooks/useUiPrefs.ts        # drivesynth.ui.v1
src/hooks/usePatches.ts        # drivesynth.patches.v1
src/app/App.tsx                # Routing + wiring
```

## Legal / safety

- Original synthesis and UI. Inspired by public Tesla engine-sound UX patterns only.
- Do not ship copyrighted movie/game samples.
- Entertainment only — do not handle the screen while driving; GPS ≠ speedometer.

## Stack

Vite · React · TypeScript · Web Audio · React Router · Tailwind CSS v4
