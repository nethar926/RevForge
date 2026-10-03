import {MediaOutput} from "../audio/MediaOutput";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DrivingInput,
  EngineDiag,
  EnginePatch,
  EngineSynth,
  LockStage,
} from "../audio";
import { createEngineSynth, getBuiltin, resolveLegacyPackId } from "../audio";
import { storageKey } from "../lib/storageKey";

export function useAudioEngine(
  initialId = "v8-rumble",
  savedPatches: EnginePatch[] = [],
) {
  const resolvedInitialId = resolveLegacyPackId(initialId);
  const mediaRef=useRef<MediaOutput|null>(null);
  const [background,setBackground]=useState(()=>{try{return localStorage.getItem(storageKey("revforge.background"))!=="false";}catch{return true;}});
  const [backgroundStatus,setBackgroundStatus]=useState("Start audio to activate background playback");
  const ctxRef = useRef<AudioContext | null>(null);
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

  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctxRef.current = new AC();
      try{mediaRef.current=new MediaOutput(ctxRef.current);}catch{setBackgroundStatus("Media streams unavailable · direct audio active");}
      ctxRef.current.onstatechange = () =>
        setRunning(
          wantsRunning.current &&
            ctxRef.current?.state === "running" &&
            !!engineRef.current?.getDiag().running,
        );
    }
    if (!engineRef.current) {
      const patch =
        pendingPatchRef.current ??
        getBuiltin(selectedIdRef.current) ??
        getBuiltin("v8-rumble")!;
      pendingPatchRef.current = null;
      engineRef.current = createEngineSynth(ctxRef.current, patch);
      mediaRef.current?.attach(engineRef.current.output);
      setEngineId(patch.id);
      setPatchName(patch.name);
    }
    return engineRef.current;
  }, []);

  const start = useCallback(async () => {
    const version = ++startVersion.current;
    wantsRunning.current = true;
    setStarting(true);
    setError(null);
    try {
      const eng = ensure();
      const resumed=ctxRef.current?.state!=="running"?ctxRef.current?.resume():Promise.resolve();
      if(background&&mediaRef.current) {try{await mediaRef.current.enable();setBackgroundStatus("Media output active · browser may still suspend playback");}catch{mediaRef.current?.disable();setBackgroundStatus("Background output unavailable · direct audio active");}}
      await resumed;
      await eng.start();
      if (version !== startVersion.current || !wantsRunning.current) {
        eng.stop();
        return;
      }
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
  }, [ensure,background]);

  const stop = useCallback(() => {
    wantsRunning.current = false;
    startVersion.current++;
    engineRef.current?.stop();
    setRunning(false);
    setStarting(false);
  }, []);

  const setDriving = useCallback((d: DrivingInput) => {
    engineRef.current?.setDriving(d);
  }, []);

  const loadPatch = useCallback((patch: EnginePatch) => {
    setEngineId(patch.id);
    setPatchName(patch.name);
    selectedIdRef.current = patch.id;
    if (!engineRef.current) {
      pendingPatchRef.current = patch;
      return;
    }
    if (!!engineRef.current.toPatch().revforge !== !!patch.revforge) {
      const version = ++startVersion.current;
      engineRef.current.dispose();
      const next = createEngineSynth(ctxRef.current!, patch);
      engineRef.current = next;
      mediaRef.current?.attach(next.output);
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
            setRunning(ctxRef.current?.state === "running");
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
  }, []);

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
      if (enabled) localStorage.setItem(storageKey("ds-upshift-sfx"), "1");
      else localStorage.removeItem(storageKey("ds-upshift-sfx"));
    } catch {
      /* ignore */
    }
  }, []);

  const getUpshiftSfxEnabled = useCallback((): boolean => {
    if (engineRef.current) return engineRef.current.getUpshiftSfxEnabled();
    try {
      return localStorage.getItem(storageKey("ds-upshift-sfx")) === "1";
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
      mediaRef.current?.dispose();
      mediaRef.current=null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  useEffect(()=>{try{localStorage.setItem(storageKey("revforge.background"),String(background));}catch{}if(!background)mediaRef.current?.disable();},[background]);
  const setBackgroundEnabled=useCallback((value:boolean)=>{setBackground(value);if(value&&mediaRef.current)void mediaRef.current.enable().then(()=>setBackgroundStatus("Media output active · browser may still suspend playback")).catch(()=>setBackgroundStatus("Tap Ignition to retry background output"));},[]);
  const getMediaElement=useCallback(()=>mediaRef.current?.element??null,[]);
  return useMemo(
    () => ({
      background,backgroundStatus,setBackgroundEnabled,getMediaElement,
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
      running,
      engineId,
      patchName,
      context: ctxRef,
    }),
    [
      background,backgroundStatus,setBackgroundEnabled,getMediaElement,
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
      running,
      engineId,
      patchName,
    ],
  );
}
