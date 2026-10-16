/**
 * Offline demo for the Tomcat flight phases: a scripted Frontend-style call sequence (what
 * regimeToAudioCalls() would send) through the shipped live chain. Offline renders can't capture
 * speechSynthesis, so callouts are rendered in 'tone' mode.
 * CLI: node tests/cj-flight-render.mjs <out.wav>
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { renderLive } = await import(pathToFileURL(join(root, 'scripts/live-engine-render.mjs')).href);

export const FLIGHT_SECONDS = 82;
const lerp = (t, t0, t1, a, b) => (t <= t0 ? a : t >= t1 ? b : a + ((b - a) * (t - t0)) / (t1 - t0));
/** [t, label, fn(engine)] — the scripted phase sequence. */
export const FLIGHT_TIMELINE = [
  [0.1, 'callout mode tone (offline: no speech)', (e) => e.setCalloutMode('tone')],
  [0.15, 'high-speed callouts on (off by default)', (e) => e.setHighSpeedCallouts(true)],
  [4, 'TAXI, gear down', (e) => e.setFlightPhase('TAXI', { gear: 'down' })],
  [13, 'TAKEOFF_ROLL launch + afterburnerLit (armed)', (e) => (e.setFlightPhase('TAKEOFF_ROLL', { gear: 'down', launch: true }), e.setAfterburnerLaunch(true))],
  [20, 'AIRBORNE (launch over; AB stays lit by speed)', (e) => e.setFlightPhase('AIRBORNE', { gear: 'down', launch: false })],
  [21, 'gear transit', (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
  [23.5, 'gear up → gearUp', (e) => e.setFlightPhase('AIRBORNE', { gear: 'up' })],
  [30, 'overspeedCaution', (e) => e.playFlightCallout('overspeedCaution')],
  [33, 'overspeedWarning', (e) => e.playFlightCallout('overspeedWarning')],
  [37, 'APPROACH, gear transit', (e) => e.setFlightPhase('APPROACH', { gear: 'transit' })],
  [39, 'gear down → gearDown', (e) => e.setFlightPhase('APPROACH', { gear: 'down' })],
  [42, 'afterburnerLit off (below 77 mph)', (e) => e.setAfterburnerLaunch(false)],
  [44, 'gpsFail', (e) => e.playFlightCallout('gpsFail')],
  [48, 'ROLLOUT (25 mph)', (e) => e.setFlightPhase('ROLLOUT', { gear: 'down' })],
  [50.5, 'touch-and-go: TAKEOFF_ROLL launch + afterburnerLit', (e) => (e.setFlightPhase('TAKEOFF_ROLL', { gear: 'down', launch: true }), e.setAfterburnerLaunch(true), e.playFlightCallout('touchAndGo'))],
  [56, 'AIRBORNE (launch over)', (e) => e.setFlightPhase('AIRBORNE', { gear: 'down', launch: false })],
  [66.5, 'afterburnerLit off (below 77 mph)', (e) => e.setAfterburnerLaunch(false)],
  [57, 'gear transit', (e) => e.setFlightPhase('AIRBORNE', { gear: 'transit' })],
  [59, 'gear up → gearUp', (e) => e.setFlightPhase('AIRBORNE', { gear: 'up' })],
  [62, 'APPROACH, gear transit', (e) => e.setFlightPhase('APPROACH', { gear: 'transit' })],
  [64, 'gear down → gearDown', (e) => e.setFlightPhase('APPROACH', { gear: 'down' })],
  [69, 'ROLLOUT', (e) => e.setFlightPhase('ROLLOUT', { gear: 'down' })],
  [71, 'AB disarmed', (e) => e.setAfterburnerArmed(false)],
  [72, 'unarmed launch: TAKEOFF_ROLL launch (afterburnerLit stays false)', (e) => e.setFlightPhase('TAKEOFF_ROLL', { gear: 'down', launch: true })],
  [72.6, 'abUnarmed', (e) => e.playFlightCallout('abUnarmed')],
  [75.5, 'abort: ROLLOUT', (e) => e.setFlightPhase('ROLLOUT', { gear: 'down', launch: false })],
  [79.5, 'TAXI (stopped)', (e) => e.setFlightPhase('TAXI', { gear: 'down' })],
];
/** Scripted speed (mph) and pedal, standing in for the car sim. */
export function flightProfile(t) {
  let mph;
  if (t < 4) mph = 0;
  else if (t < 13) mph = lerp(t, 4, 8, 0, 15);
  else if (t < 20) mph = lerp(t, 13, 20, 15, 120);
  else if (t < 37) mph = 120;
  else if (t < 48) mph = lerp(t, 37, 48, 120, 25);
  else if (t < 50.5) mph = 25;
  else if (t < 62) mph = lerp(t, 50.5, 56, 25, 110);
  else if (t < 69) mph = lerp(t, 62, 69, 110, 25);
  else if (t < 72) mph = lerp(t, 69, 72, 25, 20);
  else if (t < 75.5) mph = lerp(t, 72, 75.5, 20, 45);
  else mph = lerp(t, 75.5, 79.5, 45, 0);
  let thr = 0;
  if (t >= 4 && t < 13) thr = 0.6;
  else if ((t >= 13 && t < 20) || (t >= 50.5 && t < 56) || (t >= 72 && t < 75.5)) thr = 1;
  else if (t >= 20 && t < 37) thr = t >= 28 && t < 36 ? 1 : 0.5;
  else if (t >= 56 && t < 62) thr = 0.5;
  else if ((t >= 37 && t < 48) || (t >= 62 && t < 69)) thr = 0.25;
  return { speed: mph / 120, throttle: thr, load: thr };
}

export async function renderFlight(opts = {}) {
  const pending = [...FLIGHT_TIMELINE];
  const log = [];
  let now = 0;
  const buf = await renderLive(flightProfile, opts.seconds ?? FLIGHT_SECONDS, {
    patchId: 'aerospace-f14',
    seed: 'cj-flight-regimes',
    fps: 30,
    onFrame: (e, t) => {
      now = t;
      if (e.mainSpatial) e.mainSpatial.panningModel = 'equalpower'; // node HRTF is mono (offline only)
      if (t === 0) e.onAfterburnerZoneChange?.((z) => log.push(`${now.toFixed(2)} AB zone ${z}`));
      while (pending.length && pending[0][0] <= t + 1e-9) {
        const [at, label, fn] = pending.shift();
        const r = fn(e);
        log.push(`${at.toFixed(1)} ${label}${typeof r === 'string' ? ` → ${r}` : ''}`);
      }
      if (Math.abs(t * 2 - Math.round(t * 2)) < 1e-6) log.push(`@${t.toFixed(1)} zone=${e.getAfterburnerZone?.()} spool=${(e.base.tcDrive?.spool ?? 0).toFixed(2)}`);
    },
  });
  return { buf, log };
}

export function wav16(buf) {
  const n = buf.length;
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 4, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(buf.sampleRate, 24);
  out.writeUInt32LE(buf.sampleRate * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 2; c++) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(ch[c][i] * 32767))), 44 + i * 4 + c * 2);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = process.argv[2] ?? 'carrier-jet-flight-regimes.wav';
  const { buf, log } = await renderFlight();
  writeFileSync(out, wav16(buf));
  writeFileSync(out.replace(/\.wav$/, '.log'), log.join('\n'));
  console.log('wrote', out);
}
