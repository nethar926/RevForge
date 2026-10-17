// Carrier Jet RADAR scope accessible name (no React, no DOM). COMPASS owns the heading (concept sheet panel 7:
// VoiceOver reads heading once), so the scope names range, mode and returns, then the map underneath; no heading.
import type { CjMapStatus } from './style';

export interface CjRadarScopeAriaView {
  /** Scope range in miles. */
  range: 2 | 5 | 10;
  /** Underlay mode: 'map' or 'terr' (terrain). */
  mode: 'map' | 'terr';
}

/**
 * MAP cell aria-label in RADAR mode, heading-free:
 *   'Radar scope over map, 5 mile range, map mode, no returns. Map track up, dimmed'
 *   'Radar scope, 10 mile range, map mode, no returns. Map unavailable, no tiles, offline'
 */
export function cjRadarScopeAria(v: CjRadarScopeAriaView, status: CjMapStatus, mapShown: boolean): string {
  const scope = `${v.range} mile range, ${v.mode === 'map' ? 'map' : 'terrain'} mode, no returns`;
  const st = status === 'GPS ACQ' ? 'acquiring GPS' : status === 'NO TILES' ? 'no tiles, offline' : status.toLowerCase();
  if (!mapShown) return `Radar scope, ${scope}. Map unavailable${st ? `, ${st}` : ''}`;
  return `Radar scope over map, ${scope}. Map track up, dimmed${st ? `, ${st}` : ''}`;
}
