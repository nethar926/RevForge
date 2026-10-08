/**
 * Stellar Helm offline renderer — runs the REAL shared voice (src/audio/stellarHelmVoice.js):
 * same drive model, targets, graph and cues as EngineSynthImpl, through the same
 * master → limiter stage. Used by render-snippets.mjs (preview WAV), the QA/measurement
 * script and tests. Fully procedural: nothing is loaded except code.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { OfflineAudioContext } = await import('node-web-audio-api');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Transpile a type-only-import TS module so node can run the shipped source. */
async function loadTs(rel) {
  const ts = (await import('typescript')).default;
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dir = mkdtempSync(join(tmpdir(), 'sh-ts-'));
  const file = join(dir, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
  writeFileSync(file, out);
  return import(pathToFileURL(file).href);
}

const voice = await import(pathToFileURL(join(ROOT, 'src/audio/stellarHelmVoice.js')).href);
const pack = await loadTs('src/audio/stellarHelmPack.ts');
voice.setStellarHelmOfflineScheduling(true);
export const STELLAR_HELM_PACK = pack.STELLAR_HELM_PACK;
export const STELLAR_HELM_DEFAULTS = pack.STELLAR_HELM_DEFAULTS;

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/**
 * Render `dur` seconds. profile(t) → { speed, throttle, load?, reverse?, boost? }.
 * opts.params overrides defaults; opts.powerUp (s) runs the start() power-up ramp at t=0
 * (default: already powered); opts.cues = [{ t, type: 'starter' | 'shutoff' }].
 * opts.wrapper = true adds the CharacterEngine output stage (EV acoustic LP, −12 dB mix
 * limiter, ×0.65) so levels match what the car actually hears.
 */
export async function renderStellarHelm(profile, dur, opts = {}) {
  const SR = opts.sampleRate ?? 44100;
  const params = { ...STELLAR_HELM_DEFAULTS, ...(opts.params ?? {}) };
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  // EngineSynthImpl: graph master → limiter → output
  const master = ctx.createGain();
  master.gain.value = clamp(params.masterGain) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18 + 15 * clamp(params.limiterCeiling ?? 0.95);
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter);
  const output = ctx.createGain();
  limiter.connect(output);
  let acoustic = null;
  if (opts.wrapper) {
    acoustic = ctx.createBiquadFilter();
    acoustic.type = 'lowpass';
    acoustic.Q.value = 0.55;
    acoustic.frequency.value = 2600;
    const mix = ctx.createDynamicsCompressor();
    mix.threshold.value = -12;
    mix.knee.value = 6;
    mix.ratio.value = 20;
    mix.attack.value = 0.002;
    mix.release.value = 0.18;
    const trim = ctx.createGain();
    trim.gain.value = 0.65;
    output.connect(acoustic);
    acoustic.connect(mix);
    mix.connect(trim);
    trim.connect(ctx.destination);
  } else output.connect(ctx.destination);

  const v = new voice.StellarHelmVoice(ctx, master);
  if (opts.powerUp) v.powerUp(opts.powerUp, 0);
  else v.powerUp(0.05, 0);

  const state = voice.createStellarHelmDriveState();
  const dt = 1 / 60;
  const hzAt = [];
  for (let t = 0; t <= dur + 1e-6; t += dt) {
    const d = profile(t);
    const p = d.boost !== undefined ? { ...params, pursuitBoost: d.boost } : params;
    const drv = voice.stepStellarHelmDrive(state, d, dt, p);
    v.update(p, drv, 0.08, t);
    hzAt.push(v.coreHz());
    if (acoustic) acoustic.frequency.linearRampToValueAtTime(2600 + clamp(d.speed ?? 0) * 6200, t);
  }
  // Cues are scheduled at their time directly (no suspend/resume race in offline contexts)
  for (const cue of opts.cues ?? []) {
    const hz = hzAt[Math.min(hzAt.length - 1, Math.round(cue.t / dt))];
    if (cue.type === 'starter') voice.playStellarHelmStarter(ctx, output, params, v.noiseBuf, hz, cue.t);
    else if (cue.type === 'shutoff') {
      v.powerDown(voice.SH_SHUTOFF_SECONDS * 0.85, cue.t);
      voice.playStellarHelmShutoff(ctx, output, params, v.noiseBuf, hz, cue.t);
    }
  }
  return ctx.startRendering();
}

/** The ~4.3 s preview: power-up → cruise rising with speed → boost. */
export function previewProfile(t) {
  if (t < 1.5) return { speed: 0, throttle: 0, boost: 0 };
  if (t < 3.1) return { speed: clamp((t - 1.5) / 1.6) * 0.7, throttle: 0.55, boost: 0 };
  return { speed: 0.7 + (t - 3.1) * 0.12, throttle: 0.75, boost: 1 };
}
export const PREVIEW_SECONDS = 4.3;

export async function renderStellarHelmPreview(sampleRate = 44100) {
  const buf = await renderStellarHelm(previewProfile, PREVIEW_SECONDS, {
    sampleRate,
    powerUp: 1.6,
    cues: [{ t: 0.02, type: 'starter' }],
  });
  // 120 ms fade at the very end so the preview never clicks off
  const fade = Math.floor(0.12 * buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
  return buf;
}

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
      const s = Math.max(-1, Math.min(1, chans[c][i] * gain));
      view.setInt16(off, s * 0x7fff, true);
      off += 2;
    }
  return Buffer.from(buf);
}
