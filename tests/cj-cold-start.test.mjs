/**
 * Carrier Jet (Tomcat, `aerospace-f14`) cold start: opt-in aircraft systems, per-engine start,
 * switch foley, emergency stop. Pure model tests + offline renders through the shipped live chain
 * (CharacterEngine → EngineSynthImpl → TomcatVoice + JetColdStartVoice).
 *
 * Offline renders: the live harness (scripts/live-engine-render.mjs) and the direct suspend
 * renders here (renderWithSteps) register every suspend point before rendering starts
 * (scripts/offline-steps.mjs), so no point is dropped under load and none is left dangling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const voice = await imp('src/audio/tomcatVoice.js');
const cold = await imp('src/audio/jetColdStart.js');
const { renderLive, channelsOf } = await imp('scripts/live-engine-render.mjs');
const { integratedLufs, samplePeakDb } = await imp('scripts/loudness.mjs');
const { renderColdStart, DEMO_TIMELINES, DEMO_SECONDS } = await imp('tests/cj-cold-start-render.mjs');
const { mulberry32 } = await imp('scripts/seeded-random.mjs');
const { armSuspends } = await imp('scripts/offline-steps.mjs');
const nwa = await import('node-web-audio-api');

const PARK = () => ({ speed: 0, throttle: 0, load: 0 });
const rmsDb = (ch) => 10 * Math.log10(Math.max(1e-20, ch.reduce((s, v) => s + v * v, 0) / Math.max(1, ch.length)));
const monoDb = (chs) => rmsDb(chs[0].map((v, i) => (v + chs[1][i]) / 2));
const peakOf = (chs) => Math.max(...chs.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
/** Largest sample-to-sample step (a click shows up as a step far above the signal's own slope). */
const maxStep = (chs) => Math.max(...chs.map((c) => c.reduce((m, v, i) => (i ? Math.max(m, Math.abs(v - c[i - 1])) : 0), 0)));

/**
 * OfflineAudioContext with callbacks at offline times. Every suspend point is registered before
 * rendering starts (scripts/offline-steps.mjs), so none is dropped under CPU load; `missed` lists
 * any point the context refused instead of hiding it.
 */
async function renderWithSteps(off, steps) {
  const at = {};
  const { settled, missed } = await armSuspends(off, steps.map(([t]) => t), async (t, i) => {
    at[t] = off.currentTime;
    try {
      await steps[i][1]();
    } finally {
      await off.resume();
    }
  });
  const buf = await off.startRendering();
  await settled;
  return { buf, at, missed };
}
async function withSteps(attempt) {
  const r = await attempt();
  assert.deepEqual(r.missed, [], 'offline suspend points rejected');
  return r;
}

/* ───────────── files / identity ───────────── */

test('cold-start files: procedural only, no banned names / display label, no storage', () => {
  const files = ['src/audio/jetColdStart.js', 'src/audio/jetColdStart.d.ts', 'docs/cj-cold-start.md', 'tests/cj-cold-start-render.mjs', 'tests/cj-cold-start.test.mjs'];
  const banned = [['top\\s*', 'gun'], ['\\bmave', 'rick\\b'], ['\\bgoo', 'se\\b'], ['\\bice', 'man\\b'], ['grum', 'man'], ['\\bvf-?', '\\d+\\b'], ['boe', 'ing'], ['air', 'bus']].map((p) => new RegExp(p.join(''), 'i'));
  const label = new RegExp(['aerospace[ _]?', 'f-?14'].join(''), 'i');
  for (const rel of files) {
    const src = read(rel);
    for (const re of banned) assert.ok(!re.test(src), `${rel} matches ${re}`);
    assert.ok(!label.test(src), `${rel} has a display label`);
  }
  for (const rel of ['src/audio/jetColdStart.js', 'src/audio/tomcatVoice.js']) {
    const src = read(rel);
    assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(src), `${rel} touches storage`);
    assert.ok(!/decodeAudioData|fetch\(|\.wav|\.mp3|ConvolverNode|createConvolver|PeriodicWave|createPeriodicWave/.test(src), `${rel} procedural only`);
  }
  const impl = read('src/audio/EngineSynthImpl.ts');
  const block = impl.slice(impl.indexOf('/* ───────────── Tomcat cold start'), impl.indexOf('Hint for the CharacterEngine cabin low-pass'));
  assert.ok(block.length > 1000 && !/localStorage|sessionStorage|indexedDB|storageKey/.test(block), 'cold-start API stores nothing');
});

/* ───────────── default off: unchanged ───────────── */

/** Write the ef4021e audio layer + scripts to a temp root (node_modules linked) for A/B renders. */
function baselineRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'cj-base-'));
  const tar = execFileSync('git', ['-C', root, 'archive', 'ef4021e', 'src', 'scripts', 'package.json'], { maxBuffer: 1 << 28 });
  writeFileSync(join(dir, 'a.tar'), tar);
  execFileSync('tar', ['-xf', join(dir, 'a.tar'), '-C', dir]);
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}
/**
 * ef4021e's engine / wrapper code running the CURRENT Tomcat voice file. The wind trim (TC_AIR) is
 * an intentional change to the voice itself; this root isolates everything else (cold start,
 * flight phases, switch API) so "default off = unchanged" stays a sample-exact check.
 */
function baselineWithVoiceRoot() {
  const dir = baselineRoot();
  for (const f of ['src/audio/tomcatVoice.js', 'src/audio/tomcatVoice.d.ts']) writeFileSync(join(dir, f), read(f));
  return dir;
}
let base = null;
let baseVoice = null;
try {
  base = baselineRoot();
  baseVoice = baselineWithVoiceRoot();
} catch {
  base = null; // shallow clone without ef4021e: the A/B tests below are skipped
}
process.on('exit', () => {
  for (const d of [base, baseVoice]) if (d) rmSync(d, { recursive: true, force: true });
});

test('default off: drive model identical to ef4021e; targets identical except the intentional wind trim (TC_AIR)', { skip: !base && 'ef4021e not available' }, async () => {
  const old = await import(pathToFileURL(join(base, 'src/audio/tomcatVoice.js')).href);
  const run = (m) => {
    const prev = Math.random;
    Math.random = mulberry32('cj-default');
    try {
      const s = m.createTomcatDriveState('off');
      m.tomcatBeginStart(s);
      const out = [];
      for (let i = 0; i < 60 * 30; i++) {
        const t = i / 60;
        if (i === 60 * 24) m.tomcatBeginShutdown(s);
        const d = m.stepTomcatDrive(s, { speed: t > 10 ? 0.8 : 0.2, throttle: t > 8 ? 1 : 0.3, load: t > 8 ? 1 : 0.3 }, 1 / 60, {});
        out.push({ d: JSON.stringify(d), T: m.tomcatTargets({}, d) });
      }
      return out;
    } finally {
      Math.random = prev;
    }
  };
  const a = run(old);
  const b = run(voice);
  assert.equal(a.length, b.length);
  // Wind trim: these target levels are ef4021e × TC_AIR (the graph also adds the air LPs);
  // every other target is unchanged.
  const A = voice.TC_AIR;
  const scaled = { ramWind: A.ramWind, ramBuffet: A.ramBuffet, roarHot: A.hot, idleBed: A.bed };
  const same = (x, y, path) => {
    if (typeof x === 'number') {
      const k = path.split('.').at(-1);
      const want = k in scaled ? y * scaled[k] : y;
      assert.ok(Math.abs(x - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${path}: ${x} vs ${want}`);
      return;
    }
    if (x && typeof x === 'object') {
      assert.deepEqual(Object.keys(x).sort(), Object.keys(y).sort(), path);
      for (const k of Object.keys(x)) same(x[k], y[k], `${path}.${k}`);
      return;
    }
    assert.equal(x, y, path);
  };
  for (let i = 0; i < a.length; i++) {
    assert.equal(b[i].d, a[i].d, `frame ${i}: drive differs`);
    same(b[i].T, a[i].T, `frame ${i}.T`);
  }
});

test('default off: live chain is sample-identical to ef4021e engine code running the current Tomcat voice (start → drive → shutoff)', { skip: !baseVoice && 'ef4021e not available' }, async () => {
  const profile = (t) => (t < 5 ? { speed: 0, throttle: 0, load: 0 } : { speed: 0.3, throttle: 0.5, load: 0.5 });
  const opts = { patchId: 'aerospace-f14', seed: 'cj-default-live', fps: 30, cues: [{ t: 8, cue: 'shutdown' }] };
  // deterministic harness (no dropped suspend points, no wall-clock timers): one pair, exact
  const A = await renderLive(profile, 10, { ...opts, root: baseVoice });
  const B = await renderLive(profile, 10, opts);
  let worst = 0;
  for (let c = 0; c < 2; c++) {
    const x = A.getChannelData(c);
    const y = B.getChannelData(c);
    for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - y[i]));
  }
  assert.ok(worst === 0, `max sample difference ${worst}`);
});

test('default off: API defaults, setJetSystem is refused, quick Start still runs both engines', async () => {
  let snap;
  const buf = await renderLive(PARK, 6, {
    patchId: 'aerospace-f14',
    seed: 'cj-default-api',
    fps: 30,
    onFrame: (e, t) => {
      if (!snap) {
        snap = {
          cold: e.getJetColdStart(),
          mode: e.getJetStartMode(),
          sys: e.getJetSystems(),
          set: e.setJetSystem('engL', true),
          estop: e.jetEmergencyStop(),
          auto: e.jetAutoStart(),
        };
      }
      if (t > 5.9) snap.phase = e.base.tcDrive.phase;
    },
  });
  assert.equal(snap.cold, false);
  assert.equal(snap.mode, 'apu');
  for (const k of cold.JET_SYSTEMS) assert.equal(snap.sys[k], false, k);
  assert.equal(snap.set, false, 'no cold-start control while cold start is off');
  assert.equal(snap.estop, false);
  assert.equal(snap.auto, false);
  assert.equal(snap.phase, 'run', 'quick start reached idle');
  assert.ok(monoDb(channelsOf(buf, 4, 6)) > -45, 'quick start audible');
});

/* ───────────── permissive switches ───────────── */

test('permissive: any order, no interlocks — engine on with no battery / air still starts; callbacks report it', async () => {
  const changes = [];
  const phases = [];
  let res;
  let unsub;
  let afterUnsub = 0;
  await renderColdStart(
    [
      [0.2, '', (e) => (res = [e.setJetSystem('engR', true), e.setJetSystem('crossbleed', true), e.setJetSystem('seatbelt', false), e.setJetSystem('bogus', true)])],
      [12, '', (e) => (res.push(e.setJetSystem('engR', false)), unsub())],
      [12.5, '', (e) => e.setJetSystem('batt', true)],
    ],
    14,
    {
      profile: PARK,
      fps: 30,
      seed: 'cj-permissive',
      onReady: (e) => {
        unsub = e.onJetSystemChange((st, ch) => {
          changes.push(ch);
          phases.push(st.engines.R);
        });
        e.onJetSystemChange(() => afterUnsub++);
      },
      onFrame: (e, t) => {
        if (Math.abs(t - 11) < 0.02) res.push(e.getJetSystems());
      },
    },
  );
  assert.deepEqual(res.slice(0, 4), [true, true, true, false], 'every valid call does what it is told; only an unknown id is refused');
  const st = res[4];
  assert.equal(st.engR, true);
  assert.equal(st.batt, false);
  assert.equal(st.engines.R, 'run', 'engine started without battery or air source');
  assert.equal(st.engines.L, 'off');
  assert.equal(st.crossbleed, true);
  assert.equal(res[5], true);
  const sys = changes.filter((c) => c.system).map((c) => `${c.system}:${c.on}`);
  assert.deepEqual(sys, ['engR:true', 'crossbleed:true', 'engR:false'], 'same-value calls do not notify');
  assert.ok(changes.some((c) => c.source === 'engine') && phases.includes('run'), 'engine phase change reported');
  assert.ok(afterUnsub > changes.length, 'unsubscribe stops only that listener');
});

test('engine sound never plays before light-off; idle bed with only BATT is quiet', async () => {
  const buf = await renderColdStart([[0.5, '', (e) => e.setJetSystem('batt', true)], [6, '', (e) => e.setJetSystem('engL', true)]], 16, {
    profile: PARK,
    fps: 30,
    seed: 'cj-dark',
    onFrame: (e, t) => {
      if (t < 5.9) assert.ok(e.base.tcDrive.n2a === 0 && e.base.tcDrive.n2b === 0, 'no spool before an engine switch');
    },
  });
  assert.ok(peakOf(channelsOf(buf, 0, 0.45)) < 1e-5, 'silent after start() with every switch off');
  const bed = monoDb(channelsOf(buf, 4, 6));
  const idle = monoDb(channelsOf(buf, 14, 16));
  assert.ok(bed < -44, `battery bed ${bed.toFixed(1)} dB`);
  assert.ok(idle > bed + 6, `one engine idle ${idle.toFixed(1)} vs bed ${bed.toFixed(1)}`);
});

/* ───────────── levels / stereo ───────────── */

test('one engine ≈ half the jet (−6 dB, on its side); both = the full quick-start idle', async () => {
  const tl = [[0.3, '', (e) => e.setJetSystem('engL', true)], [12, '', (e) => e.setJetSystem('engR', true)]];
  const buf = await renderColdStart(tl, 25, { profile: PARK, fps: 30, seed: 'cj-levels' });
  const one = channelsOf(buf, 9, 12);
  const two = channelsOf(buf, 21, 25);
  const l1 = integratedLufs(one, buf.sampleRate);
  const l2 = integratedLufs(two, buf.sampleRate);
  assert.ok(l2 - l1 > 4 && l2 - l1 < 8, `one ${l1.toFixed(1)} vs two ${l2.toFixed(1)} LUFS`);
  assert.ok(rmsDb(one[0]) > rmsDb(one[1]) + 2, `left engine on the left (${rmsDb(one[0]).toFixed(1)} / ${rmsDb(one[1]).toFixed(1)})`);
  // quick-start idle through the same (stereo) offline shim
  const ref = await renderLive(PARK, 10, {
    patchId: 'aerospace-f14',
    seed: 'cj-levels',
    fps: 30,
    onFrame: (e) => {
      e.mainSpatial.panningModel = 'equalpower';
    },
  });
  const lr = integratedLufs(channelsOf(ref, 6, 10), ref.sampleRate);
  assert.ok(Math.abs(l2 - lr) < 1.5, `both engines ${l2.toFixed(1)} vs quick-start idle ${lr.toFixed(1)} LUFS`);
  assert.ok(samplePeakDb(channelsOf(buf, 0, 25)) <= -1);
});

/* ───────────── auto start / emergency stop ───────────── */

const autoOrder = async (mode) => {
  const order = [];
  let done;
  let r;
  const buf = await renderColdStart([[0.2, '', (e) => (r = e.jetAutoStart(mode))]], 42, {
    profile: PARK,
    fps: 30,
    seed: `cj-auto-${mode}`,
    onReady: (e) =>
      e.onJetSystemChange((st, ch) => {
        if (ch.system && ch.source === 'auto') order.push(`${ch.system}:${ch.on}`);
        if (ch.system === null && ch.source === 'auto' && !st.autoRunning) done = st;
      }),
  });
  return { order, done, r, buf };
};

test('jetAutoStart("apu"): BATT → APU → SEAT BELT → L ENG → R ENG → APU off', async () => {
  const { order, done, r, buf } = await autoOrder('apu');
  assert.equal(r, true);
  assert.deepEqual(order, ['batt:true', 'apu:true', 'seatbelt:true', 'engL:true', 'engR:true', 'apu:false']);
  assert.ok(done, 'sequence finished');
  assert.deepEqual(done.engines, { L: 'run', R: 'run' });
  assert.equal(done.mode, 'apu');
  assert.ok(samplePeakDb(channelsOf(buf)) <= -1, 'true peak ≤ −1 dBFS');
});

test('jetAutoStart("groundcart"): BATT → CART → SEAT BELT → R ENG → CROSSBLEED → L ENG → CROSSBLEED off → CART off', async () => {
  const { order, done, buf } = await autoOrder('groundcart');
  assert.deepEqual(order, ['batt:true', 'aircart:true', 'seatbelt:true', 'engR:true', 'crossbleed:true', 'engL:true', 'crossbleed:false', 'aircart:false']);
  assert.deepEqual(done.engines, { L: 'run', R: 'run' });
  assert.equal(done.mode, 'groundcart');
  assert.ok(samplePeakDb(channelsOf(buf)) <= -1, 'true peak ≤ −1 dBFS');
});

test('PULL emergency stop: warning first, then everything spools down to silence without clicks', async () => {
  const states = [];
  const tl = [
    [0.2, '', (e) => e.jetQuickStart()],
    [3, '', (e) => e.setJetSystem('apu', true)],
    [14, '', (e) => e.jetEmergencyStop()],
  ];
  const buf = await renderColdStart(tl, 34, {
    profile: PARK,
    fps: 30,
    seed: 'cj-estop',
    onFrame: (e, t) => {
      if (Math.abs(t - 14.3) < 0.02 || Math.abs(t - 15) < 0.02) states.push(e.getJetSystems());
    },
  });
  assert.equal(states[0].emergency, true, 'fuel cut waits for the warning');
  assert.equal(states[0].engines.L, 'run');
  for (const k of cold.JET_POWERED) assert.equal(states[1][k], false, `${k} off after the cut`);
  const running = channelsOf(buf, 11, 14);
  const lr = monoDb(running);
  // spools down: monotone-ish level fall in 1 s windows after the cut, silence at the end
  let prev = Infinity;
  for (let s = 16; s < 33; s += 1) {
    const l = monoDb(channelsOf(buf, s, s + 1));
    assert.ok(l < prev + 1.5, `level rises at ${s}s (${l.toFixed(1)} after ${prev.toFixed(1)})`);
    prev = l;
  }
  assert.ok(monoDb(channelsOf(buf, 32, 34)) < lr - 30, 'decays to silence');
  assert.ok(peakOf(channelsOf(buf, 33, 34)) < 3e-3);
  // no clicks: after the cut the sample-to-sample step never exceeds the running engine's own
  assert.ok(maxStep(channelsOf(buf, 14.7, 34)) <= maxStep(running) * 1.1, `step ${maxStep(channelsOf(buf, 14.7, 34))} vs ${maxStep(running)}`);
  assert.ok(samplePeakDb(channelsOf(buf)) <= -1);
});

/* ───────────── foley / one-shots ───────────── */

test('playJetCue: every cue is a short quiet transient; unknown cues are refused', async () => {
  // gearUp / gearDown are multi-second gear sequences (cj-gear.test.mjs); radarOn is a ~1.6 s hum (cj-ab-unarmed-radar.test.mjs)
  const cues = cold.JET_CUES.filter((c) => c !== 'gearUp' && c !== 'gearDown' && c !== 'radarOn' && c !== 'o2Chimes');
  const SR = 44100;
  const gap = 1.5;
  const off = new nwa.OfflineAudioContext(2, Math.ceil(SR * gap * cues.length), SR);
  const v = new cold.JetColdStartVoice(off, off.destination);
  assert.equal(v.cue('nope'), false);
  cues.forEach((c, k) => assert.equal(v.cue(c, { when: k * gap }), true, c));
  const buf = await off.startRendering();
  cues.forEach((c, k) => {
    const seg = channelsOf(buf, k * gap, (k + 1) * gap);
    const pk = 20 * Math.log10(peakOf(seg));
    assert.ok(pk > -60 && pk < -12, `${c} peak ${pk.toFixed(1)} dBFS`);
    const tail = 20 * Math.log10(Math.max(1e-9, peakOf(channelsOf(buf, k * gap + 1.35, (k + 1) * gap))));
    // the chime rings ≈ 1 s (soft mallet tail), everything else is a transient
    assert.ok(tail < pk - (c === 'chime' ? 20 : 40), `${c} has ended (${tail.toFixed(1)} dB)`);
  });
  // chime stays under the engine idle peak (≈ −22 dBFS here) — quieter than a car alert
  const chime = 20 * Math.log10(peakOf(channelsOf(buf, cues.indexOf('chime') * gap, (cues.indexOf('chime') + 1) * gap)));
  assert.ok(chime < -18, `chime ${chime.toFixed(1)} dBFS`);
  v.dispose();
});

test('SEAT BELT tone is one low tone; O2 is three hi-lo chimes; both quiet and ended', async () => {
  const SR = 44100;
  const off = new nwa.OfflineAudioContext(1, SR * 5, SR);
  const v = new cold.JetColdStartVoice(off, off.destination);
  assert.equal(v.cue('seatbeltTone', { when: 0 }), true);
  assert.equal(v.cue('o2Chimes', { when: 1.5 }), true);
  const buf = await off.startRendering();
  const x = buf.getChannelData(0);
  const win = (a, b) => x.subarray(Math.round(a * SR), Math.round(b * SR));
  const db = (a) => 20 * Math.log10(Math.max(1e-9, a.reduce((m, y) => Math.max(m, Math.abs(y)), 0)));
  // zero-crossing pitch of a window
  const hz = (a) => { let z = 0; for (let i = 1; i < a.length; i++) if (a[i - 1] < 0 && a[i] >= 0) z++; return z / (a.length / SR); };
  for (const [a, b] of [[0, 1.5], [1.5, 4]]) { const p = db(win(a, b)); assert.ok(p > -50 && p < -18, `peak ${p.toFixed(1)}`); }
  // seatbelt: one sustained low tone (~392 Hz fundamental), silent by 0.8 s
  assert.ok(Math.abs(hz(win(0.1, 0.5)) - 392) < 40, `seatbelt ${hz(win(0.1, 0.5)).toFixed(0)} Hz`);
  assert.ok(db(win(0.8, 1.5)) < db(win(0.1, 0.5)) - 40);
  // O2: hi (≈1047) then lo (≈784), three times, with gaps between pairs
  for (let k = 0; k < 3; k++) {
    const t0 = 1.5 + k * 0.72;
    assert.ok(Math.abs(hz(win(t0 + 0.03, t0 + 0.17)) - 1046.5) < 80, `pair ${k} hi`);
    assert.ok(Math.abs(hz(win(t0 + 0.29, t0 + 0.43)) - 784) < 60, `pair ${k} lo`);
    assert.ok(db(win(t0 + 0.6, t0 + 0.7)) < db(win(t0 + 0.05, t0 + 0.15)) - 30, `gap after pair ${k}`);
  }
  assert.ok(db(win(4, 5)) < -90, 'O2 ended');
  v.dispose();
});

test('systems voice: APU / cart / battery spool up and down click-free (direct suspend render)', async () => {
  const SR = 44100;
  const { buf } = await withSteps(() => {
    const off = new nwa.OfflineAudioContext(2, SR * 24, SR);
    const v = new cold.JetColdStartVoice(off, off.destination);
    const st = cold.createJetColdState();
    const steps = [];
    for (let i = 1; i < 24 * 20; i++) {
      const t = i / 20;
      steps.push([
        t,
        () => {
          st.systems.batt = t < 18;
          st.systems.apu = t > 1 && t < 12;
          st.systems.aircart = t > 4 && t < 14;
          st.systems.crossbleed = t > 6 && t < 10;
          cold.stepJetCold(st, 1 / 20, {});
          v.update(st, {}, off.currentTime);
        },
      ]);
    }
    return renderWithSteps(off, steps);
  });
  const on = channelsOf(buf, 9, 11);
  assert.ok(monoDb(on) > -45, `systems audible ${monoDb(on).toFixed(1)}`);
  // no clicks: no transition ever steps further than the steady all-on mix (hiss included) does
  const steady = maxStep(on);
  for (const [a, b] of [[0, 9], [11, 24]]) assert.ok(maxStep(channelsOf(buf, a, b)) <= steady * 1.15, `step ${maxStep(channelsOf(buf, a, b))} in ${a}-${b}s vs steady ${steady}`);
  assert.ok(monoDb(channelsOf(buf, 23, 24)) < monoDb(on) - 15, `winds down (${monoDb(channelsOf(buf, 23, 24)).toFixed(1)} vs ${monoDb(on).toFixed(1)})`);
  assert.ok(samplePeakDb(channelsOf(buf)) < -6, 'raw systems bus (before pad / limiter) keeps headroom');
});

/* ───────────── pure model ───────────── */

test('model: APU ≈ 7 s to ready, cart quicker, gyro slow; per-engine cold start lights then idles', () => {
  const st = cold.createJetColdState();
  st.systems.apu = true;
  st.systems.aircart = true;
  let tApu;
  let tCart;
  let lit = 0;
  for (let i = 1; i <= 60 * 15; i++) {
    for (const ev of cold.stepJetCold(st, 1 / 60, {})) if (ev.type === 'apuLightoff') lit++;
    if (!tApu && cold.jetApuReady(st)) tApu = i / 60;
    if (!tCart && cold.jetCartReady(st)) tCart = i / 60;
  }
  assert.equal(lit, 1);
  assert.ok(tApu > 5 && tApu < 10, `APU ready at ${tApu}`);
  assert.ok(tCart > 2 && tCart < tApu, `cart ready at ${tCart}`);
  const s = voice.createTomcatDriveState('off');
  assert.equal(voice.tomcatColdEngine(s, 0, true), false, 'needs cold mode');
  voice.tomcatSetColdMode(s, true);
  assert.equal(voice.tomcatColdEngine(s, 1, true), true);
  const ev = [];
  let tRun;
  for (let i = 1; i <= 60 * 14; i++) {
    const d = voice.stepTomcatDrive(s, { speed: 0, throttle: 0 }, 1 / 60, {});
    ev.push(...d.events.map((e) => ({ ...e, t: i / 60 })));
    assert.equal(d.n2a, 0, 'the other engine stays dark');
    if (!tRun && d.coldB === 'run') tRun = i / 60;
  }
  const lo = ev.find((e) => e.type === 'lightoff');
  assert.ok(lo && lo.engine === 1 && lo.t > 2 && lo.t < 5, `light-off at ${lo?.t}`);
  assert.ok(ev.filter((e) => e.type === 'igniter').length >= 5, 'igniter ticks');
  assert.ok(tRun > lo.t + 2 && tRun < 12, `idle at ${tRun}`);
  // leaving cold mode with one engine lit: the legacy start brings the other up, lit one stays up
  voice.tomcatSetColdMode(s, false);
  assert.equal(s.phase, 'starting');
  let d;
  for (let i = 0; i < 60 * 8; i++) {
    d = voice.stepTomcatDrive(s, { speed: 0, throttle: 0 }, 1 / 60, {});
    assert.ok(d.n2b > 0.55, 'running engine undisturbed');
  }
  assert.equal(d.phase, 'run');
});

/* ───────────── follow-up: extra systems, panel list, checklist, cart vs APU ───────────── */

const BANNED_RE = [['top\\s*', 'gun'], ['\\bmave', 'rick\\b'], ['\\bgoo', 'se\\b'], ['\\bice', 'man\\b'], ['grum', 'man'], ['nato', 'ps'], ['tes', 'la']].map((p) => new RegExp(p.join(''), 'i'));

test('getJetSystemList: entry shape, groups / kinds, order, variants, emergencyStop pull', () => {
  const groups = ['POWER', 'FUEL', 'ENGINES', 'SYSTEMS', 'LIGHTS'];
  const kinds = ['toggle', 'guarded', 'hold', 'pull'];
  for (const variant of ['apu', 'aircart', 'groundcart']) {
    const list = cold.getJetSystemList(variant);
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'unique ids');
    list.forEach((x, i) => {
      assert.ok(cold.JET_SYSTEMS.includes(x.id), `${x.id} is a setJetSystem id`);
      assert.equal(typeof x.label, 'string');
      assert.ok(x.label.length > 1 && x.label.length < 24, x.label);
      for (const re of BANNED_RE) assert.ok(!re.test(x.label), `${x.label} ${re}`);
      assert.ok(groups.includes(x.group), x.group);
      assert.ok(kinds.includes(x.kind), x.kind);
      assert.ok(Array.isArray(x.requires) && x.requires.every((r) => typeof r === 'string'));
      assert.equal(x.order, i + 1);
      assert.equal(typeof x.required, 'boolean');
      if (x.side !== undefined) assert.ok(x.side === 'L' || x.side === 'R');
      for (const r of x.requires) assert.ok(ids.includes(r), `${x.id} requires ${r} (present)`);
    });
    const by = Object.fromEntries(list.map((x) => [x.id, x]));
    assert.equal(by.emergencyStop.kind, 'pull');
    assert.equal(by.quickStartGuard.kind, 'guarded');
    assert.equal(by.canopy.kind, 'hold');
    assert.deepEqual(by.quickStart.requires, ['quickStartGuard']);
    assert.equal(by.engL.side, 'L');
    assert.equal(by.throttleR.side, 'R');
    for (const id of ['batt', 'fuelPumpL', 'fuelPumpR', 'ignL', 'ignR', 'engL', 'engR', 'throttleL', 'throttleR']) assert.equal(by[id].required, true, id);
    if (variant === 'apu') {
      assert.ok(by.apu && !by.aircart && !by.crossbleed);
      assert.ok(by.engL.order < by.engR.order, 'APU start: left first');
    } else {
      assert.ok(by.aircart && by.crossbleed && !by.apu);
      assert.ok(by.engR.order < by.crossbleed.order && by.crossbleed.order < by.engL.order, 'cart start: right, crossbleed, left');
    }
  }
});

test('getJetChecklist: own short plain-words lists for both variants, mirrored in the docs', () => {
  const doc = read('docs/cj-cold-start.md');
  for (const variant of ['apu', 'aircart']) {
    const c = cold.getJetChecklist(variant);
    assert.ok(c.startup.length >= 8 && c.shutdown.length >= 4);
    for (const line of [...c.startup, ...c.shutdown]) {
      assert.ok(typeof line === 'string' && line.length < 70, line);
      for (const re of BANNED_RE) assert.ok(!re.test(line), `${line} ${re}`);
      assert.ok(doc.includes(line), `docs mirror "${line}"`);
    }
    assert.ok(c.startup.some((l) => (variant === 'apu' ? /APU on/ : /Ground air on/).test(l)));
  }
});

test('extra systems: permissive, momentary controls, quick-start cover, throttle / ignition gates, switch sound', async () => {
  const log = {};
  const changes = [];
  const NEW = ['fuelPumpL', 'fuelPumpR', 'ignL', 'ignR', 'throttleL', 'throttleR', 'avionics', 'anticollision', 'navLights', 'hydraulics', 'canopy', 'oxygen', 'inertialNav'];
  const buf = await renderColdStart(
    [
      [0.2, '', (e) => (log.set = NEW.map((k) => e.setJetSystem(k, true)))],
      [0.3, '', (e) => (log.mom = [e.setJetSystem('masterCaution', true), e.setJetSystem('quickStart', true)])],
      [1.0, '', (e) => (log.s1 = e.getJetSystems())],
      // throttles back to cutoff: an engine started now motors but does not light
      [1.5, '', (e) => (e.setJetSwitchSound(false), e.setJetSystem('throttleL', false), e.setJetSystem('throttleR', false), e.setJetSystem('engL', true))],
      [7.5, '', (e) => (log.held = e.getJetSystems().engines.L, e.setJetSwitchSound(true), e.setJetSystem('throttleL', true))],
      [16, '', (e) => (log.lit = e.getJetSystems(), e.setJetSystem('throttleL', false))],
      [24, '', (e) => (log.cut = e.getJetSystems().engines.L)],
      // cover open → quick start runs (it sets the wired throttles to idle itself)
      [24.2, '', (e) => (e.setJetSystem('quickStartGuard', true), e.setJetSystem('engL', false), e.setJetSystem('quickStart', true))],
      [40, '', (e) => (log.qs = e.getJetSystems())],
    ],
    41,
    { profile: PARK, fps: 30, seed: 'cj-extra', onReady: (e) => e.onJetSystemChange((st, ch) => changes.push(ch)) },
  );
  assert.ok(log.set.every((x) => x === true), 'every new system accepts the call');
  assert.deepEqual(log.mom, [true, true]);
  for (const k of NEW) assert.equal(log.s1[k], true, k);
  assert.equal(log.s1.masterCaution, false, 'momentary springs back');
  assert.equal(log.s1.quickStart, false);
  assert.deepEqual(log.s1.engines, { L: 'off', R: 'off' }, 'quick start ignored while its cover is closed');
  assert.ok(changes.some((c) => c.system === 'masterCaution' && c.on), 'momentary press reported');
  assert.equal(log.held, 'starting', 'throttle at cutoff: the engine motors without light-off');
  assert.equal(log.lit.engines.L, 'run', 'throttle to idle → lights and idles');
  assert.ok(log.lit.hydPressure > 0.8, 'engine-driven hydraulic pressure rises once an engine runs');
  assert.ok(log.cut === 'shutdown' || log.cut === 'off', `throttle cutoff = fuel cut (${log.cut})`);
  assert.deepEqual(log.qs.engines, { L: 'run', R: 'run' }, 'quick start with the cover open');
  assert.equal(log.qs.throttleL, true);
  assert.equal(log.qs.switchSound, true);
  assert.ok(samplePeakDb(channelsOf(buf)) <= -1);
});

test('air cart is broadband (hose roar + diesel), the APU stays a tonal turbine whine', async () => {
  const { powerSpectrum } = await imp('scripts/spectrum.mjs');
  const flat = async (setup) => {
    const SR = 44100;
    const off = new nwa.OfflineAudioContext(2, SR * 4, SR);
    const v = new cold.JetColdStartVoice(off, off.destination);
    const st = cold.createJetColdState();
    setup(st);
    v.update(st, {}, 0);
    const buf = await off.startRendering();
    const { ps, df } = powerSpectrum(channelsOf(buf, 2, 4), SR);
    let lg = 0;
    let ar = 0;
    let n = 0;
    for (let k = 1; k < ps.length; k++) {
      const f = k * df;
      if (f < 400 || f > 6000) continue;
      lg += Math.log(ps[k] + 1e-30);
      ar += ps[k];
      n++;
    }
    return Math.exp(lg / n) / (ar / n);
  };
  const apu = await flat((st) => Object.assign(st, { apuN: 1, apuLit: true }));
  const cart = await flat((st) => Object.assign(st, { cartN: 1, cartEng: 1 }));
  assert.ok(cart > 0.8 && cart > apu * 2, `spectral flatness cart ${cart.toFixed(3)} vs APU ${apu.toFixed(3)}`);
});

test('demo timelines (both modes): every call accepted, peaks ≤ −1 dBFS, ends near silence', async () => {
  for (const mode of ['apu', 'groundcart']) {
    const results = [];
    const tl = DEMO_TIMELINES[mode].map(([t, label, fn]) => [t, label, fn && ((e) => results.push([label, fn(e)]))]);
    const buf = await renderColdStart(tl, DEMO_SECONDS, { fps: 30, seed: `cj-demo-${mode}` });
    for (const [label, r] of results) if (typeof r === 'boolean') assert.equal(r, true, `${mode}: ${label}`);
    assert.ok(samplePeakDb(channelsOf(buf)) <= -1, `${mode} peak ${samplePeakDb(channelsOf(buf)).toFixed(1)}`);
    assert.ok(monoDb(channelsOf(buf, DEMO_SECONDS - 1, DEMO_SECONDS)) < -60, `${mode} ends quiet`);
  }
});
