/**
 * HIG "no surprise loudness" check: live engine levels (idle / cruise / WOT) and every preview
 * WAV, before vs after the master bus (fade + limiter + −1 dBFS soft ceiling).
 * BS.1770 integrated LUFS + sample peak. Run: node scripts/hig-level-check.mjs [ids…]
 * JSON=1 prints machine-readable rows.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integratedLufs, readWav16, samplePeakDb } from './loudness.mjs';
import { renderLive, throughMaster, channels } from './live-render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { OfflineAudioContext } = await import('node-web-audio-api');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['ion-twin', 'v8-rumble', 'ev-whine', 'aerospace-f14', 'night-pursuit', 'revforge-apex-v8'];
const PROFILES = {
  idle: () => ({ speed: 0, throttle: 0, load: 0 }),
  cruise: () => ({ speed: 0.5, throttle: 0.35, load: 0.3 }),
  wot: () => ({ speed: 0.9, throttle: 1, load: 1 }),
};
const DUR = 6, FROM = 2; // measure the settled 2–6 s window
const rows = [];
const f = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
console.log('LIVE (pre → post master bus)');
for (const id of ids) {
  for (const [name, prof] of Object.entries(PROFILES)) {
    const buf = await renderLive(id, prof, DUR);
    const out = await throughMaster(buf);
    const s = Math.round(FROM * buf.sampleRate);
    const a = channels(buf, s), b = channels(out, s);
    const r = { id, profile: name, lufsPre: integratedLufs(a, buf.sampleRate), lufsPost: integratedLufs(b, buf.sampleRate), peakPre: samplePeakDb(a), peakPost: samplePeakDb(b) };
    rows.push(r);
    console.log(`${id.padEnd(18)} ${name.padEnd(6)} ${r.lufsPre.toFixed(2).padStart(7)} → ${r.lufsPost.toFixed(2).padStart(7)} LUFS (Δ ${f(r.lufsPost - r.lufsPre)})   peak ${r.peakPre.toFixed(2).padStart(6)} → ${r.peakPost.toFixed(2).padStart(6)} dBFS`);
  }
}
console.log('\nPREVIEWS public/snippets (file → through master bus)');
const dir = join(ROOT, 'public', 'snippets');
for (const file of readdirSync(dir).filter((x) => x.endsWith('.wav')).sort()) {
  const { fs, channels: ch } = readWav16(readFileSync(join(dir, file)));
  const ctx = new OfflineAudioContext(ch.length, ch[0].length, fs);
  const buf = ctx.createBuffer(ch.length, ch[0].length, fs);
  ch.forEach((c, i) => buf.getChannelData(i).set(Float32Array.from(c)));
  const out = await throughMaster(buf);
  const b = channels(out);
  const r = { id: file, profile: 'preview', lufsPre: integratedLufs(ch, fs), lufsPost: integratedLufs(b, fs), peakPre: samplePeakDb(ch), peakPost: samplePeakDb(b) };
  rows.push(r);
  console.log(`${file.padEnd(24)} ${r.lufsPre.toFixed(2).padStart(7)} → ${r.lufsPost.toFixed(2).padStart(7)} LUFS (Δ ${f(r.lufsPost - r.lufsPre)})   peak ${r.peakPre.toFixed(2).padStart(6)} → ${r.peakPost.toFixed(2).padStart(6)} dBFS`);
}
const worst = rows.reduce((m, r) => Math.max(m, Math.abs(r.lufsPost - r.lufsPre)), 0);
console.log(`\nworst |ΔLUFS| = ${worst.toFixed(2)} dB; max post peak = ${Math.max(...rows.map((r) => r.peakPost)).toFixed(2)} dBFS`);
if (process.env.JSON) console.log(JSON.stringify(rows));
process.exit(0);
