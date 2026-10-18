/**
 * SEAT BELT lamp on the dock (Meghan's sheet panel 5). Seat belt is a pre-start step (7a), so the lamp has its own
 * dock spot whenever the cold start is on: before start, during it and running, in Park and in Drive; unlit when
 * the sign is off, backlit when on. Cold start off: no lamp (the guarded SHUTDOWN stays as before).
 * Spot: the one bottom row (Meghan's spec, Oct 18), between AFTERBURNER and SHELF, inside .cjm-bank (DOM = visual =
 * VoiceOver order); carrier-jet-v2.css spaces the row.
 */
export interface SbLampCtx { coldOn: boolean; spds: boolean; docked: boolean }
/** The lamp shows on every cold-start dock, whatever the engine / Park state. */
export const sbLampShown = (c: SbLampCtx): boolean => c.coldOn && c.spds && c.docked;
/** The one-row bottom dock (AFTERBURNER · SEAT BELT · SHELF · … · EMER STOP · QUICK START · GPS/RADAR): exactly where
 * the lamp shows (Tesla, cold start on, docked), so the lamp always sits in the row. */
export const bankRowOn = (c: SbLampCtx): boolean => sbLampShown(c);
/** The guarded SHUTDOWN goes (panel 6) wherever the lamp's cold start is on. */
export const sdGuardShown = (sdShow: boolean, c: SbLampCtx): boolean => sdShow && c.docked && !sbLampShown(c);
/** VoiceOver name (the lamp is not tappable). */
export const sbLampAria = (on: boolean) => `Seat belt light, ${on ? 'on' : 'off'}`;
