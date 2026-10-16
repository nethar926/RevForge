/**
 * Carrier Jet v2 GPS + RADAR plate state (framework; pure, node-testable). Meghan's GpsRadarPlate draws it beside the
 * AB guard (option C). GPS comes from the app's one geolocation watch (hooks/gpsFixes status feed); RADAR is the stored
 * view flag in mapView.ts (default off; a view change, so it works while driving).
 */

export type CjGpsState = 'none' | 'acq' | 'live' | 'fail';

/** App GPS status (hooks/useGeolocation GpsStatus) → plate state. Demo / GPS off = 'none'. */
export function cjGps(status: string): CjGpsState {
  if (status === 'live') return 'live';
  if (status === 'requesting' || status === 'waiting' || status === 'stale') return 'acq';
  if (status === 'denied' || status === 'unavailable' || status === 'error') return 'fail';
  return 'none';
}


/** The plate's VoiceOver name carries the GPS state (the header GPS pill is hidden wherever the plate is mounted). */
export function plateAria(demo: boolean, gps: CjGpsState, radarOn: boolean): string {
  const g = demo ? 'GPS demo' : gps === 'live' ? 'GPS live' : gps === 'acq' ? 'GPS acquiring' : gps === 'fail' ? 'GPS no fix' : 'GPS off';
  return `${g}, radar ${radarOn ? 'on' : 'off'}`;
}
