export interface RevForgeVoiceConfig {
  voice: string;
  cylinders: number;
  firing: string;
  idleRpm: number;
  redline: number;
  rumble: number;
  growl: number;
  metallic: number;
  air: number;
  exhaust: number;
  rasp: number;
  body: number;
  turbo: number;
  turboPitch: number;
  blowoff: number;
  crackle: number;
  distortion: number;
  gears: number;
  shiftRpm: number;
  finalDrive: number;
  hasManual: boolean;
  /** @deprecated Music layer removed; optional for saved-preset compat. */
  hasMusic?: boolean;
}
