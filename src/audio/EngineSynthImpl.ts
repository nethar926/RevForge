import { CharacterEngine } from './CharacterEngine';
import { defaultsForTopology, getBuiltin } from './builtins';
import { RevForgeSynth } from '../forge/RevForgeSynth';
import { isNightPursuitTopology } from './nightPursuitPack';
import {
  NightPursuitBus,
  createNightPursuitDriveState,
  nightPursuitWorkletTargets,
  npIdleRpm,
  stepNightPursuitDrive,
  type NightPursuitDrive,
} from './nightPursuitVoice';
import { EnvelopeMeter } from './envelopeMeter';
import { isStellarHelmTopology } from './stellarHelmPack';
import {
  StellarHelmVoice,
  createStellarHelmDriveState,
  stepStellarHelmDrive,
} from './stellarHelmVoice';
import type {
  DrivingInput,
  EngineDiag,
  EngineId,
  EngineParams,
  EngineStateSnapshot,
  EnginePatch,
  EngineSynth,
  IceMode,
  LockStage,
  ScannerEdge,
  SynthNodeDesc,
  TopologyId,
} from './types';
import { nextLockStage, packSupportsLockLadder } from './lockStage';
import {
  clampIdleBand,
  DEFAULT_IDLE_BAND,
  DEFAULT_IDLE_RPM_MAX,
  DEFAULT_IDLE_RPM_MIN,
  iceFiringHzFromRpm,
  IDLE_PREF_REFRESH_MS,
  idleGate,
  idleJitter01,
  readIdleBandFromStorage,
  type IdleBand,
} from './idleBand';
import { clamp, createNoiseBuffer, lerp, makeShaper, rpmCurve, smooth, smoothstep } from './utils';
import { EngineStateBridge, workletJitterToPhysics } from './engineStateBridge';
import {
  playEngineShutoff,
  playEngineStarter,
  shutoffDuration,
} from './engineStartShutdown';
import { applyIonTwinLayersToParams } from './ionTwinLayers';
import { storageKey } from '../lib/storageKey';
import pulseWorkletUrl from './worklets/pulse-engine-processor.js?url';

type Kind = EnginePatch['kind'];

interface GraphHandles {
  master: GainNode;
  limiter: DynamicsCompressorNode;
  // shared
  noiseSrc?: AudioBufferSourceNode;
  pinkSrc?: AudioBufferSourceNode;
  // ICE oscillator path
  fund?: OscillatorNode;
  fund2?: OscillatorNode;
  fund3?: OscillatorNode;
  sub?: OscillatorNode;
  pulseLfo?: OscillatorNode;
  pulseGain?: GainNode;
  unevenLfo?: OscillatorNode;
  unevenGain?: GainNode;
  fundGain?: GainNode;
  subGain?: GainNode;
  mechGain?: GainNode;
  mechFilt?: BiquadFilterNode;
  presenceFilt?: BiquadFilterNode;
  muffler?: BiquadFilterNode;
  intakeGain?: GainNode;
  intakeFilt?: BiquadFilterNode;
  exhaustGain?: GainNode;
  ignGain?: GainNode;
  shaper?: WaveShaperNode;
  iceBus?: GainNode;
  // ICE worklet path
  pulseNode?: AudioWorkletNode;
  pulseGainOut?: GainNode;
  iceMode?: 'worklet' | 'osc';
  // EV
  whine1?: OscillatorNode;
  whine2?: OscillatorNode;
  whine3?: OscillatorNode;
  whineGain?: GainNode;
  buzzGain?: GainNode;
  buzzFilt?: BiquadFilterNode;
  // Sci-fi
  carrier1?: OscillatorNode;
  carrier2?: OscillatorNode;
  carrier3?: OscillatorNode;
  carrierGain?: GainNode;
  pulseMod?: OscillatorNode;
  pulseDepth?: GainNode;
  howlOsc?: OscillatorNode;
  howlOsc2?: OscillatorNode;
  howlFilt?: BiquadFilterNode;
  howlFilt2?: BiquadFilterNode;
  howlFilt3?: BiquadFilterNode;
  howlFilt4?: BiquadFilterNode;
  howlGain?: GainNode;
  formantGain?: GainNode;
  /** Waveshape harshness on formant scream bus */
  howlShaper?: WaveShaperNode;
  /** Quiet grit under noise howl (noise, not saw lead) */
  howlOscGain?: GainNode;
  howlGritFilt?: BiquadFilterNode;
  /** Burtt-style phrase AM on the scream */
  howlPhraseLfo?: OscillatorNode;
  howlPhraseDepth?: GainNode;
  bodyGain?: GainNode;
  bodyFilt?: BiquadFilterNode;
  /** Twin motor LP beds (drive bus) */
  motorFiltL?: BiquadFilterNode;
  motorFiltR?: BiquadFilterNode;
  motorGainL?: GainNode;
  motorGainR?: GainNode;
  motorPulseLfo?: OscillatorNode;
  motorPulseLfo2?: OscillatorNode;
  motorPulseDepth?: GainNode;
  motorPulseDepth2?: GainNode;
  /** Short cabin waveguide on motor bus only */
  motorBodyDelay?: DelayNode;
  motorBodyFb?: GainNode;
  motorBodyMix?: GainNode;
  /** Brighter scream burst stack β ~470/1270/1480 (ref-C) */
  screamFilt?: BiquadFilterNode;
  screamFilt2?: BiquadFilterNode;
  screamFilt3?: BiquadFilterNode;
  screamGain?: GainNode;
  screamShaper?: WaveShaperNode;
  /** Shared grit bus (2–5 kHz × load) */
  gritFilt?: BiquadFilterNode;
  gritGain?: GainNode;
  humOsc?: OscillatorNode;
  humGain?: GainNode;
  afterGain?: GainNode;
  wetHissGain?: GainNode;
  wetHissFilt?: BiquadFilterNode;
  wetHissFilt2?: BiquadFilterNode;
  /** Mid broadband rush body (pink) under wet HP hiss */
  wetBodyFilt?: BiquadFilterNode;
  wetBodyGain?: GainNode;
  wetAmLfo?: OscillatorNode;
  wetAmDepth?: GainNode;
  wetPan?: StereoPannerNode;
  /** Extra wet bus for short flyby attack */
  wetFlybyGain?: GainNode;
  /** Dry vs body wet crossfade */
  dryGain?: GainNode;
  wetBusGain?: GainNode;
  /** Subtle L/R twin motor delay */
  twinDelay?: DelayNode;
  delay?: DelayNode;
  delayGain?: GainNode;
  panL?: StereoPannerNode;
  panR?: StereoPannerNode;
  // Aerospace organic 4-bus
  spoolGain?: GainNode;
  compressorFilt?: BiquadFilterNode;
  compressorGain?: GainNode;
  intakeWhineOsc?: OscillatorNode;
  intakeWhineOsc2?: OscillatorNode;
  intakeWhineOsc3?: OscillatorNode;
  intakeWhineFilt?: BiquadFilterNode;
  intakeWhineGain?: GainNode;
  spoolFlutter?: OscillatorNode;
  spoolFlutterDepth?: GainNode;
  buzzSaw1?: OscillatorNode;
  buzzSaw2?: OscillatorNode;
  buzzSawGain?: GainNode;
  coreFilt?: BiquadFilterNode;
  coreFilt2?: BiquadFilterNode;
  coreGain?: GainNode;
  coreRoughLfo?: OscillatorNode;
  coreRoughDepth?: GainNode;
  jetRoarFilt?: BiquadFilterNode;
  jetRoarGain?: GainNode;
  afterFilt?: BiquadFilterNode;
  afterShaper?: WaveShaperNode;
  nozzleFilt?: BiquadFilterNode;
  nozzleGain?: GainNode;
  airframeFilt?: BiquadFilterNode;
  airframeGain?: GainNode;
  airframeLfo?: OscillatorNode;
  airframeAmDepth?: GainNode;
  // EV living / pack extras
  meshFilt?: BiquadFilterNode;
  meshGain?: GainNode;
  regenOsc?: OscillatorNode;
  regenOsc2?: OscillatorNode;
  regenFilt?: BiquadFilterNode;
  regenGain?: GainNode;
  motorFilt?: BiquadFilterNode;
  motorGain?: GainNode;
  dualWhineR?: OscillatorNode;
  dualWhineGainR?: GainNode;
  // ICE osc valvetrain tick
  tickGain?: GainNode;
  tickFilt?: BiquadFilterNode;
  /** Night Pursuit post chain + PURSUIT bus (engine → npBus.input → master) */
  npBus?: NightPursuitBus;
  /** Stellar Helm drive hum voice (replaces the EV whine graph for that topology) */
  helmVoice?: StellarHelmVoice;
}

const workletContexts = new WeakSet<BaseAudioContext>();

export class EngineSynthImpl implements EngineSynth {
  readonly context: AudioContext;
  readonly output: GainNode;

  private _id: EngineId = 'v8-rumble';
  private patchMeta: EnginePatch;
  private params: EngineParams;
  private driving: DrivingInput = { speed: 0, throttle: 0, load: 0, reverse: false };
  private disposed = false;
  private g: GraphHandles;
  private hud: {
    rpmNorm: number;
    loadFeel: number;
    fundamentalHz: number;
    driveMood: string;
    lockStage: LockStage;
  } = { rpmNorm: 0, loadFeel: 0, fundamentalHz: 55, driveMood: 'idle', lockStage: 'none' };
  private whiteBuf: AudioBuffer;
  private pinkBuf: AudioBuffer;
  private workletPromise: Promise<boolean> | null = null;
  private workletError: string | undefined;
  private started = false;
  private customGraph: SynthNodeDesc[] | undefined;
  /** Living drive: lagged throttle/load (hysteresis) */
  private throttleLag = 0;
  private loadLag = 0;
  /** Thin ICE EngineState bridge (firingMask / crank HUD). */
  private engineState = new EngineStateBridge();
  private lastEngineStateMs = 0;
  /** Ion Twin flyby attack envelope (rpm/throttle jump) */
  private scifiFlyby = 0;
  private scifiPrevRpm = 0;
  private scifiPrevThr = 0;
  /** Ion Twin spool inertia on motor rate + howl (1-pole lag) */
  private ionSpoolLag = 0;
  private ionSurge = 0;
  /** Aerospace spool inertia + wander */
  private spoolLag = 0;
  private spoolWander = 0;
  private abLag = 0;
  /** EV inverter detune wander */
  private evDetuneWander = 0;
  private prevThrottle = 0;
  private driveMood = 'idle';
  private liveJit = { filt: 0, gain: 0, pitch: 0 };
  private valveTickWait = 0;
  /** Ion Twin lock ladder (scifi/ion-twin only) */
  private lockStage: LockStage = 'none';
  private lockSfxEnabled = false;
  /** Soft-cue for Frontend; prefer polling getHud().lockStage if unset. */
  onLockStageChange?: (stage: LockStage) => void;
  /** MANUAL upshift bark; default false; localStorage `ds-upshift-sfx`. */
  private upshiftSfxEnabled = false;
  /** Keep output audible through a Frontend-cued shutoff tail (ctx time). */
  private shutoffUntil = 0;
  /** Debounce duplicate starter cues (ctx time). */
  private lastStarterAt = -1;
  /** Drive Dynamics idle RPM band (localStorage or setIdleBand). */
  private idleBand: IdleBand = { ...DEFAULT_IDLE_BAND };
  /** When true, setIdleBand wins over localStorage refresh. */
  private idleBandFromApi = false;
  private lastIdlePrefMs = 0;
  /** Night Pursuit continuous drive model (auto-trans fallback, overrun, spool). */
  private npDriveState = createNightPursuitDriveState();
  private npDrive: NightPursuitDrive | null = null;
  private npLastMs = 0;
  /** Post-gain loudness envelope (getEnvelope / getVoiceEnvelope). */
  private envelope: EnvelopeMeter;
  /** Stellar Helm lagged drive state (speed glide, throttle attack/release, reverse, boost). */
  private helmState = createStellarHelmDriveState();
  private helmLastMs = 0;

  constructor(ctx: AudioContext, patch?: EnginePatch) {
    this.context = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    // Critical: without this, the graph never reaches the speakers (silent on all devices).
    this.output.connect(ctx.destination);
    this.envelope = new EnvelopeMeter(ctx, this.output);

    this.whiteBuf = createNoiseBuffer(ctx, 2, false);
    this.pinkBuf = createNoiseBuffer(ctx, 2, true);

    const initial = patch ?? getBuiltin('v8-rumble')!;
    this.patchMeta = { ...initial, params: { ...initial.params } };
    this._id = initial.id;
    this.customGraph = initial.graph ? [...initial.graph] : undefined;
    this.params = {
      ...defaultsForTopology(initial.topology),
      ...(initial.params as EngineParams),
    };
    if (initial.ionLayers?.length) {
      this.params = applyIonTwinLayersToParams(this.params, initial.ionLayers);
    }
    if (this.customGraph?.length) {
      this.applyGraphToParams(this.customGraph);
    }

    this.g = this.buildGraph(initial.kind, initial.topology);
    this.applyAllParams();
    this.upshiftSfxEnabled = readUpshiftSfxPref();
    this.idleBand = readIdleBandFromStorage();
    this.lastIdlePrefMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.applyDriving(true);
  }

  get id(): EngineId {
    return this._id;
  }

  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    // iOS Safari: a tiny buffer play inside the user-gesture stack helps unlock audio.
    try {
      const unlock = this.context.createBuffer(1, 1, this.context.sampleRate);
      const src = this.context.createBufferSource();
      src.buffer = unlock;
      src.connect(this.context.destination);
      src.start(0);
    } catch {
      /* ignore unlock helper failures */
    }

    if (this.patchMeta.kind === 'ice') {
      await this.ensurePulseWorklet();
    }

    smooth(this.output.gain, 1, 0.08, this.context);
    this.started = true;
    if (this.g.helmVoice) {
      // Stellar Helm: the hum itself powers up (no combustion chuff on a starship drive)
      this.g.helmVoice.powerUp(1.6, undefined, 0);
      return;
    }
    // Unmistakable idle chuff/tick through the same output → destination bus
    // so the user knows audio unlocked even at speed=0 throttle=0.
    this.playIdleChuff();
  }

  stop(): void {
    this.started = false;
    const now = this.context.currentTime;
    const hold = Math.max(0, this.shutoffUntil - now);
    if (hold > 0.05) {
      // Let Frontend-cued shutoff tail finish, then fade — no hard gate.
      try {
        this.output.gain.cancelScheduledValues(now);
        this.output.gain.setValueAtTime(Math.max(this.output.gain.value, 0.001), now);
        this.output.gain.setTargetAtTime(0, now + hold * 0.55, 0.1);
      } catch {
        smooth(this.output.gain, 0, Math.min(0.45, hold), this.context);
      }
    } else {
      smooth(this.output.gain, 0, 0.12, this.context);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.started = false;
    try {
      this.teardownGraph();
      this.envelope.dispose();
      this.output.disconnect();
    } catch {
      /* ignore */
    }
  }

  setDriving(d: DrivingInput): void {
    this.refreshIdleBandFromPrefs();
    // Preserve Frontend rpmNorm/rpm when supplied (Forge rAF / GPS+Rev).
    // Audio still dual-maps speed→fundamental + throttle→brightness when omitted.
    this.driving = {
      speed: clamp(d.speed),
      throttle: clamp(d.throttle),
      load: d.load !== undefined ? clamp(d.load, -1, 1) : this.driving.load,
      reverse: !!d.reverse,
      rpm: d.rpm,
      rpmNorm: d.rpmNorm,
      acceleration: d.acceleration,
      shifting: d.shifting,
      overrun: d.overrun,
    };
    this.applyDriving(false);
  }

  /**
   * Drive Dynamics idle band. Pins over localStorage until reload.
   * Dynamics UI already writes localStorage — calling this is optional.
   */
  setIdleBand(band: { rpmMin: number; rpmMax: number }): void {
    this.idleBand = clampIdleBand(band.rpmMin, band.rpmMax);
    this.idleBandFromApi = true;
    this.applyDriving(false);
  }

  getIdleBand(): { rpmMin: number; rpmMax: number } {
    return { rpmMin: this.idleBand.rpmMin, rpmMax: this.idleBand.rpmMax };
  }

  /** Re-read Dynamics idle prefs (throttled). No-op if setIdleBand pinned. */
  private refreshIdleBandFromPrefs(): void {
    if (this.idleBandFromApi) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastIdlePrefMs < IDLE_PREF_REFRESH_MS) return;
    this.lastIdlePrefMs = now;
    this.idleBand = readIdleBandFromStorage();
  }

  setParams(p: Partial<EngineParams>): void {
    this.params = { ...this.params, ...p };
    this.applyAllParams();
    this.applyDriving(false);
  }

  getParams(): EngineParams {
    return { ...this.params };
  }

  toPatch(): EnginePatch {
    return {
      version: 0,
      id: this._id,
      name: this.patchMeta.name,
      kind: this.patchMeta.kind,
      topology: this.patchMeta.topology,
      params: { ...this.params } as Record<string, number | string>,
      graph: this.customGraph ? [...this.customGraph] : undefined,
      layers: this.patchMeta.layers ? this.patchMeta.layers.map((l) => ({ ...l })) : undefined,
      ionLayers: this.patchMeta.ionLayers?.map((l) => ({
        ...l,
        params: l.params ? { ...l.params } : undefined,
      })),
      meta: {
        ...this.patchMeta.meta,
        createdAt: new Date().toISOString(),
      },
    };
  }

  fromPatch(patch: EnginePatch): void {
    const kindChanged =
      patch.kind !== this.patchMeta.kind || patch.topology !== this.patchMeta.topology;
    this.patchMeta = { ...patch, params: { ...patch.params } };
    this._id = patch.id;
    this.customGraph = patch.graph ? [...patch.graph] : undefined;
    this.params = {
      ...defaultsForTopology(patch.topology),
      ...(patch.params as EngineParams),
    };
    if (patch.ionLayers?.length) {
      this.params = applyIonTwinLayersToParams(this.params, patch.ionLayers);
    }
    if (patch.layers?.length) {
      /* Sound Lab stacks — applied by character engine when present */
    }
    if (this.customGraph?.length) {
      this.applyGraphToParams(this.customGraph);
    }
    if (kindChanged) {
      this.teardownGraph();
      this.npDriveState = createNightPursuitDriveState(npIdleRpm(this.params));
      this.npLastMs = 0;
      this.helmState = createStellarHelmDriveState();
      this.helmLastMs = 0;
      this.g = this.buildGraph(patch.kind, patch.topology);
      this.lockStage = 'none';
      this.hud.lockStage = 'none';
    }
    this.applyAllParams();
    this.applyDriving(true);
    if (patch.kind === 'ice' && this.context.state === 'running') {
      void this.ensurePulseWorklet();
    }
  }

  getHud() {
    return { ...this.hud, driveMood: this.driveMood, lockStage: this.lockStage };
  }

  getLockStage(): LockStage {
    return this.lockStage;
  }

  setLockSfxEnabled(enabled: boolean): void {
    this.lockSfxEnabled = !!enabled;
  }

  getLockSfxEnabled(): boolean {
    return this.lockSfxEnabled;
  }

  setUpshiftSfxEnabled(enabled: boolean): void {
    this.upshiftSfxEnabled = !!enabled;
    writeUpshiftSfxPref(this.upshiftSfxEnabled);
  }

  getUpshiftSfxEnabled(): boolean {
    return this.upshiftSfxEnabled;
  }

  /**
   * Soft UI cue. Does not touch setDriving / pitch stack.
   * - 'upshift' → short mechanical bark when enabled (ICE/aerospace; quieter EV; skip scifi)
   * - 'starter' | 'ignition' → per-engine Ignition one-shot from active pack params
   * - 'shutdown' | 'shutoff' → per-engine Shutdown one-shot (call before stop() for full tail)
   */
  triggerUiCue(cue: 'upshift' | 'starter' | 'shutdown' | 'shutoff' | string): void {
    if (this.disposed) return;
    const c = String(cue || '').toLowerCase();
    if (c === 'starter' || c === 'ignition') {
      if (!this.started) return;
      this.playStarter();
      return;
    }
    if (c === 'shutdown' || c === 'shutoff') {
      // Allow after stop() flipped started — Frontend may cue then stop for the tail.
      if (this.context.state === 'closed') return;
      this.playShutoff();
      return;
    }
    if (c === 'scanner' || c === 'scanner-tick' || c === 'scanner-left' || c === 'scanner-right') {
      this.scannerTick(c === 'scanner-left' ? 'left' : 'right');
      return;
    }
    if (!this.started) return;
    if (c === 'upshift') {
      if (!this.upshiftSfxEnabled) return;
      this.playUpshiftBark();
    }
  }

  /** Procedural Ignition starter derived from active pack (same as triggerUiCue('starter')). */
  playStarter(): void {
    if (this.disposed || !this.started) return;
    const now = this.context.currentTime;
    if (this.lastStarterAt >= 0 && now - this.lastStarterAt < 0.45) return;
    this.lastStarterAt = now;
    const helm = this.g.helmVoice;
    // Stellar Helm: a starter after a power-down cue brings the hum back up under the sweep
    if (helm && helm.powerTarget < 0.5) helm.powerUp(1.6);
    try {
      playEngineStarter({
        ctx: this.context,
        dest: this.output,
        kind: this.patchMeta.kind,
        params: this.params,
        whiteBuf: this.whiteBuf,
        pinkBuf: this.pinkBuf,
        topology: this.patchMeta.topology,
        coreHz: helm?.coreHz(),
      });
    } catch {
      /* never block drive path */
    }
  }

  /** Procedural Shutdown shutoff derived from active pack (same as triggerUiCue('shutdown')). */
  playShutoff(): void {
    if (this.disposed) return;
    if (this.context.state === 'closed') return;
    const kind = this.patchMeta.kind;
    const dur = shutoffDuration(kind, this.patchMeta.topology);
    const now = this.context.currentTime;
    this.shutoffUntil = Math.max(this.shutoffUntil, now + dur);
    // Hold master so stop()'s fade does not mute the tail immediately.
    try {
      const g = this.output.gain;
      g.cancelScheduledValues(now);
      const cur = Math.max(g.value, 0.001);
      g.setValueAtTime(cur, now);
      if (cur < 0.85) g.linearRampToValueAtTime(1, now + 0.02);
    } catch {
      /* ignore */
    }
    // Stellar Helm: the hum winds down (pitch falls, level fades) under the shutoff sweep
    this.g.helmVoice?.powerDown(dur * 0.85);
    try {
      playEngineShutoff({
        ctx: this.context,
        dest: this.output,
        kind,
        params: this.params,
        whiteBuf: this.whiteBuf,
        pinkBuf: this.pinkBuf,
        topology: this.patchMeta.topology,
        coreHz: this.g.helmVoice?.coreHz(),
      });
    } catch {
      /* never block drive path */
    }
  }

  getDiag(): EngineDiag {
    const kind = this.patchMeta.kind;
    let iceMode: IceMode = 'n/a';
    if (kind === 'ice') {
      iceMode = this.g.iceMode ?? 'osc';
    }
    const diag: EngineDiag = {
      contextState: this.context.state,
      iceMode,
      running: this.started && !this.disposed,
      engineId: this._id,
    };
    if (this.workletError) diag.workletError = this.workletError;
    return diag;
  }

  /** 0..1 post-gain loudness envelope; poll per animation frame (Visual voice box). */
  getEnvelope(): number {
    if (this.disposed) return 0;
    return this.envelope.read();
  }

  /** Alias of getEnvelope() for the HUD `voiceEnvelope` prop. */
  getVoiceEnvelope(): number {
    return this.getEnvelope();
  }

  /**
   * Soft original electronic tick at a scanner sweep edge (Night Pursuit).
   * Level = params.scannerTick (default 0 → silent); panned toward the edge. No-op when stopped.
   */
  scannerTick(edge: ScannerEdge = 'right'): void {
    if (this.disposed || !this.started) return;
    const bus = this.g.npBus;
    if (!bus) return;
    const level = clamp(Number(this.params.scannerTick ?? 0));
    if (level <= 0.001) return;
    bus.scannerTick(level, edge === 'left' ? -1 : 1);
  }

  /** PURSUIT seasoning 0..1 (PURSUIT 1 · POWER 0.5 · AUTO/NORM 0). Same as setParams({pursuitBoost}). */
  setPursuitBoost(amount: number): void {
    const v = clamp(Number.isFinite(amount) ? amount : 0);
    this.params.pursuitBoost = v;
    this.patchMeta.params.pursuitBoost = v;
    this.applyDriving(false);
  }

  getEngineState(): EngineStateSnapshot {
    return this.engineState.snapshot();
  }

  /** bit i SET = cylinder/slot i disabled. Pushes to worklet when live. */
  setFiringMask(mask: number): void {
    this.engineState.setFiringMask(mask);
    this.params.firingMask = this.engineState.firingMask;
    if (this.g.iceMode === 'worklet' && this.g.pulseNode) {
      this.setWorkletParam('firingMask', this.engineState.firingMask, 0.02);
    }
  }

  /** §2.5 drop-cylinder QA: disable slot (SET bit). Lope must change, not only level. */
  dropCylinder(slot: number): void {
    this.engineState.dropCylinder(slot);
    this.params.firingMask = this.engineState.firingMask;
    if (this.g.iceMode === 'worklet' && this.g.pulseNode) {
      this.setWorkletParam('firingMask', this.engineState.firingMask, 0.02);
    }
  }

  /**
   * Short unmistakable confirmation through output → destination.
   * 1–2 combustion-ish pulses (or soft click) so silence after Start is diagnosable.
   */
  private playIdleChuff(): void {
    if (this.disposed) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    // Soft organic chuffs: filtered noise body + triangle thump (no saw lead)
    for (let i = 0; i < 2; i++) {
      const t0 = now + 0.04 + i * 0.095;
      try {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 72 - i * 11;

        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 520 - i * 80;
        filt.Q.value = 0.8;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);

        osc.connect(filt);
        filt.connect(g);
        g.connect(this.output);

        const noise = ctx.createBufferSource();
        noise.buffer = this.pinkBuf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 280 + i * 40;
        bp.Q.value = 1.2;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t0);
        ng.gain.exponentialRampToValueAtTime(0.32, t0 + 0.008);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
        noise.connect(bp);
        bp.connect(ng);
        ng.connect(this.output);

        osc.start(t0);
        osc.stop(t0 + 0.11);
        noise.start(t0);
        noise.stop(t0 + 0.09);

        osc.onended = () => {
          try {
            osc.disconnect();
            filt.disconnect();
            g.disconnect();
          } catch {
            /* ignore */
          }
        };
        noise.onended = () => {
          try {
            noise.disconnect();
            bp.disconnect();
            ng.disconnect();
          } catch {
            /* ignore */
          }
        };
      } catch {
        /* ignore chuff failures — never block start */
      }
    }
  }

  /** Map builder graph node params onto live EngineParams (v1 interpreter). */
  applyGraphToParams(graph: SynthNodeDesc[]): void {
    this.customGraph = [...graph];
    const mapped: Partial<EngineParams> = {};
    for (const node of graph) {
      const p = node.params;
      switch (node.type) {
        case 'PulseTrain':
          if (p.cylinders !== undefined) mapped.cylinders = Number(p.cylinders) as EngineParams['cylinders'];
          if (p.pulseWidth !== undefined) mapped.pulseWidth = Number(p.pulseWidth);
          if (p.pulseJitter !== undefined) mapped.pulseJitter = Number(p.pulseJitter);
          if (p.roughness !== undefined) mapped.roughness = Number(p.roughness);
          if (p.misfire !== undefined) mapped.misfire = Number(p.misfire);
          if (p.firingFamily !== undefined) mapped.firingFamily = Number(p.firingFamily);
          if (p.chambersPerRotor !== undefined) mapped.chambersPerRotor = Number(p.chambersPerRotor);
          if (p.rotors !== undefined) mapped.rotors = Number(p.rotors);
          if (p.firingMask !== undefined) mapped.firingMask = Number(p.firingMask) & 255;
          if (p.dropCyl !== undefined) mapped.dropCyl = Number(p.dropCyl);
          break;
        case 'ExhaustWaveguide':
          if (p.exhaustLength !== undefined) mapped.exhaustLength = Number(p.exhaustLength);
          if (p.exhaustFeedback !== undefined) mapped.exhaustFeedback = Number(p.exhaustFeedback);
          if (p.muffling !== undefined) mapped.muffling = Number(p.muffling);
          if (p.growl !== undefined) mapped.growl = Number(p.growl);
          break;
        case 'IntakeNoise':
          if (p.intake !== undefined) mapped.intake = Number(p.intake);
          break;
        case 'Mechanical':
          if (p.roughness !== undefined) mapped.roughness = Number(p.roughness);
          break;
        case 'FormantHowl':
          if (p.formantHowl !== undefined) mapped.formantHowl = Number(p.formantHowl);
          if (p.formantSpread !== undefined) mapped.formantSpread = Number(p.formantSpread);
          if (p.resonance !== undefined) mapped.resonance = Number(p.resonance);
          break;
        case 'WetRoadNoise':
          if (p.wetHiss !== undefined) mapped.wetHiss = Number(p.wetHiss);
          if (p.doppler !== undefined) mapped.doppler = Number(p.doppler);
          break;
        case 'TurbineSpool':
          if (p.spoolPitch !== undefined) mapped.spoolPitch = Number(p.spoolPitch);
          if (p.turbine !== undefined) mapped.turbine = Number(p.turbine);
          if (p.idleSpool !== undefined) mapped.idleSpool = Number(p.idleSpool);
          break;
        case 'IntakeWhine':
          if (p.intakeWhine !== undefined) mapped.intakeWhine = Number(p.intakeWhine);
          break;
        case 'Afterburner':
          if (p.afterburn !== undefined) mapped.afterburn = Number(p.afterburn);
          if (p.jetScream !== undefined) mapped.jetScream = Number(p.jetScream);
          break;
        case 'CompressorStage':
          if (p.compressor !== undefined) mapped.compressor = Number(p.compressor);
          if (p.jetRoar !== undefined) mapped.jetRoar = Number(p.jetRoar);
          break;
        case 'Gain':
        case 'gain':
          if (p.gain !== undefined) mapped.masterGain = clamp(Number(p.gain));
          break;
        default:
          break;
      }
    }
    this.params = { ...this.params, ...mapped };
    this.applyAllParams();
    this.applyDriving(false);
  }

  /* ---------- worklet ---------- */

  private async ensurePulseWorklet(): Promise<boolean> {
    if (this.disposed || this.patchMeta.kind !== 'ice') return false;
    if (this.g.iceMode === 'worklet' && this.g.pulseNode) return true;
    if (this.workletPromise) return this.workletPromise;

    this.workletPromise = (async () => {
      try {
        if (!workletContexts.has(this.context)) {
          const url = pulseWorkletUrl.startsWith('http')
            ? pulseWorkletUrl
            : new URL(pulseWorkletUrl, window.location.href).href;
          // Prefer public path fallback for Tesla / file:// quirks
          try {
            await this.context.audioWorklet.addModule(url);
          } catch {
            const base = import.meta.env.BASE_URL || './';
            await this.context.audioWorklet.addModule(`${base}worklets/pulse-engine-processor.js`);
          }
          workletContexts.add(this.context);
        }

        const node = new AudioWorkletNode(this.context, 'pulse-engine-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });

        const pulseGainOut = this.context.createGain();
        pulseGainOut.gain.value = 1;
        node.connect(pulseGainOut);
        pulseGainOut.connect(this.g.npBus ? this.g.npBus.input : this.g.master);

        // Mute oscillator ICE bus if present
        if (this.g.iceBus) {
          smooth(this.g.iceBus.gain, 0, 0.05, this.context);
        }

        this.g.pulseNode = node;
        this.g.pulseGainOut = pulseGainOut;
        this.g.iceMode = 'worklet';
        this.workletError = undefined;
        this.applyAllParams();
        this.applyDriving(true);
        return true;
      } catch (err) {
        console.warn('[DriveSynth] pulse worklet unavailable, using oscillator ICE', err);
        this.g.iceMode = 'osc';
        this.workletError =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'worklet load failed';
        return false;
      } finally {
        this.workletPromise = null;
      }
    })();

    return this.workletPromise;
  }

  /* ---------- graph build ---------- */

  private buildGraph(kind: Kind, _topology: TopologyId): GraphHandles {
    const ctx = this.context;
    const master = ctx.createGain();
    master.gain.value = 0.7;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 8;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    master.connect(limiter);
    limiter.connect(this.output);

    const g: GraphHandles = {
      master,
      limiter,
      iceMode: kind === 'ice' ? 'osc' : undefined,
    };

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.whiteBuf;
    noiseSrc.loop = true;
    noiseSrc.start();
    g.noiseSrc = noiseSrc;

    const pinkSrc = ctx.createBufferSource();
    pinkSrc.buffer = this.pinkBuf;
    pinkSrc.loop = true;
    pinkSrc.start();
    g.pinkSrc = pinkSrc;

    if (isStellarHelmTopology(_topology)) {
      // Stellar Helm: compact starship drive hum graph (shares the engine's pink noise buffer)
      g.helmVoice = new StellarHelmVoice(ctx, master, { noiseBuffer: this.pinkBuf });
      // Switched to this pack while running → power the new hum up instead of leaving it silent
      if (this.started) g.helmVoice.powerUp(1.2, undefined, 0);
    } else if (kind === 'ice') {
      this.buildIce(g);
    } else if (kind === 'ev-whine') {
      this.buildEv(g);
    } else if (kind === 'aerospace') {
      this.buildAerospace(g);
    } else {
      this.buildScifi(g);
    }

    return g;
  }

  private buildIce(g: GraphHandles): void {
    const ctx = this.context;

    // Organic ICE osc fallback: noise + soft pulse imitation — NO triple saw/square lead.
    // Buses mirror worklet: mechanical bed, combustion pulses, intake, exhaust waveguide body.
    const iceBus = ctx.createGain();
    iceBus.gain.value = 1;
    g.iceBus = iceBus;

    const muffler = ctx.createBiquadFilter();
    muffler.type = 'lowpass';
    muffler.frequency.value = 2200;
    muffler.Q.value = 0.65;
    g.muffler = muffler;

    const mechDeep = ctx.createBiquadFilter();
    mechDeep.type = 'lowpass';
    mechDeep.frequency.value = 140;
    mechDeep.Q.value = 0.7;

    const mechFilt = ctx.createBiquadFilter();
    mechFilt.type = 'bandpass';
    mechFilt.frequency.value = 700;
    mechFilt.Q.value = 1.8;
    g.mechFilt = mechFilt;

    const mechGain = ctx.createGain();
    mechGain.gain.value = 0.16;
    g.mechGain = mechGain;

    g.pinkSrc!.connect(mechDeep);
    mechDeep.connect(mechGain);
    g.pinkSrc!.connect(mechFilt);
    mechFilt.connect(mechGain);

    const unevenLfo = ctx.createOscillator();
    unevenLfo.type = 'sine';
    unevenLfo.frequency.value = 3.2;
    unevenLfo.start();
    g.unevenLfo = unevenLfo;

    const unevenGain = ctx.createGain();
    unevenGain.gain.value = 0.08;
    g.unevenGain = unevenGain;
    unevenLfo.connect(unevenGain);
    unevenGain.connect(mechGain.gain);

    const fundGain = ctx.createGain();
    fundGain.gain.value = 0.12;
    g.fundGain = fundGain;

    const fund = ctx.createOscillator();
    fund.type = 'triangle';
    fund.frequency.value = 55;
    fund.start();
    g.fund = fund;

    const fund2 = ctx.createOscillator();
    fund2.type = 'triangle';
    fund2.frequency.value = 27.5;
    fund2.detune.value = 5;
    fund2.start();
    g.fund2 = fund2;

    g.fund3 = undefined;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeShaper(0.22) as Float32Array<ArrayBuffer>;
    shaper.oversample = '2x';
    g.shaper = shaper;

    const bodyLp = ctx.createBiquadFilter();
    bodyLp.type = 'lowpass';
    bodyLp.frequency.value = 480;
    bodyLp.Q.value = 0.8;

    const fundMix = ctx.createGain();
    fundMix.gain.value = 0.55;
    fund.connect(bodyLp);
    fund2.connect(bodyLp);
    bodyLp.connect(shaper);
    shaper.connect(fundMix);
    fundMix.connect(fundGain);

    const pulseBp = ctx.createBiquadFilter();
    pulseBp.type = 'bandpass';
    pulseBp.frequency.value = 380;
    pulseBp.Q.value = 1.4;
    g.presenceFilt = pulseBp;

    const pulseNoiseGain = ctx.createGain();
    pulseNoiseGain.gain.value = 0.2;
    g.pinkSrc!.connect(pulseBp);
    pulseBp.connect(pulseNoiseGain);
    pulseNoiseGain.connect(fundGain);

    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = 'sine';
    pulseLfo.frequency.value = 8;
    pulseLfo.start();
    g.pulseLfo = pulseLfo;

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.14;
    g.pulseGain = pulseGain;
    pulseLfo.connect(pulseGain);
    pulseGain.connect(fundGain.gain);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 55;
    sub.start();
    g.sub = sub;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.18;
    g.subGain = subGain;
    sub.connect(subGain);
    subGain.connect(muffler);

    fundGain.connect(muffler);

    const intakeFilt = ctx.createBiquadFilter();
    intakeFilt.type = 'bandpass';
    intakeFilt.frequency.value = 1600;
    intakeFilt.Q.value = 0.7;
    g.intakeFilt = intakeFilt;

    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    g.intakeGain = intakeGain;

    g.noiseSrc!.connect(intakeFilt);
    intakeFilt.connect(intakeGain);
    intakeGain.connect(muffler);

    const exhaustFilt = ctx.createBiquadFilter();
    exhaustFilt.type = 'lowpass';
    exhaustFilt.frequency.value = 220;
    exhaustFilt.Q.value = 0.85;

    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0.28;
    g.exhaustGain = exhaustGain;

    const delay = ctx.createDelay(0.08);
    delay.delayTime.value = 0.018;
    g.delay = delay;

    const delayGain = ctx.createGain();
    delayGain.gain.value = 0.45;
    g.delayGain = delayGain;

    g.pinkSrc!.connect(exhaustFilt);
    exhaustFilt.connect(exhaustGain);
    exhaustGain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(delay);
    delay.connect(muffler);
    exhaustGain.connect(muffler);

    const ignFilt = ctx.createBiquadFilter();
    ignFilt.type = 'highpass';
    ignFilt.frequency.value = 2200;

    const ignGain = ctx.createGain();
    ignGain.gain.value = 0.03;
    g.ignGain = ignGain;

    g.noiseSrc!.connect(ignFilt);
    ignFilt.connect(ignGain);

    // Sparse valvetrain tick (gated in applyIceDriving)
    const tickFilt = ctx.createBiquadFilter();
    tickFilt.type = 'bandpass';
    tickFilt.frequency.value = 3200;
    tickFilt.Q.value = 4;
    g.tickFilt = tickFilt;
    const tickGain = ctx.createGain();
    tickGain.gain.value = 0.001;
    g.tickGain = tickGain;
    g.noiseSrc!.connect(tickFilt);
    tickFilt.connect(tickGain);
    tickGain.connect(muffler);
    ignGain.connect(muffler);

    mechGain.connect(muffler);

    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    g.panL = pan;

    muffler.connect(pan);
    pan.connect(iceBus);
    if (isNightPursuitTopology(this.patchMeta.topology)) {
      // Night Pursuit: engine → post chain (body / load mids / tone) + PURSUIT bus → master
      g.npBus = new NightPursuitBus(ctx, g.master);
      iceBus.connect(g.npBus.input);
    } else {
      iceBus.connect(g.master);
    }
  }

  private buildEv(g: GraphHandles): void {
    const ctx = this.context;
    const topo = this.patchMeta.topology;

    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.25;
    g.whineGain = whineGain;

    const w1 = ctx.createOscillator();
    w1.type = 'sine';
    w1.frequency.value = 180;
    w1.start();
    g.whine1 = w1;

    const w2 = ctx.createOscillator();
    w2.type = 'sine';
    w2.frequency.value = 360;
    w2.start();
    g.whine2 = w2;

    const w3 = ctx.createOscillator();
    w3.type = 'triangle';
    w3.frequency.value = 540;
    w3.start();
    g.whine3 = w3;

    const mix = ctx.createGain();
    mix.gain.value = 1;
    w1.connect(mix);
    w2.connect(mix);
    w3.connect(mix);
    mix.connect(whineGain);

    const muffler = ctx.createBiquadFilter();
    muffler.type = 'lowpass';
    muffler.frequency.value = 6000;
    muffler.Q.value = 0.5;
    g.muffler = muffler;

    whineGain.connect(muffler);

    const buzzFilt = ctx.createBiquadFilter();
    buzzFilt.type = 'bandpass';
    buzzFilt.frequency.value = 4000;
    buzzFilt.Q.value = 4;
    g.buzzFilt = buzzFilt;

    const buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.08;
    g.buzzGain = buzzGain;

    g.noiseSrc!.connect(buzzFilt);
    buzzFilt.connect(buzzGain);
    buzzGain.connect(muffler);

    // Gear mesh bed (climb / general)
    const meshFilt = ctx.createBiquadFilter();
    meshFilt.type = 'bandpass';
    meshFilt.frequency.value = 1200;
    meshFilt.Q.value = 2.2;
    g.meshFilt = meshFilt;
    const meshGain = ctx.createGain();
    meshGain.gain.value = 0;
    g.meshGain = meshGain;
    g.noiseSrc!.connect(meshFilt);
    meshFilt.connect(meshGain);
    meshGain.connect(muffler);

    // Regen howl layer (high thin whistle)
    const regenOsc = ctx.createOscillator();
    regenOsc.type = 'sine';
    regenOsc.frequency.value = 1400;
    regenOsc.start();
    g.regenOsc = regenOsc;
    const regenOsc2 = ctx.createOscillator();
    regenOsc2.type = 'triangle';
    regenOsc2.frequency.value = 2100;
    regenOsc2.detune.value = 9;
    regenOsc2.start();
    g.regenOsc2 = regenOsc2;
    const regenFilt = ctx.createBiquadFilter();
    regenFilt.type = 'bandpass';
    regenFilt.frequency.value = 1800;
    regenFilt.Q.value = 7;
    g.regenFilt = regenFilt;
    const regenGain = ctx.createGain();
    regenGain.gain.value = 0;
    g.regenGain = regenGain;
    regenOsc.connect(regenFilt);
    regenOsc2.connect(regenFilt);
    regenFilt.connect(regenGain);
    regenGain.connect(muffler);

    // Dense mid motor roar (dual-motor / body)
    const motorFilt = ctx.createBiquadFilter();
    motorFilt.type = 'lowpass';
    motorFilt.frequency.value = 900;
    motorFilt.Q.value = 0.7;
    g.motorFilt = motorFilt;
    const motorGain = ctx.createGain();
    motorGain.gain.value = topo === 'ev-dual-motor' ? 0.22 : 0.04;
    g.motorGain = motorGain;
    g.pinkSrc!.connect(motorFilt);
    motorFilt.connect(motorGain);

    if (topo === 'ev-dual-motor') {
      // Split L/R inverter beat
      const panL = ctx.createStereoPanner();
      panL.pan.value = -0.55;
      g.panL = panL;
      const panR = ctx.createStereoPanner();
      panR.pan.value = 0.55;
      g.panR = panR;

      const dualR = ctx.createOscillator();
      dualR.type = 'sine';
      dualR.frequency.value = 188;
      dualR.detune.value = 14;
      dualR.start();
      g.dualWhineR = dualR;
      const dualGainR = ctx.createGain();
      dualGainR.gain.value = 0.18;
      g.dualWhineGainR = dualGainR;
      dualR.connect(dualGainR);

      muffler.connect(panL);
      dualGainR.connect(panR);
      motorGain.connect(panL);
      motorGain.connect(panR);
      panL.connect(g.master);
      panR.connect(g.master);
    } else {
      const pan = ctx.createStereoPanner();
      pan.pan.value = 0;
      g.panL = pan;
      muffler.connect(pan);
      motorGain.connect(pan);
      pan.connect(g.master);
    }
  }


  private buildAerospace(g: GraphHandles): void {
    const ctx = this.context;

    // ——— Bus 1: Spool / compressor ———
    // Band-limited noise dominates; mild detuned BPF whine buried underneath.
    const spoolBus = ctx.createGain();
    spoolBus.gain.value = 1;
    g.spoolGain = spoolBus;

    const compressorFilt = ctx.createBiquadFilter();
    compressorFilt.type = 'bandpass';
    compressorFilt.frequency.value = 1800;
    compressorFilt.Q.value = 1.6;
    g.compressorFilt = compressorFilt;

    const compressorGain = ctx.createGain();
    compressorGain.gain.value = 0.18;
    g.compressorGain = compressorGain;

    g.noiseSrc!.connect(compressorFilt);
    compressorFilt.connect(compressorGain);
    compressorGain.connect(spoolBus);

    // Mild irregular whine (sine/triangle only — no saw/square identity)
    const intakeWhineFilt = ctx.createBiquadFilter();
    intakeWhineFilt.type = 'bandpass';
    intakeWhineFilt.frequency.value = 2100;
    intakeWhineFilt.Q.value = 6;
    g.intakeWhineFilt = intakeWhineFilt;

    const intakeWhineGain = ctx.createGain();
    intakeWhineGain.gain.value = 0.035;
    g.intakeWhineGain = intakeWhineGain;

    const whine1 = ctx.createOscillator();
    whine1.type = 'sine';
    whine1.frequency.value = 420;
    whine1.start();
    g.intakeWhineOsc = whine1;

    const whine2 = ctx.createOscillator();
    whine2.type = 'sine';
    whine2.frequency.value = 428;
    whine2.detune.value = 7;
    whine2.start();
    g.intakeWhineOsc2 = whine2;

    const whine3 = ctx.createOscillator();
    whine3.type = 'triangle';
    whine3.frequency.value = 845;
    whine3.detune.value = -11;
    whine3.start();
    g.intakeWhineOsc3 = whine3;

    const whineMix = ctx.createGain();
    whineMix.gain.value = 0.55;
    whine1.connect(whineMix);
    whine2.connect(whineMix);
    whine3.connect(whineMix);

    const flutter = ctx.createOscillator();
    flutter.type = 'sine';
    flutter.frequency.value = 2.4;
    flutter.start();
    g.spoolFlutter = flutter;
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.22;
    g.spoolFlutterDepth = flutterDepth;
    const whineAm = ctx.createGain();
    whineAm.gain.value = 0.7;
    flutter.connect(flutterDepth);
    flutterDepth.connect(whineAm.gain);
    whineMix.connect(whineAm);
    whineAm.connect(intakeWhineFilt);
    intakeWhineFilt.connect(intakeWhineGain);
    intakeWhineGain.connect(spoolBus);

    const buzzSawGain = ctx.createGain();
    buzzSawGain.gain.value = 0;
    g.buzzSawGain = buzzSawGain;
    const bs1 = ctx.createOscillator();
    bs1.type = 'sine';
    bs1.frequency.value = 980;
    bs1.start();
    g.buzzSaw1 = bs1;
    const bs2 = ctx.createOscillator();
    bs2.type = 'sine';
    bs2.frequency.value = 1470;
    bs2.detune.value = 5;
    bs2.start();
    g.buzzSaw2 = bs2;
    bs1.connect(buzzSawGain);
    bs2.connect(buzzSawGain);
    buzzSawGain.connect(spoolBus);

    // ——— Bus 2: Core ———
    const coreFilt = ctx.createBiquadFilter();
    coreFilt.type = 'lowpass';
    coreFilt.frequency.value = 1100;
    coreFilt.Q.value = 0.65;
    g.coreFilt = coreFilt;

    const coreFilt2 = ctx.createBiquadFilter();
    coreFilt2.type = 'bandpass';
    coreFilt2.frequency.value = 380;
    coreFilt2.Q.value = 0.9;
    g.coreFilt2 = coreFilt2;

    const coreGain = ctx.createGain();
    coreGain.gain.value = 0.28;
    g.coreGain = coreGain;

    const coreRoughLfo = ctx.createOscillator();
    coreRoughLfo.type = 'sine';
    coreRoughLfo.frequency.value = 1.7;
    coreRoughLfo.start();
    g.coreRoughLfo = coreRoughLfo;
    const coreRoughDepth = ctx.createGain();
    coreRoughDepth.gain.value = 0.12;
    g.coreRoughDepth = coreRoughDepth;
    const coreAm = ctx.createGain();
    coreAm.gain.value = 0.85;
    coreRoughLfo.connect(coreRoughDepth);
    coreRoughDepth.connect(coreAm.gain);

    g.pinkSrc!.connect(coreFilt);
    coreFilt.connect(coreFilt2);
    coreFilt2.connect(coreAm);
    coreAm.connect(coreGain);

    // ——— Bus 3: Exhaust / AB ———
    const jetRoarFilt = ctx.createBiquadFilter();
    jetRoarFilt.type = 'lowpass';
    jetRoarFilt.frequency.value = 420;
    jetRoarFilt.Q.value = 0.55;
    g.jetRoarFilt = jetRoarFilt;

    const jetRoarGain = ctx.createGain();
    jetRoarGain.gain.value = 0.22;
    g.jetRoarGain = jetRoarGain;

    g.pinkSrc!.connect(jetRoarFilt);
    jetRoarFilt.connect(jetRoarGain);

    const afterFilt = ctx.createBiquadFilter();
    afterFilt.type = 'bandpass';
    afterFilt.frequency.value = 900;
    afterFilt.Q.value = 0.8;
    g.afterFilt = afterFilt;

    const afterShaper = ctx.createWaveShaper();
    afterShaper.curve = makeShaper(0.35) as Float32Array<ArrayBuffer>;
    g.afterShaper = afterShaper;

    const afterGain = ctx.createGain();
    afterGain.gain.value = 0;
    g.afterGain = afterGain;

    g.noiseSrc!.connect(afterFilt);
    afterFilt.connect(afterShaper);
    afterShaper.connect(afterGain);

    const nozzleFilt = ctx.createBiquadFilter();
    nozzleFilt.type = 'highpass';
    nozzleFilt.frequency.value = 4500;
    nozzleFilt.Q.value = 0.7;
    g.nozzleFilt = nozzleFilt;

    const nozzleGain = ctx.createGain();
    nozzleGain.gain.value = 0;
    g.nozzleGain = nozzleGain;

    g.noiseSrc!.connect(nozzleFilt);
    nozzleFilt.connect(nozzleGain);

    // ——— Bus 4: Airframe ———
    const airframeFilt = ctx.createBiquadFilter();
    airframeFilt.type = 'lowpass';
    airframeFilt.frequency.value = 70;
    airframeFilt.Q.value = 0.8;
    g.airframeFilt = airframeFilt;

    const airframeGain = ctx.createGain();
    airframeGain.gain.value = 0.05;
    g.airframeGain = airframeGain;

    const airframeLfo = ctx.createOscillator();
    airframeLfo.type = 'sine';
    airframeLfo.frequency.value = 0.85;
    airframeLfo.start();
    g.airframeLfo = airframeLfo;
    const airframeAmDepth = ctx.createGain();
    airframeAmDepth.gain.value = 0.35;
    g.airframeAmDepth = airframeAmDepth;
    const airAm = ctx.createGain();
    airAm.gain.value = 0.7;
    airframeLfo.connect(airframeAmDepth);
    airframeAmDepth.connect(airAm.gain);

    g.pinkSrc!.connect(airframeFilt);
    airframeFilt.connect(airAm);
    airAm.connect(airframeGain);

    const sum = ctx.createGain();
    sum.gain.value = 1;
    spoolBus.connect(sum);
    coreGain.connect(sum);
    jetRoarGain.connect(sum);
    afterGain.connect(sum);
    nozzleGain.connect(sum);
    airframeGain.connect(sum);

    const panL = ctx.createStereoPanner();
    panL.pan.value = -0.22;
    g.panL = panL;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 0.22;
    g.panR = panR;

    const splitL = ctx.createGain();
    splitL.gain.value = 0.72;
    const splitR = ctx.createGain();
    splitR.gain.value = 0.72;
    sum.connect(splitL);
    sum.connect(splitR);
    splitL.connect(panL);
    splitR.connect(panR);
    panL.connect(g.master);
    panR.connect(g.master);
  }


  private buildScifi(g: GraphHandles): void {
    const ctx = this.context;

    // ═══════════════════════════════════════════════════════════════════
    // Ion Twin v2 — procedural from twin-ion-ref-analysis.md (no samples)
    // Buses: twin motors · formant howl · grit · ion · air · body
    // Continuous drive bed: motors never drop at cruise; howl is sustained
    // bellow (shallow phrase breath, not gated bursts). Surge = throttle spikes.
    // Anti-digital: no saw/square lead; layer leadership morphs with throttle
    // ═══════════════════════════════════════════════════════════════════

    // ── Twin motor bed (drive): dual irregular pulse+filtered-noise ~50–200 Hz ──
    const motorFiltL = ctx.createBiquadFilter();
    motorFiltL.type = 'lowpass';
    motorFiltL.frequency.value = 95;
    motorFiltL.Q.value = 0.85;
    g.motorFiltL = motorFiltL;

    const motorFiltR = ctx.createBiquadFilter();
    motorFiltR.type = 'lowpass';
    motorFiltR.frequency.value = 110;
    motorFiltR.Q.value = 0.85;
    g.motorFiltR = motorFiltR;

    // Soft BP pole near ~65 Hz (ref-B DNA) under each motor
    const motorBpL = ctx.createBiquadFilter();
    motorBpL.type = 'bandpass';
    motorBpL.frequency.value = 65;
    motorBpL.Q.value = 2.4;
    g.bodyFilt = motorBpL;

    const motorBpR = ctx.createBiquadFilter();
    motorBpR.type = 'bandpass';
    motorBpR.frequency.value = 72;
    motorBpR.Q.value = 2.2;

    const motorGainL = ctx.createGain();
    motorGainL.gain.value = 0.28;
    g.motorGainL = motorGainL;

    const motorGainR = ctx.createGain();
    motorGainR.gain.value = 0.26;
    g.motorGainR = motorGainR;

    // Quiet support carriers — triangle only (buried), never saw/square lead
    const carrierGain = ctx.createGain();
    carrierGain.gain.value = 0.06;
    g.carrierGain = carrierGain;

    const c1 = ctx.createOscillator();
    c1.type = 'triangle';
    c1.frequency.value = 58;
    c1.start();
    g.carrier1 = c1;

    const c2 = ctx.createOscillator();
    c2.type = 'triangle';
    c2.frequency.value = 64;
    c2.detune.value = -18;
    c2.start();
    g.carrier2 = c2;

    const c3 = ctx.createOscillator();
    c3.type = 'sine';
    c3.frequency.value = 92;
    c3.detune.value = 14;
    c3.start();
    g.carrier3 = c3;

    const softBite = ctx.createWaveShaper();
    softBite.curve = makeShaper(0.22) as Float32Array<ArrayBuffer>;
    c1.connect(softBite);
    c2.connect(softBite);
    c3.connect(softBite);
    softBite.connect(carrierGain);

    // Irregular pulse AM on motor noise beds (detuned twin beat)
    const motorPulseLfo = ctx.createOscillator();
    motorPulseLfo.type = 'sine';
    motorPulseLfo.frequency.value = 5.5;
    motorPulseLfo.start();
    g.motorPulseLfo = motorPulseLfo;
    g.pulseMod = motorPulseLfo;

    const motorPulseDepth = ctx.createGain();
    motorPulseDepth.gain.value = 0.12;
    g.motorPulseDepth = motorPulseDepth;
    g.pulseDepth = motorPulseDepth;
    motorPulseLfo.connect(motorPulseDepth);
    motorPulseDepth.connect(motorGainL.gain);

    const motorPulseLfo2 = ctx.createOscillator();
    motorPulseLfo2.type = 'sine';
    motorPulseLfo2.frequency.value = 6.8;
    motorPulseLfo2.start();
    g.motorPulseLfo2 = motorPulseLfo2;

    const motorPulseDepth2 = ctx.createGain();
    motorPulseDepth2.gain.value = 0.11;
    g.motorPulseDepth2 = motorPulseDepth2;
    motorPulseLfo2.connect(motorPulseDepth2);
    motorPulseDepth2.connect(motorGainR.gain);

    g.pinkSrc!.connect(motorFiltL);
    motorFiltL.connect(motorBpL);
    motorBpL.connect(motorGainL);

    g.pinkSrc!.connect(motorFiltR);
    motorFiltR.connect(motorBpR);
    motorBpR.connect(motorGainR);

    // Twin stereo offset (5–25 ms) — subtle, not chorus
    const twinDelay = ctx.createDelay(0.05);
    twinDelay.delayTime.value = 0.012;
    g.twinDelay = twinDelay;
    motorGainR.connect(twinDelay);

    const motorSum = ctx.createGain();
    motorSum.gain.value = 1;
    motorGainL.connect(motorSum);
    twinDelay.connect(motorSum);
    carrierGain.connect(motorSum);

    // Short cabin / body waveguide on motor bus only (B-like wetness)
    const motorBodyDelay = ctx.createDelay(0.08);
    motorBodyDelay.delayTime.value = 0.018;
    g.motorBodyDelay = motorBodyDelay;

    const motorBodyFb = ctx.createGain();
    motorBodyFb.gain.value = 0.28;
    g.motorBodyFb = motorBodyFb;

    const motorBodyMix = ctx.createGain();
    motorBodyMix.gain.value = 0.35;
    g.motorBodyMix = motorBodyMix;

    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.4;
    g.bodyGain = bodyGain;

    motorSum.connect(motorBodyDelay);
    motorBodyDelay.connect(motorBodyFb);
    motorBodyFb.connect(motorBodyDelay);
    motorBodyDelay.connect(motorBodyMix);
    motorBodyMix.connect(bodyGain);
    motorSum.connect(bodyGain);

    // ── Formant howl stack α: ~400 / 700 / 900 / 1300 Hz ──
    const howlFilt = ctx.createBiquadFilter();
    howlFilt.type = 'bandpass';
    howlFilt.frequency.value = 400;
    howlFilt.Q.value = 6.5;
    g.howlFilt = howlFilt;

    const howlFilt2 = ctx.createBiquadFilter();
    howlFilt2.type = 'bandpass';
    howlFilt2.frequency.value = 700;
    howlFilt2.Q.value = 6.0;
    g.howlFilt2 = howlFilt2;

    const howlFilt3 = ctx.createBiquadFilter();
    howlFilt3.type = 'bandpass';
    howlFilt3.frequency.value = 900;
    howlFilt3.Q.value = 5.5;
    g.howlFilt3 = howlFilt3;

    const howlFilt4 = ctx.createBiquadFilter();
    howlFilt4.type = 'bandpass';
    howlFilt4.frequency.value = 1300;
    howlFilt4.Q.value = 5.0;
    g.howlFilt4 = howlFilt4;

    const formantGain = ctx.createGain();
    formantGain.gain.value = 1.15;
    g.formantGain = formantGain;

    g.pinkSrc!.connect(howlFilt);
    g.pinkSrc!.connect(howlFilt2);
    g.pinkSrc!.connect(howlFilt3);
    g.noiseSrc!.connect(howlFilt4);
    howlFilt.connect(formantGain);
    howlFilt2.connect(formantGain);
    howlFilt3.connect(formantGain);
    howlFilt4.connect(formantGain);

    // Soft grit under howl — filtered noise + mild waveshape (NOT saw lead)
    const howlGritFilt = ctx.createBiquadFilter();
    howlGritFilt.type = 'bandpass';
    howlGritFilt.frequency.value = 3200;
    howlGritFilt.Q.value = 1.1;
    g.howlGritFilt = howlGritFilt;

    const howlOscGain = ctx.createGain();
    howlOscGain.gain.value = 0.08;
    g.howlOscGain = howlOscGain;

    const gritShaper = ctx.createWaveShaper();
    gritShaper.curve = makeShaper(0.55) as Float32Array<ArrayBuffer>;
    g.noiseSrc!.connect(howlGritFilt);
    howlGritFilt.connect(gritShaper);
    gritShaper.connect(howlOscGain);
    howlOscGain.connect(formantGain);

    // Keep howlOsc handles as silent placeholders for teardown safety (unused leads)
    const howlOsc = ctx.createOscillator();
    howlOsc.type = 'sine';
    howlOsc.frequency.value = 190;
    howlOsc.start();
    g.howlOsc = howlOsc;
    const howlOscSilent = ctx.createGain();
    howlOscSilent.gain.value = 0;
    howlOsc.connect(howlOscSilent);

    const howlOsc2 = ctx.createOscillator();
    howlOsc2.type = 'sine';
    howlOsc2.frequency.value = 285;
    howlOsc2.start();
    g.howlOsc2 = howlOsc2;
    howlOsc2.connect(howlOscSilent);

    const howlShaper = ctx.createWaveShaper();
    howlShaper.curve = makeShaper(0.58) as Float32Array<ArrayBuffer>;
    g.howlShaper = howlShaper;

    const howlGain = ctx.createGain();
    howlGain.gain.value = 0;
    g.howlGain = howlGain;
    formantGain.connect(howlShaper);
    howlShaper.connect(howlGain);

    // Phrase AM — shallow breath on the sustained bellow (never gate/chop)
    const howlPhraseLfo = ctx.createOscillator();
    howlPhraseLfo.type = 'sine';
    howlPhraseLfo.frequency.value = 0.45;
    howlPhraseLfo.start();
    g.howlPhraseLfo = howlPhraseLfo;

    const howlPhraseDepth = ctx.createGain();
    howlPhraseDepth.gain.value = 0;
    g.howlPhraseDepth = howlPhraseDepth;
    howlPhraseLfo.connect(howlPhraseDepth);
    howlPhraseDepth.connect(howlGain.gain);

    // ── Scream burst stack β: ~470 / 1270 / 1480 Hz (ref-C aggression accent) ──
    const screamFilt = ctx.createBiquadFilter();
    screamFilt.type = 'bandpass';
    screamFilt.frequency.value = 470;
    screamFilt.Q.value = 7.0;
    g.screamFilt = screamFilt;

    const screamFilt2 = ctx.createBiquadFilter();
    screamFilt2.type = 'bandpass';
    screamFilt2.frequency.value = 1270;
    screamFilt2.Q.value = 6.5;
    g.screamFilt2 = screamFilt2;

    const screamFilt3 = ctx.createBiquadFilter();
    screamFilt3.type = 'bandpass';
    screamFilt3.frequency.value = 1480;
    screamFilt3.Q.value = 5.5;
    g.screamFilt3 = screamFilt3;
    const screamShaper = ctx.createWaveShaper();
    screamShaper.curve = makeShaper(0.62) as Float32Array<ArrayBuffer>;
    g.screamShaper = screamShaper;
    const screamGain = ctx.createGain();
    screamGain.gain.value = 0;
    g.screamGain = screamGain;
    g.pinkSrc!.connect(screamFilt);
    g.noiseSrc!.connect(screamFilt2);
    g.noiseSrc!.connect(screamFilt3);
    screamFilt.connect(screamShaper);
    screamFilt2.connect(screamShaper);
    screamFilt3.connect(screamShaper);
    screamShaper.connect(screamGain);

    // ── Shared grit bus (2–5 kHz × load) ──
    const gritFilt = ctx.createBiquadFilter();
    gritFilt.type = 'bandpass';
    gritFilt.frequency.value = 3400;
    gritFilt.Q.value = 0.9;
    g.gritFilt = gritFilt;

    const gritGain = ctx.createGain();
    gritGain.gain.value = 0;
    g.gritGain = gritGain;
    g.noiseSrc!.connect(gritFilt);
    gritFilt.connect(gritGain);

    // ── Air / wet-road swoosh (opens with rpm; dominates high) ──
    const wetHissFilt = ctx.createBiquadFilter();
    wetHissFilt.type = 'highpass';
    wetHissFilt.frequency.value = 1200;
    wetHissFilt.Q.value = 0.55;
    g.wetHissFilt = wetHissFilt;

    const wetHissFilt2 = ctx.createBiquadFilter();
    wetHissFilt2.type = 'bandpass';
    wetHissFilt2.frequency.value = 3800;
    wetHissFilt2.Q.value = 0.85;
    g.wetHissFilt2 = wetHissFilt2;

    const wetHissGain = ctx.createGain();
    wetHissGain.gain.value = 0;
    g.wetHissGain = wetHissGain;

    const wetBodyFilt = ctx.createBiquadFilter();
    wetBodyFilt.type = 'bandpass';
    wetBodyFilt.frequency.value = 1400;
    wetBodyFilt.Q.value = 0.7;
    g.wetBodyFilt = wetBodyFilt;

    const wetBodyGain = ctx.createGain();
    wetBodyGain.gain.value = 0;
    g.wetBodyGain = wetBodyGain;

    const wetAmLfo = ctx.createOscillator();
    wetAmLfo.type = 'sine';
    wetAmLfo.frequency.value = 2.8;
    wetAmLfo.start();
    g.wetAmLfo = wetAmLfo;

    const wetAmDepth = ctx.createGain();
    wetAmDepth.gain.value = 0.15;
    g.wetAmDepth = wetAmDepth;
    wetAmLfo.connect(wetAmDepth);
    wetAmDepth.connect(wetHissGain.gain);

    const wetPan = ctx.createStereoPanner();
    wetPan.pan.value = 0;
    g.wetPan = wetPan;

    const wetFlybyGain = ctx.createGain();
    wetFlybyGain.gain.value = 0;
    g.wetFlybyGain = wetFlybyGain;

    g.noiseSrc!.connect(wetHissFilt);
    wetHissFilt.connect(wetHissFilt2);
    wetHissFilt2.connect(wetHissGain);
    wetHissGain.connect(wetPan);

    g.pinkSrc!.connect(wetBodyFilt);
    wetBodyFilt.connect(wetBodyGain);
    wetBodyGain.connect(wetPan);

    g.noiseSrc!.connect(wetFlybyGain);
    wetFlybyGain.connect(wetPan);

    // Ion spark / discharge (sparse, never solo lead)
    const afterFilt = ctx.createBiquadFilter();
    afterFilt.type = 'highpass';
    afterFilt.frequency.value = 2800;

    const afterGain = ctx.createGain();
    afterGain.gain.value = 0;
    g.afterGain = afterGain;
    g.noiseSrc!.connect(afterFilt);
    afterFilt.connect(afterGain);

    // Soft ion hum (idle support)
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 55;
    humOsc.start();
    g.humOsc = humOsc;

    const humGain = ctx.createGain();
    humGain.gain.value = 0.14;
    g.humGain = humGain;
    humOsc.connect(humGain);

    // Wet/dry: dry = direct buses; wet = short body early reflections
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.82;
    g.dryGain = dryGain;

    const wetBusGain = ctx.createGain();
    wetBusGain.gain.value = 0.18;
    g.wetBusGain = wetBusGain;

    const delay = ctx.createDelay(0.12);
    delay.delayTime.value = 0.022;
    g.delay = delay;

    const delayGain = ctx.createGain();
    delayGain.gain.value = 0.12;
    g.delayGain = delayGain;

    const sum = ctx.createGain();
    sum.gain.value = 1;
    bodyGain.connect(sum);
    howlGain.connect(sum);
    screamGain.connect(sum);
    gritGain.connect(sum);
    afterGain.connect(sum);
    humGain.connect(sum);
    wetPan.connect(sum);

    sum.connect(dryGain);
    sum.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(wetBusGain);

    const pan = ctx.createStereoPanner();
    pan.pan.value = 0;
    g.panL = pan;
    dryGain.connect(pan);
    wetBusGain.connect(pan);
    pan.connect(g.master);
  }

  private teardownGraph(): void {
    this.scifiFlyby = 0;
    this.scifiPrevRpm = 0;
    this.scifiPrevThr = 0;
    this.ionSpoolLag = 0;
    this.ionSurge = 0;
    const stopOsc = (o?: OscillatorNode | AudioBufferSourceNode) => {
      try {
        o?.stop();
        o?.disconnect();
      } catch {
        /* ignore */
      }
    };
    const g = this.g;
    stopOsc(g.noiseSrc);
    stopOsc(g.pinkSrc);
    stopOsc(g.fund);
    stopOsc(g.fund2);
    stopOsc(g.fund3);
    stopOsc(g.sub);
    stopOsc(g.pulseLfo);
    stopOsc(g.unevenLfo);
    stopOsc(g.whine1);
    stopOsc(g.whine2);
    stopOsc(g.whine3);
    stopOsc(g.carrier1);
    stopOsc(g.carrier2);
    stopOsc(g.carrier3);
    stopOsc(g.pulseMod);
    stopOsc(g.motorPulseLfo);
    stopOsc(g.motorPulseLfo2);
    stopOsc(g.howlOsc);
    stopOsc(g.howlOsc2);
    stopOsc(g.howlPhraseLfo);
    stopOsc(g.humOsc);
    stopOsc(g.wetAmLfo);
    stopOsc(g.intakeWhineOsc);
    stopOsc(g.intakeWhineOsc2);
    stopOsc(g.intakeWhineOsc3);
    stopOsc(g.spoolFlutter);
    stopOsc(g.buzzSaw1);
    stopOsc(g.buzzSaw2);
    stopOsc(g.coreRoughLfo);
    stopOsc(g.airframeLfo);
    stopOsc(g.regenOsc);
    stopOsc(g.regenOsc2);
    stopOsc(g.dualWhineR);
    try {
      g.npBus?.dispose();
    } catch {
      /* ignore */
    }
    try {
      g.helmVoice?.dispose();
    } catch {
      /* ignore */
    }
    try {
      g.pulseNode?.disconnect();
      g.pulseGainOut?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      g.master.disconnect();
      g.limiter.disconnect();
    } catch {
      /* ignore */
    }
  }

  /* ---------- param / driving apply ---------- */

  private setWorkletParam(name: string, value: number, tc: number): void {
    const node = this.g.pulseNode;
    if (!node) return;
    const param = node.parameters.get(name);
    if (!param) return;
    smooth(param, value, tc, this.context);
  }

  private applyAllParams(): void {
    const p = this.params;
    const g = this.g;
    const ctx = this.context;

    smooth(g.master.gain, clamp(Number(p.masterGain ?? 0.7)) * 0.9, 0.05, ctx);

    const ceiling = clamp(Number(p.limiterCeiling ?? 0.95));
    g.limiter.threshold.value = lerp(-18, -3, ceiling);

    if (this.patchMeta.kind === 'ice' && g.shaper) {
      // Keep soft — organic fallback must not grow digital bite with roughness
      g.shaper.curve = makeShaper(0.15 + Number(p.roughness ?? 0.35) * 0.28) as Float32Array<ArrayBuffer>;
    }

    if (g.iceMode === 'worklet') {
      this.setWorkletParam('pulseWidth', Number(p.pulseWidth ?? 0.35), 0.05);
      this.setWorkletParam('pulseJitter', Number(p.pulseJitter ?? 0.08), 0.05);
      this.setWorkletParam('roughness', Number(p.roughness ?? 0.4), 0.05);
      this.setWorkletParam('growl', Number(p.growl ?? 0.6), 0.05);
      this.setWorkletParam('exhaustLength', Number(p.exhaustLength ?? 0.45), 0.05);
      this.setWorkletParam('exhaustFeedback', Number(p.exhaustFeedback ?? 0.72), 0.05);
      this.setWorkletParam('mufflerMix', Number(p.muffling ?? 0.3), 0.05);
      this.setWorkletParam('intake', Number(p.intake ?? 0.45), 0.05);
      this.setWorkletParam('crackle', Number(p.crackle ?? 0.35), 0.05);
      this.setWorkletParam('cylinders', Number(p.cylinders ?? 8), 0.05);
      this.setWorkletParam('masterGain', clamp(Number(p.masterGain ?? 0.7)), 0.05);
      this.setWorkletParam('misfire', Number(p.misfire ?? 0), 0.05);
      this.setWorkletParam('firingFamily', Number(p.firingFamily ?? 0), 0.05);
      this.setWorkletParam('chambersPerRotor', Number(p.chambersPerRotor ?? 3), 0.05);
      this.setWorkletParam('rotors', Number(p.rotors ?? 1), 0.05);
      {
        if (p.firingMask != null) this.engineState.setFiringMask(Number(p.firingMask));
        if (p.dropCyl != null) this.engineState.dropCylinder(Number(p.dropCyl));
        this.params.firingMask = this.engineState.firingMask;
        this.setWorkletParam('firingMask', this.engineState.firingMask, 0.05);
      }
    }
  }

  private applyDriving(immediate: boolean): void {
    const d = this.driving;
    const p = this.params;
    const g = this.g;
    const ctx = this.context;
    const tc = immediate ? 0.01 : 0.06;
    const kind = this.patchMeta.kind;

    // Prefer Frontend rpmNorm (GPS mph + Rev → simulation) when present.
    // Fallback: dual map speed→rpm curve, throttle fills parked/low-speed revs
    // without the old speed≥0.04 cliff that collapsed Hold-to-rev morph.
    let rpmNorm: number;
    if (d.rpmNorm !== undefined && Number.isFinite(d.rpmNorm)) {
      rpmNorm = clamp(d.rpmNorm);
    } else {
      const curve = Number(p.rpmCurve ?? 0.55);
      const fromSpeed = rpmCurve(d.speed, curve);
      const fromThr = d.throttle * (d.speed < 0.04 ? 0.55 : 0.35);
      rpmNorm = clamp(Math.max(fromSpeed, fromThr) + (d.speed >= 0.04 ? d.throttle * 0.12 : 0));
    }

    // Night Pursuit: one continuous drive model. Frontend rpm/rpmNorm still win; without
    // them a 4-speed automatic + converter maps speed/throttle → rpm (glides, no cliffs).
    let dIce: DrivingInput = d;
    if (kind === 'ice' && isNightPursuitTopology(this.patchMeta.topology)) {
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt =
        immediate || !this.npLastMs ? 1 / 60 : Math.min(0.25, Math.max(0.004, (nowMs - this.npLastMs) / 1000));
      this.npLastMs = nowMs;
      const nd = stepNightPursuitDrive(this.npDriveState, d, dt, p);
      this.npDrive = nd;
      if (nd.modelled) {
        rpmNorm = nd.rpmNorm;
        dIce = { ...d, rpm: nd.rpm, rpmNorm: nd.rpmNorm };
      }
    } else {
      this.npDrive = null;
    }

    const loadFeel = clamp(d.throttle * 0.7 + Math.abs(d.load ?? 0) * 0.3 + d.speed * 0.15);
    this.hud.loadFeel = loadFeel;
    this.hud.rpmNorm = rpmNorm;

    // Living drive: throttle/load hysteresis + micro-jitter (not 1:1 with slider)
    this.stepLivingDrive(immediate, tc, kind);

    if (g.panL && kind !== 'aerospace' && this.patchMeta.topology !== 'ev-dual-motor') {
      const width = Number(p.stereoWidth ?? 0.35);
      smooth(g.panL.pan, this.loadLag * width * 0.6, tc, ctx);
    }

    if (g.helmVoice) {
      this.applyStellarHelmDriving(d, immediate);
    } else if (kind === 'ice') {
      this.applyIceDriving(rpmNorm, dIce, tc);
      if (g.npBus && this.npDrive) g.npBus.update(p, this.npDrive, this.throttleLag, tc);
    } else if (kind === 'ev-whine') {
      this.applyEvDriving(rpmNorm, d, tc);
    } else if (kind === 'aerospace') {
      this.applyAerospaceDriving(rpmNorm, d, tc);
    } else {
      this.applyScifiDriving(rpmNorm, d, tc);
    }
    this.hud.driveMood = this.driveMood;
    this.updateLockStage(rpmNorm);
  }

  /**
   * Stellar Helm: one continuous drive step (speed glide, throttle warmth, reverse, boost) →
   * voice. Frontend rpm / rpmNorm are not used, so gear simulations can't put cliffs in the hum.
   */
  private applyStellarHelmDriving(d: DrivingInput, immediate: boolean): void {
    const v = this.g.helmVoice;
    if (!v) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt =
      immediate || !this.helmLastMs ? 1 / 60 : Math.min(1, Math.max(0.004, (nowMs - this.helmLastMs) / 1000));
    this.helmLastMs = nowMs;
    const drv = stepStellarHelmDrive(this.helmState, d, dt, this.params);
    v.update(this.params, drv, immediate ? 0.02 : 0.08);
    this.hud.rpmNorm = drv.x;
    this.hud.fundamentalHz = v.coreHz();
    if (drv.rev > 0.5) this.driveMood = 'reverse';
    else if (drv.speed < 0.04 && drv.thr < 0.12) this.driveMood = 'idle';
    else if (drv.thr > 0.7 || drv.boost > 0.5) this.driveMood = 'pull';
    else this.driveMood = 'cruise';
  }

  private supportsLockLadder(): boolean {
    return packSupportsLockLadder(this.patchMeta.kind, this.patchMeta.topology, this._id);
  }

  private updateLockStage(rpmNorm: number): void {
    if (!this.supportsLockLadder()) {
      if (this.lockStage !== 'none') {
        this.lockStage = 'none';
        this.hud.lockStage = 'none';
        try {
          this.onLockStageChange?.('none');
        } catch {
          /* ignore cue failures */
        }
      } else {
        this.hud.lockStage = 'none';
      }
      return;
    }
    const prev = this.lockStage;
    const next = nextLockStage(rpmNorm, prev, 0.04);
    this.lockStage = next;
    this.hud.lockStage = next;
    if (next === prev) return;
    try {
      this.onLockStageChange?.(next);
    } catch {
      /* ignore cue failures */
    }
    // Play original procedural chirp only on transition *into* lock (not kill / identified).
    if (next === 'lock' && prev !== 'lock' && this.lockSfxEnabled && this.started && !this.disposed) {
      this.playLockChirp();
    }
  }

  /**
   * Original two-tone confirm + filtered noise tick through output.
   * Not Star Wars samples — short procedural blip for TARGET LOCK engage.
   */
  private playLockChirp(): void {
    if (this.disposed) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    try {
      // Two-tone ascending confirm (triangle, soft)
      const tones: Array<{ hz: number; t: number; dur: number; peak: number }> = [
        { hz: 740, t: 0.0, dur: 0.055, peak: 0.14 },
        { hz: 1110, t: 0.052, dur: 0.07, peak: 0.12 },
      ];
      for (const tone of tones) {
        const t0 = now + tone.t;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = tone.hz;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = tone.hz;
        filt.Q.value = 4.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(tone.peak, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.output);
        osc.start(t0);
        osc.stop(t0 + tone.dur + 0.02);
        osc.onended = () => {
          try {
            osc.disconnect();
            filt.disconnect();
            g.disconnect();
          } catch {
            /* ignore */
          }
        };
      }
      // Short noise tick
      const nt = now + 0.02;
      const noise = ctx.createBufferSource();
      noise.buffer = this.whiteBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 2400;
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, nt);
      ng.gain.exponentialRampToValueAtTime(0.09, nt + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, nt + 0.035);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(this.output);
      noise.start(nt);
      noise.stop(nt + 0.045);
      noise.onended = () => {
        try {
          noise.disconnect();
          bp.disconnect();
          ng.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* never block drive path */
    }
  }

  /**
   * Short procedural MANUAL upshift bark: noise burst + dull knock (~80–150ms).
   * Not a whole-stack pitch jump. ICE/aerospace full; EV quieter; scifi skipped.
   */
  private playUpshiftBark(): void {
    if (this.disposed) return;
    const kind = this.patchMeta.kind;
    if (kind === 'scifi') return;
    if (this.g.helmVoice) return; // Stellar Helm has no gearbox to bark

    let scale = 1;
    if (kind === 'ev-whine') scale = 0.32;
    else if (kind === 'aerospace') scale = 0.8;
    // ice → 1

    const ctx = this.context;
    const now = ctx.currentTime;
    const dur = 0.11; // ~110ms within 80–150ms
    try {
      // Dull mechanical knock (triangle, low)
      const knock = ctx.createOscillator();
      knock.type = 'triangle';
      knock.frequency.setValueAtTime(108, now);
      knock.frequency.exponentialRampToValueAtTime(62, now + dur * 0.85);
      const knockLp = ctx.createBiquadFilter();
      knockLp.type = 'lowpass';
      knockLp.frequency.value = 420;
      knockLp.Q.value = 0.9;
      const knockG = ctx.createGain();
      const knockPeak = 0.22 * scale;
      knockG.gain.setValueAtTime(0.0001, now);
      knockG.gain.exponentialRampToValueAtTime(knockPeak, now + 0.006);
      knockG.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      knock.connect(knockLp);
      knockLp.connect(knockG);
      knockG.connect(this.output);
      knock.start(now);
      knock.stop(now + dur + 0.02);
      knock.onended = () => {
        try {
          knock.disconnect();
          knockLp.disconnect();
          knockG.disconnect();
        } catch {
          /* ignore */
        }
      };

      // Brief mid noise burst (clutch/dog engagement grit)
      const noise = ctx.createBufferSource();
      noise.buffer = this.whiteBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 780;
      bp.Q.value = 1.4;
      const ng = ctx.createGain();
      const noisePeak = 0.16 * scale;
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(noisePeak, now + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(this.output);
      noise.start(now);
      noise.stop(now + 0.1);
      noise.onended = () => {
        try {
          noise.disconnect();
          bp.disconnect();
          ng.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* never block drive path */
    }
  }

  /** One-pole lag + random-walk jitter so character breathes. */
  private stepLivingDrive(immediate: boolean, tc: number, kind: Kind): void {
    const d = this.driving;
    const hTc =
      kind === 'aerospace' ? 0.2 : kind === 'ev-whine' ? 0.11 : 0.15;
    if (immediate || tc <= 0.015) {
      this.throttleLag = d.throttle;
      this.loadLag = d.load ?? 0;
      this.liveJit = { filt: 0, gain: 0, pitch: 0 };
    } else {
      const a = 1 - Math.exp(-Math.max(0.012, tc) / hTc);
      this.throttleLag += (d.throttle - this.throttleLag) * a;
      this.loadLag += ((d.load ?? 0) - this.loadLag) * a;
      const walk = (v: number, amt: number) => v * 0.94 + (Math.random() * 2 - 1) * amt;
      this.liveJit.filt = walk(this.liveJit.filt, 0.01);
      this.liveJit.gain = walk(this.liveJit.gain, 0.008);
      this.liveJit.pitch = walk(this.liveJit.pitch, 0.006);
    }
  }

  private applyIceDriving(rpmNorm: number, d: DrivingInput, tc: number): void {
    const p = this.params;
    const g = this.g;
    const ctx = this.context;

    const cyl = Number(p.cylinders ?? 8);
    const band = this.idleBand;
    // Prefs idle RPM → firing fundamental (N·rpm/120); redline stays pack param
    const idle = iceFiringHzFromRpm(band.rpmMin, cyl);
    const idleMax = iceFiringHzFromRpm(band.rpmMax, cyl);
    const red = Number(p.rpmRedline ?? 240);
    let fund = lerp(idle, red, rpmNorm);
    // True idle: living jitter fills [idleRpmMin, idleRpmMax] (max = ceiling)
    const gate = idleGate(d.speed, d.throttle, rpmNorm);
    if (gate > 0.01) {
      const jit = idleJitter01(this.liveJit.pitch);
      const bandFund = idle + (idleMax - idle) * jit;
      fund = lerp(fund, Math.min(bandFund, idleMax), gate);
    }
    if (d.reverse) fund *= 0.92;
    this.hud.fundamentalHz = fund;

    // fund ≈ aggregate firing Hz ≈ N*rpm/120 → rpm = fund*120/N
    const rpm = clamp(fund * (120 / Math.max(4, cyl)), 200, 9000);

    const thr = this.throttleLag;
    const thrRaw = d.throttle;
    const loadL = this.loadLag;

    if (g.iceMode === 'worklet' && g.pulseNode) {
      // Hysteresis on throttle/load; bridge owns manifold/exhaust lags + firingMask.
      // At true idle, band already carries living jitter — clamp to idleRpmMax ceiling.
      const baseRpm = d.rpm != null && Number.isFinite(d.rpm) ? d.rpm : rpm;
      let rpmOut = baseRpm * (1 + this.liveJit.pitch * 0.012);
      const topo = this.patchMeta.topology;
      const nightPursuit = isNightPursuitTopology(topo);
      if (gate > 0.5) {
        // Night Pursuit idles low in the Dynamics band (deep lope, not a fast idle)
        const top = nightPursuit
          ? band.rpmMin + (band.rpmMax - band.rpmMin) * 0.3
          : band.rpmMax;
        rpmOut = Math.min(top, Math.max(band.rpmMin * 0.98, rpmOut));
      }
      const famDefault =
        topo === 'v8-rumble' || nightPursuit
          ? 1
          : topo === 'i6-silk' || topo === 'i4-zip'
            ? 3
            : topo === 'rotary-hum'
              ? 4
              : 0;
      const fam = Number(p.firingFamily ?? famDefault);
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = Math.max(
        0.008,
        Math.min(0.25, this.lastEngineStateMs ? (now - this.lastEngineStateMs) / 1000 : 1 / 60),
      );
      this.lastEngineStateMs = now;

      // Strip revforge- prefix so ICE_PACK_SCHEDULES keys match
      const packId = String(this.patchMeta.id ?? this._id ?? '');
      const jitPhys =
        p.pulseJitter != null
          ? workletJitterToPhysics(Number(p.pulseJitter))
          : undefined;

      this.engineState.tick(
        dt,
        { speed: d.speed, throttle: thr, load: loadL, rpmHint: rpmOut },
        {
          packId,
          cylinders: cyl,
          firingFamily: fam,
          firingMask: p.firingMask != null ? Number(p.firingMask) : undefined,
          dropCyl: p.dropCyl != null ? Number(p.dropCyl) : undefined,
          misfireAmount: Number(p.misfire ?? 0),
          pulseJitter: jitPhys,
          tauMan: p.tauManifold != null ? Number(p.tauManifold) : undefined,
          tauExhaust: p.tauExhaust != null ? Number(p.tauExhaust) : undefined,
          collectorDelayMs:
            p.collectorDelayMs != null ? Number(p.collectorDelayMs) : undefined,
          bankOffsetDeg: p.bankOffsetDeg != null ? Number(p.bankOffsetDeg) : undefined,
          chambersPerRotor:
            p.chambersPerRotor != null ? Number(p.chambersPerRotor) : undefined,
          rotors: p.rotors != null ? Number(p.rotors) : undefined,
        },
      );
      const wp = this.engineState.toWorkletParams();
      this.params.firingMask = wp.firingMask;

      this.setWorkletParam('rpm', wp.rpm, tc);
      this.setWorkletParam('throttle', wp.throttle, tc);
      this.setWorkletParam('load', wp.load, tc);
      this.setWorkletParam('cylinders', wp.cylinders, tc);
      this.setWorkletParam('firingFamily', wp.firingFamily || fam, tc);
      this.setWorkletParam(
        'chambersPerRotor',
        Number(wp.chambersPerRotor ?? p.chambersPerRotor ?? 3),
        tc,
      );
      this.setWorkletParam('rotors', Number(wp.rotors ?? p.rotors ?? 1), tc);
      this.setWorkletParam('misfire', wp.misfire, tc);
      this.setWorkletParam('firingMask', wp.firingMask, tc);
      // Dual-collector L/R burble delay (ms) — pack / bridge owned
      this.setWorkletParam(
        'collectorDelayMs',
        Math.max(0.5, Math.min(3, Number(wp.collectorDelayMs ?? p.collectorDelayMs ?? 1))),
        tc,
      );
      this.setWorkletParam('pulseWidth', Number(p.pulseWidth ?? 0.35), tc);
      this.setWorkletParam(
        'pulseJitter',
        Math.min(
          0.5,
          (jitPhys != null ? wp.pulseJitter : Number(p.pulseJitter ?? 0.08)) +
            0.02 +
            Math.abs(this.liveJit.pitch) * 0.08,
        ),
        tc,
      );
      this.setWorkletParam('roughness', Number(p.roughness ?? 0.4), tc);
      this.setWorkletParam(
        'growl',
        Number(p.growl ?? 0.6) * (0.7 + Number(p.exhaust ?? 0.5) * 0.4) * wp.growlScaleHint,
        tc,
      );
      this.setWorkletParam('exhaustLength', Number(p.exhaustLength ?? 0.45), tc);
      this.setWorkletParam(
        'exhaustFeedback',
        Number(p.exhaustFeedback ?? 0.72) * (0.85 + (1 - Number(p.muffling ?? 0.3)) * 0.15),
        tc,
      );
      const muffBase = Number(p.muffling ?? 0.3);
      this.setWorkletParam(
        'mufflerMix',
        clamp(muffBase * (0.55 + 0.45 * wp.mufflerMixHint), 0, 1),
        tc,
      );
      // Throttle/load → intake timbre (manifoldNorm), not pitch
      this.setWorkletParam(
        'intake',
        clamp(
          Number(p.intake ?? 0.45) * (0.45 + 0.55 * Math.max(wp.intakeScaleHint, thr)),
          0,
          1,
        ),
        tc,
      );
      this.setWorkletParam('crackle', Number(p.crackle ?? 0.35), tc);
      const presenceBoost = 0.75 + Number(p.presence ?? 0.45) * 0.4;
      this.setWorkletParam('masterGain', clamp(Number(p.masterGain ?? 0.7) * presenceBoost), tc);
      if (nightPursuit && this.npDrive) {
        // Cam lope / dual exhaust / overrun burble opt-ins + load-rich seasoning (overrides)
        const t = nightPursuitWorkletTargets(p, this.npDrive, thr, {
          growl: Number(p.growl ?? 0.6) * (0.7 + Number(p.exhaust ?? 0.5) * 0.4) * wp.growlScaleHint,
          exhaustFeedback:
            Number(p.exhaustFeedback ?? 0.72) * (0.85 + (1 - Number(p.muffling ?? 0.3)) * 0.15),
          mufflerMix: clamp(muffBase * (0.55 + 0.45 * wp.mufflerMixHint), 0, 1),
          intake: clamp(
            Number(p.intake ?? 0.45) * (0.45 + 0.55 * Math.max(wp.intakeScaleHint, thr)),
            0,
            1,
          ),
        });
        this.setWorkletParam('camLope', t.camLope, tc);
        this.setWorkletParam('bankSplit', t.bankSplit, tc);
        this.setWorkletParam('overrun', t.overrun, tc);
        this.setWorkletParam('overrunBurble', t.overrunBurble, tc);
        this.setWorkletParam('dcGuard', t.dcGuard, tc);
        this.setWorkletParam('growl', t.growl, tc);
        this.setWorkletParam('intake', t.intake, tc);
        this.setWorkletParam('mufflerMix', t.mufflerMix, tc);
        this.setWorkletParam('exhaustFeedback', t.exhaustFeedback, tc);
        this.setWorkletParam('collectorDelayMs', t.collectorDelayMs, tc);
      }
      if (d.speed < 0.04 && thrRaw < 0.12) this.driveMood = 'idle';
      else if (d.speed < 0.04) this.driveMood = 'lope';
      else if (thrRaw > 0.7) this.driveMood = 'pull';
      else this.driveMood = 'cruise';
      this.prevThrottle = thrRaw;
      return;
    }

    // Oscillator fallback: noise + soft pulse imitation (no triple-saw lead)
    const firing = (fund / 60) * (cyl / 2);

    if (g.fund2) smooth(g.fund2.frequency, fund * 0.5 * (1 + this.liveJit.pitch * 0.008), tc, ctx);
    if (g.sub) smooth(g.sub.frequency, fund * 0.5, tc, ctx);
    if (g.pulseLfo) smooth(g.pulseLfo.frequency, clamp(firing, 2, 48), tc, ctx);
    if (g.unevenLfo) smooth(g.unevenLfo.frequency, clamp(firing * 0.5, 1.0, 18), tc, ctx);

    const growl = Number(p.growl ?? 0.55);
    const presence = Number(p.presence ?? 0.45);
    const muffling = Number(p.muffling ?? 0.3);
    const intake = Number(p.intake ?? 0.4);
    const exhaust = Number(p.exhaust ?? 0.5);
    const ign = Number(p.ignitionNoise ?? 0.25);
    const rough = Number(p.roughness ?? 0.35);
    const parked = d.speed < 0.04;
    // thr/load already lagged above for worklet; reuse
    const fj = this.liveJit.filt;
    const gj = this.liveJit.gain;

    if (g.fund) {
      // Micro pitch wander
      smooth(g.fund.frequency, fund * (1 + this.liveJit.pitch * 0.01), tc, ctx);
    }

    if (g.fundGain) {
      const base =
        0.08 + growl * 0.1 + rpmNorm * 0.08 + thr * 0.12 + (parked ? 0.04 + thr * 0.08 : 0);
      smooth(g.fundGain.gain, base, tc, ctx);
    }
    if (g.pulseGain) {
      smooth(g.pulseGain.gain, 0.08 + rough * 0.22 + thr * 0.1 + (parked ? 0.06 : 0), tc, ctx);
    }
    if (g.unevenGain) {
      const lope = (cyl >= 8 ? 1 : 0.55) * (0.05 + rough * 0.14) * (1.25 - rpmNorm * 0.55);
      smooth(g.unevenGain.gain, lope + (parked ? 0.04 + thr * 0.05 : 0), tc, ctx);
    }
    if (g.subGain) {
      smooth(g.subGain.gain, growl * 0.28 * (0.4 + rpmNorm * 0.4 + thr * 0.12), tc, ctx);
    }
    if (g.presenceFilt) {
      smooth(
        g.presenceFilt.frequency,
        280 + presence * 500 + thr * 350 + rpmNorm * 200 + fj * 40,
        tc,
        ctx,
      );
    }
    if (g.muffler) {
      const open = lerp(700, 4200, 1 - muffling);
      smooth(g.muffler.frequency, open + thr * 1400 + rpmNorm * 500 + fj * 80, tc, ctx);
    }
    if (g.intakeGain) {
      const throttleFeel = parked ? Math.max(thr, thr * thr) : thr;
      smooth(g.intakeGain.gain, intake * throttleFeel * (0.5 + rpmNorm * 0.55), tc, ctx);
    }
    if (g.intakeFilt) {
      smooth(g.intakeFilt.frequency, 1000 + thr * 2800 + rpmNorm * 800, tc, ctx);
    }
    if (g.exhaustGain) {
      smooth(
        g.exhaustGain.gain,
        exhaust * (0.22 + rpmNorm * 0.28 + thr * 0.18 + (parked ? 0.1 + thr * 0.1 : 0)),
        tc,
        ctx,
      );
    }
    if (g.delay) {
      const len = Number(p.exhaustLength ?? 0.45);
      smooth(g.delay.delayTime, 0.008 + len * 0.035, tc, ctx);
    }
    if (g.delayGain) {
      const fb = Number(p.exhaustFeedback ?? 0.72) * (0.35 + (1 - muffling) * 0.25);
      smooth(g.delayGain.gain, clamp(fb, 0.15, 0.72), tc, ctx);
    }
    if (g.ignGain) {
      smooth(g.ignGain.gain, ign * (0.015 + thr * 0.1 + rpmNorm * 0.04 + rough * 0.02), tc, ctx);
    }
    if (g.mechGain) {
      smooth(
        g.mechGain.gain,
        (0.1 + rough * 0.14 + rpmNorm * 0.05 + thr * 0.04 + (parked ? 0.06 : 0)) * (1 + gj * 0.04),
        tc,
        ctx,
      );
    }
    if (g.mechFilt) {
      smooth(g.mechFilt.frequency, 520 + rpmNorm * 700 + thr * 350 + fj * 50, tc, ctx);
    }

    // Stochastic valvetrain tick (osc fallback) — sparse, irregular
    if (g.tickGain) {
      this.valveTickWait -= 1;
      if (this.valveTickWait <= 0) {
        const t0 = ctx.currentTime;
        const amp = 0.02 + rough * 0.05 + thr * 0.02;
        try {
          g.tickGain.gain.cancelScheduledValues(t0);
          g.tickGain.gain.setValueAtTime(amp, t0);
          g.tickGain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.028 + Math.random() * 0.02);
        } catch {
          g.tickGain.gain.value = 0.001;
        }
        this.valveTickWait = Math.floor(8 + Math.random() * (28 + (1 - thr) * 40));
      }
    }

    if (parked && thrRaw < 0.12) this.driveMood = 'idle';
    else if (parked) this.driveMood = 'lope';
    else if (thrRaw > 0.7) this.driveMood = 'pull';
    else this.driveMood = 'cruise';
    this.prevThrottle = thrRaw;
  }

  private applyEvDriving(rpmNorm: number, d: DrivingInput, tc: number): void {
    const p = this.params;
    const g = this.g;
    const ctx = this.context;
    const topo = this.patchMeta.topology;

    const thr = this.throttleLag;
    const thrRaw = d.throttle;
    const base = Number(p.whinePitch ?? 180);
    const steps = Number(p.gearSteps ?? 0.35);

    // Inverter beat wander / detune drift
    this.evDetuneWander += (Math.random() * 2 - 1) * 0.35;
    this.evDetuneWander *= 0.97;
    this.liveJit.pitch = this.liveJit.pitch * 0.96 + (Math.random() * 2 - 1) * 0.008;

    const stepped = Math.floor(rpmNorm * (3 + steps * 5)) / (3 + steps * 5);
    let pitchMul = lerp(0.35, 1, Math.max(stepped, rpmNorm * 0.7));
    if (topo === 'ev-inverter-climb') {
      // Stronger ascending climb with speed/throttle
      pitchMul = lerp(0.28, 1.15, Math.max(stepped, rpmNorm * 0.55 + thr * 0.35));
    }
    let fund = base * pitchMul * (0.5 + rpmNorm * 0.5 + thr * 0.15);
    fund *= 1 + this.liveJit.pitch * 0.02;
    // Idle band: scale low end vs defaults (700/900 → no change); jitter ≤ idleRpmMax
    fund = this.applyIdleBandScale(fund, d.speed, thrRaw, rpmNorm);
    if (d.reverse) fund *= 0.85;
    this.hud.fundamentalHz = fund;

    const det = this.evDetuneWander;
    if (g.whine1) smooth(g.whine1.frequency, fund * (1 + det * 0.0008), tc, ctx);
    if (g.whine2) smooth(g.whine2.frequency, fund * 2 * (1 - det * 0.0005), tc, ctx);
    if (g.whine3) smooth(g.whine3.frequency, fund * 3.01, tc, ctx);
    if (g.whine1) g.whine1.detune.value = det * 0.4;
    if (g.whine2) g.whine2.detune.value = -det * 0.55;

    const presence = Number(p.presence ?? 0.55);
    if (g.whineGain) {
      const vol =
        (0.08 + rpmNorm * 0.22 + thr * 0.12) * (0.6 + presence * 0.6) +
        (d.speed < 0.03 ? thrRaw * 0.15 : 0);
      smooth(g.whineGain.gain, vol * (1 + this.liveJit.gain * 0.03), tc, ctx);
    }
    if (g.buzzGain) {
      smooth(
        g.buzzGain.gain,
        Number(p.inverterBuzz ?? 0.4) * (0.04 + rpmNorm * 0.1 + thr * 0.08),
        tc,
        ctx,
      );
    }
    if (g.buzzFilt) {
      smooth(g.buzzFilt.frequency, 2800 + rpmNorm * 3500 + this.liveJit.filt * 90, tc, ctx);
    }
    if (g.muffler) {
      const muff = Number(p.muffling ?? 0.2);
      smooth(g.muffler.frequency, lerp(2500, 9000, 1 - muff) + this.liveJit.filt * 60, tc, ctx);
    }

    // Gear mesh (climb pack emphasizes)
    const meshAmt = Number(p.gearMesh ?? (topo === 'ev-inverter-climb' ? 0.55 : 0.15));
    if (g.meshFilt) {
      smooth(g.meshFilt.frequency, 700 + rpmNorm * 1800 + thr * 600, tc, ctx);
    }
    if (g.meshGain) {
      const mesh =
        meshAmt *
        (0.02 + rpmNorm * 0.1 + thr * 0.08) *
        (topo === 'ev-inverter-climb' ? 1.35 : 0.55);
      smooth(g.meshGain.gain, mesh, tc, ctx);
    }

    // Regen howl: blooms on decel (speed high, throttle drop)
    const regenAmt = Number(p.regenHowl ?? (topo === 'ev-regen-howl' ? 0.78 : 0.15));
    const dThr = this.prevThrottle - thrRaw;
    const decel = d.speed > 0.18 && (dThr > 0.01 || thrRaw < 0.22);
    const regenGate =
      topo === 'ev-regen-howl'
        ? clamp(d.speed * 1.1) * (decel ? 1 : clamp(0.15 + (1 - thrRaw) * 0.35))
        : clamp(d.speed * 0.5) * (decel ? 0.55 : 0);
    if (g.regenOsc) smooth(g.regenOsc.frequency, 900 + d.speed * 2200 + (1 - thrRaw) * 800, tc, ctx);
    if (g.regenOsc2) smooth(g.regenOsc2.frequency, 1400 + d.speed * 2800, tc, ctx);
    if (g.regenFilt) {
      smooth(g.regenFilt.frequency, 1200 + d.speed * 2400 + this.liveJit.filt * 70, tc, ctx);
    }
    if (g.regenGain) {
      smooth(g.regenGain.gain, regenAmt * regenGate * (0.06 + d.speed * 0.14), tc, ctx);
    }

    // Dual motor L/R beat + mid roar
    const dual = Number(p.dualBeat ?? (topo === 'ev-dual-motor' ? 0.68 : 0));
    const roar = Number(p.motorRoar ?? (topo === 'ev-dual-motor' ? 0.72 : 0.12));
    if (g.dualWhineR) {
      smooth(g.dualWhineR.frequency, fund * (1.02 + dual * 0.04) * (1 - det * 0.001), tc, ctx);
      g.dualWhineR.detune.value = 8 + det * 0.8 + dual * 18;
    }
    if (g.dualWhineGainR) {
      smooth(g.dualWhineGainR.gain, dual * (0.08 + rpmNorm * 0.16 + thr * 0.1), tc, ctx);
    }
    if (g.motorFilt) {
      smooth(g.motorFilt.frequency, 500 + rpmNorm * 900 + thr * 400, tc, ctx);
    }
    if (g.motorGain) {
      smooth(
        g.motorGain.gain,
        roar * (0.06 + rpmNorm * 0.22 + thr * 0.12) * (topo === 'ev-dual-motor' ? 1 : 0.35),
        tc,
        ctx,
      );
    }
    if (g.panL && topo === 'ev-dual-motor') {
      const width = Number(p.stereoWidth ?? 0.7);
      smooth(g.panL.pan, -0.35 - width * 0.3 + this.loadLag * 0.1, tc, ctx);
    }
    if (g.panR && topo === 'ev-dual-motor') {
      const width = Number(p.stereoWidth ?? 0.7);
      smooth(g.panR.pan, 0.35 + width * 0.3 + this.loadLag * 0.1, tc, ctx);
    }

    if (topo === 'ev-regen-howl' && regenGate > 0.35) this.driveMood = 'regen';
    else if (d.speed < 0.04 && thrRaw < 0.08) this.driveMood = 'idle';
    else if (thrRaw > 0.55) this.driveMood = 'pull';
    else this.driveMood = 'cruise';

    this.prevThrottle = thrRaw;
  }


  private applyAerospaceDriving(rpmNorm: number, d: DrivingInput, tc: number): void {
    const p = this.params;
    const g = this.g;
    const ctx = this.context;

    const spoolBase = Number(p.spoolPitch ?? 95);
    const idleAmt = Number(p.idleSpool ?? 0.55);
    const roar = Number(p.jetRoar ?? 0.68);
    const intake = Number(p.intakeWhine ?? 0.5);
    const comp = Number(p.compressor ?? 0.65);
    const coreAmt = Number(p.turbine ?? 0.7);
    const after = Number(p.afterburn ?? 0.78);
    const nozzle = Number(p.jetScream ?? 0.45);
    const airframeAmt = Number(p.airframe ?? 0.55);
    const inertia = Number(p.spoolInertia ?? 0.62);

    const parked = d.speed < 0.04;
    const thr = this.throttleLag; // lagged throttle (hysteresis)
    const thrRaw = d.throttle;

    // Spool target + rate wander (living)
    this.spoolWander += (Math.random() * 2 - 1) * 0.012;
    this.spoolWander *= 0.96;
    const idleSpoolScale = this.idleBand.rpmMin / DEFAULT_IDLE_RPM_MIN;
    const spoolTarget = clamp(
      rpmNorm * 0.62 +
        thr * 0.48 +
        (parked ? idleAmt * 0.22 * idleSpoolScale + thr * 0.18 : 0) +
        this.spoolWander * 0.04,
    );
    const spoolTc = lerp(0.14, 0.52, inertia);
    if (tc <= 0.015) {
      this.spoolLag = spoolTarget;
    } else {
      const a = 1 - Math.exp(-Math.max(0.012, tc) / Math.max(0.08, spoolTc));
      this.spoolLag += (spoolTarget - this.spoolLag) * a;
    }
    const spool = clamp(this.spoolLag);

    // Soft AB onset hysteresis (lags open more than close a bit)
    const abWant = Math.max(0, thrRaw - 0.42) / 0.58;
    const abTc = abWant > this.abLag ? 0.22 : 0.12;
    if (tc <= 0.015) this.abLag = abWant * abWant;
    else {
      const aa = 1 - Math.exp(-Math.max(0.012, tc) / abTc);
      this.abLag += (abWant * abWant - this.abLag) * aa;
    }
    const abWet = clamp(this.abLag);

    let fund = spoolBase * lerp(0.55, 1.85, spool) * (1 + thr * 0.08);
    fund *= 1 + this.liveJit.pitch * 0.015;
    // Prefs scale parked spool idle + fundamental low end
    fund = this.applyIdleBandScale(fund, d.speed, thrRaw, rpmNorm);
    if (d.reverse) fund *= 0.9;
    this.hud.fundamentalHz = fund;

    const spoolSmooth = Math.max(tc, spoolTc * 0.55);
    const abSmooth = Math.min(tc, 0.08);
    const fj = this.liveJit.filt;
    const gj = this.liveJit.gain;

    if (g.compressorFilt) {
      smooth(g.compressorFilt.frequency, 900 + spool * 2400 + thr * 400 + fj * 80, spoolSmooth, ctx);
      g.compressorFilt.Q.value = 1.2 + spool * 0.8;
    }
    if (g.compressorGain) {
      const spoolNoise =
        comp *
        (0.08 + spool * 0.28 + (parked ? idleAmt * 0.06 : 0)) *
        (1 - thrRaw * thrRaw * 0.35) *
        (1 + gj * 0.04);
      smooth(g.compressorGain.gain, spoolNoise, spoolSmooth, ctx);
    }

    if (g.intakeWhineOsc) smooth(g.intakeWhineOsc.frequency, fund * 4.2, spoolSmooth, ctx);
    if (g.intakeWhineOsc2) smooth(g.intakeWhineOsc2.frequency, fund * 4.28, spoolSmooth, ctx);
    if (g.intakeWhineOsc3) smooth(g.intakeWhineOsc3.frequency, fund * 8.35, spoolSmooth, ctx);
    if (g.intakeWhineFilt) {
      smooth(g.intakeWhineFilt.frequency, 1400 + spool * 2200 + fj * 60, spoolSmooth, ctx);
      g.intakeWhineFilt.Q.value = 5 + intake * 4;
    }
    if (g.intakeWhineGain) {
      smooth(
        g.intakeWhineGain.gain,
        intake * (0.012 + spool * 0.055) * (1 - thrRaw * 0.25),
        spoolSmooth,
        ctx,
      );
    }
    if (g.spoolFlutter) {
      smooth(g.spoolFlutter.frequency, 1.6 + spool * 3.2 + Math.abs(this.spoolWander) * 2, spoolSmooth, ctx);
    }

    const buzz = Math.max(0, spool - 0.68) * 3.2;
    if (g.buzzSaw1) smooth(g.buzzSaw1.frequency, fund * 9.8, spoolSmooth, ctx);
    if (g.buzzSaw2) smooth(g.buzzSaw2.frequency, fund * 14.6, spoolSmooth, ctx);
    if (g.buzzSawGain) {
      smooth(g.buzzSawGain.gain, buzz * intake * 0.018, spoolSmooth, ctx);
    }

    if (g.coreFilt) {
      smooth(g.coreFilt.frequency, 700 + spool * 900 + thr * 500 + fj * 40, spoolSmooth, ctx);
    }
    if (g.coreFilt2) {
      smooth(g.coreFilt2.frequency, 220 + spool * 420 + thr * 180, spoolSmooth, ctx);
    }
    if (g.coreGain) {
      smooth(
        g.coreGain.gain,
        coreAmt * (0.12 + spool * 0.32 + thr * 0.14 + (parked ? idleAmt * 0.07 : 0)) * (1 + gj * 0.03),
        spoolSmooth,
        ctx,
      );
    }
    if (g.coreRoughLfo) {
      smooth(g.coreRoughLfo.frequency, 1.2 + spool * 2.8 + thr, abSmooth, ctx);
    }

    if (g.jetRoarFilt) {
      smooth(g.jetRoarFilt.frequency, 280 + rpmNorm * 500 + thr * 400, abSmooth, ctx);
    }
    if (g.jetRoarGain) {
      const exhaust =
        roar * (0.08 + rpmNorm * 0.16 + thr * thr * 0.28 + (parked ? idleAmt * 0.05 : 0));
      smooth(g.jetRoarGain.gain, exhaust, abSmooth, ctx);
    }

    if (g.afterGain) {
      smooth(g.afterGain.gain, after * abWet * 0.42, abSmooth, ctx);
    }
    if (g.afterFilt) {
      smooth(g.afterFilt.frequency, 600 + thrRaw * 1600 + fj * 50, abSmooth, ctx);
    }
    if (g.afterShaper) {
      g.afterShaper.curve = makeShaper(0.25 + abWet * 0.45) as Float32Array<ArrayBuffer>;
    }

    if (g.nozzleFilt) {
      smooth(g.nozzleFilt.frequency, 3800 + thrRaw * 3200, abSmooth, ctx);
    }
    if (g.nozzleGain) {
      smooth(g.nozzleGain.gain, nozzle * abWet * 0.07, abSmooth, ctx);
    }

    const loadAbs = Math.abs(this.loadLag);
    const buffet = clamp(loadAbs * 0.7 + (parked ? thr * 0.45 : rpmNorm * 0.2) + thr * 0.15);
    if (g.airframeFilt) {
      smooth(g.airframeFilt.frequency, 45 + buffet * 55, abSmooth, ctx);
    }
    if (g.airframeGain) {
      smooth(g.airframeGain.gain, airframeAmt * buffet * 0.16, abSmooth, ctx);
    }
    if (g.airframeLfo) {
      smooth(g.airframeLfo.frequency, 0.55 + buffet * 1.8, abSmooth, ctx);
    }

    if (g.panL) {
      const width = Number(p.stereoWidth ?? 0.6);
      smooth(g.panL.pan, -0.12 - width * 0.22 + this.loadLag * width * 0.18, tc, ctx);
    }
    if (g.panR) {
      const width = Number(p.stereoWidth ?? 0.6);
      smooth(g.panR.pan, 0.12 + width * 0.22 + this.loadLag * width * 0.18, tc, ctx);
    }

    if (abWet > 0.35) this.driveMood = 'ab';
    else if (spool < 0.35 && parked) this.driveMood = thrRaw > 0.15 ? 'spooling' : 'idle';
    else if (spool < 0.55) this.driveMood = 'spooling';
    else this.driveMood = 'cruise';
  }


  private applyScifiDriving(rpmNorm: number, d: DrivingInput, tc: number): void {
    const p = this.params;
    const g = this.g;
    const ctx = this.context;

    const thr = this.throttleLag;
    const thrRaw = d.throttle;
    const loadAbs = Math.abs(d.load ?? 0);
    const loadL = this.loadLag;

    // Spool inertia on motor + howl (research: 1-pole lag vs throttle)
    const spoolParam = clamp(Number(p.spoolLag ?? p.spoolInertia ?? 0.55));
    const spoolTarget = clamp(rpmNorm * 0.65 + thr * 0.45);
    if (tc < 0.02) {
      this.ionSpoolLag = spoolTarget;
    } else {
      const a = 0.035 + (1 - spoolParam) * 0.14;
      this.ionSpoolLag += (spoolTarget - this.ionSpoolLag) * a;
    }
    const spool = clamp(this.ionSpoolLag);
    const open = smoothstep(rpmNorm, 0.15, 0.85);
    const openSpool = smoothstep(spool, 0.12, 0.88);

    // Surge gesture (rising CF) on throttle/rpm jump — ref-D DNA
    const rpmJump = Math.max(0, rpmNorm - this.scifiPrevRpm);
    const thrJump = Math.max(0, thrRaw - this.scifiPrevThr);
    const jump = Math.min(1.2, rpmJump * 10 + thrJump * 5.5);
    this.scifiFlyby = Math.max(this.scifiFlyby * Math.exp(-tc * 9), jump);
    this.ionSurge = Math.max(this.ionSurge * Math.exp(-tc * 5.5), jump * 0.85);
    this.scifiPrevRpm = rpmNorm;
    this.scifiPrevThr = thrRaw;
    const flyby = this.scifiFlyby;
    const surge = this.ionSurge;

    const core = Number(p.corePitch ?? 65);
    let fund = core * lerp(0.85, 2.4, spool) * (1 + thr * 0.12);
    fund = this.applyIdleBandScale(fund, d.speed, thrRaw, rpmNorm);
    if (d.reverse) fund *= 0.9;
    this.hud.fundamentalHz = fund;

    // ── Layer leadership (not pitch-only) — continuous beds, surge on spikes ──
    // Idle/taxi: motors lead · Climb/cruise: howl bellow holds · High: air+howl
    // Each layer is enable+mix; any subset can be combined (Ion Twin layers v1).
    const on = (v: unknown, fb = 1) => (Number(v ?? fb) >= 0.5 ? 1 : 0);
    const motorEnable = on(p.motorEnable, 1);
    const howlEnable = on(p.howlEnable, 1);
    const screamEnable = on(p.screamEnable, 1);
    const surgeEnable = on(p.surgeEnable, 1);
    const airEnable = on(p.airEnable, 1);
    const gritEnable = on(p.gritEnable, 1);
    const motorMix = Number(p.motorMix ?? p.carrierBite ?? 0.42) * motorEnable;
    const noiseBody = Number(p.noiseBody ?? 0.55);
    const howlMix = Number(p.howlMix ?? p.formantHowl ?? p.engineHowl ?? 0.85) * howlEnable;
    const formantHowl = howlMix;
    const wetKnob = Number(p.airMix ?? p.wetHiss ?? p.air ?? 0.82) * airEnable;
    const gritKnob = Number(p.gritMix ?? p.grit ?? 0.4) * gritEnable;
    const screamMix = Number(p.screamMix ?? 0.35) * screamEnable;
    const screamBright = Number(p.screamBright ?? 0.55);
    const surgeMix = Number(p.surgeMix ?? 0.7) * surgeEnable;
    const detune = Number(p.motorDetune ?? 0.55);
    const flybyAmt = flyby * surgeMix;
    const surgeAmt = surge * surgeMix;
    const pulse = Number(p.pulseRate ?? 0.38);
    const res = Number(p.resonance ?? p.formantQ ?? 0.62);
    const spread = Number(p.formantSpread ?? 0.55);
    const formantShift = Number(p.formantShift ?? 0.5);
    const phraseRateK = Number(p.phraseRate ?? 0.28);
    const phraseDepthK = Number(p.phraseDepth ?? 0.18);
    const bodyAmt = Number(p.body ?? noiseBody);
    const wetDry = clamp(Number(p.wetDry ?? p.doppler ?? 0.22));
    const stereoTwin = Number(p.stereoTwin ?? 0.35);
    const hum = Number(p.hum ?? p.ionHum ?? 0.4);
    const ionSpark = Number(p.afterburn ?? p.ionSpark ?? 0.35);

    // Motors always present under the stack (never silence at cruise) when enabled
    const motorLead = clamp(
      motorEnable * (0.28 + (1 - openSpool) * 0.42 + thr * 0.12 + (1 - open) * 0.18),
    );
    // Sustained howl bellow from spool — holds while driving; flybyAmt only adds
    const howlHold = clamp(howlMix * openSpool * (0.95 + thr * 0.28));
    const howlLead = clamp(howlHold + flybyAmt * howlMix * 0.28);
    // Continuous air/swoosh bed; surgeAmt gestures ride on top of throttle spikes
    const airBed = wetKnob * open * (0.42 + rpmNorm * 0.38 + thr * 0.28);
    const airLead = clamp(airBed + flybyAmt * wetKnob * 0.55);

    // Twin motor pulse rates + detune beat (0.5–3 Hz psychoacoustic)
    const motorRate = lerp(3.2, 14, pulse) * (0.55 + spool);
    const beatHz = lerp(0.6, 2.8, detune);
    if (g.motorPulseLfo) smooth(g.motorPulseLfo.frequency, motorRate, tc, ctx);
    if (g.motorPulseLfo2) smooth(g.motorPulseLfo2.frequency, motorRate + beatHz, tc, ctx);
    if (g.pulseMod && g.pulseMod !== g.motorPulseLfo) {
      smooth(g.pulseMod.frequency, motorRate, tc, ctx);
    }
    if (g.motorPulseDepth) {
      smooth(g.motorPulseDepth.gain, 0.06 + pulse * 0.12 + thr * 0.05, tc, ctx);
    }
    if (g.motorPulseDepth2) {
      smooth(g.motorPulseDepth2.gain, 0.05 + pulse * 0.11 + thr * 0.045, tc, ctx);
    }

    // Quiet triangle support under motors
    if (g.carrier1) smooth(g.carrier1.frequency, fund * 0.92, tc, ctx);
    if (g.carrier2) smooth(g.carrier2.frequency, fund * (0.92 + detune * 0.08), tc, ctx);
    if (g.carrier3) smooth(g.carrier3.frequency, fund * 1.45, tc, ctx);
    if (g.carrierGain) {
      smooth(
        g.carrierGain.gain,
        motorLead * motorMix * (0.04 + (1 - open) * 0.06) * (0.5 + thr * 0.2),
        tc,
        ctx,
      );
    }

    // Motor bed — continuous floor under howl (never drop to silence at cruise)
    const motorScale = (0.24 + noiseBody * 0.35) * (0.75 + motorMix * 0.5);
    const motorBed = Math.max(
      0.09 * motorScale * (0.45 + spool * 0.55),
      motorLead * motorScale * (0.92 - howlLead * 0.22),
    );
    if (g.motorGainL) smooth(g.motorGainL.gain, motorEnable * motorBed * (1 + this.liveJit.gain * 0.03), tc, ctx);
    if (g.motorGainR) {
      smooth(g.motorGainR.gain, motorEnable * motorBed * (0.92 + detune * 0.08), tc, ctx);
    }
    if (g.motorFiltL) {
      smooth(g.motorFiltL.frequency, 70 + spool * 110 + thr * 40 + surgeAmt * 30, tc, ctx);
    }
    if (g.motorFiltR) {
      smooth(g.motorFiltR.frequency, 78 + spool * 125 + thr * 45 + detune * 20, tc, ctx);
    }
    if (g.bodyFilt) {
      smooth(g.bodyFilt.frequency, 52 + spool * 55 + thr * 25, tc, ctx);
      g.bodyFilt.Q.value = 1.8 + res * 1.5;
    }
    if (g.bodyGain) {
      smooth(g.bodyGain.gain, (0.28 + bodyAmt * 0.35) * (0.55 + motorLead * 0.55), tc, ctx);
    }
    if (g.motorBodyMix) {
      // B-like wetness on motor only; leaner when howl leads
      smooth(g.motorBodyMix.gain, bodyAmt * (0.22 + (1 - open) * 0.25) * (1 - howlLead * 0.35), tc, ctx);
    }
    if (g.motorBodyFb) {
      smooth(g.motorBodyFb.gain, 0.18 + bodyAmt * 0.22, tc, ctx);
    }
    if (g.motorBodyDelay) {
      smooth(g.motorBodyDelay.delayTime, 0.012 + bodyAmt * 0.02, tc, ctx);
    }
    if (g.twinDelay) {
      smooth(g.twinDelay.delayTime, 0.006 + stereoTwin * 0.018, tc, ctx);
    }

    // Formant howl — sustained bellow × smoothstep(rpmNorm); holds while driving
    const howlAmt = howlLead;
    const howlOut = howlAmt * (1.28 + thr * 0.42) + flybyAmt * howlMix * 0.22;
    if (g.howlGain) smooth(g.howlGain.gain, howlOut * howlEnable, tc, ctx);
    if (g.formantGain) {
      smooth(g.formantGain.gain, howlEnable * (0.95 + formantHowl * 0.45 + openSpool * 0.35), tc, ctx);
    }
    if (g.howlOscGain) {
      // Noise grit under formants × load
      smooth(g.howlOscGain.gain, (0.04 + howlAmt * 0.14 + thr * 0.05 + loadAbs * 0.04) * gritKnob, tc, ctx);
    }
    if (g.howlPhraseDepth) {
      // Shallow breath only — cap ~15% of howl so AM never chops the bellow off
      const breath =
        howlAmt * phraseDepthK * (0.12 + thr * 0.1) + surgeAmt * 0.06 + flybyAmt * 0.05;
      const depthCap = howlOut * 0.15;
      smooth(g.howlPhraseDepth.gain, Math.min(breath, depthCap), tc, ctx);
    }
    if (g.howlPhraseLfo) {
      // Slow swell breath ~0.25–0.55 Hz; light open shimmer ≤~1.4 Hz (no 4–7 Hz gate)
      const phr =
        lerp(0.25, 0.55, phraseRateK) +
        open * thr * lerp(0.35, 0.9, phraseRateK) +
        flybyAmt * 0.6;
      smooth(g.howlPhraseLfo.frequency, phr, tc, ctx);
    }

    // Scream burst β (ref-C) — brighter accent, aggression × throttle/flyby
    const screamLead = screamMix * (
      thr * thr * (0.35 + open * 0.45) +
      flybyAmt * 0.85 +
      openSpool * thr * 0.25
    );
    if (g.screamGain) smooth(g.screamGain.gain, screamLead * (1.1 + thr * 0.35), tc, ctx);
    const screamShift = lerp(0.95, 1.35, screamBright);
    const screamSurge = 1 + surgeAmt * 0.18;
    if (g.screamFilt) {
      smooth(g.screamFilt.frequency, 470 * screamShift * screamSurge, tc, ctx);
      g.screamFilt.Q.value = 5.5 + res * 3.5;
    }
    if (g.screamFilt2) {
      smooth(g.screamFilt2.frequency, 1270 * screamShift * screamSurge, tc, ctx);
      g.screamFilt2.Q.value = 5.0 + res * 3.2;
    }
    if (g.screamFilt3) {
      smooth(g.screamFilt3.frequency, 1480 * screamShift * screamSurge * (1 + screamBright * 0.08), tc, ctx);
      g.screamFilt3.Q.value = 4.5 + res * 3.0;
    }
    if (g.screamShaper) {
      const sDrive = 0.4 + screamBright * 0.3 + thr * 0.2 + flybyAmt * 0.15;
      g.screamShaper.curve = makeShaper(clamp(sDrive, 0.25, 0.9)) as Float32Array<ArrayBuffer>;
    }

    // Formant CF stack α + RPM/surge morph (0.7×–1.4×) + rising surge glide
    const shift = lerp(0.72, 1.38, formantShift * 0.5 + spool * 0.5);
    const surgeLift = 1 + surgeAmt * 0.22;
    const f1 = (400 + spread * 80 + thr * 60) * shift * surgeLift;
    const f2 = (700 + spread * 120 + thr * 90) * shift * surgeLift;
    const f3 = (900 + spread * 160 + thr * 110) * shift * surgeLift;
    const f4 = (1300 + spread * 220 + thr * 160 + open * 80) * shift * surgeLift;

    if (g.howlFilt) {
      smooth(g.howlFilt.frequency, f1, tc, ctx);
      g.howlFilt.Q.value = 4.2 + res * 5.5;
    }
    if (g.howlFilt2) {
      smooth(g.howlFilt2.frequency, f2, tc, ctx);
      g.howlFilt2.Q.value = 3.8 + res * 5;
    }
    if (g.howlFilt3) {
      smooth(g.howlFilt3.frequency, f3, tc, ctx);
      g.howlFilt3.Q.value = 3.5 + res * 4.8;
    }
    if (g.howlFilt4) {
      smooth(g.howlFilt4.frequency, f4, tc, ctx);
      g.howlFilt4.Q.value = 3.2 + res * 4.5;
    }
    if (g.howlOsc) smooth(g.howlOsc.frequency, f1 * 0.45, tc, ctx);
    if (g.howlOsc2) smooth(g.howlOsc2.frequency, f2 * 0.4, tc, ctx);


    if (g.howlGritFilt) {
      smooth(g.howlGritFilt.frequency, 2600 + open * 1800 + thr * 900 + loadAbs * 400, tc, ctx);
    }
    if (g.howlShaper) {
      // Grit × load — open harshness on aggression only
      const drive = 0.35 + gritKnob * 0.25 + thr * 0.25 + loadAbs * 0.15 + open * 0.1;
      g.howlShaper.curve = makeShaper(clamp(drive, 0.2, 0.85)) as Float32Array<ArrayBuffer>;
    }

    // Shared grit bus
    if (g.gritGain) {
      smooth(
        g.gritGain.gain,
        gritKnob * (thr * 0.12 + loadAbs * 0.1 + open * thr * 0.14) * (0.4 + howlLead * 0.6),
        tc,
        ctx,
      );
    }
    if (g.gritFilt) {
      smooth(g.gritFilt.frequency, 2800 + thr * 1400 + open * 800, tc, ctx);
    }

    // Air / wet swoosh — continuous bed; surge gestures on throttle spikes only
    const wetAmt = airLead;
    if (g.wetHissGain) {
      const baseGain = wetAmt * 1.15;
      try {
        g.wetHissGain.gain.cancelScheduledValues(ctx.currentTime);
        g.wetHissGain.gain.setTargetAtTime(baseGain, ctx.currentTime, tc);
      } catch {
        g.wetHissGain.gain.value = baseGain;
      }
    }
    if (g.wetBodyGain) {
      smooth(g.wetBodyGain.gain, wetAmt * 0.9 + open * wetKnob * 0.32, tc, ctx);
    }
    if (g.wetBodyFilt) {
      smooth(g.wetBodyFilt.frequency, 900 + open * 1500 + thr * 650 + rpmNorm * 450, tc, ctx);
    }
    if (g.wetFlybyGain) {
      // Continuous trickle + spike surge (not the whole air bed)
      smooth(
        g.wetFlybyGain.gain,
        open * wetKnob * 0.1 + flybyAmt * wetKnob * 0.9,
        Math.min(tc, 0.04),
        ctx,
      );
    }
    if (g.wetAmDepth) {
      // Gentle shimmer only — deep AM was chopping the continuous swoosh
      smooth(g.wetAmDepth.gain, wetAmt * 0.1 + flybyAmt * 0.12, tc, ctx);
    }
    if (g.wetAmLfo) {
      smooth(g.wetAmLfo.frequency, 1.2 + rpmNorm * 2.2 + thr * 1.4 + flybyAmt * 2.5, tc, ctx);
    }
    if (g.wetHissFilt) {
      smooth(
        g.wetHissFilt.frequency,
        700 + open * 2200 + thr * 1000 + rpmNorm * 800 + flybyAmt * 700,
        tc,
        ctx,
      );
    }
    if (g.wetHissFilt2) {
      smooth(g.wetHissFilt2.frequency, 2400 + open * 3400 + thr * 1500 + rpmNorm * 1100, tc, ctx);
      g.wetHissFilt2.Q.value = 0.65 + open * 0.3;
    }
    if (g.wetPan) {
      // Near-mono default; subtle twin / load lean only
      const width = Number(p.stereoWidth ?? 0.28) * stereoTwin;
      const smear = loadL * width * 0.55 + Math.sin(rpmNorm * Math.PI) * width * 0.25 * open;
      smooth(g.wetPan.pan, clamp(smear, -0.55, 0.55), tc, ctx);
    }

    // Ion spark — sparse × load, never solo
    if (g.afterGain) {
      smooth(
        g.afterGain.gain,
        ionSpark * open * thr * thr * 0.35 * (0.4 + loadAbs * 0.6) + flybyAmt * ionSpark * 0.12,
        tc,
        ctx,
      );
    }

    // Ion hum — idle / taxi support
    if (g.humGain) {
      const idleAmt = clamp(1 - rpmNorm * 2.0) * hum * 0.2;
      smooth(g.humGain.gain, idleAmt + (d.speed < 0.03 ? thrRaw * hum * 0.08 : 0), tc, ctx);
    }
    if (g.humOsc) {
      const humHz =
        core * 0.85 * (this.idleBand.rpmMin / DEFAULT_IDLE_RPM_MIN) * (1 + this.liveJit.pitch * 0.01);
      smooth(g.humOsc.frequency, humHz, tc, ctx);
    }

    // Wet/dry crossfade — default dry-leaning
    if (g.dryGain) smooth(g.dryGain.gain, 1 - wetDry * 0.55, tc, ctx);
    if (g.wetBusGain) smooth(g.wetBusGain.gain, wetDry * 0.45 + bodyAmt * 0.08 * (1 - open), tc, ctx);
    if (g.delay) {
      smooth(g.delay.delayTime, 0.012 + wetDry * 0.035 + loadAbs * 0.01, tc, ctx);
    }
    if (g.delayGain) {
      smooth(g.delayGain.gain, wetDry * 0.28 + bodyAmt * 0.08, tc, ctx);
    }

    // Master pan: keep near-mono (research stereo corr ≥0.97)
    if (g.panL) {
      const width = Number(p.stereoWidth ?? 0.28);
      smooth(g.panL.pan, loadL * width * 0.25, tc, ctx);
    }

    if (open > 0.7 && thrRaw > 0.55) this.driveMood = 'pull';
    else if (d.speed < 0.04 && thrRaw < 0.12) this.driveMood = 'idle';
    else if (open > 0.35) this.driveMood = 'cruise';
    else this.driveMood = 'idle';
  }


  /**
   * Non-ICE packs: scale fundamental by idleRpm vs defaults when near idle.
   * Defaults (700/900) → scale 1 (pack character unchanged). Living jitter may
   * rise toward idleRpmMax/900 but not beyond (ceiling). Docs approx idleHz ≈
   * rpm/60; ICE uses firing Hz (N·rpm/120) instead — see applyIceDriving.
   */
  private applyIdleBandScale(
    fund: number,
    speed: number,
    throttle: number,
    rpmNorm: number,
  ): number {
    const gate = idleGate(speed, throttle, rpmNorm);
    if (gate <= 0.01) return fund;
    const band = this.idleBand;
    const scaleFloor = band.rpmMin / DEFAULT_IDLE_RPM_MIN;
    const scaleCeil = band.rpmMax / DEFAULT_IDLE_RPM_MAX;
    const jit = idleJitter01(this.liveJit.pitch);
    const scale = Math.min(
      scaleCeil,
      scaleFloor + Math.max(0, scaleCeil - scaleFloor) * jit,
    );
    return lerp(fund, fund * scale, gate);
  }


}

const UPSHIFT_SFX_KEY = storageKey('ds-upshift-sfx');

function readUpshiftSfxPref(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(UPSHIFT_SFX_KEY) === '1';
  } catch {
    return false;
  }
}

function writeUpshiftSfxPref(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) localStorage.setItem(UPSHIFT_SFX_KEY, '1');
    else localStorage.removeItem(UPSHIFT_SFX_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function createEngineSynth(ctx: AudioContext, patch?: EnginePatch): EngineSynth {
  // RevForge native packs → RevForgeSynth; DriveSynth packs → EngineSynthImpl.
  // CharacterEngine always wraps so setDriving / soft-cues / layers keep forwarding.
  const base = patch?.revforge
    ? new RevForgeSynth(ctx, patch)
    : new EngineSynthImpl(ctx, patch);
  return new CharacterEngine(base, patch ?? base.toPatch(), (p) =>
    createEngineSynth(ctx, { ...p, layers: [] }),
  );
}
