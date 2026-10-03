/**
 * Night Pursuit offline renderer — runs the REAL pulse-engine-processor worklet plus the
 * shared nightPursuitVoice.js chain (drive model, worklet targets, post-EQ, PURSUIT bus),
 * mirroring EngineSynthImpl's worklet path + EngineStateBridge lags. Used by
 * render-snippets.mjs (preview WAV) and night-pursuit-qa.mjs (idle/cruise/WOT analysis).
 * Fully procedural: nothing is loaded except code.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!Promise.withResolvers) {
  // node-web-audio-api AudioWorklet needs this (Node < 22)
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

/** Transpile a type-only-import TS module so node can run the shipped source. */
async function loadTs(rel) {
  const ts = (await import('typescript')).default;
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), 'np-ts-'));
  const file = join(dir, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

const voice = await import(pathToFileURL(join(ROOT, 'src/audio/nightPursuitVoice.js')).href);
const pack = await loadTs('src/audio/nightPursuitPack.ts');
voice.setNightPursuitOfflineScheduling(true);
export const NIGHT_PURSUIT_DEFAULTS = pack.NIGHT_PURSUIT_DEFAULTS;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const IDLE_BAND = { rpmMin: 700, rpmMax: 900 }; // DEFAULT_IDLE_BAND

/**
 * Render `dur` seconds. profile(t) → DrivingInput (speed, throttle, load?, rpm?, rpmNorm?).
 * opts.params overrides defaults; opts.cues = [{t, type:'starter'|'shutoff'|'scanner', edge}].
 * opts.generic = true renders the stock V8 path (no Night Pursuit opt-ins/post chain) for A/B.
 */
export async function renderNightPursuit(profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const params = { ...NIGHT_PURSUIT_DEFAULTS, ...(opts.params ?? {}) };
  const generic = !!opts.generic;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  await ctx.audioWorklet.addModule(WORKLET);
  const node = new AudioWorkletNode(ctx, 'pulse-engine-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  // EngineSynthImpl: master gain → limiter → output
  const master = ctx.createGain();
  master.gain.value = clamp(params.masterGain) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18 + 15 * clamp(params.limiterCeiling ?? 0.95);
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter);
  limiter.connect(ctx.destination);
  let bus = null;
  if (generic) node.connect(master);
  else {
    bus = new voice.NightPursuitBus(ctx, master);
    node.connect(opts.noBus ? master : bus.input);
  }
  const P = (name) => node.parameters.get(name);
  const set = (name, v, t) => {
    const prm = P(name);
    if (prm) prm.setValueAtTime(v, t);
  };
  // Static pushes (applyAllParams)
  for (const [k, v] of Object.entries({
    cylinders: params.cylinders,
    firingFamily: params.firingFamily,
    firingMask: params.firingMask ?? 0,
    pulseWidth: params.pulseWidth,
    roughness: params.roughness,
    exhaustLength: params.exhaustLength,
    crackle: params.crackle,
    misfire: params.misfire,
  }))
    set(k, Number(v), 0);

  // Bridge state (EngineStateBridge.tick essentials)
  const br = { thr: 0, load: 0, rpm: 800, man: 0, open: 0.25 };
  const drive = voice.createNightPursuitDriveState(voice.npIdleRpm(params));
  const dt = 1 / 60;
  let walk = 0;
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const d = profile(t);
    const thrRaw = clamp(d.throttle ?? 0);
    const load = clamp(d.load ?? 0, -1, 1);
    const speed = clamp(d.speed ?? 0);
    const dv = generic
      ? null
      : voice.stepNightPursuitDrive(drive, { ...d, throttle: thrRaw, load, speed }, dt, params);
    // rpm: generic path = band/redline lerp from speed curve; NP = drive model
    let rpm;
    if (generic) {
      const rn = d.rpmNorm ?? clamp(Math.max(Math.pow(speed, 1 + 0.55 * 1.8), thrRaw * (speed < 0.04 ? 0.55 : 0.35)) + (speed >= 0.04 ? thrRaw * 0.12 : 0));
      const idleHz = (IDLE_BAND.rpmMin * 8) / 120;
      const fund = idleHz + (Number(params.rpmRedline) - idleHz) * rn;
      rpm = d.rpm ?? fund * 15;
    } else rpm = dv.rpm;
    walk = walk * 0.94 + (Math.random() * 2 - 1) * 0.006;
    rpm *= 1 + walk * 0.012;
    const gate = Math.min(1, Math.max(0, 1 - Math.max(speed / 0.06, thrRaw / 0.2, (dv?.rpmNorm ?? 0) / 0.12)));
    if (gate > 0.5) {
      const top = generic ? IDLE_BAND.rpmMax : IDLE_BAND.rpmMin + (IDLE_BAND.rpmMax - IDLE_BAND.rpmMin) * 0.3;
      rpm = Math.min(top, Math.max(IDLE_BAND.rpmMin * 0.98, rpm));
    }
    // living-drive throttle lag (hTc 0.15) then bridge
    br.thrLag = (br.thrLag ?? 0) + (thrRaw - (br.thrLag ?? 0)) * (1 - Math.exp(-dt / 0.15));
    const thr = br.thrLag;
    br.thr += (thr - br.thr) * Math.min(1, dt * 12);
    br.load += (load - br.load) * Math.min(1, dt * 10);
    br.rpm += (rpm - br.rpm) * Math.min(1, dt * 8);
    br.man += (thr - br.man) * (1 - Math.exp(-dt / Number(params.tauManifold ?? 0.15)));
    const openT = 0.25 + 0.65 * (0.35 * Math.max(0, br.load) + 0.65 * br.thr);
    br.open += (openT - br.open) * (1 - Math.exp(-dt / Number(params.tauExhaust ?? 0.3)));
    const base = {
      growl: Number(params.growl) * (0.7 + Number(params.exhaust) * 0.4) * (0.85 + br.open * 0.25),
      exhaustFeedback: Number(params.exhaustFeedback) * (0.85 + (1 - Number(params.muffling)) * 0.15),
      mufflerMix: clamp(Number(params.muffling) * (0.55 + 0.45 * (1 - br.open * 0.55))),
      intake: clamp(Number(params.intake) * (0.45 + 0.55 * Math.max(br.man * (0.3 + 0.7 * br.thr), thr))),
    };
    const tgt = generic ? base : voice.nightPursuitWorkletTargets(params, dv, thr, base);
    set('rpm', br.rpm, t);
    set('throttle', br.thr, t);
    set('load', br.load, t);
    set('pulseJitter', Math.min(0.5, Number(params.pulseJitter) + 0.02 + Math.abs(walk) * 0.08), t);
    set('growl', tgt.growl, t);
    set('exhaustFeedback', tgt.exhaustFeedback, t);
    set('mufflerMix', tgt.mufflerMix, t);
    set('intake', tgt.intake, t);
    set('collectorDelayMs', Math.max(0.5, Math.min(3, Number(params.collectorDelayMs))), t);
    set('masterGain', clamp(Number(params.masterGain) * (0.75 + Number(params.presence) * 0.4)), t);
    if (!generic) {
      set('camLope', tgt.camLope, t);
      set('bankSplit', tgt.bankSplit, t);
      set('overrun', tgt.overrun, t);
      set('overrunBurble', tgt.overrunBurble, t);
      set('dcGuard', tgt.dcGuard, t);
      // bus.update uses currentTime; offline we schedule at t by temporarily faking it
      scheduleBus(bus, params, dv, thr, t);
    }
  }
  // Cues route to the limiter input at full level (they bypass masterGain like EngineSynthImpl.output)
  const cueDest = ctx.createGain();
  cueDest.connect(limiter);
  for (const cue of opts.cues ?? []) {
    ctx.suspend(cue.t).then(() => {
      if (cue.type === 'starter') voice.playNightPursuitStarter(ctx, cueDest, params, bus.white, bus.pink);
      else if (cue.type === 'shutoff') voice.playNightPursuitShutoff(ctx, cueDest, params, bus.white, bus.pink);
      else if (cue.type === 'scanner') bus.scannerTick(Number(params.scannerTick) || 0.6, cue.edge === 'left' ? -1 : 1);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return buf;
}

function scheduleBus(bus, params, dv, thr, t) {
  const ctx = bus.ctx;
  const fake = { currentTime: t };
  bus.ctx = new Proxy(ctx, {
    get(target, key) {
      if (key === 'currentTime') return fake.currentTime;
      const v = Reflect.get(target, key, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  bus.update(params, dv, thr, 0.05);
  bus.ctx = ctx;
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
