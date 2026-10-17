/**
 * OAT refresh schedule (RESEARCH.md §5): first fetch on the first GPS fix; then every 15 min (±60 s jitter) or after a
 * move of more than 10 km, never less than 5 min after the last fetch. Paused while the page is hidden. Failures keep
 * the last value and retry at 30 s, 2 min, 5 min, then the normal schedule; HTTP 429/503 wait at least 5 min.
 * Clock, timers, fetch and storage are injected (node tests use fakes, never the network).
 */
import { fetchWeather, HttpError, type Fetch, type KV, type WxObs } from './sources.ts';

export const WX_REFRESH_MS = 15 * 60000;
export const WX_MIN_GAP_MS = 5 * 60000;
export const WX_MOVE_KM = 10;
export const WX_JITTER_MS = 60000;
export const WX_RETRY_MS = [30000, 120000, 300000] as const;
export const WX_TICK_MS = 15000;
export const WX_FETCH_TIMEOUT_MS = 12000;

export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface PollState {
  lastAt: number | null;
  lastPos: { lat: number; lon: number } | null;
  /** Next scheduled refresh (jittered). */
  dueAt: number;
  /** Earliest retry after a failure (0 = none). */
  retryAt: number;
  fails: number;
}
export const POLL_INIT: PollState = { lastAt: null, lastPos: null, dueAt: 0, retryAt: 0, fails: 0 };

/** Should a fetch start now? */
export function wxDue(s: PollState, pos: { lat: number; lon: number } | null, now: number, hidden: boolean): boolean {
  if (!pos || hidden) return false;
  if (s.retryAt && now < s.retryAt) return false;
  if (s.retryAt && now >= s.retryAt) return true;
  if (s.lastAt == null) return true;
  if (now >= s.dueAt) return true;
  return now - s.lastAt >= WX_MIN_GAP_MS && !!s.lastPos && km(s.lastPos, pos) > WX_MOVE_KM;
}
export function wxOk(_s: PollState, pos: { lat: number; lon: number }, now: number, rnd: number): PollState {
  return { lastAt: now, lastPos: pos, dueAt: now + WX_REFRESH_MS + Math.round((rnd * 2 - 1) * WX_JITTER_MS), retryAt: 0, fails: 0 };
}
export function wxFail(s: PollState, now: number, status: number | null): PollState {
  const fails = s.fails + 1;
  let wait: number = fails <= WX_RETRY_MS.length ? WX_RETRY_MS[fails - 1] : WX_REFRESH_MS;
  if (status === 429 || status === 503) wait = Math.max(wait, WX_MIN_GAP_MS);
  return { ...s, fails, retryAt: now + wait };
}

export interface PollerDeps {
  fetch: Fetch;
  kv: KV | null;
  prefix: string;
  now(): number;
  random(): number;
  hidden(): boolean;
  getPos(): { lat: number; lon: number } | null;
  onObs(o: WxObs): void;
  setInterval(f: () => void, ms: number): unknown;
  clearInterval(t: unknown): void;
}

/** Start polling; returns { poke (on a fix / visibility change), stop }. */
export function startWxPoller(d: PollerDeps) {
  let s = POLL_INIT;
  let busy = false;
  let ac: AbortController | null = null;
  let dead = false;
  const poke = () => {
    if (dead || busy) return;
    const pos = d.getPos();
    const now = d.now();
    if (!pos || !wxDue(s, pos, now, d.hidden())) return;
    busy = true;
    ac = new AbortController();
    const a = ac;
    const to = setTimeout(() => a.abort(), WX_FETCH_TIMEOUT_MS);
    fetchWeather(d.fetch, d.kv, d.prefix, pos.lat, pos.lon, now, a.signal)
      .then((o) => {
        if (dead) return;
        s = wxOk(s, pos, d.now(), d.random());
        d.onObs(o);
      })
      .catch((e: unknown) => {
        if (dead) return;
        s = wxFail(s, d.now(), e instanceof HttpError ? e.status : null);
      })
      .finally(() => {
        clearTimeout(to);
        busy = false;
      });
  };
  const t = d.setInterval(poke, WX_TICK_MS);
  poke();
  return {
    poke,
    state: () => s,
    stop() {
      dead = true;
      ac?.abort();
      d.clearInterval(t);
    },
  };
}
