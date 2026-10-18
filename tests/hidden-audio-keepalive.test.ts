// Hidden page keeps Drive audio running (Wilson: audio cut off in reverse, Tesla backup camera covers the browser).
// Frontend half: ForgePage no longer stops audio on hide; the parameter feed (useDriveSimulation) keeps stepping
// through a 100 ms watchdog when rAF stalls (frameLoop.ts). Dan owns the AudioContext resume (useAudioEngine / src/audio).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRAME_MAX_STEP_RAF_S, FRAME_MAX_STEP_WATCHDOG_S, FRAME_STALL_MS, FRAME_WATCHDOG_MS, startFrameLoop, type FrameLoopEnv } from '../src/forge/frameLoop.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/** Fake clock + rAF + interval. rafOn=false models a hidden / covered page (callbacks stay pending). */
function fakeEnv() {
  let t = 1000, id = 0;
  const rafs = new Map<number, (t: number) => void>();
  let interval: { f: () => void; ms: number; next: number } | null = null;
  const env: FrameLoopEnv = {
    now: () => t,
    raf: (cb) => { rafs.set(++id, cb); return id; },
    caf: (i) => { rafs.delete(i); },
    setInterval: (f, ms) => { interval = { f, ms, next: t + ms }; return 1; },
    clearInterval: () => { interval = null; },
  };
  const s = {
    env, rafOn: true, timerMs: FRAME_WATCHDOG_MS,
    get pendingRafs() { return rafs.size; },
    get hasInterval() { return interval !== null; },
    /** advance the clock ms, firing rAF every 16 ms (when on) and the interval every timerMs */
    advance(ms: number) {
      const end = t + ms;
      let nextRaf = t + 16;
      while (t < end) {
        const nt = Math.min(end, s.rafOn ? nextRaf : Infinity, interval ? interval.next : Infinity);
        t = nt;
        if (s.rafOn && t >= nextRaf) { nextRaf = t + 16; const cbs = [...rafs.values()]; rafs.clear(); for (const cb of cbs) cb(t); }
        if (interval && t >= interval.next) { interval.next = t + s.timerMs; interval.f(); }
      }
    },
    fireRafNow() { const cbs = [...rafs.values()]; rafs.clear(); for (const cb of cbs) cb(t); },
    fireIntervalNow() { interval?.f(); },
  };
  return s;
}

test('feed: rAF paces the steps while the page paints; the watchdog stays quiet', () => {
  const e = fakeEnv(); const steps: [number, number, string][] = [];
  const stop = startFrameLoop((now, dt, via) => steps.push([now, dt, via]), e.env);
  e.advance(1000);
  assert.ok(steps.length >= 55, `${steps.length} steps`);
  assert.ok(steps.every(([, , via]) => via === 'raf'), 'no watchdog steps while rAF runs');
  assert.ok(steps.every(([, dt]) => dt > 0 && dt <= FRAME_MAX_STEP_RAF_S));
  stop();
});

test('feed: rAF stalls (hidden or covered page, with or without visibilitychange) → the watchdog steps every 100 ms', () => {
  const e = fakeEnv(); const steps: [number, number, string][] = [];
  startFrameLoop((now, dt, via) => steps.push([now, dt, via]), e.env);
  e.advance(200);
  const n0 = steps.length;
  e.rafOn = false; // nothing in the env says "hidden": the watchdog keys on the missing frames only
  e.advance(2000);
  const wd = steps.slice(n0).filter(([, , v]) => v === 'watchdog');
  assert.ok(wd.length >= 17 && wd.length <= 20, `${wd.length} watchdog steps in 2 s`);
  assert.equal(steps.slice(n0).filter(([, , v]) => v === 'raf').length, 0);
  // the first watchdog step comes only after > 150 ms without a frame
  assert.ok(wd[0][0] - steps[n0 - 1][0] > FRAME_STALL_MS);
  // sim time keeps up with wall time (no lost seconds while stalled)
  const simS = steps.slice(n0).reduce((a, [, dt]) => a + dt, 0);
  assert.ok(Math.abs(simS - (steps.at(-1)![0] - steps[n0 - 1][0]) / 1000) < 1e-9, `sim ${simS}s`);
});

test('feed: Chromium clamps hidden timers to ~1 Hz → each watchdog step covers up to 1.0 s (was 0.25 s)', () => {
  const e = fakeEnv(); const steps: [number, number, string][] = [];
  startFrameLoop((now, dt, via) => steps.push([now, dt, via]), e.env);
  e.rafOn = false; e.timerMs = 1000;
  e.advance(5000);
  const wd = steps.filter(([, , v]) => v === 'watchdog');
  assert.ok(wd.length >= 4);
  for (const [, dt] of wd.slice(1)) assert.ok(Math.abs(dt - 1.0) < 1e-9, `dt ${dt}`);
  e.timerMs = 5000; e.advance(10000); // a longer gap is capped at 1.0 s
  assert.ok(steps.filter(([, , v]) => v === 'watchdog').every(([, dt]) => dt <= FRAME_MAX_STEP_WATCHDOG_S));
});

test('feed: rAF and the watchdog never double-step the same interval; rAF resumes when frames come back', () => {
  const e = fakeEnv(); const steps: [number, number, string][] = [];
  startFrameLoop((now, dt, via) => steps.push([now, dt, via]), e.env);
  e.rafOn = false; e.advance(400);
  const n = steps.length;
  // a stale rAF and the watchdog landing on the same instant: one step only
  e.fireIntervalNow(); e.fireRafNow(); e.fireIntervalNow();
  const same = steps.slice(n);
  assert.ok(same.length <= 1, `${same.length} steps at one instant`);
  // step times strictly increase over the whole run, so no interval is stepped twice
  e.rafOn = true; e.advance(500);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i][0] > steps[i - 1][0], `step ${i}`);
  assert.ok(steps.slice(-5).every(([, , v]) => v === 'raf'), 'rAF paces again once the page paints');
  assert.equal(e.pendingRafs, 1, 'exactly one rAF request pending');
});

test('feed: stop cancels the rAF and the watchdog', () => {
  const e = fakeEnv(); let steps = 0;
  const stop = startFrameLoop(() => { steps++; }, e.env);
  e.advance(100); stop();
  const n = steps; e.rafOn = false; e.advance(1000);
  assert.equal(steps, n);
  assert.equal(e.pendingRafs, 0);
  assert.equal(e.hasInterval, false);
});

test('useDriveSimulation: the feed runs on startFrameLoop; no visibility-gated interval, no 0.25 s cap', () => {
  const sim = src('forge/useDriveSimulation.ts');
  assert.match(sim, /return startFrameLoop\(frame, \{/);
  assert.match(sim, /const frame = \(now: number, dt: number\) => \{/);
  assert.doesNotMatch(sim, /visibilityState|requestAnimationFrame\(frame\)|\.25/);
});

test('ForgePage: hidden releases the pedal and brake only; audio stops only on Shutdown / guard / pack shutdown', () => {
  const page = src('forge/ForgePage.tsx');
  const at = page.indexOf('const visibility = () => {');
  const vis = page.slice(at, page.indexOf('};', at));
  assert.match(vis, /if \(document\.visibilityState === "hidden"\) release\(\);/);
  assert.doesNotMatch(vis, /audio\.stop|background/);
  assert.doesNotMatch(page, /mutedBeforeHide|'Resume'/);
  // audio.stop() is called from the explicit stop() only (Shutdown chip, shutdown guard, pack 'shutdown', car media 'stop' → stop())
  assert.equal(page.match(/audio\.stop\(\)/g)?.length, 1);
  assert.match(page, /const stop = \(\) => \{\n\s*setPedal\(0\);\n\s*setBrake\(false\);\n\s*audio\.playShutoff\?\.\(\);\n\s*audio\.stop\(\);/);
  assert.match(page, /if \(a\.type === 'shutdown'\) \{ if \(audio\.running\) stop\(\); \}/);
  // the Background audio setting stays (media-element output route + pack CONFIG); it no longer gates stop-on-hide
  assert.match(page, /aria-label="Background audio" type="checkbox" checked=\{audio\.background\}/);
});

test('useVehicleMedia + ForgePage: car pause mutes through the app mute (never stop / shutoff / element pause); muted chip on screen', () => {
  const vm = src('forge/useVehicleMedia.ts');
  assert.match(vm, /runMediaCommand\(command,\{session,arm,fire:o\.fire,start:o\.start,stop:o\.stop,mute:o\.mute,unmute:o\.unmute,shift:o\.shift\}\);/);
  assert.match(vm, /const actions=VEHICLE_MEDIA_ACTIONS;/, "'stop' handled (one list, mediaActions.ts)");
  assert.doesNotMatch(vm, /visibilityState/, 'a car play while the camera covers the page can re-arm the session');
  assert.match(vm, /playbackState=options\.paused\?'paused':'playing'/, 'the running effect keeps a paused session paused');
  const ma = src('forge/mediaActions.ts');
  const mute = ma.slice(ma.indexOf("if(command==='mute')"), ma.indexOf('\n', ma.indexOf("if(command==='mute')")));
  assert.match(mute, /d\.mute\(\);d\.session\.playbackState='paused';/);
  assert.doesNotMatch(mute, /stop|pause\(\)|arm/);
  const page = src('forge/ForgePage.tsx');
  const at = page.indexOf('useVehicleMedia({');
  const call = page.slice(at, page.indexOf('});', at));
  assert.match(call, /mute:\(\)=>setMediaPaused\(true\),unmute:\(\)=>setMediaPaused\(false\),paused:engineMuted/, 'transient mute (mediaPause.ts), never the saved pref');
  assert.match(page, /\{mutedChip&&<button type="button" className="rev-chip rev-muted" aria-pressed="true" aria-label=\{mutedChip\.aria\}/);
  assert.match(src('app/App.tsx'), /effectiveMuted\(prefs\.masterMuted, mediaPaused\)\s*\? 0/, 'mute = output gain 0, engine keeps running');
});

test('Options hints match the media mapping: pause mutes (engine keeps running), never "pause stops"', () => {
  const page = src('forge/ForgePage.tsx');
  assert.doesNotMatch(page, /pause stops/);
  assert.match(page, /has no gearbox: play starts the engine or unmutes it, pause mutes it and the engine keeps running, next\/previous do nothing\. Touch Shutdown always stops\./);
  assert.match(page, /Other engines: pause mutes the sound and the engine keeps running \(or upshifts in Manual with the option above\); play unmutes\./);
});
