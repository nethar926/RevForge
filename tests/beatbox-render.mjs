/**
 * Beat Box offline demo renderer (node-web-audio-api OfflineAudioContext + the real worklet).
 *
 *   node tests/beatbox-render.mjs <engineId|all> [outDir] [--scene drive|crackle-off|crackle-full]
 *
 * Writes float renders as 16-bit WAVs, loudness-matched to −16 LUFS integrated with a −1 dBFS
 * sample-peak ceiling (gentle post limiter only if the gain would push peaks past it).
 * Scenes are scripted pedal inputs fed through createTestDrive at 100 Hz.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OfflineAudioContext, AudioWorkletNode } from 'node-web-audio-api';
import { integratedLufs, samplePeakDb } from '../scripts/loudness.mjs';

globalThis.AudioWorkletNode ??= AudioWorkletNode;
const BB = await import('../src/audio/beatbox/index.ts');
const SR = 44100;

/** Pedal scripts: [tStart, tEnd) windows. */
export const SCENES = {
  drive: {
    dur: 23,
    pops: 0.6,
    gas: [[3, 11.2], [18.2, 18.55], [19.7, 20.25]],
    brake: [[12.8, 23]],
  },
  'crackle-off': { dur: 10, pops: 0, gas: [[1.5, 3.2], [5.6, 6.4]], brake: [[0, 10]] },
  'crackle-full': { dur: 10, pops: 1, gas: [[1.5, 3.2], [5.6, 6.4]], brake: [[0, 10]] },
};
const inWin = (w, t) => w.some(([a, b]) => t >= a && t < b);

export async function renderScene(id, sceneName, opts = {}) {
  const sc = SCENES[sceneName];
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * sc.dur), SR);
  const eng = await BB.createBeatboxEngine(ctx, ctx.destination, id, {
    seed: opts.seed ?? 1234, drive: opts.drive ?? 0.7, tone: opts.tone ?? 0.5, pops: opts.pops ?? sc.pops,
  });
  const td = BB.createTestDrive({ engine: id, drive: opts.drive ?? 0.7 });
  const dt = 0.01;
  const log = [];
  for (let k = 0; k * dt < sc.dur; k++) {
    const t = k * dt;
    td.gas(inWin(sc.gas, t));
    td.brake(inWin(sc.brake, t));
    const s = td.tick(dt);
    eng.update({ rpm: s.rpm, throttle: s.throttle, speed: s.speed }, t);
    log.push({ t, ...s });
  }
  eng.start(0);
  eng.update({ rpm: BB.getBeatboxEngine(id).idleRpm, throttle: 0 }, 0);
  const buf = await ctx.startRendering();
  return { buf, log };
}

function limitTo(chs, ceilDb = -1) {
  const ceil = 10 ** (ceilDb / 20);
  const n = chs[0].length, la = 66;
  let g = 1;
  const rel = 1 - Math.exp(-1 / (0.08 * SR));
  // peak of the look-ahead window
  const pk = new Float32Array(n);
  for (let i = 0; i < n; i++) pk[i] = Math.max(...chs.map((c) => Math.abs(c[i])));
  const win = new Float32Array(n);
  for (let i = n - 1, m = 0, q = []; i >= 0; i--) { win[i] = 0; }
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i; j < Math.min(n, i + la); j++) if (pk[j] > m) m = pk[j]; win[i] = m; }
  const out = chs.map((c) => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const want = win[i] > ceil ? ceil / win[i] : 1;
    g = want < g ? want : g + (want - g) * rel;
    for (let c = 0; c < chs.length; c++) out[c][i] = Math.max(-ceil, Math.min(ceil, chs[c][i] * g));
  }
  return out;
}

export function master(buf, target = -16) {
  const chs = [buf.getChannelData(0), buf.getChannelData(1)].map((c) => Float32Array.from(c));
  const lufs = integratedLufs(chs, SR);
  const gain = 10 ** ((target - lufs) / 20);
  let scaled = chs.map((c) => c.map((x) => x * gain));
  const peak = samplePeakDb(scaled);
  if (peak > -1.2) scaled = limitTo(scaled, -1.2);
  return { chs: scaled, rawLufs: lufs, gainDb: 20 * Math.log10(gain), peakBefore: peak, lufs: integratedLufs(scaled, SR), peak: samplePeakDb(scaled) };
}

export function wav16(chs) {
  const n = chs[0].length, nc = chs.length;
  const b = Buffer.alloc(44 + n * nc * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * nc * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(nc, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * nc * 2, 28); b.writeUInt16LE(nc * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * nc * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, chs[c][i])) * 32767), o); o += 2; }
  return b;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sceneArg = args.includes('--scene') ? args[args.indexOf('--scene') + 1] : null;
  const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--scene');
  const ids = pos[0] === 'all' || !pos[0] ? BB.BEATBOX_ENGINES.map((e) => e.id) : [pos[0]];
  const outDir = pos[1] ?? '/workspace/demos/beatbox/work';
  mkdirSync(outDir, { recursive: true });
  for (const id of ids) {
    for (const scene of sceneArg ? [sceneArg] : Object.keys(SCENES)) {
      const t0 = Date.now();
      const { buf, log } = await renderScene(id, scene);
      const raw = [buf.getChannelData(0), buf.getChannelData(1)];
      let nan = 0, rawPeak = 0, dc = 0;
      for (const c of raw) for (let i = 0; i < c.length; i++) { if (!Number.isFinite(c[i])) nan++; rawPeak = Math.max(rawPeak, Math.abs(c[i])); dc += c[i]; }
      const m = master(buf);
      writeFileSync(join(outDir, `beatbox-${id}-${scene}.wav`), wav16(m.chs));
      writeFileSync(join(outDir, `beatbox-${id}-${scene}.log.json`), JSON.stringify(log.filter((_, i) => i % 5 === 0).map((r) => [r.t.toFixed(2), Math.round(r.rpm), +r.throttle.toFixed(2), r.gear, +r.speed.toFixed(1)])));
      console.log(`${id} ${scene}: raw LUFS ${m.rawLufs.toFixed(1)} rawPeak ${(20 * Math.log10(rawPeak)).toFixed(1)} dBFS, gain ${m.gainDb.toFixed(1)} dB, peak→ ${m.peakBefore.toFixed(1)} → ${m.peak.toFixed(1)}, LUFS ${m.lufs.toFixed(1)}, NaN ${nan}, DC ${(dc / raw[0].length / 2).toExponential(1)}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }
}
