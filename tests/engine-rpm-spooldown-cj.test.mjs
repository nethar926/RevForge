// Carrier Jet / Tomcat (aerospace-f14, cold start on): per-engine switch-off and PULL emergency stop
// take the reported engine state run → shutdown → off with engineSpooledDown true within a bound,
// the other engine untouched; every rpm field finite and >= 0 throughout. Live chain, offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderColdStart } = await import(pathToFileURL(join(root, 'tests/cj-cold-start-render.mjs')).href);

const PARK = () => ({ speed: 0, throttle: 0, load: 0 });
/** Both engines up by ≈ 10 s after jetQuickStart at 0.2 s (cold start ≈ 7 s to idle). */
const BOTH_RUN_BY = 12;
const BOUND_S = 10;

function sane(s, where) {
  for (const k of ['rpm', 'rpmL', 'rpmR']) assert.ok(typeof s[k] === 'number' && Number.isFinite(s[k]) && s[k] >= 0, `${where}: ${k} = ${s[k]}`);
  if (s.engineSpooledDown.left) assert.ok(Object.is(s.rpmL, 0), `${where}: left spooled but rpmL ${s.rpmL}`);
  if (s.engineSpooledDown.right) assert.ok(Object.is(s.rpmR, 0), `${where}: right spooled but rpmR ${s.rpmR}`);
}

async function traceCj(timeline, dur, seed) {
  const tr = [];
  await renderColdStart(timeline, dur, {
    profile: PARK,
    fps: 30,
    seed,
    onFrame: (e, t) => {
      const s = e.getEngineState();
      sane(s, `${seed} t=${t.toFixed(2)}`);
      tr.push({ t, ...s, enginePhase: { ...s.enginePhase }, engineSpooledDown: { ...s.engineSpooledDown } });
    },
  });
  return tr;
}

/** Phase sequence of one side after `from` (consecutive duplicates collapsed). */
const phases = (tr, side, from) => tr.filter((s) => s.t >= from).map((s) => s.enginePhase[side]).filter((p, i, a) => i === 0 || p !== a[i - 1]);

for (const [sw, side, other] of [['engL', 'left', 'right'], ['engR', 'right', 'left']]) {
  test(`${sw} OFF while both run: ${side} run → shutdown → off + spooledDown within ${BOUND_S} s, ${other} stays 'run'`, async () => {
    const OFF_AT = BOTH_RUN_BY + 1;
    const tl = [
      [0.2, '', (e) => assert.equal(e.jetQuickStart(), true)],
      [OFF_AT, '', (e) => assert.equal(e.setJetSystem(sw, false), true)],
    ];
    const tr = await traceCj(tl, OFF_AT + BOUND_S + 2, `rpm-zero-${sw}`);
    const before = tr.filter((s) => s.t > BOTH_RUN_BY && s.t < OFF_AT);
    assert.ok(before.length > 10 && before.every((s) => s.enginePhase.left === 'run' && s.enginePhase.right === 'run'), 'both engines running before the switch');
    assert.ok(before.every((s) => s.rpmL > 700 && s.rpmR > 700 && !s.spooledDown));
    assert.deepEqual(phases(tr, side, OFF_AT - 0.5), ['run', 'shutdown', 'off']);
    const after = tr.filter((s) => s.t >= OFF_AT);
    const down = after.find((s) => s.engineSpooledDown[side]);
    assert.ok(down, `${side} spooled down`);
    assert.ok(down.t - OFF_AT > 2 && down.t - OFF_AT <= BOUND_S, `${side} spooled down after ${(down.t - OFF_AT).toFixed(2)} s`);
    console.log(`${sw} off → ${side} spooled down after ${(down.t - OFF_AT).toFixed(2)} s`);
    for (const s of after.filter((x) => x.t < down.t)) assert.equal(s.engineSpooledDown[side], false, 'not spooled while still turning');
    for (const s of after.filter((x) => x.t >= down.t)) {
      assert.equal(s.enginePhase[side], 'off');
      assert.ok(s.engineSpooledDown[side] && Object.is(side === 'left' ? s.rpmL : s.rpmR, 0), 'stays exactly 0');
    }
    for (const s of after) {
      assert.equal(s.enginePhase[other], 'run', `${other} keeps running at ${s.t.toFixed(2)}`);
      assert.equal(s.engineSpooledDown[other], false);
      assert.ok((side === 'left' ? s.rpmR : s.rpmL) > 700);
      assert.equal(s.spooledDown, false);
      assert.equal(s.rpm, Math.max(s.rpmL, s.rpmR));
    }
  });
}

test(`jetEmergencyStop(): warning, fuel cut at +0.6 s, both engines → off + spooledDown within ${BOUND_S} s of the cut`, async () => {
  const STOP_AT = BOTH_RUN_BY + 1;
  const CUT = STOP_AT + 0.6;
  const tl = [
    [0.2, '', (e) => assert.equal(e.jetQuickStart(), true)],
    [STOP_AT, '', (e) => assert.equal(e.jetEmergencyStop(), true)],
  ];
  const tr = await traceCj(tl, CUT + BOUND_S + 2, 'rpm-zero-estop');
  const before = tr.filter((s) => s.t > BOTH_RUN_BY && s.t < STOP_AT);
  assert.ok(before.length > 10 && before.every((s) => s.enginePhase.left === 'run' && s.enginePhase.right === 'run'));
  // the warning plays first: engines still running until the fuel cut
  for (const s of tr.filter((x) => x.t >= STOP_AT && x.t < CUT - 0.05)) {
    assert.deepEqual(s.enginePhase, { left: 'run', right: 'run' }, `still running during the warning (${s.t.toFixed(2)})`);
  }
  for (const side of ['left', 'right']) assert.deepEqual(phases(tr, side, STOP_AT - 0.5), ['run', 'shutdown', 'off'], side);
  const down = tr.find((s) => s.t >= STOP_AT && s.spooledDown);
  assert.ok(down, 'both spooled down');
  assert.ok(down.t - CUT > 2 && down.t - CUT <= BOUND_S, `spooled down ${(down.t - CUT).toFixed(2)} s after the cut`);
  console.log(`emergency stop → both spooled down ${(down.t - CUT).toFixed(2)} s after the fuel cut`);
  for (const s of tr.filter((x) => x.t >= down.t)) {
    assert.deepEqual(s.enginePhase, { left: 'off', right: 'off' });
    assert.deepEqual(s.engineSpooledDown, { left: true, right: true });
    assert.ok(Object.is(s.rpm, 0) && Object.is(s.rpmL, 0) && Object.is(s.rpmR, 0));
  }
});
