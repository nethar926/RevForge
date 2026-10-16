/**
 * Carrier Jet (Tomcat, `aerospace-f14`) cold start: opt-in aircraft systems, per-engine start,
 * switch foley, emergency stop. Pure model tests + offline renders through the shipped live chain
 * (CharacterEngine → EngineSynthImpl → TomcatVoice + JetColdStartVoice).
 *
 * Offline renders: the live harness (scripts/live-engine-render.mjs) catches every rejected
 * suspend(t); direct suspend renders here use renderWithSteps / withSteps (same pattern as
 * tests/playback-session.test.mjs on audio/resume-rejection-fix) so no suspend promise is left
 * dangling or unhandled.
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
const nwa = await import('node-web-audio-api');

const PARK = () => ({ speed: 0, throttle: 0, load: 0 });
const rmsDb = (ch) => 10 * Math.log10(Math.max(1e-20, ch.reduce((s, v) => s + v * v, 0) / Math.max(1, ch.length)));
const monoDb = (chs) => rmsDb(chs[0].map((v, i) => (v + chs[1][i]) / 2));
const peakOf = (chs) => Math.max(...chs.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
/** Largest sample-to-sample step (a click shows up as a step far above the signal's own slope). */
const maxStep = (chs) => Math.max(...chs.map((c) => c.reduce((m, v, i) => (i ? Math.max(m, Math.abs(v - c[i - 1])) : 0), 0)));

/** OfflineAudioContext with callbacks at offline times; every suspend promise is settled. */
async function renderWithSteps(off, steps) {
  const at = {};
  const missed = [];
  const settled = steps.map(([t, fn]) =>
    off.suspend(t).then(
      async () => {
        at[t] = off.currentTime;
        try {
          await fn();
        } finally {
          await off.resume();
        }
      },
      (err) => {
        missed.push(`${t}: ${err?.name ?? err}`);
      },
    ),
  );
  await new Promise((r) => setTimeout(r, 5));
  const buf = await off.startRendering();
  await Promise.all(settled);
  return { buf, at, missed };
}
async function withSteps(attempt, tries = 3) {
  let r;
  for (let n = 0; n < tries; n++) {
    r = await attempt();
    if (r.missed.length === 0) return r;
  }
  assert.deepEqual(r.missed, [], `offline suspend points rejected on all ${tries} renders`);
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
let base = null;
try {
  base = baselineRoot();
} catch {
  base = null; // shallow clone without ef4021e: the A/B tests below are skipped
}
process.on('exit', () => base && rmSync(base, { recursive: true, force: true }));

test('default off: drive model + targets identical to ef4021e (quick start, throttle, AB, shutdown)', { skip: !base && 'ef4021e not available' }, async () => {
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
        out.push(JSON.stringify({ d, T: m.tomcatTargets({}, d) }));
      }
      return out;
    } finally {
      Math.random = prev;
    }
  };
  const a = run(old);
  const b = run(voice);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.equal(b[i], a[i], `frame ${i} differs`);
});

test('default off: live chain render is sample-identical to ef4021e (start → drive → shutoff)', { skip: !base && 'ef4021e not available' }, async () => {
  const profile = (t) => (t < 5 ? { speed: 0, throttle: 0, load: 0 } : { speed: 0.3, throttle: 0.5, load: 0.5 });
  const opts = { patchId: 'aerospace-f14', seed: 'cj-default-live', fps: 30, cues: [{ t: 8, cue: 'shutdown' }] };
  let same = false;
  let worst = 0;
  // the harness tolerates a dropped suspend point (frame lands one step later); retry before failing
  for (let n = 0; n < 3 && !same; n++) {
    const A = await renderLive(profile, 10, { ...opts, root: base });
    const B = await renderLive(profile, 10, opts);
    worst = 0;
    for (let c = 0; c < 2; c++) {
      const x = A.getChannelData(c);
      const y = B.getChannelData(c);
      for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i] - y[i]));
    }
    same = worst === 0;
  }
  assert.ok(same, `max sample difference ${worst}`);
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
  for (const k of cold.JET_SYSTEMS) assert.equal(states[1][k], false, `${k} off after the cut`);
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
  const cues = cold.JET_CUES;
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
  assert.ok(samplePeakDb(channelsOf(buf)) < -12);
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
