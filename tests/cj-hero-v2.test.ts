/**
 * Carrier Jet hero v2 (heroRail.ts + CjHeroV2.tsx + cj-hero-v2.css): Scott's lamp colour rules (amber cautions, red
 * MASTER WARNING only, green only L/R ENG RUN + APU READY, all steady), lamp state, the N/TRK-UP split cap, the
 * RADAR lever, the START bank, the two hero cells on CJ_GRID, contrast floors from Meghan's measure.json, and the
 * Tesla-perf / reduced-motion source rules (no animation, no transition, no blur, no backdrop-filter).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getJetSystemList, jetAutoStartSteps } from '../src/audio/jetColdStart.js';
import { csTap } from '../src/packs/carrier-jet/coldStart.ts';
import {
  annSize, clearsAfter, heroFits, heroKeyActive, heroMinW, forcedLamps, GREEN_LAMPS, heroCells, HV_ANN_BORDER, HV_BRAND_W, HV_FIT, HV_ANN_CAP, HV_CONTRAST_TARGET, HV_LAMPS, HV_LEGEND, HV_RAIL_H, HV_RAIL_MIN_W,
  HV_RED_LEGEND_LIFT, HV_START, LAMPS_DARK, lampAria, lampColor, lampStates, orientCap, radarApply, radarPos, radarStep, RED_LAMPS, splitCap,
  startPositions, type CapCtx, type LampId, type LampInput,
  abGuardTap, abView, HV_BONUS, HV_TOP, abTap, abAria, qsTap, qsAria, HV_GUARD_CLOSE_MS, HV_RAIL_ORDER, HV_RAIL_SW, HV_RAIL_GEO, HV_RAIL_773, railTargets, railPositions, railFlipAria, railCue, ENG_BULB_LEGEND, topTargets, bonusAria, fsbAria, abArmedAria,
} from '../src/packs/carrier-jet/heroRail.ts';
import { CJ_GRID, type CjAnchors } from '../src/packs/carrier-jet/cells.ts';
import { board2CellsMapFirst } from '../src/packs/carrier-jet/geometry.ts';
import { resolveCells, validateSpec } from '../src/packs/grid/contract.ts';
import { checkGrid } from '../src/packs/grid/hig.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const css = src('packs/mounts/cj-hero-v2.css');
const tsx = src('packs/mounts/CjHeroV2.tsx');

/* ---------------- lamp colours */

test('lamp colours: green only L ENG RUN / R ENG RUN / APU READY, red only MASTER WARNING, every other lamp amber', () => {
  assert.deepEqual([...GREEN_LAMPS].sort(), ['apuReady', 'engRunL', 'engRunR']);
  assert.deepEqual([...RED_LAMPS], ['masterWarning']);
  const want: Record<LampId, string> = { seatbelt: 'amber', masterCaution: 'amber', masterWarning: 'red', engRunL: 'green', engRunR: 'green', engWarnL: 'amber', engWarnR: 'amber', apuReady: 'green' };
  for (const d of HV_LAMPS) {
    assert.equal(lampColor(d.id), want[d.id], d.id);
    assert.equal(d.color, lampColor(d.id), `table colour of ${d.id} agrees with the rule`);
  }
  assert.equal(HV_LAMPS.length, 8);
  assert.equal(new Set(HV_LAMPS.map((d) => d.mark)).size >= 5, true, 'shape marks: colour is never the only cue');
  // only cautions / warnings clear on a tap; good-status lamps never do
  assert.deepEqual(HV_LAMPS.filter((d) => d.clearable).map((d) => d.id), ['seatbelt', 'masterCaution', 'masterWarning']);
});

test('lamps are steady: no flash state in the model, no keyframes / animation / transition in the CSS', () => {
  for (const d of HV_LAMPS) assert.deepEqual(Object.keys(d).filter((k) => /flash|blink|pulse/i.test(k)), [], d.id);
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(noComments, /@keyframes|animation\s*:|transition\s*:/);
  assert.doesNotMatch(noComments, /backdrop-filter|filter\s*:\s*blur|blur\(/, 'no live blur (Tesla perf)');
  const code = tsx.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code, /requestAnimationFrame|setInterval|transition/, 'nothing in the hero animates');
});

const base: LampInput = { cold: true, running: false, batt: false, seatbelt: false, engines: { L: 'off', R: 'off' }, apuOn: false, apuReady: false, caution: false, emergency: false };

test('lampStates: dark cockpit, battery on, running-drive, emergency, cleared, no cold start', () => {
  assert.deepEqual(lampStates(base), LAMPS_DARK);
  const batt = lampStates({ ...base, batt: true, caution: true, seatbelt: true });
  assert.deepEqual(batt, { ...LAMPS_DARK, seatbelt: true, masterCaution: true, masterWarning: true, engWarnL: true, engWarnR: true });
  const oneUp = lampStates({ ...base, batt: true, engines: { L: 'run', R: 'starting' }, apuOn: true, apuReady: true });
  assert.equal(oneUp.engRunL, true); assert.equal(oneUp.engWarnL, false); assert.equal(oneUp.engWarnR, true); assert.equal(oneUp.masterWarning, true); assert.equal(oneUp.apuReady, true);
  const drive = lampStates({ ...base, running: true, batt: true, engines: { L: 'run', R: 'run' }, apuOn: true, apuReady: true });
  assert.deepEqual(drive, { ...LAMPS_DARK, engRunL: true, engRunR: true, apuReady: true }, 'rail v2 running-drive: the three greens, cautions out');
  assert.equal(lampStates({ ...base, running: true, batt: true, engines: { L: 'run', R: 'run' }, emergency: true }).masterWarning, true);
  assert.equal(lampStates({ ...base, apuOn: false, apuReady: true }).apuReady, false, 'APU READY needs the APU on');
  const cleared = lampStates({ ...base, batt: true, caution: true, seatbelt: true, cleared: { seatbelt: true, masterCaution: true, masterWarning: true } });
  assert.deepEqual(cleared, { ...LAMPS_DARK, engWarnL: true, engWarnR: true }, 'clearing never hides the ENG WARN cause lamps');
  assert.deepEqual(lampStates({ ...base, cold: false, running: true, batt: true, caution: true }), { ...LAMPS_DARK, engRunL: true, engRunR: true, apuReady: true });
  assert.deepEqual(lampStates({ ...base, cold: false }), LAMPS_DARK);
});

test('clearsAfter: a cleared lamp stays cleared until it goes out and a NEW occurrence lights it', () => {
  const lit = { ...LAMPS_DARK, masterWarning: true };
  assert.deepEqual(clearsAfter(lit, lit, { masterWarning: true }), { masterWarning: true });
  assert.deepEqual(clearsAfter(LAMPS_DARK, lit, { masterWarning: true }), {}, 'new occurrence re-lights');
  assert.deepEqual(clearsAfter(lit, LAMPS_DARK, { masterWarning: true, seatbelt: false }), { masterWarning: true });
});

test('forcedLamps: ?lamps=cw lights the five caution / warning caps only', () => {
  const f = forcedLamps('?lamps=cw')!;
  assert.deepEqual(Object.entries(f).filter(([, v]) => v).map(([k]) => k).sort(), ['engWarnL', 'engWarnR', 'masterCaution', 'masterWarning', 'seatbelt']);
  assert.ok(Object.entries(f).filter(([, v]) => v).every(([k]) => lampColor(k as LampId) !== 'green'));
  assert.equal(forcedLamps(''), null);
  assert.equal(forcedLamps('?lamps=all'), null);
});

test('VoiceOver: every lamp label names the lamp, lit colour or off, and the tap action when clearable', () => {
  const mw = HV_LAMPS.find((d) => d.id === 'masterWarning')!;
  assert.equal(lampAria(mw, true), 'Master warning, lit red. Tap to clear');
  assert.equal(lampAria(mw, false), 'Master warning, off');
  assert.equal(lampAria(HV_LAMPS.find((d) => d.id === 'apuReady')!, true), 'A P U ready, lit green');
  // every interactive element / lamp in the hero carries a label
  const buttons = tsx.split('<button').slice(1).map((b) => b.slice(0, b.search(/\/>|<\/button>/) + 9));
  assert.ok(buttons.length >= 10);
  // a label attribute, or (the sr-only emergency stop) its own text as the name
  for (const b of buttons) assert.ok(/aria-label=/.test(b) || /rf-sr-only[\s\S]*>[A-Z][a-z ,]+<\/button>/.test(b), b.slice(0, 80));
  assert.match(tsx, /role="img" aria-label=\{lampAria\(d, lit\)\}/);
  assert.match(tsx, /role="group" aria-label="Start rail"/);
});

/* ---------------- split caps */

const ctx: CapCtx = { zoom: 2, range: 10, northUp: true, terr: true, radar: false, wx: false, driveActive: true };

test('N/TRK-UP is a split cap: ORIENT over the current state, lit field follows the toggle', () => {
  assert.deepEqual(orientCap(true), { top: 'ORIENT', bottom: 'N-UP', lit: true });
  assert.deepEqual(orientCap(false), { top: 'ORIENT', bottom: 'TRK-UP', lit: true });
  assert.deepEqual(splitCap('orient', ctx), orientCap(true));
  assert.deepEqual(splitCap('orient', { ...ctx, northUp: false }), orientCap(false));
  // the legend box is backlit in BOTH orientations (like MAP/TERR when lit); other keys keep their own state
  assert.equal(heroKeyActive('orient', false), true);
  assert.equal(heroKeyActive('orient', true), true);
  assert.equal(heroKeyActive('mode', false), false);
  assert.equal(heroKeyActive('mode', true), true);
  assert.match(src('packs/mounts/CjV2Layer.tsx'), /active=\{hero \? heroKeyActive\(k\.id, !!k\.active\) : !!k\.active\}/, 'live board (no hero) unchanged');
});

test('split caps: zoom / range values, MAP/TERR, WX, DRV, inert keys', () => {
  assert.deepEqual(splitCap('zoomIn', ctx), { top: '+', bottom: '2 MI', lit: false });
  assert.deepEqual(splitCap('rngDown', ctx), { top: '\u2212', bottom: '10 MI', lit: false });
  assert.deepEqual(splitCap('mode', ctx), { top: 'MAP', bottom: 'TERR', lit: true });
  assert.deepEqual(splitCap('mode', { ...ctx, terr: false }), { top: 'MAP', bottom: 'OFF', lit: false });
  assert.deepEqual(splitCap('mode', { ...ctx, radar: true, terr: false }), { top: 'MODE', bottom: 'MAP', lit: true });
  assert.deepEqual(splitCap('wx', { ...ctx, wx: true }), { top: 'WX', bottom: 'ON', lit: true });
  assert.deepEqual(splitCap('drive', { ...ctx, driveActive: false }), { top: 'DRV', bottom: 'BOARD', lit: false });
  assert.equal(splitCap('nope', ctx), null);
});

/* ---------------- RADAR + START */

test('RADAR 3-position: position from state, apply, one step at a time with end-stop reasons', () => {
  assert.equal(radarPos(false, true), 'dn');
  assert.equal(radarPos(true, false), 'up');
  assert.equal(radarPos(true, true), 'mid');
  for (const p of ['up', 'mid', 'dn'] as const) { const a = radarApply(p); assert.equal(radarPos(a.radar, a.wx), p); }
  assert.deepEqual(radarStep('dn', 1), { pos: 'mid' });
  assert.deepEqual(radarStep('mid', 1), { pos: 'up' });
  assert.deepEqual(radarStep('up', 1), { pos: 'up', reason: 'Radar already at MX' });
  assert.deepEqual(radarStep('dn', -1), { pos: 'dn', reason: 'Radar already at OFF' });
});

test('START bank: rail v2 order, GEN follows the engines, no cold start mirrors running', () => {
  assert.deepEqual(HV_START.map((s) => s.label), ['BATT', 'APU', 'L ENG', 'R ENG', 'GEN', 'NAV']);
  assert.equal(HV_START.find((s) => s.id === 'gen')!.system, null);
  const p = startPositions({ cold: true, running: false, on: { batt: true, inertialNav: true }, engines: { L: 'starting', R: 'off' } });
  assert.deepEqual(p, { batt: true, apu: false, engL: true, engR: false, gen: false, nav: true });
  assert.equal(startPositions({ cold: true, running: true, on: {}, engines: { L: 'off', R: 'run' } }).gen, true);
  assert.deepEqual(Object.values(startPositions({ cold: false, running: true, on: {}, engines: { L: 'off', R: 'off' } })), [true, true, true, true, true, true]);
});

/* ---------------- grid cells */

const R = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const ANCHORS: CjAnchors = {
  speed: R(22, 154, 132, 186), mach: R(158, 154, 120, 96), rpm: R(158, 250, 120, 90), vdi: R(410, 154, 132, 186),
  sweep: R(974, 154, 236, 186), eng: R(22, 382, 256, 156), compass: R(282, 382, 132, 156),
};

test('hero cells on CJ_GRID: declared, valid, pass the HIG floors, measured boxes win, reserved slots otherwise', () => {
  assert.deepEqual(validateSpec(CJ_GRID), []);
  for (const layout of ['board', 'window'] as const) {
    const rects = resolveCells(CJ_GRID, layout, { anchors: ANCHORS, mapFirst: true, hero: { layout } })!;
    assert.ok(rects.ann && rects.rail, layout);
    assert.deepEqual(checkGrid(CJ_GRID, rects, { layout }), [], layout);
    assert.deepEqual(rects.map, board2CellsMapFirst(ANCHORS).map, 'the hero never moves or squashes the map cell');
    assert.equal(rects.rail.height, HV_RAIL_H);
    assert.ok(rects.rail.width >= HV_RAIL_MIN_W[layout]);
    assert.deepEqual({ w: rects.ann.width, h: rects.ann.height }, annSize(layout));
  }
  const ann = R(334, 17, 898, 54), rail = R(24, 570, 1120, 118);
  const m = resolveCells(CJ_GRID, 'board', { anchors: ANCHORS, mapFirst: true, hero: { ann, rail } })!;
  assert.deepEqual(m.ann, ann); assert.deepEqual(m.rail, rail);
  assert.equal(resolveCells(CJ_GRID, 'portrait', { anchors: ANCHORS, mapFirst: true }), null, 'phones keep the skin bank');
  assert.ok(HV_ANN_CAP.window.w >= 44 && HV_ANN_CAP.window.h >= 44 && HV_ANN_CAP.board.h >= 44);
  // a squashed rail is reported
  const thin = { ...m, rail: R(24, 570, 600, 100) };
  assert.ok(checkGrid(CJ_GRID, thin, { layout: 'board' }).some((i) => i.cell === 'rail' && i.rule === 'min-size'));
  const slot = resolveCells(CJ_GRID, 'board', { anchors: ANCHORS, mapFirst: true })!;
  assert.equal(slot.rail.top, Math.max(slot.eng.top + slot.eng.height, slot.compass.top + slot.compass.height) + 12, 'reserved rail slot under the board');
  assert.deepEqual(heroCells(slot, { rail }).rail, rail);
});

/* ---------------- contrast (measure.json floors, worst-case pixels) */

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (top: number[], a: number, under: number[]) => top.map((t, i) => t * a + under[i] * (1 - a));
const softLight = (b: number, s: number) => (s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b));
/** Brightest pixel of the frost-128 diffuser tile (224 / 255): the worst-case lift its soft-light layer can add. */
const FROST_MAX = 224 / 255;

test('lit / unlit legends hold measure.json’s per-cap floors (HV_CONTRAST_TARGET) (and 4.5) against the worst-case lens pixel', () => {
  const face = hex(css.match(/\.cjhv-cap \{[\s\S]*?linear-gradient\(180deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)/)![1]); // the lighter (top) stop
  const frost = Number(css.match(/\.cjhv-cap\[data-lit\]::after \{[^}]*opacity: ([0-9.]+)/)![1]);
  for (const color of ['amber', 'red', 'green'] as const) {
    // the wash's brightest (centre) stop and the legend colour, read from the CSS the build ships
    const wash = css.match(new RegExp(`\\[data-color='${color}'\\] \\{ background: radial-gradient\\([^,]+, rgba\\((\\d+), (\\d+), (\\d+), ([0-9.]+)\\)`))!;
    const legend = css.match(new RegExp(`\\[data-color='${color}'\\] \\.cjhv-lg \\{ color: (#[0-9a-f]{6})`))![1];
    assert.equal(legend.toUpperCase(), HV_LEGEND[color], `${color} legend matches heroRail.ts`);
    const washed = over([+wash[1] / 255, +wash[2] / 255, +wash[3] / 255], +wash[4], face);
    const worst = washed.map((b) => softLight(b, FROST_MAX) * frost + b * (1 - frost));
    const r = ratio(hex(legend), worst);
    assert.ok(r >= HV_CONTRAST_TARGET[color] && r >= 4.5, `${color}: ${r.toFixed(2)} vs floor ${HV_CONTRAST_TARGET[color]}`);
  }
  const unlit = ratio(hex(HV_LEGEND.unlit), face);
  assert.ok(unlit >= HV_CONTRAST_TARGET.unlit, `unlit ${unlit.toFixed(2)}`);
  assert.ok(ratio(hex(HV_RED_LEGEND_LIFT), hex('#3a2a28')) > ratio(hex(HV_LEGEND.red), hex('#3a2a28')), 'the lift is lighter');
  // Korry split caps: black on the lit cyan field, grey on the dark upper field
  assert.ok(ratio(hex('#04141c'), hex('#5fd3ff')) >= 4.5);
  assert.ok(ratio(hex('#c9cdd0'), hex('#34383c')) >= 4.5 && ratio(hex('#a9afb4'), hex('#34383c')) >= 4.5);
});

test('HIG source floors: 11 px text minimum in the hero CSS', () => {
  const sizes = [...css.matchAll(/(?:font(?:-size)?:[^;]*?)(\d+(?:\.\d+)?)px\//g), ...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);
  assert.ok(sizes.length > 0);
  for (const s of sizes) assert.ok(s >= 11, `font ${s}px`);
});

/* ---------------- no-WebGL fallback */

test('no WebGL: the hero draws nothing with WebGL, and the map degrades to its NO MAP DATA plate instead of throwing', async () => {
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  for (const [f, s] of [['CjHeroV2.tsx', tsx], ['cj-hero-v2.css', css], ['heroRail.ts', src('packs/carrier-jet/heroRail.ts')]] as const) {
    assert.doesNotMatch(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /getContext|webgl|<canvas|OffscreenCanvas/i, `${f}: baked art only, MapLibre stays the one WebGL layer`);
  }
  assert.doesNotMatch(mount, /getContext|webgl/i);
  // MapLibre is built inside the lazy import's .then; a failed WebGL context throws there and lands in .catch → 'error'
  const live = src('packs/mounts/CjLiveMap.tsx');
  const at = live.indexOf('new ml.Map(');
  assert.ok(at > 0);
  const tail = live.slice(at);
  assert.ok(tail.indexOf(".catch(() => setTiles('error'))") > 0 && tail.indexOf(".catch(() => setTiles('error'))") < tail.indexOf('useEffect('), 'map construction is guarded');
  const { cjMapStatus } = await import('../src/skins/carrier-jet/map/style.ts');
  assert.equal(cjMapStatus({ gps: true, demo: false, online: true, tilesFailed: 'error' }), 'NO MAP DATA');
});

test('width guard: hero only where the plate clears the brand and the rail fits (1280 / 773 keep it; fine-pointer phones do not)', () => {
  // plate = annSize + border + brand + gap + insets; rail (v3.1: no SHELF key) = min width + dock insets
  assert.equal(annSize('board').w + 2 * HV_ANN_BORDER, 898);
  assert.equal(annSize('window').w + 2 * HV_ANN_BORDER, 598);
  assert.equal(heroMinW('board'), Math.max(898 + HV_BRAND_W + HV_FIT.brandGap + 48, HV_RAIL_MIN_W.board + 48));
  assert.equal(heroMinW('board'), 1236);
  assert.equal(heroMinW('window'), 757);
  assert.ok(heroFits(1280, 'board') && heroFits(1256, 'board') && heroFits(773, 'window'));
  for (const w of [390, 650, 667, 756]) assert.equal(heroFits(w, 'window'), false, `window ${w}`);
  for (const w of [390, 650, 1024, 1235]) assert.equal(heroFits(w, 'board'), false, `board ${w}`);
  // a wider measured brand raises the plate bound; a missing / zero measure falls back to HV_BRAND_W
  assert.equal(heroFits(773, 'window', 200), false);
  assert.equal(heroFits(773, 'window', 0), true);
  const mount = src('packs/mounts/CarrierJetMount.tsx');
  assert.match(mount, /const hero = row && tesla && heroRoom;/);
  assert.match(mount, /addEventListener\('resize', check\)/);
  assert.match(css, /\.cjhv-ann \{[^}]*max-width: calc\(100% - 108px\)/);
  assert.equal(HV_BRAND_W + HV_FIT.brandGap, 108);
});

/* ---------------- v3.1 top plate (push 1) */

test('v3.1 top plate: bonus row order, MASTER CAUTION/WARNING only, lights row, 44pt targets, no ENG WARN / APU READY', () => {
  assert.deepEqual(HV_BONUS.map((b) => b.label), ['AVION', 'INS', 'POS LT', 'BEACON', 'L IDLE', 'R IDLE', 'HYD', 'CANOPY', 'OXY']);
  for (const l of ['board', 'window'] as const) {
    const g = HV_TOP[l];
    assert.equal(g.cols.length, HV_BONUS.length, `${l}: one column per bonus switch`);
    for (const t of topTargets(l)) assert.ok(t.w >= 44 && t.h >= 44, `${l}: ${t.name} is ${t.w}x${t.h}`);
    // row order: switches, then the masters, then the lights row (bulb, FASTEN SEAT BELT, AB ARMED, THEMES) left to right
    const lastCol = g.cols[g.cols.length - 1];
    assert.ok(g.mc.x >= lastCol.x + lastCol.w && g.mw.x > g.mc.x, `${l}: masters right of the switches`);
    assert.ok(g.bulb.cy > g.mc.y + g.mc.h && g.fsb.x > g.bulb.cx && g.ab.x > g.fsb.x && g.themes.x > g.ab.x, `${l}: lights row order`);
  }
  const p0 = tsx.indexOf('export function TopPlate');
  const plate = tsx.slice(p0, tsx.indexOf('\nexport ', p0 + 10) >>> 0 || undefined);
  assert.ok(plate.length > 100, 'TopPlate exists');
  for (const gone of ['engWarnL', 'engWarnR', 'apuReady', 'engRunL', 'engRunR']) assert.ok(!plate.includes(gone), `plate has no ${gone}`);
  assert.match(plate, /masterCaution/);
  assert.match(plate, /masterWarning/);
  assert.equal(bonusAria(HV_BONUS[0], false, 'on'), 'Avionics on, now off');
  assert.equal(fsbAria(true), 'Fasten seat belt light, lit amber');
  assert.equal(abArmedAria(true, false), 'A B armed light, lit amber');
  assert.match(plate, /Themes: opens the theme picker/);
  // the plate replaces the skin's LOOK row (pack CSS only, the skin is untouched)
  assert.match(css, /\.rev-viewport:has\(\.cjhv-top\)[^{]*\.cj-tabs\s*\{\s*visibility:\s*hidden/);
});

test('AFTERBURNER: AB ARMED lamp never lit while the switch reads SAFE (one value drives bat, lid and lamps)', () => {
  for (const armed of [false, true]) for (const guardOpen of [false, true]) {
    const v = abView(armed, guardOpen);
    // the switch reads SAFE when the bat is down or a closed lid covers it; the lamp is lit only at a visible ARM
    const readsArm = v.pos === 'up' && v.lidOpen;
    assert.equal(v.lamp, readsArm, `armed=${armed} guardOpen=${guardOpen}`);
  }
  // fresh storage: getAbArmed() is SAFE -> guard closed, bat down, lamp dark (and a saved ARM shows the lid open)
  const ab = readFileSync(new URL('../src/packs/abArmed.ts', import.meta.url), 'utf8');
  assert.match(ab, /current = readAbArmed\(\) \?\? false;/, 'getAbArmed defaults to SAFE');
  assert.match(ab, /setAfterburnerArmed\(readAbArmed\(kv\) \?\? false\)/, 'engine gets SAFE on a fresh load');
  assert.deepEqual(abView(false, false), { pos: 'dn', lidOpen: false, lamp: false });
  assert.deepEqual(abView(true, false), { pos: 'up', lidOpen: true, lamp: true });
  assert.deepEqual(abGuardTap(false, false), { open: true, disarm: false }, 'closed lid: tap lifts');
  assert.deepEqual(abGuardTap(true, false), { open: false, disarm: true }, 'closing the lid over ARM throws SAFE');
  assert.deepEqual(abGuardTap(false, true), { open: false, disarm: false });
  const mount = readFileSync(new URL('../src/packs/mounts/CarrierJetMount.tsx', import.meta.url), 'utf8');
  assert.match(mount, /<TopPlate[\s\S]*?armed=\{ab\.lamp\}/, 'plate lamp reads the switch view');
  assert.match(mount, /<HeroRail[\s\S]*?armed=\{ab\.lamp\}[\s\S]*?guardOpen=\{ab\.lidOpen\}/, 'rail bat + lid read the same view');
});

/* ---------------- v3.1 push 2: bottom rail */

const mountSrc = () => src('packs/mounts/CarrierJetMount.tsx');

test('v3.1 rail: Dan\'s jetAutoStartSteps order, every start-up switch on the board (rail + plate), no SHELF', () => {
  const sysOf = (p: string) => (p === 'source' ? 'apu' : HV_RAIL_SW.find((d) => d.id === p)?.system ?? null);
  for (const l of ['board', 'window'] as const) {
    const order = HV_RAIL_ORDER[l].map(sysOf).filter((x): x is string => !!x);
    // Dan's APU auto-start switches each system ON in this order; the rail keeps it (773: within each zone, NOTES.md)
    const dan = [...new Set(jetAutoStartSteps('apu').flatMap((s) => ('system' in s && s.on ? [s.system as string] : [])))];
    assert.deepEqual(dan, ['batt', 'apu', 'seatbelt', 'engL', 'engR']);
    const pos = dan.map((d) => order.indexOf(d));
    assert.ok(pos.every((p) => p >= 0), `${l}: every auto-start switch is on the rail`);
    if (l === 'board') assert.deepEqual([...pos].sort((a, b) => a - b), pos, 'board: one line in Dan\'s order');
  }
  assert.deepEqual(HV_RAIL_ORDER.board, ['gps', 'radar', 'ab', 'batt', 'source', 'xbleed', 'seatbelt', 'fuelL', 'ignL', 'engL', 'fuelR', 'ignR', 'engR', 'gen', 'nav', 'qs', 'estop', 'push']);
  // every switchable start-up system (both start modes) is on the rail, the SOURCE lever, or the top plate
  const onBoard = new Set([...HV_RAIL_SW.map((d) => d.system), ...HV_BONUS.map((b) => b.system), 'apu', 'aircart', 'masterCaution', 'quickStartGuard', 'quickStart', 'emergencyStop']);
  for (const v of ['apu', 'aircart'] as const) for (const e of getJetSystemList(v)) assert.ok(onBoard.has(e.id), `${e.id} has a switch on the board`);
  const m = mountSrc();
  assert.match(m, /hero v3\.1: every switch is on the rail; no SHELF key and no shelf pop-up/);
  assert.match(m, /\{!hero && spds && coldOn && cold\.render\.shelf\(/, 'no shelf pop-up with the hero');
  assert.doesNotMatch(tsx, /cjhv-abcap|shelfKey/, 'no AB ARMED cap and no SHELF key on the rail');
});

test('v3.1 rail: every target >= 44 pt at both sizes; geometry matches the mock (1280 module widths, 773 zones)', () => {
  for (const l of ['board', 'window'] as const) for (const t of railTargets(l)) assert.ok(t.w >= 44 && t.h >= 44, `${l}: ${t.name} ${t.w}x${t.h}`);
  assert.deepEqual(HV_RAIL_GEO.board.mods.map((m) => m.w), [52, 72, 88, 240, 176, 176, 112, 100, 68, 68]);
  assert.deepEqual(Object.values(HV_RAIL_773.zones), [40, 62, 114, 333, 70, 52, 52]);
  // engraved group titles (NOTES.md / mock): POWER · START AIR · CABIN · L ENG · R ENG · ELEC · NAV
  assert.deepEqual(HV_RAIL_GEO.board.mods.flatMap((m) => m.titles?.map((t) => t.t) ?? []), ['POWER', 'START AIR', 'CABIN', 'L ENG', 'R ENG', 'ELEC · NAV']);
  assert.match(css, /\.cjhv-rail \{[^}]*tabular-nums lining-nums/);
});

test('v3.1 rail: AFTERBURNER two taps at every size (773 one target, still two taps); ~5 s auto-close; works in Drive', () => {
  assert.equal(HV_GUARD_CLOSE_MS, 5000);
  assert.equal(abTap.length, 3, 'no Park input: the guards hold the same way in Drive');
  // board: guard band then switch band
  let armed = false, open = false;
  const step = (t: 'guard' | 'switch' | 'one') => { const r = abTap(armed, open, t); open = r.open; if (r.arm !== null) armed = r.arm; return r; };
  assert.equal(step('switch').arm, null, 'closed guard: the switch band never arms');
  assert.equal(armed, false);
  step('guard'); assert.equal(open, true); assert.equal(armed, false, 'tap 1 only lifts');
  step('switch'); assert.equal(armed, true, 'tap 2 arms');
  step('guard'); assert.equal(armed, false, 'closing the lid over ARM throws SAFE'); assert.equal(open, false);
  // 773: one 66x52 target, two taps: lift, then ARM; at ARM one tap = SAFE + guard closed
  armed = false; open = false;
  step('one'); assert.deepEqual([open, armed], [true, false], '773 tap 1 lifts only');
  step('one'); assert.deepEqual([open, armed], [true, true], '773 tap 2 arms');
  step('one'); assert.deepEqual([open, armed], [false, false]);
  assert.equal(abAria(false, false, 'guard'), 'Afterburner guard: closed, tap to lift');
  assert.equal(abAria(false, true, 'guard'), 'Afterburner guard: open, tap to close');
  assert.equal(abAria(true, false, 'switch'), 'Afterburner: ARM, tap for SAFE');
  assert.equal(abAria(false, false, 'switch'), 'Afterburner: SAFE, lift the guard first');
  assert.equal(abAria(false, false, 'one'), 'Afterburner: SAFE, guard closed. Tap to lift the guard');
  const m = mountSrc();
  assert.match(m, /if \(!guardOpen \|\| armed\) return;\s*const t = setTimeout\(\(\) => setGuardOpen\(false\), HV_GUARD_CLOSE_MS\);/, 'lifted SAFE lid closes itself');
  const onAb = m.slice(m.indexOf('onAb={'), m.indexOf('rail={railState}'));
  assert.doesNotMatch(onAb, /park/i, 'AB two-step does not depend on Park / Drive');
  assert.match(tsx, /onClick=\{\(\) => p\.onAb\('one'\)\}/);
  assert.match(tsx, /onClick=\{\(\) => p\.onAb\('guard'\)\}/);
  assert.match(tsx, /onClick=\{\(\) => p\.onAb\('switch'\)\}/);
});

test('v3.1 rail: QUICK START two steps (guard band, PRESS band, each 44+), auto-close ~5 s, instant lid, works in Drive', () => {
  assert.equal(qsTap.length, 3, 'no Park input');
  assert.deepEqual(qsTap(false, 'start', false), { open: false, start: false, say: 'Lift the quick start guard first' });
  assert.deepEqual(qsTap(false, 'guard', false).open, true);
  assert.deepEqual(qsTap(true, 'start', false), { open: false, start: true, say: '' }, 'tap 2 starts and the guard shuts');
  assert.equal(qsTap(true, 'guard', false).open, false);
  assert.equal(qsTap(false, 'guard', true).open, false, 'engines running: never opens');
  assert.equal(qsAria('guard', false, false), 'Quick start guard: closed, tap to lift');
  assert.equal(qsAria('guard', true, false), 'Quick start guard: open, tap to close');
  assert.equal(qsAria('start', true, false), 'Quick start: press START');
  assert.equal(qsAria('start', false, false), 'Quick start: lift the guard first');
  assert.match(tsx, /if \(!qsUp\) return;\s*const t = setTimeout\(\(\) => setQsUp\(false\), HV_GUARD_CLOSE_MS\);/);
  assert.match(tsx, /GUARD OPEN/);
  assert.match(tsx, /LIFT · PRESS/);
});

test('v3.1 rail: 773 middle row = one flip target each with aria-pressed + on/off in the label; START/RUN bulbs; steady cue', () => {
  const batt = HV_RAIL_SW.find((d) => d.id === 'batt')!;
  assert.equal(railFlipAria(batt, true), 'Battery, on. Tap to turn off');
  assert.equal(railFlipAria(batt, false), 'Battery, off. Tap to turn on');
  assert.match(tsx, /aria-label=\{railFlipAria\(s\.d, s\.on\)\} aria-pressed=\{s\.on\}/);
  for (const [k, c] of Object.entries(HV_RAIL_773.mid)) assert.ok(c.w >= 44 && c.h >= 44, k);
  assert.deepEqual(ENG_BULB_LEGEND, { off: 'OFF', start: 'START', run: 'RUN' });
  const r = railPositions({ cold: true, running: false, on: { batt: true }, engines: { L: 'starting', R: 'run' } });
  assert.deepEqual(r.bulb, { L: 'start', R: 'run' });
  assert.equal(r.on.gen, true);
  assert.equal(railCue('apuGuard'), 'source');
  assert.equal(railCue('fuelPumpL'), 'fuelL');
  // the waiting-on-a-prerequisite cue is a steady legend (no animation anywhere in the hero CSS)
  assert.match(css, /\.cjhv-col\[data-cue\] \.cjhv-rname \{ color: #8dffad;/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /@keyframes|animation|transition/);
});

test('v3.1: NAV (rail) and INS (plate) are one switch: flipping either flips both; NAV toggles in Drive', () => {
  const nav = HV_RAIL_SW.find((d) => d.id === 'nav')!;
  const ins = HV_BONUS.find((b) => b.id === 'ins')!;
  assert.equal(nav.system, 'inertialNav');
  assert.equal(ins.system, nav.system, 'same Dan system');
  for (const v of [true, false]) {
    const r = railPositions({ cold: true, running: false, on: { inertialNav: v }, engines: { L: 'off', R: 'off' } });
    assert.equal(r.on.nav, v, 'rail NAV reads inertialNav');
  }
  const m = mountSrc();
  assert.match(m, /bonus=\{cold\.sys\.on as Record<string, boolean>\}/, 'plate INS reads the same cold.sys.on');
  assert.match(m, /onBonus=\{\(sys, on\) => cold\.railTap\(sys, on\)\}/);
  assert.match(m, /cold\.railTap\(d\.system, on\)/, 'rail NAV taps the same system');
  // in Drive (park false) with avionics on, NAV switches; without avionics it says why
  const list = getJetSystemList('apu');
  const base = { list, checklist: [], mode: 'apu', guards: {}, held: null, park: false, cautionReset: false, auto: false } as never as Parameters<typeof csTap>[2];
  const sys = (on: Record<string, boolean>) => ({ ...base, sys: { on, engines: { L: 'off', R: 'off' }, apuReady: false, cartReady: false, emergency: false } } as never as Parameters<typeof csTap>[2]);
  assert.deepEqual(csTap('inertialNav', true, sys({ batt: true, avionics: true })), { type: 'set', system: 'inertialNav', on: true });
  assert.deepEqual(csTap('inertialNav', true, sys({ batt: true })), { type: 'none', reason: 'Avionics first' });
});
