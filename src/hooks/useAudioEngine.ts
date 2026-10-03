import {MediaOutput} from "../audio/MediaOutput";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createMasterBus,
  getPlaybackSession,
  SWITCH_DIP_S,
  type MasterBus,
} from "../audio/playbackSession";
import type {
  DrivingInput,
  EngineDiag,
  EnginePatch,
  EngineSynth,
  LockStage,
} from "../audio";
import { createEngineSynth, getBuiltin, resolveLegacyPackId } from "../audio";

export function useAudioEngine(
  initialId = "v8-rumble",
  savedPatches: EnginePatch[] = [],
) {
  const resolvedInitialId = resolveLegacyPackId(initialId);
  const mediaRef=useRef<MediaOutput|null>(null);
  const [background,setBackground]=useState(()=>{try{return localStorage.getItem("revforge.background")!=="false";}catch{return true;}});
  const [backgroundStatus,setBackgroundStatus]=useState("Start audio to activate background playback");
  const ctxRef = useRef<AudioContext | null>(null);
  /** HIG master bus (fade + safety limiter); created with the context inside the Ignition tap. */
  const masterRef = useRef<MasterBus | null>(null);
  /** Page-wide playback session (Media Session, interruptions). Touches no audio until attach(). */
  const session = useMemo(() => getPlaybackSession(), []);
  const playbackSnapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const resumedAtRef = useRef(-Infinity);
  const startRef = useRef<() => Promise<void>>(async () => {});
  const stopRef = useRef<() => void>(() => {});
  const engineRef = useRef<EngineSynth | null>(null);
  const pendingPatchRef = useRef<EnginePatch | null>(
    savedPatches.find((p) => p.id === resolvedInitialId) ?? null,
  );
  const selectedIdRef = useRef(resolvedInitialId);
  const wantsRunning = useRef(false);
  const startVersion = useRef(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [engineId, setEngineId] = useState(resolvedInitialId);
  const [patchName, setPatchName] = useState(
    () =>
      savedPatches.find((p) => p.id === resolvedInitialId)?.name ??
      getBuiltin(resolvedInitialId)?.name ??
      "Engine",
  );

  /** Engines feed the master bus (fade + limiter), never ctx.destination directly. */
  const routeToMaster = (eng: EngineSynth) => {
    const master = masterRef.current;
    if (!master) return;
    try {
      eng.output.disconnect(eng.output.context.destination);
    } catch {
      /* not connected directly */
    }
    eng.output.connect(master.input);
  };

  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new AC();
      const ctx = ctxRef.current;
      masterRef.current = createMasterBus(ctx);
      try{mediaRef.current=new MediaOutput(ctx);mediaRef.current.attach(masterRef.current.output);}catch{setBackgroundStatus("Media streams unavailable · direct audio active");}
      ctx.onstatechange = () =>
        setRunning(
          wantsRunning.current &&
            ctxRef.current?.state === "running" &&
            !!engineRef.current?.getDiag().running &&
            session.getSnapshot().state !== "paused",
        );
      session.attach(ctx, masterRef.current, {
        getMediaElement: () => (mediaRef.current?.active ? mediaRef.current.element : null),
        host: {
          // Hardware play while idle: only when the context is already running (no new unlock).
          start: () => {
            if (ctxRef.current?.state === "running") void startRef.current();
          },
          stop: () => stopRef.current(),
          onMediaBlocked: () => {
            mediaRef.current?.disable();
            setBackgroundStatus("Background output paused by the browser · direct audio active");
          },
        },
      });
    }
    if (!engineRef.current) {
      const patch =
        pendingPatchRef.current ??
        getBuiltin(selectedIdRef.current) ??
        getBuiltin("v8-rumble")!;
      pendingPatchRef.current = null;
      engineRef.current = createEngineSynth(ctxRef.current, patch);
      routeToMaster(engineRef.current);
      setEngineId(patch.id);
      setPatchName(patch.name);
    }
    return engineRef.current;
  }, [session]);

  const start = useCallback(async () => {
    // Paused by an interruption → this tap is the explicit resume (no re-ignition).
    if (session.getSnapshot().state === "paused" && engineRef.current && wantsRunning.current) {
      setStarting(true);
      setError(null);
      try {
        if (await session.resume()) {
          resumedAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
          setRunning(ctxRef.current?.state === "running" && !!engineRef.current?.getDiag().running);
          return;
        }
      } finally {
        setStarting(false);
      }
    }
    const version = ++startVersion.current;
    const wasAudible = session.getSnapshot().state === "running" && ctxRef.current?.state === "running";
    wantsRunning.current = true;
    setStarting(true);
    setError(null);
    try {
      const eng = ensure();
      if (!wasAudible) masterRef.current?.silence();
      const resumed=ctxRef.current?.state!=="running"?ctxRef.current?.resume():Promise.resolve();
      if(background&&mediaRef.current) {try{await mediaRef.current.enable();setBackgroundStatus("Media output active · browser may still suspend playback");}catch{mediaRef.current?.disable();setBackgroundStatus("Background output unavailable · direct audio active");}}
      await resumed;
      await eng.start();
      if (version !== startVersion.current || !wantsRunning.current) {
        eng.stop();
        return;
      }
      if (!wasAudible) masterRef.current?.rampIn();
      session.markRunning();
      setReady(true);
      setRunning(ctxRef.current?.state === "running");
    } catch (error) {
      wantsRunning.current = false;
      setRunning(false);
      setError(
        error instanceof Error
          ? error.message
          : "Audio could not start. Tap Start to retry.",
      );
    } finally {
      if (version === startVersion.current) setStarting(false);
    }
  }, [ensure,background,session]);

  const stop = useCallback(() => {
    wantsRunning.current = false;
    startVersion.current++;
    engineRef.current?.stop();
    session.markStopped();
    setRunning(false);
    setStarting(false);
  }, [session]);
  useEffect(() => {
    startRef.current = start;
    stopRef.current = stop;
  }, [start, stop]);

  const setDriving = useCallback((d: DrivingInput) => {
    engineRef.current?.setDriving(d);
  }, []);

  const loadPatch = useCallback((patch: EnginePatch) => {
    // Pack switch (not a knob edit of the same pack) while audible → dip + ramp in from silence.
    const packSwitch = patch.id !== selectedIdRef.current;
    if (packSwitch && engineRef.current && session.getSnapshot().state === "running")
      masterRef.current?.switchRamp();
    setEngineId(patch.id);
    setPatchName(patch.name);
    selectedIdRef.current = patch.id;
    if (!engineRef.current) {
      pendingPatchRef.current = patch;
      return;
    }
    if (!!engineRef.current.toPatch().revforge !== !!patch.revforge) {
      const version = ++startVersion.current;
      const previous = engineRef.current;
      // Let the outgoing voice ride the master dip instead of cutting it mid-waveform.
      if (packSwitch && session.getSnapshot().state === "running")
        setTimeout(() => previous.dispose(), Math.round(SWITCH_DIP_S * 1000) + 20);
      else previous.dispose();
      const next = createEngineSynth(ctxRef.current!, patch);
      engineRef.current = next;
      routeToMaster(next);
      setRunning(false);
      if (wantsRunning.current) {
        setStarting(true);
        void next
          .start()
          .then(() => {
            if (version !== startVersion.current || !wantsRunning.current) {
              next.stop();
              return;
            }
            setRunning(ctxRef.current?.state === "running" && session.getSnapshot().state !== "paused");
            setReady(true);
          })
          .catch((error) => {
            if (version === startVersion.current) {
              wantsRunning.current = false;
              setError(String(error));
              setRunning(false);
            }
          })
          .finally(() => {
            if (version === startVersion.current) setStarting(false);
          });
      }
    } else engineRef.current.fromPatch(patch);
  }, [session]);

  /** Engine exists only after Start — null beforehand (mobile-safe). */
  const getEngine = useCallback(() => engineRef.current, []);
  const getPatch = useCallback(
    () =>
      engineRef.current?.toPatch() ??
      pendingPatchRef.current ??
      getBuiltin(selectedIdRef.current),
    [],
  );

  /** Frontend /diag — stable field names (iceMode, contextState, …). */
  const getDiag = useCallback((): EngineDiag => {
    const eng = engineRef.current;
    if (eng) return eng.getDiag();
    return {
      contextState: ctxRef.current?.state ?? "not started",
      iceMode: "n/a",
      running: false,
      engineId: selectedIdRef.current,
    };
  }, []);

  const getLockStage = useCallback((): LockStage => {
    return engineRef.current?.getLockStage() ?? "none";
  }, []);

  const setLockSfxEnabled = useCallback((enabled: boolean) => {
    engineRef.current?.setLockSfxEnabled(enabled);
  }, []);

  const getLockSfxEnabled = useCallback((): boolean => {
    return engineRef.current?.getLockSfxEnabled() ?? false;
  }, []);

  const setUpshiftSfxEnabled = useCallback((enabled: boolean) => {
    engineRef.current?.setUpshiftSfxEnabled(enabled);
    // Persist even before Start so Customize toggle sticks (engine may not exist yet).
    try {
      if (enabled) localStorage.setItem("ds-upshift-sfx", "1");
      else localStorage.removeItem("ds-upshift-sfx");
    } catch {
      /* ignore */
    }
  }, []);

  const getUpshiftSfxEnabled = useCallback((): boolean => {
    if (engineRef.current) return engineRef.current.getUpshiftSfxEnabled();
    try {
      return localStorage.getItem("ds-upshift-sfx") === "1";
    } catch {
      return false;
    }
  }, []);

  const triggerUiCue = useCallback(
    (cue: 'upshift' | 'starter' | 'shutdown' | 'shutoff' | string) => {
      engineRef.current?.triggerUiCue?.(cue);
    },
    [],
  );

  const playStarter = useCallback(() => {
    // Frontend calls playStarter after start(); a resume from pause is not a new ignition.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - resumedAtRef.current < 1500) return;
    engineRef.current?.playStarter?.();
  }, []);

  const playShutoff = useCallback(() => {
    engineRef.current?.playShutoff?.();
  }, []);

  useEffect(() => {
    return () => {
      wantsRunning.current = false;
      startVersion.current++;
      if (ctxRef.current) ctxRef.current.onstatechange = null;
      engineRef.current?.dispose();
      engineRef.current = null;
      session.detach();
      session.markStopped();
      mediaRef.current?.dispose();
      mediaRef.current=null;
      masterRef.current?.dispose();
      masterRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, [session]);

  useEffect(()=>{try{localStorage.setItem("revforge.background",String(background));}catch{}if(!background)mediaRef.current?.disable();},[background]);
  const setBackgroundEnabled=useCallback((value:boolean)=>{setBackground(value);if(value&&mediaRef.current)void mediaRef.current.enable().then(()=>setBackgroundStatus("Media output active · browser may still suspend playback")).catch(()=>setBackgroundStatus("Tap Ignition to retry background output"));},[]);
  const getMediaElement=useCallback(()=>mediaRef.current?.element??null,[]);
  /** Explicit user resume after an interruption (same path as tapping Ignition while paused). */
  const resume = useCallback(async () => {
    await start();
    return session.getSnapshot().state === "running";
  }, [start, session]);
  const paused = playbackSnapshot.state === "paused";
  useEffect(() => {
    session.setMediaInfo({ title: patchName });
  }, [session, patchName]);
  /** Paused (interrupted) never reads as running. */
  const audible = running && !paused;
  return useMemo(
    () => ({
      background,backgroundStatus,setBackgroundEnabled,getMediaElement,
      playback: session,
      playbackState: playbackSnapshot,
      paused,
      resume,
      error,
      starting,
      start,
      stop,
      setDriving,
      loadPatch,
      getEngine,
      getPatch,
      getDiag,
      getLockStage,
      setLockSfxEnabled,
      getLockSfxEnabled,
      setUpshiftSfxEnabled,
      getUpshiftSfxEnabled,
      triggerUiCue,
      playStarter,
      playShutoff,
      ready,
      running: audible,
      engineId,
      patchName,
      context: ctxRef,
    }),
    [
      background,backgroundStatus,setBackgroundEnabled,getMediaElement,
      session,
      playbackSnapshot,
      paused,
      resume,
      error,
      starting,
      start,
      stop,
      setDriving,
      loadPatch,
      getEngine,
      getPatch,
      getDiag,
      getLockStage,
      setLockSfxEnabled,
      getLockSfxEnabled,
      setUpshiftSfxEnabled,
      getUpshiftSfxEnabled,
      triggerUiCue,
      playStarter,
      playShutoff,
      ready,
      audible,
      engineId,
      patchName,
    ],
  );
}
