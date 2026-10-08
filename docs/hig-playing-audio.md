# HIG "Playing audio": RevForge audio layer

Owner: Audio Synth. Code: `src/audio/playbackSession.ts`, wired into `src/hooks/useAudioEngine.ts`.
Tests: `tests/playback-session.test.mjs`. Level check: `node scripts/hig-level-check.mjs`.

This covers sheet rows **SH-10, SH-11, SP-06, GA-07, PB-09, SB-07** in
`product-research/hig-pass-fail-by-screen.md`.

## What the audio layer now does on its own (no Frontend change needed)

| Behaviour | Where |
|---|---|
| Every engine voice feeds a **master bus**: fade gain → DynamicsCompressor (threshold −3 dBFS, hard knee, ratio 20:1, attack 2 ms, release 200 ms, built-in makeup gain cancelled) → WaveShaper soft ceiling (identity below −3 dBFS, tanh into **−1 dBFS** sample peak, cannot go above it) → speakers / media element. | `createMasterBus()` |
| Below −3 dBFS the bus is **exactly unity**. It only ever turns things down: no makeup gain, no gain above 1, and it never touches system or element volume. | |
| **Start, resume and pack switch** all ramp in from silence over **250 ms** (a pack switch dips for 30 ms and then ramps; editing a knob on the same pack does not dip). | `rampIn()`, `switchRamp()` |
| **Interruptions.** On AudioContext `interrupted`, an unexpected `suspended`, `visibilitychange` → hidden, or `pagehide`: fade to silence over **150 ms**, go `paused`, pause the media element and suspend the context. It **never auto-resumes**. Only `resume()` brings sound back, and that is called from a tap or a hardware play button. | `PlaybackSession` |
| **Media Session is always on** once Ignition has been tapped (feature-detected, no-op where unsupported): title = pack name, artist `RevForge`, album = gearbox mode, procedural artwork, `playbackState` playing/paused/none, and play/pause/stop handlers. | `PlaybackSession.applyMediaSession()` |
| **Gesture-only.** No AudioContext is created or resumed on import or mount. The context is created inside `start()` (Ignition/Audition tap). A hardware play press while idle restarts the engine only if the context is already running. A resume the browser doesn't grant times out after 1.5 s and stays paused. | `useAudioEngine.start`, `PlaybackSession.resume` |
| Tapping Ignition/Start while paused resumes the engine; it doesn't re-ignite. `playStarter()` is skipped for 1.5 s after a resume. | `useAudioEngine` |

### Does Chromium need a media element? Yes.
Chromium surfaces Media Session (Android notification, desktop Global Media Controls, hardware
keys) **only for an HTMLMediaElement**. Bare Web Audio never registers a media player. Chrome
for Android also wants media that is at least 5 s long ([Chrome blog: media notifications](https://developer.chrome.com/blog/media-session):
"There is no notification for audio from the Web Audio API unless it is played back via an
audio element"). We meet that procedurally, with no file and no fetch:

- **Background audio on** (the default): the real mix already goes master bus →
  `MediaStreamAudioDestinationNode` → `<audio>.srcObject` (`MediaOutput`). A stream has unbounded
  duration, so it passes the 5 s rule. The session pauses and plays this element with the state machine.
- **Background audio off**: the session plays a **silent procedural carrier**:
  `ctx.createMediaStreamDestination()` with nothing connected → `<audio>.srcObject`. Nothing is
  duplicated, and it never uses `muted` or `volume = 0`, which iOS ignores for controls. It replaces
  `carrierUrl()`'s silent WAV blob in `useVehicleMedia.ts`.
- iOS/Safari doesn't show controls for a muted or zero-volume element. We never do either.

### Legacy experimental checkbox (still works)
`src/forge/useVehicleMedia.ts` is untouched. While its localStorage flag
`revforge.media.experimental` is `"true"`, the session **leaves `navigator.mediaSession` alone**
so the two never fight over it: no metadata, no handlers. The fade, limiter and interruption
pause stay active either way. As soon as `usePlaybackSession` is mounted, the session claims
Media Session regardless of the flag.

The audio layer never reads that flag itself (no storage in `src/audio`): `useAudioEngine`
hands the session a reader via `session.setLegacyMediaFlagReader(() => boolean)`, and only the
hook touches localStorage. A host that never sets a reader gets "flag off".

## API for Frontend

### Additions to `useAudioEngine()` (additive)
```ts
audio.playback       // PlaybackSession (page-wide singleton)
audio.playbackState  // { state: 'idle'|'running'|'paused', reason: PauseReason|null, canResume: boolean, pageVisible: boolean }
audio.paused         // boolean shortcut: playbackState.state === 'paused'
audio.resume()       // Promise<boolean>. Call from a tap only (same path as audio.start() while paused)
// PauseReason = 'hidden' | 'pagehide' | 'interrupted' | 'suspended' | 'media-pause' | 'user'
```
`audio.running` is `false` while paused.

### Hook: exact signature
```ts
import { usePlaybackSession } from '../audio/playbackSession';

function usePlaybackSession(options?: UsePlaybackSessionOptions): UsePlaybackSessionResult;

interface UsePlaybackSessionOptions {
  engine?: { patchName?: string; running?: boolean; playback?: PlaybackSession }; // pass `audio`
  packName?: string;        // MediaMetadata.title (default engine.patchName)
  mode?: string;            // 'auto' | 'manual' → album 'Automatic gearbox' | 'Manual gearbox'
  album?: string;           // overrides mode
  running?: boolean;        // default engine.running
  onPlay?: () => void;      // hardware play while idle (paused → always resume())
  onPause?: () => void;     // hardware pause (default: fade + paused, resumable)
  onStop?: () => void;
  onNextTrack?: () => void; // registers nexttrack (manual shifting)
  onPreviousTrack?: () => void;
  // useVehicleMedia-compatible aliases (used when the canonical field is absent):
  name?: string; start?: () => void; stop?: () => void; manual?: boolean;
  pauseShifts?: boolean; shift?: (direction: number) => void; blasters?: boolean; fire?: () => void;
  enabled?: boolean;        // ignored: always on
  getMediaElement?: () => HTMLAudioElement | null; // ignored: the engine host supplies it
}

interface UsePlaybackSessionResult {
  state: 'idle' | 'running' | 'paused'; reason: PauseReason | null; canResume: boolean; pageVisible: boolean;
  paused: boolean;
  resume: () => Promise<boolean>;   // tap only
  pause: () => boolean;
  // useVehicleMedia-compatible:
  arm: () => void;                  // no-op (the session arms itself on Ignition)
  accepted: string[];               // registered Media Session actions
  lastEvent: string;
  carrier: string;                  // 'Active' | 'Paused' | 'Not activated'
}
```
The action mapping matches `mediaCommand()` in `src/forge/mediaActions.ts`, with one exception:
**play while paused always resumes.** The other mappings: play while running → none (or blaster
on sci-fi); pause → `onPause`/`stop`, or upshift when `manual && pauseShifts`;
next/previous → shift ±1 in manual. Hardware double-presses are debounced to 300 ms.

Plain (non-React) API: `getPlaybackSession()` returns the same session, with
`getSnapshot() / subscribe(fn) / resume() / pause(reason) / setMediaInfo({title, album}) /
setActionHandlers({...}) / setPauseWhenHidden(bool)`.

### One-line swap for the experimental checkbox (ForgePage.tsx:258)
```diff
-  const media = useVehicleMedia({blasters:patch?.kind==='scifi',fire:...,getMediaElement:audio.getMediaElement,enabled:mediaEnabled, ... ,stop,shift});
+  const media = usePlaybackSession({engine:audio,blasters:patch?.kind==='scifi',fire:...,getMediaElement:audio.getMediaElement,enabled:mediaEnabled, ... ,stop,shift});
```
That means renaming `useVehicleMedia(` to `usePlaybackSession(`, adding `engine:audio,`, and adding
`import { usePlaybackSession } from "../audio/playbackSession";`. Everything else, including
`media.arm()`, `media.accepted`, `media.lastEvent` and `media.carrier`, keeps working.
After that, delete the "Experimental media-button controls" checkbox, or keep only
"Steering-wheel pause shifts gears" (`pauseShifts`).

### Render the paused state
```tsx
// Dock primary button (ForgePage.tsx:302)
<button className="rev-chip rev-stop" disabled={audio.starting}
  onClick={audio.running ? stop : start}>
  {audio.running ? 'Shutdown' : (audio.paused || mutedBeforeHide) ? 'Resume' : 'Ignition'}
</button>
{audio.paused && <p role="status" className="rf-paused">Paused — tap to resume</p>}
```
`start` already routes to resume while paused (no starter cue). Use `audio.resume()` directly if
you'd rather. Render the status after the page becomes visible again: `audio.playbackState.pageVisible`
flips back to `true`, `state` stays `'paused'`. **Never call `resume()` from an effect, a timer, or
`visibilitychange`.** It must come from the tap.

### Background audio toggle: decision for Wilson
HIG says pause when the page is hidden, so that's now the default even with "Background audio"
on. Background audio still routes the mix through the media element, which helps Media Session
and output stability. If Wilson wants engine sound to keep playing behind other in-car apps, one
line restores it: `audio.playback.setPauseWhenHidden(!audio.background)`. Interruptions
(calls, other audio) always pause.

## Pack previews through the master chain (`playPreview`)
Previews (`public/snippets/<id>.wav`) now play through the **same** AudioContext and master chain as the engine instead of a separate `new Audio()` element:
- they share the safety limiter (−1 dBFS ceiling) and the output, including the background media element when Background audio is on, so there is one audio session, not two competing ones;
- each preview is **level-matched to the live engine at cruise** (speed .5 / throttle .35 / load .3) by a generated per-pack trim (`src/audio/previewTrims.ts`, from `scripts/gen-preview-trims.mjs`; `--check` exits 1 when stale). The trim is capped so a trimmed preview never peaks above −3 dBFS (the limiter knee), keeping the limiter transparent on previews;
- a preview **ducks a running engine** (0.15 s) and un-ducks it (0.25 s) when it ends or is stopped. The duck is on the engine input only; the preview joins after the start/resume fade;
- one at a time: a new preview stops the previous one with a 0.12 s fade; Ignition stops any preview;
- `ctx.resume()` is called synchronously inside the tap; buffers are decoded with `decodeAudioData` and cached (no `<audio>` element, no extra autoplay policy);
- Media Session shows "<Pack> — preview" (album "Preview") while the engine isn't running; hardware pause/stop, hiding the page, pagehide and interruptions stop the preview;
- no storage: preview state lives in memory only (`previewState`, `previewingId`).

```ts
audio.playPreview(packIdOrSnippetPath: string, opts?: { gainDb?: number; duckEngine?: boolean }): Promise<void>
  // 'v8-rumble' | legacy 'tie-fighter' | 'snippets/v8-rumble.wav' (the SNIPPETS value) | absolute URL
  // resolves when the preview ends / is stopped / is replaced; rejects if it can't load or play
audio.stopPreview(): void
audio.previewState: 'idle' | 'loading' | 'playing'
audio.previewingId: string | null
// non-React: new PreviewPlayer({ ctx, master, engineAudible?, onState? }) from src/audio/previewPlayer.ts
```

### Frontend swap (EnginesPage.tsx:81–87, quoted, not edited)
Current:
```ts
const playSnippet = (src: string) => {
  if (!audioRef.current) audioRef.current = new Audio();
  const a = audioRef.current;
  a.pause();
  a.src = `${import.meta.env.BASE_URL}${src}`;
  void a.play().catch(() => {});
};
```
Replace with (the SNIPPETS map at EnginesPage.tsx:20–31 stays as is; `audioRef` can go):
```ts
const playSnippet = (src: string) => { void audio.playPreview(src).catch(() => {}); };
```
Optional: show a stop state with `audio.previewingId === id` and call `audio.stopPreview()`.

### Preview trims (generated; LUFS integrated, live = shipped engine at cruise, 2–6 s)
| pack | live cruise LUFS | preview LUFS | preview peak dBFS | applied trim dB |
|---|---|---|---|---|
| aerospace-f14 | -29.21 | -19.72 | -7.53 | -9.49 |
| chrono-coupe | -19.73 | -19.67 | -7.34 | -0.06 |
| ev-dual-motor | -19.65 | -21.66 | -10.90 | +2.01 |
| ev-inverter-climb | -16.80 | -28.18 | -14.88 | +11.38 |
| ev-regen-howl | -16.08 | -25.23 | -14.71 | +9.16 |
| ev-whine | -18.50 | -25.34 | -13.96 | +6.84 |
| i4-zip | -30.26 | -23.52 | -9.81 | -6.74 |
| i6-silk | -29.47 | -20.52 | -7.37 | -8.96 |
| night-pursuit | -19.70 | -15.30 | -2.14 | -4.40 |
| rotary-hum | -22.03 | -17.86 | -6.59 | -4.16 |
| stellar-helm | -21.10 | -22.15 | -10.63 | +1.05 |
| v8-rumble | -25.73 | -20.69 | -9.74 | -5.04 |

No trim needed the peak cap on this base. Twin Ion (`ion-twin`) deliberately has **no** trim entry
(`NO_TRIM` in the generator): it plays at file level until its rework lands. Re-run `node scripts/gen-preview-trims.mjs` after changing a preview WAV or a pack's live level.

## Levels: no surprise loudness (measured)
`node scripts/hig-level-check.mjs` renders the **shipped** engine graph offline
(`scripts/live-render.mjs`: createEngineSynth + real pulse worklet, driven by setDriving at
60 Hz) at idle, cruise and WOT, and runs every preview WAV through the master bus (latency-aligned).
Result on `audio/sh-chrono`: **Δ 0.00 dB integrated LUFS and 0.00 dB peak** for all six packs × three
states and for every preview except `ion-twin.wav`, whose file on this branch is clipped at
−0.5 LUFS / −0.9 dBFS: the bus holds it to −2.1 LUFS / −1.7 dBFS. That file is not replaced and gets
no trim here (Twin Ion is excluded from this port). Live levels with the port vs without it
(idle / cruise / WOT, 10 packs incl. Chrono Coupe, Stellar Helm, Twin Ion): worst |Δ| 0.01 dB. Normal levels sit
below the −3 dBFS knee, so the bus is a pure safety net for stacked cues and custom patches.

## Cue audit (`triggerUiCue` and lifecycle one-shots)
| Cue | Length | Trigger | Note |
|---|---|---|---|
| starter / ignition | 0.85–1.75 s (+ ProceduralCharacter startup 2.18 s) | Ignition tap | startup layer is 2.18 s, slightly over ~2 s |
| shutdown / shutoff | 0.75–1.4 s (+ ProceduralCharacter 1.65 s) | Shutdown tap | ok |
| ion-cannon / blaster | ≈0.85 s | Pulse Burst tap / hardware play-pause (sci-fi) | ok |
| upshift / downshift bark, gearing | ≤0.3 s / 1.15 s | **gear change from the simulation** (automatic gearbox too) | not a tap; part of the engine sound |
| lock | 0.28 s | Twin Ion rpm reaches lock (automatic) | not a tap; off by default (`ionTwinLockSfx`) |
| scanner tick | short | Night Pursuit scanner sweep (automatic) | not a tap; level 0 by default |
| time-jump | **≤ 2.0 s** total (decay to 1.9 s, linear release to 1.96 s, sources stop 1.99 s) | automatic at its speed threshold (time-display layout) | ruling: stays automatic, capped at 2.0 s, user can switch it off (below) |
All cues go through the master bus, so none can exceed the ceiling or rise above their current peaks.

## time-jump cue: cap + on/off (CoS ruling)
- Capped at **2.0 s total** including release: exponential decay ends at 1.9 s, a linear release reaches 0 at 1.96 s, and the sources stop at 1.99 s, so it ends in a clean fade with no click (`TIME_JUMP_CUE_SECONDS` in `ProceduralCharacter.js`).
- It still fires automatically at its speed threshold.
- **On by default.** Turning it off means the cue never fires; every other cue and the engine voice are unchanged. The setting is **in memory only**: the audio layer never reads or writes localStorage / sessionStorage / IndexedDB. Frontend persists it under its own per-preview-slug key: restore with `setTimeJumpCueEnabled(saved)` at boot and save from `onTimeJumpCueChange(fn)` (or from the hook's `timeJumpCue` state).

```ts
audio.setTimeJumpCueEnabled(on: boolean): void   // useAudioEngine()
audio.getTimeJumpCueEnabled(): boolean
audio.timeJumpCue                                // boolean state, for rendering a switch
engine.setTimeJumpCueEnabled(on) / engine.getTimeJumpCueEnabled()   // EngineSynth (CharacterEngine)
getPlaybackSession().setTimeJumpCueEnabled(on) / .getTimeJumpCueEnabled()   // non-React
import { setTimeJumpCueEnabled, getTimeJumpCueEnabled, onTimeJumpCueChange } from 'src/audio/cuePrefs'  // plain module (onTimeJumpCueChange → unsubscribe)
```
Frontend, for the Chrono Coupe toggle: `<Switch checked={audio.timeJumpCue} onChange={audio.setTimeJumpCueEnabled} label="Time-jump sound"/>`.

## In-car manual check list (parked)
1. Tap **IGNITION**. Sound fades in, with no pop or click at the start.
2. Switch packs in the Garage while running. A short dip, then a smooth fade-in, no loud jump.
3. Open another in-car app full screen, or **switch to Spotify** and play music. RevForge fades out within about 0.15 s and Spotify plays alone.
4. Make or receive a **phone call**. RevForge stays silent for the whole call, and after it.
5. Come back to the browser. The dock shows **Resume** and "Paused — tap to resume". **No sound** until you tap.
6. Tap **Resume**. Sound fades in over about 0.25 s with no starter cue, no pop, and no level jump compared with before.
7. Steering-wheel or media **pause** pauses it (or shifts, if "pause shifts" is on in manual). **Play** resumes.
8. Turn the **volume knob** all the way through its range while running. It controls the level the whole time, and RevForge never gets louder by itself.
9. Hold to rev to the redline with Pulse Burst and a gear change at once. Loud but clean, and no harsh clipping.
10. Media card or notification: shows the pack name, "RevForge", and Automatic/Manual gearbox.
