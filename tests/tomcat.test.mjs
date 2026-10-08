/**
 * Tomcat (builtin `aerospace-f14`): procedural twin afterburning-turbofan voice.
 * Pure drive-model tests (speed engage, zone staging, load vs throttle, spool inertia, no gears) +
 * live-chain offline renders through the shipped engine (getter / subscription, DC offset,
 * gesture-only start, safe levels, gear signals inert).
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
  TC_AB_ENGAGE_SPEED,
  TC_AB_DISENGAGE_SPEED,
  tomcatAbEngaged,
} = voice;
/** Normalised setDriving speed (1.0 ≙ 120 mph, mphToSpeed default). */
const mph = (m) => m / 120;

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
  // below the engage speed nothing lights, whatever the pedal / load
  const s = settled();
  const f = runDrive(s, () => ({ speed: mph(72), throttle: 1, load: 1 }), 3);
  assert.ok(f.every((x) => x.abZone === 0));
  // engaged (≥ 75 mph) with a low load (e.g. coasting): zone 1 is the engaged minimum, never more
  const coast = runDrive(s, () => ({ speed: mph(90), throttle: 1, load: 0.5 }), 3);
  assert.equal(coast.at(-1).abZone, 1);
  assert.ok(coast.every((x) => x.abZone <= 1));
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
  // back to mil while still engaged → de-stage to the zone-1 minimum
  const mil = runDrive(s, () => ({ speed: 0.7, throttle: 0.8, load: 0.8 }), 1);
  assert.equal(mil.at(-1).abZone, 1);
  // below 72 mph → clean sequential de-stage to 0
  const up5 = runDrive(s, () => ({ speed: 0.7, throttle: 1, load: 1 }), 2);
  assert.equal(up5.at(-1).abZone, 5);
  const down = runDrive(s, () => ({ speed: mph(71), throttle: 1, load: 1 }), 1);
  prev = 5;
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
  const s = settled({ speed: mph(90), throttle: 0.8 });
  const up = runDrive(s, () => ({ speed: mph(90), throttle: 1 }), 2);
  assert.equal(up.at(-1).abZone, 5);
  // a small dip just below zone 5's on-threshold holds zone 5 (hysteresis)
  const hold = runDrive(s, () => ({ speed: mph(90), throttle: TC_AB_ZONE_ON[4] - 0.01 }), 1);
  assert.equal(hold.at(-1).abZone, 5);
});

test('AB engages by speed: 0 at 74 mph full throttle, engages at 75, stays at 73, drops at 71.9', () => {
  // unit: 75 mph = 120.7 km/h = 33.53 m/s → 0.625 normalised; 72 mph → 0.6
  assert.equal(TC_AB_ENGAGE_SPEED, 0.625);
  assert.equal(TC_AB_DISENGAGE_SPEED, 0.6);
  assert.ok(Math.abs((120.7 / 1.609344) / 120 - TC_AB_ENGAGE_SPEED) < 1e-4);
  assert.ok(Math.abs((33.53 * 2.2369362920544) / 120 - TC_AB_ENGAGE_SPEED) < 1e-4);
  assert.equal(tomcatAbEngaged(mph(74.99), false), false);
  assert.equal(tomcatAbEngaged(mph(75), false), true);
  assert.equal(tomcatAbEngaged(mph(72), true), true);
  assert.equal(tomcatAbEngaged(mph(71.99), true), false);
  const full = (m) => () => ({ speed: mph(m), throttle: 1, load: 1 });
  const s = settled({ speed: mph(60), throttle: 1, load: 1 });
  const at74 = runDrive(s, full(74), 3);
  assert.ok(at74.every((f) => f.abZone === 0 && !f.abEngaged), 'no AB at 74 mph, full throttle');
  const at75 = runDrive(s, full(75), 2);
  assert.ok(at75[0].abEngaged, 'engages on the first frame at 75 mph');
  assert.equal(at75.find((f) => f.abZone > 0).abZone, 1, 'zone 1 first');
  assert.ok(Math.abs(at75.find((f) => f.abZone > 0).t - TC_AB_FIRST_DELAY) < 1 / 30, 'normal ignition delay');
  assert.equal(at75.at(-1).abZone, 5, 'full demand stages to zone 5');
  const at73 = runDrive(s, full(73), 3);
  assert.ok(at73.every((f) => f.abZone === 5 && f.abEngaged), 'stays engaged at 73 mph');
  const at72 = runDrive(s, full(72), 1);
  assert.ok(at72.every((f) => f.abZone === 5), 'still engaged at exactly 72 mph');
  const at719 = runDrive(s, full(71.9), 1);
  assert.ok(!at719[0].abEngaged, 'disengages below 72 mph');
  assert.equal(at719.at(-1).abZone, 0, 'drops to 0 at 71.9 mph');
  // no chatter: speed wobbling 72.5..74.5 mph from below never engages; 72.5..74.5 from above never drops
  const s2 = settled({ speed: mph(70), throttle: 1, load: 1 });
  const wobble = (t) => ({ speed: mph(73.5 + Math.sin(t * 9) * 1), throttle: 1, load: 1 });
  assert.ok(runDrive(s2, wobble, 3).every((f) => f.abZone === 0));
  runDrive(s2, full(80), 2);
  assert.ok(runDrive(s2, wobble, 3).every((f) => f.abZone === 5));
});

test('AB staging while engaged: zone 1 minimum, zones 2-5 by throttle / load as before', () => {
  const s = settled({ speed: mph(90), throttle: 0.8, load: 0.8 });
  const zoneAt = (load, sec = 2) => runDrive(s, () => ({ speed: mph(90), throttle: load, load }), sec).at(-1).abZone;
  // rising demand: the documented on-thresholds
  assert.equal(zoneAt(0), 1, 'engaged, pedal up → zone 1');
  assert.equal(zoneAt(0.8), 1, 'military power → zone 1');
  assert.equal(zoneAt(TC_AB_ZONE_ON[0]), 1);
  assert.equal(zoneAt(TC_AB_ZONE_ON[1]), 2);
  assert.equal(zoneAt(TC_AB_ZONE_ON[2]), 3);
  assert.equal(zoneAt(TC_AB_ZONE_ON[3]), 4);
  assert.equal(zoneAt(TC_AB_ZONE_ON[4]), 5);
  // falling demand: per-zone hysteresis, then back to the zone-1 minimum
  assert.equal(zoneAt(TC_AB_ZONE_ON[4] - 0.01), 5);
  assert.equal(zoneAt(TC_AB_ZONE_ON[2]), 3);
  assert.equal(zoneAt(0.5), 1);
  // the zone levels and delays are the approved ones (sound unchanged once engaged)
  assert.deepEqual([...TC_AB_ZONE_ON], [0.83, 0.87, 0.91, 0.945, 0.975]);
  assert.deepEqual([...TC_AB_ZONE_LEVEL], [0, 0.4, 0.58, 0.74, 0.88, 1]);
  assert.deepEqual([TC_AB_FIRST_DELAY, TC_AB_ZONE_DELAY, TC_AB_DESTAGE_DELAY], [0.15, 0.16, 0.07]);
  // shutdown still puts the burner out even above the engage speed
  voice.tomcatBeginShutdown(s);
  assert.equal(runDrive(s, () => ({ speed: mph(90), throttle: 1, load: 1 }), 1).at(-1).abZone, 0);
});

/**
 * A car-sim style 0 → 150 mph sweep (what a gearbox sim sends): 6 gears, rpm / rpmNorm sawtooth,
 * `shifting` for 0.18 s at every gear change with the throttle dipped to 30 %, plus an upshift cue.
 */
function gearSweep(t, t0, t1, opts = {}) {
  const top = 150;
  const m = top * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  const band = 25;
  const gear = Math.min(6, 1 + Math.floor(m / band));
  const gearStart = (t0 + ((gear - 1) * band * (t1 - t0)) / top);
  const shifting = gear > 1 && t - gearStart < 0.18;
  const rpmNorm = gear === 6 ? Math.min(1, (m - 5 * band) / band) : (m % band) / band;
  const load = opts.noLoad ? undefined : 1;
  return {
    clean: { speed: mph(m), throttle: 1, ...(opts.noLoad ? {} : { load }) },
    geared: { speed: mph(m), throttle: shifting ? 0.3 : 1, ...(opts.noLoad ? {} : { load }), rpm: 900 + rpmNorm * 6100, rpmNorm, shifting },
    gear,
  };
}
const gearChangeTimes = (t0, t1, fps) => {
  const out = [];
  let prev = 1;
  for (let i = 0; i * (1 / fps) <= t1 + 1; i++) {
    const t = i / fps;
    const g = gearSweep(t, t0, t1).gear;
    if (g !== prev) out.push(t);
    prev = g;
  }
  return out;
};

test('no gears (drive model): a 0→150 mph gearbox sweep leaves spool + AB identical, no shift events', () => {
  for (const noLoad of [false, true]) {
    const seeded = (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = Math.imul(a ^ (a >>> 15), 1 | a);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
    };
    const run = (kind) => {
      const real = Math.random;
      Math.random = seeded(7);
      try {
        const s = settled({ speed: 0, throttle: 0, load: 0 });
        return runDrive(s, (t) => gearSweep(t, 0, 20, { noLoad })[kind], 24);
      } finally {
        Math.random = real;
      }
    };
    const clean = run('clean');
    const geared = run('geared');
    assert.equal(geared.length, clean.length);
    let maxDiff = 0;
    for (let i = 0; i < clean.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(clean[i].spool - geared[i].spool), Math.abs(clean[i].abLevel - geared[i].abLevel));
      assert.equal(geared[i].abZone, clean[i].abZone);
    }
    assert.ok(maxDiff < 1e-12, `gear signals moved the jet (${maxDiff}, noLoad ${noLoad})`);
    // only engine events: no gear / shift events of any kind
    const types = new Set(geared.flatMap((f) => f.events.map((e) => e.type)));
    for (const t of types) assert.ok(['abLight', 'abDestage', 'stall', 'lightoff', 'igniter'].includes(t), t);
    assert.ok(!Object.keys(geared.at(-1)).some((k) => /gear|shift/i.test(k)), 'snapshot has no gear fields');
    // spool climbs smoothly (no saw-tooth): never drops more than the twin wander allows
    for (let i = 1; i < geared.length; i++) assert.ok(geared[i].spool - geared[i - 1].spool > -0.002, `spool dip at ${geared[i].t}`);
    // the burner engages once, when the sweep passes 75 mph (t = 10 s), and stays lit to 150 mph
    const firstLit = geared.find((f) => f.abZone > 0);
    assert.ok(firstLit.t >= 10 && firstLit.t < 10.3, `AB at ${firstLit.t}`);
    const lightEvents = geared.flatMap((f) => f.events).filter((e) => e.type === 'abLight').map((e) => e.zone);
    assert.deepEqual(lightEvents, [1, 2, 3, 4, 5]);
  }
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

test('engine API: getAfterburnerZone() + onAfterburnerZoneChange(cb) follow the speed engage, once per change', async () => {
  const seen = [];
  const polled = [];
  let unsub;
  let hadApi = false;
  const S = (mph) => mph / 120;
  // full throttle at 74 mph (no AB) → 75 mph (engage, zones 1-5) → 71.9 mph (disengage)
  const profile = (t) => (t < 5 ? { speed: S(74), throttle: 1, load: 1 } : t < 7 ? { speed: S(75), throttle: 1, load: 1 } : { speed: S(71.9), throttle: 1, load: 1 });
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
  // one call per zone change: engage, staging, disengage; never a repeat of the same zone
  assert.deepEqual(seen, [1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
  assert.deepEqual(polled.map((p) => p.z), [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
  const t1 = polled[1].t;
  const t5 = polled[5].t;
  assert.ok(t1 >= 5 && t1 < 5.5, `zone 1 at ${t1}`);
  assert.ok(t5 - t1 > 0.5 && t5 - t1 < 0.9, `zones 1→5 over ${(t5 - t1).toFixed(2)} s`);
  for (const p of polled) assert.ok(Number.isInteger(p.z) && p.z >= 0 && p.z <= 5);
  const t0 = polled[10].t;
  assert.ok(t0 >= 7 && t0 < 7.6, `disengaged at ${t0}`);
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
  // heavy-bass AB sits close to the ceiling; peaks stay under −1 dBFS on the car output
  assert.ok(samplePeakDb(ab) < -1, `AB peak ${samplePeakDb(ab).toFixed(1)} dBFS`);
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

test('heavy bass: full + AB lift from the low end, gated off below military, Tomcat-only headroom', async () => {
  const { TC_HEAVY, tomcatHeavyGate, tomcatHeavyCurve } = voice;
  // gate: closed through cruise / mid spool, fully open at military
  assert.equal(tomcatHeavyGate(0), 0);
  assert.equal(tomcatHeavyGate(0.6), 0);
  assert.equal(tomcatHeavyGate(0.75), 0);
  assert.equal(tomcatHeavyGate(1), 1);
  assert.ok(TC_HEAVY.subHz <= 120 && TC_HEAVY.subHzAb <= TC_HEAVY.subHz, 'heavy layer stays below 120 Hz');
  // saturator curve: odd (no DC), monotone, bounded
  const c = tomcatHeavyCurve(257);
  for (let i = 0; i < c.length; i++) {
    assert.ok(Math.abs(c[i] + c[c.length - 1 - i]) < 1e-6, 'odd curve');
    assert.ok(Math.abs(c[i]) <= 1 + 1e-6);
    if (i) assert.ok(c[i] > c[i - 1], 'monotone curve');
  }
  // limiter headroom pad: Tomcat only
  const pack = await jiti.import(join(root, 'src/audio/tomcatPack.ts'));
  assert.equal(pack.tomcatHeadroomGain({ id: 'night-pursuit', kind: 'ice', params: {} }), 1);
  assert.equal(pack.tomcatHeadroomGain({ id: 'x', kind: 'aerospace', params: {} }), 1);
  assert.ok(Math.abs(pack.tomcatHeadroomGain({ id: 'aerospace-f14', kind: 'aerospace', params: {} }) - 10 ** (-pack.TOMCAT_PACK.headroomDb / 20)) < 1e-12);
  // live chain: full power below the engage speed vs zone 5 above it
  const { integratedLufs, samplePeakDb } = await import(pathToFileURL(join(root, 'scripts/loudness.mjs')).href);
  // brisk spool keeps the render short (steady levels do not depend on it)
  const profile = (t) => (t < 6.5 ? { speed: mph(70), throttle: 1, load: 1 } : { speed: mph(100), throttle: 1, load: 1 });
  const buf = await renderLive(profile, 11.5, { patchId: 'aerospace-f14', seed: 'tomcat-test-heavy', fps: 30, params: { tcSpoolTime: 0 } });
  const full = channelsOf(buf, 5, 6.5);
  const ab = channelsOf(buf, 9.5, 11.5);
  const lf = integratedLufs(full, buf.sampleRate);
  const la = integratedLufs(ab, buf.sampleRate);
  assert.ok(lf > -20 && lf < -14, `full ${lf.toFixed(1)} LUFS`);
  assert.ok(la >= lf + 3, `AB ${la.toFixed(1)} must clearly jump over full ${lf.toFixed(1)}`);
  assert.ok(samplePeakDb(ab) < -1 && samplePeakDb(full) < -1, 'peaks under −1 dBFS');
  // the lift is bass: most AB energy below 120 Hz
  const { powerSpectrum } = await import(pathToFileURL(join(root, 'scripts/spectrum.mjs')).href);
  const { ps, df } = powerSpectrum(ab, buf.sampleRate);
  let tot = 0;
  let lo = 0;
  for (let k = 1; k < ps.length; k++) {
    tot += ps[k];
    if (k * df < 120) lo += ps[k];
  }
  assert.ok(lo / tot > 0.5, `AB energy below 120 Hz ${(100 * lo / tot).toFixed(0)} %`);
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

test('no gears (live chain): gear rpm, shift flags + upshift cues leave Tomcat unchanged; other packs still shift', async () => {
  const fps = 30;
  const [t0, t1] = [3, 10]; // 0 → 150 mph over 3..10 s (75 mph at 6.5 s)
  const cues = gearChangeTimes(t0, t1, fps).flatMap((t) => [{ t, cue: 'upshift' }, { t, cue: 'downshift' }]);
  assert.equal(cues.length, 10, 'five gear changes in the sweep');
  let now = 0;
  const render = async (patchId, kind, withCues, dur, seen) =>
    renderLive((t) => gearSweep(t, t0, t1)[kind], dur, {
      patchId,
      seed: `gearless-${patchId}`,
      params: patchId === 'aerospace-f14' ? { tcSpoolTime: 0 } : undefined,
      fps,
      cues: withCues ? cues : [],
      onFrame: (engine, t) => {
        now = t;
        if (t === 0) {
          engine.setUpshiftSfxEnabled(true);
          if (seen) engine.onAfterburnerZoneChange((z) => seen.push({ z, t: now }));
        }
      },
    });
  const diff = (a, b) => {
    let m = 0;
    let e = 0;
    for (let c = 0; c < 2; c++) {
      const x = a.getChannelData(c);
      const y = b.getChannelData(c);
      for (let i = 0; i < x.length; i++) {
        m = Math.max(m, Math.abs(x[i] - y[i]));
        e += y[i] * y[i];
      }
    }
    return { max: m, rms: Math.sqrt(e / (2 * a.length)) };
  };
  const seen = [];
  const tcClean = await render('aerospace-f14', 'clean', false, 10);
  const tcGeared = await render('aerospace-f14', 'geared', true, 10, seen);
  const d = diff(tcClean, tcGeared);
  assert.ok(d.rms > 1e-3, 'Tomcat render is audible');
  assert.ok(d.max < 1e-6, `Tomcat output moved with gear signals / shift cues (max |Δ| ${d.max})`);
  // AB engages once as the sweep passes 75 mph and stages straight to 5 — one callback per zone
  assert.deepEqual(seen.map((x) => x.z), [1, 2, 3, 4, 5]);
  assert.ok(seen[0].t >= 6.5 && seen[0].t < 6.8, `AB engaged at ${seen[0].t}`);
  // another (non-gearless) pack still reacts to the same gear rpm saw-tooth and plays the upshift bark
  const evClean = await render('ev-whine', 'clean', false, 6);
  const evGeared = await render('ev-whine', 'geared', true, 6);
  const e = diff(evClean, evGeared);
  assert.ok(e.max > 1e-3, `ev-whine should still follow the gearbox (max |Δ| ${e.max})`);
  // pack flag: only the Tomcat builtin (and its copies) is gearless
  const pack = await jiti.import(join(root, 'src/audio/tomcatPack.ts'));
  const builtins = await jiti.import(join(root, 'src/audio/builtins.ts'));
  assert.equal(pack.TOMCAT_PACK.gearless, true);
  for (const b of builtins.BUILTIN_PATCHES) assert.equal(pack.isGearlessPatch(b), b.id === 'aerospace-f14', b.id);
  const input = { speed: 0.5, throttle: 0.4, load: 0.4, rpm: 3000, rpmNorm: 0.4, shifting: true, overrun: false };
  assert.deepEqual(pack.gearlessDrivingInput(input), { speed: 0.5, throttle: 0.4, load: 0.4, overrun: false });
});

test('other packs still shift: Night Pursuit / Chrono Coupe gear models step through their gears', async () => {
  const np = await import(pathToFileURL(join(root, 'src/audio/nightPursuitVoice.js')).href);
  const cc = await import(pathToFileURL(join(root, 'src/audio/chronoCoupeVoice.js')).href);
  for (const [name, create, step, top] of [
    ['night-pursuit', np.createNightPursuitDriveState, np.stepNightPursuitDrive, 4],
    ['chrono-coupe', cc.createChronoCoupeDriveState, cc.stepChronoCoupeDrive, 5],
  ]) {
    const s = create();
    const gears = new Set();
    for (let t = 0; t < 14; t += 1 / 60) gears.add(step(s, { speed: Math.min(1, t / 12), throttle: 0.8 }, 1 / 60, {}).gear);
    assert.ok(gears.size >= 3 && Math.max(...gears) >= top - 1, `${name} gears ${[...gears]}`);
  }
});
