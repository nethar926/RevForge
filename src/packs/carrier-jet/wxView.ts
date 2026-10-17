/**
 * Carrier Jet OAT (outside air temperature) readout + condition glyph (Meghan's mock a7fce46 / 36b7005, ported).
 * Pure model (node-testable). Values come from wxStore.ts, fed by the live weather module (carrier-jet/weather/);
 * test fixtures live in tests/cj-wx-view.test.ts. Data spec:
 * frontend-handoff/weather/RESEARCH.md (tempC stored, whole degrees in the units pref, age from the obs time,
 * aged > 20 min, dimmed > 90 min, hidden > 3 h or with no value; credit by source).
 */
export type WxCond =
  | 'clear' | 'partly_cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'heavy_rain'
  | 'snow' | 'sleet' | 'thunder' | 'wind' | 'unknown';
export const WX_CONDS: readonly WxCond[] = ['clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy_rain', 'snow', 'sleet', 'thunder', 'wind', 'unknown'];
/** Conditions with a separate night glyph (sun → moon); the others hide the sky. */
export const WX_NIGHT_CONDS: readonly WxCond[] = ['clear', 'partly_cloudy', 'drizzle'];
export const WX_WORDS: Record<WxCond, string> = {
  clear: 'clear', partly_cloudy: 'partly cloudy', cloudy: 'cloudy', fog: 'fog', drizzle: 'light rain', rain: 'rain',
  heavy_rain: 'heavy rain', snow: 'snow', sleet: 'sleet', thunder: 'thunderstorm', wind: 'windy', unknown: 'conditions unknown',
};

export type WxSource = 'om' | 'nws';
export interface WxValue {
  tempC: number | null;
  cond: WxCond | null;
  isDay: boolean;
  /** Age of the observation in minutes (obs time, not fetch time). */
  ageMin: number;
  source: WxSource;
}

/** Show the age suffix after this (NWS obs normally lag ~20 min). */
export const WX_AGE_SHOW_MIN = 20;
export const WX_DIM_MIN = 90;
export const WX_HIDE_MIN = 180;

export interface WxView {
  /** e.g. "79°" */
  temp: string;
  /** e.g. "25m" / "1h45"; null while fresh */
  age: string | null;
  dim: boolean;
  cond: WxCond | null;
  night: boolean;
  aria: string;
  credit: string;
}

export const WX_CREDIT: Record<WxSource, string> = { om: 'Weather data by Open-Meteo.com', nws: 'Weather: NOAA/NWS' };
export const WX_CREDIT_URL = 'https://open-meteo.com/';

/**
 * The weather staleness schedule (one place): aged (show the age) after WX_AGE_SHOW_MIN, dimmed after WX_DIM_MIN,
 * hidden after WX_HIDE_MIN. The OAT readout (wxView) and the WX radar age label (wxRadar.radarAgeView) both use it.
 */
export function wxStaleness(ageMin: number): { aged: boolean; dim: boolean; hidden: boolean } {
  return { aged: ageMin > WX_AGE_SHOW_MIN, dim: ageMin > WX_DIM_MIN, hidden: !(ageMin <= WX_HIDE_MIN) };
}

export function fmtAge(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}
/** Spoken age: "12 minutes", "1 hour 45 minutes". */
export function ageSpan(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} minute${r === 1 ? '' : 's'}` : ''}`;
}
const ageWords = (min: number) => `${ageSpan(min)} old`;

/** Value → what the HUD shows (null = slot hidden). Units: 'mph' → °F, 'kph' → °C. */
export function wxView(v: WxValue | null, unit: 'mph' | 'kph'): WxView | null {
  const st = v ? wxStaleness(v.ageMin) : null;
  if (!v || !st || v.tempC == null || !Number.isFinite(v.tempC) || st.hidden) return null;
  const t = Math.round(unit === 'kph' ? v.tempC : v.tempC * 9 / 5 + 32);
  const temp = `${t}°`;
  const aged = st.aged;
  const parts = [`Outside air ${t} degrees ${unit === 'kph' ? 'Celsius' : 'Fahrenheit'}`];
  if (v.cond) parts.push(WX_WORDS[v.cond]);
  parts.push(aged ? ageWords(v.ageMin) : 'live');
  return {
    temp,
    age: aged ? fmtAge(v.ageMin) : null,
    dim: st.dim,
    cond: v.cond,
    night: !v.isDay && !!v.cond && WX_NIGHT_CONDS.includes(v.cond),
    aria: parts.join(', '),
    credit: WX_CREDIT[v.source],
  };
}
