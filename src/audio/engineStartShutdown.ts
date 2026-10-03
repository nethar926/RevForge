/**
 * Procedural per-engine Ignition starter + Shutdown shutoff one-shots.
 * Derived from the active pack's EngineParams / kind — not a shared sample clip.
 * Frontend soft-cues via triggerUiCue('starter' | 'shutdown') (alias 'shutoff').
 */
import type { EngineKind, EngineParams } from './types';
import { clamp } from './utils';
import {
  NP_SHUTOFF_SECONDS,
  NP_STARTER_SECONDS,
  playNightPursuitShutoff,
  playNightPursuitStarter,
} from './nightPursuitVoice';
import {
  QC_POWER_OFF_SECONDS,
  QC_POWER_ON_SECONDS,
  playQuietCurrentPowerOff,
  playQuietCurrentPowerOn,
} from './quietCurrentVoice';
import { isQuietCurrentTopology } from './quietCurrentPack';

export interface StartShutdownCtx {
  ctx: AudioContext;
  dest: AudioNode;
  kind: EngineKind;
  params: EngineParams;
  whiteBuf: AudioBuffer;
  pinkBuf: AudioBuffer;
  /** Pack topology — 'night-pursuit' selects its dedicated crank→catch / rundown. */
  topology?: string;
}

/** Approximate audible length (seconds) so stop() can hold the bus for the tail. */
export function starterDuration(kind: EngineKind, topology?: string): number {
  if (topology === 'night-pursuit') return NP_STARTER_SECONDS;
  if (isQuietCurrentTopology(topology)) return QC_POWER_ON_SECONDS;
  switch (kind) {
    case 'ice':
      return 0.95;
    case 'aerospace':
      return 1.35;
    case 'scifi':
      return 1.15;
    case 'ev-whine':
      return 0.85;
    default:
      return 1.0;
  }
}

export function shutoffDuration(kind: EngineKind, topology?: string): number {
  if (topology === 'night-pursuit') return NP_SHUTOFF_SECONDS;
  if (isQuietCurrentTopology(topology)) return QC_POWER_OFF_SECONDS;
  switch (kind) {
    case 'ice':
      return 0.75;
    case 'aerospace':
      return 1.4;
    case 'scifi':
      return 1.1;
    case 'ev-whine':
      return 0.9;
    default:
      return 0.9;
  }
}

function disconnectLater(...nodes: AudioNode[]): () => void {
  return () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
}

/** Soft exponential gain envelope (avoids 0 → exp issues). */
function envGain(
  g: GainNode,
  t0: number,
  peak: number,
  attack: number,
  release: number,
  hold = 0,
): void {
  const p = Math.max(0.0001, peak);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(p, t0 + Math.max(0.004, attack));
  if (hold > 0) g.gain.setValueAtTime(p, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + Math.max(0.02, release));
}

/**
 * Play Ignition starter one-shot for the active kind/params.
 * Returns scheduled duration (s).
 */
export function playEngineStarter(s: StartShutdownCtx): number {
  const { kind } = s;
  try {
    if (s.topology === 'night-pursuit') {
      return playNightPursuitStarter(s.ctx, s.dest, s.params, s.whiteBuf, s.pinkBuf);
    }
    if (isQuietCurrentTopology(s.topology)) {
      // Power-on: soft rising chime-tone (cue only)
      return playQuietCurrentPowerOn(s.ctx, s.dest, s.params);
    }
    switch (kind) {
      case 'ice':
        return playIceStarter(s);
      case 'aerospace':
        return playJetStarter(s);
      case 'scifi':
        return playIonStarter(s);
      case 'ev-whine':
        return playEvStarter(s);
      default:
        return playIceStarter(s);
    }
  } catch {
    return 0;
  }
}

/**
 * Play Shutdown shutoff one-shot for the active kind/params.
 * Returns scheduled duration (s).
 */
export function playEngineShutoff(s: StartShutdownCtx): number {
  const { kind } = s;
  try {
    if (s.topology === 'night-pursuit') {
      return playNightPursuitShutoff(s.ctx, s.dest, s.params, s.whiteBuf, s.pinkBuf);
    }
    if (isQuietCurrentTopology(s.topology)) {
      // Power-off: soft falling tone (cue only)
      return playQuietCurrentPowerOff(s.ctx, s.dest, s.params);
    }
    switch (kind) {
      case 'ice':
        return playIceShutoff(s);
      case 'aerospace':
        return playJetShutoff(s);
      case 'scifi':
        return playIonShutoff(s);
      case 'ev-whine':
        return playEvShutoff(s);
      default:
        return playIceShutoff(s);
    }
  } catch {
    return 0;
  }
}

// ─── ICE: irregular crank pulses → catch lope / fuel-cut rundown + settle ───

function playIceStarter(s: StartShutdownCtx): number {
  const { ctx, dest, params, pinkBuf, whiteBuf } = s;
  const now = ctx.currentTime;
  const cyl = Number(params.cylinders ?? 8);
  const fam = Number(params.firingFamily ?? 1); // 1 crossplane, 2 flat, 3 even
  const jitter = clamp(Number(params.pulseJitter ?? 0.35));
  const rough = clamp(Number(params.roughness ?? 0.45));
  const growl = clamp(Number(params.growl ?? 0.55));
  const pulseW = clamp(Number(params.pulseWidth ?? 0.45));

  // Uneven crank / chamber spacing from family
  const isRotary = fam >= 3.5;
  const chambers = Math.max(2, Math.min(4, Math.round(Number(params.chambersPerRotor ?? 3))));
  const rotors = Math.max(1, Math.min(2, Math.round(Number(params.rotors ?? 1))));
  const baseGap = isRotary
    ? 0.055 + (rotors === 1 ? 0.012 : 0) // chamber spin-up — denser for twin stack
    : fam >= 2.5
      ? 0.072
      : fam >= 1.5
        ? 0.078
        : 0.085 + (cyl >= 8 ? 0.012 : 0);
  const pulses = isRotary
    ? chambers * rotors + 2 + Math.round(rough)
    : 7 + Math.round(rough * 2);
  let t = now + 0.02;
  for (let i = 0; i < pulses; i++) {
    const uneven = isRotary
      ? 1 + ((i % chambers) === 0 ? 0.06 : -0.02) // light chamber accent, not piston limp
      : fam < 1.5
        ? (i % 2 === 0 ? 1.18 : 0.78) // crossplane limp
        : fam < 2.5
          ? 1 + ((i % 3) - 1) * 0.08
          : 1;
    const j = 1 + (Math.random() * 2 - 1) * jitter * 0.22;
    const gap = baseGap * uneven * j * (1 - i * 0.018); // slightly accelerates as it catches
    const thumpHz = 58 + growl * 28 + (i % 3) * 7;
    const peak = (0.14 + rough * 0.1) * (0.55 + (i / pulses) * 0.55);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(thumpHz, t);
    osc.frequency.exponentialRampToValueAtTime(thumpHz * 0.72, t + 0.055);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380 + pulseW * 220;
    lp.Q.value = 0.85;
    const g = ctx.createGain();
    envGain(g, t, peak, 0.006, 0.055 + pulseW * 0.03);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.1);
    osc.onended = disconnectLater(osc, lp, g);

    // Starter bendix grit
    const noise = ctx.createBufferSource();
    noise.buffer = whiteBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420 + i * 35;
    bp.Q.value = 1.6;
    const ng = ctx.createGain();
    envGain(ng, t, peak * 0.55, 0.004, 0.04);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    noise.start(t);
    noise.stop(t + 0.07);
    noise.onended = disconnectLater(noise, bp, ng);

    t += gap;
  }

  // Catch → short lope chuffs (combustion engages)
  const catchT = t + 0.02;
  for (let i = 0; i < 3; i++) {
    const ct =
      catchT +
      i *
        (isRotary
          ? 0.065
          : 0.09 + (fam < 1.5 ? (i % 2) * 0.025 : 0));
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 78 - i * 9 + growl * 12;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520 - i * 60;
    const g = ctx.createGain();
    envGain(g, ct, 0.26 + growl * 0.08, 0.01, 0.09);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    const noise = ctx.createBufferSource();
    noise.buffer = pinkBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260 + i * 40;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    envGain(ng, ct, 0.28, 0.008, 0.08);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    osc.start(ct);
    osc.stop(ct + 0.12);
    noise.start(ct);
    noise.stop(ct + 0.1);
    osc.onended = disconnectLater(osc, lp, g);
    noise.onended = disconnectLater(noise, bp, ng);
  }

  return starterDuration('ice');
}

function playIceShutoff(s: StartShutdownCtx): number {
  const { ctx, dest, params, pinkBuf, whiteBuf } = s;
  const now = ctx.currentTime;
  const cyl = Number(params.cylinders ?? 8);
  const fam = Number(params.firingFamily ?? 1);
  const growl = clamp(Number(params.growl ?? 0.55));
  const crackle = clamp(Number(params.crackle ?? 0.25));

  // Fuel-cut rundown: slowing irregular pulses (rotary = eccentric spin-down)
  const isRotary = fam >= 3.5;
  let t = now;
  let gap = isRotary ? 0.048 : fam < 1.5 ? 0.07 : 0.062;
  const n = isRotary
    ? 6 + Math.round(Number(params.rotors ?? 2))
    : 5 + Math.round(cyl / 4);
  for (let i = 0; i < n; i++) {
    const peak = (0.2 - i * 0.028) * (0.85 + growl * 0.2);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90 - i * 8, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480 - i * 40;
    const g = ctx.createGain();
    envGain(g, t, Math.max(0.04, peak), 0.008, 0.07);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.11);
    osc.onended = disconnectLater(osc, lp, g);

    if (crackle > 0.15 && i >= n - 2) {
      const noise = ctx.createBufferSource();
      noise.buffer = whiteBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const ng = ctx.createGain();
      envGain(ng, t + 0.01, crackle * 0.1, 0.003, 0.03);
      noise.connect(hp);
      hp.connect(ng);
      ng.connect(dest);
      noise.start(t);
      noise.stop(t + 0.05);
      noise.onended = disconnectLater(noise, hp, ng);
    }

    t += gap;
    gap *= 1.18 + (isRotary ? 0.1 : fam < 1.5 ? 0.06 : 0); // decelerate
  }

  // Mechanical settle: soft knock + body thump
  const settle = t + 0.04;
  const knock = ctx.createOscillator();
  knock.type = 'triangle';
  knock.frequency.setValueAtTime(110, settle);
  knock.frequency.exponentialRampToValueAtTime(55, settle + 0.12);
  const klp = ctx.createBiquadFilter();
  klp.type = 'lowpass';
  klp.frequency.value = 320;
  const kg = ctx.createGain();
  envGain(kg, settle, 0.18, 0.005, 0.14);
  knock.connect(klp);
  klp.connect(kg);
  kg.connect(dest);
  knock.start(settle);
  knock.stop(settle + 0.18);
  knock.onended = disconnectLater(knock, klp, kg);

  const body = ctx.createBufferSource();
  body.buffer = pinkBuf;
  const blp = ctx.createBiquadFilter();
  blp.type = 'lowpass';
  blp.frequency.value = 180;
  const bg = ctx.createGain();
  envGain(bg, settle, 0.14, 0.01, 0.2);
  body.connect(blp);
  blp.connect(bg);
  bg.connect(dest);
  body.start(settle);
  body.stop(settle + 0.28);
  body.onended = disconnectLater(body, blp, bg);

  return shutoffDuration('ice');
}

// ─── Jet: spool climb + igniter hiss / spool decay (no hard gate) ───

function playJetStarter(s: StartShutdownCtx): number {
  const { ctx, dest, params, pinkBuf, whiteBuf } = s;
  const now = ctx.currentTime;
  const spoolHz = Number(params.spoolPitch ?? 180);
  const compressor = clamp(Number(params.compressor ?? 0.55));
  const inertia = clamp(Number(params.spoolInertia ?? 0.62));
  const idleSpool = clamp(Number(params.idleSpool ?? 0.35));
  const turbine = clamp(Number(params.turbine ?? 0.55));
  const dur = 0.55 + inertia * 0.7; // longer spool with more inertia

  // Spool noise bed climbing
  const noise = ctx.createBufferSource();
  noise.buffer = pinkBuf;
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(220 + idleSpool * 80, now);
  bp.frequency.exponentialRampToValueAtTime(900 + spoolHz * 0.8, now + dur);
  bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, now);
  ng.gain.exponentialRampToValueAtTime(0.08 + compressor * 0.14, now + dur * 0.55);
  ng.gain.setValueAtTime(0.1 + compressor * 0.12, now + dur * 0.85);
  ng.gain.exponentialRampToValueAtTime(0.04 + idleSpool * 0.06, now + dur + 0.15);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  noise.start(now);
  noise.stop(now + dur + 0.2);
  noise.onended = disconnectLater(noise, bp, ng);

  // Buried spool whine (detuned pair — not a laser)
  for (const det of [-1.02, 1.015]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f0 = (spoolHz * 0.35) * Math.abs(det);
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(spoolHz * 0.85 * Math.abs(det), now + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.03 + turbine * 0.04, now + dur * 0.7);
    og.gain.exponentialRampToValueAtTime(0.02, now + dur + 0.12);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = spoolHz;
    filt.Q.value = 3.5;
    osc.connect(filt);
    filt.connect(og);
    og.connect(dest);
    osc.start(now);
    osc.stop(now + dur + 0.15);
    osc.onended = disconnectLater(osc, filt, og);
  }

  // Light igniter hiss (short, mid-high)
  const ignT = now + dur * 0.42;
  const hiss = ctx.createBufferSource();
  hiss.buffer = whiteBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3200;
  const hg = ctx.createGain();
  envGain(hg, ignT, 0.07 + compressor * 0.04, 0.02, 0.18);
  hiss.connect(hp);
  hp.connect(hg);
  hg.connect(dest);
  hiss.start(ignT);
  hiss.stop(ignT + 0.28);
  hiss.onended = disconnectLater(hiss, hp, hg);

  return starterDuration('aerospace');
}

function playJetShutoff(s: StartShutdownCtx): number {
  const { ctx, dest, params, pinkBuf } = s;
  const now = ctx.currentTime;
  const spoolHz = Number(params.spoolPitch ?? 180);
  const inertia = clamp(Number(params.spoolInertia ?? 0.62));
  const compressor = clamp(Number(params.compressor ?? 0.55));
  const jetRoar = clamp(Number(params.jetRoar ?? 0.5));
  const dur = 0.7 + inertia * 0.65; // soft decay, no hard gate

  const noise = ctx.createBufferSource();
  noise.buffer = pinkBuf;
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(700 + spoolHz * 0.5, now);
  bp.frequency.exponentialRampToValueAtTime(180, now + dur);
  bp.Q.value = 0.65;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.12 + compressor * 0.1 + jetRoar * 0.06, now);
  // Smooth exponential decay — never brick-wall
  ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  noise.start(now);
  noise.stop(now + dur + 0.05);
  noise.onended = disconnectLater(noise, bp, ng);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(spoolHz * 0.9, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, spoolHz * 0.2), now + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.045, now);
  og.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(1400, now);
  filt.frequency.exponentialRampToValueAtTime(280, now + dur);
  osc.connect(filt);
  filt.connect(og);
  og.connect(dest);
  osc.start(now);
  osc.stop(now + dur + 0.05);
  osc.onended = disconnectLater(osc, filt, og);

  return shutoffDuration('aerospace');
}

// ─── Ion Twin: motor bed → formant breath / howl collapse → motor → silence ───

function playIonStarter(s: StartShutdownCtx): number {
  const { ctx, dest, params, pinkBuf } = s;
  const now = ctx.currentTime;
  const core = Number(params.corePitch ?? 62);
  const detune = clamp(Number(params.motorDetune ?? 0.55));
  const motorMix = clamp(Number(params.motorMix ?? params.carrierBite ?? 0.5));
  const howl = clamp(Number(params.formantHowl ?? params.engineHowl ?? 0.85));
  const shift = clamp(Number(params.formantShift ?? 0.5));
  const spread = clamp(Number(params.formantSpread ?? 0.5));
  const spoolLag = clamp(Number(params.spoolLag ?? 0.55));
  const bedDur = 0.35 + spoolLag * 0.35;
  const breathDur = 0.45 + howl * 0.25;

  // Twin motor bed fade-in
  for (const side of [-1, 1]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const hz = core * (1 + side * detune * 0.04);
    osc.frequency.value = hz;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140 + motorMix * 80;
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.07 + motorMix * 0.08, now + bedDur * 0.7);
    g.gain.setValueAtTime(0.06 + motorMix * 0.06, now + bedDur + breathDur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.03, now + bedDur + breathDur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + bedDur + breathDur + 0.05);
    osc.onended = disconnectLater(osc, lp, g);
  }

  // Soft motor noise body
  const bedN = ctx.createBufferSource();
  bedN.buffer = pinkBuf;
  bedN.loop = true;
  const bedBp = ctx.createBiquadFilter();
  bedBp.type = 'bandpass';
  bedBp.frequency.value = core * 1.8;
  bedBp.Q.value = 0.9;
  const bedG = ctx.createGain();
  bedG.gain.setValueAtTime(0.0001, now);
  bedG.gain.exponentialRampToValueAtTime(0.1 * motorMix, now + bedDur * 0.6);
  bedG.gain.exponentialRampToValueAtTime(0.04, now + bedDur + breathDur);
  bedN.connect(bedBp);
  bedBp.connect(bedG);
  bedG.connect(dest);
  bedN.start(now);
  bedN.stop(now + bedDur + breathDur + 0.05);
  bedN.onended = disconnectLater(bedN, bedBp, bedG);

  // Formant breath (multi-band howl swell)
  const breathT = now + bedDur * 0.75;
  const formants = [
    420 * (0.75 + shift * 0.5),
    720 * (0.75 + shift * 0.5) * (1 + spread * 0.15),
    1180 * (0.75 + shift * 0.5),
  ];
  for (const cf of formants) {
    const n = ctx.createBufferSource();
    n.buffer = pinkBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(cf * 0.7, breathT);
    f.frequency.exponentialRampToValueAtTime(cf, breathT + breathDur * 0.55);
    f.Q.value = 4 + howl * 3;
    const g = ctx.createGain();
    envGain(g, breathT, 0.06 + howl * 0.1, 0.08, breathDur * 0.55, breathDur * 0.15);
    n.connect(f);
    f.connect(g);
    g.connect(dest);
    n.start(breathT);
    n.stop(breathT + breathDur + 0.05);
    n.onended = disconnectLater(n, f, g);
  }

  return starterDuration('scifi');
}

function playIonShutoff(s: StartShutdownCtx): number {
  const { ctx, dest, params, pinkBuf } = s;
  const now = ctx.currentTime;
  const core = Number(params.corePitch ?? 62);
  const howl = clamp(Number(params.formantHowl ?? params.engineHowl ?? 0.85));
  const shift = clamp(Number(params.formantShift ?? 0.5));
  const motorMix = clamp(Number(params.motorMix ?? params.carrierBite ?? 0.5));
  const collapse = 0.45 + howl * 0.2;
  const bedTail = 0.35 + motorMix * 0.2;

  // Howl collapse (falling formants)
  const formants = [480, 780, 1250].map((f) => f * (0.75 + shift * 0.5));
  for (const cf of formants) {
    const n = ctx.createBufferSource();
    n.buffer = pinkBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(cf, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, cf * 0.25), now + collapse);
    f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08 + howl * 0.1, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + collapse);
    n.connect(f);
    f.connect(g);
    g.connect(dest);
    n.start(now);
    n.stop(now + collapse + 0.05);
    n.onended = disconnectLater(n, f, g);
  }

  // Motor bed remains briefly then silence
  const bedT = now + collapse * 0.55;
  for (const side of [-1, 1]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(core * (1 + side * 0.03), bedT);
    osc.frequency.exponentialRampToValueAtTime(core * 0.7, bedT + bedTail);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, bedT);
    g.gain.exponentialRampToValueAtTime(0.05 + motorMix * 0.04, bedT + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, bedT + bedTail);
    osc.connect(lp);
    lp.connect(g);
    g.connect(dest);
    osc.start(bedT);
    osc.stop(bedT + bedTail + 0.05);
    osc.onended = disconnectLater(osc, lp, g);
  }

  return shutoffDuration('scifi');
}

// ─── EV: inverter wake / spin-down ───

function playEvStarter(s: StartShutdownCtx): number {
  const { ctx, dest, params, whiteBuf } = s;
  const now = ctx.currentTime;
  const whine = Number(params.whinePitch ?? 420);
  const buzz = clamp(Number(params.inverterBuzz ?? 0.4));
  const dual = clamp(Number(params.dualBeat ?? 0));
  const dur = 0.65;

  // Inverter wake: rising PWM-ish buzz (pulseWidth-modulated feel via AM)
  const carrier = ctx.createOscillator();
  carrier.type = 'sawtooth';
  carrier.frequency.setValueAtTime(whine * 0.35, now);
  carrier.frequency.exponentialRampToValueAtTime(whine * 0.95, now + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(800, now);
  lp.frequency.exponentialRampToValueAtTime(2800 + buzz * 1200, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.06 + buzz * 0.06, now + dur * 0.55);
  g.gain.setValueAtTime(0.05 + buzz * 0.04, now + dur);
  // Light AM for inverter grit (separate VCA so envelope ramps stay clean)
  const am = ctx.createGain();
  am.gain.value = 0.7; // DC offset so square AM stays audible / non-negative-ish
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.setValueAtTime(40 + buzz * 80, now);
  lfo.frequency.exponentialRampToValueAtTime(120 + buzz * 200, now + dur);
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.28 + buzz * 0.18;
  lfo.connect(lfoG);
  lfoG.connect(am.gain);
  carrier.connect(lp);
  lp.connect(am);
  am.connect(g);
  g.connect(dest);

  carrier.start(now);
  lfo.start(now);
  carrier.stop(now + dur + 0.08);
  lfo.stop(now + dur + 0.08);
  carrier.onended = disconnectLater(carrier, lp, am, g, lfo, lfoG);

  if (dual > 0.1) {
    const c2 = ctx.createOscillator();
    c2.type = 'sine';
    c2.frequency.setValueAtTime(whine * 0.33 * 1.03, now);
    c2.frequency.exponentialRampToValueAtTime(whine * 0.9 * 1.03, now + dur);
    const g2 = ctx.createGain();
    envGain(g2, now, 0.03 * dual, 0.1, dur * 0.5, dur * 0.2);
    c2.connect(g2);
    g2.connect(dest);
    c2.start(now);
    c2.stop(now + dur + 0.05);
    c2.onended = disconnectLater(c2, g2);
  }

  // Soft click of contactor
  const click = ctx.createBufferSource();
  click.buffer = whiteBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const cg = ctx.createGain();
  envGain(cg, now + 0.02, 0.08, 0.002, 0.025);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(dest);
  click.start(now + 0.02);
  click.stop(now + 0.06);
  click.onended = disconnectLater(click, hp, cg);

  return starterDuration('ev-whine');
}

function playEvShutoff(s: StartShutdownCtx): number {
  const { ctx, dest, params } = s;
  const now = ctx.currentTime;
  const whine = Number(params.whinePitch ?? 420);
  const buzz = clamp(Number(params.inverterBuzz ?? 0.4));
  const regen = clamp(Number(params.regenHowl ?? 0.3));
  const dur = 0.75;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(whine * 0.9, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(55, whine * 0.15), now + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200 + buzz * 800, now);
  lp.frequency.exponentialRampToValueAtTime(400, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.07 + buzz * 0.04 + regen * 0.03, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(lp);
  lp.connect(g);
  g.connect(dest);
  osc.start(now);
  osc.stop(now + dur + 0.05);
  osc.onended = disconnectLater(osc, lp, g);

  // Soft contactor open
  const click = ctx.createOscillator();
  click.type = 'triangle';
  click.frequency.value = 180;
  const cg = ctx.createGain();
  envGain(cg, now + dur * 0.72, 0.06, 0.003, 0.04);
  click.connect(cg);
  cg.connect(dest);
  click.start(now + dur * 0.72);
  click.stop(now + dur * 0.72 + 0.08);
  click.onended = disconnectLater(click, cg);

  return shutoffDuration('ev-whine');
}
