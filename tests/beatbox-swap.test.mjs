/**
 * Beat Box runtime engine swap (setEngine): offline renders through the real worklets.
 * Mid-render swap at steady rpm → no discontinuity spike above the steady level (sample-to-sample
 * delta and peak in the crossfade window), finite output, old worklet node disconnected only after
 * the fade, rapid swaps end on the last id with no leaked nodes, swap-to-same is a no-op, unknown
 * ids reject and leave the current voice playing. Includes np-original (Night Pursuit adapter).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineAudioContext, AudioWorkletNode } from 'node-web-audio-api';

/** Track every worklet node the engine builds: processor, creation time, disconnect time. */
const nodes = [];
class TrackedWorkletNode extends AudioWorkletNode {
  constructor(ctx, name, o) {
    super(ctx, name, o);
    this.rec = { name, engine: o?.processorOptions?.spec ? 'beatbox' : 'pulse', born: ctx.currentTime, gone: null };
    nodes.push(this.rec);
  }
  disconnect(...a) {
    if (this.rec.gone === null) this.rec.gone = this.context.currentTime;
    return super.disconnect(...a);
  }
}
globalThis.AudioWorkletNode = TrackedWorkletNode;
const BB = await import('../src/audio/beatbox/index.ts');
const SR = 44100;
const RPM = 2500, THR = 0.3, KMH = 60;
const SWAP = 0.6, FADE = 0.3;

function stats(buf, t0, t1) {
  let pk = 0, d = 0, fin = true;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    const a = Math.floor(t0 * SR), b = Math.min(x.length, Math.floor(t1 * SR));
    for (let i = a; i < b; i++) {
      if (!Number.isFinite(x[i])) fin = false;
      pk = Math.max(pk, Math.abs(x[i]));
      if (i > a) d = Math.max(d, Math.abs(x[i] - x[i - 1]));
    }
  }
  return { pk, d, fin };
}
/** Largest 20 ms RMS in a window (catches a loudness bump, not just single-sample spikes). */
function maxRms(buf, t0, t1, w = 0.02) {
  let m = 0;
  for (let t = t0; t + w <= t1 + 1e-9; t += w / 2) {
    let s = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const x = buf.getChannelData(c);
      for (let i = Math.floor(t * SR); i < Math.floor((t + w) * SR); i++) { s += x[i] * x[i]; n++; }
    }
    m = Math.max(m, Math.sqrt(s / n));
  }
  return m;
}

/**
 * Render `dur` s at steady rpm on `from`; `plan` = [[t, () => promise-returning action]] run at
 * suspend points; `checks` = [[t, fn(eng)]] observe state mid-render.
 */
async function render(from, { plan = [], checks = [], dur = 1.4, seed = 7 } = {}) {
  nodes.length = 0;
  const ctx = new OfflineAudioContext(2, Math.round(SR * dur), SR);
  const eng = await BB.createBeatboxEngine(ctx, ctx.destination, from, { seed, drive: 0.7, tone: 0.5, pops: 0 });
  eng.update({ rpm: RPM, throttle: THR, speed: KMH }, 0);
  eng.start(0);
  const errors = [];
  const at = new Map();
  for (const [t, f] of [...plan, ...checks]) {
    const k = Math.round(t * SR / 128) * 128 / SR; // render-quantum aligned
    if (!at.has(k)) at.set(k, []);
    at.get(k).push(f);
  }
  for (const [k, fs] of at) {
    ctx.suspend(k).then(async () => {
      try { for (const f of fs) await f(eng, ctx); } catch (e) { errors.push(e); }
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  await new Promise((r) => setTimeout(r, 20)); // let trailing onended events land
  if (errors.length) throw errors[0];
  return { buf, eng, nodes: nodes.slice() };
}

function assertSmooth(t, buf, label, swapT = SWAP, endT = SWAP + FADE) {
  const pre = stats(buf, 0.3, swapT);
  const post = stats(buf, endT + 0.1, buf.duration);
  const xf = stats(buf, swapT, endT + 0.05);
  const steadyD = Math.max(pre.d, post.d);
  const steadyRms = Math.max(maxRms(buf, 0.3, swapT), maxRms(buf, endT + 0.1, buf.duration));
  const xfRms = maxRms(buf, swapT, endT + 0.05);
  t.diagnostic(
    `${label}: steady peak ${pre.pk.toFixed(3)} → ${post.pk.toFixed(3)} / max |Δ| ${steadyD.toFixed(4)} / 20ms RMS ${steadyRms.toFixed(4)}; ` +
      `crossfade peak ${xf.pk.toFixed(3)} (envelope ${Math.hypot(pre.pk, post.pk).toFixed(3)}) / max |Δ| ${xf.d.toFixed(4)} / 20ms RMS ${xfRms.toFixed(4)}`,
  );
  assert.ok(pre.fin && post.fin && xf.fin, 'output finite');
  // Two uncorrelated voices at equal-power gains (cos, sin) can line their peaks up mid-fade: the
  // honest envelope is max(cos·a + sin·b) = √(a² + b²), never more (a jump or click would be).
  const env = Math.hypot(pre.pk, post.pk);
  assert.ok(xf.pk <= env * 1.15, `crossfade peak ${xf.pk.toFixed(3)} ≤ equal-power envelope ${env.toFixed(3)}`);
  assert.ok(xf.d <= steadyD * 1.25, `crossfade max |Δ| ${xf.d.toFixed(4)} ≤ 1.25 × steady ${steadyD.toFixed(4)}`);
  assert.ok(xfRms <= steadyRms * 1.25, `no loudness bump (${xfRms.toFixed(4)} vs ${steadyRms.toFixed(4)})`);
  assert.ok(post.pk > 0.01, 'new voice audible after the fade');
}

for (const [from, to] of [['crossplane-v8', 'turbo-i6'], ['crossplane-v8', 'np-original'], ['np-original', 'v12-gt']]) {
  test(`swap ${from} → ${to} mid-render at steady rpm: smooth, finite, old node freed after the fade`, async (t) => {
    let midFade = null, ids = [];
    const { buf, eng, nodes: ns } = await render(from, {
      plan: [[SWAP, (e) => e.setEngine(to).then(() => ids.push(e.id, e.info.id))]],
      checks: [[SWAP + FADE / 2, () => { midFade = nodes.map((n) => n.gone); }]],
    });
    assert.deepEqual(ids, [to, to], 'id / info switch when the swap starts');
    assert.equal(eng.id, to);
    assertSmooth(t, buf, `${from} → ${to}`);
    assert.equal(ns.length, 2, 'exactly one new worklet node');
    const [old, neu] = ns;
    assert.equal(midFade[0], null, 'old node still connected mid-fade');
    assert.ok(old.gone !== null, 'old node disconnected after the fade');
    assert.ok(old.gone >= SWAP + FADE - 0.005, `disconnected at ${old.gone.toFixed(3)} s, after the fade end`);
    assert.equal(neu.gone, null, 'new node live');
    eng.dispose();
    assert.ok(neu.gone !== null, 'dispose frees the current voice');
  });
}

test('rapid swaps: last call wins, no leaked nodes, no clicks (sync triple + spaced triple)', async (t) => {
  // three calls in the same tick: only the last builds a voice
  {
    const { buf, eng, nodes: ns } = await render('crossplane-v8', {
      plan: [[SWAP, (e) => Promise.all([e.setEngine('v12-gt'), e.setEngine('twin-rotor'), e.setEngine('flat6-boxer')])]],
    });
    assert.equal(eng.id, 'flat6-boxer');
    assert.equal(ns.length, 2, `superseded calls build nothing (${ns.length - 1} new nodes)`);
    assert.ok(ns[0].gone !== null && ns[1].gone === null, 'old freed, last live');
    assertSmooth(t, buf, 'sync triple → flat6-boxer');
    eng.dispose();
  }
  // three calls 100 ms apart, each landing mid-fade of the previous one, ending on np-original
  {
    const plan = [[SWAP, (e) => e.setEngine('v12-gt')], [SWAP + 0.1, (e) => e.setEngine('twin-rotor')], [SWAP + 0.2, (e) => e.setEngine('np-original')]];
    const { buf, eng, nodes: ns } = await render('crossplane-v8', { plan, dur: 1.6 });
    assert.equal(eng.id, 'np-original');
    assert.equal(ns.length, 4);
    for (const n of ns.slice(0, 3)) assert.ok(n.gone !== null, 'every superseded voice freed');
    assert.equal(ns[3].gone, null, 'last voice live');
    assert.equal(ns[3].engine, 'pulse', 'np-original runs the Night Pursuit pulse worklet');
    assertSmooth(t, buf, 'spaced triple → np-original', SWAP, SWAP + 0.2 + FADE);
    eng.dispose();
  }
});

test('swap to the current id is a no-op (bit-identical output, no node); same id cancels a pending swap', async () => {
  const ref = (await render('crossplane-v8')).buf;
  let resolved = false;
  const r = await render('crossplane-v8', { plan: [[SWAP, (e) => e.setEngine('crossplane-v8').then(() => { resolved = true; })]] });
  assert.ok(resolved);
  assert.equal(r.nodes.length, 1, 'no voice built');
  for (let c = 0; c < 2; c++) assert.deepEqual(r.buf.getChannelData(c), ref.getChannelData(c), 'bit-identical to no swap');
  const p = await render('crossplane-v8', { plan: [[SWAP, (e) => Promise.all([e.setEngine('turbo-i6'), e.setEngine('crossplane-v8')])]] });
  assert.equal(p.eng.id, 'crossplane-v8');
  assert.equal(p.nodes.length, 1, 'pending turbo-i6 swap was cancelled');
  r.eng.dispose(); p.eng.dispose();
});

test('unknown id rejects and leaves the current voice playing; crossfadeMs is clamped', async () => {
  let err = null;
  const { buf, eng, nodes: ns } = await render('turbo-i6', {
    plan: [
      [SWAP, (e) => e.setEngine('warp-drive').catch((x) => { err = x; })],
      [SWAP + 0.05, (e) => assert.equal(e.id, 'turbo-i6')],
    ],
  });
  assert.match(String(err?.message), /unknown Beat Box engine: warp-drive/);
  assert.equal(eng.id, 'turbo-i6');
  assert.equal(ns.length, 1);
  assert.ok(stats(buf, SWAP, buf.duration).pk > 0.01, 'still audible after the rejected swap');
  eng.dispose();
  // crossfadeMs: 5000 → clamped to 2 s (old voice still connected 1.5 s in); 0 → 5 ms de-click fade
  const long = await render('crossplane-v8', {
    dur: 2.4,
    plan: [[0.3, (e) => e.setEngine('turbo-i6', { crossfadeMs: 5000 })]],
    checks: [[1.8, () => assert.equal(nodes[0].gone, null, 'still fading at 1.5 s')]],
  });
  assert.ok(long.nodes[0].gone !== null && long.nodes[0].gone >= 2.29, `freed after the 2 s fade (${long.nodes[0].gone})`);
  long.eng.dispose();
  const cut = await render('crossplane-v8', { plan: [[SWAP, (e) => e.setEngine('v12-gt', { crossfadeMs: 0 })]] });
  const s = stats(cut.buf, SWAP - 0.01, SWAP + 0.02), pre = stats(cut.buf, 0.3, SWAP);
  assert.ok(s.fin && s.d <= pre.d * 1.5, `0 ms swap de-clicked (|Δ| ${s.d.toFixed(4)} vs ${pre.d.toFixed(4)})`);
  assert.ok(cut.nodes[0].gone !== null && cut.nodes[0].gone < SWAP + 0.1, 'freed right after the short fade');
  cut.eng.dispose();
});
