/**
 * Carrier Jet warning tones (src/audio/jetWarnings.js): offline renders through the shipped live
 * chain (CharacterEngine → EngineSynthImpl → jet cue bus → Tomcat pad → master → limiter → output).
 * Cold start is on with every system off, so the engines are dark and the only sound is the
 * warnings. Calls land at frame times via the cold-start render harness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(join(root, rel)).href);
const { renderColdStart } = await imp('tests/cj-cold-start-render.mjs');
const W = await imp('src/audio/jetWarnings.js');

const PARK = () => ({ speed: 0, throttle: 0, load: 0 });
const render = (timeline, dur, opts = {}) => renderColdStart(timeline, dur, { profile: PARK, seed: 'cj-warnings', ...opts });
const at = (t, fn) => [t, '', fn];
const chans = (buf) => Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
const mono = (buf) => {
  const cs = chans(buf);
  return cs[0].map((_, i) => cs.reduce((s, c) => s + c[i], 0) / cs.length);
};
const slice = (x, sr, a, b) => x.subarray(Math.max(0, Math.round(a * sr)), Math.min(x.length, Math.round(b * sr)));
const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const maxStep = (x) => x.reduce((m, v, i) => (i ? Math.max(m, Math.abs(v - x[i - 1])) : 0), 0);
/** Goertzel power of one frequency in a block. */
function power(x, f, sr) {
  const w = (2 * Math.PI * f) / sr;
  const k = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s0 = x[i] + k * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - k * s1 * s2) / (x.length * x.length);
}
/** Onsets: 5 ms RMS frames rising past `thr` × running max after being below it. */
function onsets(x, sr, thr = 0.5) {
  const n = Math.round(0.005 * sr);
  const env = [];
  for (let i = 0; i + n <= x.length; i += n) env.push(Math.sqrt(slice(x, 1, i, i + n).reduce((s, v) => s + v * v, 0) / n));
  const out = [];
  let prev = 0;
  for (let i = 1; i < env.length; i++) {
    // a strike: the frame jumps well above the previous one (the decaying tail of the last strike)
    if (env[i] > 0.01 && env[i] > env[i - 1] * 1.6 && env[i] > prev * thr) out.push((i * n) / sr);
    prev = Math.max(prev * 0.98, env[i]);
  }
  // merge onsets closer than 40 ms (attack spread over two frames)
  return out.filter((t, i) => i === 0 || t - out[i - 1] > 0.04);
}

test('warning files: procedural only, no samples / speech / storage', () => {
  const src = readFileSync(join(root, 'src/audio/jetWarnings.js'), 'utf8');
  const impl = readFileSync(join(root, 'src/audio/EngineSynthImpl.ts'), 'utf8');
  for (const re of [/\.mp3|\.wav|\.ogg|decodeAudioData|fetch\(|new Audio\(|<audio/i, /speechSynthesis|SpeechSynthesis/, /localStorage|sessionStorage|indexedDB/])
    assert.ok(!re.test(src), `jetWarnings.js matches ${re}`);
  const block = impl.slice(impl.indexOf('Carrier Jet warning tones (real-time'), impl.indexOf('One-shot switch foley / cue on the Tomcat pack'));
  assert.ok(block.length > 200, 'warning block found');
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(block), 'no storage in the engine warning API');
  assert.deepEqual([...W.JET_WARNINGS], ['stall', 'masterCaution']);
  assert.equal(W.STALL_HI, 800);
  assert.equal(W.STALL_LO, 600);
  assert.equal(W.STALL_RATE, 4);
  assert.equal(W.CHIME_HZ, 1175);
});

test('API: default off, guards non-boolean / unknown ids, getWarnings reports state', async () => {
  const seen = {};
  await render(
    [
      at(0.1, (e) => {
        seen.initial = e.getWarnings();
        seen.badId = e.setWarning('fire', true);
        seen.badVal = e.setWarning('stall', 1);
        seen.badVal2 = e.setWarning('masterCaution', 'yes');
        e.setWarningsEnabled('true');
        seen.afterBadEnable = e.getWarnings();
        seen.ok = e.setWarning('stall', true);
        seen.repeat = e.setWarning('stall', true);
        seen.mid = e.getWarnings();
        e.setWarningsEnabled(true);
        seen.on = e.getWarnings();
        e.setWarning('stall', false);
        e.setWarningsEnabled(false);
        seen.end = e.getWarnings();
      }),
    ],
    0.3,
  );
  assert.deepEqual(seen.initial, { enabled: false, stall: false, masterCaution: false });
  assert.equal(seen.badId, false);
  assert.equal(seen.badVal, false);
  assert.equal(seen.badVal2, false);
  assert.deepEqual(seen.afterBadEnable, { enabled: false, stall: false, masterCaution: false });
  assert.equal(seen.ok, true);
  assert.equal(seen.repeat, true);
  assert.deepEqual(seen.mid, { enabled: false, stall: true, masterCaution: false });
  assert.deepEqual(seen.on, { enabled: true, stall: true, masterCaution: false });
  assert.deepEqual(seen.end, { enabled: false, stall: false, masterCaution: false });
});

test('disabled (default): stall + master caution active → silence', async () => {
  const buf = await render(
    [
      at(0.3, (e) => e.setWarning('stall', true)),
      at(0.5, (e) => e.setWarning('masterCaution', true)),
      at(1.5, (e) => e.setWarning('masterCaution', false)),
      at(1.8, (e) => e.setWarning('masterCaution', true)),
    ],
    3,
  );
  for (const c of chans(buf)) {
    assert.ok(c.every(Number.isFinite), 'finite');
    assert.ok(db(peak(c)) < -90, `silent while disabled (peak ${db(peak(c)).toFixed(1)} dBFS)`);
  }
});

test('stall: 800 / 600 Hz alternating every ≈ 125 ms, ≈ -5 dBFS, clears to silence in ≈ 100 ms without a click', async () => {
  const ON = 0.5;
  const OFF = 2.5;
  const buf = await render(
    [at(0.2, (e) => e.setWarningsEnabled(true)), at(ON, (e) => e.setWarning('stall', true)), at(OFF, (e) => e.setWarning('stall', false))],
    3.2,
  );
  const sr = buf.sampleRate;
  const x = mono(buf);
  assert.ok(x.every(Number.isFinite), 'finite');
  assert.ok(db(peak(slice(x, sr, 0, ON - 0.01))) < -90, 'silent before activation');
  const pk = db(Math.max(...chans(buf).map((c) => peak(c))));
  assert.ok(pk <= -4 && pk >= -6.5, `stall peak ≈ -5 dBFS (got ${pk.toFixed(2)})`);
  // dominant tone per 20 ms block (5 ms hop); the energy sits at 800 or 600 Hz, not elsewhere
  const seq = [];
  for (let t = ON + 0.06; t + 0.02 < OFF - 0.02; t += 0.005) {
    const b = slice(x, sr, t, t + 0.02);
    const ms = b.reduce((s, v) => s + v * v, 0) / b.length;
    const hi = power(b, 800, sr);
    const lo = power(b, 600, sr);
    seq.push({ t: t + 0.01, tone: hi > lo ? 'hi' : 'lo', ratio: Math.max(hi, lo) / Math.max(1e-30, Math.min(hi, lo)), share: (2 * Math.max(hi, lo)) / ms });
  }
  const clean = seq.filter((s) => s.ratio > 4 && s.share > 0.7);
  assert.ok(clean.length > seq.length * 0.6, `energy sits on one of 800 / 600 Hz most of the time (${clean.length} / ${seq.length} blocks)`);
  assert.ok(clean.some((s) => s.tone === 'hi') && clean.some((s) => s.tone === 'lo'), 'both tones present');
  const switches = [];
  for (let i = 1; i < clean.length; i++) if (clean[i].tone !== clean[i - 1].tone) switches.push(clean[i].t);
  assert.ok(switches.length >= 12, `alternates (${switches.length} switches in ${(OFF - ON).toFixed(1)} s)`);
  const gaps = switches.slice(1).map((t, i) => t - switches[i]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  assert.ok(Math.abs(mean - 0.125) < 0.012, `mean switch interval ≈ 125 ms (got ${(mean * 1000).toFixed(1)} ms)`);
  for (const g of gaps) assert.ok(Math.abs(g - 0.125) < 0.03, `each switch interval ≈ 125 ms (got ${(g * 1000).toFixed(1)} ms)`);
  // clear: silent within ≈ 100 ms; the fade never steps harder than the steady tone
  assert.ok(db(peak(slice(x, sr, OFF + 0.1, 3.2))) < -80, `silent 100 ms after clearing (${db(peak(slice(x, sr, OFF + 0.1, 3.2))).toFixed(1)} dBFS)`);
  // Click check on the engine output tap (EngineSynthImpl: cue bus → pad → master → limiter). The
  // offline car-wrapper stage adds quantum-boundary steps to ANY tone on this bus (a fixed sine
  // shows them too; the engine tap does not), so the wrapper output cannot isolate a click.
  const base = await render(
    [at(0.2, (e) => e.setWarningsEnabled(true)), at(ON, (e) => e.setWarning('stall', true)), at(OFF, (e) => e.setWarning('stall', false))],
    3.2,
    { tap: 'base' },
  );
  for (const c of chans(base)) {
    const steady = maxStep(slice(c, sr, ON + 0.3, OFF - 0.05));
    const rel = maxStep(slice(c, sr, OFF - 0.02, OFF + 0.2));
    const att = maxStep(slice(c, sr, ON - 0.02, ON + 0.1));
    assert.ok(steady > 0, 'stall audible at the engine tap');
    assert.ok(rel <= steady * 1.02, `release step ${rel.toExponential(2)} ≤ steady ${steady.toExponential(2)}`);
    assert.ok(att <= steady * 1.02, `attack step ${att.toExponential(2)} ≤ steady ${steady.toExponential(2)}`);
    assert.ok(db(peak(slice(c, sr, OFF + 0.1, 3.2))) < -80, 'engine tap silent 100 ms after clearing');
  }
});

test('master caution: one double chime per activation (re-arms on clear), finite, no DC, ≈ -5 dBFS', async () => {
  const buf = await render(
    [
      at(0.2, (e) => e.setWarningsEnabled(true)),
      at(0.5, (e) => e.setWarning('masterCaution', true)),
      at(0.9, (e) => e.setWarning('masterCaution', true)), // repeat while active: no-op
      at(1.5, (e) => e.setWarning('masterCaution', false)),
      at(2.5, (e) => e.setWarning('masterCaution', true)),
    ],
    6,
  );
  const sr = buf.sampleRate;
  const x = mono(buf);
  for (const c of chans(buf)) {
    assert.ok(c.every(Number.isFinite), 'finite');
    const dc = c.reduce((s, v) => s + v, 0) / c.length;
    assert.ok(Math.abs(dc) < 1e-4, `no DC (mean ${dc.toExponential(2)})`);
  }
  assert.ok(db(peak(slice(x, sr, 0, 0.49))) < -90, 'silent before the first activation');
  const pk = db(Math.max(...chans(buf).map((c) => peak(c))));
  assert.ok(pk <= -4 && pk >= -6.5, `chime peak ≈ -5 dBFS (got ${pk.toFixed(2)})`);
  const on = onsets(x, sr);
  assert.equal(on.length, 4, `two strikes per activation (onsets ${on.map((t) => t.toFixed(3)).join(', ')})`);
  const near = (t, want) => Math.abs(t - want) < 0.03;
  assert.ok(near(on[0], 0.5) && near(on[1], 0.66), 'first double chime at activation');
  assert.ok(near(on[2], 2.5) && near(on[3], 2.66), 'second double chime after re-arm');
  // tone sits at 1175 Hz
  const b = slice(x, sr, 0.52, 0.62);
  assert.ok(power(b, 1175, sr) > 30 * power(b, 800, sr), 'energy at 1175 Hz');
  assert.ok(db(peak(slice(x, sr, 5.6, 6))) < -50, 'rings out');
});

test('disabling silences an active stall quickly; enabling with caution already active does not chime', async () => {
  const buf = await render(
    [
      at(0.2, (e) => e.setWarningsEnabled(true)),
      at(0.3, (e) => e.setWarning('stall', true)),
      at(1.0, (e) => e.setWarningsEnabled(false)),
      at(1.5, (e) => e.setWarning('masterCaution', true)),
      at(2.0, (e) => (e.setWarning('stall', false), e.setWarningsEnabled(true))),
    ],
    3,
  );
  const sr = buf.sampleRate;
  const x = mono(buf);
  assert.ok(db(peak(slice(x, sr, 0.5, 0.95))) > -10, 'stall audible while enabled');
  assert.ok(db(peak(slice(x, sr, 1.1, 3))) < -80, 'silent after disabling, and no chime on re-enable');
});
