/**
 * Beat Box engine catalogue: six original procedural ICE archetypes (generic names only).
 * Each entry carries the public facts (cylinders, idle, redline, gearing hints) plus the voice
 * spec the worklet plays (firing table from the real firing order and crank angles, pulse
 * shape, pipe lengths, resonances, intake, mechanics, turbo). All numbers are our own, derived
 * from engine acoustics; see docs/beatbox-audio.md.
 */

/** One cylinder (or rotor chamber) firing slot. */
export interface FireSlot {
  /** Crank angle of exhaust blowdown in the 720° cycle. */
  deg: number;
  /** Exhaust bank: 0 = left pipe, 1 = right pipe. */
  bank: 0 | 1;
  /** Extra primary-pipe travel to the collector (ms); unequal headers → uneven arrival. */
  primaryMs: number;
  /** Fixed combustion gain (1 = nominal) on top of a seeded random imbalance. */
  gain?: number;
}

export interface BeatboxVoiceSpec {
  idleRpm: number;
  redline: number;
  cycleDeg: number;
  fire: FireSlot[];
  intakeDeg?: number;
  pulse: { riseDeg: number; minMs: number; maxMs: number; k2: boolean; neg: number; noise: number; noiseTau: number };
  cycleVar: number;
  imbalance: number;
  ampJitter: number;
  timingJitterDeg: number;
  lazyFire: number;
  brap: number;
  hunt: number;
  camLope: number;
  pipe: { lenMsA: number; lenMsB: number; tailMs: number; fb: number; tailFb: number; damp: number; cross: number };
  /** Fixed shell / muffler modes: [Hz, Q, gain]. */
  modes: [number, number, number][];
  /** Thin-wall metallic ringing modes excited by gas noise: [Hz, Q, gain]. */
  metal?: [number, number, number][];
  muffler: { base: number; load: number; rpm: number; off: number };
  rasp: { hz: number; rpmHz: number; q: number; amt: number };
  drive: number;
  radHz: number;
  intake: { amt: number; hz: number; rpmHz: number; loadHz: number; q: number; honkHz: number; honkQ: number; honk: number; growl: number; durDeg?: number };
  mech: { tick: number; tickHz: number; whir: number; whirOrder: number; bay: number; bayHz: number };
  turbo?: { spoolRpm: number; lagS: number; whine: number; whineHz: number; whineRange: number; hiss: number; bov: number; flutter: number; muffle: number };
  /** Engine-order body partials: [order, dB]. */
  body: { orders: [number, number][]; lpHz: number; gain: number };
  cabin?: { boomHz: number; lpHz: number };
  pop: number;
  exGain: number;
  width: number;
  /** Output trim so all six sit at a similar loudness at the same drive. */
  trim: number;
}

export interface BeatboxEngineInfo {
  id: BeatboxEngineId;
  name: string;
  description: string;
  cylinders: number;
  layout: string;
  firingOrder: string;
  idleRpm: number;
  redline: number;
  /** Fuel-cut rpm (limiter bounce, only reachable free-revving / at the rpm cap). */
  limiterRpm: number;
  /** Gear ratios the test-drive helper uses (overall incl. final drive). */
  gears: number[];
  voice: BeatboxVoiceSpec;
}

export type BeatboxEngineId = 'crossplane-v8' | 'flatplane-v8' | 'turbo-i6' | 'flat6-boxer' | 'v12-gt' | 'twin-rotor';

/** Build the even-fire slot list for a firing order (cylinder numbers) and a bank function. */
function slots(order: number[], step: number, bankOf: (cyl: number) => 0 | 1, primaryMs: (cyl: number) => number, gain?: (cyl: number) => number): FireSlot[] {
  return order.map((cyl, i) => ({ deg: i * step, bank: bankOf(cyl), primaryMs: primaryMs(cyl), gain: gain ? gain(cyl) : 1 }));
}

// Cross-plane V8, firing order 1-8-4-3-6-5-7-2, odd cylinders on the left bank → per-bank
// intervals 270/180/90/180 (the burble). Log-style manifolds: each cylinder further down the
// bank travels further to the collector.
const CROSS_PRIMARY: Record<number, number> = { 1: 0.0, 3: 0.55, 5: 1.1, 7: 1.7, 2: 0.25, 4: 0.8, 6: 1.35, 8: 1.95 };
// Flat-plane V8, firing order 1-5-3-7-4-8-2-6, cylinders 1–4 bank A, 5–8 bank B: banks alternate,
// each bank fires every 180° like an inline four. Equal-length headers.
// Inline six, 1-5-3-6-2-4, 120°; twin-scroll pairs 1-2-3 / 4-5-6 merge at the turbine.
// Flat six, 1-6-2-4-3-5, 120°; cylinders 1-2-3 left, 4-5-6 right → banks alternate.
// 60° V12, 1-7-5-11-3-9-6-12-2-8-4-10; 1–6 bank A, 7–12 bank B → banks alternate every 60°.
// Twin rotor: each rotor fires once per eccentric-shaft turn, rotors 180° apart → 4 events / 720°.

export const BEATBOX_ENGINES: readonly BeatboxEngineInfo[] = [
  {
    id: 'crossplane-v8',
    name: 'Cross-plane V8',
    description: 'Big-bore cross-plane V8 with a lumpy cam and true dual exhaust: uneven per-bank burble, deep thump.',
    cylinders: 8,
    layout: 'V8 90°, cross-plane crank',
    firingOrder: '1-8-4-3-6-5-7-2',
    idleRpm: 720,
    redline: 6400,
    limiterRpm: 6600,
    gears: [12.6, 8.4, 6.1, 4.7, 3.7, 2.9],
    voice: {
      idleRpm: 720,
      redline: 6400,
      cycleDeg: 720,
      fire: slots([1, 8, 4, 3, 6, 5, 7, 2], 90, (c) => (c % 2 ? 0 : 1), (c) => CROSS_PRIMARY[c], (c) => ({ 1: 1.08, 8: 0.9, 4: 1.12, 3: 0.86, 6: 1.04, 5: 0.82, 7: 1.15, 2: 0.95 })[c] ?? 1),
      pulse: { riseDeg: 30, minMs: 0.5, maxMs: 1.6, k2: false, neg: 3.4, noise: 0.42, noiseTau: 2.4 },
      cycleVar: 0.3,
      imbalance: 0.9,
      ampJitter: 0.2,
      timingJitterDeg: 5,
      lazyFire: 0.1,
      brap: 0,
      hunt: 1,
      camLope: 1.0,
      pipe: { lenMsA: 5.6, lenMsB: 6.2, tailMs: 12.5, fb: 0.5, tailFb: 0.35, damp: 0.42, cross: 0.12 },
      modes: [[95, 2.5, 0.55], [230, 3, 0.35], [560, 4, 0.25]],
      muffler: { base: 1150, load: 3200, rpm: 1600, off: 350 },
      rasp: { hz: 1300, rpmHz: 900, q: 1.2, amt: 0.35 },
      drive: 1.6,
      radHz: 45,
      intake: { amt: 0.14, hz: 520, rpmHz: 900, loadHz: 700, q: 1.4, honkHz: 150, honkQ: 4, honk: 0.25, growl: 0.35 },
      mech: { tick: 0.035, tickHz: 2900, whir: 0.01, whirOrder: 21, bay: 0.012, bayHz: 1400 },
      body: { orders: [[4, 0], [2, -12], [0.5, -20], [1, -16], [8, -9], [12, -16]], lpHz: 1200, gain: 0.07 },
      cabin: { boomHz: 55, lpHz: 6000 },
      pop: 1.0,
      exGain: 1,
      width: 0.45,
      trim: 0.44,
    },
  },
  {
    id: 'flatplane-v8',
    name: 'Flat-plane V8',
    description: 'High-revving flat-plane V8: even firing, equal-length headers, bright raspy shriek near its 9,000 rpm redline.',
    cylinders: 8,
    layout: 'V8 90°, flat-plane crank',
    firingOrder: '1-5-3-7-4-8-2-6',
    idleRpm: 950,
    redline: 9000,
    limiterRpm: 9200,
    gears: [10.2, 7.0, 5.2, 4.1, 3.35, 2.8],
    voice: {
      idleRpm: 950,
      redline: 9000,
      cycleDeg: 720,
      fire: slots([1, 5, 3, 7, 4, 8, 2, 6], 90, (c) => (c <= 4 ? 0 : 1), (c) => ((c * 37) % 5) * 0.04),
      pulse: { riseDeg: 26, minMs: 0.32, maxMs: 1.6, k2: true, neg: 3.0, noise: 0.45, noiseTau: 1.8 },
      cycleVar: 0.1,
      imbalance: 0.18,
      ampJitter: 0.12,
      timingJitterDeg: 2.5,
      lazyFire: 0,
      brap: 0,
      hunt: 0.6,
      camLope: 0,
      pipe: { lenMsA: 3.4, lenMsB: 3.55, tailMs: 7.5, fb: 0.55, tailFb: 0.35, damp: 0.6, cross: 0.3 },
      modes: [[160, 3, 0.5], [690, 4, 0.45], [1700, 3, 0.35]],
      muffler: { base: 1400, load: 4800, rpm: 3200, off: 500 },
      rasp: { hz: 2200, rpmHz: 1600, q: 1.1, amt: 0.6 },
      drive: 2.6,
      radHz: 80,
      intake: { amt: 0.22, hz: 800, rpmHz: 1600, loadHz: 900, q: 1.5, honkHz: 260, honkQ: 4, honk: 0.25, growl: 0.3 },
      mech: { tick: 0.05, tickHz: 3600, whir: 0.016, whirOrder: 26, bay: 0.016, bayHz: 2200 },
      body: { orders: [[4, 0], [2, -10], [8, -6], [12, -12], [16, -16]], lpHz: 1800, gain: 0.05 },
      cabin: { boomHz: 70, lpHz: 7000 },
      pop: 0.9,
      exGain: 1,
      width: 0.25,
      trim: 0.3,
    },
  },
  {
    id: 'turbo-i6',
    name: 'Turbo Inline-6',
    description: 'Single-turbo straight six: smooth even howl, spool whistle under boost and a blow-off sigh on lift.',
    cylinders: 6,
    layout: 'Inline 6, turbocharged',
    firingOrder: '1-5-3-6-2-4',
    idleRpm: 780,
    redline: 7200,
    limiterRpm: 7400,
    gears: [12.0, 7.9, 5.7, 4.4, 3.6, 3.0],
    voice: {
      idleRpm: 780,
      redline: 7200,
      cycleDeg: 720,
      fire: slots([1, 5, 3, 6, 2, 4], 120, (c) => (c <= 3 ? 0 : 1), (c) => [0, 0.3, 0.15, 0, 0.05, 0.2, 0.35][c]),
      pulse: { riseDeg: 36, minMs: 0.5, maxMs: 1.8, k2: true, neg: 3.6, noise: 0.38, noiseTau: 2.4 },
      cycleVar: 0.08,
      imbalance: 0.2,
      ampJitter: 0.09,
      timingJitterDeg: 2,
      lazyFire: 0,
      brap: 0,
      hunt: 0.7,
      camLope: 0,
      pipe: { lenMsA: 4.8, lenMsB: 4.8, tailMs: 9.6, fb: 0.6, tailFb: 0.5, damp: 0.45, cross: 0.5 },
      modes: [[120, 3, 0.6], [340, 6, 0.6], [880, 5, 0.3]],
      muffler: { base: 1000, load: 3000, rpm: 2200, off: 350 },
      rasp: { hz: 1600, rpmHz: 1200, q: 1.3, amt: 0.25 },
      drive: 1.5,
      radHz: 55,
      intake: { amt: 0.16, hz: 650, rpmHz: 1200, loadHz: 700, q: 1.6, honkHz: 210, honkQ: 5, honk: 0.3, growl: 0.3 },
      mech: { tick: 0.03, tickHz: 3300, whir: 0.012, whirOrder: 19, bay: 0.01, bayHz: 1700 },
      turbo: { spoolRpm: 2600, lagS: 0.55, whine: 0.5, whineHz: 2400, whineRange: 4600, hiss: 0.08, bov: 0.9, flutter: 0.5, muffle: 0.3 },
      body: { orders: [[3, 0], [6, -6], [1.5, -18], [9, -12], [12, -16]], lpHz: 1500, gain: 0.06 },
      cabin: { boomHz: 62, lpHz: 6500 },
      pop: 0.7,
      exGain: 1,
      width: 0.1,
      trim: 0.355,
    },
  },
  {
    id: 'flat6-boxer',
    name: 'Flat-6 Boxer',
    description: 'Horizontally opposed six: hollow, metallic induction-and-exhaust wail that hardens toward 8,800 rpm.',
    cylinders: 6,
    layout: 'Flat 6 (boxer)',
    firingOrder: '1-6-2-4-3-5',
    idleRpm: 880,
    redline: 8800,
    limiterRpm: 9000,
    gears: [10.6, 7.2, 5.4, 4.3, 3.6, 3.05],
    voice: {
      idleRpm: 880,
      redline: 8800,
      cycleDeg: 720,
      fire: slots([1, 6, 2, 4, 3, 5], 120, (c) => (c <= 3 ? 0 : 1), (c) => [0, 0.0, 0.35, 0.7, 0.1, 0.45, 0.8][c]),
      pulse: { riseDeg: 28, minMs: 0.4, maxMs: 1.9, k2: true, neg: 3.2, noise: 0.38, noiseTau: 2 },
      cycleVar: 0.1,
      imbalance: 0.32,
      ampJitter: 0.12,
      timingJitterDeg: 3,
      lazyFire: 0,
      brap: 0,
      hunt: 0.8,
      camLope: 0.35,
      pipe: { lenMsA: 3.9, lenMsB: 4.3, tailMs: 8.4, fb: 0.74, tailFb: 0.55, damp: 0.55, cross: 0.4 },
      modes: [[180, 4, 0.5], [640, 8, 0.7], [1250, 9, 0.5]],
      metal: [[1850, 22, 0.25], [2950, 26, 0.2], [4300, 30, 0.12]],
      muffler: { base: 1300, load: 4200, rpm: 2800, off: 450 },
      rasp: { hz: 2000, rpmHz: 1500, q: 1.4, amt: 0.45 },
      drive: 2.1,
      radHz: 70,
      intake: { amt: 0.24, hz: 750, rpmHz: 1500, loadHz: 800, q: 2, honkHz: 300, honkQ: 6, honk: 0.4, growl: 0.35 },
      mech: { tick: 0.06, tickHz: 3800, whir: 0.02, whirOrder: 24, bay: 0.02, bayHz: 2500 },
      body: { orders: [[3, 0], [1.5, -10], [4.5, -10], [6, -8], [7.5, -14], [9, -12]], lpHz: 1800, gain: 0.05 },
      cabin: { boomHz: 75, lpHz: 7000 },
      pop: 1.1,
      exGain: 1,
      width: 0.2,
      trim: 0.31,
    },
  },
  {
    id: 'v12-gt',
    name: 'V12 Grand Tourer',
    description: 'Naturally aspirated 60° V12: twelve even pulses per cycle, layered silky bass and a soaring top end.',
    cylinders: 12,
    layout: 'V12 60°',
    firingOrder: '1-7-5-11-3-9-6-12-2-8-4-10',
    idleRpm: 800,
    redline: 8400,
    limiterRpm: 8600,
    gears: [11.4, 7.7, 5.6, 4.4, 3.6, 3.0],
    voice: {
      idleRpm: 800,
      redline: 8400,
      cycleDeg: 720,
      fire: slots([1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10], 60, (c) => (c <= 6 ? 0 : 1), (c) => ((c * 7) % 6) * 0.06),
      pulse: { riseDeg: 22, minMs: 0.35, maxMs: 1.6, k2: true, neg: 3.4, noise: 0.22, noiseTau: 2 },
      cycleVar: 0.06,
      imbalance: 0.12,
      ampJitter: 0.08,
      timingJitterDeg: 1.5,
      lazyFire: 0,
      brap: 0,
      hunt: 0.5,
      camLope: 0,
      pipe: { lenMsA: 4.2, lenMsB: 4.55, tailMs: 10.4, fb: 0.6, tailFb: 0.45, damp: 0.5, cross: 0.25 },
      modes: [[140, 3, 0.55], [460, 5, 0.45], [1150, 4, 0.35]],
      muffler: { base: 1200, load: 4200, rpm: 3000, off: 450 },
      rasp: { hz: 2600, rpmHz: 2000, q: 1.4, amt: 0.26 },
      drive: 1.35,
      radHz: 60,
      intake: { amt: 0.34, hz: 700, rpmHz: 1700, loadHz: 900, q: 1.6, honkHz: 240, honkQ: 5, honk: 0.35, growl: 0.4 },
      mech: { tick: 0.03, tickHz: 3400, whir: 0.015, whirOrder: 22, bay: 0.012, bayHz: 2000 },
      body: { orders: [[6, 0], [3, -10], [12, -6], [18, -14], [1.5, -22]], lpHz: 2000, gain: 0.06 },
      cabin: { boomHz: 65, lpHz: 7000 },
      pop: 1.0,
      exGain: 1,
      width: 0.3,
      trim: 0.4,
    },
  },
  {
    id: 'twin-rotor',
    name: 'Twin-Rotor Rotary',
    description: 'Two-rotor rotary with peripheral-style ports: buzzy rasp to 9,000 rpm, steady idle, brap on low-rpm throttle.',
    cylinders: 2,
    layout: 'Twin rotor (Wankel type)',
    firingOrder: 'rotor 1 – rotor 2, 180° eccentric shaft',
    idleRpm: 1000,
    redline: 9000,
    limiterRpm: 9300,
    gears: [10.8, 7.0, 5.2, 4.1, 3.4, 2.9],
    voice: {
      idleRpm: 1000,
      redline: 9000,
      cycleDeg: 720,
      fire: [
        { deg: 0, bank: 0, primaryMs: 0 },
        { deg: 180, bank: 1, primaryMs: 0.25 },
        { deg: 360, bank: 0, primaryMs: 0 },
        { deg: 540, bank: 1, primaryMs: 0.25 },
      ],
      intakeDeg: 250,
      pulse: { riseDeg: 9, minMs: 0.24, maxMs: 0.7, k2: false, neg: 6.5, noise: 0.7, noiseTau: 3.5 },
      cycleVar: 0.05,
      imbalance: 0.1,
      ampJitter: 0.14,
      timingJitterDeg: 2,
      lazyFire: 0,
      brap: 0.6,
      hunt: 0,
      camLope: 0,
      pipe: { lenMsA: 3.1, lenMsB: 3.3, tailMs: 6.8, fb: 0.6, tailFb: 0.4, damp: 0.7, cross: 0.5 },
      modes: [[130, 3, 0.45], [800, 4, 0.45], [2100, 3, 0.35]],
      muffler: { base: 1600, load: 4500, rpm: 2600, off: 500 },
      rasp: { hz: 2600, rpmHz: 1200, q: 1, amt: 0.7 },
      drive: 3,
      radHz: 70,
      intake: { amt: 0.2, hz: 900, rpmHz: 1500, loadHz: 800, q: 1.4, honkHz: 280, honkQ: 4, honk: 0.3, growl: 0.35, durDeg: 270 },
      mech: { tick: 0, tickHz: 3000, whir: 0.02, whirOrder: 15, bay: 0.012, bayHz: 1900 },
      body: { orders: [[2, 0], [4, -5], [6, -9], [1, -16], [8, -12]], lpHz: 1800, gain: 0.05 },
      cabin: { boomHz: 70, lpHz: 7000 },
      pop: 1.0,
      exGain: 1,
      width: 0.12,
      trim: 0.385,
    },
  },
];

export function getBeatboxEngine(id: BeatboxEngineId | string): BeatboxEngineInfo | undefined {
  return BEATBOX_ENGINES.find((e) => e.id === id);
}
