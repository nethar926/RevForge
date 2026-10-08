/**
 * Tomcat — procedural twin afterburning-turbofan voice for the `aerospace-f14` builtin.
 *
 * Identity hub. The builtin keeps its id `aerospace-f14`, topology `aerospace-f14` and snippet
 * `aerospace-f14.wav` (keys for saved settings / migrations). Display label: "Tomcat".
 *
 * Which patches get the voice: the `aerospace-f14` builtin itself, plus any patch whose params carry
 * `tomcatVoice: 1` (Tune This Engine copies clone it). Other patches on the same topology — e.g.
 * RevForge catalogue scenes with a turbine voice — keep the legacy aerospace graph untouched.
 *
 * Sound: modelled on the character of a 1970s low-bypass afterburning turbofan (TF30 class):
 * rough, strong low-pressure fan buzz, hot core roar, 5-zone afterburner. Original procedural
 * Web Audio synthesis only — no samples, loops, wavetables or impulse responses.
 * See docs/tomcat-engine.md.
 */
import type { DrivingInput, EngineParams, EnginePatch, ParamMeta } from './types';

export const TOMCAT_PACK = {
  /** Builtin id / topology / snippet key — never changes. */
  id: 'aerospace-f14',
  /** Human-readable label for this engine. */
  name: 'Tomcat',
  /**
   * Pack-level drivetrain flag: the jet has no gearbox. The audio layer opts this pack out of every
   * gearbox output a car sim sends (rpm / rpmNorm sawtooth, upshift / downshift cues, shift dips);
   * spool follows speed + throttle continuously. Other packs are untouched.
   */
  gearless: true,
  /**
   * Limiter headroom (dB) for the heavy-bass full-power / afterburner states. The voice enters the
   * engine and mix limiters this much lower and the wrapper output restores the same gain, so the
   * linear (idle / cruise / mid) level is unchanged and full / AB are not squashed. Other packs: 0.
   */
  headroomDb: 4,
} as const;

export const TOMCAT_EXPERIMENTAL = false;

/** True when this patch should run the Tomcat voice instead of the legacy aerospace graph. */
export function isTomcatPatch(patch: Pick<EnginePatch, 'id' | 'kind' | 'params'> | null | undefined): boolean {
  if (!patch || patch.kind !== 'aerospace') return false;
  if (patch.id === TOMCAT_PACK.id) return true;
  return Number(patch.params?.tomcatVoice ?? 0) === 1;
}

/** True when the patch runs a gearless pack voice (today: the Tomcat voice). */
export function isGearlessPatch(patch: Pick<EnginePatch, 'id' | 'kind' | 'params'> | null | undefined): boolean {
  return TOMCAT_PACK.gearless && isTomcatPatch(patch);
}

/** Linear pad for the Tomcat limiter headroom (1 on every other patch). */
export function tomcatHeadroomGain(patch: Pick<EnginePatch, 'id' | 'kind' | 'params'> | null | undefined): number {
  return isTomcatPatch(patch) ? 10 ** (-TOMCAT_PACK.headroomDb / 20) : 1;
}

/**
 * Driving input with the car sim's gearbox outputs removed (rpm / rpmNorm sawtooth, `shifting`).
 * Used for the wrapper-side layers of a gearless pack; the input object of other packs is never
 * passed through here.
 */
export function gearlessDrivingInput(d: DrivingInput): DrivingInput {
  const out: DrivingInput = { ...d };
  delete out.rpm;
  delete out.rpmNorm;
  delete out.shifting;
  return out;
}

/**
 * Tomcat layer params (all 0..1 unless noted). Each layer has an enable (0/1) and a gain.
 * Legacy aerospace sliders (spoolPitch, intakeWhine, compressor, turbine, jetRoar, afterburn,
 * jetScream, idleSpool, spoolInertia, airframe) still work as macro scalers — their F14 defaults
 * map to ×1.0 — so the Builder's generic Aerospace sliders keep doing something sensible.
 */
export const TOMCAT_DEFAULTS: EngineParams = {
  masterGain: 0.74,
  stereoWidth: 0.62,
  limiterCeiling: 0.95,
  /** Selects the Tomcat voice on copies of this patch. */
  tomcatVoice: 1,
  /** The voice's own start sequence / shutdown replace the generic lifecycle chirps. */
  lifecycleSounds: 0,
  // 1 · idle + spool bed
  tcIdleOn: 1,
  tcIdleGain: 0.7,
  // 2 · turbine / compressor whine (N2) + fan buzz-saw (N1)
  tcWhineOn: 1,
  tcWhineGain: 0.62,
  tcFanOn: 1,
  tcFanGain: 0.6,
  // 3 · thrust / core roar + rear-arc rumble
  tcRoarOn: 1,
  tcRoarGain: 0.72,
  // 4 · afterburner (5 zones)
  tcAbOn: 1,
  tcAbGain: 0.72,
  tcCrackle: 0.55,
  // 5 · mechanical (gearbox, bearings, ticks, intake rumble)
  tcMechOn: 1,
  tcMechGain: 0.55,
  // speed → airflow / ram rumble
  tcRamOn: 1,
  tcRamGain: 0.5,
  // start sequence extras (air starter whine, igniter ticks, light-off)
  tcStarterOn: 1,
  tcStarterGain: 0.6,
  // character
  tcDetune: 0.35, // twin-engine detune → gentle beating
  tcStall: 0.35, // TF30 roughness: rare soft compressor-stall chug on hard throttle snaps
  tcSpoolTime: 0.5, // 0 = brisk, 0.5 = default (~3.5 s idle→mil), 1 = sluggish
  tcLevel: 0.5, // overall voice trim (0.5 = calibrated; 1 = +6 dB)
};

export const TOMCAT_PARAM_IDS = Object.keys(TOMCAT_DEFAULTS).filter((k) => k.startsWith('tc')) as string[];

const on = (id: string, label: string, group: string): ParamMeta => ({
  id,
  label,
  min: 0,
  max: 1,
  step: 1,
  kind: 'segmented',
  options: [0, 1],
  group,
});
const knob = (id: string, label: string, group: string): ParamMeta => ({ id, label, min: 0, max: 1, step: 0.01, group });

/** Tomcat sliders (paramMetaForKind('aerospace', 'aerospace-f14') appends these). */
export const TOMCAT_PARAM_META: ParamMeta[] = [
  on('tcIdleOn', 'Idle On', 'tomcatIdle'),
  knob('tcIdleGain', 'Idle', 'tomcatIdle'),
  on('tcWhineOn', 'Turbine On', 'tomcatWhine'),
  knob('tcWhineGain', 'Turbine Whine', 'tomcatWhine'),
  on('tcFanOn', 'Fan On', 'tomcatWhine'),
  knob('tcFanGain', 'Fan Buzz', 'tomcatWhine'),
  on('tcRoarOn', 'Thrust On', 'tomcatRoar'),
  knob('tcRoarGain', 'Thrust Roar', 'tomcatRoar'),
  on('tcAbOn', 'Afterburner On', 'tomcatAb'),
  knob('tcAbGain', 'Afterburner', 'tomcatAb'),
  knob('tcCrackle', 'AB Crackle', 'tomcatAb'),
  on('tcMechOn', 'Mechanical On', 'tomcatMech'),
  knob('tcMechGain', 'Mechanical', 'tomcatMech'),
  on('tcRamOn', 'Airflow On', 'tomcatRam'),
  knob('tcRamGain', 'Airflow', 'tomcatRam'),
  on('tcStarterOn', 'Starter On', 'tomcatStarter'),
  knob('tcStarterGain', 'Starter', 'tomcatStarter'),
  knob('tcDetune', 'Twin Beat', 'tomcatCharacter'),
  knob('tcStall', 'Roughness', 'tomcatCharacter'),
  knob('tcSpoolTime', 'Spool Time', 'tomcatCharacter'),
  knob('tcLevel', 'Level', 'tomcatCharacter'),
];
