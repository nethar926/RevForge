// William's follow-ups on release 0e9c3cd. Bug 2: a car media pause is a transient in-memory mute (mediaPause.ts), never
// the saved masterMuted; Ignition / Shutdown clear it, a reload never comes up muted; a Muted key shows whenever the
// engine is muted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mediaCommand, runMediaCommand } from '../src/forge/mediaActions.ts';
import * as mp from '../src/forge/mediaPause.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/** Fake Drive wired like ForgePage: saved prefs (persisted blob), the transient store, the output gain. */
function drive() {
  const saved = { masterMuted: false }; // what useUiPrefs would write to localStorage
  const st = { running: false, starts: 0, stops: 0 };
  const session = { playbackState: 'none' as MediaSessionPlaybackState };
  const ignition = () => { mp.setMediaPaused(false); st.running = true; st.starts++; };
  const shutdown = () => { st.running = false; st.stops++; mp.setMediaPaused(false); };
  const deps = { session, arm: () => {}, start: () => { mp.setMediaPaused(false); st.running = true; st.starts++; }, stop: shutdown,
    mute: () => mp.setMediaPaused(true), unmute: () => mp.setMediaPaused(false), shift: () => {} };
  const press = (a: 'play' | 'pause' | 'stop') => runMediaCommand(mediaCommand(a, st.running, false, true), deps);
  const audible = () => st.running && !mp.effectiveMuted(saved.masterMuted, mp.getMediaPaused());
  return { saved, st, session, ignition, shutdown, press, audible };
}

test('car pause mutes in memory only: the saved masterMuted is never written', () => {
  mp.setMediaPaused(false);
  const d = drive(); d.ignition();
  d.press('pause');
  assert.equal(mp.getMediaPaused(), true);
  assert.equal(d.audible(), false, 'muted while the car pauses');
  assert.equal(d.saved.masterMuted, false, 'saved pref untouched');
  assert.equal(d.st.stops, 0, 'engine keeps running');
  d.press('play');
  assert.equal(d.audible(), true);
  assert.equal(d.st.starts, 1, 'no restart');
});

test('car pause → Shutdown → Ignition starts audible', () => {
  mp.setMediaPaused(false);
  const d = drive(); d.ignition();
  d.press('pause');
  d.shutdown();
  assert.equal(mp.getMediaPaused(), false, 'Shutdown clears the car-pause mute');
  d.ignition();
  assert.equal(d.audible(), true, 'Ignition is audible');
  // Ignition also clears it on its own (e.g. a pause that landed while the engine was off)
  mp.setMediaPaused(true); d.ignition();
  assert.equal(d.audible(), true);
  // the user's own saved Mute still wins and persists
  d.saved.masterMuted = true; d.ignition();
  assert.equal(d.audible(), false);
});

test('car pause → reload: the transient mute is gone (fresh module state), the saved pref was never set', async () => {
  mp.setMediaPaused(true);
  const fresh = await import(`../src/forge/mediaPause.ts?reload=${Date.now()}`) as typeof mp;
  assert.equal(fresh.getMediaPaused(), false, 'a reload never comes up muted from a car pause');
  const prefs = src('hooks/useUiPrefs.ts');
  assert.doesNotMatch(prefs, /mediaPause|mediaPaused/, 'nothing about the car pause is persisted');
  assert.doesNotMatch(src('forge/mediaPause.ts'), /localStorage|sessionStorage|storageKey/);
  mp.setMediaPaused(false);
});

test('wiring: car mute / unmute use the transient store; Ignition, Shutdown and media start clear it; output gain uses both', () => {
  const page = src('forge/ForgePage.tsx');
  assert.match(page, /mute:\(\)=>setMediaPaused\(true\),unmute:\(\)=>setMediaPaused\(false\),paused:engineMuted/);
  assert.doesNotMatch(page, /mute:\(\)=>update\(\{masterMuted:true\}\)/);
  assert.match(page, /setIgnited\(true\);\n\s*setMediaPaused\(false\);/, 'Ignition');
  assert.match(page, /audio\.stop\(\);\n\s*setMediaPaused\(false\);/, 'Shutdown');
  assert.match(page, /start:\(\)=>\{setMediaPaused\(false\);void audio\.start\(\)/, 'car play on a stopped engine');
  const app = src('app/App.tsx');
  assert.match(app, /useSyncExternalStore\(subscribeMediaPaused, getMediaPaused, getMediaPaused\)/);
  assert.match(app, /effectiveMuted\(prefs\.masterMuted, mediaPaused\)\s*\? 0/);
  // the store notifies subscribers so the gain effect re-runs
  let n = 0; const off = mp.subscribeMediaPaused(() => n++);
  mp.setMediaPaused(true); mp.setMediaPaused(true); mp.setMediaPaused(false); off(); mp.setMediaPaused(true); mp.setMediaPaused(false);
  assert.equal(n, 2);
});

test('Muted key next to Shutdown renders whenever the engine is muted (saved Mute or car pause), with a VoiceOver label', () => {
  assert.equal(mp.mutedKey(false, false, true), null, 'audible: no key');
  assert.deepEqual(mp.mutedKey(true, false, true), { text: 'Muted', aria: 'Engine sound muted, engine still running. Unmute' });
  assert.deepEqual(mp.mutedKey(false, true, true), { text: 'Muted', aria: 'Engine sound muted by car pause, engine still running. Unmute' });
  assert.deepEqual(mp.mutedKey(true, false, false), { text: 'Muted', aria: 'Engine sound muted. Unmute' }, 'a silent start never looks broken');
  for (const k of [mp.mutedKey(true, true, true), mp.mutedKey(false, true, false)]) assert.match(k!.aria, /^Engine sound muted/);
  const page = src('forge/ForgePage.tsx');
  const at = page.indexOf('className="rev-chip rev-stop"');
  const row = page.slice(at, at + 600);
  assert.match(row, /\{mutedChip&&<button type="button" className="rev-chip rev-muted" aria-pressed="true" aria-label=\{mutedChip\.aria\} onClick=\{\(\)=>\{setMediaPaused\(false\);if\(prefs\.masterMuted\)update\(\{masterMuted:false\}\);\}\}>\{mutedChip\.text\}<\/button>\}/, 'right after the Shutdown key, existing rev-chip key style (14px)');
  assert.match(page, /const mutedChip = mutedKey\(prefs\.masterMuted, mediaPaused, audio\.running\);/);
});

