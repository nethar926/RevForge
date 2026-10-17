/**
 * SEAT BELT lamp on the dock (Meghan's sheet panel 5). Seat belt is a pre-start step (7a), so the lamp has its own
 * dock spot whenever the cold start is on: before start, during it and running, in Park and in Drive; unlit when
 * the sign is off, backlit when on. Cold start off: no lamp (the guarded SHUTDOWN stays as before).
 * Spot (carrier-jet-v2.css): dock row 2, centred in the gap between the SHELF key and the Shutdown slot. When a
 * host chip sits in that gap (demo "Hold to rev", manual shift chips) the lamp takes the Shutdown slot, which the
 * cold start frees while running (panel 6); with the engine stopped as well it goes after EMER STOP / QUICK START.
 */
export interface SbLampCtx { coldOn: boolean; spds: boolean; docked: boolean }
/** The lamp shows on every cold-start dock, whatever the engine / Park state. */
export const sbLampShown = (c: SbLampCtx): boolean => c.coldOn && c.spds && c.docked;
/** The guarded SHUTDOWN goes (panel 6) wherever the lamp's cold start is on. */
export const sdGuardShown = (sdShow: boolean, c: SbLampCtx): boolean => sdShow && c.docked && !sbLampShown(c);
/** VoiceOver name (the lamp is not tappable). */
export const sbLampAria = (on: boolean) => `Seat belt light, ${on ? 'on' : 'off'}`;
