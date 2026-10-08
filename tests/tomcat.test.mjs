/**
 * Tomcat (builtin `aerospace-f14`): procedural twin afterburning-turbofan voice.
 * Pure drive-model tests (zone staging, load vs throttle, spool inertia) + live-chain offline renders
 * through the shipped engine (getter / subscription, DC offset, gesture-only start, safe levels).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createJiti } from 'jiti';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const jiti = createJiti(join(root, 'package.json'));
const voice = await import(pathToFileURL(join(root, 'src/audio/tomcatVoice.js')).href);
const {
  createTomcatDriveState,
  stepTomcatDrive,
  tomcatAbDemand,
  tomcatZoneTarget,
  tomcatSetRunning,
  TC_AB_ZONE_ON,
  TC_AB_FIRST_DELAY,
  TC_AB_ZONE_DELAY,
  TC_AB_DESTAGE_DELAY,
  TC_AB_ZONE_LEVEL,
  TC_MIL_THROTTLE,
} = voice;

const OWNED = [
  'src/audio/tomcatPack.ts',
  'src/audio/tomcatVoice.js',
  'src/audio/tomcatVoice.d.ts',
  'scripts/tomcat-render.mjs',
  'scripts/live-engine-render.mjs',
  'scripts/spectrum.mjs',
  'docs/tomcat-engine.md',
  'tests/tomcat.test.mjs',
];
// Built from fragments so this file stays clean of the strings it guards against.
const BANNED = [
  ['top\\s*', 'gun'],
  ['\\bmave', 'rick\\b'],
  ['\\bgoo', 'se\\b'],
  ['\\bice', 'man\\b'],
  ['grum', 'man'],
  ['jo', 'lly\\s*', 'rog', 'ers'],
  ['\\bvf-?', '\\d+\\b'],
].map((p) => new RegExp(p.join(''), 'i'));
const DISPLAY_LABEL = new RegExp(['aerospace[ _]?', 'f-?14'].join(''), 'i');

/** Run the drive model at 60 Hz from a settled running state. */
function runDrive(state, inputAt, seconds, params = {}) {
  const frames = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds - 1e-9; t += dt) frames.push({ t: t + dt, ...stepTomcatDrive(state, inputAt(t), dt, params) });
  return frames;
}
const settled = (input = { speed: 0.6, throttle: 0.8, load: 0.8 }) => {
  const s = createTomcatDriveState('off');
  tomcatSetRunning(s);
  runDrive(s, () => input, 12);
  return s;
};

test('identity: builtin keeps id/topology/snippet, label is Tomcat, voice selected only for it', async () => {
  const pack = await jiti.import(join(root, 'src/audio/tomcatPack.ts'));
  const builtins = await jiti.import(join(root, 'src/audio/builtins.ts'));
  const b = builtins.getBuiltin('aerospace-f14');
  assert.equal(b.id, 'aerospace-f14');
  assert.equal(b.topology, 'aerospace-f14');
  assert.equal(b.name, 'Tomcat');
  assert.equal(pack.TOMCAT_PACK.name, 'Tomcat');
  assert.ok(pack.isTomcatPatch(b));
  assert.ok(pack.isTomcatPatch({ id: 'copy-1', kind: 'aerospace', params: { tomcatVoice: 1 } }));
  assert.ok(!pack.isTomcatPatch({ id: 'other', kind: 'aerospace', params: {} }), 'other aerospace patches keep the legacy graph');
  assert.ok(!pack.isTomcatPatch({ id: 'aerospace-f14', kind: 'ice', params: {} }));
  const meta = builtins.paramMetaForKind('aerospace', 'aerospace-f14').map((m) => m.id);
  for (const id of ['tcIdleOn', 'tcIdleGain', 'tcWhineOn', 'tcFanOn', 'tcRoarOn', 'tcAbOn', 'tcMechOn', 'tcLevel']) assert.ok(meta.includes(id), id);
});

test('owned files: no banned names, no user-visible pack-id display label, no storage', () => {
  for (const rel of OWNED) {
    const src = read(rel);
    for (const re of BANNED) assert.ok(!re.test(src), `${rel} matches ${re}`);
    assert.ok(!DISPLAY_LABEL.test(src), `${rel} has a display label`);
    if (rel.startsWith('src/')) assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(src), `${rel} touches storage`);
  }
  const voiceSrc = read('src/audio/tomcatVoice.js');
  assert.ok(!/decodeAudioData|fetch\(|\.wav|\.mp3|ConvolverNode|createConvolver|PeriodicWave/.test(voiceSrc), 'procedural only');
});

test('AB demand: load when provided, throttle only when load is undefined', () => {
  assert.equal(tomcatAbDemand({ throttle: 1, load: 0.3 }), 0.3);
  assert.equal(tomcatAbDemand({ throttle: 1, load: 0 }), 0);
  assert.equal(tomcatAbDemand({ throttle: 0.9 }), 0.9);
  assert.equal(tomcatAbDemand({ throttle: 0.9, load: undefined }), 0.9);
  assert.equal(tomcatAbDemand({ throttle: 0.9, load: null }), 0.9);
  // thresholds: every zone above military power, strictly increasing
  assert.equal(TC_AB_ZONE_ON.length, 5);
  assert.ok(TC_AB_ZONE_ON[0] > TC_MIL_THROTTLE);
  for (let k = 1; k < 5; k++) assert.ok(TC_AB_ZONE_ON[k] > TC_AB_ZONE_ON[k - 1]);
  assert.equal(tomcatZoneTarget(0.95, 0, 1), 4);
  assert.equal(tomcatZoneTarget(1, 0, 0.5), 0, 'spool gate: no AB before the engines reach the light-up spool');
  // full throttle with load below mil (e.g. coasting) never lights the burner
  const s = settled();
  const f = runDrive(s, () => ({ speed: 0.6, throttle: 1, load: 0.5 }), 3);
  assert.ok(f.every((x) => x.abZone === 0));
});

test('AB staging: zones light 1→5 one at a time with the documented delays, then de-stage 5→0', () => {
  const s = settled();
  const lit = runDrive(s, () => ({ speed: 0.7, throttle: 1, load: 1 }), 2);
  const changes = [];
  let prev = 0;
  for (const f of lit) {
    if (f.abZone !== prev) {
      assert.equal(f.abZone, prev + 1, 'sequential light (no skipped zones)');
      changes.push(f.t);
      prev = f.abZone;
    }
  }
  assert.equal(prev, 5);
  assert.ok(Math.abs(changes[0] - TC_AB_FIRST_DELAY) < 1 / 30, `zone 1 after ${changes[0]}`);
  for (let k = 1; k < 5; k++) assert.ok(Math.abs(changes[k] - changes[k - 1] - TC_AB_ZONE_DELAY) < 1 / 30);
  const total = changes[4];
  assert.ok(total >= 0.3 && total <= 1.2, `fast staged whump, total ${total.toFixed(2)} s`);
  // light events carry the zone numbers in order
  const evs = lit.flatMap((f) => f.events).filter((e) => e.type === 'abLight').map((e) => e.zone);
  assert.deepEqual(evs, [1, 2, 3, 4, 5]);
  // audio level glides up (never a raw jump) and tracks the zone curve
  for (let i = 1; i < lit.length; i++) assert.ok(lit[i].abLevel - lit[i - 1].abLevel < 0.2);
  // partial demand → partial zone (from zone 5 the hysteresis keeps zone 2 lit at 0.88)
  const part = runDrive(s, () => ({ speed: 0.7, throttle: 1, load: 0.88 }), 2);
  assert.equal(part.at(-1).abZone, 2);
  assert.ok(TC_AB_ZONE_ON[0] - voice.TC_AB_HYSTERESIS > TC_MIL_THROTTLE, 'zone 1 goes out at military power');
  // back to mil → clean sequential de-stage
  const down = runDrive(s, () => ({ speed: 0.7, throttle: 0.8, load: 0.8 }), 1);
  prev = 2;
  for (const f of down) {
    if (f.abZone !== prev) {
      assert.equal(f.abZone, prev - 1, 'sequential de-stage');
      prev = f.abZone;
    }
  }
  assert.equal(prev, 0);
  assert.ok(TC_AB_DESTAGE_DELAY < TC_AB_ZONE_DELAY, 'de-stage is quicker than light-up');
  assert.deepEqual([...TC_AB_ZONE_LEVEL], [...TC_AB_ZONE_LEVEL].sort((a, b) => a - b));
});

test('AB hysteresis + fallback: throttle stages zones when load is omitted', () => {
  const s = settled({ speed: 0.6, throttle: 0.8 });
  const up = runDrive(s, () => ({ speed: 0.6, throttle: 1 }), 2);
  assert.equal(up.at(-1).abZone, 5);
  // a small dip just below zone 5's on-threshold holds zone 5 (hysteresis)
  const hold = runDrive(s, () => ({ speed: 0.6, throttle: TC_AB_ZONE_ON[4] - 0.01 }), 1);
  assert.equal(hold.at(-1).abZone, 5);
});

test('spool inertia: idle→mil takes seconds, spool-down is faster; the twins are detuned', () => {
  const s = settled({ speed: 0, throttle: 0, load: 0 });
  const up = runDrive(s, () => ({ speed: 0, throttle: 0.8, load: 0.8 }), 10);
  const t90 = up.find((f) => f.spool >= 0.9)?.t;
  assert.ok(t90 > 2 && t90 < 7, `idle→90% mil in ${t90}`);
  const down = runDrive(s, () => ({ speed: 0, throttle: 0, load: 0 }), 10);
  const t10 = down.find((f) => f.spool <= 0.1)?.t;
  assert.ok(t10 < t90, `spool-down ${t10} faster than spool-up ${t90}`);
  const f = up.at(-1);
  assert.notEqual(f.n2a, f.n2b, 'two engines slightly apart');
  assert.ok(Math.abs(f.n2a - f.n2b) < 0.02);
});

// ── live chain (CharacterEngine → EngineSynthImpl → TomcatVoice), offline ──
const { renderLive, channelsOf } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);

test('engine API: getAfterburnerZone() + onAfterburnerZoneChange(cb) report sequential light and de-stage', async () => {
  const seen = [];
  const polled = [];
  let unsub;
  let hadApi = false;
  const S = (mph) => mph / 120;
  const profile = (t) => (t < 5 ? { speed: S(80), throttle: 0.8, load: 0.8 } : t < 7 ? { speed: S(90), throttle: 1, load: 1 } : { speed: S(90), throttle: 0.8, load: 0.8 });
  // Brisk spool (tcSpoolTime 0) keeps the render short; staging delays do not depend on it.
  await renderLive(profile, 8.5, {
    patchId: 'aerospace-f14',
    seed: 'tomcat-test-zones',
    params: { tcSpoolTime: 0 },
    fps: 30,
    onFrame: (engine, t) => {
      if (!unsub) {
        hadApi = typeof engine.getAfterburnerZone === 'function' && typeof engine.onAfterburnerZoneChange === 'function';
        unsub = engine.onAfterburnerZoneChange((z) => seen.push(z));
      }
      const z = engine.getAfterburnerZone();
      if (polled.at(-1)?.z !== z) polled.push({ t, z });
      if (t > 8.2 && unsub) {
        unsub();
        unsub = () => {};
      }
    },
  });
  assert.ok(hadApi, 'CharacterEngine exposes the getter + subscription');
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(polled.map((p) => p.z), [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
  const t1 = polled[1].t;
  const t5 = polled[5].t;
  assert.ok(t1 >= 5 && t1 < 5.5, `zone 1 at ${t1}`);
  assert.ok(t5 - t1 > 0.5 && t5 - t1 < 0.9, `zones 1→5 over ${(t5 - t1).toFixed(2)} s`);
  for (const p of polled) assert.ok(Number.isInteger(p.z) && p.z >= 0 && p.z <= 5);
});

test('no DC offset, safe peaks, AB louder than cruise, cruise near its calibrated level', async () => {
  const S = (mph) => mph / 120;
  const profile = (t) => (t < 8 ? { speed: S(45), throttle: 0.22, load: 0.22 } : t < 11.5 ? { speed: S(80), throttle: 0.8, load: 0.8 } : { speed: S(100), throttle: 1, load: 1 });
  const buf = await renderLive(profile, 15, { patchId: 'aerospace-f14', seed: 'tomcat-test-dc', fps: 30 });
  const { integratedLufs, samplePeakDb } = await import(pathToFileURL(join(root, 'scripts/loudness.mjs')).href);
  const cruise = channelsOf(buf, 4, 8);
  const ab = channelsOf(buf, 13, 15);
  for (const seg of [cruise, ab, channelsOf(buf, 0, 15)]) {
    for (const ch of seg) {
      let sum = 0;
      let sq = 0;
      for (const v of ch) {
        assert.ok(Number.isFinite(v));
        sum += v;
        sq += v * v;
      }
      const mean = sum / ch.length;
      const rms = Math.sqrt(sq / ch.length);
      assert.ok(Math.abs(mean) < 1e-3 && Math.abs(mean) < rms * 0.05, `DC ${mean} vs rms ${rms}`);
    }
  }
  const lc = integratedLufs(cruise, buf.sampleRate);
  const la = integratedLufs(ab, buf.sampleRate);
  assert.ok(lc > -33 && lc < -29, `cruise ${lc.toFixed(1)} LUFS (calibrated ≈ -30.9)`);
  assert.ok(la > lc + 6, `afterburner ${la.toFixed(1)} vs cruise ${lc.toFixed(1)}`);
  assert.ok(samplePeakDb(ab) < -3, `AB peak ${samplePeakDb(ab).toFixed(1)} dBFS`);
  // low end leads at full afterburner: dark centroid, most energy below 200 Hz
  const { powerSpectrum } = await import(pathToFileURL(join(root, 'scripts/spectrum.mjs')).href);
  const { ps, df } = powerSpectrum(ab, buf.sampleRate);
  let tot = 0;
  let cen = 0;
  let lo = 0;
  for (let k = 1; k < ps.length; k++) {
    tot += ps[k];
    cen += ps[k] * k * df;
    if (k * df < 200) lo += ps[k];
  }
  assert.ok(cen / tot < 400, `AB centroid ${Math.round(cen / tot)} Hz`);
  assert.ok(lo / tot > 0.45, `AB energy below 200 Hz ${(100 * lo / tot).toFixed(0)} %`);
});

test('gesture-only start: setDriving before start() is silent; start() runs the start sequence', async () => {
  const buf = await renderLive(() => ({ speed: 0.3, throttle: 0.6, load: 0.6 }), 5, {
    patchId: 'aerospace-f14',
    seed: 'tomcat-test-gesture',
    fps: 30,
    startAt: 2,
    driveBeforeStart: true,
  });
  const peak = (a, b) => Math.max(...channelsOf(buf, a, b).map((ch) => ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  assert.ok(peak(0, 1.98) < 1e-5, `silent before the gesture (${peak(0, 1.98)})`);
  assert.ok(peak(3, 5) > 1e-3, 'audible after start()');
  // source contract: constructing the engine never starts/resumes audio by itself
  const impl = read('src/audio/EngineSynthImpl.ts');
  const ctor = impl.slice(impl.indexOf('constructor('), impl.indexOf('constructor(') + 4000);
  assert.ok(!/\.resume\(\)|tomcatBeginStart/.test(ctor.slice(0, ctor.indexOf('\n  }\n'))), 'constructor stays passive');
});
