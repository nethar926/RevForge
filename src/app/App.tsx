import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useAudioEngine } from "../hooks/useAudioEngine";
import { useGeolocation } from "../hooks/useGeolocation";
import { usePatches } from "../hooks/usePatches";
import { useUiPrefs } from "../hooks/useUiPrefs";
import { A11yContext, useA11yPrefs } from "../hooks/useA11yPrefs";
import { BuilderPage } from "../pages/BuilderPage";
import { CustomizePage } from "../pages/CustomizePage";
import { DiagPage } from "../pages/DiagPage";
import { useThemes } from "../themes/useThemes";
import { ExperienceBuilder } from "../themes/ExperienceBuilder";
import { ForgePage } from "../forge/ForgePage";
import { EnginesPage } from "../pages/EnginesPage";
import type { EnginePatch } from "../audio";
import { getBuiltin } from "../audio";
import { skinIdForEngine } from "../skins/DriveSkinSlot";
import { packForEngineId, resolveVisibleEnginePatch } from "../packs/registry";
import { FALLBACK_ENGINE_ID } from "../themes/visibility";

export default function App() {
  const { prefs, update, reset } = useUiPrefs();
  const a11y = useA11yPrefs(prefs);
  const themes = useThemes();
  const { userPatches, savePatch, deletePatch } = usePatches();
  const audio = useAudioEngine(prefs.selectedEngineId, userPatches);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const gps = useGeolocation(gpsEnabled);

  useEffect(() => {
    const eng = audio.getEngine();
    if (!eng) return;
    // Mute via output node so patch masterGain stays intact
    const out = eng.output;
    // Engines gate their own running bus; keep the shared volume bus open for shutdown tails.
    const target =
      prefs.masterMuted
        ? 0
        : Math.max(0, Math.min(1, prefs.masterVolume ?? 0.65));
    const now = eng.context.currentTime;
    try {
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(target, now, 0.05);
    } catch {
      out.gain.value = target;
    }
  }, [prefs.masterMuted, prefs.masterVolume, audio]);

  const onSelectEngine = useCallback(
    (patch: EnginePatch) => {
      audio.loadPatch(patch);
      update({ selectedEngineId: patch.id });
      // Theme packs bind engine + cluster: picking the pack engine selects its theme too.
      const pack = packForEngineId(patch.id);
      if (pack) themes.selectSkin(pack.themeId);
    },
    [audio, update, themes],
  );

  const onSavePatch = useCallback(
    (patch: EnginePatch) => {
      savePatch(patch);
      audio.loadPatch(patch);
      update({ selectedEngineId: patch.id });
    },
    [savePatch, audio, update],
  );

  const onDeleteUserPatch = useCallback(
    (id: string) => {
      deletePatch(id);
      if (audio.engineId === id || prefs.selectedEngineId === id) {
        const fallback = getBuiltin(FALLBACK_ENGINE_ID) ?? getBuiltin("v8-rumble");
        if (fallback) {
          audio.loadPatch(fallback);
          update({ selectedEngineId: fallback.id });
        }
      }
    },
    [deletePatch, audio, prefs.selectedEngineId, update],
  );

  const onMuteToggle = () => update({ masterMuted: !prefs.masterMuted });

  return (
    <A11yContext.Provider value={a11y}>
    <Routes>
      {["/", "/drive"].map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <ForgePage
              themes={themes}
              audio={audio}
              gps={gps}
              prefs={prefs}
              update={update}
              onSelectEngine={onSelectEngine}
              onSavePatch={onSavePatch}
              onGpsEnabled={setGpsEnabled}
              userPatches={userPatches}
            />
          }
        />
      ))}
      {/* Legacy Cockpit → Drive (ForgePage); never show DriveSynth chrome */}
      <Route path="/cockpit" element={<Navigate to="/drive" replace />} />
      <Route path="/builder" element={<ExperienceBuilder themes={themes} audio={audio} userPatches={userPatches} onSelect={onSelectEngine} onLoadCombination={(skinId,patch,atmosphereId)=>{themes.selectSkin(skinId);if(atmosphereId)themes.selectAtmosphere(atmosphereId);onSavePatch(resolveVisibleEnginePatch(patch));}}/>}/>
      <Route
        element={
          <AppShell
            prefs={prefs}
            engineName={audio.patchName}
            running={audio.running}
            onMuteToggle={onMuteToggle}
            skinId={skinIdForEngine(audio.engineId || prefs.selectedEngineId)}
          />
        }
      >
        <Route
          path="/engines"
          element={
            <EnginesPage
              selectedId={audio.engineId}
              userPatches={userPatches}
              onSelect={onSelectEngine}
              onDeleteUserPatch={onDeleteUserPatch}
              audio={audio}
              prefs={prefs}
              update={update}
            />
          }
        />
        <Route
          path="/customize"
          element={
            <CustomizePage prefs={prefs} update={update} reset={reset} />
          }
        />
        <Route
          path="/sound-builder"
          element={
            <BuilderPage
              audio={audio}
              onSave={onSavePatch}
              userPatches={userPatches}
              onDeleteUserPatch={onDeleteUserPatch}
            />
          }
        />
        <Route path="/diag" element={<DiagPage audio={audio} gps={gps} />} />
        <Route path="*" element={<Navigate to="/drive" replace />} />
      </Route>
    </Routes>
    </A11yContext.Provider>
  );
}
