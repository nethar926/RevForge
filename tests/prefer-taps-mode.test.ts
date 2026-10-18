// Prefer Taps + the effective interaction mode: tapMode = preferTaps OR moving. Drags unlock only after GPS has read
// 0 mph continuously for 3 s (live, fresh fix); unknown / stale GPS = tap; any movement = tap at once.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInteractionModeStore, GPS_STALE_MS, interactionModeAt, knownStopped, readingStopped, resolveInteractionMode,
  stepStopWatch, STOP_DWELL_MS, STOPWATCH_START, type InteractionMode,
} from '../src/controls/interactionMode.ts';
import { getGpsMotion, publishGpsMotion, subscribeGpsMotion, type GpsMotion } from '../src/hooks/gpsFixes.ts';
import { getPreferTaps, parsePreferTaps, PREFER_TAPS_DEFAULT, PREFER_TAPS_DESCRIPTION, PREFER_TAPS_KEY, resetPreferTapsCache, setPreferTaps, subscribePreferTaps } from '../src/lib/preferTaps.ts';
import { disabledReason, itemAria, runItem, type ConfigCtx } from '../src/packs/configTable.ts';
import { CJ_CONFIG } from '../src/packs/carrier-jet/configPages.ts';
import { getMapView } from '../src/packs/carrier-jet/mapView.ts';
import { parseCjPrefs } from '../src/packs/carrier-jet/cjPrefs.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const live = (mph: number, at: number): GpsMotion => ({ status: 'live', mph, at });

test('the rule: tap when Prefer Taps is on OR not known stopped', () => {
  assert.equal(resolveInteractionMode(false, true), 'drag');
  assert.equal(resolveInteractionMode(true, true), 'tap');
  assert.equal(resolveInteractionMode(false, false), 'tap');
  assert.equal(resolveInteractionMode(true, false), 'tap');
});

test('a reading is "stopped" only when live, fresh and ≤ 0.5 mph', () => {
  const now = 50_000;
  assert.equal(readingStopped(live(0, now), now), true);
  assert.equal(readingStopped(live(0.4, now), now), true);
  assert.equal(readingStopped(live(3, now), now), false);
  for (const status of ['idle', 'requesting', 'waiting', 'stale', 'denied', 'unavailable', 'error']) {
    assert.equal(readingStopped({ status, mph: 0, at: now }, now), false, status);
  }
  assert.equal(readingStopped({ status: 'live', mph: 0, at: null }, now), false, 'never received');
  assert.equal(readingStopped(live(0, now - GPS_STALE_MS - 1), now), false, 'old reading = stale');
  assert.equal(readingStopped(live(Number.NaN, now), now), false);
});

test('3 s dwell: stopped at t0 → still tap at t0 + 2999 → drag at t0 + 3000; movement resets at once', () => {
  let w = stepStopWatch(STOPWATCH_START, live(0, 1000), 1000);
  assert.equal(interactionModeAt(false, w, 1000), 'tap');
  w = stepStopWatch(w, live(0, 2000), 2000);
  assert.equal(interactionModeAt(false, w, 3999), 'tap');
  assert.equal(interactionModeAt(false, w, 4000), 'drag');
  assert.equal(interactionModeAt(true, w, 4000), 'tap', 'Prefer Taps wins');
  w = stepStopWatch(w, live(4, 4500), 4500);
  assert.equal(knownStopped(w, 4500), false);
  assert.equal(interactionModeAt(false, w, 4500), 'tap', 'movement → tap immediately');
  // the dwell starts over from the next stop
  w = stepStopWatch(w, live(0, 5000), 5000);
  assert.equal(interactionModeAt(false, w, 7999), 'tap');
  assert.equal(interactionModeAt(false, w, 8000), 'drag');
  // GPS dropping out also resets
  w = stepStopWatch(w, { status: 'stale', mph: 0, at: 5000 }, 9000);
  assert.equal(interactionModeAt(false, w, 9000), 'tap');
});

function fakeFeeds(t0: number) {
  let motion: GpsMotion = { status: 'idle', mph: 0, at: null };
  let taps = false;
  const ms = new Set<() => void>();
  const ps = new Set<() => void>();
  return {
    deps: {
      getPreferTaps: () => taps,
      subscribePreferTaps: (f: () => void) => (ps.add(f), () => void ps.delete(f)),
      getMotion: () => motion,
      subscribeMotion: (f: () => void) => (ms.add(f), () => void ms.delete(f)),
    },
    gps(m: Partial<GpsMotion>) {
      motion = { ...motion, ...m };
      for (const f of [...ms]) f();
    },
    setTaps(on: boolean) {
      taps = on;
      for (const f of [...ps]) f();
    },
    t0,
  };
}

test('store (fake timers): flips to drag 3 s after the first 0 mph fix with no further event; back to tap on movement', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  try {
    const f = fakeFeeds(Date.now());
    const store = createInteractionModeStore(f.deps);
    const seen: InteractionMode[] = [];
    const unsub = store.subscribe(() => seen.push(store.get()));
    assert.equal(store.get(), 'tap', 'GPS unknown at start → tap');
    f.gps({ status: 'live', mph: 0, at: Date.now() });
    assert.equal(store.get(), 'tap');
    mock.timers.tick(STOP_DWELL_MS - 10);
    assert.equal(store.get(), 'tap', 'not yet 3 s');
    mock.timers.tick(20);
    assert.equal(store.get(), 'drag', 'the dwell timer flipped it');
    assert.deepEqual(seen, ['drag']);
    // movement: immediate
    f.gps({ mph: 6, at: Date.now() });
    assert.equal(store.get(), 'tap');
    // stop again, but 1 s in a fix says 1 mph → the 3 s start over
    f.gps({ mph: 0, at: Date.now() });
    mock.timers.tick(1000);
    f.gps({ mph: 1, at: Date.now() });
    f.gps({ mph: 0, at: Date.now() });
    mock.timers.tick(2500);
    assert.equal(store.get(), 'tap', 'only 2.5 s since the run restarted');
    mock.timers.tick(600);
    assert.equal(store.get(), 'drag');
    // Prefer Taps wins at once, and releasing it returns to drag (still stopped)
    f.setTaps(true);
    assert.equal(store.get(), 'tap');
    f.setTaps(false);
    assert.equal(store.get(), 'drag');
    unsub();
    store.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('store (fake timers): no new fix for GPS_STALE_MS while stopped → tap (stale = not known stopped)', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 200_000 });
  try {
    const f = fakeFeeds(Date.now());
    const store = createInteractionModeStore(f.deps);
    store.subscribe(() => {});
    f.gps({ status: 'live', mph: 0, at: Date.now() });
    mock.timers.tick(STOP_DWELL_MS + 5);
    assert.equal(store.get(), 'drag');
    mock.timers.tick(GPS_STALE_MS);
    assert.equal(store.get(), 'tap', 'the last fix went stale');
    f.gps({ status: 'stale' });
    assert.equal(store.get(), 'tap');
    f.gps({ status: 'denied', at: Date.now() });
    mock.timers.tick(STOP_DWELL_MS * 3);
    assert.equal(store.get(), 'tap', 'denied never unlocks drags');
    store.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('GPS motion feed: useGeolocation publishes status + mph with a wall stamp (deduped)', () => {
  let n = 0;
  const off = subscribeGpsMotion(() => n++);
  publishGpsMotion({ status: 'live', mph: 0, at: 1 });
  publishGpsMotion({ status: 'live', mph: 0, at: 1 });
  assert.equal(n, 1);
  assert.deepEqual(getGpsMotion(), { status: 'live', mph: 0, at: 1 });
  off();
  publishGpsMotion({ status: 'idle', mph: 0, at: null });
  const geo = readFileSync(join(root, 'src/hooks/useGeolocation.ts'), 'utf8');
  assert.match(geo, /publishGpsMotion\(\{ status: state\.status, mph: state\.mph/);
});

test('Prefer Taps store: default OFF, persisted under storageKey, subscribers told once per change', () => {
  assert.equal(PREFER_TAPS_DEFAULT, false);
  assert.equal(parsePreferTaps(null), false);
  assert.equal(parsePreferTaps('true'), true);
  assert.equal(parsePreferTaps('1'), false);
  resetPreferTapsCache();
  assert.equal(getPreferTaps(), false);
  const kv = new Map<string, string>();
  const store = { getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => void kv.set(k, v) };
  let calls = 0;
  const off = subscribePreferTaps(() => calls++);
  setPreferTaps(true, store);
  setPreferTaps(true, store);
  assert.equal(getPreferTaps(), true);
  assert.equal(kv.get(PREFER_TAPS_KEY), 'true');
  assert.equal(calls, 1);
  setPreferTaps(false, store);
  assert.equal(calls, 2);
  off();
  resetPreferTapsCache();
});

test('Options: ACCESS group carries Prefer Taps (Tuner › Options and CONFIG › OPT), 44 px target, VoiceOver label', () => {
  assert.equal(PREFER_TAPS_DESCRIPTION, 'Turns every drag or slide control into taps.');
  const forge = readFileSync(join(root, 'src/forge/ForgePage.tsx'), 'utf8');
  assert.match(forge, /<AccessOptionsGroup \/>/);
  const setting = readFileSync(join(root, 'src/controls/PreferTapsSetting.tsx'), 'utf8');
  assert.match(setting, />\s*<span>ACCESS<\/span>\s*<small>Accessibility<\/small>/);
  assert.match(setting, /aria-label=\{PREFER_TAPS_LABEL\}/);
  assert.match(setting, /aria-describedby=/);
  const css = readFileSync(join(root, 'src/controls/controls.css'), 'utf8');
  assert.match(css, /\.rf-pref__row \{ display: flex;[^}]*min-height: 48px/, 'the whole full-width label row is the ≥ 44 px target');

  const opt = CJ_CONFIG.options.items;
  const it = opt.find((i) => i.id === 'preferTaps')!;
  assert.ok(it, 'CONFIG › OPT › PREFER TAPS');
  assert.equal(it.group, 'ACCESS');
  assert.equal(opt.find((i) => i.id === 'motion')!.group, 'ACCESS', 'Reduce Motion override sits in ACCESS too');
  const c: ConfigCtx = { park: false, muted: false, look: 'x', map: getMapView(), prefs: parseCjPrefs(null) };
  assert.equal(disabledReason(it, c), undefined, 'usable while moving (not Park-only)');
  assert.deepEqual(runItem(it, c), { type: 'prefer-taps', on: true }, 'absent a11y = default OFF → turns on');
  assert.deepEqual(runItem(it, { ...c, a11y: { preferTaps: true } }), { type: 'prefer-taps', on: false });
  assert.equal(itemAria(it, c), 'Prefer Taps, off. Turns every drag or slide control into taps.');
});
