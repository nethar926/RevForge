/**
 * Stock ICE offline renderer: runs the REAL pulse-engine-processor worklet driven the same way
 * EngineSynthImpl.applyIceDriving does (real builtins, EngineStateBridge, idle band, living-drive
 * lag + jitter, worklet → master → limiter). Used by render-snippets.mjs (v8/i4/i6/rotary
 * previews) and dcguard-qa.mjs (before/after levels). Fully procedural.
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKLET = join(ROOT, 'src/audio/worklets/pulse-engine-processor.js');
const jiti = createJiti(join(ROOT, 'package.json'));
const builtins = await jiti.import(join(ROOT, 'src/audio/builtins.ts'));
const idle = await jiti.import(join(ROOT, 'src/audio/idleBand.ts'));
const utils = await jiti.import(join(ROOT, 'src/audio/utils.ts'));
const bridgeMod = await jiti.import(join(ROOT, 'src/audio/engineStateBridge.ts'));
const dcMod = await jiti.import(join(ROOT, 'src/audio/iceDcGuard.ts'));

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

export function icePatch(id) {
  const p = builtins.BUILTIN_PATCHES.find((x) => x.id === id);
  if (!p) throw new Error(`no builtin ${id}`);
  return p;
}

/**
 * profile(t) → DrivingInput { speed, throttle, load?, rpm?, rpmNorm? }.
 * opts.dcGuard: 'auto' (shipped rpm-gated guard, default) | 'off' | number (fixed).
 */
export async function renderIcePack(id, profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const patch = icePatch(id);
  const p = { ...patch.params, ...(opts.params ?? {}) };
  const topo = patch.topology;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  await ctx.audioWorklet.addModule(WORKLET);
  const node = new AudioWorkletNode(ctx, 'pulse-engine-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const master = ctx.createGain();
  master.gain.value = clamp(Number(p.masterGain ?? 0.7)) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = lerp(-18, -3, clamp(Number(p.limiterCeiling ?? 0.95)));
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  node.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);
  const set = (name, v, t) => {
    const prm = node.parameters.get(name);
    if (prm && Number.isFinite(v)) prm.setValueAtTime(v, t);
  };
  const bridge = new bridgeMod.EngineStateBridge();
  const band = idle.DEFAULT_IDLE_BAND;
  const cyl = Number(p.cylinders ?? 8);
  const famDefault =
    topo === 'v8-rumble' ? 1 : topo === 'i6-silk' || topo === 'i4-zip' ? 3 : topo === 'rotary-hum' ? 4 : 0;
  const fam = Number(p.firingFamily ?? famDefault);
  const jitPhys = p.pulseJitter != null ? bridgeMod.workletJitterToPhysics(Number(p.pulseJitter)) : undefined;
  let thrLag = 0;
  let loadLag = 0;
  let pitch = 0;
  const dt = 1 / 60;
  const trace = [];
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const d = profile(t);
    const a = 1 - Math.exp(-dt / 0.15);
    thrLag += (d.throttle - thrLag) * a;
    loadLag += ((d.load ?? 0) - loadLag) * a;
    pitch = pitch * 0.94 + (Math.random() * 2 - 1) * 0.006;
    let rn;
    if (d.rpmNorm !== undefined) rn = clamp(d.rpmNorm);
    else {
      const fromSpeed = utils.rpmCurve(d.speed, Number(p.rpmCurve ?? 0.55));
      const fromThr = d.throttle * (d.speed < 0.04 ? 0.55 : 0.35);
      rn = clamp(Math.max(fromSpeed, fromThr) + (d.speed >= 0.04 ? d.throttle * 0.12 : 0));
    }
    const idleHz = idle.iceFiringHzFromRpm(band.rpmMin, cyl);
    const idleMax = idle.iceFiringHzFromRpm(band.rpmMax, cyl);
    let fund = lerp(idleHz, Number(p.rpmRedline ?? 240), rn);
    const gate = idle.idleGate(d.speed, d.throttle, rn);
    if (gate > 0.01) {
      const bandFund = idleHz + (idleMax - idleHz) * idle.idleJitter01(pitch);
      fund = lerp(fund, Math.min(bandFund, idleMax), gate);
    }
    const rpm = clamp(fund * (120 / Math.max(4, cyl)), 200, 9000);
    let rpmOut = (d.rpm != null ? d.rpm : rpm) * (1 + pitch * 0.012);
    if (gate > 0.5) rpmOut = Math.min(band.rpmMax, Math.max(band.rpmMin * 0.98, rpmOut));
    bridge.tick(
      dt,
      { speed: d.speed, throttle: thrLag, load: loadLag, rpmHint: rpmOut },
      {
        packId: id,
        cylinders: cyl,
        firingFamily: fam,
        firingMask: p.firingMask != null ? Number(p.firingMask) : undefined,
        dropCyl: p.dropCyl != null ? Number(p.dropCyl) : undefined,
        misfireAmount: Number(p.misfire ?? 0),
        pulseJitter: jitPhys,
        tauMan: p.tauManifold != null ? Number(p.tauManifold) : undefined,
        tauExhaust: p.tauExhaust != null ? Number(p.tauExhaust) : undefined,
        collectorDelayMs: p.collectorDelayMs != null ? Number(p.collectorDelayMs) : undefined,
        bankOffsetDeg: p.bankOffsetDeg != null ? Number(p.bankOffsetDeg) : undefined,
        chambersPerRotor: p.chambersPerRotor != null ? Number(p.chambersPerRotor) : undefined,
        rotors: p.rotors != null ? Number(p.rotors) : undefined,
      },
    );
    const wp = bridge.toWorkletParams();
    set('rpm', wp.rpm, t);
    set('throttle', wp.throttle, t);
    set('load', wp.load, t);
    set('cylinders', wp.cylinders, t);
    set('firingFamily', wp.firingFamily || fam, t);
    set('chambersPerRotor', Number(wp.chambersPerRotor ?? p.chambersPerRotor ?? 3), t);
    set('rotors', Number(wp.rotors ?? p.rotors ?? 1), t);
    set('misfire', wp.misfire, t);
    set('firingMask', wp.firingMask, t);
    set('collectorDelayMs', Math.max(0.5, Math.min(3, Number(wp.collectorDelayMs ?? p.collectorDelayMs ?? 1))), t);
    set('pulseWidth', Number(p.pulseWidth ?? 0.35), t);
    set('pulseJitter', Math.min(0.5, (jitPhys != null ? wp.pulseJitter : Number(p.pulseJitter ?? 0.08)) + 0.02 + Math.abs(pitch) * 0.08), t);
    set('roughness', Number(p.roughness ?? 0.4), t);
    set('growl', Number(p.growl ?? 0.6) * (0.7 + Number(p.exhaust ?? 0.5) * 0.4) * wp.growlScaleHint, t);
    set('exhaustLength', Number(p.exhaustLength ?? 0.45), t);
    set('exhaustFeedback', Number(p.exhaustFeedback ?? 0.72) * (0.85 + (1 - Number(p.muffling ?? 0.3)) * 0.15), t);
    set('mufflerMix', clamp(Number(p.muffling ?? 0.3) * (0.55 + 0.45 * wp.mufflerMixHint)), t);
    set('intake', clamp(Number(p.intake ?? 0.45) * (0.45 + 0.55 * Math.max(wp.intakeScaleHint, thrLag))), t);
    set('crackle', Number(p.crackle ?? 0.35), t);
    set('masterGain', clamp(Number(p.masterGain ?? 0.7) * (0.75 + Number(p.presence ?? 0.45) * 0.4)), t);
    const mode = opts.dcGuard ?? 'auto';
    const dc = mode === 'off' ? 0 : mode === 'auto' ? dcMod.iceDcGuardForRpm(wp.rpm, p.dcGuard) : Number(mode);
    set('dcGuard', dc, t);
    trace.push({ t, rpm: wp.rpm, dc });
  }
  const buf = await ctx.startRendering();
  buf.trace = trace;
  return buf;
}
