/**
 * Pack audio boost targets (pure; audioBridge applies them to the engine).
 * Smoothing toward the target is Audio's job.
 */
import { NIGHT_PURSUIT_ID } from './migrations';
import type { PackMode } from './runtime';

/** PURSUIT → full boost; POWER → partial seasoning (legacy saves / other packs); AUTO/NORM → stock. */
export const boostForMode = (mode: PackMode) => (mode === 'pursuit' ? 1 : mode === 'power' ? 0.5 : 0);

/**
 * Target boost for a pack. Night Pursuit's AUTO follows the auto-engage state
 * (engaged = Pursuit 1, disengaged = Cruise 0). Every other pack ignores
 * `autoEngaged` entirely, so Chrono Coupe / Stellar Helm keep boostForMode.
 */
export function packBoostTarget(packId: string, mode: PackMode, autoEngaged: boolean): number {
  if (packId === NIGHT_PURSUIT_ID && mode === 'auto') return autoEngaged ? 1 : 0;
  return boostForMode(mode);
}
