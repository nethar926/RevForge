import { engineSpeedMph } from "./engineSpeed";
import {idleWander} from './flightProfile';
import { useEffect, useRef, useState } from "react";
import type { useAudioEngine } from "../hooks/useAudioEngine";
import type { useGeolocation } from "../hooks/useGeolocation";
import { mphToSpeed } from "../audio";
import { createSimulation, stepSimulation, clamp } from "./simulation";
import { startFrameLoop } from "./frameLoop";
import type { Drivetrain, Controls } from "./simulation";

export function useDriveSimulation(
  audio: ReturnType<typeof useAudioEngine>,
  gps: ReturnType<typeof useGeolocation>,
  config: Drivetrain,
  source: Controls["source"],
  mode: Controls["mode"],
  pedal: number,
  brake: boolean,
  jitter: number,
  /** Carrier Jet: the engine gets raw GPS speed (engineSpeed.ts); the HUD keeps the smoothed one. */
  rawGpsSpeed = false,
) {
  const simulation = useRef(createSimulation(config));
  const queuedShift = useRef(0);
  const latest = useRef({ audio, gps, config, source, mode, pedal, brake, jitter, rawGpsSpeed });
  const [hud, setHud] = useState(() => createSimulation(config));
  useEffect(() => {
    latest.current = { audio, gps, config, source, mode, pedal, brake, jitter, rawGpsSpeed };
  }, [audio, gps, config, source, mode, pedal, brake, jitter, rawGpsSpeed]);
  useEffect(() => {
    simulation.current.gear = Math.min(simulation.current.gear, config.gears);
    simulation.current.rpm = config.idleRpm;
  }, [config]);
  useEffect(() => {
    Object.assign(simulation.current, createSimulation(latest.current.config));
    queuedShift.current = 0;
  }, [source]);
  useEffect(() => {
    let published = 0;
    // one step of the feed; frameLoop.ts paces it (rAF, plus a 100 ms watchdog when no frame ran for > 150 ms) and
    // caps dt (0.05 s per rAF step, 1.0 s per watchdog step), so hidden / covered pages keep feeding the engine
    const frame = (now: number, dt: number) => {
      const { audio, gps, config, source, mode, pedal, brake, jitter, rawGpsSpeed } = latest.current;
      if (audio.running || source === "gps") {
        // Status encodes wall-callback staleness from useGeolocation (not pos.timestamp).
        const fresh = gps.status === "live";
        const previousGear = simulation.current.gear;
        stepSimulation(simulation.current, config, dt, {
          source,
          mode,
          pedal,
          brake,
          shift: queuedShift.current,
          gpsSpeed: fresh ? gps.mph / 2.236936 : null,
        });
        const state = simulation.current;
        if (state.gear > previousGear) audio.triggerUiCue("upshift");
        if (state.gear < previousGear) audio.triggerUiCue("downshift");
        const throttle = source === "gps" ? state.load : pedal;
        if (audio.running) audio.setDriving({
          speed: mphToSpeed(engineSpeedMph(state.speedMps * 2.2369362920544, { fresh, mph: gps.mph }, rawGpsSpeed, source)),
          throttle: state.shifting ? throttle * 0.3 : throttle,
          load: state.load,
          rpm: state.rpm + idleWander(now/1000,state.rpm,config.idleRpm,throttle,jitter),
          acceleration: state.accel,
          shifting: state.shifting,
          overrun: state.overrun,
          rpmNorm: clamp(
            (state.rpm - config.idleRpm) / (config.redline - config.idleRpm),
            0,
            1,
          ),
        });
      }
      queuedShift.current = 0;
      if (now - published > 80) {
        published = now;
        const s=simulation.current,o=latest.current;
        setHud({ ...s,rpm:s.rpm+(o.audio.running?idleWander(now/1000,s.rpm,o.config.idleRpm,o.source==='demo'?o.pedal:s.load,o.jitter):0) });
      }
    };
    return startFrameLoop(frame, {
      now: () => performance.now(),
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
      setInterval: (f, ms) => window.setInterval(f, ms),
      clearInterval: (t) => window.clearInterval(t as number),
    });
  }, []);
  return {
    simulation,
    hud,
    shift: (direction: number) => {
      queuedShift.current = direction;
    },
    neutral: () => {
      simulation.current.gear = 0;
    },
    reset: () => {
      Object.assign(
        simulation.current,
        createSimulation(latest.current.config),
      );
      queuedShift.current = 0;
    },
  };
}
