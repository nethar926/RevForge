/**
 * Weather condition mapping (RESEARCH.md §4) onto Meghan's glyph set (wxView.WxCond, 12 glyphs, night variants for
 * clear / partly_cloudy / drizzle). The research model has 13 conditions; the extra ones share a glyph:
 *   mostly_clear → clear · haze → fog · freezing → sleet · heavy rain (WMO 65/82, NWS "Heavy …") → heavy_rain.
 * Pure, node-testable.
 */
import type { WxCond } from '../wxView.ts';

/** Open-Meteo WMO weather_code → glyph condition (null = no code). */
export function wmoCond(code: unknown): WxCond | null {
  if (typeof code !== 'number' || !Number.isFinite(code)) return null;
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly_cloudy';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 65 || code === 82) return 'heavy_rain';
  if (code === 61 || code === 63 || code === 80 || code === 81) return 'rain';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (code === 95 || code === 96 || code === 99) return 'thunder';
  return 'unknown';
}

const NWS_ICON: Record<string, WxCond> = {
  skc: 'clear', hot: 'clear', cold: 'clear', few: 'clear', sct: 'partly_cloudy', bkn: 'cloudy', ovc: 'cloudy',
  fog: 'fog', haze: 'fog', smoke: 'fog', dust: 'fog',
  rain: 'rain', rain_showers: 'rain', rain_showers_hi: 'rain',
  fzra: 'sleet', rain_fzra: 'sleet', snow_fzra: 'sleet', sleet: 'sleet', rain_sleet: 'sleet', snow_sleet: 'sleet',
  snow: 'snow', rain_snow: 'snow', blizzard: 'snow',
  tsra: 'thunder', tsra_sct: 'thunder', tsra_hi: 'thunder', tornado: 'thunder', hurricane: 'thunder', tropical_storm: 'thunder',
};

/** NWS icon URL (…/icons/land/{day|night}/{code}[,PoP][/second]?size=…) → condition + day/night, or null. */
export function nwsIconCond(icon: unknown): { cond: WxCond; isDay: boolean } | null {
  if (typeof icon !== 'string') return null;
  const m = /\/icons\/land\/(day|night)\/([a-z_]+)/.exec(icon);
  if (!m) return null;
  const isDay = m[1] === 'day';
  const code = m[2];
  if (code.startsWith('wind_')) return { cond: 'wind', isDay };
  return { cond: NWS_ICON[code] ?? 'unknown', isDay };
}

/** NWS textDescription keywords → condition (null when empty / no match). */
export function textCond(t: unknown): WxCond | null {
  if (typeof t !== 'string' || !t.trim()) return null;
  const s = t.toLowerCase();
  if (/thunder|t-storm/.test(s)) return 'thunder';
  if (/freezing|sleet|ice/.test(s)) return 'sleet';
  if (/snow/.test(s)) return 'snow';
  if (/drizzle/.test(s)) return 'drizzle';
  if (/heavy (rain|showers)/.test(s)) return 'heavy_rain';
  if (/rain|shower/.test(s)) return 'rain';
  if (/fog|mist|haze|smoke|dust/.test(s)) return 'fog';
  if (/windy|breezy/.test(s)) return 'wind';
  if (/overcast|mostly cloudy/.test(s)) return 'cloudy';
  if (/partly/.test(s)) return 'partly_cloudy';
  if (/cloudy/.test(s)) return 'cloudy';
  if (/mostly clear|mostly sunny|fair|clear|sunny/.test(s)) return 'clear';
  return null;
}

/** Sun above the horizon (NOAA low-precision solar position; for NWS obs without an icon). */
export function sunUp(lat: number, lon: number, t: number): boolean {
  const d = t / 86400000 - 10957.5; // days since J2000
  const g = ((357.529 + 0.98560028 * d) * Math.PI) / 180;
  const q = 280.459 + 0.98564736 * d;
  const L = ((q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const e = ((23.439 - 0.00000036 * d) * Math.PI) / 180;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon) * Math.PI) / 180 - ra;
  const la = (lat * Math.PI) / 180;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  return alt > (-0.833 * Math.PI) / 180;
}
