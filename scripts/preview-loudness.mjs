/**
 * Engines Preview loudness report: integrated LUFS + sample peak per public/snippets/*.wav,
 * with the median of all previews. Run: node scripts/preview-loudness.mjs [dir]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integratedLufs, readWav16, samplePeakDb } from './loudness.mjs';

const DIR = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'snippets');
const rows = readdirSync(DIR).filter((f) => f.endsWith('.wav')).sort().map((f) => {
  const { fs, channels } = readWav16(readFileSync(join(DIR, f)));
  return { id: f.replace(/\.wav$/, ''), lufs: integratedLufs(channels, fs), peak: samplePeakDb(channels) };
});
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const r of rows) console.log(`${r.id.padEnd(20)} ${r.lufs.toFixed(1).padStart(6)} LUFS  peak ${r.peak.toFixed(1).padStart(5)} dBFS`);
console.log(`median (all ${rows.length}) ${med(rows.map((r) => r.lufs)).toFixed(1)} LUFS  peak ${med(rows.map((r) => r.peak)).toFixed(1)} dBFS`);
if (process.env.JSON) console.log(JSON.stringify(rows));
