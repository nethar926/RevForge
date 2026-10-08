import {AccountPanel} from '../account/AccountPanel';
import {useVehicleGarage} from '../account/useVehicleGarage';
import {Guide} from './Guide';
import {editableEngine,isCustomEngine} from './engineDraft';
import {ClusterBuilder} from '../themes/ClusterBuilder';
import {FontPicker} from '../themes/FontPicker';
import {ThemeColors} from '../themes/ThemeColors';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BUILTIN_PATCHES, getBuiltin } from "../audio";
import { isEngineIdVisible, packForThemeId, resolveVisibleEnginePatch } from "../packs/registry";
import { connectPackAudio } from "../packs/audioBridge";
import { connectPackShell, setPackShellState, type PackShellAction } from "../packs/runtime";
import type { EnginePatch } from "../audio";
import type { useAudioEngine } from "../hooks/useAudioEngine";
import type { useGeolocation } from "../hooks/useGeolocation";
import type { UiPrefs } from "../hooks/useUiPrefs";
import { AppearanceKnobs } from "../components/visuals/AppearanceKnobs";
import { DriveDynamicsPanel } from "../components/visuals/DriveDynamicsPanel";
import { sceneForId, drivetrainFor } from "./catalog";
import { ThemeStage } from "../themes/ThemeStage";
import { ThemePicker } from "../themes/ThemePicker";
import { LISTED_THEMES, SPLASH_BACKDROP_THEME, isThemeListed, themeForId } from "../themes/catalog";
import type { useThemes } from "../themes/useThemes";
import { useVehicleMedia } from "./useVehicleMedia";
import { LEGACY_MEDIA_OPT_IN_KEY, MEDIA_BUTTONS_KEY, readMediaButtons } from "./mediaActions";
import { NativeStudio } from "./NativeStudio";
import { useDriveSimulation } from "./useDriveSimulation";
import { TimeJumpCueSwitch, useTimeJump } from "./timeJumpCue";
import { useA11y } from "../hooks/useA11yPrefs";
import { DisplaySettings, HigGroup } from "../components/settings/DisplaySettings";
import { HigListPicker, HigSegmented, HigSlider, HigSwitch, Icon as HigIcon, pctText } from "../ui/hig";
import "./forge.css";
import "./viewport.css";
import { storageKey } from '../lib/storageKey';

interface Props {
  themes: ReturnType<typeof useThemes>;
  audio: ReturnType<typeof useAudioEngine>;
  gps: ReturnType<typeof useGeolocation>;
  prefs: UiPrefs;
  update: (p: Partial<UiPrefs>) => void;
  onSelectEngine: (p: EnginePatch) => void;
  onGpsEnabled: (enabled: boolean) => void;
  onSavePatch: (patch: EnginePatch) => void;
  userPatches: EnginePatch[];
}
function storedFlag(key: string, fallback: boolean) { try { const value=localStorage.getItem(storageKey(key)); return value===null?fallback:value==='true'; } catch { return fallback; } }
function Icon({
  name,
  size = 20,
}: {
  name: "power" | "grid" | "tune" | "volume" | "arrow" | "close" | "wave";
  size?: number;
}) {
  const paths = {
    power: (
      <>
        <path d="M12 3v9" />
        <path d="M6.5 5.5a8 8 0 1 0 11 0" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="15" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="15" width="6" height="6" rx="1" />
        <rect x="15" y="15" width="6" height="6" rx="1" />
      </>
    ),
    tune: (
      <>
        <path d="M4 7h7m5 0h4M4 17h3m5 0h8" />
        <circle cx="13" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </>
    ),
    volume: (
      <>
        <path d="m11 4-5 4H3v8h3l5 4zM16 8a6 6 0 0 1 0 8M19 4a11 11 0 0 1 0 16" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    wave: <path d="M2 12h3l3-8 4 16 4-13 3 5h3" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function ForgePage({
  themes,
  audio,
  gps,
  prefs,
  update,
  onSelectEngine,
  onGpsEnabled,
  onSavePatch,
  userPatches,
}: Props) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const garage=useVehicleGarage();
  const theme = themeForId(themes.skinId);
  const [panel, setPanel] = useState<
    "tuner" | "themes" | "scenes" | "garage" | "tune" | "studio" | "dashlab" | "account" | null
  >(() => (searchParams.get("account") === "1" || new URLSearchParams(window.location.search).get("account") === "1") ? "account" : searchParams.get("studio") === "1" ? "studio" : null);
  const [ignited,setIgnited]=useState(false);
  const [scale,setScale]=useState(()=>{try{return Math.max(.65,Math.min(1.35,Number(localStorage.getItem(storageKey("revforge.hudScale"))??1)));}catch{return 1;}});
  const opacity = prefs.hudOpacity;
  useEffect(()=>{try{localStorage.setItem(storageKey("revforge.hudScale"),String(scale));}catch{/* session only */}},[scale]);
  const [source, setSource] = useState<"demo" | "gps">(() => storedFlag("drivesynth.demo", true) ? "demo" : "gps");
  useEffect(()=>{onGpsEnabled(source==='gps');},[source,onGpsEnabled]);
  const [jitterEnabled,setJitterEnabled]=useState(()=>storedFlag("revforge.idleJitter",true));
  const [jitterAmount,setJitterAmount]=useState(()=>{try{return Math.max(0,Math.min(1,Number(localStorage.getItem(storageKey("revforge.idleJitterAmount"))??.25)));}catch{return .25;}});
  useEffect(()=>{try{localStorage.setItem(storageKey("revforge.idleJitter"),String(jitterEnabled));localStorage.setItem(storageKey("revforge.idleJitterAmount"),String(jitterAmount));}catch{/* session only */}},[jitterEnabled,jitterAmount]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [pedal, setPedal] = useState(0);
  const [brake, setBrake] = useState(false);
  const [motion, setMotion] = useState(() => storedFlag("drivesynth.motion", true));
  const [pauseShifts,setPauseShifts] = useState(() => storedFlag("drivesynth.pauseShifts", true));
  const [mediaButtons,setMediaButtons] = useState(() => readMediaButtons(typeof localStorage==='undefined'?null:localStorage, storageKey(MEDIA_BUTTONS_KEY), storageKey(LEGACY_MEDIA_OPT_IN_KEY)));
  const [mutedBeforeHide, setMutedBeforeHide] = useState(false);
  const [revision, setRevision] = useState(0);
  const a11y = useA11y();
  // Reduce Motion (system or in-app) overrides Animated environment.
  const sceneMotion = motion && !a11y.reduceMotion;
  const tunerButton = useRef<HTMLButtonElement>(null);
  const hadPanel = useRef(false);
  // HIG Sheets/Modality: return focus to the Tuner button when the sheet closes.
  useEffect(() => {
    if (panel) hadPanel.current = true;
    else if (hadPanel.current) { hadPanel.current = false; tunerButton.current?.focus(); }
  }, [panel]);
  const patch = useMemo(
    () =>
      audio.getPatch() ??
      userPatches.find((p) => p.id === audio.engineId) ??
      getBuiltin(audio.engineId),
    [audio, userPatches, revision],
  );
  const config = useMemo(() => {
    const base = drivetrainFor(patch, sceneForId("road-66"));
    const topFromGarage = garage.active ? garage.active.topSpeedKph / 3.6 : undefined;
    const topFromPrefs = prefs.maxTopSpeedMph / 2.2369362920544; // mph → m/s
    return {
      ...base,
      gears: prefs.gearCount,
      idleRpm: prefs.idleRpmMin,
      topSpeedMps: topFromGarage ?? topFromPrefs ?? base.topSpeedMps,
    };
  }, [patch, garage.active, prefs.gearCount, prefs.maxTopSpeedMph, prefs.idleRpmMin]);
  const { simulation, hud, shift, neutral, reset } = useDriveSimulation(
    audio,
    gps,
    config,
    source,
    mode,
    pedal,
    brake,
    jitterEnabled?jitterAmount:0,
  );
  const revReady = audio.running && source === "demo";

  useEffect(() => {try {localStorage.setItem(storageKey("drivesynth.demo"),String(source==='demo'));localStorage.setItem(storageKey("drivesynth.motion"),String(motion));localStorage.setItem(storageKey("drivesynth.pauseShifts"),String(pauseShifts));localStorage.setItem(storageKey(MEDIA_BUTTONS_KEY),String(mediaButtons));}catch{/* preferences remain available this session */}},[source,motion,pauseShifts,mediaButtons]);
  useEffect(() => {
    audio.setUpshiftSfxEnabled(prefs.upshiftSfx);
    audio.setLockSfxEnabled(prefs.ionTwinLockSfx);
  }, [audio, prefs.upshiftSfx, prefs.ionTwinLockSfx]);
  useEffect(() => {
    const release = () => {
      setPedal(0);
      setBrake(false);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        release();
        if(!audio.background){audio.stop();setMutedBeforeHide(true);}
      }
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [audio]);
  useEffect(() => {
    if (panel) {
      setPedal(0);
      setBrake(false);
    }
  }, [panel]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      if (e.key === "Escape") {
        setPanel(null);
        setPedal(0);
        setBrake(false);
        return;
      }
      if (panel || !audio.running) return;
      if (e.code === "Space" && source === "demo") {
        e.preventDefault();
        setPedal(e.type === "keydown" ? 1 : 0);
      }
      if (e.key.toLowerCase() === "b" && source === "demo")
        setBrake(e.type === "keydown");
      if (mode === "manual" && e.type === "keydown" && !e.repeat) {
        if (["ArrowUp", ".", "="].includes(e.key)) {
          e.preventDefault();
          shift(1);
        }
        if (["ArrowDown", ",", "-"].includes(e.key)) {
          e.preventDefault();
          shift(-1);
        }
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
    };
  }, [audio.running, panel, source, mode, shift]);
  const setDriving = audio.setDriving;
  useEffect(
    () => () => setDriving({ speed: 0, throttle: 0, load: 0 }),
    [setDriving],
  );
  // Theme-pack runtime (Night Pursuit): HUD mode ↔ pursuitBoost, scanner ↔ scannerTick, envelope → voice box.
  useEffect(() => connectPackAudio(audio.getEngine, audio.engineId), [audio.getEngine, audio.engineId, audio.running]);
  useEffect(() => () => onGpsEnabled(false), [onGpsEnabled]);
  // Pack HUD → existing Drive actions (Shutdown / mute / menu panels). Additive; no new behaviour.
  const packShellRef = useRef<(a: PackShellAction) => void>(() => undefined);
  useEffect(() => {
    packShellRef.current = (a) => {
      if (a.type === 'shutdown') { if (audio.running) stop(); }
      else if (a.type === 'toggle-mute') update({ masterMuted: !prefs.masterMuted });
      else setPanel(a.panel);
    };
  });
  useEffect(() => connectPackShell((a) => packShellRef.current(a)), []);
  useEffect(() => setPackShellState({ muted: prefs.masterMuted, engineName: audio.patchName ?? '' }), [prefs.masterMuted, audio.patchName]);
  const start = () => {
    setIgnited(true);
    setMutedBeforeHide(false);
    media.arm();
    if(source === "gps") onGpsEnabled(true);
    void audio.start().then(() => {
      audio.playStarter?.();
    });
  };
  const stop = () => {
    setPedal(0);
    setBrake(false);
    audio.playShutoff?.();
    audio.stop();
    reset();
  };
  // Paddle (on-screen −/+ and steering-wheel next/previous): in Auto a tap takes Manual and shifts, like a paddle override.
  const pendingShift = useRef(0);
  const paddle = (direction: number) => {
    if (mode === "manual") { shift(direction); return; }
    pendingShift.current = direction;
    setMode("manual");
  };
  useEffect(() => {
    // Runs after useDriveSimulation has seen mode=manual, so the queued shift is not dropped by the Auto step.
    if (mode === "manual" && pendingShift.current) { shift(pendingShift.current); pendingShift.current = 0; }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const media = useVehicleMedia({blasters:patch?.kind==='scifi',fire:()=>audio.triggerUiCue('ion-cannon'),getMediaElement:audio.getMediaElement,enabled:mediaButtons,running:audio.running,starting:audio.starting,manual:mode==='manual' && config.gears>1,canShift:config.gears>1,pauseShifts,name:audio.patchName,stop,shift:paddle});
  const sourceChange = (next: "demo" | "gps") => {
    setSource(next);
    setPedal(0);
    setBrake(false);
    onGpsEnabled(next === "gps");
  };
  const hold = (
    e: PointerEvent<HTMLButtonElement>,
    type: "throttle" | "brake",
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (type === "throttle") setPedal(1);
    else setBrake(true);
  };
  const gpsLabel =
    gps.status === "live"
      ? (gps.estimated ? "GPS estimated" : "GPS live")
      : gps.status === "denied"
        ? "GPS denied"
        : gps.status === "stale"
          ? "GPS stale"
          : "Waiting for GPS";
  const tuneEngine=(p:EnginePatch)=>{onSavePatch(editableEngine(p));setPanel("studio");};
  // Chrono Coupe 88 mph time-jump: the '88 mph time jump (light and sound)' option gates the UI cue and the skin light.
  const {cueOn:timeJumpCue,setCueOn:setTimeJumpCue,active:timeJumpActive,onTimeJump}=useTimeJump(audio,theme.id);
  // Selecting a theme pack selects its linked engine too; plain themes are unchanged.
  const selectCluster=(id:string)=>{themes.selectSkin(id);const pack=packForThemeId(id);const engine=pack&&getBuiltin(pack.engineId);if(engine&&isEngineIdVisible(engine.id)&&audio.engineId!==engine.id)onSelectEngine(structuredClone(engine));};
  // The locked IGNITION splash keeps main's road scene behind it: until IGNITION a pack
  // theme's stage (and accent) render the road backdrop, then the pack backdrop/HUD takes
  // over. Was pack-preview builds only; since the Oct 8 catalogue trim every visible theme
  // is a pack (fresh users start on Night Pursuit), so this now applies on every build.
  const stageTheme=!ignited&&packForThemeId(theme.id)?themeForId(SPLASH_BACKDROP_THEME):theme;
  // Catalogue trim: RoadView scenes and the DashLab custom grid are hidden unless allowlisted.
  const atmospheresListed=LISTED_THEMES.some(t=>t.family==='RoadView');
  const dashLabListed=isThemeListed('custom-grid');
  const panelTitle=panel==='tuner'?'Tuner':panel==='tune'?'Settings':panel==='themes'||panel==='scenes'?'Visuals':panel==='garage'?'Revs':panel==='account'?'Account':'Lab';
  return (
    <div
      className="forge"
      style={{ "--forge-accent": stageTheme.accent } as CSSProperties}
    >
      <main className={`rev-viewport ${!ignited&&source==='demo'?'is-launch':''}`} inert={panel?true:undefined} aria-busy={audio.starting||undefined} style={{'--hud-scale':scale,'--hud-opacity':opacity} as CSSProperties}>
        <section className="rev-scene" aria-label="Full-screen dashboard">
          <ThemeStage maxSpeedMps={config.topSpeedMps} fonts={themes.fonts[stageTheme.id]} widgets={themes.widgets} lockStage={audio.getLockStage()} onTimeJump={onTimeJump} timeJumpActive={timeJumpActive} colors={themes.colors[stageTheme.id]} sceneColors={themes.colors[themes.atmosphereId+'-scene']} atmosphereId={themeForId(themes.atmosphereId).sceneId} theme={stageTheme} state={hud} simulation={simulation} warningRpm={config.warningRpm} redline={config.redline} unit={prefs.speedUnit} demo={source==='demo'} motion={sceneMotion} running={audio.running} gpsLabel={gpsLabel}/>
        </section>
        <header className="rev-topbar"><div><strong>REVFORGE</strong>{ignited&&<small>{garage.active?.name??theme.name}</small>}</div><button ref={tunerButton} className="rev-chip" aria-haspopup="dialog" onClick={()=>setPanel('tuner')}>Tuner <Icon name="tune" size={18}/></button></header>
        <p className="sr-only" role="status">{audio.starting?'Starting engine':''}</p>
        {!ignited?<div className="rev-launch"><p>ENGINE SOUND · YOUR ATMOSPHERE</p><h1>RevForge</h1><button type="button" className="rev-ignite" disabled={audio.starting} onClick={start}>{audio.starting?'Starting…':'IGNITION'}</button><small>Set up while parked · Keep the browser visible</small></div>:<>
          {source==='demo'&&<div className="rev-throttle"><HigSlider label="Throttle" min={0} max={1} step={.01} disabled={!revReady} value={pedal} display={`${Math.round(pedal*100)}%`} valueText={pctText(pedal)} onChange={setPedal}/></div>}
          <footer className="rev-dock" aria-label="Drive controls">
            <HigSegmented className="rev-transmission" label="Transmission" value={mode} onChange={setMode} options={[{value:'auto',label:'Auto'},{value:'manual',label:'Manual'}]}/>
            {mode==='manual'&&<div className="rev-shifter" role="group" aria-label="Gear"><button className="rev-chip" disabled={!audio.running} aria-label="Downshift" onClick={()=>paddle(-1)}><HigIcon name="minus"/></button><button className="rev-chip" disabled={!audio.running} aria-label="Neutral" onClick={neutral}>N</button><button className="rev-chip" disabled={!audio.running} aria-label="Upshift" onClick={()=>paddle(1)}><HigIcon name="plus"/></button></div>}
            {source==='demo'&&<button className="rev-chip" disabled={!revReady} aria-describedby="rev-hold-hint" onPointerDown={e=>hold(e,'throttle')} onPointerUp={()=>setPedal(0)} onPointerCancel={()=>setPedal(0)} onLostPointerCapture={()=>setPedal(0)} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();e.stopPropagation();setPedal(1);}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();setPedal(0);}}} onBlur={()=>setPedal(0)}>Hold to rev</button>}
            {source==='demo'&&<span id="rev-hold-hint" className="sr-only">Press and hold. Keyboard: hold Space.</span>}
            {patch?.kind==='scifi'&&<button className="rev-chip rev-blaster" disabled={!audio.running} onClick={()=>audio.triggerUiCue('ion-cannon')}>Pulse Burst</button>}
            <button className="rev-chip rev-stop" disabled={audio.starting} onClick={audio.running?stop:start}>{audio.running?'Shutdown':mutedBeforeHide?'Resume':'Ignition'}</button>
          </footer>
        </>}
        {audio.error&&<p className="rev-message" role="alert">{audio.error}</p>}
      </main>
      {panel && (
        <div className="forge-modal-backdrop" onClick={() => setPanel(null)}>
          <section
            className="forge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuner-sheet-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPanel(null);
              if (e.key === "Tab") {
                const targets = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1']),summary",
                  ),
                );
                const first = targets[0],
                  last = targets.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="forge-modal-heading">
              <div className="forge-modal-titles">
                {panel!=="tuner"&&<button type="button" className="tuner-back" onClick={()=>setPanel("tuner")}><HigIcon name="chevron-left"/>Tuner</button>}<h2 id="tuner-sheet-title">{panelTitle}</h2>
              </div>
              <button
                autoFocus
                type="button"
                className="forge-icon"
                aria-label="Close"
                onClick={() => setPanel(null)}
              >
                <HigIcon name="x" />
              </button>
            </div>
            {panel==='tuner'&&<div className="tuner-menu">{([['tune','Settings','Display, sound, drive and controls'],['themes','Visuals',atmospheresListed?'Themes and Clusters':'Clusters'],['garage','Revs','Original engine collection'],[dashLabListed?'dashlab':'studio','Lab',dashLabListed?'DashLab and EngineForge':'EngineForge'],['account','Account','Vehicles and saved configurations']] as const).map(([id,label,hint])=><button type="button" key={id} className="hig-row-button" onClick={()=>setPanel(id)}><strong>{label}</strong><small>{hint}</small><span aria-hidden="true"><HigIcon name="chevron-right"/></span></button>)}<button type="button" className="hig-row-button" onClick={()=>navigate('/sound-builder')}><strong>Sound Builder</strong><small>Build an engine sound from synth nodes</small><span aria-hidden="true"><HigIcon name="chevron-right"/></span></button></div>}
            {(panel==='themes'||panel==='scenes')&&(atmospheresListed?<><HigSegmented tabs panelId="visuals-panel" label="Visuals" value={panel==='scenes'?'scenes':'themes'} onChange={v=>setPanel(v)} options={[{value:'themes',label:'Themes'},{value:'scenes',label:'Clusters'}]}/><div role="tabpanel" id="visuals-panel" aria-labelledby={`visuals-panel-tab-${panel==='scenes'?'scenes':'themes'}`}>{panel==='themes'&&atmospheresListed?<ThemePicker key="atmosphere" mode="atmosphere" selected={themes.atmosphereId} onSelect={themes.selectAtmosphere}/>:<>{isThemeListed(themes.atmosphereId)&&<button type="button" className="hig-btn rf-simple-hud" aria-pressed={themes.skinId===themes.atmosphereId} onClick={()=>themes.selectSkin(themes.atmosphereId)}>Simple RevForge HUD</button>}<ThemePicker key="cluster" mode="cluster" selected={themes.skinId} onSelect={selectCluster}/></>}<section className="theme-builder-panel" style={{marginTop:18}}><h2>Appearance</h2><AppearanceKnobs prefs={prefs} update={update}/></section><section className="theme-builder-panel"><h2>Drive Dynamics</h2><DriveDynamicsPanel prefs={prefs} update={update}/></section></div></>:<>{panel==='themes'&&atmospheresListed?<ThemePicker key="atmosphere" mode="atmosphere" selected={themes.atmosphereId} onSelect={themes.selectAtmosphere}/>:<>{isThemeListed(themes.atmosphereId)&&<button type="button" className="hig-btn rf-simple-hud" aria-pressed={themes.skinId===themes.atmosphereId} onClick={()=>themes.selectSkin(themes.atmosphereId)}>Simple RevForge HUD</button>}<ThemePicker key="cluster" mode="cluster" selected={themes.skinId} onSelect={selectCluster}/></>}<section className="theme-builder-panel" style={{marginTop:18}}><h2>Appearance</h2><AppearanceKnobs prefs={prefs} update={update}/></section><section className="theme-builder-panel"><h2>Drive Dynamics</h2><DriveDynamicsPanel prefs={prefs} update={update}/></section></>)}
            {panel==='garage'&&<><p className="hig-hint">Choose an original engine. Tune This Engine creates an editable copy.</p><details className="garage-colors"><summary>Garage appearance · recolor</summary><ThemeColors themes={themes}/></details><div className="forge-garage-list">{BUILTIN_PATCHES.filter(p=>isEngineIdVisible(p.id)||audio.engineId===p.id).map(p=>{const kind={ice:"Combustion",scifi:"Sci-fi",aerospace:"Jet",'ev-whine':"Electric"}[p.kind];return <article className="rev-engine-card" key={p.id}><button type="button" aria-pressed={audio.engineId===p.id} aria-label={`${p.name}, ${kind}`} onClick={()=>onSelectEngine(structuredClone(p))}><strong>{p.name}</strong><small>{kind} · Original preset</small>{audio.engineId===p.id&&<span className="rev-engine-active"><HigIcon name="check"/>Active</span>}</button><button type="button" onClick={()=>tuneEngine(p)}>Tune This Engine<span className="sr-only"> · {p.name}</span></button></article>;})}</div></>}
            {(panel==='studio'||panel==='dashlab')&&(dashLabListed?<><HigSegmented tabs panelId="lab-panel" label="Lab" value={panel==='studio'?'studio':'dashlab'} onChange={v=>setPanel(v)} options={[{value:'dashlab',label:'DashLab'},{value:'studio',label:'EngineForge'}]}/><div role="tabpanel" id="lab-panel" aria-labelledby={`lab-panel-tab-${panel==='studio'?'studio':'dashlab'}`}>{panel==='dashlab'&&dashLabListed?<Guide kind="dash"><ClusterBuilder widgets={themes.widgets} onChange={themes.saveWidgets} onUse={()=>{themes.selectSkin('custom-grid');setPanel(null);}}/></Guide>:<Guide kind="engine">{patch&&(!isCustomEngine(patch)?<section className="locked-engine"><h3>{patch.name}</h3><p>This is an original preset. Create a custom engine to tune its components.</p><button type="button" onClick={()=>tuneEngine(patch)}>Tune This Engine</button></section>:<><h3>{patch.name}</h3>{userPatches.length>0&&<HigListPicker label="Custom engine" value={patch.id} options={userPatches.map(p=>({value:p.id,label:p.name}))} onChange={id=>{const p=userPatches.find(p=>p.id===id);if(p)onSelectEngine(p);}}/>}<button type="button" disabled={audio.starting} onClick={audio.running?stop:start}>{audio.running?'Stop audition':'Audition sound'}</button><NativeStudio key={patch.id} patch={patch} onChange={next=>{onSelectEngine(next);setRevision(r=>r+1);}} onSave={onSavePatch}/></>)}</Guide>}</div></>:<>{panel==='dashlab'&&dashLabListed?<Guide kind="dash"><ClusterBuilder widgets={themes.widgets} onChange={themes.saveWidgets} onUse={()=>{themes.selectSkin('custom-grid');setPanel(null);}}/></Guide>:<Guide kind="engine">{patch&&(!isCustomEngine(patch)?<section className="locked-engine"><h3>{patch.name}</h3><p>This is an original preset. Create a custom engine to tune its components.</p><button type="button" onClick={()=>tuneEngine(patch)}>Tune This Engine</button></section>:<><h3>{patch.name}</h3>{userPatches.length>0&&<HigListPicker label="Custom engine" value={patch.id} options={userPatches.map(p=>({value:p.id,label:p.name}))} onChange={id=>{const p=userPatches.find(p=>p.id===id);if(p)onSelectEngine(p);}}/>}<button type="button" disabled={audio.starting} onClick={audio.running?stop:start}>{audio.running?'Stop audition':'Audition sound'}</button><NativeStudio key={patch.id} patch={patch} onChange={next=>{onSelectEngine(next);setRevision(r=>r+1);}} onSave={onSavePatch}/></>)}</Guide>}</>)}
            {panel==='account'&&<AccountPanel garage={garage} themes={themes} patch={patch} userPatches={userPatches} onEngine={onSavePatch} onLoad={id=>{const c=themes.combinations.find(c=>c.id===id);if(c){themes.loadAppearance(c);onSavePatch(resolveVisibleEnginePatch(c.sound));}}}/>}
            {panel === "tune" && (
              <div className="forge-tune hig-settings">
                <DisplaySettings prefs={prefs} update={update} idPrefix="tuner-display"/>
                <HigGroup title="Dashboard" id="tuner-dash-title">
                  <HigSwitch label="Animated environment" description={a11y.reduceMotion?'Paused while Reduce motion is on.':'Moving road scene behind the instruments.'} checked={sceneMotion} disabled={a11y.reduceMotion} onChange={setMotion}/>
                  <HigSlider label="Dashboard scale" min={.65} max={1.35} step={.01} value={scale} display={`${Math.round(scale*100)}%`} valueText={pctText(scale)} onChange={setScale}/>
                  <HigSlider label="Instrument opacity" min={.25} max={1} step={.01} value={opacity} display={`${Math.round(opacity*100)}%`} valueText={pctText(opacity)} onChange={v=>update({hudOpacity:v})}/>
                  <FontPicker value={themes.fonts[themes.skinId]??{numbers:"default",labels:"default"}} onChange={value=>themes.setFont(themes.skinId,value)}/>
                </HigGroup>
                <HigGroup title="Sound" id="tuner-sound-title" footer={`${audio.backgroundStatus} · Audio context: ${audio.getDiag().contextState}`}>
                  <HigSlider label="Volume" min={0} max={1} step={.01} value={prefs.masterVolume} display={`${Math.round(prefs.masterVolume*100)}%`} valueText={pctText(prefs.masterVolume)} hint="Mix level inside RevForge. Use the car's volume control for overall loudness." onChange={v=>update({masterVolume:v})}/>
                  <HigSwitch label="Mute" checked={prefs.masterMuted} onChange={masterMuted=>update({masterMuted})}/>
                  <HigSwitch label="Background audio" description="Keep playing when the browser is not in front, where supported." checked={audio.background} onChange={on=>audio.setBackgroundEnabled(on)}/>
                  {/* Chrono Coupe 88 mph time jump (chrono-88): HIG switch row, same label and aria-label. */}
                  <TimeJumpCueSwitch on={timeJumpCue} onChange={setTimeJumpCue}/>
                  <HigSwitch label="Shift sound" description="Short mechanical bark on Manual upshifts." checked={prefs.upshiftSfx} onChange={upshiftSfx=>update({upshiftSfx})}/>
                  <HigSwitch label="Ion lock cues" description="Chirp when Twin Ion target lock engages." checked={prefs.ionTwinLockSfx} onChange={ionTwinLockSfx=>update({ionTwinLockSfx})}/>
                </HigGroup>
                <HigGroup title="Drive" id="tuner-drive-title" footer="Turn Demo off to use browser GPS. Location permission is required.">
                  <HigSwitch label="Demo mode" description="Simulated speed. Turn off to read speed from GPS." checked={source==='demo'} onChange={on=>sourceChange(on?'demo':'gps')}/>
                  {source==='gps'&&<div role="status" className="hig-status-row"><p>{gpsLabel} · {gps.accuracy===null?'No fix':`Accuracy ±${Math.round(gps.accuracy)} m`}</p>{gps.errorMessage&&<p>{gps.errorMessage}</p>}<button type="button" className="hig-btn" onClick={gps.start}>Retry GPS</button></div>}
                  <div className="hig-field"><span id="tuner-units-label" className="hig-field-label">Speed units</span><HigSegmented labelledBy="tuner-units-label" value={prefs.speedUnit} onChange={speedUnit=>update({speedUnit})} options={[{value:'mph',label:'mph',ariaLabel:'Miles per hour'},{value:'kph',label:'km/h',ariaLabel:'Kilometers per hour'}]}/></div>
                  <HigSwitch label="Idle jitter" description="Subtle RPM wander at idle that fades as you accelerate." checked={jitterEnabled} onChange={setJitterEnabled}/>
                  <HigSlider label="Idle jitter intensity" min={0} max={1} step={.01} disabled={!jitterEnabled} value={jitterAmount} display={`${Math.round(jitterAmount*100)}%`} valueText={pctText(jitterAmount)} onChange={setJitterAmount}/>
                </HigGroup>
                <HigGroup title="Steering-wheel controls" id="tuner-controls-title" footer="Background playback and wheel events depend on the browser. If interrupted, tap Ignition to resume; touch shifting remains available.">
                  {/* Media-session rows stay native checkboxes in a full-width row (owned by the media-session work, not this pass). */}
                  <label className="hig-legacy-row">Steering-wheel media buttons shift gears<input type="checkbox" checked={mediaButtons} onChange={e=>setMediaButtons(e.target.checked)}/></label>
                  <p className="hig-hint">While the engine runs, RevForge takes the media controls (Miniplayer and steering wheel). Shutdown hands them back to your music.</p>
                  <label className="hig-legacy-row">Play/pause button upshifts in Manual<input type="checkbox" checked={pauseShifts} onChange={e=>setPauseShifts(e.target.checked)}/></label>
                  <p className="hig-hint">Twin-Ion: received play/pause events fire a pulse burst. Other engines: pause stops (or upshifts in Manual). Next/previous shift gears like the paddles (in Auto they switch to Manual). Touch Shutdown always stops.</p>
                  <div className="compatibility-box"><h4>Tesla input check</h4><dl><dt>Location API</dt><dd>{typeof navigator!=='undefined'&&'geolocation' in navigator?'Available':'Unavailable'}</dd><dt>GPS status</dt><dd>{gps.status}</dd><dt>Position accuracy</dt><dd>{gps.accuracy===null?'No reading':`±${Math.round(gps.accuracy)} m`}</dd><dt>Speed reading</dt><dd>{gps.timestamp===null?'Not received':`${gps.mph.toFixed(1)} mph`}</dd><dt>Media handlers</dt><dd>{media.accepted.length}/4 registered</dd><dt>Media session</dt><dd>{media.carrier}</dd><dt>Engine output element</dt><dd>{media.outputPlaying?'Playing':'Direct Web Audio'}</dd></dl><p className="input-check-log" role="status">{media.lastEvent}</p>{media.history.length>1&&<p className="input-check-log">{media.history.slice(1).map((line,i)=><span key={i} style={{display:'block'}}>{line}</span>)}</p>}<button type="button" className="hig-btn" disabled={!mediaButtons || !audio.running} onClick={media.arm}>Enable controls / recheck</button><p>While parked, start the engine and press your media buttons. An event appearing here confirms delivery to this browser. Button registration alone does not mean Tesla delivers the event. GPS speed requires an actual location reading.</p></div>
                </HigGroup>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
