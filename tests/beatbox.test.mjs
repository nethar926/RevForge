/**
 * Beat Box ICE voices: every engine renders offline through the real worklet with no NaN, no
 * clipping and no DC; pops = 0 never produces an overrun pop (pops = 1 does); the test-drive
 * helper shifts up, cuts briefly on each shift, holds the gear on the brake and returns to idle;
 * no storage APIs and no brand names in the module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfflineAudioContext, AudioWorkletNode } from 'node-web-audio-api';

globalThis.AudioWorkletNode ??= AudioWorkletNode;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BB = await import('../src/audio/beatbox/index.ts');
const { countPops } = await import('../scripts/ice-pops.mjs');
const SR = 44100;

/** idle 1 s → 1 s free-rev (brake held = neutral, below the limiter) → lift at LIFT → idle */
const LIFT = 2.0;
async function render(id, { pops = 0, tone = 0.5, drive = 0.7, dur = 5 } = {}) {
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  const eng = await BB.createBeatboxEngine(ctx, ctx.destination, id, { seed: 7, pops, tone, drive });
  const td = BB.createTestDrive({ engine: id, drive });
  td.brake(true);
  for (let k = 0; k * 0.01 < dur; k++) {
    const t = k * 0.01;
    td.gas(t >= 1 && t < LIFT);
    const s = td.tick(0.01);
    eng.update({ rpm: s.rpm, throttle: s.throttle, speed: s.speed }, t);
  }
  eng.start(0);
  return ctx.startRendering();
}

const hot = new Map();
for (const info of BB.BEATBOX_ENGINES) {
  test(`${info.id}: renders offline, finite, no clipping, no DC, audible`, async () => {
    const buf = await render(info.id, { pops: 1, tone: 1, drive: 1 });
    hot.set(info.id, buf);
    for (let c = 0; c < 2; c++) {
      const x = buf.getChannelData(c);
      let peak = 0, sum = 0, sq = 0;
      for (let i = 0; i < x.length; i++) {
        assert.ok(Number.isFinite(x[i]), `finite sample ${i}`);
        peak = Math.max(peak, Math.abs(x[i]));
        sum += x[i];
        sq += x[i] * x[i];
      }
      const rms = Math.sqrt(sq / x.length);
      assert.ok(peak <= 0.9, `peak ${peak.toFixed(3)} under the −1 dBFS ceiling (worst case drive/tone/pops = 1)`);
      assert.ok(Math.abs(sum / x.length) < 1e-3, `DC ${(sum / x.length).toExponential(2)}`);
      assert.ok(rms > 0.005, `audible (rms ${rms.toFixed(4)})`);
    }
  });

  test(`${info.id}: pops 0 → no overrun pops after the lift; pops 1 → pops`, async () => {
    const off = countPops(await render(info.id, { pops: 0 }), LIFT + 0.05);
    assert.equal(off.count, 0, `pops at ${off.times.join(', ')}`);
    const on = countPops(hot.get(info.id) ?? (await render(info.id, { pops: 1, tone: 1, drive: 1 })), LIFT + 0.05);
    assert.ok(on.count >= 1, `pops with pops = 1 (${on.count})`);
  });
}

test('catalogue: six Beat Box engines + np-original, generic ids, sane ranges, real firing tables', () => {
  assert.equal(BB.BEATBOX_ENGINES.length, 7);
  const ids = BB.BEATBOX_ENGINES.map((e) => e.id);
  assert.deepEqual(ids, ['crossplane-v8', 'flatplane-v8', 'turbo-i6', 'flat6-boxer', 'v12-gt', 'twin-rotor', 'np-original']);
  const np = BB.getBeatboxEngine('np-original');
  assert.equal(np.name, 'Original');
  assert.equal(np.backend, 'np-pulse');
  assert.equal(np.voice, undefined, 'np-original plays the Night Pursuit voice, not a Beat Box spec');
  assert.equal(BB.BEATBOX_DEFAULT_ENGINE_ID, 'crossplane-v8');
  assert.equal(BB.BEATBOX_FALLBACK_ENGINE_ID, 'turbo-i6');
  for (const e of BB.BEATBOX_ENGINES) {
    assert.ok(e.idleRpm >= 600 && e.idleRpm < e.redline && e.redline < e.limiterRpm, e.id);
    if (e.backend === 'np-pulse') continue;
    const fire = e.voice.fire.map((f) => f.deg);
    for (let i = 1; i < fire.length; i++) assert.ok(fire[i] > fire[i - 1], `${e.id} angles ascending`);
  }
  // cross-plane: left bank 0/270/450/540 → 270/180/90/180 uneven per-bank intervals
  const cp = BB.getBeatboxEngine('crossplane-v8').voice.fire;
  const left = cp.filter((f) => f.bank === 0).map((f) => f.deg);
  assert.deepEqual(left, [0, 270, 450, 540]);
  // flat-plane: banks alternate every 90°
  assert.deepEqual(BB.getBeatboxEngine('flatplane-v8').voice.fire.map((f) => f.bank), [0, 1, 0, 1, 0, 1, 0, 1]);
  assert.ok(BB.getBeatboxEngine('turbo-i6').voice.turbo, 'turbo six has a turbo');
});

test('test drive: launches, upshifts with a short cut, holds gear on the brake, returns to idle', () => {
  const td = BB.createTestDrive({ engine: 'crossplane-v8', drive: 0.7 });
  const info = BB.getBeatboxEngine('crossplane-v8');
  const dt = 0.005;
  let maxGear = 0, cutRun = 0;
  const cuts = [];
  td.gas(true);
  let prevGear = 0, shiftRpm = [];
  for (let t = 0; t < 9; t += dt) {
    const s = td.tick(dt);
    if (s.gear > prevGear && prevGear >= 1) shiftRpm.push(s.rpm);
    prevGear = s.gear;
    maxGear = Math.max(maxGear, s.gear);
    if (s.shifting) cutRun += dt; else if (cutRun > 0) { cuts.push(cutRun); cutRun = 0; }
    assert.ok(s.rpm <= info.limiterRpm + 60 && s.rpm >= info.idleRpm * 0.9, `rpm in range (${s.rpm.toFixed(0)})`);
  }
  assert.ok(maxGear >= 3, `upshifted to gear ${maxGear}`);
  assert.ok(cuts.length >= 2, 'shift cuts happened');
  for (const c of cuts) assert.ok(c >= 0.075 && c <= 0.16, `shift cut ${(c * 1000).toFixed(0)} ms`);
  // lift: overrun, stays in gear
  td.gas(false);
  const g0 = td.state.gear;
  for (let t = 0; t < 1; t += dt) td.tick(dt);
  assert.equal(td.state.gear, g0, 'stays in gear on lift');
  assert.ok(td.state.throttle < 0.01, 'throttle closed on lift');
  // brake to a stop → downshifts → neutral at idle
  td.brake(true);
  let sawDown = false, last = td.state.gear;
  for (let t = 0; t < 12; t += dt) {
    const s = td.tick(dt);
    if (s.gear > 0 && s.gear < last) sawDown = true;
    last = s.gear || last;
  }
  assert.ok(sawDown, 'downshifted while braking');
  assert.equal(td.state.gear, 0, 'neutral at rest');
  assert.ok(td.state.speed < 0.5, 'stopped');
  assert.ok(Math.abs(td.state.rpm - info.idleRpm) < 60, `idle (${td.state.rpm.toFixed(0)})`);
});

test('test drive: free-rev in neutral bounces off the limiter only at the cap; drive scales shift rpm', () => {
  const info = BB.getBeatboxEngine('flatplane-v8');
  const td = BB.createTestDrive({ engine: info.id, drive: 1 });
  td.brake(true); td.gas(true);
  let lim = 0, peak = 0;
  let was = false;
  for (let t = 0; t < 4; t += 0.005) { const s = td.tick(0.005); if (s.limiter && !was) { lim++; assert.ok(s.rpm >= info.limiterRpm - 50, `cut at ${s.rpm.toFixed(0)}`); } was = s.limiter; peak = Math.max(peak, s.rpm); }
  assert.ok(peak <= info.limiterRpm + 60, 'capped');
  // in gear at speed below the cap: no limiter
  const cruise = BB.createTestDrive({ engine: info.id, drive: 0.5 });
  cruise.gas(true);
  for (let t = 0; t < 6; t += 0.005) assert.equal(cruise.tick(0.005).limiter, false, 'no limiter while upshifting normally');
  assert.ok(lim > 0, 'limiter bounced');
  assert.equal(td.state.gear, 0);
  const shiftAt = (d) => {
    const x = BB.createTestDrive({ engine: info.id, drive: d });
    x.gas(true);
    let prev = 1, at = 0;
    for (let t = 0; t < 8 && !at; t += 0.005) { const s = x.tick(0.005); if (s.gear === 2 && prev === 1) at = s.rpm; prev = s.gear || 1; }
    return at;
  };
  const lo = shiftAt(0), hi = shiftAt(1);
  assert.ok(hi > lo + 1500, `eager shift points scale with drive (${lo.toFixed(0)} → ${hi.toFixed(0)})`);
});

test('module hygiene: no storage APIs, no brand names, typed API surface', () => {
  const dir = join(root, 'src/audio/beatbox');
  const banned = /tesla|plaid|kitt|delorean|ferrari|porsche|lamborghini|mazda|mustang|corvette|hellcat|\bbmw\b|\baudi\b|mercedes|nissan|toyota|honda|subaru|top ?gun|aston|mclaren|dodge|chevrolet|chevy|ford\b|lexus|jaguar|bugatti|pagani/i;
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(src), `${f}: no storage`);
    assert.ok(!banned.test(src), `${f}: no brand names (${src.match(banned)?.[0]})`);
  }
  for (const k of ['createBeatboxEngine', 'createTestDrive', 'loadBeatboxWorklet', 'getBeatboxEngine']) assert.equal(typeof BB[k], 'function', k);
});
