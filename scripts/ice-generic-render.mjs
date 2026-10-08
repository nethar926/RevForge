/**
 * Generic ICE offline renderer (v8-rumble / i4-zip / i6-silk / rotary-hum): the REAL
 * pulse-engine-processor worklet driven like EngineSynthImpl.applyIceDriving's generic worklet
 * path (idle band clamp, living-drive throttle lag, real EngineStateBridge, same param pushes).
 * Used by scripts/ice-pops.mjs. Fully procedural — nothing is loaded except code.
 *
 * profile(t) → DrivingInput { speed, throttle, load?, rpm?, rpmNorm?, overrun? }
 * opts: { params, sampleRate, seed, topology }
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    return { resolve, reject, promise };
  };
}
const { OfflineAudioContext, AudioWorkletNode } = await import('node-web-audio-api');
const seeded = await import('./seeded-random.mjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKLET = join(ROOT, 'src/audio/worklets/pulse-engine-processor.js');
const jiti = createJiti(join(ROOT, 'package.json'));
const builtins = await jiti.import(join(ROOT, 'src/audio/builtins.ts'));
const bridgeMod = await jiti.import(join(ROOT, 'src/audio/engineStateBridge.ts'));
const idleMod = await jiti.import(join(ROOT, 'src/audio/idleBand.ts'));
const burst = await jiti.import(join(ROOT, 'src/audio/overrunBurst.js')).catch(() => null);

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

export function genericIceParams(topology) {
  return { ...builtins.defaultsForTopology(topology) };
}

export async function renderGenericIce(profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const topology = opts.topology ?? 'v8-rumble';
  const params = { ...genericIceParams(topology), ...(opts.params ?? {}) };
  if (opts.seed != null) seeded.seedMathRandom(opts.seed);
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  await ctx.audioWorklet.addModule(opts.seed != null ? seeded.seededWorkletModule(WORKLET, opts.seed) : WORKLET);
  const node = new AudioWorkletNode(ctx, 'pulse-engine-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const master = ctx.createGain();
  master.gain.value = clamp(Number(params.masterGain ?? 0.7)) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = lerp(-18, -3, clamp(Number(params.limiterCeiling ?? 0.95)));
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  node.connect(master);
  const set = (name, v, t) => {
    const prm = node.parameters.get(name);
    if (prm && Number.isFinite(v)) prm.setValueAtTime(v, t);
  };
  const famDefault =
    topology === 'v8-rumble' ? 1 : topology === 'i6-silk' || topology === 'i4-zip' ? 3 : topology === 'rotary-hum' ? 4 : 0;
  const fam = Number(params.firingFamily ?? famDefault);
  const cyl = Number(params.cylinders ?? 8);
  const band = idleMod.DEFAULT_IDLE_BAND;
  const idleHz = idleMod.iceFiringHzFromRpm(band.rpmMin, cyl);
  const idleMaxHz = idleMod.iceFiringHzFromRpm(band.rpmMax, cyl);
  const red = Number(params.rpmRedline ?? 240);
  const bridge = new bridgeMod.EngineStateBridge();
  const jitPhys = params.pulseJitter != null ? bridgeMod.workletJitterToPhysics(Number(params.pulseJitter)) : undefined;
  const liftState = burst ? burst.createOverrunBurstState() : null;
  const idleRpmPack = (Number(params.rpmIdle ?? 50) * 120) / Math.max(4, cyl);
  const redRpmPack = (red * 120) / Math.max(4, cyl);
  let thrLag = 0;
  let loadLag = 0;
  let pitch = 0;
  const dt = 1 / 60;
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const d = profile(t);
    const thrRaw = clamp(d.throttle ?? 0);
    const speed = clamp(d.speed ?? 0);
    const a = 1 - Math.exp(-0.06 / 0.15);
    thrLag += (thrRaw - thrLag) * a;
    loadLag += ((d.load ?? 0) - loadLag) * a;
    pitch = pitch * 0.94 + (Math.random() * 2 - 1) * 0.006;
    let rpmNorm;
    if (d.rpmNorm != null) rpmNorm = clamp(d.rpmNorm);
    else {
      const fromSpeed = Math.pow(speed, 1 + Number(params.rpmCurve ?? 0.55) * 1.8);
      rpmNorm = clamp(Math.max(fromSpeed, thrRaw * (speed < 0.04 ? 0.55 : 0.35)) + (speed >= 0.04 ? thrRaw * 0.12 : 0));
    }
    let fund = lerp(idleHz, red, rpmNorm);
    const gate = idleMod.idleGate(speed, thrRaw, rpmNorm);
    if (gate > 0.01) {
      const bandFund = idleHz + (idleMaxHz - idleHz) * idleMod.idleJitter01(pitch);
      fund = lerp(fund, Math.min(bandFund, idleMaxHz), gate);
    }
    const rpmFromFund = clamp(fund * (120 / Math.max(4, cyl)), 200, 9000);
    const baseRpm = d.rpm != null && Number.isFinite(d.rpm) ? d.rpm : rpmFromFund;
    let rpmOut = baseRpm * (1 + pitch * 0.012);
    if (gate > 0.5) rpmOut = Math.min(band.rpmMax, Math.max(band.rpmMin * 0.98, rpmOut));
    bridge.tick(
      dt,
      { speed, throttle: thrLag, load: loadLag, rpmHint: rpmOut },
      {
        packId: topology,
        cylinders: cyl,
        firingFamily: fam,
        firingMask: params.firingMask != null ? Number(params.firingMask) : undefined,
        misfireAmount: Number(params.misfire ?? 0),
        pulseJitter: jitPhys,
        tauMan: params.tauManifold != null ? Number(params.tauManifold) : undefined,
        tauExhaust: params.tauExhaust != null ? Number(params.tauExhaust) : undefined,
        collectorDelayMs: params.collectorDelayMs != null ? Number(params.collectorDelayMs) : undefined,
        bankOffsetDeg: params.bankOffsetDeg != null ? Number(params.bankOffsetDeg) : undefined,
        chambersPerRotor: params.chambersPerRotor != null ? Number(params.chambersPerRotor) : undefined,
        rotors: params.rotors != null ? Number(params.rotors) : undefined,
      },
    );
    const wp = bridge.toWorkletParams();
    const thr = thrLag;
    const muffBase = Number(params.muffling ?? 0.3);
    set('rpm', wp.rpm, t);
    set('throttle', wp.throttle, t);
    set('load', wp.load, t);
    set('cylinders', wp.cylinders, t);
    set('firingFamily', wp.firingFamily || fam, t);
    set('chambersPerRotor', Number(wp.chambersPerRotor ?? params.chambersPerRotor ?? 3), t);
    set('rotors', Number(wp.rotors ?? params.rotors ?? 1), t);
    set('misfire', wp.misfire, t);
    set('firingMask', wp.firingMask, t);
    set('collectorDelayMs', clamp(Number(wp.collectorDelayMs ?? params.collectorDelayMs ?? 1), 0.5, 3), t);
    set('pulseWidth', Number(params.pulseWidth ?? 0.35), t);
    set('pulseJitter', Math.min(0.5, (jitPhys != null ? wp.pulseJitter : Number(params.pulseJitter ?? 0.08)) + 0.02 + Math.abs(pitch) * 0.08), t);
    set('roughness', Number(params.roughness ?? 0.4), t);
    set('growl', Number(params.growl ?? 0.6) * (0.7 + Number(params.exhaust ?? 0.5) * 0.4) * wp.growlScaleHint, t);
    set('exhaustLength', Number(params.exhaustLength ?? 0.45), t);
    set('exhaustFeedback', Number(params.exhaustFeedback ?? 0.72) * (0.85 + (1 - muffBase) * 0.15), t);
    set('mufflerMix', clamp(muffBase * (0.55 + 0.45 * wp.mufflerMixHint)), t);
    set('intake', clamp(Number(params.intake ?? 0.45) * (0.45 + 0.55 * Math.max(wp.intakeScaleHint, thr))), t);
    let crackle = Number(params.crackle ?? 0.35);
    if (liftState) {
      const b = burst.stepOverrunBurst(liftState, { throttle: thrRaw, rpm: baseRpm }, dt, { idleRpm: idleRpmPack, redlineRpm: redRpmPack });
      crackle = burst.gatedCrackle(crackle, b);
      set('overrun', 0, t);
    }
    set('crackle', crackle, t);
    set('masterGain', clamp(Number(params.masterGain ?? 0.7) * (0.75 + Number(params.presence ?? 0.45) * 0.4)), t);
  }
  const buf = await ctx.startRendering();
  if (opts.seed != null) seeded.restoreMathRandom();
  return buf;
}
