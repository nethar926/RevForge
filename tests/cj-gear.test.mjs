/**
 * Carrier Jet landing gear (src/audio/jetGear.js): procedural retract / extend sequences.
 * Timing (start on 'transit', lock on the up / down report, catch-up / default / late), no double
 * clunk, staggered nose + mains, compressed direct jump, playJetCue lever, no clicks, peak, level.
 * Gear-only renders mute the TF30 voice so the mechanics are measured on their own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const gearMod = await imp('src/audio/jetGear.js');
const cold = await imp('src/audio/jetColdStart.js');
const { renderLive, channelsOf } = await imp('scripts/live-engine-render.mjs');
const { integratedLufs, samplePeakDb } = await imp('scripts/loudness.mjs');
const nwa = await import('node-web-audio-api');
const { JET_GEAR } = gearMod;

function biquad(x, type, f0, q, sr) {
  const w = (2 * Math.PI * f0) / sr;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const a0 = 1 + al;
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 + 2 * c * y1 - (1 - al) * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
const band = (x, lo, hi, sr) => biquad(biquad(x, 'hp', lo, 0.7071, sr), 'lp', hi, 0.7071, sr);
const rmsDb = (x) => 10 * Math.log10(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length) + 1e-30);

/** Onsets of the felt low-mid thumps (80–250 Hz): 5 ms envelope rising ≥ 8 dB within 20 ms. */
function thumps(buf, from = 0, to = buf.duration) {
  const sr = buf.sampleRate;
  const ch = channelsOf(buf);
  const mono = ch[0].map((v, i) => (v + ch[1][i]) / 2);
  const b = band(mono, 80, 250, sr);
  const hop = Math.round(sr * 0.005);
  const env = [];
  for (let i = 0; i + hop <= b.length; i += hop) env.push(rmsDb(b.subarray(i, i + hop)));
  const peak = Math.max(...env);
  const out = [];
  let last = -1;
  for (let k = 4; k < env.length; k++) {
    const t = k * 0.005;
    if (t < from || t > to) continue;
    if (env[k] > peak - 24 && env[k] - env[k - 4] >= 8 && t - last > 0.06) {
      out.push(+t.toFixed(3));
      last = t;
    }
  }
  return out;
}

/** Engine-muted render of a scripted gear sequence (gear-only output). */
async function gearOnly(steps, dur, { seed = 'cj-gear', mute = true } = {}) {
  const pending = [...steps].sort((a, b) => a[0] - b[0]);
  const results = [];
  let voice = null;
  const buf = await renderLive(() => ({ speed: 0.4, throttle: 0.5, load: 0.5 }), dur, {
    patchId: 'aerospace-f14',
    seed,
    fps: 30,
    onFrame: (e, t) => {
      if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower';
      if (t === 0 && mute) e.base.g.tcVoice.out.disconnect();
      while (pending.length && pending[0][0] <= t + 1e-9) results.push(pending.shift()[1](e));
      voice = e.base.g.jetVoice ?? voice;
    },
  });
  return { buf, results, voice };
}
const near = (list, t, tol = 0.035) => list.some((x) => Math.abs(x - t) <= tol);
const between = (list, a, b) => list.filter((x) => x >= a && x <= b);

test('jetGear: procedural only, no storage, timings ~4–6 s, stagger 100–300 ms, spread ±0.3', () => {
  const src = readFileSync(join(root, 'src/audio/jetGear.js'), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB|decodeAudioData|fetch\(|\.wav|\.mp3|Convolver|PeriodicWave/.test(src));
  assert.ok(!/setTargetAtTime\(|cancelAndHoldAtTime\(/.test(src), 'anchored linear ramps only');
  for (const d of ['up', 'down']) {
    const T = JET_GEAR[d];
    const total = T.travel + JET_GEAR.stagger.at(-1) + T.tail;
    assert.ok(total >= 4 && total <= 6, `${d}: ${total.toFixed(2)} s`);
    assert.ok(T.minTravel < T.travel);
  }
  const st = JET_GEAR.stagger;
  for (let i = 1; i < st.length; i++) assert.ok(st[i] - st[i - 1] >= 0.1 && st[i] - st[i - 1] <= 0.3);
  assert.deepEqual([...JET_GEAR.pan], [0, -0.3, 0.3]);
  assert.ok(cold.JET_CUES.includes('gearUp') && cold.JET_CUES.includes('gearDown'));
});

test('GearSequence.lock: catch-up clamps to min travel, late / repeated reports never re-clunk', () => {
  const ctx = new nwa.OfflineAudioContext(2, 44100, 44100);
  const v = new cold.JetColdStartVoice(ctx, ctx.destination);
  const a = v.gearStart('up', 0);
  assert.equal(a.locked, false);
  assert.equal(a.lockAt, JET_GEAR.up.travel);
  assert.equal(a.lock(0.3), true, 'early report re-plans');
  assert.equal(a.lockAt, JET_GEAR.up.minTravel, 'never before the min travel');
  assert.equal(a.lock(2), false, 'second report ignored');
  const b = v.gearStart('down', 0);
  assert.equal(b.lock(JET_GEAR.down.travel + 1), false, 'late: the default lock already landed');
  assert.equal(b.lockAt, JET_GEAR.down.travel);
  assert.equal(b.lock(9), false);
  const c = v.gearStart('down', 0, { compressed: true });
  assert.ok(Math.abs(c.lockAt - JET_GEAR.down.travel * JET_GEAR.compressed) < 1e-9);
  v.dispose();
});

test('timing: nothing on the first report; starts on transit; locks land on the report, staggered; event + state on one tick play once', async () => {
  const { buf, results } = await gearOnly(
    [
      [0.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'down' })],
      [1.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
      [1.5, (e) => e.playFlightCallout('gearUp')], // Frontend fires the event on the same tick
      [3.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'up' })],
      [9, (e) => e.setFlightPhase('APPROACH', { gear: 'transit' })],
      [11, (e) => e.setFlightPhase('APPROACH', { gear: 'down' })],
    ],
    17,
  );
  assert.equal(results[2], 'mechanical');
  const db = (a, b) => rmsDb(channelsOf(buf, a, b)[0]);
  assert.ok(db(0.2, 1.49) < -100, `first report silent (${db(0.2, 1.49).toFixed(1)})`);
  assert.ok(db(1.5, 1.6) > -80, 'selector clack right at transit');
  const th = thumps(buf);
  // retract: 3 uplocks on the report (+0 / +0.14 / +0.26), doors close 0.45 s later
  for (const st of JET_GEAR.stagger) {
    assert.ok(near(th, 3.5 + st), `uplock at ${3.5 + st}: ${th}`);
    assert.ok(near(th, 3.95 + st), `door at ${3.95 + st}: ${th}`);
  }
  // one sequence only: no extra thumps from a second (deduped) sequence's default lock
  assert.deepEqual(between(th, 4.4, 8.9), [], `no second clunk: ${between(th, 4.4, 8.9)}`);
  // extend: 3 downlocks on the report
  for (const st of JET_GEAR.stagger) assert.ok(near(th, 11 + st), `downlock at ${11 + st}: ${th}`);
  assert.ok(db(15.8, 17) < -90, 'pump settled, sequence over');
  // DOWNLOCK deeper / more final than the UPLOCK: more weight below 120 Hz relative to 120–1000 Hz
  const sr = buf.sampleRate;
  const low = (a, b) => {
    const m = channelsOf(buf, a, b);
    const x = m[0].map((v, i) => (v + m[1][i]) / 2);
    return rmsDb(band(x, 30, 120, sr)) - rmsDb(band(x, 120, 1000, sr));
  };
  assert.ok(low(11, 11.4) > low(3.5, 3.9) + 2, `downlock ${low(11, 11.4).toFixed(1)} vs uplock ${low(3.5, 3.9).toFixed(1)} dB`);
  // staggered + spread: the mains land left / right of centre
  const ch = (a, b) => channelsOf(buf, a, b).map((c) => rmsDb(c));
  const [l1, r1] = ch(3.64, 3.7);
  const [l2, r2] = ch(3.76, 3.82);
  assert.ok(l1 > r1 + 1 && r2 > l2 + 1, `left main ${(l1 - r1).toFixed(1)} dB, right main ${(r2 - l2).toFixed(1)} dB`);
  assert.ok(samplePeakDb(channelsOf(buf)) <= -1);
});

test('timing: late report (default lock, no second clunk), early report (catch-up), direct jump (compressed)', async () => {
  const late = await gearOnly(
    [
      [0.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'down' })],
      [1, (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
      [6.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'up' })],
    ],
    9,
    { seed: 'cj-gear-late' },
  );
  const tl = thumps(late.buf);
  for (const st of JET_GEAR.stagger) assert.ok(near(tl, 1.005 + JET_GEAR.up.travel + st), `default uplock ${tl}`);
  assert.deepEqual(between(tl, 6.3, 9), [], 'late report: no clunk');
  const early = await gearOnly(
    [
      [0.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'down' })],
      [1, (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
      [1.4, (e) => e.setFlightPhase('AIRBORNE', { gear: 'up' })],
    ],
    7,
    { seed: 'cj-gear-early' },
  );
  const te = thumps(early.buf);
  const tMin = 1.005 + JET_GEAR.up.minTravel;
  for (const st of JET_GEAR.stagger) assert.ok(near(te, tMin + st), `catch-up uplock at ${tMin + st}: ${te}`);
  assert.deepEqual(between(te, 1.005 + JET_GEAR.up.travel - 0.05, 7), [], `default lock muted: ${te}`);
  const jump = await gearOnly(
    [
      [0.5, (e) => e.setFlightPhase('APPROACH', { gear: 'up' })],
      [1, (e) => e.setFlightPhase('APPROACH', { gear: 'down' })],
    ],
    6,
    { seed: 'cj-gear-jump' },
  );
  const tj = thumps(jump.buf);
  const tc = 1.005 + JET_GEAR.down.travel * JET_GEAR.compressed;
  for (const st of JET_GEAR.stagger) assert.ok(near(tj, tc + st), `compressed downlock at ${tc + st}: ${tj}`);
  for (const r of [late, early, jump]) assert.ok(samplePeakDb(channelsOf(r.buf)) <= -1);
});

test('playJetCue gear lever: one sequence per direction while moving; no clicks; quieter than the engine at mid', async () => {
  const counts = [];
  const g = await gearOnly(
    [
      [0.5, (e) => e.playJetCue('gearUp')],
      [0.6, (e) => e.playJetCue('gearUp')],
      [0.7, (e) => counts.push(e.base.g.jetVoice.gearSeqs.size)],
      [7, (e) => e.playJetCue('gearDown')],
      [7.1, (e) => counts.push(e.base.g.jetVoice.gearSeqs.size)],
    ],
    13,
    { seed: 'cj-gear-lever' },
  );
  assert.deepEqual(g.results.slice(0, 2), [true, true]);
  assert.equal(counts[0], 1, 'repeat lever pull while moving: same sequence');
  const th = thumps(g.buf);
  for (const st of JET_GEAR.stagger) {
    assert.ok(near(th, 0.505 + JET_GEAR.up.travel + st), `uplock ${th}`);
    assert.ok(near(th, 7.005 + JET_GEAR.down.travel + st), `downlock ${th}`);
  }
  // no clicks: almost nothing above 12 kHz around the clunks (a click is broadband)
  const sr = g.buf.sampleRate;
  const m = channelsOf(g.buf, 0.4, 12.5);
  const x = m[0].map((v, i) => (v + m[1][i]) / 2);
  const hf = rmsDb(biquad(biquad(x, 'hp', 12000, 0.7071, sr), 'hp', 12000, 0.7071, sr));
  assert.ok(hf < rmsDb(x) - 35, `HF ${(hf - rmsDb(x)).toFixed(1)} dB re total`);
  assert.ok(samplePeakDb(channelsOf(g.buf)) <= -1);
  // level: the loudest 400 ms of gear-only < the quietest 400 ms of the engine alone at mid
  const mom = (buf, a, b, f) => {
    const ch = channelsOf(buf, a, b);
    const out = [];
    for (let t = 0; t + 0.4 <= b - a; t += 0.1) out.push(integratedLufs(ch.map((c) => c.slice(Math.floor(t * sr), Math.floor((t + 0.4) * sr))), sr));
    return f(...out);
  };
  const eng = await renderLive(() => ({ speed: 0.4, throttle: 0.5, load: 0.5 }), 12, {
    patchId: 'aerospace-f14',
    seed: 'cj-gear-lever',
    fps: 30,
    onFrame: (e) => {
      if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower';
    },
  });
  const gearMax = mom(g.buf, 0.4, 12.5, Math.max);
  const engMin = mom(eng, 6, 12, Math.min);
  assert.ok(gearMax < engMin - 1, `gear ${gearMax.toFixed(1)} vs engine mid ${engMin.toFixed(1)} LUFS (momentary)`);
});
