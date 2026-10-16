/** CJ v3 (preview only): cold start host wiring, NAV → SPDS, radar sweep pivot, Dan's radarOn cue + AB UNARMED CALL. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featuresFor } from '../src/features.ts';
import { cjNavAction, cjNavItems } from '../src/packs/carrier-jet.nav.ts';
import { cellKeys, NAV_HOMES, RIGHT_BANK, SPARE_INDEX } from '../src/packs/carrier-jet/edgeKeys.ts';
import { MAP_VIEW_DEFAULT, radarCue } from '../src/packs/carrier-jet/mapView.ts';
import { CJ_CONFIG } from '../src/packs/carrier-jet/configPages.ts';
import { disabledReason, itemAria, runItem, type ConfigCtx, type ConfigItem } from '../src/packs/configTable.ts';
import { AB_UNARMED_OFF_REASON, abUnarmedReason, applyCjPrefsToEngine, CJ_PREFS_DEFAULT, type CjPrefs } from '../src/packs/carrier-jet/cjPrefs.ts';
import { PULL_FIRE_PX, PULL_REST, pullDown, pullMove, pullUp } from '../src/packs/carrier-jet/pullGesture.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const CJ = featuresFor('carrier-jet');
const ctx = (over: Partial<ConfigCtx> = {}): ConfigCtx => ({ park: true, muted: false, prefs: { ...CJ_PREFS_DEFAULT }, map: { ...MAP_VIEW_DEFAULT }, ui: null, compass: { available: true, state: 'off' }, ...over }) as unknown as ConfigCtx;
const item = (page: keyof typeof CJ_CONFIG, id: string): ConfigItem | undefined => CJ_CONFIG[page].items.find((i) => i.id === id);

// ---------------- NAV → SPDS
test('NAV → SPDS: right bank = DRIVE · MORE · spare under COMPASS, on the board and in CONFIG', () => {
  assert.equal(RIGHT_BANK, 'compass');
  for (const config of [null, { tiles: {}, subs: 1 }]) {
    const k = cellKeys(RIGHT_BANK, 3, { map: MAP_VIEW_DEFAULT, config });
    assert.deepEqual(k.map((x) => x?.id ?? null), ['drive', 'more', null]);
    assert.equal(k[SPARE_INDEX], null, 'K3 inert spare');
    assert.equal(k[0]!.active, !config, 'DRIVE legend lit on the board, unlit in CONFIG');
    assert.match(k[0]!.ariaLabel, config ? /return to the board/ : /board showing/);
  }
  assert.equal(cellKeys(RIGHT_BANK, 3, { map: MAP_VIEW_DEFAULT, config: null, moreOpen: true })[1]!.active, true, 'MORE boxed while its sheet is open');
  // 1280 / 1256: four keys fit under COMPASS; K3 and K4 are both inert spares (data-reason=spare, dim cap, no legend)
  assert.deepEqual(cellKeys(RIGHT_BANK, 4, { map: MAP_VIEW_DEFAULT, config: null }).map((x) => x?.id ?? null), ['drive', 'more', null, null]);
});
test('NAV → SPDS: nothing dropped — every old NAV function (CJ preview) has a home', () => {
  const r = cjNavItems({ current: 'drive', muted: false, moreOpen: true, compass: 'off', features: CJ });
  const ids = [...r.items, ...r.overflow].map((i) => i.id);
  assert.deepEqual(ids, ['drive', 'options', 'compass', 'mute', 'more']);
  const c = ctx();
  for (const id of ids) {
    switch (id) {
      case 'drive': case 'more': {
        const home = NAV_HOMES[id];
        assert.ok(cellKeys(home.cell, 3, { map: MAP_VIEW_DEFAULT, config: null }).some((k) => k?.id === home.key), id);
        break;
      }
      case 'options': {
        assert.equal(NAV_HOMES.options.page, 'options');
        assert.ok(CJ_CONFIG.options, 'CONFIG › OPT page');
        // the old OPTIONS switch routed to /customize: still reachable from CONFIG › OPT (RESET ▸, Park)
        assert.deepEqual(cjNavAction('options', 'studio', CJ), { type: 'route', to: '/customize' });
        assert.ok(CJ_CONFIG.options.items.some((i) => JSON.stringify(runItem(i, c) ?? {}).includes('/customize')), '/customize from OPT');
        break;
      }
      case 'mute': {
        const m = item('sound', NAV_HOMES.mute.item)!;
        assert.equal(m.group, 'AUDIO');
        assert.equal(m.label, 'MUTE', 'AUDIO MUTE tile');
        assert.deepEqual(runItem(m, c), { type: 'mute' });
        assert.equal(m.on!(ctx({ muted: true })), true, 'same state');
        break;
      }
      case 'compass': {
        const k = item('map', 'compass')!;
        assert.deepEqual(runItem(k, c), { type: 'compass' });
        break;
      }
      default: assert.fail(`no home for ${id}`);
    }
  }
});
test('NAV → SPDS: Tesla bank has no NAV panel; DRIVE acts like RTN; MORE sheet; MUTE switch aria-checked; spare data-reason', () => {
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const row = src('packs/mounts/CjNavRow.tsx');
  assert.match(mount, /\{spds \? coldOn && <div className="cjm-bank-shelf">/);
  assert.match(row, /if \(spds\) return null;|getCjNavSpds/);
  assert.match(layer, /data-reason=\{[^}]*i >= SPARE_INDEX && !k \? 'spare'/);
  assert.match(layer, /className="cjv2-more"[^>]*role="dialog"/);
  assert.match(layer, /role=\{it\.id === 'mute' \? 'switch' : undefined\} aria-checked=\{it\.id === 'mute' \? !!it\.on\?\.\(c\) : undefined\}/);
  assert.match(layer, /case 'drive':/);
  assert.match(layer, /case 'more':/);
});

// ---------------- radar sweep pivot
test('radar sweep: own overlay <svg>, same viewBox + inset, rotated as an element about 50% 50%; no transform on SVG <g>', () => {
  const layer = src('packs/mounts/CjV2Layer.tsx');
  const css = src('packs/mounts/carrier-jet-v2.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(layer, /<svg className="cjv2-sweepsvg" viewBox="-50 -50 100 100" aria-hidden="true">\s*\{!reduced && <path className="cjv2-trail"/);
  assert.doesNotMatch(css, /transform-box/);
  assert.doesNotMatch(css, /\.cjv2-sweep\s*\{|g\.cjv2-sweep/, 'no rotated <g>');
  assert.match(css, /\.cjv2-scope > \.cjv2-sweepsvg \{ transform-origin: 50% 50%; will-change: transform; animation: cjv2-sweep 4s linear infinite;/);
  assert.match(css, /\.cjv2-map svg \{ inset: 14px 8px; width: calc\(100% - 16px\); height: calc\(100% - 28px\); \}/, 'same inset as the scope svg');
  assert.match(css, /\.cjv2\[data-motion='static'\] \.cjv2-scope > \.cjv2-sweepsvg \{ animation: none;/);
  assert.match(css, /\.cjv2\[data-motion='static'\] \.cjv2-trail \{ display: none; \}/);
  // headless proof (frontend-handoff/cj-v3/sweep.mjs): pivot within 1px of the scope centre at 1280, 1256 and 773
  const probe = new URL('../../frontend-handoff/cj-v3/sweep-after.json', import.meta.url);
  let j: Record<string, { maxCorner: number }> | null = null;
  try { j = JSON.parse(readFileSync(probe, 'utf8')); } catch { /* probe not present on this checkout */ }
  if (j) for (const [w, r] of Object.entries(j)) assert.ok(r.maxCorner <= 1, `${w}: pivot off ${r.maxCorner}px`);
});

// ---------------- Dan 7a0e199: radarOn + AB UNARMED CALL
test("radarOn cue: once per RADAR off → on; never on OFF, mount/restore, or while muted", () => {
  assert.equal(radarCue(false, true, false), 'radarOn');
  assert.equal(radarCue(true, false, false), null, 'OFF');
  assert.equal(radarCue(undefined, true, false), null, 'mount / restore');
  assert.equal(radarCue(true, true, false), null, 'no repeat');
  assert.equal(radarCue(false, true, true), null, 'muted');
  const layer = src('packs/mounts/CjV2Layer.tsx');
  assert.match(layer, /const c = radarCue\(prevRadar\.current, view\.radar, shell\.muted\);\s*prevRadar\.current = view\.radar;/);
});
test('AB UNARMED CALL tile: Silent › Tone › Voice, default Silent, disabled with a reason when callouts are off', () => {
  const ab = item('sound', 'abUnarm')!;
  assert.equal(ab.label, 'AB UNARMED CALL');
  let c = ctx();
  assert.equal(ab.value!(c), 'SILENT');
  const seq: string[] = [];
  for (let i = 0; i < 3; i++) {
    const e = runItem(ab, c) as { type: 'prefs'; partial: Partial<CjPrefs> };
    seq.push(e.partial.abUnarmedCall!);
    c = ctx({ prefs: { ...c.prefs, ...e.partial } });
  }
  assert.deepEqual(seq, ['tone', 'voice', 'silent']);
  const off = ctx({ prefs: { ...CJ_PREFS_DEFAULT, calloutMode: 'off' } });
  assert.equal(abUnarmedReason(off.prefs), AB_UNARMED_OFF_REASON);
  assert.equal(disabledReason(ab, off), AB_UNARMED_OFF_REASON);
  assert.equal(runItem(ab, off), null);
  assert.match(itemAria(ab, off), /Callouts are off/);
});
test('prefs → engine: every call guarded; AB unarmed + start mode sent on load and on change', () => {
  const calls: string[] = [];
  const e = {
    setCalloutMode: (m: string) => calls.push(`calls:${m}`),
    setHighSpeedCallouts: (b: boolean) => calls.push(`hi:${b}`),
    setAbUnarmedCall: (m: string) => calls.push(`ab:${m}`),
    setJetSwitchSound: (b: boolean) => calls.push(`sw:${b}`),
    setJetStartMode: (m: string) => calls.push(`start:${m}`),
  };
  applyCjPrefsToEngine(e, { ...CJ_PREFS_DEFAULT });
  assert.deepEqual(calls, ['calls:voice', 'hi:false', 'ab:silent', 'sw:true', 'start:apu']);
  calls.length = 0;
  applyCjPrefsToEngine(e, { ...CJ_PREFS_DEFAULT, abUnarmedCall: 'voice', startMode: 'gndAir' });
  assert.ok(calls.includes('ab:voice') && calls.includes('start:groundcart'));
  // older engines (no Tomcat methods) and throwing engines are fine
  assert.doesNotThrow(() => applyCjPrefsToEngine({}, CJ_PREFS_DEFAULT));
  assert.doesNotThrow(() => applyCjPrefsToEngine({ setAbUnarmedCall: () => { throw new Error('x'); } }, CJ_PREFS_DEFAULT));
  assert.doesNotThrow(() => applyCjPrefsToEngine(null, CJ_PREFS_DEFAULT));
  const bridge = src('packs/audioBridge.ts');
  assert.match(bridge, /cmd\.type === 'jet-prefs' \|\| cmd\.type === 'jet-start-mode'\) applyCjPrefsToEngine/, 'on change');
  assert.match(bridge, /applyCjPrefsToEngine\(live as CjPrefsEngine \| null, getCjPrefs\(\)\);\s*setPackJetSource\(asPackJet\(live\)\);/, 'on every engine connect (load)');
});

// ---------------- cold start host
test('cold start: engine created cold (CJ v2 flag only), before start()/playStarter; root build untouched', () => {
  const hook = src('hooks/useAudioEngine.ts');
  assert.match(hook, /if \(FEATURES\.cjV2\) \(e as \{ setJetColdStart\?: \(on: boolean\) => void \}\)\.setJetColdStart\?\.\(true\);/);
  assert.equal((hook.match(/coldOnCreate\(createEngineSynth\(/g) ?? []).length, 2, 'both engine creation sites');
  assert.equal(featuresFor('').cjV2, false);
});
test('PULL: a tap never fires (no click path on the grip); ≥ 40px pull fires; VoiceOver action button', () => {
  let s = pullDown(PULL_REST, 1, 100, true).state;
  s = pullUp(s, 1, 100).state;
  assert.notEqual(s.phase, 'fired', 'tap');
  s = pullDown(PULL_REST, 1, 100, true).state;
  s = pullMove(s, 1, 100 + PULL_FIRE_PX - 1).state;
  assert.notEqual(pullUp(s, 1, 100 + PULL_FIRE_PX - 1).state.phase, 'fired', '39px');
  s = pullDown(PULL_REST, 1, 100, true).state;
  const m = pullMove(s, 1, 100 + PULL_FIRE_PX + 2);
  const fired = m.state.phase === 'fired' || pullUp(m.state, 1, 100 + PULL_FIRE_PX + 2).state.phase === 'fired';
  assert.ok(fired, '≥ 40px');
  const cs = src('packs/mounts/CjColdStart.tsx');
  const grip = cs.slice(cs.indexOf('const grip = {'), cs.indexOf('};', cs.indexOf('const grip = {')));
  assert.doesNotMatch(grip, /onClick|onKeyDown/);
  assert.match(cs, /className="cjp-sr" data-cjcs-sr onClick=\{\(\) => applyPull\(pullAction\(pullRef\.current\)\)\}>Emergency stop, stop the engines now</);
});
test('cold start: Park-gated shelf, quick start never locked out while driving, ENGINE STARTUP calls setJetStartMode', () => {
  const cs = src('packs/mounts/CjColdStart.tsx');
  assert.match(cs, /aria-disabled=\{!park \|\| undefined\}/);
  assert.match(cs, /jetQuickStart/);
  assert.match(cs, /setJetStartMode/);
  const start = item('options', 'start')!;
  assert.ok(start.parkOnly);
  assert.ok(disabledReason(start, ctx({ park: false })));
});

// ---------------- heading smoothing (GPS-only ~1–1.4 Hz in the car; no sensor dependency)
import { easeHeading, HEADING_EPS, norm360, shortestDelta, tauFor, TAU_MAX_MS, TAU_MIN_MS } from '../src/packs/carrier-jet/headingEase.ts';
test('heading ease: shortest arc — 350 → 10 goes through north, never the long way', () => {
  assert.equal(shortestDelta(350, 10), 20);
  assert.equal(shortestDelta(10, 350), -20);
  assert.equal(shortestDelta(0, 180), 180);
  assert.equal(shortestDelta(90, 90), 0);
  let h: number | undefined = 350;
  const seen: number[] = [];
  for (let i = 0; i < 400; i++) { h = easeHeading(h, 10, 16.7, 500, false); seen.push(h!); }
  assert.equal(h, 10, 'converges exactly (then holds: no jitter)');
  for (const v of seen) assert.ok(v >= 350 || v <= 10, `stays on the short arc: ${v}`);
  // reverse wrap
  let r: number | undefined = 5;
  for (let i = 0; i < 120; i++) { r = easeHeading(r, 345, 16.7, 500, false); assert.ok(r! >= 345 || r! <= 5, String(r)); }
  // monotone approach, ~63% after one time constant
  const one = easeHeading(350, 10, 500, 500, false)!;
  assert.ok(Math.abs(shortestDelta(350, one) - 20 * (1 - Math.exp(-1))) < 1e-6);
  assert.equal(norm360(-30), 330);
});
test('heading ease: Reduce Motion snaps, first value snaps, undefined passes, held value never moves', () => {
  assert.equal(easeHeading(350, 10, 16, 500, true), 10, 'Reduce Motion: no tween');
  assert.equal(easeHeading(undefined, 123, 16, 500, false), 123);
  assert.equal(easeHeading(200, undefined, 16, 500, false), undefined);
  assert.equal(easeHeading(42, 42, 16, 500, false), 42, 'stale / parked hold: same value, no jitter');
  assert.equal(easeHeading(42 + HEADING_EPS / 2, 42, 16, 500, false), 42);
  assert.equal(easeHeading(10, 370, 0, 500, true), 10);
  assert.equal(tauFor(undefined), 500);
  assert.equal(tauFor(700), TAU_MIN_MS);
  assert.equal(tauFor(1000), 450, 'tracks the fix interval');
  assert.equal(tauFor(5000), TAU_MAX_MS);
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /<CjHeadingEase heading=\{heading\} ease=\{v2 && !reduced\}>/, 'CJ v2 flag + Reduce Motion gate; one eased value feeds HUD tape and CjV2Layer');
  assert.match(mount, /<CarrierJetHud [^>]*heading=\{h\} headingStale=\{headingStale\}/);
  assert.match(mount, /<CjV2Layer [^>]*heading=\{h\} headingStale=\{headingStale\}/);
  const ease = src('packs/mounts/CjHeadingEase.tsx');
  assert.match(ease, /requestAnimationFrame\(step\)/);
  assert.doesNotMatch(ease + src('packs/carrier-jet/headingEase.ts'), /DeviceOrientation|Gyroscope|Accelerometer|Magnetometer|geolocation/, 'no new sensor dependency');
});
