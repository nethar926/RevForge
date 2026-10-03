#!/usr/bin/env node
/**
 * Night Pursuit listening QA: renders idle / cruise / WOT / lift-off / PURSUIT / cues and a
 * stock-V8 A/B, writes WAVs to ./qa-out/night-pursuit (gitignored scratch). Analyse with any
 * spectrum tool; numbers used for tuning are in docs/night-pursuit-audio-v1.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderNightPursuit, bufferToWav } from './night-pursuit-render.mjs';

const OUT = process.argv[2] || join(process.cwd(), 'qa-out', 'night-pursuit');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(3);

const S = (mph) => mph / 120;
const cases = {
  idle: { dur: 6, f: () => ({ speed: 0, throttle: 0 }) },
  cruise: { dur: 6, f: (t) => ({ speed: S(45), throttle: 0.22, load: 0.1 + 0 * t }) },
  wot: { dur: 7, f: (t) => ({ speed: S(Math.min(110, 6 + t * 15)), throttle: 1, load: 0.8 }) },
  liftoff: { dur: 5, f: (t) => (t < 1.5 ? { speed: S(55), throttle: 0.85, load: 0.6 } : { speed: S(55 - (t - 1.5) * 4), throttle: 0, load: -0.4 }) },
  revpark: { dur: 5, f: (t) => ({ speed: 0, throttle: t > 0.8 && t < 1.6 ? 0.85 : t > 2.6 && t < 3.0 ? 1 : 0 }) },
  pursuit: { dur: 7, params: { pursuitBoost: 1 }, f: (t) => (t < 4.8 ? { speed: S(Math.min(100, 8 + t * 16)), throttle: 1, load: 0.8 } : { speed: S(80), throttle: 0, load: -0.4 }) },
  starter: { dur: 3, cues: [{ t: 0.05, type: 'starter' }], f: () => ({ speed: 0, throttle: 0 }), mute: true },
  shutoff: { dur: 2, cues: [{ t: 0.05, type: 'shutoff' }], f: () => ({ speed: 0, throttle: 0 }), mute: true },
  scanner: { dur: 3, params: { scannerTick: 0.7 }, cues: [0.2, 1.3, 2.4].map((t, i) => ({ t, type: 'scanner', edge: i % 2 ? 'right' : 'left' })), f: () => ({ speed: 0, throttle: 0 }) },
  'generic-idle': { dur: 6, generic: true, params: { rpmIdle: 48, rpmRedline: 248, collectorDelayMs: 1.8, pulseWidth: 0.5, pulseJitter: 0.333, roughness: 0.62, growl: 0.72, exhaust: 0.78, exhaustLength: 0.62, exhaustFeedback: 0.76, muffling: 0.34, presence: 0.36, misfire: 0.05, masterGain: 0.72 }, f: () => ({ speed: 0, throttle: 0 }) },
  'generic-wot': { dur: 7, generic: true, params: { rpmIdle: 48, rpmRedline: 248, collectorDelayMs: 1.8, pulseWidth: 0.5, pulseJitter: 0.333, roughness: 0.62, growl: 0.72, exhaust: 0.78, exhaustLength: 0.62, exhaustFeedback: 0.76, muffling: 0.34, presence: 0.36, misfire: 0.05, masterGain: 0.72 }, f: (t) => ({ speed: S(Math.min(110, 6 + t * 15)), throttle: 1, load: 0.8 }) },
  'generic-cruise': { dur: 6, generic: true, params: { rpmIdle: 48, rpmRedline: 248, collectorDelayMs: 1.8, pulseWidth: 0.5, pulseJitter: 0.333, roughness: 0.62, growl: 0.72, exhaust: 0.78, exhaustLength: 0.62, exhaustFeedback: 0.76, muffling: 0.34, presence: 0.36, misfire: 0.05, masterGain: 0.72 }, f: () => ({ speed: S(45), throttle: 0.22, load: 0.1 }) },
};

for (const [name, c] of Object.entries(cases)) {
  if (only.length && !only.includes(name)) continue;
  const params = { ...(c.params ?? {}), ...(c.mute ? { masterGain: 0 } : {}) };
  const buf = await renderNightPursuit(c.f, c.dur, { params, cues: c.cues, generic: c.generic });
  writeFileSync(join(OUT, `${name}.wav`), bufferToWav(buf, 1));
  console.log('wrote', name);
}
process.exit(0);
