import test from 'node:test';
import assert from 'node:assert/strict';
import { getJetChecklist, getJetSystemList } from '../src/audio/jetColdStart.js';
import {
  CS_DARK, CS_PARK_REASON, CS_SHORT, csAutoNext, csHoldRelease, csHoldStart, csSequence, csTap, csView, csVariant, parkStep,
  type CsInput, type CsMode, type CsSystems,
} from '../src/packs/carrier-jet/coldStart.ts';
import { PULL_REST, pullAction, pullDown, pullMove, pullReset, pullUp, type PullState } from '../src/packs/carrier-jet/pullGesture.ts';
import { getCjPrefs, parseCjPrefs, resetCjPrefsCache, setCjPrefs, START_MODE_KEY } from '../src/packs/carrier-jet/cjPrefs.ts';
import { MAP_VIEW_DEFAULT, parseMapView } from '../src/packs/carrier-jet/mapView.ts';
import { buildConfig, disabledReason, PARK_REASON, type ConfigCtx } from '../src/packs/configTable.ts';
import { CJ_CONFIG_SPEC } from '../src/packs/carrier-jet/configPages.ts';

const input = (mode: CsMode, sys: Partial<CsSystems> = {}, extra: Partial<CsInput> = {}): CsInput => ({
  list: getJetSystemList(csVariant(mode)),
  checklist: getJetChecklist(csVariant(mode)).startup,
  mode,
  sys: { ...CS_DARK, ...sys, on: { ...(sys.on ?? {}) }, engines: { ...(sys.engines ?? CS_DARK.engines) } },
  guards: {},
  held: null,
  park: true,
  ...extra,
});

test('APU sequence: power → fuel → APU ARM → APU START → L ENG → R ENG → APU off → systems → lights → caution', () => {
  const seq = csSequence(getJetSystemList('apu'), 'apu').map((s) => s.key);
  assert.deepEqual(seq, [
    'batt', 'avionics', 'inertialNav', 'fuelPumpL', 'fuelPumpR', 'apuGuard', 'apu', 'ignL', 'engL', 'throttleL', 'ignR', 'engR', 'throttleR',
    'apu:off', 'seatbelt', 'hydraulics', 'canopy', 'oxygen', 'navLights', 'anticollision', 'masterCaution',
  ]);
});

test('GND AIR sequence: R engine on cart air first, then crossbleed to L, then cart / crossbleed off', () => {
  const seq = csSequence(getJetSystemList('aircart'), 'gndAir').map((s) => s.key);
  assert.deepEqual(seq, [
    'batt', 'avionics', 'inertialNav', 'aircart', 'fuelPumpR', 'ignR', 'engR', 'throttleR', 'crossbleed', 'fuelPumpL', 'ignL', 'engL', 'throttleL',
    'crossbleed:off', 'aircart:off', 'seatbelt', 'hydraulics', 'canopy', 'oxygen', 'navLights', 'anticollision', 'masterCaution',
  ]);
  // the aircart block is in POWER, as in Dan's list
  assert.equal(getJetSystemList('aircart').find((e: { id: string }) => e.id === 'aircart')?.group, 'POWER');
});

test('dark cockpit: only BATT is live, everything else locked with a reason; BATT is next', () => {
  const v = csView(input('apu'));
  assert.equal(v.next?.id, 'batt');
  assert.equal(v.switches.batt.disabled, undefined);
  assert.equal(v.switches.batt.cue, 'next');
  assert.equal(v.switches.fuelPumpL.disabled, true);
  assert.equal(v.switches.fuelPumpL.disabledReason, 'Battery first');
  assert.equal(v.switches.engL.disabledReason, 'Battery first');
  assert.equal(v.switches.oxygen.disabled, undefined); // no requires
  assert.equal(v.apu.disabled, true);
  assert.equal(v.checklist?.text, 'BATT Switch, ON'); // pamphlet wording (Meghan's plan), same line as the card
  assert.equal(v.checklist?.code, '1a');
});

test('short engraved labels; Dan long labels as the announcement name; VoiceOver name = sheet line with the code', () => {
  const v = csView(input('apu'));
  assert.equal(v.switches.engL.label, 'L ENG');
  assert.equal(v.switches.engL.name, 'L engine start');
  assert.equal(v.switches.engL.ariaLabel, 'Left engine start, step 4 b');
  assert.equal(v.switches.fuelPumpL.label, 'FUEL L');
  assert.equal(v.switches.fuelPumpL.name, 'L fuel pump');
  assert.equal(v.switches.batt.ariaLabel, 'Battery switch, step 1 a, next');
  for (const [id, l] of Object.entries(CS_SHORT)) for (const w of l.split(' ')) assert.ok(w.length <= 8, `${id} ${l}`);
});

test('requires gate ON: engines need APU READY (not just APU on), the cover, and their pump + ignition', () => {
  const on = { batt: true, avionics: true, inertialNav: true, fuelPumpL: true, fuelPumpR: true, ignL: true, apu: true };
  let inp = input('apu', { on, apuReady: false, apuSpool: 0.5 }, { guards: { apuGuard: true, engL: true } });
  assert.equal(csView(inp).switches.engL.disabledReason, 'APU ready first');
  assert.equal(csView(inp).apu.ready, 'spooling');
  assert.equal(csView(inp).apu.cue, 'busy');
  inp = input('apu', { on, apuReady: true }, { guards: { apuGuard: true, engL: true } });
  assert.equal(csView(inp).switches.engL.disabled, undefined);
  assert.equal(csView(inp).next?.id, 'engL');
  assert.deepEqual(csHoldStart('engL', inp), { type: 'set', system: 'engL', on: true });
  assert.equal(csHoldStart('engL', { ...inp, guards: { apuGuard: true } }).type, 'none'); // cover down
  assert.equal(csTap('engL', true, inp).type, 'none'); // a tap never cranks: hold
  assert.deepEqual(csTap('engL', false, inp), { type: 'set', system: 'engL', on: false }); // off by tap is fine
});

test('hold: released before READY / RUN aborts, after latches', () => {
  assert.deepEqual(csHoldRelease('apu', { ...CS_DARK, on: { apu: true }, apuReady: false }), { type: 'set', system: 'apu', on: false });
  assert.equal(csHoldRelease('apu', { ...CS_DARK, on: { apu: true }, apuReady: true }).type, 'none');
  assert.deepEqual(csHoldRelease('engR', { ...CS_DARK, on: { engR: true }, engines: { L: 'off', R: 'starting' } }), { type: 'set', system: 'engR', on: false });
  assert.equal(csHoldRelease('engR', { ...CS_DARK, on: { engR: true }, engines: { L: 'off', R: 'run' } }).type, 'none');
});

test('APU START needs ARM (cover lifted) and BATT', () => {
  assert.equal(csHoldStart('apu', input('apu', { on: { batt: true } })).type, 'none');
  assert.deepEqual(csHoldStart('apu', input('apu', { on: { batt: true } }, { guards: { apuGuard: true } })), { type: 'set', system: 'apu', on: true });
  assert.equal(csView(input('apu', { on: { batt: true, avionics: true, inertialNav: true, fuelPumpL: true, fuelPumpR: true } })).next?.key, 'apuGuard');
});

test('GND AIR: R start needs cart READY; L start needs the crossbleed open with R running', () => {
  const on = { batt: true, aircart: true, fuelPumpR: true, ignR: true, fuelPumpL: true, ignL: true };
  let inp = input('gndAir', { on, cartReady: false }, { guards: { engR: true, engL: true } });
  assert.equal(csView(inp).switches.engR.disabledReason, 'Ground air ready first');
  assert.equal(csView(inp).gndAir.side, 'R');
  inp = input('gndAir', { on: { ...on, crossbleed: true }, cartReady: true, engines: { L: 'off', R: 'run' } }, { guards: { engR: true, engL: true } });
  assert.equal(csView(inp).switches.engL.disabled, undefined);
  assert.equal(csView(inp).gndAir.side, 'L');
  inp = input('gndAir', { on, cartReady: true, engines: { L: 'off', R: 'run' } }, { guards: { engR: true, engL: true } });
  assert.equal(csView(inp).switches.engL.disabledReason, 'Crossbleed open first');
});

test('Park lockout: outside Park every switch is locked with "Available in Park", taps do nothing', () => {
  const inp = input('apu', { on: { batt: true } }, { park: false });
  const v = csView(inp);
  for (const [id, s] of Object.entries(v.switches)) {
    assert.equal(s.disabled, true, id);
    assert.equal(s.disabledReason, CS_PARK_REASON, id);
  }
  assert.equal(v.apu.disabledReason, CS_PARK_REASON);
  assert.equal(csTap('batt', false, inp).type, 'none');
  assert.equal(csHoldStart('apu', { ...inp, guards: { apuGuard: true } }).type, 'none');
});

test('Park detector: dwell to enter, leaves at once', () => {
  let p = { park: false, stillSince: null as number | null };
  p = parkStep(p, 0, 0);
  assert.equal(p.park, false);
  p = parkStep(p, 0, 1600);
  assert.equal(p.park, true);
  p = parkStep(p, 1, 1700); // creeping, still Park (hysteresis)
  assert.equal(p.park, true);
  p = parkStep(p, 3, 1800);
  assert.equal(p.park, false);
});

/** Tiny permissive engine model for QUICK START: APU / cart READY and engines RUN one tick after their switch. */
function simulate(mode: CsMode) {
  const inp = input(mode);
  const sys = inp.sys;
  const log: string[] = [];
  let pressedCaution = false;
  for (let tick = 0; tick < 200; tick++) {
    if (sys.on.apu) sys.apuReady = true;
    else sys.apuReady = false;
    if (sys.on.aircart) sys.cartReady = true;
    else sys.cartReady = false;
    for (const s of ['L', 'R'] as const) if (sys.on[`eng${s}`]) sys.engines[s] = sys.engines[s] === 'off' ? 'starting' : 'run';
    const a = csAutoNext({ ...inp, cautionReset: pressedCaution });
    if (a.type === 'done') return { log, sys, done: true };
    if (a.type === 'guard') {
      inp.guards[a.id] = true;
      log.push(`guard:${a.id}`);
    } else if (a.type === 'set') {
      if (a.system === 'masterCaution') pressedCaution = true;
      else sys.on[a.system] = a.on;
      log.push(`${a.system}:${a.on ? 'on' : 'off'}${a.hold ? ':hold' : ''}`);
    }
  }
  return { log, sys, done: false };
}

test('QUICK START (APU) walks the whole sequence one switch at a time and ends live', () => {
  const r = simulate('apu');
  assert.equal(r.done, true);
  assert.deepEqual(r.log.slice(0, 9), ['batt:on', 'avionics:on', 'inertialNav:on', 'fuelPumpL:on', 'fuelPumpR:on', 'guard:apuGuard', 'apu:on:hold', 'ignL:on', 'guard:engL']);
  assert.ok(r.log.indexOf('engL:on:hold') < r.log.indexOf('engR:on:hold'));
  assert.ok(r.log.includes('apu:off'));
  assert.equal(r.log.at(-1), 'masterCaution:on');
  assert.equal(r.sys.engines.L, 'run');
  assert.equal(r.sys.engines.R, 'run');
});

test('QUICK START (GND AIR) starts R on cart air, crossbleeds to L, then disconnects', () => {
  const r = simulate("gndAir");
  assert.ok(r.done, r.log.join(" "));
  assert.equal(r.done, true);
  const i = (k: string) => r.log.indexOf(k);
  assert.ok(i('aircart:on') < i('engR:on:hold'));
  assert.ok(i('engR:on:hold') < i('crossbleed:on'));
  assert.ok(i('crossbleed:on') < i('engL:on:hold'));
  assert.ok(i('engL:on:hold') < i('crossbleed:off'));
  assert.ok(i('crossbleed:off') < i('aircart:off'));
});

test('a cockpit that is already running starts past the engine steps', () => {
  const v = csView(input('apu', { on: { batt: true, engL: true, engR: true }, engines: { L: 'run', R: 'run' } }));
  assert.equal(v.live, true);
  assert.equal(v.next?.key, 'throttleL'); // Dan: only BATT + the engine switches follow; the throttles come next
  const v2 = csView(input('apu', { on: { batt: true, engL: true, engR: true, throttleL: true, throttleR: true }, engines: { L: 'run', R: 'run' } }));
  assert.equal(v2.next?.key, 'seatbelt');
});

test('wired throttle at cutoff: engine start waits for IDLE (no deadlock while cranking)', () => {
  const inp = input('apu', { on: { batt: true, apu: true, fuelPumpL: true, ignL: true }, apuReady: true }, { guards: { engL: true }, wired: { throttleL: true } });
  assert.equal(csView(inp).switches.engL.disabledReason, 'L throttle idle first');
  assert.equal(csView(inp).switches.throttleL.disabled, undefined);
  const a = csAutoNext({ ...inp, guards: { engL: true, apuGuard: true }, sys: { ...inp.sys, on: { ...inp.sys.on, avionics: true, inertialNav: true, fuelPumpR: true } } });
  assert.deepEqual(a, { type: 'set', system: 'throttleL', on: true });
});

/* ------------------------------------------------------------------ PULL */

const drive = (moves: number[], upAt?: number) => {
  let st: PullState = PULL_REST;
  const fx: string[] = [];
  const apply = (r: { state: PullState; effects: string[] }) => {
    st = r.state;
    fx.push(...r.effects);
  };
  apply(pullDown(st, 1, 100));
  for (const y of moves) apply(pullMove(st, 1, 100 + y));
  apply(pullUp(st, 1, upAt === undefined ? undefined : 100 + upAt));
  return { st, fx };
};

test('PULL: a tap does not fire', () => {
  const r = drive([], 0);
  assert.equal(r.st.phase, 'rest');
  assert.ok(!r.fx.includes('fire'));
});

test('PULL: a 39px pull springs back, nothing fires', () => {
  const r = drive([10, 20, 30, 39], 39);
  assert.equal(r.st.phase, 'rest');
  assert.ok(!r.fx.includes('fire'));
  assert.ok(r.fx.includes('detent'));
});

test('PULL: progress 0..1 while pulling, upward / sideways travel does not count', () => {
  let st = pullDown(PULL_REST, 7, 50).state;
  st = pullMove(st, 7, 70).state;
  assert.equal(st.phase, 'pulling');
  assert.equal(st.progress, 0.5);
  st = pullMove(st, 7, 0).state;
  assert.equal(st.progress, 0);
  assert.equal(pullMove(st, 8, 200).state.phase, 'pulling'); // other pointer ignored
});

test('PULL: a 40px pull fires once, then stays fired until RESET', () => {
  const r = drive([20, 40]);
  assert.equal(r.st.phase, 'fired');
  assert.equal(r.fx.filter((f) => f === 'fire').length, 1);
  assert.equal(pullDown(r.st, 2, 0).state.phase, 'fired');
  assert.equal(pullReset().phase, 'rest');
});

test('PULL: the VoiceOver action fires', () => {
  const r = pullAction(PULL_REST);
  assert.equal(r.state.phase, 'fired');
  assert.deepEqual(r.effects, ['fire']);
});

/* ------------------------------------------------------------------ prefs */

test('START MODE pref (v3: one source of truth = cjPrefs; RADAR = mapView): APU default, Park-only tile, persisted', () => {
  const m = new Map<string, string>();
  const kv = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  resetCjPrefsCache();
  assert.equal(parseCjPrefs(null, null).startMode, 'apu');
  assert.equal(parseCjPrefs(null, 'gndAir').startMode, 'gndAir');
  assert.equal(parseCjPrefs(null, 'junk').startMode, 'apu');
  setCjPrefs({ startMode: 'gndAir' }, kv);
  assert.equal(getCjPrefs().startMode, 'gndAir');
  assert.ok([...m.entries()].some(([k, v]) => k.endsWith(START_MODE_KEY) && v === 'gndAir'), 'persisted under the shared key');
  const start = buildConfig(CJ_CONFIG_SPEC).options.items.find((i) => i.id === 'start')!;
  const ctx = (park: boolean) => ({ park, prefs: getCjPrefs() }) as unknown as ConfigCtx;
  assert.equal(disabledReason(start, ctx(false)), PARK_REASON, 'Park only');
  assert.equal(disabledReason(start, ctx(true)), undefined);
  assert.equal(MAP_VIEW_DEFAULT.radar, false);
  assert.equal(parseMapView(JSON.stringify({ radar: true })).radar, true);
  resetCjPrefsCache();
});

test('badges carry pamphlet codes (sheet panel 8): each control shows its next code still to do; off steps get the next cue', () => {
  // dark cockpit: first code of each control (a multi-step control shows its first one: APU START 3a of 3a·3b·6a)
  const a = csView(input('apu'));
  assert.equal(a.apu.step, '3a');
  assert.equal(a.switches.batt.step, '1a');
  assert.equal(a.switches.masterCaution?.step, '9a');
  const g = csView(input('gndAir'));
  assert.equal(g.gndAir.steps.aircart, '2a');
  assert.equal(g.gndAir.steps.crossbleed, '4a');
  assert.equal(g.switches.masterCaution?.step, '9a');
  assert.equal(a.codes.join(' '), '1a 1b 1c 2a 2b 3a 3b 4a 4b 4c 5a 5b 5c 6a 7a 7b 7c 7d 8a 8b 9a');
  assert.equal(g.codes.join(' '), '1a 1b 1c 2a 3a 3b 3c 3d 4a 5a 5b 5c 5d 6a 6b 7a 7b 7c 7d 8a 8b 9a');
  // off step current: the cue lights the block
  const at = (mode: CsMode, key: string) => {
    const seq = csSequence(getJetSystemList(csVariant(mode)), mode);
    const i = seq.findIndex((s) => s.key === key);
    const on: Record<string, boolean> = {};
    for (const s of seq.slice(0, i)) if (s.act !== 'arm' && s.act !== 'press') on[s.id] = s.on;
    return csView(input(mode, { on, apuReady: true, cartReady: true, engines: { L: 'run', R: 'run' } }, { guards: { apuGuard: true, engL: true, engR: true }, wired: { throttleL: true, throttleR: true } }));
  };
  const a14 = at('apu', 'apu:off');
  assert.equal(a14.next?.key, 'apu:off');
  assert.equal(a14.apu.cue, 'next');
  const x14 = at('gndAir', 'crossbleed:off');
  assert.equal(x14.next?.key, 'crossbleed:off');
  assert.equal(x14.gndAir.cues.crossbleed, 'next');
  const c15 = at('gndAir', 'aircart:off');
  assert.equal(c15.next?.key, 'aircart:off');
  assert.equal(c15.gndAir.cues.aircart, 'next');
  assert.equal(c15.gndAir.cues.crossbleed, undefined);
});
