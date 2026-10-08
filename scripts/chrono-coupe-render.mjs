/**
 * Chrono Coupe offline renderer — runs the REAL pulse-engine-processor worklet (family 5) and
 * the shared chronoCoupeVoice.js chain (drive model, worklet targets, post chain, charge bus,
 * discharge, cues), driven like EngineSynthImpl.applyIceDriving with the real EngineStateBridge.
 * Used by render-snippets.mjs (preview WAV), chrono-coupe-qa.mjs and tests. Fully procedural.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
const pack = await jiti.import(join(ROOT, 'src/audio/chronoCoupePack.ts'));
const bridgeMod = await jiti.import(join(ROOT, 'src/audio/engineStateBridge.ts'));
const idleMod = await jiti.import(join(ROOT, 'src/audio/idleBand.ts'));
const voice = await import(pathToFileURL(join(ROOT, 'src/audio/chronoCoupeVoice.js')).href);
voice.setChronoCoupeOfflineScheduling(true);

export const CHRONO_COUPE = pack.CHRONO_COUPE;
export const CHRONO_COUPE_DEFAULTS = pack.CHRONO_COUPE_DEFAULTS;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * profile(t) → DrivingInput { speed, throttle, load?, rpm?, rpmNorm?, charge? (0..1), boost? }.
 * opts.params overrides defaults; opts.cues = [{ t, type: 'starter'|'shutoff'|'discharge' }].
 * opts.family forces the worklet family (A/B: 3 = even-fire V6); opts.noBus bypasses the chain.
 */
export async function renderChronoCoupe(profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const params = { ...pack.CHRONO_COUPE_DEFAULTS, ...(opts.params ?? {}) };
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  await ctx.audioWorklet.addModule(WORKLET);
  const node = new AudioWorkletNode(ctx, 'pulse-engine-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const master = ctx.createGain();
  master.gain.value = clamp(Number(params.masterGain)) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = lerp(-18, -3, clamp(Number(params.limiterCeiling ?? 0.95)));
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  const bus = new voice.ChronoCoupeBus(ctx, master);
  node.connect(opts.noBus ? master : bus.input);
  const set = (name, v, t) => {
    const prm = node.parameters.get(name);
    if (prm && Number.isFinite(v)) prm.setValueAtTime(v, t);
  };
  const bridge = new bridgeMod.EngineStateBridge();
  const band = idleMod.DEFAULT_IDLE_BAND;
  const cyl = Number(params.cylinders);
  const fam = opts.family ?? Number(params.firingFamily);
  const jitPhys = bridgeMod.workletJitterToPhysics(Number(params.pulseJitter));
  const drive = voice.createChronoCoupeDriveState(voice.ccIdleRpm(params));
  const dischargeTimes = (opts.cues ?? []).filter((c) => c.type === 'discharge').map((c) => c.t);
  let thrLag = 0;
  let loadLag = 0;
  let pitch = 0;
  const dt = 1 / 60;
  const trace = [];
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const d = profile(t);
    const thrRaw = clamp(d.throttle ?? 0);
    const speed = clamp(d.speed ?? 0);
    const a = 1 - Math.exp(-dt / 0.15);
    thrLag += (thrRaw - thrLag) * a;
    loadLag += ((d.load ?? 0) - loadLag) * a;
    pitch = pitch * 0.94 + (Math.random() * 2 - 1) * 0.006;
    const p = { ...params, pursuitBoost: d.boost ?? params.pursuitBoost };
    const dv = voice.stepChronoCoupeDrive(drive, { ...d, throttle: thrRaw, speed }, dt, p);
    let rpmOut = dv.rpm * (1 + pitch * 0.012);
    const gate = idleMod.idleGate(speed, thrRaw, dv.rpmNorm);
    if (gate > 0.5) rpmOut = Math.min(band.rpmMax, Math.max(band.rpmMin * 0.98, rpmOut));
    bridge.tick(
      dt,
      { speed, throttle: thrLag, load: loadLag, rpmHint: rpmOut },
      {
        packId: pack.CHRONO_COUPE.id,
        cylinders: cyl,
        firingFamily: fam,
        firingMask: 0,
        misfireAmount: Number(params.misfire),
        pulseJitter: jitPhys,
        tauMan: Number(params.tauManifold),
        tauExhaust: Number(params.tauExhaust),
        collectorDelayMs: Number(params.collectorDelayMs),
        bankOffsetDeg: Number(params.bankOffsetDeg),
      },
    );
    const wp = bridge.toWorkletParams();
    const thr = thrLag;
    const muffBase = Number(params.muffling);
    const base = {
      growl: Number(params.growl) * (0.7 + Number(params.exhaust) * 0.4) * wp.growlScaleHint,
      exhaustFeedback: Number(params.exhaustFeedback) * (0.85 + (1 - muffBase) * 0.15),
      mufflerMix: clamp(muffBase * (0.55 + 0.45 * wp.mufflerMixHint)),
      intake: clamp(Number(params.intake) * (0.45 + 0.55 * Math.max(wp.intakeScaleHint, thr))),
    };
    const tg = voice.chronoCoupeWorkletTargets(p, dv, thr, base);
    set('rpm', wp.rpm, t);
    set('throttle', wp.throttle, t);
    set('load', wp.load, t);
    set('cylinders', cyl, t);
    set('firingFamily', opts.family ?? tg.firingFamily, t);
    set('misfire', wp.misfire, t);
    set('firingMask', 0, t);
    set('pulseWidth', Number(params.pulseWidth), t);
    set('pulseJitter', Math.min(0.5, wp.pulseJitter + 0.02 + Math.abs(pitch) * 0.08), t);
    set('roughness', Number(params.roughness), t);
    set('exhaustLength', Number(params.exhaustLength), t);
    set('crackle', Number(params.crackle), t);
    set('masterGain', clamp(Number(params.masterGain) * (0.75 + Number(params.presence) * 0.4)), t);
    for (const k of ['camLope', 'bankSplit', 'overrun', 'overrunBurble', 'dcGuard', 'growl', 'intake', 'mufflerMix', 'exhaustFeedback', 'collectorDelayMs'])
      set(k, tg[k], t);
    // Discharge collapses the charge whine (one-shot sounds fire at the suspend point below)
    if (dischargeTimes.some((dt0) => t >= dt0 && t - dt0 < dt)) bus.spent = 1;
    bus.setCharge(d.charge ?? 0);
    withTime(bus, t, () => bus.update(p, { ...dv, rpm: wp.rpm }, thr, 0.05));
    trace.push({ t, rpm: wp.rpm, gear: dv.gear, rpmNorm: dv.rpmNorm, charge: bus.chargeSmooth });
  }
  const cueDest = ctx.createGain();
  cueDest.connect(limiter);
  for (const cue of opts.cues ?? []) {
    ctx.suspend(cue.t).then(() => {
      if (cue.type === 'starter') voice.playChronoCoupeStarter(ctx, cueDest, params, bus.white, bus.pink);
      else if (cue.type === 'shutoff') voice.playChronoCoupeShutoff(ctx, cueDest, params, bus.white, bus.pink);
      else if (cue.type === 'discharge') {
        const upd = bus.updateCharge;
        bus.updateCharge = () => undefined; // charge collapse already pre-scheduled
        bus.lastDischarge = -10;
        bus.discharge({ ...params, pursuitBoost: profile(cue.t).boost ?? params.pursuitBoost });
        bus.updateCharge = upd;
      }
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  buf.trace = trace;
  return buf;
}

function withTime(bus, t, fn) {
  const ctx = bus.ctx;
  bus.ctx = new Proxy(ctx, {
    get(target, key) {
      if (key === 'currentTime') return t;
      const v = Reflect.get(target, key, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  try {
    fn();
  } finally {
    bus.ctx = ctx;
  }
}

export function bufferToWav(audioBuffer, gain = 0.9) {
  const numCh = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const sr = audioBuffer.sampleRate;
  const dataLen = len * numCh * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const w = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, dataLen, true);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s * gain * 0x7fff, true);
      off += 2;
    }
  return Buffer.from(buf);
}
