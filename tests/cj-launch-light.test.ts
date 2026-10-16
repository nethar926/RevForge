/** Carrier-launch AB light + CONFIG › SND › AUTO LAUNCH (Frontend, on Dan's fd583b2). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAUNCH_OFF, LAUNCH_SAY, launchAbZone, launchStep, readLaunchActive } from '../src/packs/carrier-jet/launchLight.ts';
import { applyCjPrefsToEngine, CJ_PREFS_DEFAULT, CJ_PREFS_KEY, parseCjPrefs, resetCjPrefsCache, setCjPrefs, getCjPrefs } from '../src/packs/carrier-jet/cjPrefs.ts';
import { CJ_CONFIG } from '../src/packs/carrier-jet/configPages.ts';
import { runItem, type ConfigCtx } from '../src/packs/configTable.ts';
import { MAP_VIEW_DEFAULT } from '../src/packs/carrier-jet/mapView.ts';
import { storageKey } from '../src/lib/storageKey.ts';
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const ctx = (over: Partial<ConfigCtx> = {}) => ({ park: true, muted: false, look: 'carrier-jet', map: { ...MAP_VIEW_DEFAULT }, prefs: { ...CJ_PREFS_DEFAULT }, ...over }) as ConfigCtx;

test('launch light ON: getLaunchActive() true while running → lit, AB zone ≥ 1, LAUNCH legend, one polite announcement', () => {
  const api = { getLaunchActive: () => true };
  assert.equal(readLaunchActive(api, true), true);
  const on = launchStep(LAUNCH_OFF, true);
  assert.deepEqual(on, { lit: true, say: LAUNCH_SAY, count: 1 });
  assert.equal(LAUNCH_SAY, 'Afterburner launch');
  assert.equal(launchStep(on, true), on, 'still active: same state, no second announcement');
  assert.equal(launchAbZone(0, true), 1, 'lights the AB readouts like normal AB');
  assert.equal(launchAbZone(undefined, true), 1);
  assert.equal(launchAbZone(3, true), 3, 'a higher Audio zone is kept');
  const m = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(m, /const launchActive = readLaunchActive\(jetApi, props\.running\);/, 'polled on the HUD tick render');
  assert.doesNotMatch(m, /requestAnimationFrame/, 'no new rAF');
  assert.match(m, /const abZone = launchAbZone\(abZoneAudio, launch\.lit\);/);
  assert.match(m, /abZone=\{abZone\} heading=\{h\}/);
  assert.match(m, /data-ab-launch=\{launch\.lit \|\| undefined\} data-launch-motion=\{reduced \? 'static' : 'live'\}/);
  assert.match(m, /\{launch\.lit && <span className="cjm-launch" aria-hidden="true">LAUNCH<\/span>\}/);
  assert.match(m, /<p className="rf-sr-only cjm-launch-say" role="status" aria-live="polite">\{launch\.say\}<\/p>/);
  const css = src('packs/mounts/carrier-jet-controls.css');
  assert.match(css, /\.cjm-bank\[data-ab-launch\]\[data-launch-motion='live'\] > \.cjm-bank-ab > \.cjm-launch \{ animation:/, 'flicker only with motion');
  assert.doesNotMatch(css.replace(/\[data-launch-motion='live'\] > \.cjm-bank-ab > \.cjm-launch \{ animation:[^}]*\}/, ''), /cjm-launch[^{]*\{[^}]*animation/, 'Reduce Motion: steady');
  assert.match(css, /\.cjm-launch \{[^}]*font: 800 12px/, '≥ 11px legend');
});

test('launch light OFF: not running / no API / false / throws → off; ends clear the announcement so the next launch speaks again', () => {
  assert.equal(readLaunchActive({ getLaunchActive: () => true }, false), false, 'engine not running: not polled');
  assert.equal(readLaunchActive(null, true), false);
  assert.equal(readLaunchActive({}, true), false, 'engine without the API');
  assert.equal(readLaunchActive({ getLaunchActive: () => false }, true), false);
  assert.equal(readLaunchActive({ getLaunchActive: () => { throw new Error('x'); } }, true), false);
  assert.equal(launchStep(LAUNCH_OFF, false), LAUNCH_OFF);
  const off = launchStep(launchStep(LAUNCH_OFF, true), false);
  assert.deepEqual(off, { lit: false, say: '', count: 1 });
  assert.equal(launchAbZone(0, false), 0, 'Audio zone untouched');
  assert.equal(launchAbZone(undefined, false), undefined);
  assert.deepEqual(launchStep(off, true), { lit: true, say: LAUNCH_SAY, count: 2 }, 'second activation announces again');
});

test('CONFIG › SND › AUTO LAUNCH toggles the pref and calls setAutoLaunch(bool); always enabled', () => {
  const it = CJ_CONFIG.sound.items.find((i) => i.id === 'autoLaunch')!;
  assert.ok(it, 'tile on the SND page');
  assert.equal(it.label, 'AUTO LAUNCH');
  assert.equal(it.value!(ctx()), 'ON');
  assert.equal(it.aria!(ctx()), 'Auto launch, on');
  assert.equal(it.parkOnly, undefined);
  assert.equal(it.disabled, undefined);
  assert.deepEqual(runItem(it, ctx()), { type: 'prefs', partial: { autoLaunch: false } });
  assert.deepEqual(runItem(it, ctx({ prefs: { ...CJ_PREFS_DEFAULT, autoLaunch: false } })), { type: 'prefs', partial: { autoLaunch: true } });
  const calls: boolean[] = [];
  applyCjPrefsToEngine({ setAutoLaunch: (on) => calls.push(on) }, { ...CJ_PREFS_DEFAULT, autoLaunch: false });
  applyCjPrefsToEngine({ setAutoLaunch: (on) => calls.push(on) }, { ...CJ_PREFS_DEFAULT });
  assert.deepEqual(calls, [false, true]);
});

test('AUTO LAUNCH persists, default ON (also for saved prefs without the key)', () => {
  assert.equal(CJ_PREFS_DEFAULT.autoLaunch, true);
  assert.equal(parseCjPrefs(null).autoLaunch, true);
  assert.equal(parseCjPrefs('{"switchSound":false}').autoLaunch, true);
  assert.equal(parseCjPrefs('{"autoLaunch":false}').autoLaunch, false);
  const mem = new Map<string, string>();
  const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  resetCjPrefsCache();
  setCjPrefs({ autoLaunch: false }, kv);
  assert.equal(JSON.parse(mem.get(storageKey(CJ_PREFS_KEY))!).autoLaunch, false);
  assert.equal(parseCjPrefs(mem.get(storageKey(CJ_PREFS_KEY))!).autoLaunch, false, 'reload keeps OFF');
  resetCjPrefsCache();
  void getCjPrefs;
});

test("compass readout: name on Meghan's CjHeadingLegend ariaLabel, wrapper unlabelled", () => {
  const l = src('packs/mounts/CjLiveMap.tsx');
  assert.match(l, /<div className="cjv2-hdgro">/);
  assert.match(l, /<CjHeadingLegend trueHdg=\{pair\.t\} magHdg=\{pair\.m\} lead=\{hdgRef\} stale=\{headingStale\} ariaLabel=\{label\} \/>/);
  assert.doesNotMatch(l, /className="cjv2-hdgro" role=/);
});
