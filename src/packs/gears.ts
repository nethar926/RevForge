import CARRIER_JET from './carrier-jet.identity';
import { mediaCommand, type VehicleMediaAction } from '../forge/mediaActions';

/**
 * Per-pack gearbox (Wilson, Oct 8 2026): Carrier Jet is a jet — no gears. One place decides it,
 * so the shell (Auto/Manual control, paddles, keyboard / media shifting, drivetrain) and tests
 * agree. Pure data + pure functions; nothing here reads or writes the user's saved gearCount.
 */
const GEARLESS_PACK_IDS: ReadonlySet<string> = new Set([CARRIER_JET.id]);

/** False for packs with no gearbox (Carrier Jet). Plain themes / other packs / no pack → true. */
export const packHasGears = (packId: string | null | undefined): boolean => !packId || !GEARLESS_PACK_IDS.has(packId);

/**
 * Gear count the drive simulation runs with: the user's pref (prefs.gearCount, untouched) for
 * geared packs; 1 (single speed: no auto or manual shifts, so no shift cues) for gearless packs.
 */
export const effectiveGearCount = (packId: string | null | undefined, prefGears: number): number => (packHasGears(packId) ? prefGears : 1);

/** Transmission mode actually in effect: gearless packs are always 'auto' (the 'manual' choice is kept for when you switch back). */
export const effectiveDriveMode = <M extends string>(packId: string | null | undefined, mode: M): M | 'auto' => (packHasGears(packId) ? mode : 'auto');

/** Media-button command for a pack: on gearless packs next/previous/pause never shift (pause stops, as in Auto). */
export const packMediaCommand = (packId: string | null | undefined, action: VehicleMediaAction, running: boolean, manual: boolean, pauseShifts: boolean, blasters = false) =>
  mediaCommand(action, running, packHasGears(packId) && manual, pauseShifts, blasters);
