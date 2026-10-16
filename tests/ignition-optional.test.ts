/** IGNITION splash optional (Wilson, Oct 16): default off → Drive at once; the first gesture anywhere unlocks audio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFirstGestureUnlock, launchIgnited, parseShowIgnition, SHOW_IGNITION_DEFAULT } from '../src/app/ignitionGate.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

test('default skips the splash, also for saved prefs without the key; only an explicit true shows it', () => {
  assert.equal(SHOW_IGNITION_DEFAULT, false);
  assert.equal(parseShowIgnition(undefined), false, 'existing users with no saved value');
  assert.equal(parseShowIgnition('true'), false);
  assert.equal(parseShowIgnition(true), true);
  assert.equal(launchIgnited(false), true, 'off → Drive straight away');
  assert.equal(launchIgnited(true), false, 'on → splash as today');
  const prefs = src('hooks/useUiPrefs.ts');
  assert.match(prefs, /showIgnitionOnLaunch: SHOW_IGNITION_DEFAULT,/);
  assert.match(prefs, /showIgnitionOnLaunch: parseShowIgnition\(parsed\.showIgnitionOnLaunch\),/);
});

test('the toggle shows it: Customize "Ignition screen on launch" → ForgePage starts un-ignited; "/" boots to /drive only when off, query kept', () => {
  const cust = src('pages/CustomizePage.tsx');
  assert.match(cust, /checked=\{prefs\.showIgnitionOnLaunch\}\s*onChange=\{\(e\) => update\(\{ showIgnitionOnLaunch: e\.target\.checked \}\)\}\s*\/>\s*<span>Ignition screen on launch<\/span>/);
  const page = src('forge/ForgePage.tsx');
  assert.match(page, /useState\(\(\)=>launchIgnited\(prefs\.showIgnitionOnLaunch\)\)/);
  assert.match(page, /if\(prefs\.showIgnitionOnLaunch\)return;return installFirstGestureUnlock\(document\.getElementById\("root"\)\?\?document,audio\.unlock\)/);
  assert.match(page, /<button type="button" className="rev-ignite" disabled=\{audio\.starting\} onClick=\{start\}>/, 'splash markup unchanged');
  const app = src('app/App.tsx');
  assert.match(app, /path === "\/" && !prefs\.showIgnitionOnLaunch \? <ToDrive \/> : <ForgePage/);
  assert.match(app, /<Navigate to=\{\{ pathname: "\/drive", search, hash \}\} replace \/>/);
});

test('no audio unlock before a gesture; the first tap anywhere unlocks (capture phase), then the listener is gone', async () => {
  const root = new EventTarget();
  let calls = 0;
  installFirstGestureUnlock(root, () => { calls++; return Promise.resolve(true); });
  await tick();
  assert.equal(calls, 0, 'nothing before a gesture');
  root.dispatchEvent(new Event('pointerdown'));
  assert.equal(calls, 1, 'unlock runs inside the gesture');
  await tick();
  root.dispatchEvent(new Event('pointerdown'));
  root.dispatchEvent(new Event('keydown'));
  assert.equal(calls, 1, 'one-time');
  // a refused unlock (context still suspended) keeps listening; a key works too
  const r2 = new EventTarget();
  let n = 0;
  installFirstGestureUnlock(r2, () => ++n > 1);
  r2.dispatchEvent(new Event('keydown'));
  await tick();
  r2.dispatchEvent(new Event('keydown'));
  await tick();
  r2.dispatchEvent(new Event('pointerdown'));
  assert.equal(n, 2);
  // capture phase on the root, so a tap on a non-control still unlocks
  assert.match(src('app/ignitionGate.ts'), /root\.addEventListener\(t, on, true\)/);
});

test('unlock = the CTA resume path without an engine start; src/audio untouched', () => {
  const eng = src('hooks/useAudioEngine.ts');
  const body = eng.slice(eng.indexOf('const unlock = useCallback'), eng.indexOf('const stop = useCallback'));
  assert.match(body, /ensure\(\);/);
  assert.match(body, /await ctx\.resume\(\)/);
  assert.doesNotMatch(body, /\.start\(\)/, 'no engine start');
});
