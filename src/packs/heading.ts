import { useCallback, useEffect, useRef, useState } from 'react';
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

// ------------------------------------------------------------------ React hook

export const COMPASS_PREF_KEY = 'revforge.compass';
type CompassPref = 'granted' | 'denied' | null;
function readPref(): CompassPref {
  try {
    const v = localStorage.getItem(storageKey(COMPASS_PREF_KEY));
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}
function writePref(v: 'granted' | 'denied') {
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
 * and never sees the button.
 */
function iosPermissionFn(): PermissionFn | null {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return null;
  const fn = (DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }).requestPermission;
  if (typeof fn !== 'function' || !('webkitCompassHeading' in DeviceOrientationEvent.prototype)) return null;
  return fn.bind(DeviceOrientationEvent);
}
const isPhoneLayout = (l: RfLayout) => l === 'portrait' || l === 'phone-landscape';
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

export interface HeadingState {
  /** Degrees [0, 360) or undefined until the first value (then held). */
  heading: number | undefined;
  /** Show the "Allow compass" button (iOS requestPermission exists, phone layout, not yet decided). */
  compassPrompt: boolean;
  /** Ask iOS for compass access (must run from a user gesture). */
  allowCompass: () => void;
}

/**
 * Heading for a pack mount. GPS fixes come from the app's existing watch (no second watch);
 * the device compass is only touched in the phone layouts.
 */
export function useHeading(layout: RfLayout): HeadingState {
  const fusion = useRef<HeadingFusion | null>(null);
  if (!fusion.current) fusion.current = new HeadingFusion();
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const shown = useRef<number | undefined>(undefined);
  const lastEmit = useRef(0);
  const timer = useRef<number | null>(null);
  const staleTimer = useRef<number | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const now = Date.now();
    const v = fusion.current!.value(now);
    if (shouldEmit(shown.current, v)) {
      const r = normDeg(Math.round(v * 10) / 10);
      shown.current = r;
      lastEmit.current = now;
      setHeading(r);
    }
  }, []);
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
    if (f.value(Date.now()) !== undefined) schedule();
    return subscribeGpsFixes((fix) => {
      if (f.onGps(fix)) schedule();
    });
  }, [schedule]);

  // Compass (phones only).
  const phone = isPhoneLayout(layout);
  const [pref, setPref] = useState<CompassPref>(readPref);
  const [iosOn, setIosOn] = useState(false);
  const hasPerm = phone && iosPermissionFn() !== null;

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

  // iOS: webkitCompassHeading once permission is granted.
  useEffect(() => {
    if (!phone || !iosOn) return;
    const on = (e: Event) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
      if (finite(ev.webkitCompassHeading) && !(finite(ev.webkitCompassAccuracy) && ev.webkitCompassAccuracy < 0)) onReading(ev.webkitCompassHeading);
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [phone, iosOn, onReading]);

  // Previously granted: re-request silently; if iOS wants a fresh gesture, the button returns.
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    const fn = hasPerm ? iosPermissionFn() : null;
    if (!fn || pref !== 'granted' || iosOn) return;
    let live = true;
    fn().then(
      (r) => {
        if (!live) return;
        if (r === 'granted') setIosOn(true);
        else setRetry(true);
      },
      () => {
        if (live) setRetry(true);
      },
    );
    return () => {
      live = false;
    };
  }, [hasPerm, pref, iosOn]);

  const allowCompass = useCallback(() => {
    const fn = iosPermissionFn();
    if (!fn) return;
    fn().then(
      (r) => {
        const next = r === 'granted' ? 'granted' : 'denied';
        writePref(next);
        setPref(next);
        setRetry(false);
        if (next === 'granted') setIosOn(true);
      },
      () => {
        /* no gesture / error: keep the button so the user can try again */
      },
    );
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
    },
    [],
  );

  const compassPrompt = hasPerm && !iosOn && (pref === null || (pref === 'granted' && retry));
  return { heading, compassPrompt, allowCompass };
}
