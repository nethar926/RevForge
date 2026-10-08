/**
 * 'Time-jump sound' preference + the Chrono Coupe light timer (React side of ./timeJump).
 *
 * Audio's hooks (audio/hig-hooks: src/audio/cuePrefs onTimeJumpCueChange / setTimeJumpCueEnabled,
 * ProceduralCharacter TIME_JUMP_CUE_SECONDS, useAudioEngine().timeJumpCue) are feature-detected
 * with eager import.meta.glob, so this builds and works on lines that do not have them yet:
 * the toggle then only gates the light and the existing time-jump UI cue, the cue length is 2.0 s.
 * Audio keeps the preference in memory only; Frontend persists it under storageKey()
 * (rf.preview.<slug>.* on previews) and restores it at startup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { storageKey } from '../lib/storageKey';
import { createTimeJumpLight } from './timeJump';
import './timeJumpCue.css';

interface CuePrefsApi {
  setTimeJumpCueEnabled?: (on: boolean) => void;
  getTimeJumpCueEnabled?: () => boolean;
  onTimeJumpCueChange?: (fn: (on: boolean) => void) => () => void;
}
const cuePrefs = Object.values(import.meta.glob<CuePrefsApi>('../audio/cuePrefs.ts', { eager: true }))[0];
// Whole-module glob + dynamic lookup: a named `import:` of a missing export fails the build.
const procedural = Object.values(import.meta.glob<Record<string, unknown>>('../audio/ProceduralCharacter.{js,ts}', { eager: true }))[0];
const cueSeconds = procedural && Object.entries(procedural).find(([k]) => k === 'TIME_JUMP_CUE_SECONDS')?.[1];

/** Light length = Audio's TIME_JUMP_CUE_SECONDS (2.0 s when that export is absent). */
export const TIME_JUMP_CUE_MS = (typeof cueSeconds === 'number' && cueSeconds > 0 ? cueSeconds : 2) * 1000;
/** True when Audio's time-jump cue on/off API is in this build. */
export const HAS_TIME_JUMP_CUE_API = typeof cuePrefs?.setTimeJumpCueEnabled === 'function';

export const TIME_JUMP_CUE_KEY = 'revforge.audio.timeJumpCue';
function readSaved(): boolean {
  try {
    return localStorage.getItem(storageKey(TIME_JUMP_CUE_KEY)) !== '0';
  } catch {
    return true;
  }
}
function save(on: boolean): void {
  try {
    localStorage.setItem(storageKey(TIME_JUMP_CUE_KEY), on ? '1' : '0');
  } catch {
    /* session-only */
  }
}

// Startup (this module loads with the Drive shell): restore the saved choice into Audio, then
// persist every change Audio reports (from this toggle or any other API caller). Default on.
const BOOT_ON = readSaved();
cuePrefs?.setTimeJumpCueEnabled?.(BOOT_ON);
cuePrefs?.onTimeJumpCueChange?.(save);

interface AudioCueView {
  timeJumpCue?: boolean;
  setTimeJumpCueEnabled?: (on: boolean) => void;
  triggerUiCue?: (cue: string) => void;
}

/** [enabled, setEnabled] — audio.timeJumpCue when Audio has it, else the saved Frontend choice. */
export function useTimeJumpCue(audioEngine: object): [boolean, (on: boolean) => void] {
  const audio = audioEngine as AudioCueView;
  const [local, setLocal] = useState(BOOT_ON);
  useEffect(() => cuePrefs?.onTimeJumpCueChange?.(setLocal), []);
  const setAudioCue = audio.setTimeJumpCueEnabled;
  const setEnabled = useCallback(
    (on: boolean) => {
      setLocal(on);
      save(on);
      if (setAudioCue) setAudioCue(on);
      else cuePrefs?.setTimeJumpCueEnabled?.(on);
    },
    [setAudioCue],
  );
  return [typeof audio.timeJumpCue === 'boolean' ? audio.timeJumpCue : local, setEnabled];
}

/**
 * [active, trigger] for the Chrono Coupe light: trigger() lights it for TIME_JUMP_CUE_MS
 * (ignored while lit; returns whether it fired). Timer cleared on unmount and on `resetKey`
 * (theme) change.
 */
export function useTimeJumpLight(resetKey: string): [boolean, () => boolean] {
  const [active, setActive] = useState(false);
  const light = useRef<ReturnType<typeof createTimeJumpLight> | null>(null);
  if (!light.current) {
    light.current = createTimeJumpLight(setActive, TIME_JUMP_CUE_MS, {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
    });
  }
  useEffect(() => () => light.current?.cancel(), [resetKey]);
  const trigger = useCallback(() => light.current!.trigger(), []);
  return [active, trigger];
}

/**
 * Drive shell wiring: { cueOn, setCueOn, active, onTimeJump } for ForgePage. onTimeJump (ThemeStage's
 * 88 mph rising edge) lights Chrono Coupe for one cue length and plays the existing 'time-jump' UI cue,
 * only while the option is on; a crossing while lit is ignored.
 */
export function useTimeJump(audioEngine: object, themeId: string) {
  const [cueOn, setCueOn] = useTimeJumpCue(audioEngine);
  const [active, trigger] = useTimeJumpLight(themeId);
  const triggerUiCue = (audioEngine as AudioCueView).triggerUiCue;
  const onTimeJump = useCallback(() => {
    if (cueOn && trigger()) triggerUiCue?.('time-jump');
  }, [cueOn, trigger, triggerUiCue]);
  return { cueOn, setCueOn, active, onTimeJump };
}

/** HIG switch row for Options (44pt target, VoiceOver: "Time-jump sound, switch, on/off"). */
export function TimeJumpCueSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="rf-tj-switch">
      <span>Time-jump sound</span>
      <input type="checkbox" role="switch" aria-label="Time-jump sound" aria-checked={on} checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
