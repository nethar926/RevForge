import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLIGHT_PHASE_DEFAULTS,
  G_MPS2,
  applyFlightAudioCalls,
  createFlightPhase,
  eventToAudioCall,
  mphToMps,
  mpsToMph,
  regimeToAudioCalls,
  type FlightAudioApi,
  type FlightEvent,
  type FlightRegime,
} from '../src/packs/flightPhase.ts';
import { MPH, formatTimeline, parseTraceCsv, profile, replay, type TracePoint } from './flightReplay.ts';

const phaseSeq = (r: ReturnType<typeof replay>) => r.phases.map((p) => p.phase);
const evTypes = (r: ReturnType<typeof replay>) => r.events.map((e) => e.type);
const count = (r: ReturnType<typeof replay>, type: FlightEvent['type']) => r.events.filter((e) => e.type === type).length;
/** Constant-g segment appended to a trace at 1 Hz. */
function accelSeg(trace: TracePoint[], g: number, untilMph: number): TracePoint[] {
  let { t, speedMps: v } = trace[trace.length - 1];
  v = v ?? 0;
  const target = untilMph * MPH;
  while (g > 0 ? v < target : v > target) {
    t += 1;
    v = g > 0 ? Math.min(target, v + g * G_MPS2) : Math.max(target, v + g * G_MPS2);
    trace.push({ t, speedMps: v });
  }
  return trace;
}
function hold(trace: TracePoint[], seconds: number, mph?: number): TracePoint[] {
  let { t, speedMps: v } = trace[trace.length - 1];
  for (let i = 0; i < seconds; i++) trace.push({ t: ++t, speedMps: mph === undefined ? v : mph * MPH });
  return trace;
}
/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const hardLaunch = (g = 0.5, toMph = 60) => hold(accelSeg(hold([{ t: 0, speedMps: 0 }], 5), g, toMph), 30);

test('config: one exported object, mph units with m/s conversion', () => {
  assert.equal(FLIGHT_PHASE_DEFAULTS.highSpeedCallouts, false);
  assert.equal(FLIGHT_PHASE_DEFAULTS.noteTtlMs, 3000);
  assert.equal(FLIGHT_PHASE_DEFAULTS.launchAccelG, 0.3);
  assert.equal(FLIGHT_PHASE_DEFAULTS.launchHoldMs, 500);
  assert.equal(FLIGHT_PHASE_DEFAULTS.gpsFailMs, 10000);
  assert.ok(Math.abs(mphToMps(100) - 44.704) < 1e-9);
  assert.ok(Math.abs(mpsToMph(mphToMps(37)) - 37) < 1e-9);
  assert.ok(Object.isFrozen(FLIGHT_PHASE_DEFAULTS));
  const e = createFlightPhase({ now: () => 0 });
  const r = e.getFlightRegime();
  assert.equal(r.phase, 'TAXI');
  assert.equal(r.gearDown, true);
  assert.equal(r.confidence, 'none');
  assert.deepEqual(r.alerts.map((a) => [a.id, a.text, a.level]), [['gpsAcq', 'GPS ACQ', 'note']]);
});

test('normal drive 0 → 45 → stop: full phase cycle, gear up/down once, no launch', () => {
  const r = replay(profile([[0, 0], [5, 0], [20, 45], [40, 45], [55, 0], [60, 0]]));
  assert.deepEqual(phaseSeq(r), ['TAXI', 'TAKEOFF_ROLL', 'AIRBORNE', 'APPROACH', 'ROLLOUT', 'TAXI']);
  assert.deepEqual(evTypes(r), ['gearUp', 'gearDown']);
  const up = r.events.find((e) => e.type === 'gearUp')!;
  const down = r.events.find((e) => e.type === 'gearDown')!;
  assert.ok(up.speedMph >= 30 && up.speedMph < 35, `gear up at ${up.speedMph}`);
  assert.ok(down.speedMph <= 28 && down.speedMph > 20, `gear down at ${down.speedMph}`);
  assert.ok(r.rows.every((x) => !x.regime.launch && !x.regime.afterburnerLit));
  const tr = r.rows.find((x) => x.regime.gearTransit);
  assert.ok(tr, 'gearTransit shown after a gear change');
  assert.equal(r.rows[r.rows.length - 1].regime.gearTransit, false);
  // TAKEOFF_ROLL entered at ≥35, AIRBORNE at ≥40, APPROACH below 36, ROLLOUT below 20
  const at = (ph: string) => r.rows.find((x) => x.regime.phase === ph)!.speedMph;
  assert.ok(at('TAKEOFF_ROLL') >= 35 && at('AIRBORNE') >= 40);
  assert.ok(at('APPROACH') < 36 && at('ROLLOUT') < 20);
});

test('hard launch, armed: launch event, AB lights + AB LIVE note (3 s), AB out when launch ends below 77', () => {
  const trace = hardLaunch(0.5, 60);
  const r = replay(trace);
  assert.equal(count(r, 'launch'), 1);
  assert.equal(count(r, 'abUnarmed'), 0);
  const first = r.rows.findIndex((x) => x.regime.launch);
  assert.ok(r.rows[first].regime.afterburnerLit);
  assert.equal(r.rows[first].regime.alerts.find((a) => a.id === 'abLive')?.text, 'AB LIVE');
  // AB LIVE note expires after noteTtlMs (3 s) while AB is still lit
  const later = r.rows.find((x) => x.t >= r.rows[first].t + 3 && x.regime.afterburnerLit);
  if (later) assert.ok(!later.regime.alerts.some((a) => a.id === 'abLive'));
  const end = r.rows[r.rows.length - 1].regime;
  assert.equal(end.launch, false);
  assert.equal(end.afterburnerLit, false); // cruising at 60 < 77
  // latency: last stationary fix t=5, first moving fix t=6 → launch by the second moving fix
  const firstMoving = trace.find((p) => (p.speedMps ?? 0) > 0)!.t;
  const lat = r.events.find((e) => e.type === 'launch')!.t - firstMoving;
  assert.ok(lat <= 1, `launch latency ${lat}s after first moving fix`);
});

test('launch-detection latency across launch strengths (1 Hz)', () => {
  const lat: Record<string, number | null> = {};
  for (const g of [0.3, 0.35, 0.5, 0.7, 0.9]) {
    const trace = hardLaunch(g, 70);
    const r = replay(trace);
    const onset = trace.find((p) => (p.speedMps ?? 0) > 0)!.t - 1; // car starts pulling just after the last 0 fix
    const ev = r.events.find((e) => e.type === 'launch');
    lat[g] = ev ? ev.t - onset : null;
  }
  // 0.3 g exactly sits on the threshold; ≥ 0.35 g must detect within 3 s of onset, ≥ 0.5 g within 2 s
  assert.ok(lat['0.35'] !== null && lat['0.35']! <= 3, JSON.stringify(lat));
  assert.ok(lat['0.5']! <= 2 && lat['0.7']! <= 2 && lat['0.9']! <= 2, JSON.stringify(lat));
  // gentle 0.2 g never launches
  assert.equal(count(replay(hardLaunch(0.2, 60)), 'launch'), 0);
  console.log(`# launch latency (s from onset): ${JSON.stringify(lat)}`);
});

test('rolling launch at speed (any speed) is detected', () => {
  const trace = hold(accelSeg(hold(accelSeg([{ t: 0, speedMps: 0 }], 0.1, 45), 5), 0.45, 75), 5);
  const r = replay(trace);
  const ev = r.events.find((e) => e.type === 'launch');
  assert.ok(ev && ev.speedMph > 45, 'launch from a 45 mph roll');
});

test('hard launch, unarmed: one abUnarmed (AB UNARMED caution), no repeat; cooldown 20 s', () => {
  const r = replay(hardLaunch(0.5, 70), { abArmed: false });
  assert.equal(count(r, 'launch'), 1);
  assert.equal(count(r, 'abUnarmed'), 1);
  assert.ok(r.rows.every((x) => !x.regime.afterburnerLit));
  const row = r.rows.find((x) => x.regime.cautions.includes('abUnarmed'))!;
  assert.equal(row.regime.alerts.find((a) => a.id === 'abUnarmed')!.text, 'AB UNARMED');
  // two launches 15 s apart → still one warning (cooldown); a third 40 s later → second warning
  const tr = hold(accelSeg(hold([{ t: 0, speedMps: 0 }], 5), 0.5, 60), 2);
  accelSeg(tr, -0.4, 10);
  hold(tr, 3);
  accelSeg(tr, 0.5, 60); // second launch, < 20 s after first warning
  hold(tr, 40);
  accelSeg(tr, -0.4, 10);
  hold(tr, 3);
  accelSeg(tr, 0.5, 60);
  hold(tr, 5);
  const r2 = replay(tr, { abArmed: false });
  assert.equal(count(r2, 'launch'), 3);
  const warns = r2.events.filter((e) => e.type === 'abUnarmed').map((e) => e.t);
  const launches = r2.events.filter((e) => e.type === 'launch').map((e) => e.t);
  assert.ok(launches[1] - launches[0] < 20);
  assert.equal(warns.length, 2, `warnings at ${warns}, launches at ${launches}`);
  assert.ok(warns[1] - warns[0] >= 20);
});

test('cruise at 80 armed: AB auto-lights at ≥80, holds to 77, out below 77', () => {
  const r = replay(profile([[0, 0], [30, 80], [60, 80], [70, 78], [80, 78], [90, 70], [95, 70]]));
  assert.equal(count(r, 'launch'), 0);
  const lit = r.rows.find((x) => x.regime.afterburnerLit)!;
  assert.ok(lit.speedMph >= 80 - 1e-6);
  assert.ok(r.rows.filter((x) => x.t >= 30 && x.t <= 80).every((x) => x.regime.afterburnerLit));
  assert.equal(r.rows[r.rows.length - 1].regime.afterburnerLit, false);
  const off = r.rows.find((x) => x.t > 30 && !x.regime.afterburnerLit)!;
  assert.ok(off.speedMph < 77);
});

test('cruise at 85 unarmed: one abUnarmed warning, no repeat while cruising', () => {
  const tr = profile([[0, 0], [30, 85], [150, 85]]);
  const rnd = rng(7);
  for (const p of tr) if (p.t > 30) p.speedMps = (85 + (rnd() - 0.5) * 2) * MPH; // 84–86 wobble
  const r = replay(tr, { abArmed: false });
  assert.equal(count(r, 'abUnarmed'), 1);
  assert.equal(count(r, 'launch'), 0);
  // arming the switch mid-cruise lights AB at once
  const r2 = replay(tr, { abArmed: false, before: (p, e) => p.t === 100 && e.setAbArmed(true) });
  assert.ok(r2.rows.find((x) => x.t === 100)!.regime.afterburnerLit);
});

test('hovering at 35 and at 40: no phase flicker', () => {
  const rnd = rng(1);
  const tr35 = profile([[0, 0], [12, 35]]);
  for (let t = 13; t < 90; t++) tr35.push({ t, speedMps: (35 + (rnd() - 0.5) * 4) * MPH }); // 33–37
  const r35 = replay(tr35);
  assert.deepEqual(phaseSeq(r35), ['TAXI', 'TAKEOFF_ROLL']);
  assert.equal(count(r35, 'gearUp'), 1);
  assert.equal(count(r35, 'gearDown'), 0);
  const tr40 = profile([[0, 0], [14, 40]]);
  for (let t = 15; t < 90; t++) tr40.push({ t, speedMps: (40 + (rnd() - 0.5) * 4) * MPH }); // 38–42
  const r40 = replay(tr40);
  assert.deepEqual(phaseSeq(r40), ['TAXI', 'TAKEOFF_ROLL', 'AIRBORNE']);
  // hovering at 20 on the way down: one ROLLOUT, no bouncing
  const tr20 = profile([[0, 0], [15, 45], [25, 45], [35, 20]]);
  for (let t = 36; t < 90; t++) tr20.push({ t, speedMps: (20 + (rnd() - 0.5) * 4) * MPH });
  assert.deepEqual(phaseSeq(replay(tr20)), ['TAXI', 'TAKEOFF_ROLL', 'AIRBORNE', 'APPROACH', 'ROLLOUT']);
  // hover in the 35 band during approach: APPROACH holds, no touch-and-go
  const trA = profile([[0, 0], [15, 45], [25, 45], [30, 35]]);
  for (let t = 31; t < 80; t++) trA.push({ t, speedMps: (34.5 + (rnd() - 0.5) * 3) * MPH }); // 33–36
  const rA = replay(trA);
  assert.deepEqual(phaseSeq(rA), ['TAXI', 'TAKEOFF_ROLL', 'AIRBORNE', 'APPROACH']);
  assert.equal(count(rA, 'touchAndGo'), 0);
});

test('touch-and-go at a light: decel to 12, re-accel → touchAndGo, straight to TAKEOFF_ROLL, never TAXI', () => {
  const r = replay(profile([[0, 0], [15, 45], [30, 45], [42, 12], [44, 12], [56, 45], [70, 45]]));
  assert.deepEqual(phaseSeq(r), ['TAXI', 'TAKEOFF_ROLL', 'AIRBORNE', 'APPROACH', 'ROLLOUT', 'TAKEOFF_ROLL', 'AIRBORNE']);
  assert.equal(count(r, 'touchAndGo'), 1);
  const tg = r.events.find((e) => e.type === 'touchAndGo')!;
  assert.ok(tg.speedMph >= 35);
  const i = r.phases.findIndex((p) => p.phase === 'AIRBORNE');
  assert.ok(r.phases.slice(i).every((p) => p.phase !== 'TAXI'));
  // go-around: approach dip to 34 (never below 32) then back up → AIRBORNE, no touch-and-go
  const ga = replay(profile([[0, 0], [15, 45], [25, 45], [30, 34], [35, 45], [40, 45]]));
  assert.deepEqual(phaseSeq(ga), ['TAXI', 'TAKEOFF_ROLL', 'AIRBORNE', 'APPROACH', 'AIRBORNE']);
  assert.equal(count(ga, 'touchAndGo'), 0);
  // rejected takeoff (36 → 25, never airborne) returns to TAXI without a touch-and-go
  const rto = replay(profile([[0, 0], [10, 37], [12, 37], [16, 25], [20, 25]]));
  assert.deepEqual(phaseSeq(rto), ['TAXI', 'TAKEOFF_ROLL', 'TAXI']);
});

test('ROLLOUT → TAXI only after < 5 mph for 3 s, or a full stop', () => {
  // creep at 3 mph: TAXI after 3 s below 5
  const r = replay(profile([[0, 0], [15, 45], [25, 45], [38, 3], [50, 3]]));
  const roll = r.phases.find((p) => p.phase === 'ROLLOUT')!;
  const taxi = r.phases.filter((p) => p.phase === 'TAXI')[1];
  assert.ok(taxi, 'reached TAXI');
  const below5 = r.rows.find((x) => x.t > roll.t && x.speedMph < 5)!.t;
  assert.ok(taxi.t - below5 >= 3 && taxi.t - below5 <= 4, `TAXI ${taxi.t - below5}s after < 5 mph`);
  // full stop → TAXI immediately
  const r2 = replay(profile([[0, 0], [15, 45], [25, 45], [40, 0], [42, 0]]));
  const t2 = r2.phases[r2.phases.length - 1];
  assert.equal(t2.phase, 'TAXI');
  assert.equal(t2.t, 40);
  // 8 mph crawl stays ROLLOUT
  const r3 = replay(profile([[0, 0], [15, 45], [25, 45], [35, 8], [80, 8]]));
  assert.equal(r3.rows[r3.rows.length - 1].regime.phase, 'ROLLOUT');
});

test('standstill GPS jitter ±1.5 m/s: no launch, no phase / gear change', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rnd = rng(seed);
    const tr: TracePoint[] = [];
    for (let t = 0; t < 600; t++) tr.push({ t, speedMps: Math.max(0, (rnd() * 2 - 1) * 1.5) });
    const r = replay(tr);
    assert.deepEqual(evTypes(r), [], `seed ${seed}`);
    assert.ok(r.rows.every((x) => x.regime.phase === 'TAXI' && !x.regime.launch && x.regime.gearDown));
    assert.ok(Math.max(...r.rows.map((x) => x.regime.accelG)) < 0.3);
    // also worst-case alternating 0 / 1.5 (saw-tooth) and unclipped negatives
    const saw = Array.from({ length: 60 }, (_, t) => ({ t, speedMps: t % 2 ? 1.5 : -1.5 }));
    assert.equal(count(replay(saw), 'launch'), 0);
  }
});

test('null speed holds state; position fallback is low confidence and never launches', () => {
  const tr: TracePoint[] = profile([[0, 0], [15, 45], [20, 45]]);
  for (let t = 21; t < 30; t++) tr.push({ t, speedMps: null });
  const r = replay(tr);
  assert.ok(r.rows.filter((x) => x.t > 20).every((x) => x.regime.phase === 'AIRBORNE' && Math.abs(x.regime.speedMph - 45) < 1e-6));
  // position-only fixes: 0 m/s then a huge position jump (≈ 2 g implied) → low confidence, no launch
  const lat0 = 37;
  const pos: TracePoint[] = [];
  let x = 0;
  for (let t = 0; t < 12; t++) {
    const v = t < 4 ? 0 : (t - 3) * 20; // m/s, +20 m/s per s
    x += v;
    pos.push({ t, speedMps: null, latitude: lat0 + x / 111_195, longitude: -122 });
  }
  const rp = replay(pos);
  assert.equal(count(rp, 'launch'), 0);
  const moving = rp.rows.filter((r) => r.t > 5);
  assert.ok(moving.every((r) => r.regime.confidence === 'low' && r.regime.accelG === 0 && !r.regime.launch));
  assert.ok(moving[moving.length - 1].regime.speedMph > 100, 'fallback speed used for phase');
  assert.ok(moving[0].regime.alerts.some((a) => a.id === 'gpsAcq'));
  // poor accuracy coords.speed: low confidence, no launch even at 0.6 g
  const bad = hardLaunch(0.6, 60).map((p) => ({ ...p, accuracy: 120 }));
  const rb = replay(bad);
  assert.equal(count(rb, 'launch'), 0);
  assert.ok(rb.rows.every((r) => r.regime.confidence === 'low'));
});

test('stale fixes (> 3 s old) are ignored; GPS gap holds state → GPS ACQ → GPS FAIL (10 s) → clears on next fix', () => {
  let clock = 0;
  const e = createFlightPhase({ now: () => clock });
  const push = (t: number, mph: number | null, ts = t) => {
    clock = t * 1000;
    e.pushFix({ speedMps: mph === null ? null : mph * MPH, timestampMs: ts * 1000 });
  };
  for (let t = 0; t <= 20; t++) push(t, Math.min(45, t * 3));
  assert.equal(e.getFlightRegime().phase, 'AIRBORNE');
  assert.equal(e.getFlightRegime().confidence, 'high');
  assert.equal(e.getTopAlert(), null);
  push(21, 0, 17); // a 4 s old fix reporting 0 → ignored
  assert.equal(e.getFlightRegime().phase, 'AIRBORNE');
  assert.ok(Math.abs(e.getFlightRegime().speedMph - 45) < 1e-9);
  const changes: FlightRegime[] = [];
  e.onFlightRegimeChange((r) => changes.push(r));
  clock = 24_500; // 3.5 s since last good fix → stale: hold, confidence none, GPS ACQ
  e.tick();
  let r = e.getFlightRegime();
  assert.equal(r.phase, 'AIRBORNE');
  assert.equal(r.confidence, 'none');
  assert.deepEqual(r.alerts.map((a) => a.id), ['gpsAcq']);
  clock = 31_000; // 11 s → GPS FAIL (caution) replaces GPS ACQ
  e.tick();
  r = e.getFlightRegime();
  assert.deepEqual(r.alerts.map((a) => [a.id, a.text, a.level]), [['gpsFail', 'GPS FAIL', 'caution']]);
  assert.deepEqual(r.cautions, ['gpsFail']);
  assert.equal(r.phase, 'AIRBORNE');
  assert.ok(changes.length >= 2);
  push(32, 44); // next good fix clears it
  r = e.getFlightRegime();
  assert.deepEqual(r.alerts, []);
  assert.equal(r.confidence, 'high');
  // gpsFailMs configurable; no GPS FAIL before any fix was ever live
  let c2 = 0;
  const e2 = createFlightPhase({ now: () => c2, gpsFailMs: 4000 });
  c2 = 60_000;
  e2.tick();
  assert.deepEqual(e2.getFlightRegime().alerts.map((a) => a.id), ['gpsAcq']);
  e2.pushFix({ speedMps: 5, timestampMs: 60_000 });
  c2 = 64_500;
  e2.tick();
  assert.deepEqual(e2.getFlightRegime().cautions, ['gpsFail']);
});

test('high-speed callouts (HIGH SPEED 100 / OVERSPEED 126): off by default, hysteresis + cooldown when on', () => {
  const tr = profile([[0, 0], [60, 130], [70, 130], [80, 110], [90, 110], [100, 90], [110, 90]]);
  const off = replay(tr);
  assert.equal(count(off, 'overspeedCaution') + count(off, 'overspeedWarning'), 0);
  assert.ok(off.rows.every((x) => x.regime.cautions.length === 0));
  const on = replay(tr, { config: { highSpeedCallouts: true } });
  assert.equal(count(on, 'overspeedCaution'), 1);
  assert.equal(count(on, 'overspeedWarning'), 1);
  const c = on.events.find((e) => e.type === 'overspeedCaution')!;
  const w = on.events.find((e) => e.type === 'overspeedWarning')!;
  assert.ok(c.speedMph >= 100 && c.speedMph < 126 && w.speedMph >= 126);
  const top = on.rows.find((x) => x.t === 65)!.regime;
  assert.equal(top.alerts[0].text, 'OVERSPEED');
  assert.equal(top.alerts[0].level, 'warning');
  assert.ok(!top.alerts.some((a) => a.id === 'overspeedCaution'), 'warning supersedes caution');
  const mid = on.rows.find((x) => x.t === 85)!.regime;
  assert.deepEqual(mid.alerts.map((a) => [a.text, a.level]), [['HIGH SPEED', 'caution']]);
  assert.deepEqual(on.rows[on.rows.length - 1].regime.cautions, []);
  // hover at 100 (98.5–101.5): one callout; cooldown blocks a repeat after a brief dip
  const rnd = rng(3);
  const hv = profile([[0, 0], [45, 100]]);
  for (let t = 46; t < 120; t++) hv.push({ t, speedMps: (100 + (rnd() - 0.5) * 3) * MPH });
  assert.equal(count(replay(hv, { config: { highSpeedCallouts: true } }), 'overspeedCaution'), 1);
  const dip = profile([[0, 0], [45, 101], [50, 101], [53, 95], [56, 101], [60, 101], [100, 95], [105, 101], [110, 101]]);
  const rd = replay(dip, { config: { highSpeedCallouts: true, calloutCooldownMs: 30000 } });
  assert.deepEqual(rd.events.filter((e) => e.type === 'overspeedCaution').map((e) => e.t).length, 2); // t≈45 and t≈105 (56 blocked)
  // runtime toggle
  let clk = 0;
  const e = createFlightPhase({ now: () => clk });
  for (const p of profile([[0, 0], [50, 110]])) {
    clk = p.t * 1000;
    e.pushFix({ speedMps: p.speedMps, timestampMs: clk });
  }
  assert.deepEqual(e.getFlightRegime().cautions, []);
  e.setHighSpeedCallouts(true);
  assert.deepEqual(e.getFlightRegime().cautions, ['overspeedCaution']);
});

test('alerts[] is sorted most serious first; getTopAlert = alerts[0]', () => {
  let clk = 0;
  const e = createFlightPhase({ now: () => clk, highSpeedCallouts: true, cautionTtlMs: 60_000 });
  e.setAbArmed(false);
  for (const p of profile([[0, 0], [30, 130]])) {
    clk = p.t * 1000;
    e.pushFix({ speedMps: p.speedMps, timestampMs: clk, accuracy: p.t > 28 ? 200 : 5 });
  }
  const r = e.getFlightRegime();
  assert.deepEqual(r.alerts.map((a) => a.level), ['warning', 'caution', 'note']);
  assert.deepEqual(r.alerts.map((a) => a.text), ['OVERSPEED', 'AB UNARMED', 'GPS ACQ']);
  assert.deepEqual(e.getTopAlert(), r.alerts[0]);
  assert.deepEqual(r.cautions, ['overspeedWarning', 'abUnarmed']);
});

test('config overrides: launch sensitivity and phase thresholds', () => {
  const soft = hardLaunch(0.25, 60);
  assert.equal(count(replay(soft), 'launch'), 0);
  assert.equal(count(replay(soft, { config: { launchAccelG: 0.2 } }), 'launch'), 1);
  // longer hold: needs consecutive above-threshold samples → later
  const base = replay(hardLaunch(0.5, 70)).events.find((e) => e.type === 'launch')!.t;
  const slow = replay(hardLaunch(0.5, 70), { config: { launchHoldMs: 3500 } }).events.find((e) => e.type === 'launch')!.t;
  assert.ok(slow > base);
  const r = replay(profile([[0, 0], [20, 60], [30, 60]]), { config: { takeoffMph: 45, airborneMph: 50, airborneHoldMph: 46, gearUpMph: 40, gearDownMph: 38 } });
  const at = (ph: string) => r.rows.find((x) => x.regime.phase === ph)!.speedMph;
  assert.ok(at('TAKEOFF_ROLL') >= 45 && at('AIRBORNE') >= 50);
  assert.ok(r.events.find((e) => e.type === 'gearUp')!.speedMph >= 40);
  const ab = replay(profile([[0, 0], [30, 72], [40, 72]]), { config: { abAutoMph: 70, abOffMph: 67 } });
  assert.ok(ab.rows[ab.rows.length - 1].regime.afterburnerLit);
  const fast = createFlightPhase({ noteTtlMs: 1000 });
  assert.equal(fast.config.noteTtlMs, 1000);
  assert.equal(fast.config.launchAccelG, 0.3);
});

test('subscriptions: regime changes only on discrete changes, unsubscribe works, reset() restores TAXI', () => {
  let clk = 0;
  const e = createFlightPhase({ now: () => clk });
  const seen: string[] = [];
  const evs: string[] = [];
  const un = e.onFlightRegimeChange((r) => seen.push(r.phase));
  const unE = e.onFlightEvent((ev) => evs.push(ev.type));
  for (let t = 0; t < 10; t++) {
    clk = t * 1000;
    e.pushFix({ speedMps: 3, timestampMs: clk }); // steady 3 m/s: confidence goes high once, then quiet
  }
  assert.equal(seen.length, 1);
  un();
  unE();
  for (let t = 10; t < 30; t++) {
    clk = t * 1000;
    e.pushFix({ speedMps: Math.min(25, (t - 9) * 2), timestampMs: clk });
  }
  assert.equal(seen.length, 1);
  assert.deepEqual(evs, []);
  assert.equal(e.getFlightRegime().phase, 'AIRBORNE');
  e.setAbArmed(false);
  e.reset();
  const r = e.getFlightRegime();
  assert.equal(r.phase, 'TAXI');
  assert.equal(r.gearDown, true);
  assert.equal(r.abArmed, false, 'ARM switch survives reset');
  // getFlightRegime returns a copy
  r.alerts.length = 0;
  assert.equal(e.getFlightRegime().alerts.length, 1);
});

test('audio call shapes: regime/events → setFlightPhase / setAfterburnerLaunch / playFlightCallout', () => {
  const calls: string[] = [];
  const api: FlightAudioApi = {
    setFlightPhase: (p, o) => calls.push(`phase:${p}:${o.gear}:${o.launch}`),
    setAfterburnerLaunch: (b) => calls.push(`ab:${b}`),
    playFlightCallout: (id) => calls.push(`callout:${id}`),
    setCalloutMode: (m) => calls.push(`mode:${m}`),
  };
  let clk = 0;
  const e = createFlightPhase({ now: () => clk });
  applyFlightAudioCalls(api, regimeToAudioCalls(e.getFlightRegime(), null));
  e.onFlightRegimeChange((r, p) => applyFlightAudioCalls(api, regimeToAudioCalls(r, p)));
  e.onFlightEvent((ev) => applyFlightAudioCalls(api, [eventToAudioCall(ev)]));
  for (const p of hardLaunch(0.5, 50)) {
    clk = p.t * 1000;
    e.pushFix({ speedMps: p.speedMps, timestampMs: clk });
  }
  assert.equal(calls[0], 'phase:TAXI:down:false');
  assert.equal(calls[1], 'ab:false');
  assert.ok(calls.includes('phase:TAXI:down:true'));
  assert.ok(calls.includes('ab:true'));
  assert.ok(calls.includes('callout:gearUp'));
  assert.ok(calls.some((c) => c.startsWith('phase:AIRBORNE')));
  assert.equal(eventToAudioCall({ type: 'touchAndGo' }), null);
  assert.equal(eventToAudioCall({ type: 'launch' }), null);
  assert.deepEqual(eventToAudioCall({ type: 'overspeedWarning' }), { method: 'playFlightCallout', args: ['overspeedWarning'] });
  applyFlightAudioCalls(api, [{ method: 'setCalloutMode', args: ['tone'] }]);
  assert.equal(calls[calls.length - 1], 'mode:tone');
});

test('replay helper: CSV → timeline', () => {
  const csv = 't,speedMps\n0,0\n1,0\n2,0\n3,4.9\n4,9.8\n5,14.7\n6,19.6\n7,19.6\n8,\n9,null\n';
  const tr = parseTraceCsv(csv);
  assert.equal(tr.length, 10);
  assert.equal(tr[8].speedMps, null);
  const out = formatTimeline(replay(tr));
  assert.match(out, /!launch/);
  assert.match(out, /AIRBORNE/);
  assert.match(out, /^ {3}t\(s\)/);
});
