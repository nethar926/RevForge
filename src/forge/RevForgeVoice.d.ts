import type { RevForgeVoiceConfig } from "./voiceTypes";
export class RevForgeVoice {
  constructor(context: AudioContext, destination: AudioNode);
  start(
    patch: RevForgeVoiceConfig,
    look: { masterVolume: number; engineVolume: number; musicVolume: number },
  ): Promise<void>;
  applyPatch(patch: RevForgeVoiceConfig): void;
  setLook(look: {
    masterVolume: number;
    engineVolume: number;
    musicVolume: number;
  }): void;
  update(state: {
    tieSignature?: boolean;
    flight?: {spool:number;thrust:number;afterburner:number};
    rpm: number;
    load: number;
    accel: number;
    shifting: boolean;
    overrun: boolean;
    /** ICE DC guard 0..1 (iceDcGuardForRpm); omitted → 0 (no change). */
    dcGuard?: number;
  }): void;
  dispose(): void;
  blip(): void;
}
