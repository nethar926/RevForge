import type { CSSProperties } from 'react';
import { GpsPlate } from './GpsPlate';
import { RadarToggle } from './RadarToggle';
import { GPS_RADAR_PLATE_MIN, GPS_RADAR_PLATE_MIN_NARROW, PLATE_MIN, PLATE_MIN_NARROW, RADAR_MIN, RADAR_MIN_NARROW } from './tokens';
import type { CjGpsRadarPlateProps } from '../types';
import './parts.css';

/**
 * GPS two-bulb plate and RADAR toggle on one shared metal plate, for the bottom bank at the guard end.
 * 'narrow' = 89×118 (773 drive window: 44 + 1 divider + 44); 'wide' = 107×118 (1280: 50 + 1 + 56).
 */
export function GpsRadarPlate({ gps, radarOn, onRadarToggle, size = 'wide' }: CjGpsRadarPlateProps) {
  const M = size === 'narrow' ? GPS_RADAR_PLATE_MIN_NARROW : GPS_RADAR_PLATE_MIN;
  const g = size === 'narrow' ? PLATE_MIN_NARROW : PLATE_MIN;
  const r = size === 'narrow' ? RADAR_MIN_NARROW : RADAR_MIN;
  return (
    <div className="cjp cjp-gpsradar cjp-metal" role="group" aria-label="GPS and radar" style={{ aspectRatio: `${M.w} / ${M.h}`, minWidth: M.w } as CSSProperties}>
      <div style={{ width: `${(g.w / M.w) * 100}%` }}><GpsPlate gps={gps} size={size} bare /></div>
      <span className="cjp-divider" aria-hidden="true" style={{ width: `${(1 / M.w) * 100}%` }} />
      <div style={{ width: `${(r.w / M.w) * 100}%` }}><RadarToggle on={radarOn} onToggle={onRadarToggle} size={size} bare /></div>
    </div>
  );
}
