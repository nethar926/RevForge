import type { EngineStateSnapshot, LockStage } from '../audio/types.ts';
import { storageKey } from '../lib/storageKey.ts';
import ION_TWIN from './ion-twin.identity.ts';
import { pickTiSize, type TiSize } from './ion-twin/layouts.ts';

/**
 * Twin Ion mount glue (Frontend). Pure functions only, so node tests can load this file directly.
 * Audio owns the lock ladder: the stage is read from the live engine's `getHud().lockStage` and
 * passed through unchanged. Nothing here recomputes it from rpm.
 */
export const ION_TWIN_ID = ION_TWIN.id;

export const ION_LOCK_STAGES: readonly LockStage[] = ['none', 'identified', 'lock', 'kill'];
export const isLockStage = (v: unknown): v is LockStage =>
  typeof v === 'string' && (ION_LOCK_STAGES as readonly string[]).includes(v);

/** EngineSynth subset the reader needs (structural, so tests can pass a stub). */
export interface IonEngineSource {
  getHud(): { lockStage?: unknown; rpmNorm?: number };
  getEngineState?(): EngineStateSnapshot;
}

export interface IonEngineTelemetry {
  lockStage: LockStage;
  engineState?: EngineStateSnapshot;
}

/** Packs whose HUD gets the engine's lock stage + getEngineState() snapshot (ForgePage → ThemeStage). */
export const packWantsEngineTelemetry = (packId: string | undefined): boolean => packId === ION_TWIN_ID;

/**
 * Live engine → mount telemetry. `lockStage` is `getHud().lockStage` as-is ('none' when the
 * engine is missing or reports anything else); `engineState` is `getEngineState()` when present.
 * Never throws: a failing engine call must not break the Drive render.
 */
export function readIonEngine(engine: IonEngineSource | null | undefined): IonEngineTelemetry {
  if (!engine) return { lockStage: 'none' };
  let lockStage: LockStage = 'none';
  try {
    const s = engine.getHud()?.lockStage;
    if (isLockStage(s)) lockStage = s;
  } catch {
    /* keep 'none' */
  }
  let engineState: EngineStateSnapshot | undefined;
  try {
    const snap = engine.getEngineState?.();
    if (snap && typeof snap === 'object') engineState = snap;
  } catch {
    /* optional */
  }
  return engineState ? { lockStage, engineState } : { lockStage };
}

/** Stage shown by the mount: the engine's stage while running, else 'none'. No recompute. */
export const ionLockStage = (stage: unknown, running: boolean): LockStage =>
  running && isLockStage(stage) ? stage : 'none';

const unit01 = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

/**
 * Scope / tach drive value 0..1.
 * Dan's c627b3c (EngineStateSnapshot.rpmNorm) is NOT in d3135fb's history — the snapshot on this
 * base has no rpmNorm field. Use ThemeStage's rpmNorm (sim / getHud path via ThemeStage).
 * If a future base adds snapshot.rpmNorm, prefer it when present on the object.
 */
export function ionRpmNorm(
  themeRpmNorm: number,
  engineState?: (EngineStateSnapshot & { rpmNorm?: number }) | null,
): number {
  const fromEngine = engineState && 'rpmNorm' in engineState ? (engineState as { rpmNorm?: number }).rpmNorm : undefined;
  if (typeof fromEngine === 'number' && Number.isFinite(fromEngine)) return unit01(fromEngine);
  return unit01(themeRpmNorm);
}

export const ION_STAGE_TEXT: Record<LockStage, string> = {
  none: 'Scanning',
  identified: 'Target identified',
  lock: 'Target lock',
  kill: 'Target kill',
};

/** Ladder lamp that is lit for a stage (SCAN at none, IDENT at identified, LOCK at lock/kill). */
export function ionLadderLit(stage: LockStage): 'scan' | 'ident' | 'lock' | null {
  if (stage === 'none') return 'scan';
  if (stage === 'identified') return 'ident';
  if (stage === 'lock' || stage === 'kill') return 'lock';
  return null;
}

export type IonDriveMode = 'surge' | 'pilot' | 'cruise' | 'hunt';
export const ION_DRIVE_MODES: readonly IonDriveMode[] = ['surge', 'pilot', 'cruise', 'hunt'];
export const ION_DRIVE_MODE_TEXT: Record<IonDriveMode, string> = {
  surge: 'SURGE',
  pilot: 'PILOT',
  cruise: 'CRUISE',
  hunt: 'HUNT',
};

export const ION_MODE_KEY = 'revforge.pack.ion-twin.driveMode';
export function readDriveMode(): IonDriveMode {
  try {
    const v = localStorage.getItem(storageKey(ION_MODE_KEY));
    return (ION_DRIVE_MODES as readonly string[]).includes(v ?? '') ? (v as IonDriveMode) : 'cruise';
  } catch {
    return 'cruise';
  }
}
export function writeDriveMode(m: IonDriveMode): void {
  try {
    localStorage.setItem(storageKey(ION_MODE_KEY), m);
  } catch {
    /* session-only */
  }
}

export const ION_GLYPHS_KEY = 'revforge.pack.ion-twin.glyphs';
export function readGlyphsOn(): boolean {
  try {
    const v = localStorage.getItem(storageKey(ION_GLYPHS_KEY));
    return v !== '0';
  } catch {
    return true;
  }
}
export function writeGlyphsOn(on: boolean): void {
  try {
    localStorage.setItem(storageKey(ION_GLYPHS_KEY), on ? '1' : '0');
  } catch {
    /* session-only */
  }
}

export type IonMapOrient = 'n-up' | 'trk-up';
export const ION_MAP_ORIENT_KEY = 'revforge.pack.ion-twin.mapOrient';
export function readMapOrient(): IonMapOrient {
  try {
    const v = localStorage.getItem(storageKey(ION_MAP_ORIENT_KEY));
    return v === 'trk-up' ? 'trk-up' : 'n-up';
  } catch {
    return 'n-up';
  }
}
export function writeMapOrient(o: IonMapOrient): void {
  try {
    localStorage.setItem(storageKey(ION_MAP_ORIENT_KEY), o);
  } catch {
    /* session-only */
  }
}

export const ION_MAP_ZOOM_KEY = 'revforge.pack.ion-twin.mapZoom';
export function readMapZoom(): number {
  try {
    const n = Number(localStorage.getItem(storageKey(ION_MAP_ZOOM_KEY)));
    return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 2;
  } catch {
    return 2;
  }
}
export function writeMapZoom(z: number): void {
  try {
    localStorage.setItem(storageKey(ION_MAP_ZOOM_KEY), String(Math.max(0, Math.min(4, Math.round(z)))));
  } catch {
    /* session-only */
  }
}

/** Re-export size picker for tests. */
export { pickTiSize, type TiSize };
