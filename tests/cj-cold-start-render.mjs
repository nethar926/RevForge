/**
 * Carrier Jet (Tomcat) cold-start demo renders through the live chain (offline, procedural).
 *   node tests/cj-cold-start-render.mjs [outDir]   → carrier-jet-cold-start-{apu,groundcart}.wav
 * Each timeline entry runs at its second via the engine API (setJetSystem / playJetCue /
 * jetEmergencyStop); the throttle profile adds a little power after both engines are at idle.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderLive } from '../scripts/live-engine-render.mjs';

export const DEMO_TIMELINES = {
  apu: [
    [1.0, 'BATT on', (e) => e.setJetSystem('batt', true)],
    [3.0, 'SEAT BELT on (chime)', (e) => e.setJetSystem('seatbelt', true)],
    [5.0, 'APU on (spool to steady hum)', (e) => e.setJetSystem('apu', true)],
    [14.0, 'L ENG start (left)', (e) => e.setJetSystem('engL', true)],
    [23.0, 'R ENG start (right)', (e) => e.setJetSystem('engR', true)],
    [33.0, 'APU off (spool-down)', (e) => e.setJetSystem('apu', false)],
    [36.5, 'AB guard cover open', (e) => e.playJetCue('abGuardOpen')],
    [38.0, 'AB guard cover close', (e) => e.playJetCue('abGuardClose')],
    [39.0, 'display menu: bezel press', (e) => e.playJetCue('bezelPress')],
    [39.5, 'display menu: cursor steps', (e) => e.playJetCue('cursorStep')],
    [39.75, '', (e) => e.playJetCue('cursorStep')],
    [40.0, 'throttle up a little', null],
    [40.3, 'display menu: select (acknowledge)', (e) => e.playJetCue('selectConfirm')],
    [41.0, 'display menu: page change', (e) => e.playJetCue('pageChange')],
    [49.5, 'PULL guard open', (e) => e.playJetCue('guardOpen')],
    [51.0, 'PULL emergency stop (warning, fuel cut at +0.6 s)', (e) => e.jetEmergencyStop()],
    [62.0, 'guard close', (e) => e.playJetCue('guardClose')],
  ],
  groundcart: [
    [1.0, 'BATT on', (e) => e.setJetSystem('batt', true)],
    [3.0, 'AIR CART on (hiss + whine, right side)', (e) => e.setJetSystem('aircart', true)],
    [5.0, 'SEAT BELT on (chime)', (e) => e.setJetSystem('seatbelt', true)],
    [8.0, 'R ENG start on cart air (right)', (e) => e.setJetSystem('engR', true)],
    [17.0, 'CROSSBLEED open (valve + air rush)', (e) => e.setJetSystem('crossbleed', true)],
    [19.0, 'L ENG start on crossbleed (left)', (e) => e.setJetSystem('engL', true)],
    [28.5, 'CROSSBLEED closed', (e) => e.setJetSystem('crossbleed', false)],
    [30.0, 'AIR CART off (disconnect clunk)', (e) => e.setJetSystem('aircart', false)],
    [36.5, 'AB guard cover open', (e) => e.playJetCue('abGuardOpen')],
    [38.0, 'AB guard cover close', (e) => e.playJetCue('abGuardClose')],
    [39.0, 'display menu: bezel press', (e) => e.playJetCue('bezelPress')],
    [39.5, 'display menu: cursor steps', (e) => e.playJetCue('cursorStep')],
    [39.75, '', (e) => e.playJetCue('cursorStep')],
    [40.0, 'throttle up a little', null],
    [40.3, 'display menu: select (acknowledge)', (e) => e.playJetCue('selectConfirm')],
    [41.0, 'display menu: page change', (e) => e.playJetCue('pageChange')],
    [49.5, 'PULL guard open', (e) => e.playJetCue('guardOpen')],
    [51.0, 'PULL emergency stop (warning, fuel cut at +0.6 s)', (e) => e.jetEmergencyStop()],
    [62.0, 'guard close', (e) => e.playJetCue('guardClose')],
  ],
};
export const DEMO_SECONDS = 66;

/** Park, then a little throttle 40–47 s (to ≈ 45 %), back to idle by 49 s. */
export function demoThrottle(t) {
  const up = Math.min(1, Math.max(0, (t - 40) / 2.5));
  const down = Math.min(1, Math.max(0, (t - 46) / 2.5));
  return { speed: 0, throttle: 0.45 * up * (1 - down), load: 0.45 * up * (1 - down) };
}

/** Render one cold-start timeline. Calls run with engine settle timers neutralised (frame-stepped). */
export async function renderColdStart(timeline, dur, opts = {}) {
  const todo = timeline.filter((x) => x[2]).map((x) => ({ t: x[0], fn: x[2] }));
  const realSetTimeout = globalThis.setTimeout;
  let armed = false;
  return renderLive(opts.profile ?? demoThrottle, dur, {
    patchId: 'aerospace-f14',
    seed: opts.seed ?? 'cj-cold-start',
    fps: opts.fps ?? 60,
    startAt: 0.05,
    driveBeforeStart: true,
    ...opts,
    onFrame: (engine, t) => {
      globalThis.setTimeout = () => 0;
      try {
        if (!armed) {
          armed = true;
          // node-web-audio-api's HRTF PannerNode downmixes stereo to mono (Chromium's keeps the two
          // input channels). Offline only: centre equal-power panner = stereo pass-through.
          if (opts.stereoShim !== false && engine.mainSpatial) engine.mainSpatial.panningModel = 'equalpower';
          if (opts.coldStart !== false) engine.setJetColdStart(true);
          opts.onReady?.(engine);
        }
        while (todo.length && todo[0].t <= t + 1e-9) todo.shift().fn(engine, t);
        opts.onFrame?.(engine, t);
      } finally {
        globalThis.setTimeout = realSetTimeout;
      }
    },
  });
}

export function wav16(buf) {
  const ch = [0, 1].map((c) => buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)));
  const n = buf.length;
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
    for (let c = 0; c < 2; c++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i])) * 32767), 44 + i * 4 + c * 2);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? 'cj-demos';
  mkdirSync(dir, { recursive: true });
  for (const mode of process.argv[3] ? [process.argv[3]] : ['apu', 'groundcart']) {
    const buf = await renderColdStart(DEMO_TIMELINES[mode], DEMO_SECONDS, { seed: `cj-cold-start-${mode}` });
    const f = join(dir, `carrier-jet-cold-start-${mode}.wav`);
    writeFileSync(f, wav16(buf));
    console.log(f);
  }
}
