/**
 * Quiet Current offline renderer — runs the SAME quietCurrentVoice.js drive model + voice bus
 * the browser uses (EngineSynthImpl.applyQuietCurrentDriving), then the engine master/limiter
 * and the CharacterEngine EV acoustic low-pass, so previews / QA match the live path.
 * Used by render-snippets.mjs (preview WAVs), quiet-current-qa.mjs and tests. Fully procedural.
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
const { OfflineAudioContext } = await import('node-web-audio-api');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(ROOT, 'package.json'));
const pack = await jiti.import(join(ROOT, 'src/audio/quietCurrentPack.ts'));
const voice = await import(pathToFileURL(join(ROOT, 'src/audio/quietCurrentVoice.js')).href);
voice.setQuietCurrentOfflineScheduling(true);

export const QUIET_CURRENT = pack.QUIET_CURRENT;
export const QUIET_CURRENT_DEFAULTS = pack.QUIET_CURRENT_DEFAULTS;
export { voice };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * profile(t) → DrivingInput { speed, throttle, load?, reverse?, overrun?, rpmNorm?, boost?, cyber? }.
 * opts.params overrides defaults (e.g. { cyber: 1 }); opts.cues = [{ t, type: 'on'|'off' }].
 * opts.fadeOut (s) adds a short end fade for previews.
 */
export async function renderQuietCurrent(profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const params = { ...pack.QUIET_CURRENT_DEFAULTS, ...(opts.params ?? {}) };
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  // EngineSynthImpl: master (masterGain·0.9) → limiter → output
  const master = ctx.createGain();
  master.gain.value = clamp(Number(params.masterGain)) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = lerp(-18, -3, clamp(Number(params.limiterCeiling ?? 0.95)));
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const output = ctx.createGain();
  // CharacterEngine EV acoustic low-pass: 2600 + rpm·6200 Hz, Q 0.55
  const acoustic = ctx.createBiquadFilter();
  acoustic.type = 'lowpass';
  acoustic.Q.value = 0.55;
  acoustic.frequency.value = 2600;
  const fade = ctx.createGain();
  master.connect(limiter);
  limiter.connect(output);
  output.connect(acoustic);
  acoustic.connect(fade);
  fade.connect(ctx.destination);
  if (opts.fadeOut) {
    fade.gain.setValueAtTime(1, Math.max(0, dur - opts.fadeOut));
    fade.gain.linearRampToValueAtTime(0, dur);
  }

  const bus = new voice.QuietCurrentBus(ctx, master);
  const state = voice.createQuietCurrentDriveState();
  const dt = 1 / 60;
  const trace = [];
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const d = profile(t);
    const p = {
      ...params,
      pursuitBoost: d.boost ?? params.pursuitBoost,
      cyber: d.cyber ?? params.cyber,
    };
    const input = { ...d, speed: clamp(d.speed ?? 0), throttle: clamp(d.throttle ?? 0) };
    const dv = voice.stepQuietCurrentDrive(state, input, dt, p);
    withTime(bus, t, () => bus.update(p, dv, 0.05));
    const rpm = clamp(input.rpmNorm ?? input.speed);
    acoustic.frequency.linearRampToValueAtTime(2600 + rpm * 6200, t);
    trace.push({ t, ...dv });
  }
  for (const cue of opts.cues ?? []) {
    ctx.suspend(cue.t).then(() => {
      const p = { ...params, cyber: profile(cue.t).cyber ?? params.cyber };
      if (cue.type === 'on') voice.playQuietCurrentPowerOn(ctx, output, p);
      else if (cue.type === 'off') voice.playQuietCurrentPowerOff(ctx, output, p);
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

/** Preview drive: rest → pull-away → cruise → regen lift → gentle re-apply. */
export function quietCurrentPreviewProfile(t) {
  const ease = (x) => {
    const k = clamp(x);
    return k * k * (3 - 2 * k);
  };
  let speed;
  let throttle;
  if (t < 0.8) {
    speed = 0;
    throttle = 0;
  } else if (t < 4.6) {
    speed = 0.46 * ease((t - 0.8) / 3.8);
    throttle = 0.7 * ease((t - 0.8) / 0.35);
  } else if (t < 7.8) {
    speed = 0.46 + 0.04 * ease((t - 4.6) / 3.2);
    throttle = lerp(0.7, 0.24, ease((t - 4.6) / 0.8));
  } else if (t < 10.6) {
    speed = 0.5 - 0.2 * ease((t - 7.8) / 2.8);
    throttle = lerp(0.24, 0, ease((t - 7.8) / 0.25));
  } else {
    speed = 0.3;
    throttle = 0.18 * ease((t - 10.6) / 0.5);
  }
  return { speed, throttle };
}
export const QC_PREVIEW_SECONDS = 11.8;

export function bufferToWav(audioBuffer, gain = 1) {
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
