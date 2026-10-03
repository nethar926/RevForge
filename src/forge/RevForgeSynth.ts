import {flightProfile} from './flightProfile';
import type {
  DrivingInput,
  EngineDiag,
  EngineParams,
  EnginePatch,
  EngineSynth,
  LockStage,
  SynthNodeDesc,
} from "../audio/types";
import { RevForgeVoice } from "./RevForgeVoice";
import type { RevForgeVoiceConfig } from "./voiceTypes";
import { clamp } from "./simulation";
import { revforgeDcGuardForRpm } from "../audio/iceDcGuard";

/** Adapter preserves the native RevForge sound while sharing DriveSynth's editor and output controls. */
export class RevForgeSynth implements EngineSynth {
  readonly context: AudioContext;
  readonly output: GainNode;
  private voice: RevForgeVoice;
  private patch: EnginePatch;
  private running = false;
  private disposed = false;
  private shiftSfx = false;
  private lockSfx = false;
  private hud = {
    rpmNorm: 0,
    rpm: 0,
    loadFeel: 0,
    fundamentalHz: 0,
    driveMood: "idle",
  };
  constructor(context: AudioContext, patch: EnginePatch) {
    this.context = context;
    this.output = context.createGain();
    this.output.gain.value = 0;
    this.output.connect(context.destination);
    this.patch = structuredClone(patch);
    this.voice = new RevForgeVoice(context, this.output);
  }
  get id() {
    return this.patch.id;
  }
  async start() {
    if (this.disposed) return;
    await this.voice.start(this.patch.revforge!, {
      masterVolume: Number(this.patch.params.masterGain ?? 0.85),
      engineVolume: 1,
      musicVolume: 0.45,
    });
    if (this.disposed) {
      this.voice.dispose();
      return;
    }
    this.running = true;
    this.output.gain.setTargetAtTime(1, this.context.currentTime, 0.04);
    this.setDriving({ speed: 0, throttle: 0 });
  }
  stop() {
    this.running = false;
    this.output.gain.cancelScheduledValues(this.context.currentTime);
    this.output.gain.setTargetAtTime(0, this.context.currentTime, 0.025);
  }
  dispose() {
    this.disposed = true;
    this.running = false;
    this.voice.dispose();
    this.output.disconnect();
  }
  setDriving(d: DrivingInput) {
    const p = this.patch.revforge!;
    const rpm =
      d.rpm ??
      p.idleRpm +
        Math.max(d.speed, d.throttle * 0.55) * (p.redline - p.idleRpm);
    const normalized = clamp((rpm - p.idleRpm) / (p.redline - p.idleRpm), 0, 1);
    this.hud = {
      rpmNorm: normalized,
      rpm,
      loadFeel: d.load ?? d.throttle,
      fundamentalHz: rpm / 60,
      driveMood: d.overrun
        ? "overrun"
        : d.shifting
          ? "shift"
          : d.throttle > 0.6
            ? "pull"
            : "idle",
    };
    if (this.running)
      this.voice.update({
        rpm,
        tieSignature: this.patch.params.tieSignature !== 0,
        flight: flightProfile(rpm,p.idleRpm,p.redline,d.throttle,!!d.overrun,this.patch.params.jetSimulation !== 0),
        load: clamp(d.load ?? d.throttle, 0, 1),
        accel: d.acceleration ?? 0,
        shifting: !!d.shifting,
        overrun: !!d.overrun,
        // Same rpm-gated DC guard as the pulse-worklet ICE packs (0 below 1500 rpm → idle unchanged)
        dcGuard: revforgeDcGuardForRpm(this.patch.id, p.voice, rpm, this.patch.params.dcGuard),
      });
  }
  getParams(): EngineParams {
    return { ...this.patch.params } as EngineParams;
  }
  setParams(params: Partial<EngineParams>) {
    this.patch.params = {
      ...this.patch.params,
      ...params,
    } as EnginePatch["params"];
    const p = { ...this.patch.revforge! };
    const mappings: Partial<
      Record<keyof EngineParams, keyof RevForgeVoiceConfig>
    > = {
      growl: "growl",
      presence: "metallic",
      intake: "air",
      exhaust: "exhaust",
      crackle: "crackle",
      roughness: "rumble",
      cylinders: "cylinders",
      formantHowl: "rasp",
      wetHiss: "air",
      noiseBody: "body",
      carrierBite: "metallic",
      afterburn: "growl",
      inverterBuzz: "metallic",
      motorRoar: "growl",
      turbine: "growl",
      intakeWhine: "air",
    };
    for (const [key, value] of Object.entries(params)) {
      const target = mappings[key as keyof EngineParams];
      if (target) Object.assign(p, { [target]: value });
    }
    if (params.rpmIdle !== undefined)
      p.idleRpm = (params.rpmIdle * 120) / Math.max(4, p.cylinders);
    if (params.rpmRedline !== undefined)
      p.redline = (params.rpmRedline * 120) / Math.max(4, p.cylinders);
    if (params.muffling !== undefined)
      p.body = clamp(1 - params.muffling, 0, 1);
    this.patch.revforge = p;
    this.voice.applyPatch(p);
    if (params.masterGain !== undefined)
      this.voice.setLook({
        masterVolume: clamp(params.masterGain, 0, 1),
        engineVolume: 1,
        musicVolume: 0.45,
      });
  }
  toPatch() {
    return structuredClone(this.patch);
  }
  fromPatch(patch: EnginePatch) {
    this.patch = structuredClone(patch);
    this.voice.applyPatch(this.patch.revforge!);
    this.voice.setLook({
      masterVolume: Number(this.patch.params.masterGain ?? 0.85),
      engineVolume: 1,
      musicVolume: 0.45,
    });
  }
  applyGraphToParams(graph: SynthNodeDesc[]) {
    this.patch.graph = structuredClone(graph);
    const mapped: Partial<EngineParams> = {};
    for (const node of graph)
      for (const [key, value] of Object.entries(node.params)) {
        if (key in this.patch.params && typeof value === "number")
          Object.assign(mapped, { [key]: value });
      }
    this.setParams(mapped);
  }
  getHud() {
    return { ...this.hud };
  }
  getDiag(): EngineDiag {
    return {
      contextState: this.context.state,
      iceMode: "n/a",
      running: this.running,
      engineId: this.id,
    };
  }
  getLockStage(): LockStage {
    return "none";
  }
  setLockSfxEnabled(value: boolean) {
    this.lockSfx = value;
  }
  getLockSfxEnabled() {
    return this.lockSfx;
  }
  setUpshiftSfxEnabled(value: boolean) {
    this.shiftSfx = value;
  }
  getUpshiftSfxEnabled() {
    return this.shiftSfx;
  }
  triggerUiCue(cue: string) {
    if (cue === "upshift" && this.shiftSfx && this.running) this.voice.blip();
  }
}
