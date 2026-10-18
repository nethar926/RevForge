/**
 * Scene engines — audio-owned engine presets for the RoadView scenes (Oct 18 2026 cleanup).
 *
 * Replaces the scene patches BUILTIN_PATCHES used to import from the frontend scene catalogue.
 * Every scene here runs on one of OUR procedural engines (EngineSynthImpl topologies: v8-rumble,
 * i6-silk, ev-dual-motor, ev-inverter-climb, aerospace-f14 generic turbine, ion-twin procedural).
 * None of these patches carries a `revforge` voice config, so createEngineSynth never routes them
 * to RevForgeSynth / RevForgeVoice.
 *
 * All values were set fresh by engineering judgement (Dan, audio). The ICE firing schedules are
 * DERIVED from cylinder count, firing order and a few physical dimensions (displacement, plenum,
 * header length, muffler volume, cam overlap); see deriveIceSchedule(). Nothing here reads from
 * the forge JSON.
 *
 * Display names are placeholders ('Pack 01' …); the frontend owns final names and copy. No
 * taglines / blurbs on purpose.
 *
 * Pure data + pure functions: no storage, no DOM, no AudioContext.
 */
import type { EngineKind, EngineParams, EnginePatch, TopologyId } from './types';
import type { IcePackSchedule } from './engineStateBridge';

/** Patch ids are `revforge-<sceneId>` (same convention the frontend scene catalogue uses). */
export const SCENE_PATCH_PREFIX = 'revforge-';

export type SceneFiring = 'crossPlane' | 'flatPlane' | 'i6Even';

/** Mechanical description of an ICE scene engine; schedules are derived from this. */
export interface SceneIceMechanics {
  cylinders: 6 | 8;
  firing: SceneFiring;
  /** Swept volume, litres. */
  displacementL: number;
  /** Intake plenum (+ charge pipes / intercooler for boosted engines), litres. */
  plenumL: number;
  /** Primary header length to the collector, metres. */
  headerM: number;
  /** Total silencer volume, litres. */
  mufflerL: number;
  /** Cam overlap / looseness 0…1 → idle irregularity and misfire. */
  camOverlap: number;
  /** Forced induction (adds charge volume lag to the manifold τ). */
  boosted?: boolean;
}

export interface SceneEngineSpec {
  /** Internal scene id (frontend scene/theme key). */
  sceneId: string;
  /** Placeholder display name; frontend owns the real one. */
  label: string;
  kind: EngineKind;
  topology: TopologyId;
  /** Crank rpm at idle / at the limiter (ICE: drives rpmIdle / rpmRedline firing Hz). */
  idleRpm: number;
  limitRpm: number;
  /** Drivetrain hints read by the frontend drivetrain (params.gearCount / autoShiftRpm / maxRpm). */
  gears: number;
  shiftRpm: number;
  ice?: SceneIceMechanics;
  /** Voice params layered over defaultsForTopology(topology). */
  voice: Partial<EngineParams>;
}

const ANGLES: Record<SceneFiring, number[]> = {
  // Bank-A dump angles of a cross-plane crank (180/90/180/270 intervals)
  crossPlane: [0, 180, 270, 450],
  // Flat-plane / even V8: one event every 90° across both banks
  flatPlane: [0, 90, 180, 270, 360, 450, 540, 630],
  // Inline six 1-5-3-6-2-4: one event every 120°
  i6Even: [0, 120, 240, 360, 480, 600],
};

const FAMILY: Record<SceneFiring, number> = { crossPlane: 1, flatPlane: 2, i6Even: 3 };
const BANK_SCHEDULE: Record<SceneFiring, string> = {
  crossPlane: 'crossPlaneV8',
  flatPlane: 'flatPlaneV8',
  i6Even: 'i6Even',
};

/** Hot exhaust gas pulse speed in the primaries, m/s. */
const EXHAUST_PULSE_SPEED = 520;
/** Hot gas expands ~3× vs. intake charge at idle. */
const EXHAUST_EXPANSION = 3;

const round = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fix = (v: number, digits: number) => Number(v.toFixed(digits));

/**
 * Derive an ICE firing schedule from the mechanics:
 * - family / angles / bank offset from cylinder count + firing order;
 * - collector delay = header transit time (cross-plane banks merge through a longer crossover);
 * - τ_manifold = plenum volume ÷ intake flow at idle (4-stroke: disp × rpm / 120 per second);
 * - τ_exhaust = silencer volume ÷ hot exhaust flow at idle;
 * - jitter / misfire from firing order + cam overlap.
 */
export function deriveIceSchedule(m: SceneIceMechanics, idleRpm: number): IcePackSchedule {
  const intakeFlowLps = (m.displacementL * idleRpm) / 120;
  const crossover = m.firing === 'crossPlane' ? 1.3 : 1;
  const collectorDelayMs = clamp((m.headerM / EXHAUST_PULSE_SPEED) * 1000 * crossover, 0.3, 3);
  const tauManifold = clamp((m.plenumL / intakeFlowLps) * (m.boosted ? 1.15 : 1), 0.05, 0.2);
  const tauExhaust = clamp(m.mufflerL / (intakeFlowLps * EXHAUST_EXPANSION), 0.08, 0.34);
  const baseJitter = m.firing === 'crossPlane' ? 0.014 : m.firing === 'flatPlane' ? 0.007 : 0.005;
  const pulseJitterFrac = clamp(baseJitter + m.camOverlap * 0.012, 0.005, 0.03);
  const misfireDefault = clamp(0.004 + m.camOverlap * m.camOverlap * 0.11, 0, 0.1);
  return {
    cylinders: m.cylinders,
    firingFamily: FAMILY[m.firing],
    bankSchedule: BANK_SCHEDULE[m.firing],
    eventAnglesDeg: [...ANGLES[m.firing]],
    bankOffsetDeg: m.cylinders === 8 ? 90 : 0,
    collectorDelayMs: fix(collectorDelayMs, 2),
    tauManifold: fix(tauManifold, 3),
    tauExhaust: fix(tauExhaust, 3),
    pulseJitterFrac: fix(pulseJitterFrac, 4),
    misfireDefault: fix(misfireDefault, 3),
  };
}

/**
 * Scene engine specs, in catalogue order. Values are new (Oct 18 2026); see module header.
 */
export const SCENE_ENGINE_SPECS: readonly SceneEngineSpec[] = [
  {
    // Lazy cross-plane small-block that loosens up near the top
    sceneId: 'copper-mile',
    label: 'Pack 01',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 690,
    limitRpm: 6450,
    gears: 5,
    shiftRpm: 5900,
    ice: { cylinders: 8, firing: 'crossPlane', displacementL: 5.7, plenumL: 4.4, headerM: 0.95, mufflerL: 24, camOverlap: 0.55 },
    voice: {
      masterGain: 0.7, stereoWidth: 0.5, roughness: 0.7, growl: 0.76, presence: 0.3, intake: 0.5,
      exhaust: 0.8, ignitionNoise: 0.22, muffling: 0.4, rpmCurve: 0.62, pulseWidth: 0.52,
      exhaustLength: 0.66, exhaustFeedback: 0.74, crackle: 0.34,
    },
  },
  {
    // Flat, even V8 that turns sharp and bright up top
    sceneId: 'ember-dusk',
    label: 'Pack 02',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 960,
    limitRpm: 8350,
    gears: 7,
    shiftRpm: 7900,
    ice: { cylinders: 8, firing: 'flatPlane', displacementL: 4.0, plenumL: 2.9, headerM: 0.42, mufflerL: 13, camOverlap: 0.35 },
    voice: {
      masterGain: 0.68, stereoWidth: 0.44, roughness: 0.34, growl: 0.48, presence: 0.6, intake: 0.62,
      exhaust: 0.56, ignitionNoise: 0.2, muffling: 0.22, rpmCurve: 0.44, pulseWidth: 0.3,
      exhaustLength: 0.38, exhaustFeedback: 0.68, crackle: 0.18,
    },
  },
  {
    // Synth-edged flat V8: open muffling, resonant short pipes
    sceneId: 'violet-grid',
    label: 'Pack 03',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 880,
    limitRpm: 8650,
    gears: 5,
    shiftRpm: 8150,
    ice: { cylinders: 8, firing: 'flatPlane', displacementL: 4.4, plenumL: 3.3, headerM: 0.36, mufflerL: 11, camOverlap: 0.3 },
    voice: {
      masterGain: 0.66, stereoWidth: 0.6, roughness: 0.26, growl: 0.36, presence: 0.7, intake: 0.72,
      exhaust: 0.42, ignitionNoise: 0.16, muffling: 0.16, rpmCurve: 0.4, pulseWidth: 0.24,
      exhaustLength: 0.3, exhaustFeedback: 0.8, crackle: 0.26,
    },
  },
  {
    // High-revving naturally aspirated flat V8
    sceneId: 'azure-bend',
    label: 'Pack 04',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 1020,
    limitRpm: 9150,
    gears: 6,
    shiftRpm: 8800,
    ice: { cylinders: 8, firing: 'flatPlane', displacementL: 4.5, plenumL: 3.0, headerM: 0.48, mufflerL: 12, camOverlap: 0.42 },
    voice: {
      masterGain: 0.68, stereoWidth: 0.46, roughness: 0.3, growl: 0.55, presence: 0.52, intake: 0.66,
      exhaust: 0.6, ignitionNoise: 0.19, muffling: 0.24, rpmCurve: 0.47, pulseWidth: 0.27,
      exhaustLength: 0.42, exhaustFeedback: 0.7, crackle: 0.2,
    },
  },
  {
    // Heavy, loping big-block cross-plane with a deep idle
    sceneId: 'pink-current',
    label: 'Pack 05',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 620,
    limitRpm: 5950,
    gears: 4,
    shiftRpm: 5300,
    ice: { cylinders: 8, firing: 'crossPlane', displacementL: 7.0, plenumL: 5.8, headerM: 1.1, mufflerL: 30, camOverlap: 0.68 },
    voice: {
      masterGain: 0.7, stereoWidth: 0.52, roughness: 0.82, growl: 0.84, presence: 0.18, intake: 0.42,
      exhaust: 0.86, ignitionNoise: 0.26, muffling: 0.46, rpmCurve: 0.66, pulseWidth: 0.56,
      exhaustLength: 0.74, exhaustFeedback: 0.78, crackle: 0.48,
    },
  },
  {
    // Smooth, long-geared even V8 for steady high speed (8 gears per the rename sheet)
    sceneId: 'silver-run',
    label: 'Pack 06',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 720,
    limitRpm: 7350,
    gears: 8,
    shiftRpm: 6700,
    ice: { cylinders: 8, firing: 'flatPlane', displacementL: 4.8, plenumL: 4.0, headerM: 0.62, mufflerL: 22, camOverlap: 0.22 },
    voice: {
      masterGain: 0.68, stereoWidth: 0.42, roughness: 0.4, growl: 0.5, presence: 0.42, intake: 0.48,
      exhaust: 0.58, ignitionNoise: 0.15, muffling: 0.36, rpmCurve: 0.52, pulseWidth: 0.33,
      exhaustLength: 0.5, exhaustFeedback: 0.72, crackle: 0.12,
    },
  },
  {
    // Dual-motor EV: split inverter beat, one rising whine
    sceneId: 'lightline',
    label: 'Pack 07',
    kind: 'ev-whine',
    topology: 'ev-dual-motor',
    idleRpm: 0,
    limitRpm: 15200,
    gears: 1,
    shiftRpm: 15200,
    voice: {
      masterGain: 0.68, stereoWidth: 0.66, whinePitch: 205, gearSteps: 0.28, inverterBuzz: 0.36,
      presence: 0.6, muffling: 0.17, rpmCurve: 0.5, dualBeat: 0.55, motorRoar: 0.6,
    },
  },
  {
    // Low, boosted cross-plane thump; intake carries the breathy lift-off
    sceneId: 'sandwake',
    label: 'Pack 08',
    kind: 'ice',
    topology: 'v8-rumble',
    idleRpm: 590,
    limitRpm: 5650,
    gears: 6,
    shiftRpm: 5100,
    ice: { cylinders: 8, firing: 'crossPlane', displacementL: 6.2, plenumL: 5.2, headerM: 1.0, mufflerL: 20, camOverlap: 0.6, boosted: true },
    voice: {
      masterGain: 0.69, stereoWidth: 0.5, roughness: 0.86, growl: 0.8, presence: 0.24, intake: 0.7,
      exhaust: 0.82, ignitionNoise: 0.25, muffling: 0.42, rpmCurve: 0.6, pulseWidth: 0.54,
      exhaustLength: 0.7, exhaustFeedback: 0.75, crackle: 0.4,
    },
  },
  {
    // Crisp turbo straight-six with a clean rising rasp
    sceneId: 'frostpass',
    label: 'Pack 09',
    kind: 'ice',
    topology: 'i6-silk',
    idleRpm: 760,
    limitRpm: 7550,
    gears: 7,
    shiftRpm: 7050,
    ice: { cylinders: 6, firing: 'i6Even', displacementL: 3.0, plenumL: 3.0, headerM: 0.55, mufflerL: 14, camOverlap: 0.3, boosted: true },
    voice: {
      masterGain: 0.68, stereoWidth: 0.36, roughness: 0.2, growl: 0.44, presence: 0.58, intake: 0.66,
      exhaust: 0.5, ignitionNoise: 0.18, muffling: 0.24, rpmCurve: 0.5, pulseWidth: 0.3,
      exhaustLength: 0.44, exhaustFeedback: 0.7, crackle: 0.14,
    },
  },
  {
    // Turbine hum climbing into a glassy whistle (generic procedural turbine, not the Tomcat voice)
    sceneId: 'deep-transit',
    label: 'Pack 10',
    kind: 'aerospace',
    topology: 'aerospace-f14',
    idleRpm: 0,
    limitRpm: 13200,
    gears: 1,
    shiftRpm: 13200,
    voice: {
      masterGain: 0.7, stereoWidth: 0.56, spoolPitch: 96, intakeWhine: 0.64, compressor: 0.58,
      turbine: 0.8, jetRoar: 0.36, afterburn: 0.08, jetScream: 0.5, idleSpool: 0.62,
      spoolInertia: 0.7, airframe: 0.3, rpmCurve: 0.56,
    },
  },
  {
    // Twin-turbo straight-six; extra charge volume = audible spool lag
    sceneId: 'blossom-run',
    label: 'Pack 11',
    kind: 'ice',
    topology: 'i6-silk',
    idleRpm: 880,
    limitRpm: 7950,
    gears: 5,
    shiftRpm: 7350,
    ice: { cylinders: 6, firing: 'i6Even', displacementL: 2.6, plenumL: 3.2, headerM: 0.5, mufflerL: 12, camOverlap: 0.34, boosted: true },
    voice: {
      masterGain: 0.67, stereoWidth: 0.38, roughness: 0.24, growl: 0.5, presence: 0.5, intake: 0.76,
      exhaust: 0.54, ignitionNoise: 0.17, muffling: 0.28, rpmCurve: 0.46, pulseWidth: 0.32,
      exhaustLength: 0.4, exhaustFeedback: 0.68, crackle: 0.22,
    },
  },
  {
    // Procedural Twin Ion voice (ion-twin topology; no samples)
    sceneId: 'trenchlight',
    label: 'Pack 12',
    kind: 'scifi',
    topology: 'ion-twin',
    idleRpm: 0,
    limitRpm: 10400,
    gears: 1,
    shiftRpm: 10400,
    voice: {
      masterGain: 0.7, stereoWidth: 0.32, corePitch: 68, pulseRate: 0.31, motorDetune: 0.48,
      motorMix: 0.52, formantHowl: 0.86, howlMix: 0.86, engineHowl: 0.84, screamMix: 0.42,
      screamBright: 0.6, surgeMix: 0.62, grit: 0.36, gritMix: 0.36, air: 0.64, airMix: 0.64,
      wetHiss: 0.64, phraseDepth: 0.14, stereoTwin: 0.42,
    },
  },
  {
    // Bright electric hum with stepped gear mesh (procedural inverter climb)
    sceneId: 'light-grid',
    label: 'Pack 13',
    kind: 'ev-whine',
    topology: 'ev-inverter-climb',
    idleRpm: 0,
    limitRpm: 14800,
    gears: 1,
    shiftRpm: 14800,
    voice: {
      masterGain: 0.66, stereoWidth: 0.4, whinePitch: 240, gearSteps: 0.46, inverterBuzz: 0.3,
      presence: 0.66, muffling: 0.14, rpmCurve: 0.4, gearMesh: 0.44,
    },
  },
];

export const SCENE_ENGINE_IDS: readonly string[] = SCENE_ENGINE_SPECS.map((s) => s.sceneId);

export const scenePatchId = (sceneId: string) => `${SCENE_PATCH_PREFIX}${sceneId}`;

/** Derived ICE schedules keyed by scene id (spread into ICE_PACK_SCHEDULES). */
export const SCENE_ICE_SCHEDULES: Record<string, IcePackSchedule> = Object.fromEntries(
  SCENE_ENGINE_SPECS.filter((s) => s.ice).map((s) => [s.sceneId, deriveIceSchedule(s.ice!, s.idleRpm)]),
);

/** Physics jitter fraction (0…0.03) → worklet scale (0…0.5); mirrors engineStateBridge. */
const jitterToWorklet = (frac: number) => Math.min(0.5, Math.max(0, frac) * (0.5 / 0.03));

/** ICE crank rpm → firing frequency (Hz) used by rpmIdle / rpmRedline. */
export const firingHz = (rpm: number, cylinders: number) => fix((rpm * cylinders) / 120, 1);

/** Build one scene patch on top of the topology defaults (passed in to avoid an import cycle). */
export function buildScenePatch(
  spec: SceneEngineSpec,
  defaultsFor: (topology: string) => EngineParams,
): EnginePatch {
  const params: EngineParams = { ...defaultsFor(spec.topology), ...spec.voice, limiterCeiling: 0.95 } as EngineParams;
  if (spec.ice) {
    const s = SCENE_ICE_SCHEDULES[spec.sceneId];
    Object.assign(params, {
      cylinders: s.cylinders,
      rpmIdle: firingHz(spec.idleRpm, s.cylinders),
      rpmRedline: firingHz(spec.limitRpm, s.cylinders),
      firingFamily: s.firingFamily,
      firingMask: 0,
      bankOffsetDeg: s.bankOffsetDeg,
      collectorDelayMs: s.collectorDelayMs,
      tauManifold: s.tauManifold,
      tauExhaust: s.tauExhaust,
      pulseJitter: fix(jitterToWorklet(s.pulseJitterFrac), 3),
      misfire: s.misfireDefault,
    });
  }
  // Drivetrain hints (frontend drivetrainFor reads these; audio ignores them).
  Object.assign(params, {
    maxRpm: spec.limitRpm,
    gearCount: spec.gears,
    autoShiftRpm: round(Math.min(spec.shiftRpm, spec.limitRpm), 50),
  });
  return {
    version: 0,
    id: scenePatchId(spec.sceneId),
    name: spec.label,
    kind: spec.kind,
    topology: spec.topology,
    params: params as Record<string, number | string>,
    meta: {
      author: 'RevForge Audio',
      tags: ['scene', spec.kind, spec.topology],
    },
  };
}

export function sceneEnginePatches(defaultsFor: (topology: string) => EngineParams): EnginePatch[] {
  return SCENE_ENGINE_SPECS.map((s) => buildScenePatch(s, defaultsFor));
}
