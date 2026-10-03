/**
 * Pack previews through the HIG master chain — src/audio/previewPlayer.ts + previewTrims.ts.
 * Trim table coverage, gesture-safe resume, decode (no <audio>), trim gain, duck / un-duck,
 * one-at-a-time, aux path bypasses the engine fade + duck (real renderer), no storage access.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { OfflineAudioContext } from 'node-web-audio-api';
import { readWav16, samplePeakDb } from '../scripts/loudness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'), {
  alias: { './worklets/pulse-engine-processor.js?url': join(root, 'tests/fixtures/worklet-url-stub.mjs') },
});
const PP = await jiti.import(join(root, 'src/audio/previewPlayer.ts'));
const PT = await jiti.import(join(root, 'src/audio/previewTrims.ts'));
const PS = await jiti.import(join(root, 'src/audio/playbackSession.ts'));
const audio = await jiti.import(join(root, 'src/audio/index.ts'));

test('trim table covers every builtin preview WAV, no extras, peak-safe', () => {
  const dir = join(root, 'public/snippets');
  const ids = readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4)).filter((id) => audio.getBuiltin(id)).sort();
  assert.deepEqual(Object.keys(PT.PREVIEW_TRIMS_DB).sort(), ids);
  for (const id of ids) {
    const r = PT.PREVIEW_TRIM_INFO[id];
    assert.ok(r.trimDb <= r.exactDb + 1e-9, `${id}: preview never louder than live cruise`);
    const { channels } = readWav16(readFileSync(join(dir, `${id}.wav`)));
    assert.ok(Math.abs(samplePeakDb(channels) - r.previewPeakDb) < 0.02, `${id}: table matches the WAV on disk (re-run gen-preview-trims)`);
    assert.ok(r.previewPeakDb + r.trimDb <= PT.PREVIEW_PEAK_CEILING_DB + 0.01, `${id}: trimmed peak ≤ limiter knee`);
  }
});

test('resolvePreview: pack id, legacy id, SNIPPETS path, absolute URL', () => {
  assert.deepEqual(PP.resolvePreview('v8-rumble', '/app/'), { id: 'v8-rumble', url: '/app/snippets/v8-rumble.wav', trimDb: PT.PREVIEW_TRIMS_DB['v8-rumble'] });
  assert.equal(PP.resolvePreview('tie-fighter', '/').id, 'ion-twin');
  assert.equal(PP.resolvePreview('tie-fighter', '/').url, '/snippets/ion-twin.wav');
  const s = PP.resolvePreview('snippets/ev-whine.wav', '/base/');
  assert.equal(s.url, '/base/snippets/ev-whine.wav');
  assert.equal(s.trimDb, PT.PREVIEW_TRIMS_DB['ev-whine']);
  const abs = PP.resolvePreview('https://x.test/r/snippets/i4-zip.wav?v=2', '/');
  assert.equal(abs.url, 'https://x.test/r/snippets/i4-zip.wav?v=2');
  assert.equal(abs.id, 'i4-zip');
  assert.deepEqual(PP.resolvePreview('https://x.test/other.wav', '/'), { id: null, url: 'https://x.test/other.wav', trimDb: 0 });
});

/* ---------------- fakes ---------------- */
function param(v = 1) {
  const p = { value: v, events: [] };
  for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'cancelScheduledValues']) p[k] = (...a) => { p.events.push([k, ...a]); if (k !== 'cancelScheduledValues') p.value = a[0]; return p; };
  return p;
}
function fakeCtx() {
  const ctx = {
    state: 'suspended', currentTime: 0, resumes: 0, decodes: 0, sources: [],
    resume() { ctx.resumes++; ctx.state = 'running'; return Promise.resolve(); },
    createGain() { return { gain: param(1), connected: [], connect(n) { this.connected.push(n); return n; }, disconnect() {} }; },
    createBufferSource() {
      const s = { buffer: null, started: false, stopped: false, onended: null, connect(n) { this.to = n; return n; }, disconnect() {}, start() { s.started = true; }, stop() { s.stopped = true; } };
      ctx.sources.push(s);
      return s;
    },
    decodeAudioData(data) { ctx.decodes++; return Promise.resolve({ duration: 1, bytes: data.byteLength }); },
  };
  return ctx;
}
function fakeMaster() {
  const calls = [];
  return { calls, auxInput: { name: 'aux' }, input: {}, fade: {}, duck: (s) => calls.push(['duck', s]), unduck: (s) => calls.push(['unduck', s]) };
}
const okFetch = (log) => (url) => { log.push(url); return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }); };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('play(): resume inside the tap, decode (no <audio>), trim gain into auxInput, duck → un-duck on end', async () => {
  const ctx = fakeCtx(), master = fakeMaster(), urls = [], states = [];
  const p = new PP.PreviewPlayer({ ctx, master, engineAudible: () => true, fetch: okFetch(urls), onState: (s, id) => states.push([s, id]) });
  const done = p.play('snippets/v8-rumble.wav');
  assert.equal(ctx.resumes, 1, 'ctx.resume() called synchronously in the tap');
  assert.equal(p.state, 'loading');
  await tick(); await tick();
  assert.equal(p.state, 'playing');
  assert.equal(p.previewingId, 'v8-rumble');
  assert.equal(ctx.decodes, 1);
  assert.ok(urls[0].endsWith('snippets/v8-rumble.wav'));
  const src = ctx.sources[0];
  assert.ok(src.started);
  const g = src.to;
  assert.equal(g.connected[0], master.auxInput, 'preview joins the master chain at auxInput');
  const target = 10 ** (PT.PREVIEW_TRIMS_DB['v8-rumble'] / 20);
  const ramp = g.gain.events.find((e) => e[0] === 'linearRampToValueAtTime');
  assert.ok(Math.abs(ramp[1] - target) < 1e-9 && Math.abs(ramp[2] - PP.PREVIEW_RAMP_IN_S) < 1e-9, 'trim gain with ramp-in');
  assert.deepEqual(master.calls, [['duck', PP.PREVIEW_DUCK_S]]);
  src.onended();
  await done;
  assert.deepEqual(master.calls.at(-1), ['unduck', PP.PREVIEW_UNDUCK_S]);
  assert.equal(p.state, 'idle');
  assert.deepEqual(states.map((s) => s[0]), ['loading', 'playing', 'idle']);
  // second play of the same pack reuses the decoded buffer
  void p.play('v8-rumble');
  await tick(); await tick();
  assert.equal(ctx.decodes, 1);
  p.dispose();
});

test('one at a time: a new preview stops the previous (fade) and resolves it; stop() un-ducks', async () => {
  const ctx = fakeCtx(), master = fakeMaster();
  const p = new PP.PreviewPlayer({ ctx, master, engineAudible: () => false, fetch: okFetch([]) });
  const first = p.play('ev-whine');
  await tick(); await tick();
  const second = p.play('i4-zip');
  await first; // resolved by replacement
  assert.ok(ctx.sources[0].stopped, 'previous source stopped');
  await tick(); await tick();
  assert.equal(p.previewingId, 'i4-zip');
  assert.deepEqual(master.calls, [], 'engine not running → no duck');
  p.stop();
  await second;
  assert.equal(p.state, 'idle');
  const ducked = new PP.PreviewPlayer({ ctx, master, engineAudible: () => true, fetch: okFetch([]) });
  const d = ducked.play('ion-twin');
  await tick(); await tick();
  ducked.stop();
  await d;
  assert.deepEqual(master.calls, [['duck', PP.PREVIEW_DUCK_S], ['unduck', PP.PREVIEW_UNDUCK_S]]);
});

test('load failure rejects and returns to idle (no duck)', async () => {
  const ctx = fakeCtx(), master = fakeMaster();
  const p = new PP.PreviewPlayer({ ctx, master, engineAudible: () => true, fetch: () => Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }) });
  await assert.rejects(p.play('v8-rumble'), /404/);
  assert.equal(p.state, 'idle');
  assert.deepEqual(master.calls, []);
});

test('aux path bypasses the engine fade and duck, shares the limiter (real renderer)', async () => {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr / 2, sr);
  const bus = PS.createMasterBus(ctx);
  // engine side: fade stays 0 (idle) → must be silent; preview side: unity
  const eng = ctx.createOscillator(); eng.frequency.value = 330; eng.connect(bus.input); eng.start();
  const prev = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.25; prev.frequency.value = 220; prev.connect(g).connect(bus.auxInput); prev.start();
  const y = (await ctx.startRendering()).getChannelData(0);
  let pk = 0; for (let i = sr / 4; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
  assert.ok(Math.abs(20 * Math.log10(pk) - 20 * Math.log10(0.25)) < 0.1, `preview at unity through the bus (${pk})`);
  // hot preview is still held by the ceiling
  const ctx2 = new OfflineAudioContext(1, sr / 2, sr);
  const bus2 = PS.createMasterBus(ctx2);
  const o = ctx2.createOscillator(); const g2 = ctx2.createGain(); g2.gain.value = 3; o.connect(g2).connect(bus2.auxInput); o.start();
  const y2 = (await ctx2.startRendering()).getChannelData(0);
  let pk2 = 0; for (const v of y2) pk2 = Math.max(pk2, Math.abs(v));
  assert.ok(pk2 <= 10 ** (PS.LIMITER_CEILING_DB / 20) + 1e-6, 'aux shares the −1 dBFS ceiling');
  // duck affects engine input only
  const ctx3 = new OfflineAudioContext(1, sr / 2, sr);
  const bus3 = PS.createMasterBus(ctx3);
  bus3.fade.gain.value = 1;
  const e3 = ctx3.createOscillator(); const ge = ctx3.createGain(); ge.gain.value = 0.25; e3.connect(ge).connect(bus3.input); e3.start();
  bus3.duck(0.05);
  const y3 = (await ctx3.startRendering()).getChannelData(0);
  let pk3 = 0; for (let i = Math.round(sr / 8); i < y3.length; i++) pk3 = Math.max(pk3, Math.abs(y3[i]));
  assert.ok(pk3 < 1e-4, 'ducked engine is silent');
});

test('preview API: no <audio>, no storage; hook + session wiring', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const src = strip(readFileSync(join(root, 'src/audio/previewPlayer.ts'), 'utf8'));
  assert.doesNotMatch(src, /new Audio\(|HTMLAudioElement|createElement\(['"]audio/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
  assert.match(src, /decodeAudioData/);
  const hook = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  for (const k of ['playPreview,', 'stopPreview,', 'previewState,', 'previewingId,']) assert.ok(hook.split(k).length >= 3, `${k} returned + in deps`);
  assert.match(hook, /stopPreview: \(\) => previewRef\.current\?\.stop\(\)/);
});

test('session: preview shows in Media Session while idle; hardware pause / hidden stop it', () => {
  class T { constructor() { this.l = new Map(); } addEventListener(t, f) { (this.l.get(t) ?? this.l.set(t, new Set()).get(t)).add(f); } removeEventListener(t, f) { this.l.get(t)?.delete(f); } emit(t) { for (const f of [...(this.l.get(t) ?? [])]) f(); } }
  const page = new T(); page.visibilityState = 'visible';
  const handlers = {};
  const ms = { metadata: null, playbackState: 'none', setActionHandler: (a, f) => { handlers[a] = f; } };
  let now = 0;
  const s = new PS.PlaybackSession({ env: { document: page, window: new T(), navigator: { mediaSession: ms }, storage: null, MediaMetadata: class { constructor(i) { Object.assign(this, i); } }, createAudioElement: null, setTimeout: () => 0, clearTimeout: () => {}, now: () => (now += 1000) } });
  const ctx = Object.assign(new T(), { state: 'running', currentTime: 0, resume: async () => {} });
  let stops = 0;
  s.attach(ctx, null, { host: { stopPreview: () => { stops++; s.setPreview(null); } } });
  s.setPreview({ title: 'V8 Rumble — preview' });
  assert.equal(ms.playbackState, 'playing');
  assert.equal(ms.metadata.title, 'V8 Rumble — preview');
  assert.equal(ms.metadata.album, 'Preview');
  handlers.pause();
  assert.equal(stops, 1);
  assert.equal(ms.playbackState, 'none');
  s.setPreview({ title: 'x' });
  page.visibilityState = 'hidden'; page.emit('visibilitychange');
  assert.equal(stops, 2);
  s.dispose();
});
