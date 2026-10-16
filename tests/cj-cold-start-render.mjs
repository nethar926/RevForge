/**
 * Carrier Jet (Tomcat) cold-start demo renders through the live chain (offline, procedural).
 *   node tests/cj-cold-start-render.mjs [outDir]   → carrier-jet-cold-start-{apu,groundcart}.wav
 * Each timeline entry runs at its second via the engine API (setJetSystem / playJetCue /
 * jetEmergencyStop); the throttle profile adds a little power after both engines are at idle.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderLive } from '../scripts/live-engine-render.mjs';

const S = (id, on) => (e) => e.setJetSystem(id, on);
const C = (cue) => (e) => e.playJetCue(cue);
/** Shared opening: checklist card, battery, cabin, avionics, lights. Throttles start at cutoff. */
const OPEN = [
  [0.2, 'throttles at cutoff (arms the light-off gate; no sound, no change)', (e) => (e.setJetSystem('throttleL', false), e.setJetSystem('throttleR', false))],
  [0.6, 'checklist card lifted', C('pamphletLift')],
  [1.2, 'checklist card opened', C('pamphletOpen')],
  [2.0, 'BATT on (relay clunk, hum, gyro)', S('batt', true)],
  [3.5, 'SEAT BELT on (chime)', S('seatbelt', true)],
  [5.0, 'AVIONICS on (fan + hum)', S('avionics', true)],
  [6.0, 'NAV PLATFORM on (spin-up)', S('inertialNav', true)],
  [7.0, 'POSITION LIGHTS on', S('navLights', true)],
  [7.5, 'BEACON on (flasher ticks)', S('anticollision', true)],
];
/** Shared second half: hydraulics, canopy, oxygen, caution reset, display menu, throttle, guards, PULL. */
const CLOSE = [
  [39.0, 'HYDRAULICS on (pump whine, pressure rise)', S('hydraulics', true)],
  [41.0, 'CANOPY close (motor ≈ 3.2 s, latch thunk)', S('canopy', true)],
  [45.0, 'OXYGEN on (soft hiss)', S('oxygen', true)],
  [46.0, 'CAUTION reset (short tone)', S('masterCaution', true)],
  [47.0, 'display menu: bezel press', C('bezelPress')],
  [47.4, 'display menu: cursor steps', C('cursorStep')],
  [47.6, '', C('cursorStep')],
  [47.9, 'display menu: select', C('selectConfirm')],
  [48.5, 'display menu: page change', C('pageChange')],
  [49.5, 'throttle up a little (to ≈ 45 %, back to idle by 56 s)', null],
  [57.0, 'QUICK START cover open', S('quickStartGuard', true)],
  [58.0, 'QUICK START pressed (engines already running → no change)', S('quickStart', true)],
  [59.0, 'QUICK START cover closed', S('quickStartGuard', false)],
  [60.0, 'AB guard cover open', C('abGuardOpen')],
  [61.0, 'AB guard cover close', C('abGuardClose')],
  [62.5, 'PULL cover open', C('guardOpen')],
  [64.0, 'PULL emergency stop (warning, fuel cut at +0.6 s, everything spools down)', (e) => e.jetEmergencyStop()],
  [75.0, 'PULL cover closed', C('guardClose')],
  [76.0, 'checklist card closed', C('pamphletClose')],
];

export const DEMO_TIMELINES = {
  apu: [
    ...OPEN,
    [8.5, 'APU on (tonal turbine whine, steady ≈ 15.5 s)', S('apu', true)],
    [16.0, 'L FUEL PUMP on', S('fuelPumpL', true)],
    [16.8, 'L IGNITION on (igniter arm)', S('ignL', true)],
    [17.5, 'L ENG start (left; motors, igniters tick)', S('engL', true)],
    [21.0, 'L THROTTLE to idle (detent) → light-off, idle ≈ 25 s', S('throttleL', true)],
    [27.0, 'R FUEL PUMP on', S('fuelPumpR', true)],
    [27.8, 'R IGNITION on', S('ignR', true)],
    [28.5, 'R ENG start (right)', S('engR', true)],
    [32.0, 'R THROTTLE to idle → light-off, idle ≈ 36 s', S('throttleR', true)],
    [37.5, 'APU off (spool-down)', S('apu', false)],
    ...CLOSE,
  ],
  groundcart: [
    ...OPEN,
    [8.5, 'GROUND AIR on (hose clunk, distant diesel chug, hose roar; right side)', S('aircart', true)],
    [14.0, 'R FUEL PUMP on', S('fuelPumpR', true)],
    [14.8, 'R IGNITION on', S('ignR', true)],
    [15.5, 'R ENG start on cart air (right)', S('engR', true)],
    [18.5, 'R THROTTLE to idle → light-off, idle ≈ 23 s', S('throttleR', true)],
    [24.5, 'CROSSBLEED open (valve, air rush)', S('crossbleed', true)],
    [26.0, 'L FUEL PUMP on', S('fuelPumpL', true)],
    [26.8, 'L IGNITION on', S('ignL', true)],
    [27.5, 'L ENG start on crossbleed (left)', S('engL', true)],
    [30.5, 'L THROTTLE to idle → light-off, idle ≈ 35 s', S('throttleL', true)],
    [36.5, 'CROSSBLEED closed', S('crossbleed', false)],
    [37.5, 'GROUND AIR off (pressure dump hiss + disconnect clunk)', S('aircart', false)],
    ...CLOSE,
  ],
};
export const DEMO_SECONDS = 79;

/** Park, then a little throttle 49.5–56 s (to ≈ 45 %), back to idle. */
export function demoThrottle(t) {
  const up = Math.min(1, Math.max(0, (t - 49.5) / 2.5));
  const down = Math.min(1, Math.max(0, (t - 53.5) / 2.5));
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
