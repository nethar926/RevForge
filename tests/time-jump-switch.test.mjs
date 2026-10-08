/**
 * Chrono time-jump switch → time-jump sound, end to end on the real modules:
 *   ThemeStage's crossing detector (src/forge/timeJump.ts createTimeJumpEdge)
 *   → Frontend's useTimeJump (src/forge/timeJumpCue.tsx, loaded through Vite so its
 *     import.meta.glob feature detection resolves against the real src/audio files)
 *   → useAudioEngine-shaped view (timeJumpCue / setTimeJumpCueEnabled / triggerUiCue)
 *   → the real engine (createEngineSynth → CharacterEngine → ProceduralCharacter), rendered offline.
 * Switch on: exactly one cue per threshold crossing (re-crossings while the 2 s cue is lit are
 * absorbed). Switch off: no cue at all, not even from a stale "on" callback (audio-side gate).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { OfflineAudioContext } from 'node-web-audio-api';
import { allowShaperReassign } from './fixtures/reassignable-shaper.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SR = 22050;
const STEP_S = 0.1; // 10 Hz speed samples (ThemeStage gets HUD frames; GPS is ~1 Hz, so this is denser)

/** Speed trace (mph): three clean threshold crossings plus GPS jitter around 88 while the 2nd cue is lit. */
function speedTrace() {
  const pts = [];
  const seg = (from, to, secs) => { const n = Math.round(secs / STEP_S); for (let i = 0; i < n; i++) pts.push(from + ((to - from) * i) / n); };
  seg(70, 95, 2); //  0-2 s   crossing A (1.6 s render time)
  seg(95, 95, 3); //  2-5 s   hold above: no re-fire
  seg(95, 70, 2); //  5-7 s   below 88: re-arms
  seg(70, 100, 2); // 7-9 s   crossing B (8.3 s)
  for (let i = 0; i < 6; i++) pts.push(i % 2 ? 88.6 : 87.4); // 9-9.6 s jitter (rising edges 9.2/9.4/9.6 s, B lit to 10.3 s)
  seg(87.4, 60, 1.4); // 9.6-11 s re-arm
  seg(60, 92, 2); // 11-13 s crossing C (12.9 s)
  seg(92, 92, 1); // 13-14 s
  return pts;
}

async function boot() {
  // Frontend reads/writes its saved choice through storageKey(); in-memory stand-in.
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  // Virtual clock for the light timer (useTimeJumpLight calls window.setTimeout).
  const clock = { now: 0, timers: [] };
  // Own object (inherits globals) so the real setTimeout that Vite and Node use stays untouched.
  globalThis.window = Object.assign(Object.create(globalThis), {
    setTimeout: (fn, ms) => { const t = { fn, at: clock.now + ms }; clock.timers.push(t); return t; },
    clearTimeout: (t) => { const i = clock.timers.indexOf(t); if (i >= 0) clock.timers.splice(i, 1); },
  });
  const server = await createServer({
    root, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    oxc: { jsx: { runtime: 'automatic' } },
  });
  const load = (p) => server.ssrLoadModule(p);
  const tj = await load('/src/forge/timeJump.ts');
  const cue = await load('/src/forge/timeJumpCue.tsx');
  const prefs = await load('/src/audio/cuePrefs.ts');
  const audio = await load('/src/audio/index.ts');
  const { CHRONO_COUPE } = await load('/src/audio/chronoCoupePack.ts');
  const advance = (ms) => {
    clock.now += ms;
    for (const t of [...clock.timers].sort((a, b) => a.at - b.at)) if (t.at <= clock.now) { clock.timers.splice(clock.timers.indexOf(t), 1); t.fn(); }
  };
  return { server, tj, cue, prefs, audio, store, advance, packId: CHRONO_COUPE.id };
}

/** Render `useTimeJump(audioView, <Chrono Coupe id>)` once and hand back its result (as ForgePage gets it). */
function mountUseTimeJump(cue, audioView, packId) {
  let out;
  renderToString(createElement(function Probe() { out = cue.useTimeJump(audioView, packId); return null; }));
  return out;
}

/** Drive the trace through the offline render; returns cue fire times and the rendered audio. */
async function driveOnce(env, { switchOn, staleOnCallback = false }) {
  const { tj, cue, prefs, audio, advance, packId } = env;
  const pts = speedTrace();
  const ctx = allowShaperReassign(new OfflineAudioContext(1, Math.ceil(SR * ((pts.length + 1) * STEP_S + 2.5)), SR));
  const eng = audio.createEngineSynth(ctx, audio.getBuiltin(packId));
  assert.equal(eng.id, packId);
  eng.output.connect(ctx.destination);
  const fired = [];
  const realCue = eng.fx.cue.bind(eng.fx);
  eng.fx.cue = (t) => { if (t === 'time-jump') fired.push(+ctx.currentTime.toFixed(2)); realCue(t); };
  // useAudioEngine's view: timeJumpCue state, setTimeJumpCueEnabled, triggerUiCue → engine.
  const view = () => ({
    timeJumpCue: prefs.getTimeJumpCueEnabled(),
    setTimeJumpCueEnabled: (on) => prefs.setTimeJumpCueEnabled(on),
    triggerUiCue: (c) => eng.triggerUiCue(c),
  });
  prefs.setTimeJumpCueEnabled(true);
  let hook = mountUseTimeJump(cue, view(), packId);
  const stale = hook.onTimeJump; // captured while on
  if (!switchOn) {
    hook.setCueOn(false); // the Options switch
    hook = mountUseTimeJump(cue, view(), packId); // React re-renders with audio.timeJumpCue === false
  }
  assert.equal(hook.cueOn, switchOn);
  const onTimeJump = staleOnCallback ? stale : hook.onTimeJump;
  const edge = tj.createTimeJumpEdge(); // ThemeStage
  const rises = [];
  // A suspend at every 100 ms speed sample (all scheduled before rendering; node-web-audio-api
  // rejects suspend(0) and suspends added while suspended): the render stops, ThemeStage's
  // detector and the hook run on that sample, then rendering resumes.
  let lastMs = 0, missed = 0;
  pts.forEach((mph, i) => {
    const t = +((i + 1) * STEP_S).toFixed(3);
    ctx.suspend(t).then(() => {
      advance(t * 1000 - lastMs);
      lastMs = t * 1000;
      if (edge.step(mph)) { rises.push(t); onTimeJump(); }
      return ctx.resume();
    }, () => { missed++; });
  });
  // node-web-audio-api registers suspends asynchronously: let them land before rendering starts
  // (otherwise a late one can find the render already past its time and reject).
  await new Promise((r) => setTimeout(r, 150));
  const buf = await ctx.startRendering();
  eng.dispose();
  advance(10_000);
  return { fired, rises, missed, data: buf.getChannelData(0) };
}

/** driveOnce, re-run if the offline renderer dropped any speed sample (suspend registered late). */
async function drive(env, opts) {
  for (let attempt = 1; ; attempt++) {
    const r = await driveOnce(env, opts);
    if (!r.missed) return r;
    if (attempt === 3) assert.fail(`offline renderer dropped ${r.missed} speed samples three times`);
  }
}

/** Onsets in the render: 10 ms RMS above -60 dBFS after ≥ 300 ms of silence. */
function onsets(data) {
  const win = Math.round(SR * 0.01), out = [];
  let quiet = Infinity;
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += data[j] * data[j];
    const loud = Math.sqrt(s / win) > 1e-3;
    if (loud && quiet >= 0.3) out.push(+(i / SR).toFixed(2));
    quiet = loud ? 0 : quiet + 0.01;
  }
  return out;
}
const peakDb = (d) => { let p = 0; for (const v of d) p = Math.max(p, Math.abs(v)); return p ? 20 * Math.log10(p) : -Infinity; };

test('Frontend detects the audio cue API on this build (sound path enabled, 2.0 s cue)', async () => {
  const env = await boot();
  try {
    assert.equal(env.cue.HAS_TIME_JUMP_CUE_API, true, 'cuePrefs.setTimeJumpCueEnabled found by import.meta.glob');
    assert.equal(env.cue.TIME_JUMP_CUE_MS, 2000, 'ProceduralCharacter TIME_JUMP_CUE_SECONDS found');
    for (const k of ['setTimeJumpCueEnabled', 'getTimeJumpCueEnabled', 'onTimeJumpCueChange']) assert.equal(typeof env.prefs[k], 'function', k);
    // Frontend persists through onTimeJumpCueChange: a change from the audio side is saved.
    env.prefs.setTimeJumpCueEnabled(false);
    assert.equal(env.store.get(env.cue.TIME_JUMP_CUE_KEY), '0');
    env.prefs.setTimeJumpCueEnabled(true);
    assert.equal(env.store.get(env.cue.TIME_JUMP_CUE_KEY), '1');
  } finally {
    await env.server.close();
  }
});

test('switch on: one time-jump cue per threshold crossing (offline render)', async () => {
  const env = await boot();
  try {
    const r = await drive(env, { switchOn: true });
    console.log(`# switch ON  rising edges at ${r.rises.join(', ')} s; cues fired at ${r.fired.join(', ')} s; render onsets ${onsets(r.data).join(', ')} s; peak ${peakDb(r.data).toFixed(1)} dBFS`);
    assert.equal(r.rises.length, 6, '3 crossings + 3 jitter edges while lit');
    assert.equal(r.fired.length, 3, 'exactly one cue per crossing');
    assert.deepEqual(r.fired, [r.rises[0], r.rises[1], r.rises[5]]);
    const on = onsets(r.data);
    assert.equal(on.length, 3, `three audible cues in the render (${on})`);
    on.forEach((t, i) => assert.ok(Math.abs(t - r.fired[i]) < 0.05, `cue ${i} audible at its crossing`));
  } finally {
    await env.server.close();
  }
});

test('switch off: the cue never fires (Frontend gate and audio-side gate)', async () => {
  const env = await boot();
  try {
    const r = await drive(env, { switchOn: false });
    console.log(`# switch OFF rising edges at ${r.rises.join(', ') || '-'} s; cues fired ${r.fired.length}; render peak ${peakDb(r.data)} dBFS`);
    assert.equal(r.rises.length, 6);
    assert.equal(r.fired.length, 0);
    assert.equal(peakDb(r.data), -Infinity, 'render is digital silence');
    // Even a stale callback captured while on (switch flipped between renders) stays silent:
    // CharacterEngine checks cuePrefs before playing the cue.
    const s = await drive(env, { switchOn: false, staleOnCallback: true });
    console.log(`# switch OFF (stale on-callback) cues fired ${s.fired.length}; render peak ${peakDb(s.data)} dBFS`);
    assert.equal(s.fired.length, 0);
    assert.equal(peakDb(s.data), -Infinity);
  } finally {
    env.prefs.setTimeJumpCueEnabled(true);
    await env.server.close();
  }
});
