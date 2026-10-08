#!/usr/bin/env node
/**
 * Tomcat (aerospace-f14) renders + measurements through the REAL live chain
 * (scripts/live-engine-render.mjs: createEngineSynth → CharacterEngine → EngineSynthImpl).
 *
 *   node scripts/tomcat-render.mjs levels                 LUFS / peak table (cruise, idle, mil, AB zones)
 *   node scripts/tomcat-render.mjs spectra                centroid, band split, tonal peaks per state
 *   node scripts/tomcat-render.mjs ab <outDir> <baseRoot> [clips] [labels]
 *                                                          before/after A/B WAVs (+ MP3 when ffmpeg exists);
 *                                                          clips e.g. 04,05,07; labels e.g. prev,retune
 *   node scripts/tomcat-render.mjs preview                 public/snippets/aerospace-f14.wav only
 *
 * `baseRoot` is a checkout of the previous code (e.g. `git archive e2ace06`) for the "before" files.
 * Deterministic (seeded). Fully procedural: nothing is loaded except code.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLive, channelsOf } from './live-engine-render.mjs';
import { integratedLufs, samplePeakDb } from './loudness.mjs';
import { analyse } from './spectrum.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;
const ID = 'aerospace-f14';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const S = (mph) => mph / 120;

/**
 * What the car's drive loop sends for this pack (useDriveSimulation, single-gear jet drivetrain:
 * idle 650 rpm, redline 10 000, top 72 m/s): speed, throttle = pedal, load = pedal, rpm / rpmNorm.
 */
export function app(speed, throttle) {
  const mps = speed * 120 / 2.236936;
  const rpmNorm = speed < 0.01 ? throttle : clamp(mps / 72);
  return { speed, throttle, load: throttle, rpmNorm, rpm: 650 + rpmNorm * 9350 };
}

/** Steady measurement profiles (settle `pre` s, measure the next `dur` s). */
export const STEADY = {
  idle: { pre: 7, dur: 6, f: () => app(0, 0) },
  cruise: { pre: 8, dur: 6, f: () => app(S(45), 0.22) },
  'cruise-np-profile': { pre: 8, dur: 6, f: () => ({ speed: S(45), throttle: 0.22, load: 0.1 }) },
  mid: { pre: 8, dur: 6, f: () => app(S(40), 0.5) },
  mil: { pre: 8, dur: 6, f: () => app(S(80), 0.8) },
  'ab-z1': { pre: 9, dur: 5, f: () => app(S(90), 0.83) },
  'ab-z3': { pre: 9, dur: 5, f: () => app(S(95), 0.91) },
  'ab-z5': { pre: 9, dur: 5, f: () => app(S(100), 1) },
};

const SOLO_MECH = { tcIdleOn: 0, tcWhineOn: 0, tcFanOn: 0, tcRoarOn: 0, tcAbOn: 0, tcRamOn: 0, tcStarterOn: 0 };

/** A/B clips. pre = settle seconds trimmed off the front; cues relative to render start. */
export const CLIPS = [
  { name: '01-idle', pre: 7, dur: 10, f: () => app(0, 0) },
  {
    name: '02-starter-spoolup',
    pre: 0,
    dur: 14,
    cues: [{ t: 0.05, cue: 'starter' }],
    f: (t) => app(0, t < 6 ? 0 : t < 11 ? 0.8 * ramp(t, 6, 6.4) : 0.8 * (1 - ramp(t, 11, 11.3))),
  },
  { name: '03-turbine-whine', pre: 8, dur: 10, f: () => app(S(40), 0.5) },
  { name: '04-thrust', pre: 8, dur: 10, f: () => app(S(80), 0.8) },
  {
    name: '05-afterburner-kickin',
    pre: 8,
    dur: 15,
    f: (t) => {
      const u = t - 8;
      const thr = u < 3 ? 0.8 : u < 9 ? 0.8 + 0.2 * ramp(u, 3, 3.15) : u < 12 ? 0.8 : 0.8 - 0.35 * ramp(u, 12, 12.3);
      return app(S(90), thr);
    },
  },
  {
    name: '06-mechanical',
    pre: 6,
    dur: 10,
    afterParams: SOLO_MECH,
    f: (t) => (t < 11 ? app(0, 0) : app(S(12) * ramp(t, 11, 13), 0.3)),
  },
  {
    name: '07-full-runup',
    pre: 0,
    dur: 36,
    // Shutdown cue only (no engine.stop()): node-web-audio-api mis-renders the stop() fade that follows
    // a shutdown cue (cancel → setValueAtTime after a finished linear ramp → gain ≈ 2e4). Browsers are fine.
    cues: [{ t: 0.05, cue: 'starter' }, { t: 32, cue: 'shutdown' }],
    f: (t) => {
      if (t < 5) return app(0, 0);
      if (t < 10) return app(S(14) * ramp(t, 5.5, 8), 0.3 - 0.12 * ramp(t, 8, 10));
      if (t < 10.5) return app(S(14) * (1 - ramp(t, 10, 10.5)), 0.1);
      if (t < 14) return app(0, 0.8 * ramp(t, 10.5, 10.8));
      if (t < 21) return app(S(160) * ramp(t, 14, 21) ** 1.3, 1);
      if (t < 27) return app(S(160) - S(40) * ramp(t, 21, 27), 0.55 - 0.2 * ramp(t, 21, 22));
      if (t < 31) return app(S(120) - S(100) * ramp(t, 27, 31), 0.1);
      return app(S(20) * (1 - ramp(t, 31, 32)), 0);
    },
  },
];

const measure = (buf, from, to) => {
  const ch = channelsOf(buf, from, to);
  return { lufs: integratedLufs(ch, SR), peak: samplePeakDb(ch) };
};

export async function renderSteady(name, opts = {}) {
  const c = STEADY[name];
  const buf = await renderLive(c.f, c.pre + c.dur, { patchId: ID, seed: `${ID}-${name}`, sampleRate: SR, ...opts });
  return { buf, ...measure(buf, c.pre, c.pre + c.dur) };
}

export function bufferToWav(chans, sr) {
  const numCh = chans.length;
  const len = chans[0].length;
  const dataLen = len * numCh * 2;
  const out = Buffer.alloc(44 + dataLen);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + dataLen, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(numCh, 22);
  out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(sr * numCh * 2, 28);
  out.writeUInt16LE(numCh * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(dataLen, 40);
  let o = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < numCh; c++) {
      out.writeInt16LE(Math.round(clamp(chans[c][i], -1, 1) * 0x7fff), o);
      o += 2;
    }
  return out;
}

function fade(chans, sr, inS = 0.02, outS = 0.12) {
  const a = Math.floor(inS * sr), b = Math.floor(outS * sr);
  for (const ch of chans) {
    for (let i = 0; i < a && i < ch.length; i++) ch[i] *= i / a;
    for (let i = 0; i < b && i < ch.length; i++) ch[ch.length - 1 - i] *= i / b;
  }
  return chans;
}

const scale = (chans, db) => {
  const g = 10 ** (db / 20);
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return chans;
};

async function levels() {
  const rows = [];
  for (const name of Object.keys(STEADY)) {
    const r = await renderSteady(name);
    rows.push({ name, lufs: r.lufs, peak: r.peak });
    console.log(`${name.padEnd(18)} ${r.lufs.toFixed(2).padStart(7)} LUFS  peak ${r.peak.toFixed(2).padStart(6)} dBFS`);
  }
  return rows;
}

/** Engines-page preview: idle → throttle to full → spool-up → afterburner zones 1-5 → hold. */
export function previewProfile(t) {
  return app(S(30) * ramp(t, 1, 7), t < 0.6 ? 0 : 1);
}
export const PREVIEW_SECONDS = 7;
/** Same integrated loudness the previous aerospace-f14 preview had (scripts/preview-loudness.mjs). */
export const PREVIEW_TARGET = { lufs: -19.8, peakDb: -6.5 };

export async function renderPreview() {
  // Pre-roll at idle so the preview starts on a settled engine, then trim it off
  const pre = 4;
  const buf = await renderLive((t) => previewProfile(Math.max(0, t - pre)), pre + PREVIEW_SECONDS, {
    patchId: ID,
    seed: ID,
    sampleRate: SR,
    startAt: 0,
  });
  const chans = channelsOf(buf, pre, pre + PREVIEW_SECONDS);
  const lufs = integratedLufs(chans, SR);
  const peak = samplePeakDb(chans);
  const g = Math.min(PREVIEW_TARGET.lufs - lufs, PREVIEW_TARGET.peakDb - peak);
  scale(chans, g);
  fade(chans, SR, 0.15, 0.12);
  return { chans, lufs: lufs + g, peak: peak + g };
}

async function ab(outDir, baseRoot, only = [], labels = ['before', 'after']) {
  mkdirSync(outDir, { recursive: true });
  // Level match on cruise (car chain): offset applied to every "before" file
  const after = await renderSteady('cruise');
  const before = await renderSteady('cruise', { root: baseRoot });
  const offset = after.lufs - before.lufs;
  console.log(`cruise: before ${before.lufs.toFixed(2)} LUFS, after ${after.lufs.toFixed(2)} LUFS → before files ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} dB`);
  const ff = (() => {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  const report = [];
  for (const clip of CLIPS) {
    if (only.length && !only.some((o) => clip.name.startsWith(o))) continue;
    for (const side of ['before', 'after']) {
      const root = side === 'before' ? baseRoot : ROOT;
      const params = side === 'after' ? clip.afterParams : undefined;
      const buf = await renderLive(clip.f, clip.pre + clip.dur, {
        root,
        patchId: ID,
        seed: `${ID}-${clip.name}`,
        sampleRate: SR,
        cues: clip.cues,
        stopAt: clip.stopAt,
        params,
      });
      const chans = channelsOf(buf, clip.pre, clip.pre + clip.dur);
      if (side === 'before') scale(chans, offset);
      if (clip.name === '06-mechanical' && side === 'after') {
        // soloed layer: match the full "before" mix loudness so it is audible
        const prev = report.find((r) => r.file === `${clip.name}-${labels[0]}.wav`);
        scale(chans, prev.lufs - integratedLufs(chans, SR));
      }
      fade(chans, SR, clip.pre ? 0.02 : 0.005, 0.12);
      const lufs = integratedLufs(chans, SR);
      const peak = samplePeakDb(chans);
      if (peak > -0.3) scale(chans, -0.3 - peak);
      const file = `${clip.name}-${side === 'before' ? labels[0] : labels[1]}.wav`;
      writeFileSync(join(outDir, file), bufferToWav(chans, SR));
      if (ff) {
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(outDir, file), '-codec:a', 'libmp3lame', '-b:a', '192k', join(outDir, file.replace(/\.wav$/, '.mp3'))]);
      }
      report.push({ file, lufs, peak });
      console.log(`${file.padEnd(34)} ${lufs.toFixed(2).padStart(7)} LUFS  peak ${peak.toFixed(2).padStart(6)} dBFS`);
    }
  }
  writeFileSync(join(outDir, 'levels.json'), JSON.stringify({ cruiseOffsetDb: offset, before: before.lufs, after: after.lufs, files: report }, null, 2));
}

const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === 'levels') await levels();
  else if (cmd === 'spectra') {
    for (const name of ['idle', 'cruise', 'mid', 'mil', 'ab-z5']) {
      const c = STEADY[name];
      const r = await renderSteady(name);
      const a = analyse(channelsOf(r.buf, c.pre, c.pre + c.dur), SR);
      const pk = a.peaks.map((p) => `${p.hz}:${p.db}`).join(' ');
      console.log(`${name.padEnd(7)} centroid ${a.centroidHz} Hz | bands <150/500/2k/6k/> ${a.bandsPct.join('/')} % | peaks ${pk}`);
    }
  }
  else if (cmd === 'ab') {
    if (!a1 || !a2 || !existsSync(a2)) {
      console.error('usage: node scripts/tomcat-render.mjs ab <outDir> <baseRoot>');
      process.exit(1);
    }
    await ab(a1, a2, a3 ? a3.split(',') : [], a4 ? a4.split(',') : undefined);
  } else if (cmd === 'preview') {
    const { chans, lufs, peak } = await renderPreview();
    const dest = join(ROOT, 'public', 'snippets', `${ID}.wav`);
    writeFileSync(dest, bufferToWav(chans, SR));
    console.log(`wrote ${dest} (${lufs.toFixed(1)} LUFS, peak ${peak.toFixed(1)} dBFS)`);
  } else {
    console.error('usage: levels | spectra | ab <outDir> <baseRoot> | preview');
    process.exit(1);
  }
  process.exit(0);
}
