/**
 * Live OAT sources (RESEARCH.md): NWS station observations in the US, Open-Meteo outside the US or as the fallback.
 * Keyless, CORS-open. Requests carry only an Accept header (never User-Agent: browsers drop it and it adds a
 * preflight). Coordinates are rounded to 2 dp before any request or cache key. Pure apart from the injected fetch and
 * storage, so node tests run on mocked fetch.
 */
import type { WxCond } from '../wxView.ts';
import type { WxObs } from '../wxStore.ts';
import { nwsIconCond, sunUp, textCond, wmoCond } from './conditions.ts';

export type { WxObs };
export type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export const NWS = 'https://api.weather.gov';
export const OM = 'https://api.open-meteo.com/v1/forecast';
export const NWS_HEADERS = { Accept: 'application/geo+json' } as const;
export const OM_HEADERS = { Accept: 'application/json' } as const;
export const POINTS_TTL_MS = 24 * 3600 * 1000;
export const NWS_TEMP_MAX_MIN = 75;
export const NWS_COND_MAX_MIN = 90;

export class HttpError extends Error {
  status: number;
  constructor(status: number, what: string) {
    super(`${what} ${status}`);
    this.status = status;
  }
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
export const cellKey = (lat: number, lon: number) => `${round2(lat).toFixed(2)},${round2(lon).toFixed(2)}`;

interface PointEntry { nws: boolean; stations?: string[]; expires: number }

async function getJson(f: Fetch, url: string, headers: Record<string, string>, signal?: AbortSignal, what = 'fetch') {
  const r = await f(url, { headers, signal });
  if (!r.ok) throw new HttpError(r.status, what);
  return r.json();
}

/** /points → nearest 3 station ids (cached 24 h per 2-dp cell; a 404 caches the cell as outside NWS coverage). */
export async function nwsStations(f: Fetch, kv: KV | null, prefix: string, lat: number, lon: number, now: number, signal?: AbortSignal): Promise<string[] | null> {
  const key = `${prefix}points:${cellKey(lat, lon)}`;
  try {
    const c = kv && (JSON.parse(kv.getItem(key) ?? 'null') as PointEntry | null);
    if (c && c.expires > now) return c.nws ? c.stations ?? [] : null;
  } catch { /* bad cache entry: re-resolve */ }
  const put = (e: PointEntry) => {
    try {
      kv?.setItem(key, JSON.stringify(e));
    } catch { /* quota / private mode */ }
  };
  let pts: { properties?: { observationStations?: string } };
  try {
    pts = (await getJson(f, `${NWS}/points/${round2(lat)},${round2(lon)}`, NWS_HEADERS, signal, 'points')) as typeof pts;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      put({ nws: false, expires: now + POINTS_TTL_MS });
      return null;
    }
    throw e;
  }
  const url = pts.properties?.observationStations;
  if (typeof url !== 'string' || !url.startsWith(NWS)) throw new Error('points: no stations');
  const st = (await getJson(f, `${url}?limit=3`, NWS_HEADERS, signal, 'stations')) as { features?: { properties?: { stationIdentifier?: string } }[] };
  const ids = (st.features ?? []).map((x) => x.properties?.stationIdentifier).filter((s): s is string => typeof s === 'string' && /^[A-Z0-9]{3,6}$/.test(s)).slice(0, 3);
  put({ nws: true, stations: ids, expires: now + POINTS_TTL_MS });
  return ids;
}

interface NwsObsProps { timestamp?: string; temperature?: { value?: number | null; qualityControl?: string }; textDescription?: string; icon?: string | null }

/** Newest valid temp ≤ 75 min, and newest condition ≤ 90 min (icon first, then text) from one station's obs list. */
export function pickStation(features: { properties?: NwsObsProps }[], now: number, lat: number, lon: number) {
  const obs = features.map((x) => x.properties ?? {}).map((p) => ({ p, t: Date.parse(p.timestamp ?? '') })).filter((o) => Number.isFinite(o.t)).sort((a, b) => b.t - a.t);
  const temp = obs.find(({ p, t }) => typeof p.temperature?.value === 'number' && Number.isFinite(p.temperature.value) && p.temperature.qualityControl !== 'X' && now - t <= NWS_TEMP_MAX_MIN * 60000 && t <= now + 5 * 60000);
  let cond: { cond: WxCond; isDay: boolean } | null = null;
  for (const { p, t } of obs) {
    if (now - t > NWS_COND_MAX_MIN * 60000) break;
    const ic = nwsIconCond(p.icon);
    const tc = textCond(p.textDescription);
    if (ic && (ic.cond !== 'unknown' || !tc)) { cond = ic; break; }
    if (tc) { cond = { cond: tc, isDay: ic?.isDay ?? sunUp(lat, lon, t) }; break; }
  }
  return { temp: temp ? { c: temp.p.temperature!.value as number, t: temp.t } : null, cond };
}

/** NWS chain: up to 3 stations nearest-first; the first with a temp wins, a missing condition is borrowed from the next. */
export async function nwsObs(f: Fetch, stations: string[], lat: number, lon: number, now: number, signal?: AbortSignal): Promise<WxObs | null> {
  let hit: { c: number; t: number } | null = null;
  let cond: { cond: WxCond; isDay: boolean } | null = null;
  for (const id of stations) {
    let j: { features?: { properties?: NwsObsProps }[] };
    try {
      j = (await getJson(f, `${NWS}/stations/${id}/observations?limit=6`, NWS_HEADERS, signal, 'observations')) as typeof j;
    } catch (e) {
      if (signal?.aborted) throw e;
      continue;
    }
    const s = pickStation(j.features ?? [], now, lat, lon);
    if (!hit && s.temp) {
      hit = s.temp;
      cond = s.cond;
    } else if (hit && !cond && s.cond) cond = s.cond;
    if (hit && cond) break;
  }
  if (!hit) return null;
  return { tempC: hit.c, cond: cond?.cond ?? null, isDay: cond?.isDay ?? sunUp(lat, lon, hit.t), obsAt: hit.t, source: 'nws' };
}

/** Open-Meteo current conditions (model data, °C, GMT time). */
export async function omObs(f: Fetch, lat: number, lon: number, signal?: AbortSignal): Promise<WxObs> {
  const j = (await getJson(f, `${OM}?latitude=${round2(lat)}&longitude=${round2(lon)}&current=temperature_2m,weather_code,is_day&timezone=GMT`, OM_HEADERS, signal, 'open-meteo')) as { current?: { time?: string; temperature_2m?: number; weather_code?: number; is_day?: number } };
  const c = j.current;
  const t = c?.time ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(c.time) ? c.time : `${c.time}Z`) : NaN;
  if (!c || typeof c.temperature_2m !== 'number' || !Number.isFinite(t)) throw new Error('open-meteo: no current');
  return { tempC: c.temperature_2m, cond: wmoCond(c.weather_code), isDay: c.is_day === 1, obsAt: t, source: 'om' };
}

/** One refresh: cell cached as non-US → Open-Meteo; else NWS stations → Open-Meteo. Throws when both fail. */
export async function fetchWeather(f: Fetch, kv: KV | null, prefix: string, lat: number, lon: number, now: number, signal?: AbortSignal): Promise<WxObs> {
  let nwsErr: unknown = null;
  try {
    const st = await nwsStations(f, kv, prefix, lat, lon, now, signal);
    if (st && st.length) {
      const o = await nwsObs(f, st, lat, lon, now, signal);
      if (o) return o;
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    nwsErr = e;
  }
  try {
    return await omObs(f, lat, lon, signal);
  } catch (e) {
    throw e instanceof HttpError || !(nwsErr instanceof HttpError) ? e : nwsErr;
  }
}
