/**
 * AB UNARMED call setting (v2 NOTES #91: VOICE / TONE / SILENT, default SILENT) and the RADAR-on
 * warm-up hum cue (quiet, no sweep ping).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const { FlightCallouts } = await imp('src/audio/flightCallouts.js');
const { JET_CUES, JET_COLD_LEVEL, JetColdStartVoice } = await imp('src/audio/jetColdStart.js');
const nwa = await import('node-web-audio-api');

function arb() {
  let t = 0;
  const tones = [];
  const c = new FlightCallouts({
    now: () => t,
    tone: (level) => (tones.push(level), { seconds: 0.5, cancel() {} }),
    mechanical: () => true,
    canPlay: () => true,
  });
  return { c, tones, adv: (s) => (t += s) };
}

test('AB UNARMED defaults to silent', () => {
  const { c, tones } = arb();
  assert.equal(c.abUnarmedCall, 'silent');
  assert.equal(c.callout('abUnarmed'), 'suppressed');
  assert.equal(tones.length, 0);
});

test('AB UNARMED tone and voice modes override the caution setting', () => {
  const { c, tones, adv } = arb();
  c.setMode({ caution: 'voice' });
  assert.equal(c.setAbUnarmedCall('tone'), 'tone');
  assert.equal(c.callout('abUnarmed'), 'tone');
  assert.deepEqual(tones, ['caution']);
  adv(30);
  c.setAbUnarmedCall('voice'); // no speechSynthesis in node → falls back to the tone
  assert.equal(c.callout('abUnarmed'), 'tone');
  assert.equal(c.setAbUnarmedCall('bogus'), 'voice');
  adv(30);
  c.setAbUnarmedCall('silent');
  assert.equal(c.callout('abUnarmed'), 'suppressed');
  // other cautions still follow the global mode
  c.setMode('tone');
  assert.equal(c.callout('gpsFail'), 'tone');
});

test('radarOn cue is listed and renders a quiet hum', async () => {
  assert.ok(JET_CUES.includes('radarOn'));
  assert.ok(JET_COLD_LEVEL.radarHum > 0 && JET_COLD_LEVEL.radarHum < JET_COLD_LEVEL.chime);
  const sr = 48000;
  const ctx = new nwa.OfflineAudioContext(1, sr * 2.5, sr);
  const v = new JetColdStartVoice(ctx, ctx.destination);
  assert.equal(v.cue('radarOn', { when: 0.1 }), true);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0, e1 = 0, e2 = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    if (i < sr * 1.0) e1 += d[i] * d[i]; else e2 += d[i] * d[i];
  }
  assert.ok(peak > 1e-4, `audible (${peak})`);
  assert.ok(peak < 0.02, `quiet (${peak})`);
  assert.ok(Math.abs(d[d.length - 1]) < 1e-4, 'faded out by 2.5 s');
  assert.ok(e1 > 0 && e2 >= 0);
});

test("callout mode 'off' also mutes AB UNARMED", () => {
  const { c } = arb();
  c.setAbUnarmedCall('voice');
  c.setMode('off');
  assert.equal(c.callout('abUnarmed'), 'suppressed');
});
