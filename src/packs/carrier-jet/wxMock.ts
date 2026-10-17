/**
 * MOCK (mock/cj-map-first, not shipped): Carrier Jet OAT (outside air temperature) readout + condition glyph.
 * Pure model (node-testable). Driven only by fake values from the URL (?cjWxMock=live|aged|dim|hidden|tempOnly,
 * optional &cjWxCond=<WxCond> &cjWxNight=1 &cjWxTemp=<°C> &cjWxSrc=om|nws); no fetching. Data spec:
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
export type WxState = 'live' | 'aged' | 'dim' | 'hidden' | 'tempOnly';
export const WX_STATES: readonly WxState[] = ['live', 'aged', 'dim', 'hidden', 'tempOnly'];

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

export function fmtAge(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}
function ageWords(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} old`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} minute${r === 1 ? '' : 's'}` : ''} old`;
}

/** Value → what the HUD shows (null = slot hidden). Units: 'mph' → °F, 'kph' → °C. */
export function wxView(v: WxValue | null, unit: 'mph' | 'kph'): WxView | null {
  if (!v || v.tempC == null || !Number.isFinite(v.tempC) || !(v.ageMin <= WX_HIDE_MIN)) return null;
  const t = Math.round(unit === 'kph' ? v.tempC : v.tempC * 9 / 5 + 32);
  const temp = `${t}°`;
  const aged = v.ageMin > WX_AGE_SHOW_MIN;
  const parts = [`Outside air ${t} degrees ${unit === 'kph' ? 'Celsius' : 'Fahrenheit'}`];
  if (v.cond) parts.push(WX_WORDS[v.cond]);
  parts.push(aged ? ageWords(v.ageMin) : 'live');
  return {
    temp,
    age: aged ? fmtAge(v.ageMin) : null,
    dim: v.ageMin > WX_DIM_MIN,
    cond: v.cond,
    night: !v.isDay && !!v.cond && WX_NIGHT_CONDS.includes(v.cond),
    aria: parts.join(', '),
    credit: WX_CREDIT[v.source],
  };
}

/** Fake values per mock state (Jacksonville evening: 26 °C = 79 °F). */
export function wxMockValue(state: WxState, o: { cond?: WxCond | null; night?: boolean; tempC?: number; source?: WxSource } = {}): WxValue | null {
  const cond = o.cond === undefined ? 'partly_cloudy' : o.cond;
  const base = { tempC: o.tempC ?? 26.1, isDay: !o.night, source: o.source ?? 'om' } as const;
  switch (state) {
    case 'live': return { ...base, cond, ageMin: 4 };
    case 'aged': return { ...base, cond, ageMin: 25 };
    case 'dim': return { ...base, cond, ageMin: 105 };
    case 'tempOnly': return { ...base, cond: null, ageMin: 4 };
    case 'hidden': return null;
  }
}

/** ?cjWxMock=… → mock value, or undefined when the mock is off. */
export function wxMockFromQuery(search: string): { value: WxValue | null } | undefined {
  const q = new URLSearchParams(search);
  const s = q.get('cjWxMock') as WxState | null;
  if (!s || !WX_STATES.includes(s)) return undefined;
  const c = q.get('cjWxCond');
  const cond = c && (WX_CONDS as readonly string[]).includes(c) ? (c as WxCond) : undefined;
  const t = q.get('cjWxTemp');
  const tempC = t != null && t !== '' && Number.isFinite(+t) ? +t : undefined;
  const src = q.get('cjWxSrc') === 'nws' ? 'nws' : 'om';
  return { value: wxMockValue(s, { cond, night: q.get('cjWxNight') === '1', tempC, source: src }) };
}
