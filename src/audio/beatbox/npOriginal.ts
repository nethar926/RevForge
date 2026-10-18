/**
 * `np-original`: Night Pursuit's existing big-block V8 (commit 9841edc) as a Beat Box voice.
 *
 * This is an adapter, not a copy. It runs the same pieces EngineSynthImpl's Night Pursuit path
 * runs: the shared pulse-engine-processor worklet, the shared nightPursuitVoice.js drive step /
 * worklet targets / NightPursuitBus post chain, NIGHT_PURSUIT_DEFAULTS, and the same
 * master → limiter stage. It wraps those pieces rather than EngineSynthImpl itself because
 * EngineSynthImpl reads browser storage, needs a realtime AudioContext and owns its own output.
 *
 * Beat Box → Night Pursuit mapping:
 *   rpm         → drive contract `rpm` (absolute rpm wins, so the NP gearbox model is bypassed)
 *   throttle    → `throttle` (and `load` = throttle)
 *   speed km/h  → normalized `speed` (1 = 120 mph)
 *   drive 0..1  → output level, −9 dB … 0 dB like the Beat Box voices (0.7 ≈ NP's own level),
 *                 then a soft safety clip that never passes 0.9 (the Beat Box −1 dBFS ceiling)
 *   tone 0..1   → camLope 0.82 × (0.5 + tone) and roughness (0.5 = NP defaults)
 *   pops 0..1   → overrunBurble = pops, worklet crackle = 0.5 × pops (0.6 = NP defaults;
 *                 0 = no afterfire, matching the Beat Box pops contract)
 * Uses no browser storage of any kind.
 */
import { NIGHT_PURSUIT_DEFAULTS } from '../nightPursuitPack.ts';
import {
  NightPursuitBus,
  NP_SPEED_FULL_MPH,
  createNightPursuitDriveState,
  nightPursuitWorkletTargets,
  npIdleRpm,
  setNightPursuitOfflineScheduling,
  stepNightPursuitDrive,
  type NightPursuitDrive,
} from '../nightPursuitVoice.js';
import type { EngineParams } from '../types';
import type { BeatboxEngineInfo } from './engines.ts';
import type { BeatboxVoice, VoiceState } from './voice.ts';

export const NP_PULSE_PROCESSOR = 'pulse-engine-processor';

const clip = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
const KMH_FULL = NP_SPEED_FULL_MPH * 1.609344;
/**
 * Loudness trim so `np-original` sits with the six Beat Box voices at the same drive (measured
 * at 2500 rpm / 30 % throttle: NP −25.7 dB RMS vs cross-plane −26.4 dB → −0.7 dB).
 */
const NP_TRIM = 0.92;

/**
 * Output safety: transparent below 0.8 (−1.9 dBFS), then a soft knee that never passes 0.9, so the
 * NP chain (a compressor, not a brickwall) keeps the Beat Box −1 dBFS ceiling at drive 1.
 */
function safetyCurve(): Float32Array<ArrayBuffer> {
  const n = 2049;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.1 * Math.tanh((a - 0.8) / 0.1));
  }
  return c;
}

/** Default pulse worklet URL (Vite emits it as an asset; node gets a file path). */
export function npPulseWorkletUrl(): string {
  const u = new URL('../worklets/pulse-engine-processor.js', import.meta.url);
  return u.protocol === 'file:' ? decodeURIComponent(u.pathname) : u.href;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Load the pulse worklet once per context. */
export function loadNpPulseWorklet(ctx: BaseAudioContext, url: string = npPulseWorkletUrl()): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(url);
    loaded.set(ctx, p);
    p.catch(() => loaded.delete(ctx));
  }
  return p;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);
/** Beat Box drive law (−9 dB at 0 … 0 dB at 1), normalised so drive 0.7 = NP's own level. */
const driveGain = (d: number) => dbToGain(-9 + 9 * clip(d)) / dbToGain(-9 + 9 * 0.7);

export function createNpOriginalVoice(ctx: BaseAudioContext, info: BeatboxEngineInfo, init: VoiceState): BeatboxVoice {
  const params: EngineParams = { ...NIGHT_PURSUIT_DEFAULTS };
  const node = new AudioWorkletNode(ctx, NP_PULSE_PROCESSOR, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  // EngineSynthImpl: master gain → limiter → output
  const master = ctx.createGain();
  master.gain.value = clip(Number(params.masterGain)) * 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -18 + 15 * clip(Number(params.limiterCeiling ?? 0.95));
  limiter.knee.value = 8;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  const trim = ctx.createGain();
  trim.gain.value = NP_TRIM * driveGain(init.drive);
  const safety = ctx.createWaveShaper();
  safety.curve = safetyCurve();
  const lvl = ctx.createGain();
  lvl.gain.value = clip(init.level, 0, 4);
  const bus = new NightPursuitBus(ctx, master);
  node.connect(bus.input);
  master.connect(limiter);
  limiter.connect(trim);
  trim.connect(safety);
  safety.connect(lvl);

  const P = (name: string) => node.parameters.get(name);
  const setNow = (name: string, v: number, t: number) => P(name)?.setValueAtTime(v, t);
  for (const [k, v] of Object.entries({
    cylinders: params.cylinders,
    firingFamily: params.firingFamily,
    firingMask: params.firingMask ?? 0,
    pulseWidth: params.pulseWidth,
    roughness: params.roughness,
    exhaustLength: params.exhaustLength,
    misfire: params.misfire,
    collectorDelayMs: clip(Number(params.collectorDelayMs), 0.5, 3),
    pulseJitter: Math.min(0.5, Number(params.pulseJitter) + 0.02),
    masterGain: clip(Number(params.masterGain) * (0.75 + Number(params.presence) * 0.4)),
  })) setNow(k, Number(v), ctx.currentTime);

  const st = { rpm: init.rpm, throttle: init.throttle, speed: init.speed, tone: init.tone, pops: init.pops };
  const applyTone = () => {
    params.camLope = clip(0.82 * (0.5 + st.tone));
    params.roughness = clip(0.58 * (0.7 + 0.6 * st.tone));
  };
  const applyPops = () => {
    params.overrunBurble = clip(st.pops);
    params.crackle = 0.5 * clip(st.pops);
  };
  applyTone();
  applyPops();

  const drv = createNightPursuitDriveState(npIdleRpm(params));
  drv.rpm = Math.max(200, st.rpm || npIdleRpm(params));
  let lastT = -1;
  let lastBusT = -Infinity;
  let disposed = false;

  /** Push every per-frame worklet / bus target for the current state at context time `t`. */
  function push(t: number, scheduled: boolean, first = false) {
    const dt = lastT < 0 ? 1 / 60 : clip(t - lastT, 0, 0.25);
    lastT = Math.max(lastT, t);
    const thr = clip(st.throttle);
    const d: NightPursuitDrive = stepNightPursuitDrive(
      drv,
      { rpm: st.rpm > 0 ? st.rpm : npIdleRpm(params), throttle: thr, load: thr, speed: clip(st.speed / KMH_FULL) },
      dt,
      params,
    );
    const open = 0.25 + 0.65 * thr;
    const base = {
      growl: Number(params.growl) * (0.7 + Number(params.exhaust) * 0.4) * (0.85 + open * 0.25),
      exhaustFeedback: Number(params.exhaustFeedback) * (0.85 + (1 - Number(params.muffling)) * 0.15),
      mufflerMix: clip(Number(params.muffling) * (0.55 + 0.45 * (1 - open * 0.55))),
      intake: clip(Number(params.intake) * (0.45 + 0.55 * thr)),
    };
    const tgt = nightPursuitWorkletTargets(params, d, thr, base);
    const vals: Record<string, number> = {
      rpm: d.rpm,
      throttle: thr,
      load: thr,
      roughness: Number(params.roughness),
      growl: tgt.growl,
      exhaustFeedback: tgt.exhaustFeedback,
      mufflerMix: tgt.mufflerMix,
      intake: tgt.intake,
      camLope: tgt.camLope,
      bankSplit: tgt.bankSplit,
      overrun: tgt.overrun,
      overrunBurble: tgt.overrunBurble,
      dcGuard: tgt.dcGuard,
      crackle: tgt.crackle,
    };
    // Realtime: glide to the new value over ~one frame. Scheduled (offline): piecewise-linear
    // ramps ending at `t`, the same scheduling the Night Pursuit offline renderer uses.
    for (const [k, v] of Object.entries(vals)) {
      const p = P(k);
      if (!p) continue;
      if (first) p.setValueAtTime(v, t);
      else p.linearRampToValueAtTime(v, scheduled ? t : t + 0.02);
    }
    // Post-chain morph: NightPursuitBus.update schedules at ctx.currentTime with
    // cancel + setTargetAtTime. Realtime: call it as EngineSynthImpl does. Scheduled ahead
    // (offline renders): run it at a faked currentTime = t with the module's piecewise-linear
    // offline scheduling (stacks of setTargetAtTime events mis-render offline), at most every 40 ms.
    if (!scheduled) {
      lastBusT = t;
      bus.update(params, d, thr, 0.05);
    } else if (t - lastBusT >= 0.04) {
      lastBusT = t;
      const fake = new Proxy(ctx, {
        get(target, key) {
          if (key === 'currentTime') return t;
          const v = Reflect.get(target, key, target);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
      const b = bus as unknown as { ctx: BaseAudioContext };
      const real = b.ctx;
      b.ctx = fake;
      setNightPursuitOfflineScheduling(true);
      try {
        bus.update(params, d, thr, 0.05);
      } finally {
        setNightPursuitOfflineScheduling(false);
        b.ctx = real;
      }
    }
  }
  push(ctx.currentTime, false, true);

  return {
    info,
    out: lvl,
    update(s, when) {
      if (disposed) return;
      if (s.rpm !== undefined) st.rpm = clip(s.rpm, 0, 12000);
      if (s.throttle !== undefined) st.throttle = clip(s.throttle);
      if (s.speed !== undefined) st.speed = clip(s.speed, 0, 400);
      const scheduled = when > ctx.currentTime + 1e-4;
      push(Math.max(when, ctx.currentTime), scheduled);
    },
    setDrive(x, when) {
      if (disposed) return;
      trim.gain.setTargetAtTime(NP_TRIM * driveGain(x), when, 0.05);
    },
    setTone(x, when) {
      if (disposed) return;
      st.tone = clip(x);
      applyTone();
      push(Math.max(when, ctx.currentTime), false);
    },
    setPops(x, when) {
      if (disposed) return;
      st.pops = clip(x);
      applyPops();
      push(Math.max(when, ctx.currentTime), false);
    },
    rampLevel(target, seconds, when) {
      const g = lvl.gain;
      g.cancelScheduledValues(when);
      g.setValueAtTime(g.value, when);
      g.linearRampToValueAtTime(clip(target, 0, 4), when + seconds);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const n of [node, master, limiter, trim, safety, lvl]) {
        try { n.disconnect(); } catch { /* already disconnected */ }
      }
      bus.dispose();
      node.port.close();
    },
  };
}
