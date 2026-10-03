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

function envelope(t, attack, hold, release) {
  if (t < attack) return t / attack;
  if (t < hold) return 1;
  if (t < release) return 1 - (t - hold) / (release - hold);
  return 0;
}

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

function smoothstep(x, e0, e1) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
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

function connectGain(ctx, node, gainVal = 1) {
  const g = ctx.createGain();
  g.gain.value = gainVal;
  node.connect(g);
  return g;
}

function scheduleParam(param, when, value) {
  param.setValueAtTime(value, when);
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
 * Twin Ion preview: same buildScifi approximation, but level-matched (preview render gain only —
 * the live voice is untouched). The un-normalised render sat at ≈ −0.5 LUFS / −0.9 dBFS peak with
 * ~16 % of samples clipped in the WAV. Target = median integrated loudness of the other ten
 * previews (BS.1770, scripts/preview-loudness.mjs), peak capped at their median peak.
 */
const ION_TWIN_PREVIEW = { lufs: -20.4, peakDb: -9.6 };
async function renderIonTwinPreview() {
  const { integratedLufs } = await import('./loudness.mjs');
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * DUR), SR);
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);
  buildScifi(ctx, master);
  const buf = await ctx.startRendering();
  const WAV_SCALE = 0.9; // bufferToWav writes at 0.9
  const chans = [];
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    chans.push(Float64Array.from(x, (v) => v * WAV_SCALE));
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]) * WAV_SCALE);
  }
  const lufs = integratedLufs(chans, SR);
  const gLufs = Math.pow(10, (ION_TWIN_PREVIEW.lufs - lufs) / 20);
  const gPeak = Math.pow(10, ION_TWIN_PREVIEW.peakDb / 20) / Math.max(1e-9, peak);
  const g = Math.min(gLufs, gPeak);
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

function buildScifi(ctx, master) {
  const pink = makeNoise(ctx, 2, true);
  const white = makeNoise(ctx, 2, false);

  // Twin motor beds (LP+BP noise) — no saw/square lead
  const mLpL = ctx.createBiquadFilter();
  mLpL.type = 'lowpass';
  mLpL.frequency.value = 95;
  const mBpL = ctx.createBiquadFilter();
  mBpL.type = 'bandpass';
  mBpL.frequency.value = 65;
  mBpL.Q.value = 2.4;
  const mGL = ctx.createGain();
  mGL.gain.value = 0;
  pink.connect(mLpL);
  mLpL.connect(mBpL);
  mBpL.connect(mGL);
  mGL.connect(master);

  const mLpR = ctx.createBiquadFilter();
  mLpR.type = 'lowpass';
  mLpR.frequency.value = 110;
  const mBpR = ctx.createBiquadFilter();
  mBpR.type = 'bandpass';
  mBpR.frequency.value = 72;
  mBpR.Q.value = 2.2;
  const mGR = ctx.createGain();
  mGR.gain.value = 0;
  const twinD = ctx.createDelay(0.05);
  twinD.delayTime.value = 0.012;
  pink.connect(mLpR);
  mLpR.connect(mBpR);
  mBpR.connect(mGR);
  mGR.connect(twinD);
  twinD.connect(master);

  // Quiet triangle support
  const c1 = ctx.createOscillator();
  c1.type = 'triangle';
  c1.frequency.value = 62;
  c1.start();
  const cG = ctx.createGain();
  cG.gain.value = 0;
  c1.connect(cG);
  cG.connect(master);

  // 4-formant howl stack α ~400/700/900/1300
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 6.5;
  f1.frequency.value = 400;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 6;
  f2.frequency.value = 700;
  const f3 = ctx.createBiquadFilter();
  f3.type = 'bandpass';
  f3.Q.value = 5.5;
  f3.frequency.value = 900;
  const f4 = ctx.createBiquadFilter();
  f4.type = 'bandpass';
  f4.Q.value = 5;
  f4.frequency.value = 1300;
  const formantG = ctx.createGain();
  formantG.gain.value = 1.15;
  const howlShaper = ctx.createWaveShaper();
  const n = 256;
  const curve = new Float32Array(n);
  const k = 0.58 * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  howlShaper.curve = curve;
  const howlG = ctx.createGain();
  howlG.gain.value = 0;
  pink.connect(f1);
  pink.connect(f2);
  pink.connect(f3);
  white.connect(f4);
  f1.connect(formantG);
  f2.connect(formantG);
  f3.connect(formantG);
  f4.connect(formantG);
  formantG.connect(howlShaper);
  howlShaper.connect(howlG);
  howlG.connect(master);

  // Scream burst β ~470/1270/1480
  const s1 = ctx.createBiquadFilter();
  s1.type = 'bandpass';
  s1.frequency.value = 470;
  s1.Q.value = 7;
  const s2 = ctx.createBiquadFilter();
  s2.type = 'bandpass';
  s2.frequency.value = 1270;
  s2.Q.value = 6.5;
  const s3 = ctx.createBiquadFilter();
  s3.type = 'bandpass';
  s3.frequency.value = 1480;
  s3.Q.value = 5.5;
  const screamSh = ctx.createWaveShaper();
  {
    const n = 256;
    const curve = new Float32Array(n);
    const k = 0.62 * 40;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    screamSh.curve = curve;
  }
  const screamG = ctx.createGain();
  screamG.gain.value = 0;
  pink.connect(s1);
  white.connect(s2);
  white.connect(s3);
  s1.connect(screamSh);
  s2.connect(screamSh);
  s3.connect(screamSh);
  screamSh.connect(screamG);
  screamG.connect(master);

  const phrase = ctx.createOscillator();
  phrase.type = 'sine';
  phrase.frequency.value = 0.45;
  phrase.start();
  const phraseD = ctx.createGain();
  phraseD.gain.value = 0;
  phrase.connect(phraseD);
  phraseD.connect(howlG.gain);

  // Grit × load (2–5 kHz)
  const gritF = ctx.createBiquadFilter();
  gritF.type = 'bandpass';
  gritF.frequency.value = 3400;
  gritF.Q.value = 0.9;
  const gritG = ctx.createGain();
  gritG.gain.value = 0;
  white.connect(gritF);
  gritF.connect(gritG);
  gritG.connect(master);

  // Air / wet swoosh
  const wetF = ctx.createBiquadFilter();
  wetF.type = 'highpass';
  wetF.frequency.value = 1200;
  wetF.Q.value = 0.55;
  const wetBp = ctx.createBiquadFilter();
  wetBp.type = 'bandpass';
  wetBp.frequency.value = 3800;
  wetBp.Q.value = 0.85;
  const wetG = ctx.createGain();
  wetG.gain.value = 0;
  white.connect(wetF);
  wetF.connect(wetBp);
  wetBp.connect(wetG);
  wetG.connect(master);

  const wetBody = ctx.createBiquadFilter();
  wetBody.type = 'bandpass';
  wetBody.frequency.value = 1400;
  wetBody.Q.value = 0.7;
  const wetBodyG = ctx.createGain();
  wetBodyG.gain.value = 0;
  pink.connect(wetBody);
  wetBody.connect(wetBodyG);
  wetBodyG.connect(master);

  const afterF = ctx.createBiquadFilter();
  afterF.type = 'highpass';
  afterF.frequency.value = 2800;
  const afterG = ctx.createGain();
  afterG.gain.value = 0;
  white.connect(afterF);
  afterF.connect(afterG);
  afterG.connect(master);

  const hum = ctx.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 55;
  hum.start();
  const humG = ctx.createGain();
  humG.gain.value = 0;
  hum.connect(humG);
  humG.connect(master);

  pink.start();
  white.start();

  // Spool lag state for offline render — continuous roar (match applyScifiDriving)
  let spool = 0;
  automate(ctx, (t, d) => {
    const rpm = Math.max(d.speed * 0.65 + d.throttle * (d.speed < 0.05 ? 0.55 : 0.2), 0);
    const spoolTarget = Math.min(1, rpm * 0.65 + d.throttle * 0.45);
    spool += (spoolTarget - spool) * 0.08;
    const open = smoothstep(rpm, 0.15, 0.85);
    const openSpool = smoothstep(spool, 0.12, 0.88);
    const fund = 62 * (0.85 + spool * 1.55);

    const motorLead = Math.max(0, Math.min(1, 0.28 + (1 - openSpool) * 0.42 + d.throttle * 0.12 + (1 - open) * 0.18));
    const howlHold = Math.max(0, Math.min(1, 0.92 * 0.9 * openSpool * (0.95 + d.throttle * 0.28)));
    const howlLead = howlHold;
    const airBed = 0.78 * open * (0.42 + rpm * 0.38 + d.throttle * 0.28);
    const airLead = Math.max(0, Math.min(1, airBed));

    scheduleParam(c1.frequency, t, fund);
    scheduleParam(cG.gain, t, motorLead * 0.045);
    const motorScale = 0.42 * (0.75 + 0.58 * 0.5);
    const motorBed = Math.max(
      0.09 * motorScale * (0.45 + spool * 0.55),
      motorLead * motorScale * (0.92 - howlLead * 0.22),
    );
    scheduleParam(mGL.gain, t, motorBed);
    scheduleParam(mGR.gain, t, motorBed * 0.95);
    scheduleParam(mLpL.frequency, t, 70 + spool * 110 + d.throttle * 40);
    scheduleParam(mLpR.frequency, t, 78 + spool * 125);

    const shift = 0.72 + spool * 0.5;
    scheduleParam(f1.frequency, t, 400 * shift);
    scheduleParam(f2.frequency, t, 700 * shift);
    scheduleParam(f3.frequency, t, 900 * shift);
    scheduleParam(f4.frequency, t, (1300 + open * 80) * shift);
    const screamLead = howlLead * (1.28 + d.throttle * 0.42);
    scheduleParam(howlG.gain, t, screamLead);
    scheduleParam(formantG.gain, t, 0.95 + 0.92 * 0.45 + openSpool * 0.35);
    // screamBurst mix 0.35 default — throttle accent
    const screamBurst = 0.35 * (d.throttle * d.throttle * (0.35 + open * 0.45) + openSpool * d.throttle * 0.25);
    scheduleParam(screamG.gain, t, screamBurst * (1.1 + d.throttle * 0.35));
    const screamShift = 0.95 + 0.55 * 0.4;
    scheduleParam(s1.frequency, t, 470 * screamShift);
    scheduleParam(s2.frequency, t, 1270 * screamShift);
    scheduleParam(s3.frequency, t, 1480 * screamShift);
    // Shallow phrase breath — cap ~15% of scream (never gate)
    const breath = Math.min(screamLead * 0.15, howlLead * 0.18 * (0.12 + d.throttle * 0.1));
    scheduleParam(phraseD.gain, t, breath);
    scheduleParam(phrase.frequency, t, 0.25 + 0.28 * 0.3 + open * d.throttle * 0.6);

    scheduleParam(gritG.gain, t, 0.42 * (d.throttle * 0.12 + open * d.throttle * 0.14));
    scheduleParam(wetG.gain, t, airLead * 1.15);
    scheduleParam(wetBodyG.gain, t, airLead * 0.9 + open * 0.78 * 0.32);
    scheduleParam(wetF.frequency, t, 700 + open * 2200 + d.throttle * 1000);
    scheduleParam(wetBp.frequency, t, 2400 + open * 3400);
    scheduleParam(wetBody.frequency, t, 900 + open * 1500);
    scheduleParam(afterG.gain, t, 0.3 * open * d.throttle * d.throttle * 0.35);
    scheduleParam(humG.gain, t, Math.max(0, 1 - rpm * 2) * 0.42 * 0.2);
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
