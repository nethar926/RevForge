import type { EngineKind, EnginePatch, EngineParams, ParamMeta } from './types';
import { REVFORGE_PATCHES } from '../forge/catalog';
import { PACK_ENGINE_MIGRATIONS } from '../packs/migrations';
import { NIGHT_PURSUIT_DEFAULTS, nightPursuitBuiltinPatch } from './nightPursuitPack';
import { CHRONO_COUPE, CHRONO_COUPE_DEFAULTS, chronoCoupeBuiltinPatch } from './chronoCoupePack';
import {
  STELLAR_HELM_DEFAULTS,
  STELLAR_HELM_PACK,
  STELLAR_HELM_PARAM_META,
  stellarHelmBuiltinPatch,
} from './stellarHelmPack';

export const V8_DEFAULTS: EngineParams = {
  // Audio Physics ICE v1 + ice-pack-firing-schedules-v1 (crossPlane)
  masterGain: 0.72,
  stereoWidth: 0.48,
  limiterCeiling: 0.95,
  rpmIdle: 48,
  rpmRedline: 248,
  cylinders: 8,
  roughness: 0.62,
  growl: 0.72,
  presence: 0.36,
  intake: 0.58,
  exhaust: 0.78,
  ignitionNoise: 0.24,
  muffling: 0.34,
  rpmCurve: 0.58,
  // Asymmetric soft pulse (~4–5 ms feel on worklet 0–1 scale)
  pulseWidth: 0.5,
  // Living-drive ~2.0% → worklet scale
  pulseJitter: 0.333,
  exhaustLength: 0.62,
  exhaustFeedback: 0.76,
  crackle: 0.38,
  misfire: 0.05,
  firingFamily: 1,
  firingMask: 0,
  collectorDelayMs: 1.8,
  bankOffsetDeg: 90,
  tauManifold: 0.12,
  tauExhaust: 0.22,
};

export const I4_DEFAULTS: EngineParams = {
  // evenI4 (family 3) — snappy even-fire
  masterGain: 0.68,
  stereoWidth: 0.3,
  limiterCeiling: 0.95,
  rpmIdle: 70,
  rpmRedline: 320,
  cylinders: 4,
  roughness: 0.2,
  growl: 0.28,
  presence: 0.62,
  intake: 0.55,
  exhaust: 0.38,
  ignitionNoise: 0.18,
  muffling: 0.2,
  rpmCurve: 0.48,
  pulseWidth: 0.26,
  // ~0.8% living-drive
  pulseJitter: 0.133,
  exhaustLength: 0.3,
  exhaustFeedback: 0.66,
  crackle: 0.2,
  misfire: 0.01,
  firingFamily: 3,
  firingMask: 0,
  collectorDelayMs: 0.4,
  bankOffsetDeg: 0,
  tauManifold: 0.07,
  tauExhaust: 0.1,
};

export const EV_DEFAULTS: EngineParams = {
  masterGain: 0.65,
  stereoWidth: 0.4,
  limiterCeiling: 0.95,
  whinePitch: 180,
  gearSteps: 0.35,
  inverterBuzz: 0.4,
  presence: 0.55,
  muffling: 0.2,
  rpmCurve: 0.4,
};

export const TIE_DEFAULTS: EngineParams = {
  masterGain: 0.72,
  stereoWidth: 0.28,
  limiterCeiling: 0.95,
  // Twin motor bed ~50–70 Hz pole (ref-B DNA) — always-on continuous drive bed
  corePitch: 62,
  pulseRate: 0.36,
  motorDetune: 0.55,
  motorMix: 0.58,
  motorEnable: 1,
  resonance: 0.62,
  formantQ: 0.62,
  noiseBody: 0.62,
  body: 0.5,
  carrierBite: 0.44,
  // Dry-leaning wet/dry + subtle twin width
  doppler: 0.2,
  wetDry: 0.2,
  stereoTwin: 0.35,
  spoolLag: 0.58,
  // Formant howl (ref-A/F) — continuous hold, not gated phrases
  engineHowl: 0.9,
  formantHowl: 0.92,
  howlMix: 0.92,
  howlEnable: 1,
  formantSpread: 0.52,
  formantShift: 0.5,
  // Shallow slow phrase AM — breathe the bellow, never gate/chop the scream
  phraseRate: 0.28,
  phraseDepth: 0.18,
  // Brighter scream burst (ref-C) — aggression accent, combinable
  screamEnable: 1,
  screamMix: 0.35,
  screamBright: 0.55,
  // Rising CF surge (ref-D) — throttle-spike gesture
  surgeEnable: 1,
  surgeMix: 0.7,
  // Grit + air
  grit: 0.42,
  gritMix: 0.42,
  gritEnable: 1,
  wetHiss: 0.78,
  air: 0.78,
  airMix: 0.78,
  airEnable: 1,
  afterburn: 0.3,
  ionSpark: 0.3,
  hum: 0.42,
  ionHum: 0.42,
};

/** Optional full-stack preset (ref-E DNA): balanced combination defaults. */
export const TIE_FULL_STACK: EngineParams = {
  ...TIE_DEFAULTS,
  motorMix: 0.55,
  howlMix: 0.85,
  formantHowl: 0.85,
  screamMix: 0.45,
  screamBright: 0.5,
  surgeMix: 0.75,
  airMix: 0.7,
  wetHiss: 0.7,
  air: 0.7,
  gritMix: 0.48,
  grit: 0.48,
  formantSpread: 0.48,
  formantShift: 0.52,
  phraseDepth: 0.16,
  body: 0.55,
  wetDry: 0.22,
};

export const F14_DEFAULTS: EngineParams = {
  masterGain: 0.74,
  stereoWidth: 0.62,
  limiterCeiling: 0.95,
  spoolPitch: 88,
  intakeWhine: 0.48,
  compressor: 0.72,
  turbine: 0.74,
  jetRoar: 0.7,
  afterburn: 0.8,
  jetScream: 0.42,
  idleSpool: 0.58,
  spoolInertia: 0.64,
  airframe: 0.55,
  rpmCurve: 0.52,
};

export const I6_DEFAULTS: EngineParams = {
  // i6Even (family 3) — silk; distinguish from i4 via cylinders + eventAnglesDeg
  masterGain: 0.68,
  stereoWidth: 0.34,
  limiterCeiling: 0.95,
  rpmIdle: 62,
  rpmRedline: 280,
  cylinders: 6,
  roughness: 0.16,
  growl: 0.4,
  presence: 0.5,
  intake: 0.52,
  exhaust: 0.52,
  ignitionNoise: 0.12,
  muffling: 0.26,
  rpmCurve: 0.5,
  pulseWidth: 0.34,
  // ~0.7% living-drive
  pulseJitter: 0.117,
  exhaustLength: 0.4,
  exhaustFeedback: 0.7,
  crackle: 0.16,
  misfire: 0,
  firingFamily: 3,
  firingMask: 0,
  collectorDelayMs: 0.5,
  bankOffsetDeg: 0,
  tauManifold: 0.09,
  tauExhaust: 0.14,
};


export const ROTARY_DEFAULTS: EngineParams = {
  // rotary chamber-pulse (family 4) — twin-rotor stack, 3 chambers each
  masterGain: 0.7,
  stereoWidth: 0.42,
  limiterCeiling: 0.95,
  rpmIdle: 55,
  rpmRedline: 300,
  // total chamber slots (= chambersPerRotor * rotors) for HUD / mask bits
  cylinders: 6,
  roughness: 0.28,
  growl: 0.48,
  presence: 0.55,
  intake: 0.62,
  exhaust: 0.58,
  ignitionNoise: 0.16,
  muffling: 0.22,
  rpmCurve: 0.52,
  pulseWidth: 0.32,
  // ~1.2% living-drive
  pulseJitter: 0.2,
  exhaustLength: 0.36,
  exhaustFeedback: 0.68,
  crackle: 0.18,
  misfire: 0.02,
  firingFamily: 4,
  firingMask: 0,
  chambersPerRotor: 3,
  rotors: 2,
  collectorDelayMs: 0.7,
  bankOffsetDeg: 60,
  tauManifold: 0.08,
  tauExhaust: 0.13,
};

export const EV_CLIMB_DEFAULTS: EngineParams = {
  masterGain: 0.68,
  stereoWidth: 0.38,
  limiterCeiling: 0.95,
  whinePitch: 220,
  gearSteps: 0.55,
  inverterBuzz: 0.48,
  presence: 0.62,
  muffling: 0.18,
  rpmCurve: 0.42,
  gearMesh: 0.55,
};

export const EV_REGEN_DEFAULTS: EngineParams = {
  masterGain: 0.66,
  stereoWidth: 0.36,
  limiterCeiling: 0.95,
  whinePitch: 320,
  gearSteps: 0.2,
  inverterBuzz: 0.28,
  presence: 0.58,
  muffling: 0.22,
  rpmCurve: 0.38,
  regenHowl: 0.78,
};

export const EV_DUAL_DEFAULTS: EngineParams = {
  masterGain: 0.7,
  stereoWidth: 0.72,
  limiterCeiling: 0.95,
  whinePitch: 160,
  gearSteps: 0.4,
  inverterBuzz: 0.42,
  presence: 0.55,
  muffling: 0.2,
  rpmCurve: 0.45,
  dualBeat: 0.68,
  motorRoar: 0.72,
};

export const BUILTIN_PATCHES: EnginePatch[] = [
  {
    version: 0,
    id: 'v8-rumble',
    name: 'V8 Rumble',
    kind: 'ice',
    topology: 'v8-rumble',
    params: { ...V8_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Organic V8 crossPlane: bank-A [0,180,270,450] potato lope + waveguide body. Throttle morphs intake/brightness — not pitch-only. Physics schedule τ_m 0.12 / τ_e 0.22.',
      tags: ['ice', 'v8', 'pulse', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'i4-zip',
    name: 'I4 Zip',
    kind: 'ice',
    topology: 'i4-zip',
    params: { ...I4_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb: 'evenI4: [0,180,360,540] snappy pulses, higher idle, fast gas τ — all procedural.',
      tags: ['ice', 'i4', 'pulse', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'i6-silk',
    name: 'I6 Silk',
    kind: 'ice',
    topology: 'i6-silk',
    params: { ...I6_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'i6Even silk: [0,120,…,600] smoother lope, soft roughness, refined waveguide. Family int 3 (same as i4; cyl + angles distinguish).',
      tags: ['ice', 'i6', 'pulse', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'rotary-hum',
    name: 'Rotary Hum',
    kind: 'ice',
    topology: 'rotary-hum',
    params: { ...ROTARY_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Rotary chamber-pulse (family 4): 3 chambers × 2 rotors on eccentric 360° — stacked cadence + soft waveguide. Drop-chamber via firingMask changes lope. Original procedural — no samples.',
      tags: ['ice', 'rotary', 'chamber-pulse', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'ev-whine',
    name: 'EV Whine',
    kind: 'ev-whine',
    topology: 'ev-whine',
    params: { ...EV_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb: 'Inverter whine stack with subtle gear-step color.',
      tags: ['ev', 'whine', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'ev-inverter-climb',
    name: 'Inverter Climb',
    kind: 'ev-whine',
    topology: 'ev-inverter-climb',
    params: { ...EV_CLIMB_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Ascending inverter whine with stepped gear mesh — climbs with speed/throttle. Original procedural EV — no samples.',
      tags: ['ev', 'inverter', 'gear', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'ev-regen-howl',
    name: 'Regen Howl',
    kind: 'ev-whine',
    topology: 'ev-regen-howl',
    params: { ...EV_REGEN_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'High whistle that blooms on decel: speed high + throttle drop opens regen howl. Original procedural EV — no samples.',
      tags: ['ev', 'regen', 'decel', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'ev-dual-motor',
    name: 'Dual Motor',
    kind: 'ev-whine',
    topology: 'ev-dual-motor',
    params: { ...EV_DUAL_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Split L/R inverter beat under dense mid motor roar — dual-motor performance mood, fully original synthesis.',
      tags: ['ev', 'dual-motor', 'roar', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'aerospace-f14',
    name: 'Carrier Jet',
    kind: 'aerospace',
    topology: 'aerospace-f14',
    params: { ...F14_DEFAULTS } as Record<string, number | string>,
    meta: {
      blurb:
        'Organic Harrier-class jet: spool/compressor noise + buried whine, dense core roar, wet AB morph, airframe buffet. Spool inertia lags throttle — no laser scream. Original synthesis — no samples.',
      tags: ['aerospace', 'jet', 'twin-spool', 'organic', 'free'],
      author: 'DriveSynth',
    },
  },
  {
    version: 0,
    id: 'ion-twin',
    name: 'Twin Ion',
    kind: 'scifi',
    topology: 'ion-twin',
    params: { ...TIE_DEFAULTS } as Record<string, number | string>,
    ionLayers: [
      { id: 'motorBed', name: 'Motor Bed', enabled: true, gain: 0.58 },
      { id: 'formantHowl', name: 'Formant Howl', enabled: true, gain: 0.92 },
      { id: 'screamBurst', name: 'Scream Burst', enabled: true, gain: 0.35 },
      { id: 'surge', name: 'Surge', enabled: true, gain: 0.7 },
      { id: 'airSwoosh', name: 'Air Swoosh', enabled: true, gain: 0.78 },
      { id: 'grit', name: 'Grit', enabled: true, gain: 0.42 },
    ],
    meta: {
      blurb:
        'Twin Ion procedural layers (combinable): motorBed + formantHowl + screamBurst + surge + airSwoosh + grit. Continuous roar default; enable/mix each config. Original synthesis only — no samples.',
      tags: ['scifi', 'ion', 'formant', 'layers', 'free'],
      author: 'DriveSynth',
    },
  },
  // Night Pursuit (experimental flagship): dedicated cross-plane V8 voice — see nightPursuitPack.ts
  nightPursuitBuiltinPatch(),
  // Chrono Coupe (experimental): odd-fire 90° V6 + charge mode — see chronoCoupePack.ts
  chronoCoupeBuiltinPatch(),
  // Stellar Helm (experimental): dedicated starship drive hum voice — see stellarHelmPack.ts
  stellarHelmBuiltinPatch(),
  ...REVFORGE_PATCHES,
];

export function defaultsForTopology(topology: string): EngineParams {
  switch (topology) {
    case 'i4-zip':
      return { ...I4_DEFAULTS };
    case 'i6-silk':
      return { ...I6_DEFAULTS };
    case 'rotary-hum':
      return { ...ROTARY_DEFAULTS };
    case 'ev-whine':
      return { ...EV_DEFAULTS };
    case 'ev-inverter-climb':
      return { ...EV_CLIMB_DEFAULTS };
    case 'ev-regen-howl':
      return { ...EV_REGEN_DEFAULTS };
    case 'ev-dual-motor':
      return { ...EV_DUAL_DEFAULTS };
    case 'ion-twin':
    case 'tie-fighter': // legacy topology id
      return { ...TIE_DEFAULTS };
    case 'aerospace-f14':
      return { ...F14_DEFAULTS };
    case 'night-pursuit':
      return { ...NIGHT_PURSUIT_DEFAULTS };
    case CHRONO_COUPE.id:
      return { ...CHRONO_COUPE_DEFAULTS };
    case STELLAR_HELM_PACK.id:
      return { ...STELLAR_HELM_DEFAULTS };
    case 'v8-rumble':
    default:
      return { ...V8_DEFAULTS };
  }
}

export function defaultsForKind(kind: EngineKind): EngineParams {
  switch (kind) {
    case 'ev-whine':
      return { ...EV_DEFAULTS };
    case 'aerospace':
      return { ...F14_DEFAULTS };
    case 'scifi':
      return { ...TIE_DEFAULTS };
    case 'ice':
    default:
      return { ...V8_DEFAULTS };
  }
}

/** Default builtin id when switching builder category tabs */
export function defaultPatchIdForKind(kind: EngineKind): string {
  switch (kind) {
    case 'ev-whine':
      return 'ev-whine';
    case 'aerospace':
      return 'aerospace-f14';
    case 'scifi':
      return 'ion-twin';
    case 'ice':
    default:
      return 'v8-rumble';
  }
}

/** Night Pursuit extras (appended by paramMetaForKind('ice', 'night-pursuit')). */
export const NIGHT_PURSUIT_PARAM_META: ParamMeta[] = [
  { id: 'camLope', label: 'Cam Lope', min: 0, max: 1, step: 0.01, group: 'nightPursuit' },
  { id: 'bankSplit', label: 'Dual Exhaust', min: 0, max: 1, step: 0.01, group: 'nightPursuit' },
  { id: 'overrunBurble', label: 'Overrun Burble', min: 0, max: 1, step: 0.01, group: 'nightPursuit' },
  { id: 'loadRich', label: 'Load Richness', min: 0, max: 1, step: 0.01, group: 'nightPursuit' },
  { id: 'bodyDepth', label: 'Body Depth', min: 0, max: 1, step: 0.01, group: 'nightPursuit' },
  { id: 'pursuitBoost', label: 'Pursuit Boost', min: 0, max: 1, step: 0.01, group: 'pursuit' },
  { id: 'turboWhistle', label: 'Turbo Whistle', min: 0, max: 1, step: 0.01, group: 'pursuit' },
  { id: 'intakeWhoosh', label: 'Intake Whoosh', min: 0, max: 1, step: 0.01, group: 'pursuit' },
  { id: 'wastegate', label: 'Blow-off', min: 0, max: 1, step: 0.01, group: 'pursuit' },
  { id: 'scannerTick', label: 'Scanner Tick', min: 0, max: 1, step: 0.01, group: 'pursuit' },
];

/** Chrono Coupe extras (appended by paramMetaForKind('ice', CHRONO_COUPE.id)). */
export const CHRONO_COUPE_PARAM_META: ParamMeta[] = [
  { id: 'camLope', label: 'Idle Hunt', min: 0, max: 1, step: 0.01, group: 'chronoCoupe' },
  { id: 'bankSplit', label: 'Bank Split', min: 0, max: 1, step: 0.01, group: 'chronoCoupe' },
  { id: 'overrunBurble', label: 'Overrun Pops', min: 0, max: 1, step: 0.01, group: 'chronoCoupe' },
  { id: 'injectionHiss', label: 'Injection Hiss', min: 0, max: 1, step: 0.01, group: 'chronoCoupe' },
  { id: 'shellResonance', label: 'Shell Ring', min: 0, max: 1, step: 0.01, group: 'chronoCoupe' },
  { id: 'wheeze', label: 'Intake Wheeze', min: 0, max: 1, step: 0.01, group: 'chronoCoupe' },
  { id: 'chargeIntensity', label: 'Charge Intensity', min: 0, max: 1, step: 0.01, group: 'charge' },
];

export function paramMetaForKind(kind: EnginePatch['kind'], topology?: string): ParamMeta[] {
  if (kind === 'ice' && topology === CHRONO_COUPE.id) {
    return [...paramMetaForKind('ice'), ...CHRONO_COUPE_PARAM_META];
  }
  if (kind === 'ice' && topology === 'night-pursuit') {
    return [...paramMetaForKind('ice'), ...NIGHT_PURSUIT_PARAM_META];
  }
  if (topology === STELLAR_HELM_PACK.id) {
    return STELLAR_HELM_PARAM_META.map((m) => ({ ...m }));
  }
  const master: ParamMeta[] = [
    { id: 'masterGain', label: 'Master', min: 0, max: 1, step: 0.01 },
    { id: 'stereoWidth', label: 'Width', min: 0, max: 1, step: 0.01 },
  ];

  if (kind === 'ice') {
    return [
      ...master,
      { id: 'rpmIdle', label: 'Idle Hz', min: 30, max: 120, step: 1, unit: 'Hz' },
      { id: 'rpmRedline', label: 'Redline Hz', min: 120, max: 400, step: 1, unit: 'Hz' },
      {
        id: 'cylinders',
        label: 'Cylinders',
        min: 3,
        max: 12,
        kind: 'segmented',
        options: [3, 4, 6, 8, 10, 12],
      },
      { id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 },
      { id: 'growl', label: 'Growl', min: 0, max: 1, step: 0.01 },
      { id: 'presence', label: 'Presence', min: 0, max: 1, step: 0.01 },
      { id: 'intake', label: 'Intake', min: 0, max: 1, step: 0.01 },
      { id: 'exhaust', label: 'Exhaust', min: 0, max: 1, step: 0.01 },
      { id: 'ignitionNoise', label: 'Ignition', min: 0, max: 1, step: 0.01 },
      { id: 'muffling', label: 'Muffling', min: 0, max: 1, step: 0.01 },
      { id: 'pulseWidth', label: 'Pulse Width', min: 0.05, max: 1, step: 0.01 },
      { id: 'pulseJitter', label: 'Pulse Jitter', min: 0, max: 0.5, step: 0.01 },
      { id: 'exhaustLength', label: 'Pipe Length', min: 0.05, max: 1, step: 0.01 },
      { id: 'exhaustFeedback', label: 'Pipe Feedback', min: 0.1, max: 0.97, step: 0.01 },
      { id: 'crackle', label: 'Crackle', min: 0, max: 1, step: 0.01 },
      { id: 'misfire', label: 'Misfire', min: 0, max: 1, step: 0.01 },
      {
        id: 'firingFamily',
        label: 'Firing Family',
        min: 0,
        max: 4,
        kind: 'segmented',
        options: [0, 1, 2, 3, 4],
      },
      {
        id: 'chambersPerRotor',
        label: 'Chambers/Rotor',
        min: 2,
        max: 4,
        kind: 'segmented',
        options: [2, 3, 4],
      },
      {
        id: 'rotors',
        label: 'Rotors',
        min: 1,
        max: 2,
        kind: 'segmented',
        options: [1, 2],
      },
      { id: 'firingMask', label: 'Firing Mask', min: 0, max: 255, step: 1 },
      { id: 'rpmCurve', label: 'RPM Curve', min: 0, max: 1, step: 0.01 },
    ];
  }

  if (kind === 'ev-whine') {
    return [
      ...master,
      { id: 'whinePitch', label: 'Whine Hz', min: 60, max: 600, step: 1, unit: 'Hz' },
      { id: 'gearSteps', label: 'Gear Steps', min: 0, max: 1, step: 0.01 },
      { id: 'inverterBuzz', label: 'Inverter', min: 0, max: 1, step: 0.01 },
      { id: 'presence', label: 'Presence', min: 0, max: 1, step: 0.01 },
      { id: 'muffling', label: 'Muffling', min: 0, max: 1, step: 0.01 },
      { id: 'gearMesh', label: 'Gear Mesh', min: 0, max: 1, step: 0.01 },
      { id: 'regenHowl', label: 'Regen Howl', min: 0, max: 1, step: 0.01 },
      { id: 'dualBeat', label: 'Dual Beat', min: 0, max: 1, step: 0.01 },
      { id: 'motorRoar', label: 'Motor Roar', min: 0, max: 1, step: 0.01 },
      { id: 'rpmCurve', label: 'Speed Curve', min: 0, max: 1, step: 0.01 },
    ];
  }

  if (kind === 'aerospace') {
    return [
      ...master,
      { id: 'spoolPitch', label: 'Spool Hz', min: 40, max: 280, step: 1, unit: 'Hz' },
      { id: 'intakeWhine', label: 'Whine', min: 0, max: 1, step: 0.01 },
      { id: 'compressor', label: 'Compressor', min: 0, max: 1, step: 0.01 },
      { id: 'turbine', label: 'Core Roar', min: 0, max: 1, step: 0.01 },
      { id: 'jetRoar', label: 'Exhaust', min: 0, max: 1, step: 0.01 },
      { id: 'afterburn', label: 'Afterburner', min: 0, max: 1, step: 0.01 },
      { id: 'jetScream', label: 'Nozzle Hiss', min: 0, max: 1, step: 0.01 },
      { id: 'idleSpool', label: 'Idle Spool', min: 0, max: 1, step: 0.01 },
      { id: 'spoolInertia', label: 'Spool Inertia', min: 0, max: 1, step: 0.01 },
      { id: 'airframe', label: 'Airframe', min: 0, max: 1, step: 0.01 },
      { id: 'rpmCurve', label: 'Spool Curve', min: 0, max: 1, step: 0.01 },
    ];
  }

  // Sci-fi / Ion Twin — grouped layer knobs (enable + mix + character)
  return [
    ...master,
    { id: 'motorEnable', label: 'Motor On', min: 0, max: 1, step: 1, kind: 'segmented', options: [0, 1], group: 'motorBed' },
    { id: 'motorMix', label: 'Motor Mix', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'corePitch', label: 'Motor Hz', min: 40, max: 200, step: 1, unit: 'Hz', group: 'motorBed' },
    { id: 'pulseRate', label: 'Motor Rate', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'motorDetune', label: 'Motor Detune', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'noiseBody', label: 'Motor Body', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'body', label: 'Cabin Body', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'spoolLag', label: 'Spool Lag', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'stereoTwin', label: 'Stereo Twin', min: 0, max: 1, step: 0.01, group: 'motorBed' },
    { id: 'howlEnable', label: 'Howl On', min: 0, max: 1, step: 1, kind: 'segmented', options: [0, 1], group: 'formantHowl' },
    { id: 'howlMix', label: 'Howl Mix', min: 0, max: 1, step: 0.01, group: 'formantHowl' },
    { id: 'formantShift', label: 'Formant Shift', min: 0, max: 1, step: 0.01, group: 'formantHowl' },
    { id: 'formantSpread', label: 'Formant Spread', min: 0, max: 1, step: 0.01, group: 'formantHowl' },
    { id: 'resonance', label: 'Formant Q', min: 0, max: 1, step: 0.01, group: 'formantHowl' },
    { id: 'phraseRate', label: 'Phrase Rate', min: 0, max: 1, step: 0.01, group: 'formantHowl' },
    { id: 'phraseDepth', label: 'Phrase Depth', min: 0, max: 1, step: 0.01, group: 'formantHowl' },
    { id: 'screamEnable', label: 'Scream On', min: 0, max: 1, step: 1, kind: 'segmented', options: [0, 1], group: 'screamBurst' },
    { id: 'screamMix', label: 'Scream Mix', min: 0, max: 1, step: 0.01, group: 'screamBurst' },
    { id: 'screamBright', label: 'Scream Bright', min: 0, max: 1, step: 0.01, group: 'screamBurst' },
    { id: 'surgeEnable', label: 'Surge On', min: 0, max: 1, step: 1, kind: 'segmented', options: [0, 1], group: 'surge' },
    { id: 'surgeMix', label: 'Surge Mix', min: 0, max: 1, step: 0.01, group: 'surge' },
    { id: 'airEnable', label: 'Air On', min: 0, max: 1, step: 1, kind: 'segmented', options: [0, 1], group: 'airSwoosh' },
    { id: 'airMix', label: 'Air Mix', min: 0, max: 1, step: 0.01, group: 'airSwoosh' },
    { id: 'wetDry', label: 'Wet/Dry', min: 0, max: 1, step: 0.01, group: 'airSwoosh' },
    { id: 'gritEnable', label: 'Grit On', min: 0, max: 1, step: 1, kind: 'segmented', options: [0, 1], group: 'grit' },
    { id: 'gritMix', label: 'Grit Mix', min: 0, max: 1, step: 0.01, group: 'grit' },
    { id: 'afterburn', label: 'Ion Spark', min: 0, max: 1, step: 0.01, group: 'ionSupport' },
    { id: 'hum', label: 'Ion Hum', min: 0, max: 1, step: 0.01, group: 'ionSupport' },
  ];
}

/** Legacy pack / revforge scene ids → canonical after Tie→Ion Twin rename. */
export const LEGACY_PACK_IDS: Record<string, string> = {
  'tie-fighter': 'ion-twin',
  'revforge-tie-fighter': 'revforge-trenchlight',
  ...PACK_ENGINE_MIGRATIONS,
};

export function resolveLegacyPackId(id: string): string {
  return LEGACY_PACK_IDS[id] ?? id;
}

/** Normalize topology on loaded patches (prefs / localStorage / deep links). */
export function resolveLegacyTopology(topology: string): string {
  return topology === 'tie-fighter' ? 'ion-twin' : topology;
}

/** Migrate saved/user EnginePatch ids + topology off retired tie-fighter. */
export function migrateEnginePatch(patch: EnginePatch): EnginePatch {
  const id = resolveLegacyPackId(patch.id);
  const topology = resolveLegacyTopology(String(patch.topology)) as EnginePatch['topology'];
  if (id === patch.id && topology === patch.topology) return patch;
  const name =
    id === 'ion-twin' &&
    (patch.id === 'tie-fighter' || /tie\s*fighter/i.test(patch.name) || patch.name === 'Ion Twin')
      ? 'Twin Ion'
      : patch.name;
  return { ...patch, id, topology, name };
}

export function getBuiltin(id: string): EnginePatch | undefined {
  const resolved = resolveLegacyPackId(id);
  return BUILTIN_PATCHES.find((p) => p.id === resolved);
}

/** Param metas for builder graph node types */
export function paramMetaForNodeType(type: string): ParamMeta[] {
  switch (type) {
    case 'PulseTrain':
      return [
        { id: 'cylinders', label: 'Cylinders', min: 3, max: 12, kind: 'segmented', options: [3, 4, 6, 8, 10, 12] },
        { id: 'pulseWidth', label: 'Width', min: 0.05, max: 1, step: 0.01 },
        { id: 'pulseJitter', label: 'Jitter', min: 0, max: 0.5, step: 0.01 },
        { id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 },
        { id: 'misfire', label: 'Misfire', min: 0, max: 1, step: 0.01 },
        {
          id: 'firingFamily',
          label: 'Firing Family',
          min: 0,
          max: 4,
          kind: 'segmented',
          options: [0, 1, 2, 3, 4],
        },
        {
          id: 'chambersPerRotor',
          label: 'Chambers/Rotor',
          min: 2,
          max: 4,
          kind: 'segmented',
          options: [2, 3, 4],
        },
        {
          id: 'rotors',
          label: 'Rotors',
          min: 1,
          max: 2,
          kind: 'segmented',
          options: [1, 2],
        },
        { id: 'firingMask', label: 'Firing Mask', min: 0, max: 255, step: 1 },
      ];
    case 'ExhaustWaveguide':
      return [
        { id: 'exhaustLength', label: 'Length', min: 0.05, max: 1, step: 0.01 },
        { id: 'exhaustFeedback', label: 'Feedback', min: 0.1, max: 0.97, step: 0.01 },
        { id: 'muffling', label: 'Muffler', min: 0, max: 1, step: 0.01 },
        { id: 'growl', label: 'Growl', min: 0, max: 1, step: 0.01 },
      ];
    case 'IntakeNoise':
      return [{ id: 'intake', label: 'Amount', min: 0, max: 1, step: 0.01 }];
    case 'Mechanical':
      return [{ id: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 }];
    case 'FormantHowl':
      return [
        { id: 'formantHowl', label: 'Amount', min: 0, max: 1, step: 0.01 },
        { id: 'formantSpread', label: 'Spread', min: 0, max: 1, step: 0.01 },
        { id: 'resonance', label: 'Q', min: 0, max: 1, step: 0.01 },
      ];
    case 'WetRoadNoise':
      return [
        { id: 'wetHiss', label: 'Amount', min: 0, max: 1, step: 0.01 },
        { id: 'doppler', label: 'Smear', min: 0, max: 1, step: 0.01 },
      ];
    case 'TurbineSpool':
      return [
        { id: 'spoolPitch', label: 'Spool Hz', min: 40, max: 280, step: 1, unit: 'Hz' },
        { id: 'turbine', label: 'Turbine', min: 0, max: 1, step: 0.01 },
        { id: 'idleSpool', label: 'Idle', min: 0, max: 1, step: 0.01 },
      ];
    case 'IntakeWhine':
      return [{ id: 'intakeWhine', label: 'Amount', min: 0, max: 1, step: 0.01 }];
    case 'Afterburner':
      return [
        { id: 'afterburn', label: 'Afterburn', min: 0, max: 1, step: 0.01 },
        { id: 'jetScream', label: 'Nozzle Hiss', min: 0, max: 1, step: 0.01 },
      ];
    case 'CompressorStage':
      return [
        { id: 'compressor', label: 'Compressor', min: 0, max: 1, step: 0.01 },
        { id: 'jetRoar', label: 'Roar', min: 0, max: 1, step: 0.01 },
      ];
    case 'Filter':
    case 'biquad':
      return [
        { id: 'frequency', label: 'Freq', min: 80, max: 8000, step: 1, unit: 'Hz' },
        { id: 'Q', label: 'Q', min: 0.1, max: 18, step: 0.1 },
        { id: 'gain', label: 'Gain dB', min: -24, max: 24, step: 0.5 },
      ];
    case 'Gain':
    case 'gain':
      return [{ id: 'gain', label: 'Gain', min: 0, max: 2, step: 0.01 }];
    case 'Mix':
    case 'merge':
      return [{ id: 'gain', label: 'Mix', min: 0, max: 1, step: 0.01 }];
    case 'Osc':
    case 'osc':
      return [
        { id: 'frequency', label: 'Freq', min: 20, max: 2000, step: 1, unit: 'Hz' },
        { id: 'detune', label: 'Detune', min: -100, max: 100, step: 1 },
      ];
    case 'Noise':
    case 'noise':
      return [{ id: 'gain', label: 'Level', min: 0, max: 1, step: 0.01 }];
    default:
      return [{ id: 'gain', label: 'Gain', min: 0, max: 1, step: 0.01 }];
  }
}
