import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { latestGpsFix, subscribeGpsFixes, type GpsFix } from '../hooks/gpsFixes.ts';
import { storageKey } from '../lib/storageKey.ts';
import type { RfLayout } from './layout.ts';

/**
 * Heading for pack HUDs (framework; first consumer: CarrierJetMount → CarrierJetHud `heading`).
 *
 * Sources, in priority order:
 *  1. Device compass while it reports FRESH data (< COMPASS_FRESH_MS old) — phones only:
 *     iOS `webkitCompassHeading` after DeviceOrientationEvent.requestPermission (user gesture,
 *     the "Allow compass" button), Chrome/Android `deviceorientationabsolute` alpha.
 *  2. GPS from the app's single geolocation watch (hooks/gpsFixes): coords.heading while moving,
 *     else the great-circle initial bearing between two fixes ≥ MIN_BEARING_DIST_M apart at
 *     > MIN_BEARING_SPEED_MS.
 * Once any value exists it is HELD (stopped, no new fix, compass gone stale) — never back to undefined.
 * Light circular smoothing (359 → 0 wrap safe). React state is throttled (HEADING_EMIT_MS, ≥ 1°).
 * Parked heading (Wilson, Oct 16): Tesla has no compass and GPS gives no heading at 0 mph, so the last
 * LIVE heading and its time are saved (localStorage, ≤ 1 write / HEADING_SAVE_MS) and restored on load.
 * `stale` = no live source (no fresh compass, no new GPS heading within HEADING_LIVE_MS): the shown
 * value is held / restored, and the HUD marks it (CarrierJetHud headingStale → NEEDS MOTION).
 */

export const COMPASS_FRESH_MS = 1000;
export const MIN_BEARING_DIST_M = 8;
export const MIN_BEARING_SPEED_MS = 1.5;
/** Below this coords.speed (m/s) a reported coords.heading is treated as "stopped" and ignored. */
export const STOPPED_SPEED_MS = 0.5;
/** Fixes worse than this (m) never produce a computed bearing. */
export const MAX_BEARING_ACCURACY_M = 50;
/** A bearing anchor older than this is replaced (a long stop must not bridge to a later fix). */
export const ANCHOR_MAX_AGE_MS = 15000;
export const GPS_SMOOTHING = 0.6;
export const COMPASS_SMOOTHING = 0.25;
export const HEADING_EMIT_MS = 250;
export const HEADING_EMIT_MIN_DEG = 1;
/** A GPS heading older than this (ms, by fix time) is no longer live. */
export const HEADING_LIVE_MS = 5000;
/** Saved last heading: at most one localStorage write per this many ms. */
export const HEADING_SAVE_MS = 5000;
export const LAST_HEADING_KEY = 'revforge.heading.last';

const RAD = Math.PI / 180;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Degrees normalised into [0, 360). */
export function normDeg(d: number): number {
  const r = d % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r; // also folds -0 → 0
}

/** Signed shortest turn from `from` to `to`, in (-180, 180]. */
export function angleDiff(to: number, from: number): number {
  const d = normDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Exponential smoothing on the circle: moves `prev` toward `next` by `alpha` of the shortest turn. */
export function smoothAngle(prev: number | undefined, next: number, alpha: number): number {
  if (prev === undefined || !finite(prev)) return normDeg(next);
  return normDeg(prev + alpha * angleDiff(next, prev));
}

/** Haversine distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD, dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** Great-circle initial bearing from point 1 to point 2, degrees from true north in [0, 360). */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normDeg(Math.atan2(y, x) / RAD);
}

/** Chrome/Android `deviceorientationabsolute` alpha (counter-clockwise from north) → compass heading. */
export function headingFromAlpha(alpha: number): number {
  return normDeg(360 - alpha);
}

/**
 * Source fusion (pure; no timers, no DOM). Feed GPS fixes and compass readings, read value(now).
 */
export class HeadingFusion {
  private gps: number | undefined;
  private compass: number | undefined;
  private compassAt: number | null = null;
  private anchor: GpsFix | null = null;
  private last: number | undefined;
  private gpsAt: number | null = null;

  /** A GPS fix. Returns true when it changed the GPS heading. */
  onGps(fix: GpsFix): boolean {
    if (!finite(fix.latitude) || !finite(fix.longitude)) return false;
    const reportedSpeed = finite(fix.speed) && fix.speed >= 0 ? fix.speed : null;
    const stopped = reportedSpeed !== null && reportedSpeed < STOPPED_SPEED_MS;
    let raw: number | undefined;
    if (finite(fix.heading) && !stopped) raw = normDeg(fix.heading);
    // Two-fix bearing (coords.heading null/NaN, e.g. Tesla): also keeps the anchor current.
    const goodAcc = !finite(fix.accuracy) || fix.accuracy <= MAX_BEARING_ACCURACY_M;
    const a = this.anchor;
    if (!goodAcc) {
      /* skip: a poor fix neither anchors nor yields a bearing */
    } else if (!a || fix.timestamp - a.timestamp > ANCHOR_MAX_AGE_MS || fix.timestamp < a.timestamp) {
      this.anchor = fix;
    } else {
      const d = distanceM(a.latitude, a.longitude, fix.latitude, fix.longitude);
      if (d >= MIN_BEARING_DIST_M) {
        const dt = (fix.timestamp - a.timestamp) / 1000;
        const speed = reportedSpeed ?? (dt > 0 ? d / dt : 0);
        if (raw === undefined && speed > MIN_BEARING_SPEED_MS) raw = initialBearing(a.latitude, a.longitude, fix.latitude, fix.longitude);
        this.anchor = fix;
      }
    }
    if (raw === undefined) return false; // stopped / no new value: hold
    this.gps = smoothAngle(this.gps, raw, GPS_SMOOTHING);
    this.gpsAt = fix.timestamp;
    return true;
  }

  /** A compass reading (degrees from north) at wall time `now` (ms). */
  onCompass(deg: number, now: number): void {
    if (!finite(deg) || !finite(now)) return;
    this.compass = smoothAngle(this.compassFresh(now) ? this.compass : undefined, deg, COMPASS_SMOOTHING);
    this.compassAt = now;
  }

  compassFresh(now: number): boolean {
    return this.compassAt !== null && now - this.compassAt < COMPASS_FRESH_MS && this.compass !== undefined;
  }

  /** A live heading source exists at `now`: fresh compass, or a GPS heading from a fix < HEADING_LIVE_MS old. */
  live(now: number): boolean {
    return this.compassFresh(now) || (this.gpsAt !== null && now - this.gpsAt < HEADING_LIVE_MS && now >= this.gpsAt - HEADING_LIVE_MS);
  }

  /** Which source value(now) uses. */
  source(now: number): 'compass' | 'gps' | 'hold' | 'none' {
    if (this.compassFresh(now)) return 'compass';
    if (this.gps !== undefined) return 'gps';
    return this.last !== undefined ? 'hold' : 'none';
  }

  /** Current heading: fresh compass, else GPS, else the last value given (held), else undefined. */
  value(now: number): number | undefined {
    const src = this.source(now);
    const v = src === 'compass' ? this.compass : src === 'gps' ? this.gps : this.last;
    if (v !== undefined) this.last = v;
    return v;
  }
}

/**
 * Change rule for React state (the caller already coalesces to ≤ 1 update per HEADING_EMIT_MS):
 * first value; ≥ HEADING_EMIT_MIN_DEG of change; or the whole-degree readout changes (so a smoothed
 * value settling within 1° of the target still lands on the right digits).
 */
export function shouldEmit(shown: number | undefined, next: number | undefined): next is number {
  if (next === undefined) return false;
  if (shown === undefined || Math.abs(angleDiff(next, shown)) >= HEADING_EMIT_MIN_DEG) return true;
  return Math.round(normDeg(next)) % 360 !== Math.round(normDeg(shown)) % 360;
}

// ------------------------------------------------------------------ parked heading: last live value, persisted

export interface SavedHeading {
  /** Degrees from north, [0, 360). */
  deg: number;
  /** When it was taken (ms since epoch). */
  at: number;
}
interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}
const localKV = (): KV | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Saved last live heading, or null (none / unreadable / junk). */
export function readSavedHeading(kv: KV | null = localKV()): SavedHeading | null {
  try {
    const raw = kv?.getItem(storageKey(LAST_HEADING_KEY));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedHeading>;
    return finite(v?.deg) && finite(v?.at) ? { deg: normDeg(v.deg), at: v.at } : null;
  } catch {
    return null;
  }
}

/**
 * Throttled writer (pure apart from the KV): offer() every live update; it writes at once when the last write is
 * ≥ `every` ms old, else keeps the newest value pending; flush(now) writes a due pending value (the hook calls it
 * from a timer at dueIn(), and unconditionally on pagehide / unmount with force).
 */
export class HeadingSaver {
  private lastWrite = -Infinity;
  private pending: SavedHeading | null = null;
  writes = 0;
  private readonly kv: KV | null;
  private readonly every: number;
  constructor(kv: KV | null = localKV(), every = HEADING_SAVE_MS) {
    this.kv = kv;
    this.every = every;
  }
  offer(deg: number, at: number): boolean {
    if (!finite(deg) || !finite(at)) return false;
    this.pending = { deg: normDeg(deg), at };
    return this.flush(at);
  }
  /** ms until the pending value may be written (0 = now), or null when nothing is pending. */
  dueIn(now: number): number | null {
    return this.pending ? Math.max(0, this.lastWrite + this.every - now) : null;
  }
  flush(now: number, force = false): boolean {
    if (!this.pending || (!force && now - this.lastWrite < this.every)) return false;
    try {
      this.kv?.setItem(storageKey(LAST_HEADING_KEY), JSON.stringify(this.pending));
    } catch {
      /* quota / private mode: session only */
    }
    this.writes++;
    this.lastWrite = now;
    this.pending = null;
    return true;
  }
}

/**
 * What the HUD shows (pure): a live heading wins; otherwise the held value, else the saved one (stale);
 * none at all → undefined ('---'), still stale.
 */
export function headingView(live: boolean, value: number | undefined, saved: SavedHeading | null): { heading: number | undefined; stale: boolean } {
  if (live && value !== undefined) return { heading: value, stale: false };
  return { heading: value ?? saved?.deg, stale: true };
}

// ------------------------------------------------------------------ device compass permission (iOS)

export const COMPASS_PREF_KEY = 'revforge.compass';
/** Saved user choice: granted (use it), denied (iOS refused; tap retries), off (user switched it off). */
export type CompassPref = 'granted' | 'denied' | 'off' | null;
export type CompassSwitchState = 'off' | 'on' | 'denied';

/** COMPASS switch state from the saved choice + whether iOS granted it this session (pure). */
export function compassSwitchState(pref: CompassPref, granted: boolean): CompassSwitchState {
  if (pref === 'denied') return 'denied';
  return pref === 'granted' && granted ? 'on' : 'off';
}

function readPref(): CompassPref {
  try {
    const v = localStorage.getItem(storageKey(COMPASS_PREF_KEY));
    return v === 'granted' || v === 'denied' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}
function writePref(v: Exclude<CompassPref, null>) {
  try {
    localStorage.setItem(storageKey(COMPASS_PREF_KEY), v);
  } catch {
    /* session only */
  }
}

type PermissionFn = () => Promise<'granted' | 'denied' | 'default' | string>;
/**
 * iOS 13+: DeviceOrientationEvent.requestPermission. Chromium (153+, so Android Chrome too) now
 * also exposes requestPermission, so iOS is identified by requestPermission AND WebKit's
 * webkitCompassHeading attribute on the event prototype; Android keeps the absolute-alpha path
 * and never sees the switch.
 */
function iosPermissionFn(): PermissionFn | null {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return null;
  const fn = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
  if (typeof fn !== 'function' || !('webkitCompassHeading' in DeviceOrientationEvent.prototype)) return null;
  return fn.bind(DeviceOrientationEvent);
}
export const isPhoneLayout = (l: RfLayout) => l === 'portrait' || l === 'phone-landscape';
/** The COMPASS switch exists only where the iOS permission flow exists, in the phone layouts (as 81f7c40). */
export const compassFlowAvailable = (layout: RfLayout) => isPhoneLayout(layout) && iosPermissionFn() !== null;

/**
 * Shared compass permission store: the CJ switch row (COMPASS) and useHeading read the same state.
 * Taps run requestPermission from the user gesture; a saved 'granted' is re-requested silently
 * once (iOS may want a fresh gesture: then the switch shows off until tapped).
 */
interface CompassSnap { pref: CompassPref; granted: boolean; state: CompassSwitchState }
let cPref: CompassPref | undefined;
let cGranted = false;
let cSnap: CompassSnap | null = null;
let silentTried = false;
const cListeners = new Set<() => void>();
function cPublish() {
  cSnap = null;
  for (const l of [...cListeners]) l();
}
export function getCompassSnapshot(): CompassSnap {
  if (cPref === undefined) cPref = readPref();
  if (!cSnap) cSnap = { pref: cPref, granted: cGranted, state: compassSwitchState(cPref, cGranted) };
  return cSnap;
}
export function subscribeCompass(l: () => void): () => void {
  cListeners.add(l);
  getCompassSnapshot();
  if (!silentTried && cPref === 'granted' && !cGranted) {
    const fn = iosPermissionFn();
    if (fn) {
      silentTried = true;
      fn().then(
        (r) => {
          if (r === 'granted' && cPref === 'granted') {
            cGranted = true;
            cPublish();
          }
        },
        () => {
          /* needs a gesture: stays off until tapped */
        },
      );
    }
  }
  return () => {
    cListeners.delete(l);
  };
}
/** COMPASS switch tap (user gesture). on → off; off / denied → requestPermission (retry allowed). */
export function toggleCompass(): void {
  getCompassSnapshot();
  if (cPref === 'granted' && cGranted) {
    cPref = 'off';
    cGranted = false;
    writePref('off');
    cPublish();
    return;
  }
  const fn = iosPermissionFn();
  if (!fn) return;
  fn().then(
    (r) => {
      const next = r === 'granted' ? 'granted' : 'denied';
      cPref = next;
      cGranted = next === 'granted';
      writePref(next);
      cPublish();
    },
    () => {
      /* no gesture / error: state unchanged, the user can tap again */
    },
  );
}

/** Screen rotation (deg) so the heading is that of the screen's "up" in landscape. */
function screenAngle(): number {
  try {
    const a = screen.orientation?.angle;
    if (finite(a)) return a;
  } catch {
    /* no screen.orientation */
  }
  const w = (window as unknown as { orientation?: number }).orientation;
  return finite(w) ? w : 0;
}

// ------------------------------------------------------------------ React hook

/**
 * Heading for a pack mount. GPS fixes come from the app's existing watch (no second watch);
 * the device compass is only touched in the phone layouts (iOS once the COMPASS switch granted it,
 * Android when absolute-orientation events really carry alpha).
 */
export function useHeading(layout: RfLayout): { heading: number | undefined; stale: boolean } {
  const fusion = useRef<HeadingFusion | null>(null);
  if (!fusion.current) fusion.current = new HeadingFusion();
  const saved = useRef<SavedHeading | null | undefined>(undefined);
  if (saved.current === undefined) saved.current = readSavedHeading();
  const saver = useRef<HeadingSaver | null>(null);
  if (!saver.current) saver.current = new HeadingSaver();
  const [heading, setHeading] = useState<number | undefined>(() => saved.current?.deg);
  const [stale, setStale] = useState(true);
  const shown = useRef<number | undefined>(saved.current?.deg);
  const lastEmit = useRef(0);
  const timer = useRef<number | null>(null);
  const staleTimer = useRef<number | null>(null);
  const liveTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const now = Date.now();
    const f = fusion.current!;
    const live = f.live(now);
    const view = headingView(live, f.value(now), saved.current ?? null);
    if (shouldEmit(shown.current, view.heading)) {
      const r = normDeg(Math.round(view.heading * 10) / 10);
      shown.current = r;
      lastEmit.current = now;
      setHeading(r);
    }
    setStale(view.stale);
    if (live && view.heading !== undefined) {
      // Persist the live value (throttled), and re-check liveness once it would expire.
      const s = saver.current!;
      s.offer(view.heading, now);
      const due = s.dueIn(now);
      if (due !== null && saveTimer.current === null)
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null;
          saver.current!.flush(Date.now());
        }, due);
      if (liveTimer.current !== null) window.clearTimeout(liveTimer.current);
      liveTimer.current = window.setTimeout(() => {
        liveTimer.current = null;
        flushRef.current();
      }, HEADING_LIVE_MS + 50);
    }
  }, []);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  /** Coalesce inputs: at most one React update per HEADING_EMIT_MS. */
  const schedule = useCallback(() => {
    if (timer.current !== null) return;
    const wait = Math.max(0, HEADING_EMIT_MS - (Date.now() - lastEmit.current));
    timer.current = window.setTimeout(flush, wait);
  }, [flush]);

  // GPS: the shared feed from useGeolocation.
  useEffect(() => {
    const f = fusion.current!;
    const prior = latestGpsFix();
    if (prior) f.onGps(prior);
    schedule(); // first view: live, held or restored (stale)
    return subscribeGpsFixes((fix) => {
      if (f.onGps(fix)) schedule();
    });
  }, [schedule]);

  // Compass (phones only).
  const phone = isPhoneLayout(layout);
  const hasPerm = phone && iosPermissionFn() !== null;
  const compass = useSyncExternalStore(subscribeCompass, getCompassSnapshot, getCompassSnapshot);
  const iosOn = hasPerm && compass.state === 'on';

  const onReading = useCallback(
    (deg: number) => {
      const now = Date.now();
      fusion.current!.onCompass(normDeg(deg + screenAngle()), now);
      schedule();
      // When readings stop, fall back to GPS once the compass goes stale.
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
      staleTimer.current = window.setTimeout(() => {
        staleTimer.current = null;
        schedule();
      }, COMPASS_FRESH_MS + 50);
    },
    [schedule],
  );

  // Chrome / Android: absolute orientation, used only when events really carry alpha.
  useEffect(() => {
    if (!phone || hasPerm || typeof window === 'undefined') return;
    const on = (e: Event) => {
      const alpha = (e as DeviceOrientationEvent).alpha;
      if (finite(alpha)) onReading(headingFromAlpha(alpha));
    };
    window.addEventListener('deviceorientationabsolute', on);
    return () => window.removeEventListener('deviceorientationabsolute', on);
  }, [phone, hasPerm, onReading]);

  // iOS: webkitCompassHeading while the COMPASS switch is on.
  useEffect(() => {
    if (!iosOn) return;
    const on = (e: Event) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
      if (finite(ev.webkitCompassHeading) && !(finite(ev.webkitCompassAccuracy) && ev.webkitCompassAccuracy < 0)) onReading(ev.webkitCompassHeading);
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [iosOn, onReading]);

  // Pending saved heading: written on pagehide and on unmount, so a quick park + close keeps the last value.
  useEffect(() => {
    const save = () => saver.current!.flush(Date.now(), true);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
      for (const t of [timer, staleTimer, liveTimer, saveTimer]) if (t.current !== null) window.clearTimeout(t.current);
    };
  }, []);

  return { heading, stale };
}
