import packs from "./revforge-packs.json";
import type { EnginePatch } from "../audio/types";
import type { RevForgeVoiceConfig } from "./voiceTypes";
import type { Drivetrain } from "./simulation";
import { sceneLabel } from "./sceneLabels";
import { RETIRED_SCENE_IDS } from "../packs/migrations";

/**
 * A scene preset: art id + palette from revforge-packs.json, display copy from sceneLabels.ts.
 * Scene sound is audio-owned (src/audio/sceneEngines.ts, revforge-<sceneId> builtins); the JSON
 * carries no voice or gear fields any more (dribe cleanup v2, Oct 18 2026).
 */
export type ScenePack = (typeof packs)[number] & { name: string; tagline: string };
export const SCENES: ScenePack[] = packs.map((p) => ({ ...p, ...sceneLabel(p.id) }));
/** Retired / legacy scene id → current scene (RETIRED_SCENE_IDS lives in packs/migrations.ts). */
export const resolveSceneId = (id: string) => RETIRED_SCENE_IDS[id] ?? id;
/** Scene for an id (retired ids resolve first); unknown or missing ids get the first scene. */
export const sceneForId = (id: string | undefined) => {
  const resolved = id ? resolveSceneId(id) : "";
  return SCENES.find((p) => p.id === resolved) ?? SCENES[0];
};
/**
 * Scene-free default drivetrain (dribe cleanup, Oct 18 2026). Replaces the hard-coded default
 * scene the four callers passed: drivetrainFor() never read the scene, and these are exactly the
 * values it already used for non-RevForge ICE patches (6 gears, 3.31 final drive), which also match
 * the retired default scene (6 gears, 3.31). The per-gear ratios are not stored on scenes: they come from
 * simulation.gearRatio(), which for 6 gears gives 3.90 / 3.09 / 2.44 / 1.84 / 1.27 / 0.72.
 */
export const DEFAULT_DRIVETRAIN = { gears: 6, finalDrive: 3.31 } as const;
/** kind / topology / params for a RevForge voice config (user / imported patches; NativeStudio re-tunes with this). */
export function voicePatchParts(p: RevForgeVoiceConfig): Pick<EnginePatch, "kind" | "topology" | "params"> {
  const kind =
    p.voice === "electric"
      ? "ev-whine"
      : p.voice === "starfighter"
        ? "scifi"
        : p.voice === "turbine"
          ? "aerospace"
          : "ice";
  const topology =
    kind === "scifi"
      ? "ion-twin"
      : kind === "aerospace"
        ? "aerospace-f14"
        : kind === "ev-whine"
          ? "ev-dual-motor"
          : p.cylinders === 6
            ? "i6-silk"
            : p.cylinders === 4
              ? "i4-zip"
              : "v8-rumble";
  return {
    kind,
    topology,
    params: {
      masterGain: 0.85,
      stereoWidth: 0.55,
      rpmIdle: (p.idleRpm * Math.max(4, p.cylinders)) / 120,
      rpmRedline: (Math.min(9000, p.redline) * Math.max(4, p.cylinders)) / 120,
      cylinders: Math.max(4, p.cylinders),
      roughness: p.rumble,
      growl: p.growl,
      presence: p.metallic,
      intake: p.air,
      exhaust: p.exhaust,
      muffling: 1 - p.body * 0.65,
      crackle: p.crackle,
      pulseJitter: p.firing === "crossplane" ? 0.14 : 0.045,
      pulseWidth: p.firing === "crossplane" ? 0.44 : 0.25,
      exhaustLength: 0.25 + p.body * 0.55,
      whinePitch: 140 + p.turboPitch * 200,
      inverterBuzz: p.metallic,
      corePitch: 75 + p.metallic * 55,
      formantHowl: p.rasp,
      wetHiss: p.air,
      spoolPitch: 80 + p.turboPitch * 80,
      afterburn: p.growl,
    },
  };
}
function baseDrivetrain(patch: EnginePatch | undefined): Drivetrain {
  if (patch?.revforge) {
    const original = patch.revforge;
    return {
      idleRpm: original.idleRpm,
      redline: original.redline,
      gears: Math.max(1, original.gears),
      shiftRpm: Math.min(original.shiftRpm, original.redline * 0.95),
      finalDrive: original.finalDrive,
    };
  }
  const cylinders = Number(patch?.params.cylinders ?? 8);
  const ice = patch?.kind === "ice";
  const idleRpm = ice
    ? (Number(patch.params.rpmIdle ?? 55) * 120) / cylinders
    : 650;
  const redline = ice
    ? Math.max(
        idleRpm + 1000,
        (Number(patch.params.rpmRedline ?? 300) * 120) / cylinders,
      )
    : 10000;
  return {
    idleRpm,
    redline,
    gears: ice ? DEFAULT_DRIVETRAIN.gears : 1,
    shiftRpm: redline * 0.9,
    finalDrive: DEFAULT_DRIVETRAIN.finalDrive,
  };
}

export function drivetrainFor(patch:EnginePatch|undefined):Drivetrain {
 const c=baseDrivetrain(patch),p=patch?.params??{};
 const finite=(v:unknown,fallback:number)=>Number.isFinite(Number(v))?Number(v):fallback;
 const max=Math.max(c.idleRpm+500,Math.min(18000,finite(p.maxRpm,c.redline)));
 const top= p.topSpeedKph===undefined?undefined:Math.max(40,Math.min(500,finite(p.topSpeedKph,240)))/3.6;
 return {...c,redline:max,gears:Math.round(Math.max(1,Math.min(10,finite(p.gearCount,c.gears)))),shiftRpm:Math.max(c.idleRpm+100,Math.min(max,finite(p.autoShiftRpm,c.shiftRpm))),warningRpm:max*Math.max(.5,Math.min(1,finite(p.redlinePercent,90)/100)),topSpeedMps:top};
}
