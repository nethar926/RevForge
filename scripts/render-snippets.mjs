/**
 * Render Engines Preview WAVs via OfflineAudioContext.
 * Approximate current pack topologies (~3.5s parked-rev → accel).
 * Run: node scripts/render-snippets.mjs
 * Permanent: refresh on every audio tip before ship.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfflineAudioContext } from 'node-web-audio-api';
import { withSeededRandom } from './seeded-random.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'snippets');
const SR = 44100;
const DUR = 3.5;

/** Driving profile: idle 0–0.6s → rev 0.6–1.4 → accel 1.4–3.5 */
function driveAt(t) {
  let speed = 0;
  let throttle = 0.08;
  if (t < 0.55) {
    throttle = 0.05 + t * 0.05;
  } else if (t < 1.35) {
    throttle = 0.15 + (t - 0.55) * 0.85; // parked rev
    speed = 0.02;
  } else {
    const u = (t - 1.35) / (DUR - 1.35);
    speed = Math.min(1, u * 1.15);
    throttle = 0.55 + u * 0.4;
  }
  return { speed: Math.max(0, Math.min(1, speed)), throttle: Math.max(0, Math.min(1, throttle)) };
}

function fillNoise(buf, pink = false) {
  const ch = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < ch.length; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) {
      ch[i] = w;
    } else {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      ch[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
}

function makeNoise(ctx, seconds, pink) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  fillNoise(buf, pink);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function scheduleParam(param, when, value) {
  param.setValueAtTime(value, when);
}

/**
 * Chrono Coupe preview (~6 s): odd-fire idle → pull away and cruise while the charge builds
 * (whine + crackle) → discharge at full charge → cruise on. Real worklet + chronoCoupeVoice chain.
 */
async function renderChronoCoupePreview() {
  const { renderChronoCoupe } = await import('./chrono-coupe-render.mjs');
  const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const profile = (t) => {
    const speed = 0.76 * ramp(t, 0.8, 4.2);
    const throttle = t < 0.8 ? 0 : t < 4.2 ? 0.55 : 0.35;
    return { speed, throttle, load: throttle * 0.4, charge: Math.min(1, speed / 0.73) };
  };
  return renderChronoCoupe(profile, 6.2, { sampleRate: SR, cues: [{ t: 4.3, type: 'discharge' }] });
}

/**
 * Quiet Current previews (~11.8 s): rest → pull-away → cruise → regen lift → gentle re-apply.
 * Shared quietCurrentVoice.js drive model + bus (same as EngineSynthImpl); standard and Cyber.
 */
async function renderQuietCurrentPreview(cyber = 0) {
  const { renderQuietCurrent, quietCurrentPreviewProfile, QC_PREVIEW_SECONDS } = await import('./quiet-current-render.mjs');
  return renderQuietCurrent(quietCurrentPreviewProfile, QC_PREVIEW_SECONDS, {
    sampleRate: SR,
    params: { cyber },
    fadeOut: 0.3,
  });
}

async function renderPack(id, buildFn, renderFn) {
  // Packs with a dedicated offline renderer (real worklet + shared voice chain)
  if (renderFn) return bufferToWav(await renderFn());
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * DUR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);
  buildFn(ctx, master);
  const rendered = await ctx.startRendering();
  return bufferToWav(rendered);
}

/**
 * Stock pulse-ICE previews (v8 / i4 / i6 / rotary) run the REAL pulse-engine-processor worklet
 * driven like EngineSynthImpl (scripts/ice-render.mjs), so the shipped engine — including the
 * rpm-gated dcGuard high-rpm fix — is what the Engines page plays. Each preview is level-matched
 * to the loudness its earlier approximate preview had (whole-file RMS), peak-capped at 0.9.
 */
const ICE_PREVIEW_RMS_DB = { 'v8-rumble': -22.6, 'i4-zip': -24.5, 'i6-silk': -21.7, 'rotary-hum': -20.1 };
async function renderIcePreview(id) {
  const { renderIcePack } = await import('./ice-render.mjs');
  const buf = await renderIcePack(id, driveAt, DUR, { sampleRate: SR });
  let s = 0;
  let n = 0;
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) {
      s += x[i] * x[i];
      peak = Math.max(peak, Math.abs(x[i]));
      n++;
    }
  }
  // bufferToWav writes at 0.9 → compensate so the file RMS lands on target
  const rmsDb = 20 * Math.log10(Math.sqrt(s / n) + 1e-12) + 20 * Math.log10(0.9);
  let g = Math.pow(10, (ICE_PREVIEW_RMS_DB[id] - rmsDb) / 20);
  g = Math.min(g, 1 / Math.max(1e-6, peak));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return buf;
}

/**
 * Twin Ion preview: the LIVE voice (createEngineSynth → CharacterEngine → EngineSynthImpl scifi
 * graph, scripts/ion-twin-render.mjs) driven by driveAt over 3.5 s after a 3 s silent pre-roll
 * that skips the start-up sweep. Seeded noise → byte-identical re-renders. Preview gain only:
 * level-matched to the median integrated loudness of the other previews (BS.1770,
 * scripts/preview-loudness.mjs).
 */
const ION_TWIN_PREVIEW = { lufs: -20.4, peakCapDb: -1 };
async function renderIonTwinPreview() {
  const { integratedLufs } = await import('./loudness.mjs');
  const { renderIonTwin, ION_TWIN_PREVIEW_SEQUENCE: P } = await import('./ion-twin-render.mjs');
  const buf = await renderIonTwin(P.profile, P.dur, {
    sampleRate: SR,
    preroll: P.preroll,
    seed: 'ion-twin-preview',
    actions: P.actions,
    fadeOut: P.fadeOut,
  });
  const WAV_SCALE = 0.9; // bufferToWav writes at 0.9
  const chans = [];
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    chans.push(Float64Array.from(x, (v) => v * WAV_SCALE));
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]) * WAV_SCALE);
  }
  const lufs = integratedLufs(chans, SR);
  const g = Math.pow(10, (ION_TWIN_PREVIEW.lufs - lufs) / 20);
  if (peak * g > Math.pow(10, ION_TWIN_PREVIEW.peakCapDb / 20)) {
    throw new Error(`ion-twin preview would peak at ${(20 * Math.log10(peak * g)).toFixed(1)} dBFS`);
  }
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return buf;
}

/**
 * Night Pursuit preview (~5 s): lumpy idle → blip → launch through the 1-2 shift → lift-off
 * burble. Runs the real pulse-engine-processor + nightPursuitVoice chain.
 */
async function renderNightPursuitPreview() {
  const { renderNightPursuit } = await import('./night-pursuit-render.mjs');
  const S = (mph) => mph / 120;
  const profile = (t) => {
    if (t < 1.5) return { speed: 0, throttle: 0 };
    if (t < 1.85) return { speed: 0, throttle: 0.7 };
    if (t < 2.3) return { speed: 0, throttle: 0 };
    if (t < 4.3) return { speed: S(4 + (t - 2.3) * 22), throttle: 1, load: 0.8 };
    return { speed: S(48 - (t - 4.3) * 3), throttle: 0, load: -0.4 };
  };
  return renderNightPursuit(profile, 5.2, { sampleRate: SR });
}

/**
 * Stellar Helm preview (~4.3 s): power-up sweep settling into the hum → cruise rising with
 * speed → boost. Runs the real stellarHelmVoice.js graph (scripts/stellar-helm-render.mjs).
 */
async function renderStellarHelmPreviewBuffer() {
  const { renderStellarHelmPreview } = await import('./stellar-helm-render.mjs');
  return renderStellarHelmPreview(SR);
}

function bufferToWav(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels;
  const len = audioBuffer.length;
  const sr = audioBuffer.sampleRate;
  const dataLen = len * numCh * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(audioBuffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, (s * 0.9) * 0x7fff, true);
      off += 2;
    }
  }
  return Buffer.from(buf);
}

/** Automate gains/freqs along the drive profile at ~60Hz */
function automate(ctx, applyFrame) {
  const dt = 1 / 60;
  for (let t = 0; t <= DUR + 0.001; t += dt) {
    const d = driveAt(t);
    applyFrame(t, d);
  }
}

function buildEv(ctx, master, { climb = false, regen = false, dual = false } = {}) {
  const pink = makeNoise(ctx, 2, true);
  const white = makeNoise(ctx, 2, false);
  const whine = ctx.createOscillator();
  whine.type = 'sawtooth';
  whine.frequency.value = 180;
  whine.start();
  const whineG = ctx.createGain();
  whineG.gain.value = 0;
  const whineF = ctx.createBiquadFilter();
  whineF.type = 'bandpass';
  whineF.Q.value = climb ? 8 : 5;
  whine.connect(whineF);
  whineF.connect(whineG);
  whineG.connect(master);

  let whine2G = null;
  if (dual) {
    const w2 = ctx.createOscillator();
    w2.type = 'sawtooth';
    w2.frequency.value = 190;
    w2.detune.value = 12;
    w2.start();
    whine2G = ctx.createGain();
    whine2G.gain.value = 0;
    w2.connect(whine2G);
    whine2G.connect(master);
  }

  const buzzF = ctx.createBiquadFilter();
  buzzF.type = 'bandpass';
  buzzF.frequency.value = 3500;
  buzzF.Q.value = 4;
  const buzzG = ctx.createGain();
  buzzG.gain.value = 0;
  white.connect(buzzF);
  buzzF.connect(buzzG);
  buzzG.connect(master);

  const roarF = ctx.createBiquadFilter();
  roarF.type = 'lowpass';
  roarF.frequency.value = 600;
  const roarG = ctx.createGain();
  roarG.gain.value = 0;
  pink.connect(roarF);
  roarF.connect(roarG);
  roarG.connect(master);

  pink.start();
  white.start();

  automate(ctx, (t, d) => {
    const rpm = Math.max(d.speed, d.throttle * 0.5);
    const base = climb ? 220 : regen ? 160 : 180;
    const fund = base * (0.35 + rpm * 1.4);
    scheduleParam(whine.frequency, t, fund);
    scheduleParam(whineF.frequency, t, fund * 1.2);
    scheduleParam(whineG.gain, t, 0.06 + rpm * 0.22 + d.throttle * 0.1);
    if (whine2G) scheduleParam(whine2G.gain, t, 0.04 + rpm * 0.14);
    scheduleParam(buzzG.gain, t, 0.03 + rpm * 0.08);
    const regenAmt = regen && d.throttle < 0.25 && d.speed > 0.1 ? 0.2 : 0;
    scheduleParam(roarG.gain, t, 0.05 + rpm * 0.18 + regenAmt);
  });
}

function buildAero(ctx, master) {
  const pink = makeNoise(ctx, 2, true);
  const white = makeNoise(ctx, 2, false);
  const spool = ctx.createOscillator();
  spool.type = 'sawtooth';
  spool.frequency.value = 90;
  spool.start();
  const spoolG = ctx.createGain();
  spoolG.gain.value = 0;
  const spoolF = ctx.createBiquadFilter();
  spoolF.type = 'bandpass';
  spoolF.Q.value = 6;
  spool.connect(spoolF);
  spoolF.connect(spoolG);
  spoolG.connect(master);

  const roarF = ctx.createBiquadFilter();
  roarF.type = 'lowpass';
  roarF.frequency.value = 350;
  const roarG = ctx.createGain();
  roarG.gain.value = 0;
  pink.connect(roarF);
  roarF.connect(roarG);
  roarG.connect(master);

  const abF = ctx.createBiquadFilter();
  abF.type = 'highpass';
  abF.frequency.value = 2500;
  const abG = ctx.createGain();
  abG.gain.value = 0;
  white.connect(abF);
  abF.connect(abG);
  abG.connect(master);

  pink.start();
  white.start();

  automate(ctx, (t, d) => {
    const spoolAmt = Math.min(1, d.throttle * 0.7 + d.speed * 0.5);
    scheduleParam(spool.frequency, t, 70 + spoolAmt * 180);
    scheduleParam(spoolF.frequency, t, 800 + spoolAmt * 2000);
    scheduleParam(spoolG.gain, t, 0.04 + spoolAmt * 0.12);
    scheduleParam(roarG.gain, t, 0.08 + spoolAmt * 0.28 + d.throttle * d.throttle * 0.2);
    const ab = Math.max(0, d.throttle - 0.55) / 0.45;
    scheduleParam(abG.gain, t, ab * ab * 0.35);
  });
}

const PACKS = [
  { id: 'v8-rumble', file: 'v8-rumble.wav', render: () => renderIcePreview('v8-rumble') },
  { id: 'i4-zip', file: 'i4-zip.wav', render: () => renderIcePreview('i4-zip') },
  { id: 'i6-silk', file: 'i6-silk.wav', render: () => renderIcePreview('i6-silk') },
  { id: 'rotary-hum', file: 'rotary-hum.wav', render: () => renderIcePreview('rotary-hum') },
  { id: 'ev-whine', file: 'ev-whine.wav', build: (c, m) => buildEv(c, m) },
  { id: 'ev-inverter-climb', file: 'ev-inverter-climb.wav', build: (c, m) => buildEv(c, m, { climb: true }) },
  { id: 'ev-regen-howl', file: 'ev-regen-howl.wav', build: (c, m) => buildEv(c, m, { regen: true }) },
  { id: 'ev-dual-motor', file: 'ev-dual-motor.wav', build: (c, m) => buildEv(c, m, { dual: true }) },
  { id: 'aerospace-f14', file: 'aerospace-f14.wav', build: (c, m) => buildAero(c, m) },
  { id: 'ion-twin', file: 'ion-twin.wav', render: renderIonTwinPreview },
  { id: 'night-pursuit', file: 'night-pursuit.wav', render: renderNightPursuitPreview },
  { id: 'chrono-coupe', file: 'chrono-coupe.wav', render: renderChronoCoupePreview },
  { id: 'stellar-helm', file: 'stellar-helm.wav', render: renderStellarHelmPreviewBuffer },
  { id: 'quiet-current', file: 'quiet-current.wav', render: () => renderQuietCurrentPreview(0) },
  { id: 'quiet-current-cyber', file: 'quiet-current-cyber.wav', render: () => renderQuietCurrentPreview(1) },
];
// Optional filter: node scripts/render-snippets.mjs night-pursuit  (re-render only those ids)
const ONLY = process.argv.slice(2);

mkdirSync(OUT, { recursive: true });

for (const pack of PACKS) {
  if (ONLY.length && !ONLY.includes(pack.id)) continue;
  // Seeded per pack id → an unchanged pack re-renders byte-identical (no noise-only churn)
  const wav = await withSeededRandom(pack.id, () => renderPack(pack.id, pack.build, pack.render));
  const dest = join(OUT, pack.file);
  writeFileSync(dest, wav);
  console.log('wrote', pack.file, `(${wav.length} bytes)`);
}
console.log('done', ONLY.length || PACKS.length, 'snippets →', OUT);
process.exit(0);
