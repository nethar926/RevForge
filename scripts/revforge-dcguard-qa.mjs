/**
 * RevForge catalogue ICE dcGuard before/after: idle and full throttle at 6000 rpm (or redline
 * when lower), guard off (pre-fix) vs shipped rpm-gated guard. RMS dBFS after 1 s settle.
 * Run: node scripts/revforge-dcguard-qa.mjs [ids...]
 */
import { renderRevforgePack, revforgePatch, REVFORGE_ICE_IDS } from './revforge-render.mjs';

const IDS = process.argv.slice(2).length ? process.argv.slice(2) : REVFORGE_ICE_IDS;
const stats = (buf, a) => {
  let s = 0;
  let n = 0;
  let pk = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const x = buf.getChannelData(c);
    for (let i = Math.floor(a * buf.sampleRate); i < x.length; i++) {
      s += x[i] * x[i];
      pk = Math.max(pk, Math.abs(x[i]));
      n++;
    }
  }
  return { rms: 20 * Math.log10(Math.sqrt(s / n) + 1e-12), peak: 20 * Math.log10(pk + 1e-12) };
};
const rows = [];
for (const id of IDS) {
  const p = revforgePatch(id).revforge;
  const hi = Math.min(6000, p.redline);
  const pts = [
    { label: 'idle', d: { speed: 0, throttle: 0, rpm: p.idleRpm } },
    { label: `${hi}`, d: { speed: 0.9, throttle: 1, load: 1, rpm: hi } },
  ];
  const row = { id: revforgePatch(id).id };
  for (const pt of pts) {
    const off = await renderRevforgePack(id, () => pt.d, 2.5, { dcGuard: 'off' });
    const on = await renderRevforgePack(id, () => pt.d, 2.5, { dcGuard: 'auto' });
    const a = stats(off, 1);
    const b = stats(on, 1);
    let same = off.length === on.length;
    for (let c = 0; same && c < 2; c++) {
      const x = off.getChannelData(c);
      const y = on.getChannelData(c);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { same = false; break; }
    }
    row[pt.label === 'idle' ? 'idle' : 'high'] = { rpm: pt.d.rpm, before: a.rms, after: b.rms, delta: b.rms - a.rms, peakBefore: a.peak, peakAfter: b.peak, identical: same, dc: on.trace.at(-1).dc };
  }
  rows.push(row);
  const h = row.high;
  const i = row.idle;
  console.log(
    `${row.id.padEnd(21)} idle ${i.before.toFixed(2)}→${i.after.toFixed(2)} (Δ${i.delta.toFixed(2)}${i.identical ? ', bit-identical' : ''})  ` +
      `${String(h.rpm).padStart(4)} rpm WOT ${h.before.toFixed(2)}→${h.after.toFixed(2)} dB (Δ${h.delta.toFixed(2)}, guard ${h.dc.toFixed(2)})`,
  );
}
console.log(JSON.stringify(rows));
process.exit(0);
