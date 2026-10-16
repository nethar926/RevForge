// Twin Ion cruise bed: one seamless continuous bed (no chopping, no retriggers, no clicks).
import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineAudioContext } from 'node-web-audio-api';
import { renderIonTwin, ionTwinStemModule as stems, ION_TWIN_STEMS_SHIPPED } from '../scripts/ion-twin-render.mjs';

const SR = 44100;
const shipped = { skip: ION_TWIN_STEMS_SHIPPED ? false : 'no recorded stems in this tree' };
import { mono, envDb, pct, smoothness, timbreJumpMax } from './ion-bed-metrics.mjs';

test('seamless loops: long, distinct lengths, no step at the loop point or the chunk seams', shipped, async (t) => {
  const set = await stems.ionTwinStems(new OfflineAudioContext(2, 128, SR));
  for (const role of ['sustain', 'hum']) {
    const loops = set.loops[role];
    assert.equal(loops.length, stems.ION_LOOP_SPEC[role].regions.length, `${role} loops`);
    const lens = loops.map((l) => l.seconds);
    assert.equal(new Set(lens.map((v) => v.toFixed(3))).size, lens.length, `${role} loop lengths distinct`);
    for (const l of loops) {
      assert.ok(l.seconds > 15, `${role} loop ${l.seconds.toFixed(2)} s`);
      // Role mix of this loop, played twice through (wraps once in the middle)
      const ids = Object.keys(l.buffers);
      const n = l.buffers[ids[0]].length;
      const y = new Float32Array(2 * n);
      for (const k of ids) {
        const b = l.buffers[k];
        for (let c = 0; c < b.numberOfChannels; c++) {
          const x = b.getChannelData(c);
          for (let i = 0; i < 2 * n; i++) y[i] += x[i % n] / b.numberOfChannels;
        }
      }
      // Sample continuity at the wrap vs the material
      let wrap = 0;
      let other = 0;
      for (let i = 1; i < y.length; i++) {
        const d = Math.abs(y[i] - y[i - 1]);
        if (Math.abs(i - n) < 256) wrap = Math.max(wrap, d);
        else other = Math.max(other, d);
      }
      assert.ok(wrap <= other, `${role}: wrap |Δx| ${wrap} vs material ${other}`);
      // 20 ms level steps at seams / the wrap no bigger than anywhere else (+1 dB)
      const e = envDb(y, 0.02);
      const W = Math.round(0.02 * SR);
      // Crossfade start / middle / end of every seam (and of the baked loop crossfade at 0 / n)
      const X = l.xfade ?? Math.round(stems.ION_LOOP_SPEC[role].xfade * SR);
      const starts = [0, n, ...l.seams.map((s) => s.out), ...l.seams.map((s) => s.out + n)];
      const marks = starts.flatMap((m) => [m, m + X / 2, m + X]);
      const near = (i) => marks.some((m) => Math.abs(i * W - m) < 0.04 * SR);
      const atSeam = [];
      const elsewhere = [];
      for (let i = 1; i < e.length; i++) (near(i) ? atSeam : elsewhere).push(Math.abs(e[i] - e[i - 1]));
      const sMax = Math.max(...atSeam);
      const eMax = Math.max(...elsewhere);
      const sPct = pct(atSeam, 0.95);
      const ePct = pct(elsewhere, 0.95);
      // Level held flat: 250 ms levels within a few dB of the loop mean
      const e250 = envDb(y.subarray(0, n), 0.25);
      const m = e250.reduce((a, b) => a + b) / e250.length;
      const spread = Math.max(...e250.map((v) => Math.abs(v - m)));
      t.diagnostic(`${role} ${l.seconds.toFixed(2)} s, ${l.seams.length} seams, closeR ${l.closeR.toFixed(2)}: 20 ms step at seams p95 ${sPct.toFixed(2)} / max ${sMax.toFixed(2)} dB, elsewhere p95 ${ePct.toFixed(2)} / max ${eMax.toFixed(2)} dB; 250 ms spread ±${spread.toFixed(2)} dB`);
      assert.ok(sPct <= ePct + 0.5, `${role}: seam step p95 ${sPct.toFixed(2)} vs ${ePct.toFixed(2)} dB`);
      assert.ok(sMax <= eMax + 1.5, `${role}: seam step max ${sMax.toFixed(2)} vs ${eMax.toFixed(2)} dB`);
      assert.ok(spread < 3, `${role}: level spread ±${spread.toFixed(2)} dB`);
    }
  }
});

test('crossfade law holds power for its correlation', () => {
  for (const r of [0, 0.5, 1]) {
    for (let u = 0; u <= 1; u += 0.05) {
      const [a, b] = stems.ionXfade(u, r);
      assert.ok(Math.abs(a * a + b * b + 2 * r * a * b - 1) < 1e-9, `r ${r} u ${u}`);
    }
  }
});

/** Render with the stems, return { x, eng, startsAt1, startsEnd }. */
async function renderBed(profile, dur, seed, actions = []) {
  let eng;
  let startsAt1 = -1;
  const buf = await renderIonTwin(profile, dur, {
    preroll: 4,
    seed,
    onEngine: (e) => (eng = e),
    actions: [[1, (e) => (startsAt1 = e.base.g.ionStemBed?.sourceStarts() ?? -1)], ...actions],
  });
  return { x: mono(buf), eng, startsAt1, startsEnd: eng.base.g.ionStemBed?.sourceStarts() ?? -1 };
}

test('steady cruise (30 / 60 / 90 mph) is one continuous bed: no restarts, no retriggers, no chop, no clicks', shipped, async (t) => {
  for (const mph of [30, 60, 90]) {
    const sp = mph / 120;
    const { x, eng, startsAt1, startsEnd } = await renderBed(() => ({ speed: sp, throttle: 0.35 + 0.3 * sp }), 9, `seam-${mph}`);
    const s = smoothness(x);
    const tj = timbreJumpMax(x);
    t.diagnostic(`${mph} mph: 10 ms step p99 ${s.p99.toFixed(2)} dB, 50 ms level std ${s.std.toFixed(2)} dB, click ratio ${s.click.toFixed(2)}, timbre jump max ${tj.toFixed(2)} dB`);
    assert.ok(startsAt1 > 0 && startsEnd === startsAt1, `${mph}: sources started ${startsAt1} → ${startsEnd}`);
    assert.deepEqual({ ...eng.base.ionCueCounts }, { ignition: 0, shutdown: 0, target: 0 });
    assert.equal(eng.base.ionAccelCount, 0, 'no pull-away one-shot at steady speed');
    assert.ok(s.p99 < 4.5, `${mph}: 10 ms step p99 ${s.p99.toFixed(2)} dB`);
    assert.ok(s.std < 0.9, `${mph}: 50 ms level std ${s.std.toFixed(2)} dB`);
    assert.ok(s.click < 3, `${mph}: click ratio ${s.click.toFixed(2)}`);
    assert.ok(tj < 3.3, `${mph}: timbre jump ${tj.toFixed(2)} dB`);
  }
});

test('slow ramp 30 → 90 mph with a gentle wobble: rate glides, nothing restarts or retriggers', shipped, async (t) => {
  const prof = (t) => ({ speed: (30 + 60 * Math.min(1, t / 10) + 2 * Math.sin(t * 1.3)) / 120, throttle: 0.55 });
  const rates = [];
  const acts = Array.from({ length: 10 }, (_, k) => [1 + k, (e) => rates.push(e.base.g.ionStemBed.sustainBank.rate)]);
  const { x, eng, startsAt1, startsEnd } = await renderBed(prof, 11, 'seam-ramp', acts);
  const s = smoothness(x);
  const tj = timbreJumpMax(x);
  t.diagnostic(`ramp: 10 ms step p99 ${s.p99.toFixed(2)} dB, 50 ms std ${s.std.toFixed(2)} dB, click ${s.click.toFixed(2)}, timbre jump ${tj.toFixed(2)} dB; rates ${rates.map((r) => r.toFixed(3)).join(' ')}`);
  assert.equal(startsEnd, startsAt1);
  assert.deepEqual({ ...eng.base.ionCueCounts }, { ignition: 0, shutdown: 0, target: 0 });
  assert.equal(eng.base.ionAccelCount, 0);
  assert.ok(s.p99 < 4.5 && s.std < 0.9 && s.click < 3 && tj < 3.3, `ramp smoothness ${JSON.stringify(s)} timbre ${tj}`);
  // Rate rises with speed, within the small range
  assert.ok(rates[rates.length - 1] > rates[0] * 1.08, 'rate follows speed');
  for (const r of rates) assert.ok(r > 0.8 && r < 1.35, `rate ${r}`);
});

test('pull-away one-shot: once per real stop, never re-fired by jitter around the threshold', shipped, async () => {
  // Pull away, then crawl with speed / throttle jitter straddling the rest threshold
  const jitter = (t) =>
    t < 3
      ? { speed: Math.min(0.2, t * 0.08), throttle: 0.6 }
      : { speed: 0.075 + 0.03 * Math.sin(t * 5), throttle: 0.09 + 0.06 * Math.sin(t * 7.3) };
  const a = await renderBed((t) => (t < 0.5 ? { speed: 0, throttle: 0 } : jitter(t - 0.5)), 10, 'accel-jitter');
  assert.equal(a.eng.base.ionAccelCount, 1, 'jitter re-fired the pull-away');
  // A real stop (parked, throttle off) and a later pull-away: two
  const stopGo = (t) =>
    t < 0.5
      ? { speed: 0, throttle: 0 }
      : t < 3
        ? { speed: Math.min(0.2, (t - 0.5) * 0.08), throttle: 0.6 }
        : t < 7.5
          ? { speed: Math.max(0, 0.2 - (t - 3) * 0.1), throttle: 0 }
          : { speed: Math.min(0.2, (t - 7.5) * 0.08), throttle: 0.6 };
  const b = await renderBed(stopGo, 9, 'accel-stopgo');
  assert.equal(b.eng.base.ionAccelCount, 2);
});

test('motion voicing: pull glides up and brightens, lift glides down; steady speed stays neutral', shipped, async () => {
  const snap = {};
  const prof = (t) => {
    if (t < 3) return { speed: 0.5, throttle: 0.5 };
    if (t < 5) return { speed: 0.5 + (t - 3) * 0.12, throttle: 0.9 }; // pull
    if (t < 7) return { speed: 0.74, throttle: 0.5 };
    if (t < 9) return { speed: 0.74 - (t - 7) * 0.12, throttle: 0.1 }; // lift
    return { speed: 0.5, throttle: 0.5 };
  };
  const grab = (k) => (e) => {
    const bed = e.base.g.ionStemBed;
    snap[k] = { m: bed.motion, r: bed.rateTarget };
  };
  await renderBed(prof, 10, 'motion', [[2.9, grab('steady')], [4.4, grab('pull')], [8.4, grab('lift')]]);
  assert.ok(Math.abs(snap.steady.m) < 0.05, `steady motion ${snap.steady.m}`);
  assert.ok(snap.pull.m > 0.5, `pull motion ${snap.pull.m}`);
  assert.ok(snap.lift.m < -0.5, `lift motion ${snap.lift.m}`);
  // During the pull the rate sits above the plain speed mapping (portamento overshoot)
  const plain = (sp, thr) => Math.pow(2, (-3.5 + 7 * Math.min(1, 0.7 * sp + 0.3 * thr)) / 12);
  assert.ok(snap.pull.r > plain(0.5 + 1.4 * 0.12, 0.9) * 1.03);
  assert.ok(snap.lift.r < plain(0.74 - 1.4 * 0.12, 0.1));
});

test('simulated gear shifts / overrun add no cue to the Twin Ion cruise (no gearing sfx spam)', async () => {
  // Forge drive simulation: upshift / downshift cues, a shifting throttle dip and overrun pulses
  const plain = () => ({ speed: 0.6, throttle: 0.5 });
  const shifty = (t) => {
    const ph = t % 2;
    return { speed: 0.6, throttle: ph < 0.25 ? 0.15 : 0.5, shifting: ph < 0.25, overrun: ph > 1.5 && ph < 1.7 };
  };
  const cues = [1, 3, 5].flatMap((t) => [
    [t, (e) => e.triggerUiCue('upshift')],
    [t + 1, (e) => e.triggerUiCue('downshift')],
  ]);
  const a = await renderIonTwin(plain, 6, { preroll: 3, seed: 'gear-spam', actions: cues });
  const b = await renderIonTwin(plain, 6, { preroll: 3, seed: 'gear-spam' });
  let d = 0;
  for (let c = 0; c < 2; c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i]));
  }
  assert.ok(d < 1e-6, `upshift / downshift cues changed the output by ${d}`);
  // Shifting dips + overrun: the recorded bed holds its level (no per-shift dip in the stems)
  if (!ION_TWIN_STEMS_SHIPPED) return;
  const s = smoothness(mono(await renderIonTwin(shifty, 6, { preroll: 3, seed: 'gear-spam' })));
  assert.ok(s.std < 0.9, `level std through shifts ${s.std.toFixed(2)} dB`);
});
