/**
 * Chrono Coupe rear V6 voice: odd-fire crank rhythm, startup / shutdown plans, the shipped
 * engine uses it (pulse family 5 stays the fallback), take-over on throttle, silent until the
 * key, shutdown held through its tail, loudness matched to the previous Chrono Coupe voice,
 * no pops at steady speed / idle. Procedural only; no storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfflineAudioContext, AudioWorkletNode } from 'node-web-audio-api';

globalThis.AudioWorkletNode ??= AudioWorkletNode;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKLET = join(root, 'src/audio/worklets/chrono-v6-processor.js');
const V = await import('../src/audio/chronoV6Voice.js');
const { renderLive, channels } = await import('../scripts/live-render.mjs');
const { integratedLufs } = await import('../scripts/loudness.mjs');
const { countPops } = await import('../scripts/ice-pops.mjs');
const CC = 'chrono' + '-coupe';
const SR = 44100;
const db = (x) => 20 * Math.log10(x + 1e-12);
const rmsDb = (x, a, b) => {
  let s = 0;
  const i0 = Math.round(a * SR), i1 = Math.round(b * SR);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-20);
};
const v6Of = (e) => e.base?.g?.v6 ?? e.g?.v6;

test('worklet: 150° / 90° alternating firing intervals (odd-fire 90° V6)', async () => {
  const ctx = new OfflineAudioContext(1, SR * 2, SR);
  await ctx.audioWorklet.addModule(WORKLET);
  const node = new AudioWorkletNode(ctx, V.CHRONO_V6_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { seed: 3 } });
  node.connect(ctx.destination);
  const P = (n, v) => (node.parameters.get(n).value = v);
  P('rpm', 600); P('fire', 1); P('level', 1); P('lump', 0); P('rasp', 0); P('throttle', 0.3);
  const x = (await ctx.startRendering()).getChannelData(0);
  // Onsets: 1 ms envelope peaks, ≥ 10 ms apart, above half the max
  const w = Math.round(0.001 * SR);
  const env = new Float64Array(x.length);
  for (let i = w; i < x.length; i++) env[i] = Math.max(env[i - 1] * 0.995, Math.abs(x[i]));
  const from = Math.round(0.5 * SR);
  let mx = 0;
  for (let i = from; i < x.length; i++) mx = Math.max(mx, env[i]);
  const on = [];
  for (let i = from + 1; i < x.length; i++) if (env[i] > 0.5 * mx && env[i - 1] <= 0.5 * mx && (!on.length || i - on[on.length - 1] > 0.01 * SR)) on.push(i);
  const iv = on.slice(1).map((v, i) => (v - on[i]) / SR);
  assert.ok(iv.length >= 10, `onsets found (${iv.length})`);
  const long = 150 / (600 * 6), short = 90 / (600 * 6);
  let ok = 0;
  for (const d of iv) if (Math.abs(d - long) < 0.15 * long || Math.abs(d - short) < 0.15 * short) ok++;
  assert.ok(ok / iv.length > 0.85, `intervals are 150°/90° (${ok}/${iv.length})`);
  for (let i = 1; i < iv.length; i++) assert.notEqual(Math.abs(iv[i] - long) < Math.abs(iv[i] - short), Math.abs(iv[i - 1] - long) < Math.abs(iv[i - 1] - short), 'alternating');
});

test('startup plan: crank (no fire) → catch → flare → settle at idle; shutdown plan: fuel cut → run-down → rest', () => {
  const I = 860;
  const at = (t) => V.v6StartupAt(t, I);
  assert.equal(at(0.5).starter, 1);
  assert.equal(at(0.5).fire, 0, 'cranking only');
  assert.ok(at(0.5).rpm > 180 && at(0.5).rpm < 300, 'cranking speed');
  assert.equal(at(1.2).starter, 0, 'starter released after the catch');
  let peak = 0;
  for (let t = 0.8; t < 1.6; t += 0.01) peak = Math.max(peak, at(t).rpm);
  assert.ok(peak > 1.8 * I && peak < 2400, `flare (${peak.toFixed(0)} rpm)`);
  const end = at(V.V6_STARTUP_SECONDS);
  assert.ok(Math.abs(end.rpm - I) < 0.04 * I, 'settles at idle');
  assert.equal(end.fire, 1);
  assert.ok(Math.abs(end.comp - 0.1) < 1e-6, 'hands over at the live compression value');
  const T = V.v6RundownSeconds(I, I);
  assert.ok(T > 1.2 && T < 1.8);
  assert.equal(V.v6ShutdownAt(0.2, I, I).fire, 0, 'fuel cut');
  let prev = Infinity;
  for (let t = 0; t <= T; t += 0.02) {
    const r = V.v6ShutdownAt(t, I, I).rpm;
    assert.ok(r <= prev + 1e-9, 'run-down never speeds up');
    prev = r;
  }
  assert.equal(V.v6ShutdownAt(T, I, I).rpm, 0);
  const sd = V.v6ShutdownSeconds(I, I);
  assert.ok(sd >= 2 && sd <= 3, `shutdown ${sd.toFixed(2)} s`);
});

test('shipped engine: the V6 worklet drives Chrono Coupe, silent until the key, runs on its own without one', async () => {
  let eng;
  const buf = await renderLive(CC, () => ({ speed: 0, throttle: 0, load: 0 }), 1.6, { onEngine: (e) => (eng = e), seed: 11 });
  assert.ok(v6Of(eng), 'V6 voice present');
  assert.equal(eng.getDiag().iceMode, 'worklet');
  const x = buf.getChannelData(0);
  assert.ok(rmsDb(x, 0.02, 0.3) < -70, 'silent while waiting for the key');
  assert.ok(rmsDb(x, 1.0, 1.6) > -45, 'no key → runs (resume / layer engines)');
});

test('startup: a throttle press mid-cue glides into the live engine in ~300 ms', async () => {
  const seen = {};
  const cues = [
    { t: 0.1, run: (e) => e.playStarter() },
    { t: 0.55, run: (e) => (seen.cueBefore = v6Of(e).cueType) },
    { t: 0.95, run: (e) => { const v = v6Of(e); seen.cue = v.cueType; seen.rpm = v.param('rpm').value; seen.starter = v.param('starter').value; seen.fire = v.param('fire').value; seen.live = v.live.rpm; } },
  ];
  const profile = (t) => (t < 0.6 ? { speed: 0, throttle: 0, load: 0 } : { speed: 0, throttle: 0.7, load: 0.3, rpm: 2500 });
  await renderLive(CC, profile, 1.1, { cues, seed: 12 });
  assert.equal(seen.cueBefore, 'startup');
  assert.equal(seen.cue, null, 'cue handed over');
  assert.ok(Math.abs(seen.rpm - seen.live) < 0.1 * seen.live, `rpm at live target 350 ms after the press (${seen.rpm?.toFixed(0)} vs ${seen.live?.toFixed(0)})`);
  assert.ok(seen.starter < 0.1, 'starter released');
  assert.ok(seen.fire > 0.9, 'combustion on');
});

test('shutdown: output held through the run-down, silent after, never above idle + 6 dB', async () => {
  const cues = [{ t: 1.5, run: (e) => { e.playShutoff(); e.stop(); } }];
  const buf = await renderLive(CC, () => ({ speed: 0, throttle: 0, load: 0 }), 4.8, { cues, seed: 13, params: { v6KeyWait: 0 } });
  const x = buf.getChannelData(0);
  const idle = rmsDb(x, 0.9, 1.5);
  let worst = -200;
  for (let t = 1.5; t < 4.4; t += 0.1) worst = Math.max(worst, rmsDb(x, t, t + 0.1));
  assert.ok(worst <= idle + 6, `max 100 ms level ${worst.toFixed(1)} dB vs idle ${idle.toFixed(1)} dB`);
  assert.ok(rmsDb(x, 1.9, 2.4) > idle - 25, 'run-down audible (not cut by stop())');
  assert.ok(rmsDb(x, 4.45, 4.8) < -80, 'silent once the cue has finished');
});

test('loudness within ±1 dB of the previous Chrono Coupe voice at idle / cruise / full; no pops at steady speed or idle', async () => {
  // Previous voice (pulse family 5 + chain), same live-render measurement (settled 2–6 s)
  const REF = { idle: -30.51, cruise: -19.85, wot: -11.19 };
  const P = {
    idle: () => ({ speed: 0, throttle: 0, load: 0 }),
    cruise: () => ({ speed: 0.5, throttle: 0.35, load: 0.3 }),
    wot: () => ({ speed: 0.9, throttle: 1, load: 1 }),
  };
  for (const [k, prof] of Object.entries(P)) {
    const b = await renderLive(CC, prof, 6);
    const l = integratedLufs(channels(b, 2 * SR), SR);
    assert.ok(Math.abs(l - REF[k]) <= 1, `${k}: ${l.toFixed(2)} LUFS vs ${REF[k]}`);
  }
  const steady = await renderLive(CC, (t) => ({ speed: 0.43, throttle: 0.12 + 0.05 * Math.sin(2.3 * t), load: 0.12, rpm: 3000 + 8 * Math.sin(2.3 * t) }), 5, { seed: 14, params: { v6KeyWait: 0 } });
  assert.equal(countPops(steady, 0.8).count, 0, 'steady 3k');
  const idle = await renderLive(CC, () => ({ speed: 0, throttle: 0, load: 0, rpm: 860 }), 5, { seed: 15, params: { v6KeyWait: 0 } });
  assert.equal(countPops(idle, 0.8).count, 0, 'idle');
});

test('V6 sources stay procedural and storage-free', () => {
  const w = readFileSync(WORKLET, 'utf8');
  const v = readFileSync(join(root, 'src/audio/chronoV6Voice.js'), 'utf8');
  for (const src of [w, v]) {
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
    assert.doesNotMatch(src, /decodeAudioData|fetch\(|createConvolver|\.wav\b/);
  }
  assert.doesNotMatch(w, /^\s*import\s/m, 'standalone worklet module');
  assert.match(readFileSync(join(root, 'src/audio/EngineSynthImpl.ts'), 'utf8'), /new URL\('\.\/worklets\/chrono-v6-processor\.js', import\.meta\.url\)/);
});
