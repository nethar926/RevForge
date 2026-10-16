/**
 * Speed sent to the audio engine (setDriving). Default: the simulation's smoothed speed (as before, every pack).
 * Carrier Jet (rawGps): the latest live GPS fix speed, so Dan's launch detector sees the real acceleration; the
 * smoothed value (~0.45 s lag on top of 1 Hz fixes → launch at ~1.9–2.6 s instead of ~1.0 s) stays for the display.
 */
export function engineSpeedMph(simMph: number, gps: { fresh: boolean; mph: number }, rawGps: boolean, source: 'gps' | 'demo'): number {
  return rawGps && source === 'gps' && gps.fresh && Number.isFinite(gps.mph) ? Math.max(0, gps.mph) : simMph;
}
