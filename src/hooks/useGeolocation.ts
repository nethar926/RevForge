import { useCallback, useEffect, useRef, useState } from "react";
import { speedFromFix, type Fix } from "./gpsSpeed";
import { kphToMph } from "../audio";
import { publishGpsFix, publishGpsStatus } from "./gpsFixes";
import { startGeolocation } from "./geoStart";

/** Wall-clock gap after last successful watch callback before marking stale. */
const STALE_MS = 10000;
/**
 * If |wallNow - pos.timestamp| exceeds this, treat the device fix clock as
 * skewed (common on Tesla Chromium) and prefer wall time for continuity.
 */
const SKEW_MS = 15000;

export type GpsStatus =
  | "idle"
  | "requesting"
  | "waiting"
  | "live"
  | "stale"
  | "denied"
  | "unavailable"
  | "error";
export interface GpsState {
  status: GpsStatus;
  mph: number;
  accuracy: number | null;
  /** Fix time used for freshness / haversine (wall-corrected when device clock is skewed). */
  timestamp: number | null;
  /** Raw GeolocationCoordinates.timestamp from the device (may be skewed). */
  deviceTimestamp: number | null;
  errorMessage?: string;
  estimated?: boolean;
}
export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GpsState>({
    status: "idle",
    mph: 0,
    accuracy: null,
    timestamp: null,
    deviceTimestamp: null,
  });
  // Pack HUDs (Carrier Jet GPS plate) read the status from the shared feed.
  useEffect(() => publishGpsStatus(state.status), [state.status]);
  const session = useRef<{ cancel: () => void } | null>(null);
  const generation = useRef(0);
  const previous = useRef<Fix | null>(null);
  /** Wall clock of the last watchPosition success callback. */
  const lastCallbackAt = useRef<number | null>(null);
  const stop = useCallback(() => {
    generation.current++;
    previous.current = null;
    lastCallbackAt.current = null;
    session.current?.cancel();
    session.current = null;
  }, []);
  const start = useCallback(() => {
    stop();
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        status: "unavailable",
        mph: 0,
        errorMessage: "Location is not supported. Demo mode is available.",
      }));
      return;
    }
    const request = generation.current;
    setState((s) => ({
      ...s,
      status: "requesting",
      mph: 0,
      timestamp: null,
      deviceTimestamp: null,
      errorMessage: undefined,
    }));
    const geo = navigator.geolocation;
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 500, timeout: 8000 };
    const onFix = (pos: GeolocationPosition) => {
      if (request !== generation.current) return;
      const wallNow = Date.now();
      // Continuous watch is alive as soon as a callback arrives — do not
      // mark stale solely because pos.timestamp is clock-skewed / old.
      lastCallbackAt.current = wallNow;
      const deviceTs = pos.timestamp;
      const skew =
        !Number.isFinite(deviceTs) ||
        Math.abs(wallNow - deviceTs) > SKEW_MS;
      // Prefer wall time for haversine continuity when device clock is odd.
      const fixTs = skew ? wallNow : deviceTs;
      const fix: Fix = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        timestamp: fixTs,
      };
      // Raw feed for heading consumers (packs/heading.ts) — same fixes, no second watch.
      publishGpsFix({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: fixTs,
      });
      const { speed, estimated } = speedFromFix(fix, previous.current);
      if (!previous.current || fixTs > previous.current.timestamp)
        previous.current = fix;
      if (speed === null || !Number.isFinite(speed) || speed < 0) {
        setState({
          status: "waiting",
          mph: 0,
          accuracy: pos.coords.accuracy,
          timestamp: fixTs,
          deviceTimestamp: deviceTs,
          errorMessage:
            "Location received; waiting for two accurate fixes to estimate speed.",
        });
        return;
      }
      setState({
        status: "live",
        mph: speed * 2.236936,
        estimated,
        accuracy: pos.coords.accuracy,
        timestamp: fixTs,
        deviceTimestamp: deviceTs,
      });
    };
    const onError = (err: GeolocationPositionError) => {
      if (request !== generation.current) return;
      setState((s) => ({
        ...s,
        mph: 0,
        status: err.code === err.PERMISSION_DENIED ? "denied" : "waiting",
        errorMessage: err.message,
      }));
    };
    // Pre-ask with getCurrentPosition (Tesla silent-deny), then always open exactly one watch
    // (after success, any error, a throw, or GCP_FALLBACK_MS without a callback) — geoStart.ts.
    session.current = startGeolocation(geo, onFix, onError, options);
  }, [stop]);
  useEffect(() => {
    if (enabled) start();
    else {
      stop();
      setState((s) => ({
        ...s,
        status: "idle",
        mph: 0,
        timestamp: null,
        deviceTimestamp: null,
      }));
    }
    const timer = enabled
      ? window.setInterval(() => {
          const last = lastCallbackAt.current;
          setState((s) => {
            if (
              last !== null &&
              (s.status === "live" || s.status === "waiting") &&
              Date.now() - last > STALE_MS
            ) {
              return {
                ...s,
                status: "stale",
                errorMessage:
                  "GPS signal is stale. Sound is returning to idle.",
              };
            }
            return s;
          });
        }, 500)
      : undefined;
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [enabled, start, stop]);
  return {
    ...state,
    start,
    stop,
    kph: state.mph / 0.621371,
    mphFromKph: kphToMph,
  };
}
