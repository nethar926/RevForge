/**
 * HIG "Playing audio" — src/audio/playbackSession.ts + useAudioEngine wiring.
 * State machine (running → interrupted → paused, no auto-resume, resume ramps in), master-bus
 * limiter ceiling / unity at normal levels (real Web Audio renderer), gesture gating.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import { OfflineAudioContext } from 'node-web-audio-api';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(join(root, 'package.json'));
const PS = await jiti.import(join(root, 'src/audio/playbackSession.ts'));

const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const peak = (x, from = 0, to = x.length) => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};
const rms = (x, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
};

/* ---------------- fakes ---------------- */

class Target {
  constructor() { this.l = new Map(); }
  addEventListener(t, f) { (this.l.get(t) ?? this.l.set(t, new Set()).get(t)).add(f); }
  removeEventListener(t, f) { this.l.get(t)?.delete(f); }
  emit(t) { for (const f of [...(this.l.get(t) ?? [])]) f({ type: t }); }
  count(t) { return this.l.get(t)?.size ?? 0; }
}
class FakeCtx extends Target {
  constructor() { super(); this.state = 'running'; this.currentTime = 0; this.resumes = 0; this.suspends = 0; this.grant = true; }
  async resume() { this.resumes++; if (this.grant) { this.state = 'running'; this.emit('statechange'); } else return new Promise(() => {}); }
  async suspend() { this.suspends++; this.state = 'suspended'; this.emit('statechange'); }
  setState(s) { this.state = s; this.emit('statechange'); }
}
function fakeMaster() {
  const m = { level: 1, calls: [] };
  return Object.assign(m, {
    input: {}, output: {}, limiter: null, ceiling: null,
    silence() { m.calls.push('silence'); m.level = 0; },
    rampIn(s = PS.RAMP_IN_S) { m.calls.push(['rampIn', s]); m.level = 1; },
    fadeOut(s = PS.FADE_OUT_S) { m.calls.push(['fadeOut', s]); m.level = 0; return s; },
    switchRamp() { m.calls.push('switchRamp'); m.level = 1; },
    level() { return m.level; },
    dispose() {},
  });
}
function env(over = {}) {
  const dom = new Target();
  dom.visibilityState = 'visible';
  const win = new Target();
  const ms = { metadata: null, playbackState: 'none', handlers: {}, setActionHandler(a, h) { this.handlers[a] = h; } };
  const timers = [];
  let t = 0;
  const e = {
    document: dom, window: win, navigator: { mediaSession: ms }, legacyMediaFlag: () => false,
    MediaMetadata: class { constructor(i) { Object.assign(this, i); } },
    createAudioElement: () => ({ paused: true, plays: 0, async play() { this.plays++; this.paused = false; }, pause() { this.paused = true; }, setAttribute() {} }),
    setTimeout: (fn, ms) => { const id = { fn, at: t + ms }; timers.push(id); return id; },
    clearTimeout: (id) => { const i = timers.indexOf(id); if (i >= 0) timers.splice(i, 1); },
    now: () => t,
    ...over,
  };
  const advance = (ms) => { t += ms; for (const id of [...timers]) if (id.at <= t) { timers.splice(timers.indexOf(id), 1); id.fn(); } };
  return { e, dom, win, ms, advance };
}
function session(over) {
  const h = env(over);
  const s = new PS.PlaybackSession({ env: h.e });
  const ctx = new FakeCtx();
  const master = fakeMaster();
  return { ...h, s, ctx, master };
}

/* ---------------- state machine ---------------- */

test('running → interrupted → paused: 150 ms fade, Media Session paused, no auto-resume', async () => {
  const { s, ctx, master, ms, advance, dom } = session();
  s.attach(ctx, master);
  s.setMediaInfo({ title: 'Twin Ion', album: 'Automatic gearbox' });
  s.markRunning();
  assert.equal(s.getSnapshot().state, 'running');
  assert.equal(ms.playbackState, 'playing');
  assert.equal(ms.metadata.title, 'Twin Ion');
  assert.equal(ms.metadata.artist, 'RevForge');
  assert.equal(ms.metadata.album, 'Automatic gearbox');
  assert.ok(ms.metadata.artwork.length >= 1);
  const seen = [];
  s.subscribe((x) => seen.push(x.state));

  ctx.setState('interrupted');
  assert.deepEqual(master.calls.at(-1), ['fadeOut', 0.15]);
  assert.equal(s.getSnapshot().state, 'paused');
  assert.equal(s.getSnapshot().reason, 'interrupted');
  assert.equal(s.getSnapshot().canResume, true);
  assert.equal(ms.playbackState, 'paused');
  advance(500);

  // The OS hands the context back, the page becomes visible: still paused, still silent.
  ctx.setState('running');
  dom.visibilityState = 'visible';
  dom.emit('visibilitychange');
  advance(5000);
  assert.equal(s.getSnapshot().state, 'paused');
  assert.equal(master.level, 0);
  assert.equal(ctx.resumes, 0, 'never resumes on its own');
  assert.ok(!master.calls.some((c) => Array.isArray(c) && c[0] === 'rampIn'));
  assert.deepEqual(seen, ['paused']);
});

test('resume() (user tap) resumes the context and ramps in from silence', async () => {
  const { s, ctx, master, ms, advance } = session();
  s.attach(ctx, master);
  s.markRunning();
  ctx.setState('suspended'); // unexpected suspend (not ours)
  assert.equal(s.getSnapshot().reason, 'suspended');
  advance(200);
  assert.equal(await s.resume(), true);
  assert.equal(ctx.resumes, 1);
  assert.equal(s.getSnapshot().state, 'running');
  assert.equal(ms.playbackState, 'playing');
  const iRamp = master.calls.findIndex((c) => Array.isArray(c) && c[0] === 'rampIn');
  assert.ok(iRamp > master.calls.indexOf('silence'), 'silence → ramp');
  assert.ok(master.calls[iRamp][1] >= 0.15 && master.calls[iRamp][1] <= 0.3, 'ramp 150–300 ms');
});

test('resume() the browser does not grant stays paused (times out, no audio)', async () => {
  const h = session();
  h.s.attach(h.ctx, h.master);
  h.s.markRunning();
  h.ctx.setState('interrupted');
  h.ctx.grant = false;
  const p = h.s.resume();
  h.advance(PS.RESUME_TIMEOUT_MS + 10);
  assert.equal(await p, false);
  assert.equal(h.s.getSnapshot().state, 'paused');
  assert.equal(h.master.level, 0);
});

test('hidden → fade, pause, then context suspended; our own suspend is not a new interruption', () => {
  const { s, ctx, master, dom, advance } = session();
  s.attach(ctx, master);
  s.markRunning();
  dom.visibilityState = 'hidden';
  dom.emit('visibilitychange');
  assert.equal(s.getSnapshot().state, 'paused');
  assert.equal(s.getSnapshot().reason, 'hidden');
  assert.equal(s.getSnapshot().pageVisible, false);
  assert.equal(ctx.suspends, 0, 'suspend waits for the fade');
  advance(PS.FADE_OUT_S * 1000 + 25);
  assert.equal(ctx.suspends, 1);
  assert.equal(s.getSnapshot().reason, 'hidden');
  assert.equal(master.calls.filter((c) => Array.isArray(c) && c[0] === 'fadeOut').length, 1);
});

test('pagehide pauses immediately; user stop returns to idle; Media Session none', () => {
  const { s, ctx, master, win, ms } = session();
  s.attach(ctx, master);
  s.markRunning();
  win.emit('pagehide');
  assert.equal(s.getSnapshot().state, 'paused');
  assert.equal(s.getSnapshot().reason, 'pagehide');
  s.markStopped();
  assert.equal(s.getSnapshot().state, 'idle');
  assert.equal(ms.playbackState, 'none');
});

test('pauseWhenHidden:false keeps playing when hidden (opt-out)', () => {
  const h = env();
  const s = new PS.PlaybackSession({ env: h.e, pauseWhenHidden: false });
  const ctx = new FakeCtx();
  s.attach(ctx, fakeMaster());
  s.markRunning();
  h.dom.visibilityState = 'hidden';
  h.dom.emit('visibilitychange');
  assert.equal(s.getSnapshot().state, 'running');
});

test('Media Session actions: pause → paused; play while paused → resume; stop → host stop; debounced', async () => {
  const { s, ctx, master, ms, advance } = session();
  let stops = 0, starts = 0;
  s.attach(ctx, master, { host: { stop: () => stops++, start: () => starts++ } });
  s.markRunning();
  assert.deepEqual(Object.keys(ms.handlers).sort(), ['pause', 'play', 'stop']);
  ms.handlers.pause();
  assert.equal(s.getSnapshot().reason, 'media-pause');
  ms.handlers.play(); // debounced (<300 ms)
  assert.equal(s.getSnapshot().state, 'paused');
  advance(400);
  ms.handlers.play();
  await new Promise((r) => setImmediate(r));
  assert.equal(s.getSnapshot().state, 'running');
  advance(400);
  ms.handlers.stop();
  assert.equal(stops, 1);
  assert.equal(starts, 0);
});

test('legacy experimental media flag on → session leaves navigator.mediaSession to useVehicleMedia', () => {
  const { s, ctx, master, ms } = session({ legacyMediaFlag: () => true });
  s.attach(ctx, master);
  s.markRunning();
  assert.equal(ms.playbackState, 'none');
  assert.deepEqual(ms.handlers, {});
  const release = s.claim(); // usePlaybackSession mounted → session owns it
  assert.equal(ms.playbackState, 'playing');
  release();
});

test('live root: Frontend useVehicleMedia owns Media Session → session never touches it, fades and pause still work', async () => {
  // useAudioEngine hands the session an always-true reader on root (a17c998 steering-wheel buttons).
  let made = 0;
  const h = session({ legacyMediaFlag: () => true, createAudioElement: () => (made++, { paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, setAttribute() {} }) });
  h.ctx.createMediaStreamDestination = () => ({ stream: { getTracks: () => [] }, disconnect() {} });
  // What useVehicleMedia set while the engine runs (its handlers, its metadata/artwork).
  const wheel = { play() {}, pause() {}, nexttrack() {}, previoustrack() {} };
  Object.assign(h.ms.handlers, wheel);
  h.ms.metadata = { title: 'Frontend', artwork: ['icons/revforge-512.png'] };
  h.ms.playbackState = 'playing';
  const before = () => ({ handlers: { ...h.ms.handlers }, metadata: h.ms.metadata, state: h.ms.playbackState });
  const snap0 = before();
  h.s.attach(h.ctx, h.master);
  h.s.setMediaInfo({ title: 'Night Pursuit' });
  h.s.markRunning();
  assert.deepEqual(before(), snap0);
  h.ctx.setState('interrupted'); // interruption still fades + pauses
  assert.deepEqual(h.master.calls.at(-1), ['fadeOut', 0.15]);
  assert.equal(h.s.getSnapshot().state, 'paused');
  h.ctx.setState('running');
  assert.equal(await h.s.resume(), true);
  assert.equal(h.s.getSnapshot().state, 'running');
  assert.ok(h.master.calls.some((c) => Array.isArray(c) && c[0] === 'rampIn'));
  h.s.setPreview({ title: 'Preview' });
  h.s.setPreview(null);
  h.s.markStopped(); // engine off: Frontend released the wheel; the session must not re-register
  assert.deepEqual(before(), snap0, 'handlers, metadata and playbackState untouched throughout');
  for (const k of Object.keys(wheel)) assert.equal(h.ms.handlers[k], wheel[k]);
  assert.equal(made, 0, 'no procedural carrier alongside the Frontend carrier');
  assert.deepEqual(h.s.acceptedActions(), []);
  h.s.dispose();
  assert.deepEqual(before(), snap0, 'dispose leaves Frontend\'s session alone');
});

test('useAudioEngine: Frontend owns Media Session (always-true reader, set once, no storage read)', () => {
  const hook = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(hook, /const FRONTEND_OWNS_MEDIA_SESSION = \(\) => true;/);
  assert.match(hook, /session\.setLegacyMediaFlagReader\(FRONTEND_OWNS_MEDIA_SESSION\);/);
  assert.doesNotMatch(hook, /setLegacyMediaFlagReader\(null\)/, 'never cleared on unmount');
  assert.doesNotMatch(hook, /LEGACY_MEDIA_FLAG/);
});

test('silent procedural carrier only when the mix is not routed through a media element', () => {
  let made = 0;
  const h = session({ createAudioElement: () => (made++, { paused: true, async play() { this.paused = false; }, pause() { this.paused = true; }, setAttribute() {} }) });
  const dest = { stream: { getTracks: () => [] }, disconnect() {} };
  h.ctx.createMediaStreamDestination = () => dest;
  h.s.attach(h.ctx, h.master);
  h.s.markRunning();
  assert.equal(made, 1);
  const routed = { paused: false, plays: 0, async play() { this.plays++; }, pause() { this.paused = true; } };
  const h2 = session();
  h2.ctx.createMediaStreamDestination = () => { throw new Error('should not be needed'); };
  h2.s.attach(h2.ctx, h2.master, { getMediaElement: () => routed });
  h2.s.markRunning();
  h2.ctx.setState('interrupted');
  h2.advance(200);
  assert.equal(routed.paused, true, 'routed element paused with the session');
});

test('no Media Session support → no-op, state machine still works', () => {
  const { s, ctx, master } = session({ navigator: {} });
  s.attach(ctx, master);
  s.markRunning();
  ctx.setState('interrupted');
  assert.equal(s.getSnapshot().state, 'paused');
});

/* ---------------- master bus / limiter (real renderer) ---------------- */

async function renderThrough(build, seconds = 1, sr = 44100) {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * sr), sr);
  const bus = PS.createMasterBus(ctx);
  bus.fade.gain.value = 1;
  build(ctx, bus.input);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}
function sine(ctx, dest, amp, f = 220, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.value = amp;
  o.connect(g).connect(dest);
  o.start();
}

test('limiter math: makeup cancelled per spec, soft ceiling never above −1 dBFS, unity below knee', () => {
  assert.ok(Math.abs(PS.compressorMakeupDb(-3, 20) - 1.71) < 1e-9);
  for (const x of [0, 0.1, 0.5, 0.7]) assert.equal(PS.softCeiling(x), x);
  for (const x of [0.75, 0.9, 1, 2, 50]) assert.ok(PS.softCeiling(x) <= 10 ** (PS.LIMITER_CEILING_DB / 20) + 1e-12);
  const curve = PS.softCeilingCurve();
  assert.equal(curve[(curve.length - 1) / 2], 0);
});

test('normal levels pass at unity (≤0.05 dB) through the master bus', async () => {
  for (const ampDb of [-30, -12, -6, -3.5]) {
    const amp = 10 ** (ampDb / 20);
    const y = await renderThrough((ctx, d) => sine(ctx, d, amp));
    const outDb = db(peak(y, 22050));
    assert.ok(Math.abs(outDb - ampDb) < 0.05, `${ampDb} dBFS → ${outDb.toFixed(3)}`);
  }
});

test('hot input is held at the −1 dBFS ceiling (sine, square, +12 dB burst, noise)', async () => {
  const ceiling = 10 ** (PS.LIMITER_CEILING_DB / 20) + 1e-6;
  for (const [amp, type] of [[1, 'sine'], [2, 'square'], [4, 'sawtooth']]) {
    const y = await renderThrough((ctx, d) => sine(ctx, d, amp, 110, type));
    assert.ok(peak(y) <= ceiling, `${type} ×${amp}: peak ${db(peak(y)).toFixed(2)} dBFS`);
  }
  const y = await renderThrough((ctx, d) => {
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = n.getChannelData(0);
    let s = 7;
    for (let i = 0; i < ch.length; i++) { s = (s * 16807) % 2147483647; ch[i] = (s / 1073741823 - 1) * (i > 20000 ? 4 : 0.05); }
    const src = ctx.createBufferSource();
    src.buffer = n;
    src.connect(d);
    src.start();
  });
  assert.ok(peak(y) <= ceiling, `noise burst peak ${db(peak(y)).toFixed(2)} dBFS`);
});

test('master never exceeds unity gain and rampIn starts from silence over ~250 ms', async () => {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const bus = PS.createMasterBus(ctx);
  sine(ctx, bus.input, 0.25);
  bus.rampIn();
  const y = (await ctx.startRendering()).getChannelData(0);
  assert.ok(peak(y, 0, Math.round(0.01 * sr)) < 0.25 * 0.06, 'first 10 ms near silent');
  assert.ok(rms(y, Math.round(0.1 * sr), Math.round(0.12 * sr)) < rms(y, Math.round(0.5 * sr), sr) * 0.6, 'still ramping at 110 ms');
  assert.ok(Math.abs(db(peak(y, Math.round(0.5 * sr))) - db(0.25)) < 0.05, 'unity after the ramp');
  assert.ok(peak(y) <= 0.25 + 1e-4, 'never above the source level');
});

test('fadeOut reaches silence within 150 ms', async () => {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const bus = PS.createMasterBus(ctx);
  bus.fade.gain.value = 1;
  sine(ctx, bus.input, 0.25);
  // Measure from the moment the fade was actually scheduled: under a loaded test run the
  // offline renderer can be a quantum or two past the suspend point when the callback fires.
  let t0 = 0.2;
  let end = 0;
  ctx.suspend(0.2).then(() => { t0 = ctx.currentTime; end = bus.fadeOut(); ctx.resume(); });
  const y = await ctx.startRendering();
  const x = y.getChannelData(0);
  assert.ok(end > 0, 'fadeOut ran');
  assert.ok(end - t0 <= 0.15 + 1e-6, `fade scheduled within 150 ms (${((end - t0) * 1000).toFixed(1)} ms)`);
  assert.ok(peak(x, Math.min(x.length - 1, Math.ceil((end + 0.01) * sr))) < 1e-3, 'silent after the fade');
});

/* ---------------- gesture gating ---------------- */

test('no AudioContext is created or resumed on import or mount (mocked AudioContext)', async () => {
  let constructed = 0, resumed = 0, started = 0;
  class MockAC { constructor() { constructed++; } resume() { resumed++; return Promise.resolve(); } createGain() { return {}; } }
  const g = globalThis;
  const saved = { AudioContext: g.AudioContext, window: g.window, webkit: g.webkitAudioContext, OscillatorNode: g.OscillatorNode };
  g.AudioContext = MockAC;
  g.webkitAudioContext = MockAC;
  g.window = g;
  try {
    const fresh = createJiti(join(root, 'package.json'), {
      moduleCache: false,
      alias: { './worklets/pulse-engine-processor.js?url': join(root, 'tests/fixtures/worklet-url-stub.mjs') },
    });
    const mod = await fresh.import(join(root, 'src/audio/playbackSession.ts'));
    const s = mod.getPlaybackSession();
    s.setMediaInfo({ title: 'x' });
    s.dispatch('play'); // hardware play before any tap: nothing attached, nothing starts
    const hook = await fresh.import(join(root, 'src/hooks/useAudioEngine.ts'));
    const React = await import('react');
    const { renderToString } = await import('react-dom/server');
    function Probe() { hook.useAudioEngine('ion-twin', []); return null; }
    renderToString(React.createElement(Probe));
    assert.equal(constructed, 0, 'AudioContext constructed without a gesture');
    assert.equal(resumed, 0, 'AudioContext.resume without a gesture');
    assert.equal(started, 0);
  } finally {
    g.AudioContext = saved.AudioContext;
    g.webkitAudioContext = saved.webkit;
    g.window = saved.window;
  }
});

test('useAudioEngine: context creation and resume live only on gesture paths (start / playPreview)', () => {
  const src = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.equal((src.match(/new AC\(\)/g) ?? []).length, 1);
  const ensureCalls = [...src.matchAll(/\bensure\(\)/g)].map((m) => m.index);
  const startBody = src.slice(src.indexOf('const start = useCallback'), src.indexOf('startRef.current = start'));
  for (const i of ensureCalls) {
    const inStart = i > src.indexOf('const start = useCallback') && i < src.indexOf('startRef.current = start');
    assert.ok(inStart, 'ensure() called outside start()');
  }
  assert.match(startBody, /\.resume\(\)/);
  // ensureContext() (the only `new AC()`) is reached only from ensure() (start) and playPreview (tap).
  const span = (from, to) => [src.indexOf(from), src.indexOf(to, src.indexOf(from))];
  const allowed = [span('const ensure = useCallback', '}, [ensureContext]'), span('const playPreview = useCallback', '}, [ensureContext, session]')];
  const ctxCalls = [...src.matchAll(/\bensureContext\(\)/g)].map((m) => m.index);
  assert.ok(ctxCalls.length >= 2);
  for (const i of ctxCalls) assert.ok(allowed.some(([a, b]) => a >= 0 && i > a && i < b), 'ensureContext() called outside ensure()/playPreview()');
  assert.ok(src.indexOf('new AC()') > src.indexOf('const ensureContext = useCallback') && src.indexOf('new AC()') < src.indexOf('const ensure = useCallback'));
  // hardware play while idle only restarts a context that is already running (no new unlock)
  assert.match(src, /start: \(\) => \{\s*if \(ctxRef\.current\?\.state === "running"\) void startRef\.current\(\);/);
  const session = readFileSync(join(root, 'src/audio/playbackSession.ts'), 'utf8');
  assert.doesNotMatch(session, /new (window\.)?(webkit)?AudioContext/);
  assert.doesNotMatch(session, /\.volume\s*=/, 'never touches element/system volume');
});

test('engines route through the master bus, never straight to the speakers', () => {
  const src = readFileSync(join(root, 'src/hooks/useAudioEngine.ts'), 'utf8');
  assert.match(src, /eng\.output\.connect\(master\.input\)/);
  assert.match(src, /mediaRef\.current\.attach\(masterRef\.current\.output\)/);
  assert.doesNotMatch(src, /mediaRef\.current\?\.attach\((engineRef\.current|next)\.output\)/);
});
