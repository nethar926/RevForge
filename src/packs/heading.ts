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
export function useHeading(layout: RfLayout): { heading: number | undefined } {
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

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (staleTimer.current !== null) window.clearTimeout(staleTimer.current);
    },
    [],
  );

  return { heading };
}
