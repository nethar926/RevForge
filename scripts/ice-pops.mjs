/**
 * ICE pop / crackle / click counter — Build Lead release gate, deterministic offline.
 *
 *   node scripts/ice-pops.mjs [--json out.json] [--wav dir] [--scenario name ...] [engine ...]
 *
 * Renders every ICE engine through its REAL offline path (pulse worklet + shared voice code,
 * seeded randomness → identical numbers every run) in four scenarios and counts transient pops:
 *
 *   steady3k  10 s  3000 rpm, constant speed. Throttle = GPS-style load 0.12 + accel/5 with a
 *                   deterministic ±0.45 m/s² accel wobble (what GPS noise looks like at a steady
 *                   speed), so Frontend's `overrun` flag flickers on/off exactly like the field.
 *   coastLow  10 s  low-rpm coast: 1700 → 1150 rpm, throttle ≈ 0.04, overrun flag true.
 *   idle      10 s  parked, throttle 0, pack idle rpm (+ Frontend idle wander).
 *   liftoff   10 s  2 s pulling at ~5000 rpm (throttle 0.85), lift (0.1 s), rpm falls to idle.
 *                   Pops counted from the lift onwards.
 *
 * Detector (documented threshold, tuned so the plain running engine scores 0):
 *   1. mono = (L+R)/2;  d[n] = mono[n] − mono[n−1]   (sample-to-sample jump; tilts toward the
 *      broadband snap of a pop/click and away from the low firing fundamentals).
 *   2. e[k] = RMS of d over 1 ms windows (hop 0.5 ms).
 *   3. background b[k] = 95th percentile of e over the preceding 400 ms (ending 6 ms earlier),
 *      so the engine's own periodic firing pulses set the reference.
 *   4. A pop is e[k] > POP_RATIO · b[k] (POP_RATIO = 2.5, i.e. +8 dB over the loudest 5 % of
 *      the recent engine) and e[k] above an absolute floor (−80 dBFS diff-RMS).
 *   5. Hits closer than 30 ms merge into one pop.
 * The first 0.6 s of every render is skipped (graph warm-up).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const POP_RATIO = 2.5;
export const POP_FLOOR = 1e-4;
const WIN_S = 0.001;
const HOP_S = 0.0005;
const BG_S = 0.4;
const BG_GAP_S = 0.006;
const MERGE_S = 0.03;
const SKIP_S = 0.6;
const SR = 44100;
const SEED = 0x5eed;

/** Count pops in an AudioBuffer between [from, to) seconds. Returns { count, times }. */
export function countPops(buf, from = SKIP_S, to = Infinity) {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = L.length;
  const win = Math.round(WIN_S * sr);
  const hop = Math.round(HOP_S * sr);
  const K = Math.floor((n - win) / hop);
  const e = new Float64Array(K);
  for (let k = 0; k < K; k++) {
    let s = 0;
    const i0 = k * hop;
    for (let i = Math.max(1, i0); i < i0 + win; i++) {
      const d = 0.5 * (L[i] + R[i]) - 0.5 * (L[i - 1] + R[i - 1]);
      s += d * d;
    }
    e[k] = Math.sqrt(s / win);
  }
  const bgN = Math.round(BG_S / HOP_S);
  const gapN = Math.round(BG_GAP_S / HOP_S);
  const times = [];
  let last = -1;
  const kFrom = Math.max(bgN + gapN, Math.floor(from / HOP_S));
  const kTo = Math.min(K, Math.floor(Math.min(to, n / sr) / HOP_S));
  const scratch = new Float64Array(bgN);
  for (let k = kFrom; k < kTo; k++) {
    if (e[k] < POP_FLOOR) continue;
    // quick reject: below every background value? compute percentile only when needed
    for (let j = 0; j < bgN; j++) scratch[j] = e[k - gapN - bgN + j];
    scratch.sort();
    const bg = scratch[Math.floor(0.95 * (bgN - 1))];
    if (e[k] > POP_RATIO * Math.max(bg, 1e-9)) {
      const t = k * HOP_S;
      if (last < 0 || t - last > MERGE_S) times.push(+t.toFixed(4));
      last = t;
    }
  }
  return { count: times.length, times };
}

// ── scenarios (explicit rpm, like Frontend's useDriveSimulation) ──
const S = (mph) => mph / 120;
function wobble(t) {
  // deterministic GPS-like accel noise (m/s²), no randomness needed
  return 0.45 * (0.6 * Math.sin(2 * Math.PI * 0.37 * t) + 0.3 * Math.sin(2 * Math.PI * 1.13 * t + 1.7) + 0.1 * Math.sin(2 * Math.PI * 2.9 * t + 0.4));
}
export function scenarios(idleRpm) {
  const idleHi = idleRpm * 1.6;
  return {
    steady3k: {
      dur: 10,
      from: SKIP_S,
      profile: (t) => {
        const acc = wobble(t);
        const load = Math.max(0, Math.min(1, 0.12 + acc / 5));
        return { speed: S(52), throttle: load, load, rpm: 3000 + acc * 18, overrun: acc < -0.25 && 3000 > idleHi && load < 0.15 };
      },
    },
    coastLow: {
      dur: 10,
      from: SKIP_S,
      profile: (t) => {
        const rpm = 1700 - (550 * t) / 10;
        return { speed: S(30 - t * 0.9), throttle: 0.04, load: 0.04, rpm, overrun: rpm > idleHi };
      },
    },
    idle: {
      dur: 10,
      from: SKIP_S,
      profile: (t) => ({ speed: 0, throttle: 0, load: 0, rpm: idleRpm + 12 * Math.sin(2 * Math.PI * 0.7 * t), overrun: false }),
    },
    liftoff: {
      dur: 10,
      from: 2.0,
      profile: (t) => {
        if (t < 2) return { speed: S(62), throttle: 0.85, load: 0.85, rpm: 4900 + 100 * Math.min(1, t), overrun: false };
        const u = t - 2;
        const thr = Math.max(0, 0.85 * (1 - u / 0.1));
        const rpm = idleRpm + (5000 - idleRpm) * Math.exp(-u / 1.15);
        return { speed: S(Math.max(0, 62 - u * 9)), throttle: thr, load: thr, rpm, overrun: thr < 0.15 && rpm > idleHi };
      },
    },
  };
}

// ── engines ──
const CC_ID = 'chrono-coupe';
async function engines() {
  const cc = await import('./chrono-coupe-render.mjs');
  const np = await import('./night-pursuit-render.mjs');
  const gen = await import('./ice-generic-render.mjs');
  const list = [
    { id: 'night-pursuit', idle: 660, render: (p, d, o) => np.renderNightPursuit(p, d, o) },
    // Pulse family-5 voice (the V6 worklet's fallback) via its dedicated renderer
    { id: 'chrono-coupe', idle: 860, render: (p, d, o) => cc.renderChronoCoupe(p, d, o) },
    // Rear V6 voice: the SHIPPED engine graph (createEngineSynth, own worklet), running at once
    { id: 'chrono-v6', idle: 860, render: async (p, d, o) => (await import('./live-render.mjs')).renderLive(CC_ID, p, d, { ...o, params: { v6KeyWait: 0 } }) },
  ];
  for (const topo of ['v8-rumble', 'i4-zip', 'i6-silk', 'rotary-hum']) {
    const prm = gen.genericIceParams(topo);
    const idle = (Number(prm.rpmIdle) * 120) / Math.max(4, Number(prm.cylinders));
    list.push({ id: topo, idle: Math.max(700, idle), render: (p, d, o) => gen.renderGenericIce(p, d, { ...o, topology: topo }) });
  }
  return list;
}

export async function measureAll(only = [], wavDir = null, onlyScenarios = []) {
  const out = {};
  const { bufferToWav } = await import('./chrono-coupe-render.mjs');
  for (const eng of await engines()) {
    if (only.length && !only.includes(eng.id)) continue;
    out[eng.id] = {};
    const sc = scenarios(eng.idle);
    for (const [name, s] of Object.entries(sc)) {
      if (onlyScenarios.length && !onlyScenarios.includes(name)) continue;
      const buf = await eng.render(s.profile, s.dur, { sampleRate: SR, seed: SEED });
      const r = countPops(buf, s.from);
      out[eng.id][name] = r;
      if (wavDir) writeFileSync(join(wavDir, `${eng.id}-${name}.wav`), bufferToWav(buf));
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let json = null;
  let wav = null;
  const only = [];
  const onlySc = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = args[++i];
    else if (args[i] === '--wav') wav = args[++i];
    else if (args[i] === '--scenario') onlySc.push(args[++i]);
    else only.push(args[i]);
  }
  if (wav) mkdirSync(wav, { recursive: true });
  const res = await measureAll(only, wav, onlySc);
  const names = onlySc.length ? onlySc : ['steady3k', 'coastLow', 'idle', 'liftoff'];
  console.log(['engine'.padEnd(15), ...names.map((n) => n.padStart(9))].join(' '));
  for (const [id, r] of Object.entries(res)) console.log([id.padEnd(15), ...names.map((n) => String(r[n].count).padStart(9))].join(' '));
  if (json) writeFileSync(json, JSON.stringify(res, null, 1));
  process.exit(0);
}
