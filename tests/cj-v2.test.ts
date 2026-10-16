import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featuresFor, hiddenPanel, hiddenRoute } from '../src/features.ts';
import { navLinks } from '../src/components/navLinks.ts';
import { cjNavAction, cjNavItems, hiddenCjPages } from '../src/packs/carrier-jet.nav.ts';
import { applyMapKey, MAP_VIEW_DEFAULT, mapKeys, parseMapView, rangeRings, sweepAngle } from '../src/packs/carrier-jet/mapView.ts';
import { cellKeys } from '../src/packs/carrier-jet/edgeKeys.ts';
import { keyCount } from '../src/packs/carrier-jet/geometry.ts';
import { CJ_CONFIG, CJ_CONFIG_SPEC } from '../src/packs/carrier-jet/configPages.ts';
import { buildConfig, DEFAULT_ROLE, disabledReason, itemAria, PARK_REASON, REQUIRED_IDS, roleLabel, runItem, pageTiles, type ConfigCtx } from '../src/packs/configTable.ts';
import { CJ_PREFS_DEFAULT, parseCjPrefs } from '../src/packs/carrier-jet/cjPrefs.ts';
import { ACCEL_INIT, accelStep, accelTarget } from '../src/packs/carrier-jet/accelBall.ts';
import { cjGps, plateAria } from '../src/packs/carrier-jet/plate.ts';
import { LOOK_LABELS } from '../src/skins/carrier-jet/model.ts';

const ROOT = featuresFor('');
const CJ = featuresFor('carrier-jet');
const css = readFileSync(new URL('../src/packs/mounts/carrier-jet-v2.css', import.meta.url), 'utf8');

// ---------------- hidden features (menu · route · VoiceOver)
test('hidden features: root build unchanged, CJ preview hides all four', () => {
  assert.deepEqual(ROOT, { cjV2: false, soundBuilder: true, proBuilder: true, lab: true, account: true, garage: true });
  assert.deepEqual(CJ, { cjV2: true, soundBuilder: false, proBuilder: false, lab: false, account: false, garage: false });
});
test('hidden features: no menu entry (☰, CJ row, MORE tray) in the CJ preview; root keeps them', () => {
  const to = (f: typeof CJ) => navLinks(f).map((l) => l.to);
  assert.deepEqual(to(ROOT), ['/drive', '/engines', '/customize', '/builder', '/sound-builder', '/diag']);
  assert.deepEqual(to(CJ), ['/drive', '/customize', '/diag']);
  const ids = (f: typeof CJ) => { const r = cjNavItems({ current: 'drive', muted: false, moreOpen: true, features: f }); return [...r.items, ...r.overflow].map((i) => i.id); };
  for (const id of ['sound-builder', 'pro-builder', 'lab', 'account']) {
    assert.ok(ids(ROOT).includes(id), `root ${id}`);
    assert.ok(!ids(CJ).includes(id), `cj ${id}`);
    assert.equal(cjNavAction(id, 'studio', CJ), null);
  }
  assert.deepEqual(ids(CJ), ['drive', 'options', 'mute', 'more']);
});
test('hidden features: routes, deep links and panels redirect to Drive (CJ only)', () => {
  for (const p of ['/sound-builder', '/builder', '/builder/x', '/engines/']) {
    assert.equal(hiddenRoute(p, CJ), true, p);
    assert.equal(hiddenRoute(p, ROOT), false, p);
  }
  assert.equal(hiddenRoute('/diag', CJ), false);
  for (const p of ['studio', 'dashlab', 'account', 'garage']) {
    assert.equal(hiddenPanel(p, CJ), true);
    assert.equal(hiddenPanel(p, ROOT), false);
  }
  const app = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /!FEATURES\.proBuilder\s*\?\s*<Navigate to="\/drive" replace/);
  assert.match(app, /!FEATURES\.soundBuilder \? <Navigate to="\/drive" replace/);
  const forge = readFileSync(new URL('../src/forge/ForgePage.tsx', import.meta.url), 'utf8');
  assert.match(forge, /useState<Panel>\(\(\) => gatePanel\(/, 'deep-link panel gated');
  assert.match(forge, /FEATURES\.account && garage\.active/, 'hidden Account does not override TOP SPD');
});
test('hidden features: no VoiceOver node — CONFIG pages never list them', () => {
  const all = Object.values(CJ_CONFIG).flatMap((p) => p.items.map((i) => `${i.id} ${i.label}`)).join(' ').toLowerCase();
  for (const w of ['sound builder', 'pro builder', 'lab', 'account', 'garage']) assert.ok(!all.includes(w), w);
});

// ---------------- bank: plate far left, then the guard with the NAV row under it
test('bank order: plate < guard (DOM + grid column), NAV row under the guard; Hold to rev / Shutdown to the right', () => {
  const mount = readFileSync(new URL('../src/packs/mounts/CarrierJetMount.tsx', import.meta.url), 'utf8');
  assert.match(mount, /if \(dock\.firstElementChild !== bankEl\) dock\.prepend\(bankEl\)/, 'bank leads the dock DOM (before Hold / Shutdown)');
  assert.match(mount, /\{plate\}\s*<div className="cjm-bank-ab">\{guard\}<\/div>\s*<div className="cjm-bank-nav"/, 'DOM / VoiceOver order: plate, guard, row');
  const G = String.raw`\.rev-dock > \.cjm-bank\[data-cjm-v2\]:is\(\[data-rf-layout='board'\], \[data-rf-layout='window'\]\)`;
  assert.match(css, new RegExp(G + String.raw` > \.cjm-bank-plate \{ grid-column: 1; grid-row: 1 \/ 3;`));
  assert.match(css, new RegExp(G + String.raw` > \.cjm-bank-ab \{ grid-column: 2; grid-row: 1;`));
  assert.match(css, new RegExp(G + String.raw` > \.cjm-bank-nav \{\s*grid-column: 2; grid-row: 2;`));
  assert.match(css, /\.rev-dock > \.cjm-bank\[data-cjm-v2\] \{ order: 0; margin-left: 0 !important;/, 'bank first in the dock');
  assert.match(css, /> \.rev-chip:not\(\.rev-stop\) \{ order: 1;/);
  assert.match(css, /> \.rev-stop \{ order: 2; \}/);
});

// ---------------- RADAR / MAP keys
test('edge-key legends follow the RADAR toggle', () => {
  const off = cellKeys('map', 3, { map: MAP_VIEW_DEFAULT, config: null }).map((k) => k?.legend);
  const on = cellKeys('map', 3, { map: { ...MAP_VIEW_DEFAULT, radar: true }, config: null }).map((k) => k?.legend);
  assert.deepEqual(off, ['ZM+', 'ZM−', 'N/TRK-UP']);
  assert.deepEqual(on, ['RNG+', 'RNG−', 'MODE']);
  assert.deepEqual(cellKeys('speed', 2, { map: MAP_VIEW_DEFAULT, config: null }).map((k) => k?.legend), ['CONFIG', undefined]);
  assert.equal(cellKeys('speed', 3, { map: MAP_VIEW_DEFAULT, config: { tiles: {}, subs: 2 } })[0]?.legend, 'RTN');
  for (const k of mapKeys({ ...MAP_VIEW_DEFAULT, radar: true })) assert.ok(k.ariaLabel.length > 3);
});
test('radar view: default off, persisted parse, ranges 2/5/10, reduce motion fixes the sweep', () => {
  assert.equal(parseMapView(null).radar, false);
  assert.equal(parseMapView('{"radar":true,"range":10,"mode":"terr"}').range, 10);
  assert.equal(parseMapView('garbage').radar, false);
  let v = { ...MAP_VIEW_DEFAULT, radar: true };
  v = applyMapKey(v, 'rngUp'); assert.equal(v.range, 10);
  v = applyMapKey(v, 'rngUp'); assert.equal(v.range, 10);
  v = applyMapKey(v, 'rngDown'); v = applyMapKey(v, 'rngDown'); assert.equal(v.range, 2);
  assert.equal(applyMapKey(v, 'mode').mode, 'terr');
  assert.deepEqual(rangeRings(10).map((r) => r.mi), [2, 5, 10]);
  assert.equal(sweepAngle(1000, false), 90);
  assert.equal(sweepAngle(1000, true), 0);
  assert.equal(keyCount(44), 1);
  assert.equal(keyCount(230), 4);
});

// ---------------- CONFIG
const ctx = (over: Partial<ConfigCtx> = {}): ConfigCtx => ({
  park: true, muted: false, look: 'swing-wing', map: MAP_VIEW_DEFAULT, prefs: { ...CJ_PREFS_DEFAULT },
  ui: { speedUnit: 'mph', hudOpacity: 1, bloomGlow: 0.5, scanlineStrength: 0.5, hudBezel: 0.5, telemetryDensity: 'full', showKeepAliveTip: true, hudScale: 1, jitter: false, jitterAmount: 0.25, background: false, demo: true, media: false, gpsLabel: 'Demo' },
  ...over,
});
test('CONFIG: root tabs RTN · PLT · TLM · SND · MAP · OPT (role from the pack table, default DRIVER)', () => {
  assert.deepEqual(CJ_CONFIG.home.items.map((i) => i.label), ['RTN', 'PLT', 'TLM', 'SND', 'MAP', 'OPT']);
  assert.equal(roleLabel(CJ_CONFIG_SPEC), 'PILOT');
  assert.equal(roleLabel({}), DEFAULT_ROLE);
  assert.equal(buildConfig({ role: 'Captain', looks: [] }).role.title, 'CAPTAIN');
  assert.equal(buildConfig({ looks: [{ id: 'a', label: 'A' }] }).telemetry.items.some((i) => i.group === 'LOOK'), false, 'one look → no LOOK group');
});
test('CONFIG: Park-only items are disabled with a reason while moving; view changes stay live', () => {
  const moving = ctx({ park: false });
  const all = Object.values(CJ_CONFIG).flatMap((p) => p.items);
  const parkOnly = all.filter((i) => i.parkOnly).map((i) => i.id);
  for (const id of ['start', 'fonts', 'colors', 'topSpd', 'idleLo', 'idleHi', 'jitter', 'jitPct', 'media', 'pack', 'gps', 'diag', 'reset']) assert.ok(parkOnly.includes(id), id);
  for (const it of all.filter((i) => i.parkOnly)) {
    assert.equal(disabledReason(it, moving), PARK_REASON, it.id);
    assert.equal(runItem(it, moving), null, it.id);
    assert.match(itemAria(it, moving), /Park to change/);
    assert.equal(disabledReason(it, ctx()), undefined, it.id);
  }
  for (const id of ['radar', 'style', 'rng', 'mode', 'mute', 'calls', 'hiSpd', 'abUnarm', 'swSnd', 'motion', 'speed']) {
    const it = all.find((i) => i.id === id)!;
    assert.equal(disabledReason(it, moving), undefined, id);
    assert.ok(runItem(it, moving), id);
  }
});
test('CONFIG: required set, defaults, notes; VOL read-only SYS; ENGINE STARTUP labels', () => {
  const all = Object.values(CJ_CONFIG).flatMap((p) => p.items);
  for (const id of REQUIRED_IDS) assert.ok(all.some((i) => i.id === id), id);
  const c = ctx();
  const by = (id: string) => all.find((i) => i.id === id)!;
  assert.equal(by('hiSpd').value!(c), 'OFF');
  assert.equal(by('hiSpd').note, 'OBEY SPEED LIMITS');
  assert.equal(by('abUnarm').value!(c), 'SILENT');
  assert.match(by('calls').note!, /TTS/);
  assert.equal(by('vol').value!(c), 'SYS');
  assert.ok(disabledReason(by('vol'), c));
  assert.equal(by('start').label, 'ENGINE STARTUP');
  assert.equal(by('start').value!(c), 'APU');
  assert.equal(by('start').value!(ctx({ prefs: { ...CJ_PREFS_DEFAULT, startMode: 'gndAir' } })), 'STANDARD');
  const text = all.map((i) => [i.label, i.value?.(c), i.aria?.(c), i.note].join(' ')).join(' ') + by('start').aria!(ctx({ prefs: { ...CJ_PREFS_DEFAULT, startMode: 'gndAir' } }));
  assert.ok(!/tomcat|swing wing|f-14/i.test(text), 'no old look / Tomcat names in CONFIG text or VoiceOver');
});
test('CONFIG: looks MATRIX / VECTOR / HOLO keep their ids; saved look + units load unchanged', () => {
  const looks = CJ_CONFIG.telemetry.items.filter((i) => i.group === 'LOOK');
  assert.deepEqual(looks.map((i) => [i.id, i.label]), [['look-carrier-jet', 'MATRIX'], ['look-tomcat', 'VECTOR'], ['look-swing-wing', 'HOLO']]);
  assert.deepEqual(LOOK_LABELS, { 'carrier-jet': 'MATRIX', tomcat: 'VECTOR', 'swing-wing': 'HOLO' });
  const c = ctx({ look: 'tomcat' });
  assert.equal(looks[1].on!(c), true);
  assert.deepEqual(runItem(looks[2], c), { type: 'look', id: 'swing-wing' });
  const speed = CJ_CONFIG.telemetry.items.find((i) => i.id === 'speed')!;
  assert.equal(speed.value!(ctx({ ui: { ...ctx().ui!, speedUnit: 'kph' } })), 'KM/H');
  assert.deepEqual(parseCjPrefs('{"distUnit":"km"}', 'gndAir'), { ...CJ_PREFS_DEFAULT, distUnit: 'km', startMode: 'gndAir' });
});
test('CONFIG: paging keeps RTN in slot 0 and adds NEXT when a page overflows', () => {
  const p = pageTiles(CJ_CONFIG.role.items, 7, 0);
  assert.equal(p.tiles[0], CJ_CONFIG.role.items[0]);
  assert.equal(p.tiles.at(-1), 'next');
  assert.equal(p.subs, 3);
  assert.equal(pageTiles(CJ_CONFIG.home.items, 7, 0).subs, 1);
});

// ---------------- ACCEL BALL / plate
test('ACCEL BALL: lateral from speed × heading rate, centred when stale or stopped', () => {
  let s = ACCEL_INIT;
  s = accelStep(s, { speed: 20, heading: 0, timestamp: 1000 });
  s = accelStep(s, { speed: 20, heading: 10, timestamp: 2000 });
  const t = accelTarget(s, 2100);
  assert.equal(t.live, true);
  assert.ok(t.lat > 0.1 && t.x > 0);
  assert.equal(accelTarget(s, 9000).live, false);
  assert.equal(accelTarget(s, 9000).x, 0);
  assert.equal(cjGps('live'), 'live');
  assert.equal(cjGps('denied'), 'fail');
  assert.equal(cjGps('idle'), 'none');
});

test('no header GPS pill where the GPS+RADAR plate is mounted; the plate aria-label carries GPS state', () => {
  assert.match(css, /\.cjm\[data-cjm-v2\]:not\(\[data-rf-layout='phone-landscape'\]\) \.cj \[data-cj-el='gps-pill'\] \{ display: none; \}/);
  assert.match(css, /\[data-rf-layout='phone-landscape'\] > \.cjm-bank-plate \{ display: none; \}/, 'phone-landscape: no plate, so the pill stays');
  const mount = readFileSync(new URL('../src/packs/mounts/CarrierJetMount.tsx', import.meta.url), 'utf8');
  assert.match(mount, /className="cjm-bank-plate" role="group" aria-label=\{plateAria\(/);
  assert.equal(plateAria(true, 'none', false), 'GPS demo, radar off');
  assert.equal(plateAria(false, 'live', true), 'GPS live, radar on');
  assert.equal(plateAria(false, 'fail', false), 'GPS no fix, radar off');
  assert.equal(plateAria(false, 'acq', false), 'GPS acquiring, radar off');
});

test('CJ v2 gate fixes: garage only via CONFIG PACK, COLORS not via garage, no raw engine id in DIAG', () => {
  const forge = readFileSync(new URL('../src/forge/ForgePage.tsx', import.meta.url), 'utf8');
  assert.match(forge, /a\.panel==='garage'&&!FEATURES\.garage\)setPanelRaw\('garage'\)/);
  assert.match(forge, /FEATURES\.garage\?'Revs':'Pack'/);
  const table = readFileSync(new URL('../src/packs/configTable.ts', import.meta.url), 'utf8');
  const colors = table.split('\n').find((l) => l.includes("id: 'colors'")) ?? '';
  assert.ok(!colors.includes("panel: 'garage'"), colors);
  const diag = readFileSync(new URL('../src/pages/DiagPage.tsx', import.meta.url), 'utf8');
  assert.match(diag, /FEATURES\.garage \? \{ label: 'Engine id'/);
});
