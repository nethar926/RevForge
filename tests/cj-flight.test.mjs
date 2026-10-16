/**
 * Carrier Jet (Tomcat) flight phases — audio as a consumer of Frontend's detector:
 * setFlightPhase shaping, gear mechanics, AB 80 / 77 mph + launch + speed config, callouts
 * (speechSynthesis mocked: offline renders can't hear speech), cooldown, no stacking, 'note' silent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const voice = await imp('src/audio/tomcatVoice.js');
const fc = await imp('src/audio/flightCallouts.js');
const { renderLive, channelsOf } = await imp('scripts/live-engine-render.mjs');
const { samplePeakDb } = await imp('scripts/loudness.mjs');

const mph = (m) => m / 120;
const rmsDb = (ch) => 10 * Math.log10(Math.max(1e-20, ch.reduce((s, v) => s + v * v, 0) / Math.max(1, ch.length)));

function mockSpeech() {
  const log = { spoken: [], cancels: 0 };
  globalThis.speechSynthesis = {
    speak(u) {
      log.spoken.push(u);
    },
    cancel() {
      log.cancels++;
    },
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  return log;
}
function unmockSpeech() {
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
}
function arbiter() {
  const clock = { t: 100 };
  const tones = [];
  const mech = [];
  const a = new fc.FlightCallouts({
    now: () => clock.t,
    canPlay: () => true,
    tone: (level) => {
      const h = { level, seconds: level === 'warning' ? 0.65 : 0.55, cancelled: false, cancel: () => (h.cancelled = true) };
      tones.push(h);
      return h;
    },
    mechanical: (id) => (mech.push(id), true),
  });
  return { a, clock, tones, mech };
}

/* ───────────── pure: drive ───────────── */

test('phase shaping: taxi low, takeoff roll MIL, airborne cruise, approach / rollout spool down, touch-and-go fast', () => {
  const sh = (p, thr, load) => voice.tomcatPhaseInput(p, { speed: 0.3, throttle: thr, load });
  assert.ok(sh('TAXI', 1).input.throttle <= voice.TC_PHASE_SHAPE.taxiMax + 1e-9);
  assert.equal(sh('TAKEOFF_ROLL', 0).input.throttle, voice.TC_MIL_THROTTLE);
  assert.equal(sh('TAKEOFF_ROLL', 1).input.throttle, 1, 'pedal above MIL still reaches AB demand');
  assert.ok(sh('AIRBORNE', 0).input.throttle >= 0.5 && sh('AIRBORNE', 1).input.throttle === 1);
  assert.ok(sh('APPROACH', 1, 1).input.throttle <= 0.3 && sh('APPROACH', 1, 1).input.load <= 0.3);
  assert.equal(sh('ROLLOUT', 1, 1).input.throttle, 0);
  assert.equal(sh('ROLLOUT', 1, 1).input.load, 0);
  assert.equal(sh('TOUCH_AND_GO', 0).input.throttle, voice.TC_MIL_THROTTLE);
  assert.equal(sh('TOUCH_AND_GO', 0).fast, true);
  assert.equal(sh('TAKEOFF_ROLL', 0).fast, false);
  const d = { speed: 0.4, throttle: 0.7, load: 0.2 };
  assert.equal(voice.tomcatPhaseInput(null, d).input, d, 'no phase → input untouched (compat)');
  assert.equal(voice.tomcatPhaseInput('NOPE', d).input, d);
});

test('AB speeds: default 80 / 77, configurable, legacy 75 / 72 compat path, launch flag', () => {
  assert.equal(voice.TC_AB_ENGAGE_MPH, 80);
  assert.equal(voice.TC_AB_DISENGAGE_MPH, 77);
  assert.deepEqual({ ...voice.TC_AB_LEGACY_MPH }, { abEngageMph: 75, abDisengageMph: 72 });
  const run = (s, speed, sec) => {
    let f;
    for (let i = 0; i < sec * 30; i++) f = voice.stepTomcatDrive(s, { speed, throttle: 1, load: 1 }, 1 / 30, {});
    return f;
  };
  const settle = () => {
    const s = voice.createTomcatDriveState('off');
    voice.tomcatSetRunning(s);
    run(s, mph(10), 6);
    return s;
  };
  // default
  let s = settle();
  assert.equal(run(s, mph(78), 2).abEngaged, false);
  assert.equal(run(s, mph(80), 2).abEngaged, true);
  assert.equal(run(s, mph(77.5), 1).abEngaged, true, 'hysteresis down to 77');
  assert.equal(run(s, mph(76.5), 1).abEngaged, false);
  // legacy pair
  s = settle();
  assert.deepEqual(voice.tomcatSetAbSpeeds(s, 75, 72), { abEngageMph: 75, abDisengageMph: 72 });
  assert.equal(run(s, mph(75), 2).abEngaged, true, 'legacy engage at 75');
  assert.equal(run(s, mph(72.5), 1).abEngaged, true);
  assert.equal(run(s, mph(71.5), 1).abEngaged, false);
  // band is enforced
  assert.deepEqual(voice.tomcatSetAbSpeeds(voice.createTomcatDriveState(), 60, 90), { abEngageMph: 60, abDisengageMph: 59.5 });
  // launch: armed → engaged at 0 mph; unarmed → nothing
  s = settle();
  voice.tomcatSetAfterburnerLaunch(s, true);
  const f = run(s, 0, 3);
  assert.equal(f.abEngaged, true);
  assert.ok(f.abZone >= 1);
  voice.tomcatSetAfterburnerLaunch(s, false);
  assert.equal(run(s, 0, 3).abZone, 0, 'launch cleared at 0 mph → out');
  s = settle();
  voice.tomcatSetAfterburnerArmed(s, false);
  voice.tomcatSetAfterburnerLaunch(s, true);
  assert.equal(run(s, mph(100), 3).abZone, 0, 'unarmed launch never lights');
});

/* ───────────── pure: callouts ───────────── */

test('callouts: default modes (warning voice, caution tone), phrases, volume / pitch, gear mechanical', () => {
  const log = mockSpeech();
  try {
    const { a, tones, mech, clock } = arbiter();
    assert.deepEqual(a.getMode(), { warning: 'voice', caution: 'tone' });
    assert.equal(a.cautionVoice, false);
    // HIGH SPEED / OVERSPEED are off by default (Frontend's highSpeedCallouts mirror)
    assert.equal(a.highSpeed, false);
    assert.equal(a.callout('overspeedWarning'), 'suppressed');
    assert.equal(a.callout('overspeedCaution'), 'suppressed');
    assert.equal(log.spoken.length, 0);
    a.setHighSpeed(true);
    assert.equal(a.callout('overspeedWarning'), 'voice', 'suppressed calls start no cooldown');
    assert.equal(log.spoken.at(-1).text, 'Overspeed');
    assert.ok(Math.abs(log.spoken.at(-1).volume - 0.6) < 1e-9);
    assert.ok(log.spoken.at(-1).pitch < 1 && log.spoken.at(-1).pitch > 0.7, 'slightly low pitch');
    clock.t += 5;
    assert.equal(a.callout('overspeedCaution'), 'tone', 'caution plays tone by default');
    assert.equal(tones.at(-1).level, 'caution');
    clock.t += 5;
    a.setCautionVoice(true);
    assert.equal(a.callout('abUnarmed'), 'voice');
    assert.equal(log.spoken.at(-1).text, 'Afterburner unarmed');
    clock.t += 5;
    assert.equal(a.callout('gearUp'), 'mechanical');
    assert.equal(a.callout('gearDown'), 'mechanical');
    assert.deepEqual(mech, ['gearUp', 'gearDown']);
    assert.equal(a.callout('nope'), 'suppressed');
    for (const id of ['touchAndGo', 'goAround', 'launch']) assert.equal(a.callout(id), 'suppressed', `${id}: no callout`);
    clock.t += 5;
    a.setCautionVoice(false);
    assert.equal(a.callout('gpsFail'), 'tone', 'gpsFail is a caution: tone by default');
    assert.equal(fc.JET_CALLOUTS.gpsFail.level, 'caution');
    assert.ok(!JSON.stringify(fc.JET_CALLOUTS).match(/note/));
    assert.equal(fc.JET_CALLOUTS.overspeedCaution.text, 'Speed caution');
  } finally {
    unmockSpeech();
  }
});

test('callouts: per-id cooldown ~20 s, off, tone mode, fallback to tone without speechSynthesis', () => {
  const { a, clock, tones } = arbiter();
  a.setHighSpeed(true);
  // no speechSynthesis in node → warning falls back to tone
  assert.equal(a.callout('overspeedWarning'), 'tone');
  assert.equal(tones.at(-1).level, 'warning');
  clock.t += 5;
  assert.equal(a.callout('overspeedWarning'), 'suppressed', 'cooldown');
  clock.t += 14.9;
  assert.equal(a.callout('overspeedWarning'), 'suppressed', 'still cooling at 19.9 s');
  clock.t += 0.2;
  assert.equal(a.callout('overspeedWarning'), 'tone', 'again after 20 s');
  clock.t += 2;
  assert.equal(a.callout('overspeedCaution'), 'tone', 'other ids have their own cooldown');
  clock.t += 30;
  a.setMode('off');
  assert.deepEqual(a.getMode(), { warning: 'off', caution: 'off' });
  const n = tones.length;
  assert.equal(a.callout('overspeedWarning'), 'suppressed');
  assert.equal(a.callout('abUnarmed'), 'suppressed');
  assert.equal(tones.length, n);
  assert.equal(a.callout('gearDown'), 'mechanical', 'gear is a mechanical sound, not an alert');
  a.setMode('tone');
  assert.equal(a.callout('overspeedWarning'), 'tone');
  a.setMode({ warning: 'voice' });
  assert.deepEqual(a.getMode(), { warning: 'voice', caution: 'tone' });
  a.setMode('voice');
  assert.deepEqual(a.getMode(), { warning: 'voice', caution: 'tone' }, "'voice' keeps cautions on tone unless setCautionVoice");
  a.setMode('bogus');
  assert.deepEqual(a.getMode(), { warning: 'voice', caution: 'tone' });
});

test('callouts: never stacked — a warning cancels a playing caution; others wait out the active alert', () => {
  const log = mockSpeech();
  try {
    const { a, clock, tones } = arbiter();
    a.setHighSpeed(true);
    assert.equal(a.callout('overspeedCaution'), 'tone');
    const caution = tones.at(-1);
    clock.t += 0.2;
    assert.equal(a.callout('abUnarmed'), 'suppressed', 'caution while a caution plays');
    assert.equal(a.callout('overspeedWarning'), 'voice', 'warning cuts in');
    assert.equal(caution.cancelled, true, 'caution tone faded out');
    clock.t += 0.3;
    a.setCautionVoice(true);
    assert.equal(a.callout('abUnarmed'), 'suppressed', 'no caution over a speaking warning');
    // speaking caution is cancelled by a warning (speechSynthesis.cancel)
    clock.t += 30;
    assert.equal(a.callout('abUnarmed'), 'voice');
    const c0 = log.cancels;
    clock.t += 0.3;
    assert.equal(a.callout('overspeedWarning'), 'voice');
    assert.ok(log.cancels > c0, 'speech cancelled before the warning');
    // alertTone: 'note' silent no-op
    const n = tones.length;
    clock.t += 30;
    assert.equal(a.alertTone('note'), false);
    assert.equal(tones.length, n);
    assert.equal(a.alertTone('caution'), true);
    assert.equal(a.alertTone('warning'), true, 'warning cancels the caution tone');
    assert.equal(tones.at(-2).cancelled, true);
    assert.equal(a.alertTone('caution'), false, 'no caution over a warning');
  } finally {
    unmockSpeech();
  }
});

/* ───────────── live chain ───────────── */

const shim = (e) => {
  if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower';
};

test('live: phases shape the spool; touch-and-go re-spools faster than a takeoff roll; launch lights AB', async () => {
  const trace = [];
  let script;
  const run = async (name, steps, dur, profile) => {
    trace.length = 0;
    const pending = [...steps];
    const buf = await renderLive(profile ?? (() => ({ speed: 0, throttle: 0, load: 0 })), dur, {
      patchId: 'aerospace-f14',
      seed: `cj-flight-${name}`,
      fps: 30,
      onFrame: (e, t) => {
        shim(e);
        while (pending.length && pending[0][0] <= t + 1e-9) pending.shift()[1](e);
        trace.push({ t, spool: e.base.tcDrive?.spool ?? 0, zone: e.getAfterburnerZone?.() ?? 0 });
      },
    });
    return { buf, tr: [...trace] };
  };
  const at = (tr, t) => tr.find((x) => x.t >= t - 1e-9);
  // TAXI (pedal floored) stays low; TAKEOFF_ROLL (pedal up) pushes to MIL; ROLLOUT spools down
  script = [
    [0.5, (e) => e.setFlightPhase('TAXI')],
    [8, (e) => e.setFlightPhase('TAKEOFF_ROLL')],
    [16, (e) => e.setFlightPhase('ROLLOUT')],
  ];
  const a = await run('phases', script, 24, (t) => ({ speed: t < 8 ? mph(15) : mph(40), throttle: t < 8 ? 1 : 0, load: t < 8 ? 1 : 0 }));
  const taxi = at(a.tr, 7.9).spool;
  const roll = at(a.tr, 15.9).spool;
  const rollout = at(a.tr, 23.9).spool;
  assert.ok(roll > taxi + 0.2, `taxi ${taxi.toFixed(3)} vs takeoff roll ${roll.toFixed(3)}`);
  assert.ok(rollout < roll - 0.2, `rollout ${rollout.toFixed(3)} spools down from ${roll.toFixed(3)}`);
  assert.ok(a.tr.every((x) => x.zone === 0), 'no AB under 80 mph without a launch');
  assert.ok(samplePeakDb(channelsOf(a.buf)) <= -1);
  const target = roll * 0.9;
  const riseFrom = (tr, t0) => (tr.find((x) => x.t > t0 && x.spool >= target)?.t ?? 99) - t0;
  // from rollout idle: a takeoff roll vs a touch-and-go (fast re-spool)
  const idle = () => ({ speed: mph(40), throttle: 0, load: 0 });
  const r = await run('roll', [[0.5, (e) => e.setFlightPhase('ROLLOUT')], [8, (e) => e.setFlightPhase('TAKEOFF_ROLL')]], 14, idle);
  const b = await run('tng', [[0.5, (e) => e.setFlightPhase('ROLLOUT')], [8, (e) => e.setFlightPhase('TOUCH_AND_GO')]], 14, idle);
  const rollRise = riseFrom(r.tr, 8);
  const tngRise = riseFrom(b.tr, 8);
  assert.ok(rollRise < 6, `takeoff roll reaches MIL (${rollRise.toFixed(2)} s)`);
  assert.ok(tngRise < rollRise * 0.8, `touch-and-go re-spool ${tngRise.toFixed(2)} s vs takeoff roll ${rollRise.toFixed(2)} s`);
  // launch: armed AB lights at low speed, clears when launch drops below 77 mph
  // Frontend order (regimeToAudioCalls): setFlightPhase(phase, { gear, launch }) then setAfterburnerLaunch(afterburnerLit);
  // a later phase change with launch: false must not put out a lit burner
  const c = await run(
    'launch',
    [
      [0.5, (e) => e.setFlightPhase('TAKEOFF_ROLL', { gear: 'down', launch: true })],
      [0.5, (e) => e.setAfterburnerLaunch(true)],
      [3, (e) => e.setFlightPhase('TAKEOFF_ROLL', { gear: 'down', launch: false })],
      [7, (e) => e.setAfterburnerLaunch(false)],
    ],
    10,
    () => ({ speed: mph(30), throttle: 1, load: 1 }),
  );
  assert.ok(at(c.tr, 6.5).zone >= 1, `launch zone ${at(c.tr, 6.5).zone}`);
  assert.equal(at(c.tr, 9.9).zone, 0);
  assert.ok(samplePeakDb(channelsOf(c.buf)) <= -1);
});

test('live: speed config API, gear only on a transition into up/down, note silent, callouts tone without speech, off silent', async () => {
  // Measured on the jet voice bus alone (TF30 voice + wrapper output unplugged): silence is absolute,
  // so the check doesn't depend on two renders lining up frame for frame on a loaded box.
  const results = [];
  let alertCalls = 0;
  const steps = [
    [0.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'down' })],
    [1, (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
    [1.5, (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
    [4, (e) => e.setFlightPhase('AIRBORNE', { gear: 'up' })],
    [8, (e) => e.playAlertTone('note')],
    [9.6, (e) => e.getAudioSpeedConfig()],
    [9.7, (e) => e.setAudioSpeedConfig({ abEngageMph: 75, abDisengageMph: 72 })],
    [9.8, (e) => e.setAudioSpeedConfig({})],
    [9.85, (e) => e.playFlightCallout('overspeedWarning')],
    [9.9, (e) => e.setHighSpeedCallouts(true)],
    [10, (e) => e.playFlightCallout('overspeedWarning')],
    [10.05, (e) => e.playFlightCallout('overspeedWarning')],
    [11, (e) => e.playFlightCallout('overspeedCaution')],
    [12, (e) => e.setCalloutMode('off')],
    [12.1, (e) => e.playFlightCallout('abUnarmed')],
    [12.2, (e) => e.playFlightCallout('gpsFail')],
    [12.3, (e) => e.getCalloutMode()],
    [12.4, (e) => e.playFlightCallout('touchAndGo')],
    [12.5, (e) => e.playFlightCallout('goAround')],
    [14, (e) => e.playFlightCallout('gearDown')],
  ];
  const pending = [...steps];
  const buf = await renderLive(() => ({ speed: mph(100), throttle: 0.5, load: 0.5 }), 18, {
    patchId: 'aerospace-f14',
    seed: 'cj-flight-bus',
    fps: 30,
    onFrame: (e, t) => {
      if (t === 0) {
        const jv = e.base.ensureJetVoice();
        const orig = jv.alertTone.bind(jv);
        jv.alertTone = (...a) => (alertCalls++, orig(...a));
        e.output.disconnect();
        jv.out.disconnect();
        jv.out.connect(jv.ctx.destination);
      }
      while (pending.length && pending[0][0] <= t + 1e-9) results.push(pending.shift()[1](e));
    },
  });
  const db = (from, to) => rmsDb(channelsOf(buf, from, to)[0]);
  const [, , , , note, cfg0, cfgLegacy, cfgKeep, hsOff, , w1, w2, c1, , off1, off2, modeOff, tng, ga, gearR] = results;
  assert.equal(hsOff, 'suppressed', 'high-speed callouts off by default');
  assert.equal(ga, 'suppressed', 'goAround: no callout');
  assert.ok(db(0.3, 3.95) < -100, `nothing on the first gear report or during 'transit' (${db(0.3, 3.95).toFixed(1)} dB)`);
  assert.ok(db(4, 7.2) > -70, `gearUp cue on the transition into 'up' (${db(4, 7.2).toFixed(1)} dB)`);
  assert.equal(note, false);
  assert.ok(db(7.6, 9.9) < -100, `'note' is silent (${db(7.6, 9.9).toFixed(1)} dB)`);
  assert.deepEqual(cfg0, { abEngageMph: 80, abDisengageMph: 77 });
  assert.deepEqual(cfgLegacy, { abEngageMph: 75, abDisengageMph: 72 });
  assert.deepEqual(cfgKeep, { abEngageMph: 75, abDisengageMph: 72 });
  assert.equal(w1, 'tone', 'no speechSynthesis offline → tone');
  assert.equal(w2, 'suppressed', 'cooldown / no stacking');
  assert.equal(c1, 'tone');
  assert.ok(db(10, 10.8) > -70, `warning tone audible (${db(10, 10.8).toFixed(1)} dB)`);
  assert.ok(db(11, 11.7) > -70, 'caution tone audible');
  assert.equal(off1, 'suppressed');
  assert.equal(off2, 'suppressed');
  assert.deepEqual(modeOff, { warning: 'off', caution: 'off' });
  assert.equal(tng, 'suppressed', 'touchAndGo is a harmless no-op');
  assert.ok(db(12.05, 13.9) < -100, `'off' / touchAndGo silent (${db(12.05, 13.9).toFixed(1)} dB)`);
  assert.equal(gearR, 'mechanical', "gear is mechanical, not affected by 'off'");
  assert.ok(db(14, 17) > -70, 'gear cue audible with callouts off');
  assert.equal(alertCalls, 2, 'exactly the warning + caution tones were built');
  assert.ok(samplePeakDb(channelsOf(buf)) <= -1);
});

test('files: flight layer in src/audio only; no storage; banned names absent', () => {
  for (const f of ['src/audio/flightCallouts.js', 'src/audio/flightCallouts.d.ts', 'docs/cj-cold-start.md']) {
    const s = readFileSync(join(root, f), 'utf8');
    assert.ok(!/localStorage|sessionStorage|indexedDB/i.test(s), f);
    assert.ok(!/top gun|maverick|goose|iceman|grumman|aerospace[ -]f-?14/i.test(s.replace(/aerospace-f14/g, '')), f);
  }
});
