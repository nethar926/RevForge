import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfflineAudioContext } from 'node-web-audio-api';
import {
  renderIonTwin,
  installIonTwinStemFetcher,
  ionTwinStemModule as stems,
  ION_TWIN_LOUDNESS_STATES,
  ION_TWIN_ROLES,
  ION_TWIN_STEMS_SHIPPED,
} from '../scripts/ion-twin-render.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEM_DIR = join(root, 'public/audio/ion-twin');
const SR = 44100;
const shipped = { skip: ION_TWIN_STEMS_SHIPPED ? false : 'no recorded stems in this tree' };

const rmsDb = (buf) => {
  let s = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    n += x.length;
  }
  return 10 * Math.log10(s / n + 1e-20);
};

/** Mean power (dB) per band from 4096-point Hann frames (channel mean), every 4th frame hop. */
function bandDb(buf, bands) {
  const a = buf.getChannelData(0);
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
  const N = 4096;
  const acc = bands.map(() => 0);
  let frames = 0;
  let flat = 0;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let off = 0; off + N <= a.length; off += N * 2) {
    for (let i = 0; i < N; i++) {
      re[i] = ((a[off + i] + b[off + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    let lg = 0;
    let ar = 0;
    let nb = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = (k * buf.sampleRate) / N;
      const p = re[k] * re[k] + im[k] * im[k];
      bands.forEach(([lo, hi], j) => {
        if (f >= lo && f < hi) acc[j] += p;
      });
      if (f >= 60 && f <= 10000) {
        lg += Math.log(p + 1e-20);
        ar += p;
        nb++;
      }
    }
    flat += Math.exp(lg / nb) / (ar / nb + 1e-20);
    frames++;
  }
  const out = acc.map((p) => 10 * Math.log10(p / Math.max(1, frames) + 1e-20));
  out.flatness = flat / Math.max(1, frames);
  return out;
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const xr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const xi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
}

test('stem loader no-ops cleanly when no stems ship (synth-only voice, sample-identical)', async () => {
  installIonTwinStemFetcher(null);
  try {
    const set = await stems.ionTwinStems(new OfflineAudioContext(2, 128, SR));
    assert.equal(set, null);
    const st = stems.getIonTwinStemStatus();
    assert.equal(st.manifest, 'absent');
    assert.equal(st.loaded, true);
    assert.equal(st.decoded, 0);
    const state = ION_TWIN_LOUDNESS_STATES.cruise;
    let status;
    const on = await renderIonTwin(() => state, 2, {
      preroll: 1,
      seed: 't-absent',
      actions: [[1.5, (e) => (status = e.getIonTwinStemStatus())]],
    });
    assert.equal(status.active, false);
    const off = await renderIonTwin(() => state, 2, { preroll: 1, seed: 't-absent', stems: false });
    let diff = 0;
    for (let c = 0; c < 2; c++) {
      const x = on.getChannelData(c);
      const y = off.getChannelData(c);
      for (let i = 0; i < x.length; i++) diff = Math.max(diff, Math.abs(x[i] - y[i]));
    }
    assert.ok(diff < 1e-6, `absent-stems render differs from synth-only by ${diff}`);
  } finally {
    installIonTwinStemFetcher();
  }
});

test('with stems off (?ionStems=0) the engine still starts as a synth-only voice', async () => {
  const loc = globalThis.location;
  const prevSearch = loc.search;
  loc.search = '?ionStems=0';
  try {
    assert.equal(stems.ionStemsQueryOverride(), 0);
    let st;
    let bed;
    const r = ION_TWIN_ROLES.ignition;
    const buf = await renderIonTwin((t) => (t < 3 ? { speed: 0, throttle: 0 } : { speed: 0.4, throttle: 0.5 }), 5, {
      preroll: 0.2,
      seed: 't-synth-start',
      actions: [
        ...r.actions,
        [
          4.5,
          (e) => {
            st = e.getIonTwinStemStatus();
            bed = e.base.g.ionStemBed;
          },
        ],
      ],
    });
    assert.equal(st.active, false);
    assert.equal(st.override, 0);
    assert.equal(bed, undefined);
    let peak = 0;
    const x = buf.getChannelData(0);
    for (let i = 0; i < x.length; i++) {
      assert.ok(Number.isFinite(x[i]));
      peak = Math.max(peak, Math.abs(x[i]));
    }
    assert.ok(peak > 0.01 && peak < 1, `peak ${peak}`);
    // Ignition audible in its first second, and the live synth is up once driving
    assert.ok(rmsDb({ numberOfChannels: 1, getChannelData: () => x.subarray(0, SR) }) > -60);
    assert.ok(rmsDb({ numberOfChannels: 1, getChannelData: () => x.subarray(4 * SR, 5 * SR) }) > -30);
  } finally {
    loc.search = prevSearch;
  }
});

test('ionStems query override: search or hash route, 0/1/off/on, otherwise null', () => {
  const loc = globalThis.location;
  const prev = { search: loc.search, hash: loc.hash };
  try {
    const cases = [
      ['?ionStems=1', '', 1],
      ['?ionStems=off', '', 0],
      ['', '#/drive?ionStems=0', 0],
      ['', '#/drive?ionStems=on', 1],
      ['?other=1', '', null],
      ['', '', null],
    ];
    for (const [search, hash, want] of cases) {
      loc.search = search;
      loc.hash = hash;
      assert.equal(stems.ionStemsQueryOverride(), want, `${search}${hash}`);
    }
  } finally {
    loc.search = prev.search;
    loc.hash = prev.hash;
  }
});

test('shipped stem folder: manifest lists every file (both formats) and nothing else ships', shipped, () => {
  const m = JSON.parse(readFileSync(join(STEM_DIR, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.formats, ['webm', 'm4a']);
  const want = new Set(['manifest.json']);
  for (const seg of Object.values(m.segments)) {
    for (const { file } of Object.values(seg.stems)) for (const f of m.formats) want.add(`${file}.${f}`);
  }
  const have = new Set(readdirSync(STEM_DIR));
  assert.deepEqual([...have].sort(), [...want].sort());
});

test('stems decode to their manifest length (AAC priming trimmed); ignition = reversed shutdown', shipped, async () => {
  const set = await stems.ionTwinStems(new OfflineAudioContext(2, 128, SR));
  assert.ok(set);
  const st = stems.getIonTwinStemStatus();
  assert.equal(st.manifest, 'ok');
  assert.equal(st.failed.length, 0);
  assert.equal(st.decoded, st.listed);
  for (const [seg, def] of Object.entries(set.manifest.segments)) {
    for (const stem of Object.keys(def.stems)) {
      const b = set.segments[seg][stem];
      assert.equal(b.length, Math.round(def.seconds * SR), `${seg}/${stem}`);
    }
  }
  for (const [stem, b] of Object.entries(set.segments.shutdown)) {
    const g = set.segments.ignition[stem];
    for (let c = 0; c < b.numberOfChannels; c++) {
      const s = b.getChannelData(c);
      const r = g.getChannelData(c);
      for (let i = 0; i < s.length; i += 101) assert.equal(r[i], s[s.length - 1 - i]);
    }
  }
});

test('stems on vs off: master RMS and spectrum differ measurably; status reports the stems', shipped, async (t) => {
  const bands = [
    [20, 200],
    [200, 1500],
    [1500, 6000],
    [6000, 16000],
  ];
  const state = { speed: 0.5, throttle: 0.5 };
  let st;
  const on = await renderIonTwin(() => state, 6, {
    preroll: 3,
    seed: 't-onoff',
    actions: [[5.5, (e) => (st = e.getIonTwinStemStatus())]],
  });
  const off = await renderIonTwin(() => state, 6, { preroll: 3, seed: 't-onoff', stems: false });
  assert.equal(st.loaded, true);
  assert.ok(st.decoded > 0);
  assert.equal(st.active, true);
  assert.ok(Number.isFinite(st.stemGainDb) && st.stemGainDb > 0, `stemGainDb ${st.stemGainDb}`);
  const bOn = bandDb(on, bands);
  const bOff = bandDb(off, bands);
  const d = bOn.map((v, i) => v - bOff[i]);
  // Third-octave spectral shape (50 Hz–12.5 kHz), overall level change taken out
  const thirds = [];
  for (let f = 50; f < 12500; f *= Math.pow(2, 1 / 3)) thirds.push([f, f * Math.pow(2, 1 / 3)]);
  const tOn = bandDb(on, thirds);
  const tOff = bandDb(off, thirds);
  const td = tOn.map((v, i) => v - tOff[i]);
  const mean = td.reduce((x, y) => x + y) / td.length;
  const shape = Math.sqrt(td.reduce((x, y) => x + (y - mean) ** 2, 0) / td.length);
  t.diagnostic(`RMS on ${rmsDb(on).toFixed(2)} dB, off ${rmsDb(off).toFixed(2)} dB`);
  t.diagnostic(`bands on−off (dB): ${bands.map(([lo, hi], i) => `${lo}-${hi} ${d[i].toFixed(2)}`).join(', ')}`);
  t.diagnostic(`third-octave shape distance ${shape.toFixed(2)} dB; max band |Δ| ${Math.max(...td.map((v) => Math.abs(v - mean))).toFixed(2)} dB`);
  t.diagnostic(`spectral flatness on ${tOn.flatness.toFixed(4)}, off ${tOff.flatness.toFixed(4)}; stemGainDb ${st.stemGainDb.toFixed(1)}`);
  assert.ok(shape > 2, `third-octave shape distance ${shape.toFixed(2)} dB`);
  // Recorded, tonal stems in place of broadband synth noise: flatness drops by more than half
  assert.ok(tOn.flatness < tOff.flatness * 0.5, `flatness on ${tOn.flatness} vs off ${tOff.flatness}`);
  // The recordings replace the synth's broadband air: the >6 kHz band drops clearly
  assert.ok(d[3] < -3, `>6 kHz on−off ${d[3].toFixed(2)} dB`);
});

test('grain seams: no sample jump at grain boundaries beyond the material itself', shipped, async (t) => {
  const set = await stems.ionTwinStems(new OfflineAudioContext(2, 128, SR));
  for (const stem of ['scream', 'howl', 'air']) {
    const b = set.segments.sustain[stem];
    const ctx = new OfflineAudioContext(1, SR * 6, SR);
    const p = new stems.IonGrainPlayer(ctx, b, { ...stems.ION_STEM_GRAIN[stem], seed: 7 });
    p.log = [];
    p.out.connect(ctx.destination);
    for (let k = 0; k < 6 / 0.1; k++) {
      ctx.suspend(k * 0.1 + 128 / SR).then(() => {
        p.setRate(Math.pow(2, Math.sin(k / 9) * 3 / 12), ctx.currentTime);
        p.tick(ctx.currentTime, 0.25);
        ctx.resume();
      });
    }
    const y = (await ctx.startRendering()).getChannelData(0);
    // Max first difference near grain starts / ends vs anywhere else
    const near = new Uint8Array(y.length);
    for (const g of p.log) {
      for (const at of [g.at, g.at + g.length]) {
        const c = Math.round(at * SR);
        for (let i = Math.max(0, c - 256); i < Math.min(y.length, c + 256); i++) near[i] = 1;
      }
    }
    let atSeam = 0;
    let other = 0;
    for (let i = 1 + SR / 2; i < y.length - SR / 2; i++) {
      const dlt = Math.abs(y[i] - y[i - 1]);
      if (near[i]) atSeam = Math.max(atSeam, dlt);
      else other = Math.max(other, dlt);
    }
    t.diagnostic(`${stem}: max |Δx| at seams ${atSeam.toFixed(4)}, elsewhere ${other.toFixed(4)}`);
    assert.ok(atSeam <= other * 1.25, `${stem}: seam jump ${atSeam} vs ${other}`);
  }
});
