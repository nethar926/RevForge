/**
 * Current outside-air observation for the CJ OAT readout. The live weather module (weather/poller.ts) sets it; it is
 * persisted ({tempC, cond, isDay, obsAt, source}) so the last value survives reloads and keeps aging (dim > 90 min,
 * hidden > 3 h). CjV2Layer turns the observation time into an age for wxView. null = nothing to show.
 */
import { storageKey } from '../../lib/storageKey.ts';
import type { WxCond, WxSource, WxValue } from './wxView.ts';

export interface WxObs {
  tempC: number | null;
  cond: WxCond | null;
  isDay: boolean;
  /** Observation time (ms); the age comes from this, never from the fetch time. */
  obsAt: number;
  source: WxSource;
}
export const WX_LAST_KEY = 'revforge.pack.carrier-jet.wx.last';
const valid = (o: unknown): o is WxObs => {
  const v = o as WxObs | null;
  return !!v && (v.tempC === null || Number.isFinite(v.tempC)) && Number.isFinite(v.obsAt) && (v.source === 'om' || v.source === 'nws') && typeof v.isDay === 'boolean';
};
function load(): WxObs | null {
  try {
    const v = typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(storageKey(WX_LAST_KEY)) ?? 'null');
    return valid(v) ? v : null;
  } catch {
    return null;
  }
}
let cur: WxObs | null = load();
const ls = new Set<() => void>();
export const getWxObs = (): WxObs | null => cur;
export function setWxObs(o: WxObs | null): void {
  if (o === cur) return;
  cur = o;
  try {
    if (typeof localStorage !== 'undefined') {
      if (o) localStorage.setItem(storageKey(WX_LAST_KEY), JSON.stringify(o));
      else localStorage.removeItem(storageKey(WX_LAST_KEY));
    }
  } catch { /* private mode */ }
  for (const l of [...ls]) l();
}
export function subscribeWxObs(l: () => void): () => void {
  ls.add(l);
  return () => void ls.delete(l);
}
/** Observation → wxView input at `now`. */
export const wxValueAt = (o: WxObs | null, now: number): WxValue | null =>
  o ? { tempC: o.tempC, cond: o.cond, isDay: o.isDay, source: o.source, ageMin: Math.max(0, (now - o.obsAt) / 60000) } : null;
