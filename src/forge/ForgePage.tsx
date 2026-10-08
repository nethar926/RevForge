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
  const panelTitle=panel==='tuner'?'TUNE':panel==='tune'?'Options':panel==='themes'||panel==='scenes'?'Visuals':panel==='garage'?'Revs':panel==='account'?'Account':'Lab';
  return (
    <div
      className="forge"
      style={{ "--forge-accent": stageTheme.accent } as CSSProperties}
    >
      <main className={`rev-viewport ${!ignited&&source==='demo'?'is-launch':''}`} style={{'--hud-scale':scale,'--hud-opacity':opacity} as CSSProperties}>
        <section className="rev-scene" aria-label="Full-screen dashboard">
          <ThemeStage maxSpeedMps={config.topSpeedMps} fonts={themes.fonts[stageTheme.id]} widgets={themes.widgets} lockStage={audio.getLockStage()} onTimeJump={onTimeJump} timeJumpActive={timeJumpActive} colors={themes.colors[stageTheme.id]} sceneColors={themes.colors[themes.atmosphereId+'-scene']} atmosphereId={themeForId(themes.atmosphereId).sceneId} theme={stageTheme} state={hud} simulation={simulation} warningRpm={config.warningRpm} redline={config.redline} unit={prefs.speedUnit} demo={source==='demo'} motion={motion} running={audio.running} gpsLabel={gpsLabel}/>
        </section>
        <header className="rev-topbar"><div><strong>REVFORGE</strong>{ignited&&<small>{garage.active?.name??theme.name}</small>}</div><button className="rev-chip" onClick={()=>setPanel('tuner')}>Tuner <Icon name="tune" size={18}/></button></header>
        {!ignited?<div className="rev-launch"><p>ENGINE SOUND · YOUR ATMOSPHERE</p><h1>RevForge</h1><button type="button" className="rev-ignite" disabled={audio.starting} onClick={start}>{audio.starting?'Starting…':'IGNITION'}</button><small>Set up while parked · Keep the browser visible</small></div>:<>
          {source==='demo'&&<label className="rev-throttle">Throttle <span>{Math.round(pedal*100)}%</span><input aria-label="Throttle" type="range" min="0" max="1" step=".01" disabled={!revReady} value={pedal} onChange={e=>setPedal(Number(e.target.value))}/></label>}
          <footer className="rev-dock" aria-label="Drive controls">
            <div className="rev-segment"><button aria-pressed={mode==='auto'} onClick={()=>setMode('auto')}>Auto</button><button aria-pressed={mode==='manual'} onClick={()=>setMode('manual')}>Manual</button></div>
            {mode==='manual'&&<><button className="rev-chip" disabled={!audio.running} aria-label="Downshift" onClick={()=>paddle(-1)}>−</button><button className="rev-chip" disabled={!audio.running} onClick={neutral}>N</button><button className="rev-chip" disabled={!audio.running} aria-label="Upshift" onClick={()=>paddle(1)}>+</button></>}
            {source==='demo'&&<button className="rev-chip" disabled={!revReady} onPointerDown={e=>hold(e,'throttle')} onPointerUp={()=>setPedal(0)} onPointerCancel={()=>setPedal(0)} onLostPointerCapture={()=>setPedal(0)}>Hold to rev</button>}
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
            aria-label={panelTitle}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPanel(null);
              if (e.key === "Tab") {
                const targets = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
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
              <div>
                <span className="forge-eyebrow">REVFORGE / TUNE</span>{panel!=="tuner"&&<button className="tuner-back" onClick={()=>setPanel("tuner")}>← TUNE</button>}<h2>{panelTitle}</h2>
              </div>
              <button
                autoFocus
                className="forge-icon"
                aria-label="Close panel"
                onClick={() => setPanel(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            {panel==='tuner'&&<div className="tuner-menu">{([['tune','Options','Base UI, Demo mode and playback'],['themes','Visuals',atmospheresListed?'Themes and Clusters':'Clusters'],['garage','Revs','Original engine collection'],[dashLabListed?'dashlab':'studio','Lab',dashLabListed?'DashLab and EngineForge':'EngineForge'],['account','Account','Vehicles and saved configurations']] as const).map(([id,label,hint])=><button key={id} onClick={()=>setPanel(id)}><strong>{label}</strong><small>{hint}</small><span>↗</span></button>)}<button onClick={()=>navigate('/sound-builder')}><strong>Sound Builder</strong><small>Build an engine sound from synth nodes</small><span>↗</span></button></div>}
            {(panel==='themes'||panel==='scenes')&&<>{atmospheresListed&&<div role="tablist" aria-label="Visuals tabs"><button role="tab" className="rf-hit" aria-selected={panel==='themes'} onClick={()=>setPanel('themes')}>Themes</button><button role="tab" className="rf-hit" aria-selected={panel==='scenes'} onClick={()=>setPanel('scenes')}>Clusters</button></div>}{panel==='themes'&&atmospheresListed?<ThemePicker key="atmosphere" mode="atmosphere" selected={themes.atmosphereId} onSelect={themes.selectAtmosphere}/>:<>{isThemeListed(themes.atmosphereId)&&<button className="rf-hit" onClick={()=>themes.selectSkin(themes.atmosphereId)}>Simple RevForge HUD</button>}<ThemePicker key="cluster" mode="cluster" selected={themes.skinId} onSelect={selectCluster}/></>}<section className="theme-builder-panel" style={{marginTop:18}}><h2>Appearance</h2><AppearanceKnobs prefs={prefs} update={update}/></section><section className="theme-builder-panel"><h2>Drive Dynamics</h2><DriveDynamicsPanel prefs={prefs} update={update}/><p className="rf-frontend-note">Also on <code>/customize</code>. Frontend: fold under ☰ → Interface Options → Visuals when hamburger lands.</p></section></>}
            {panel==='garage'&&<><p>Choose an original engine. Create an editable copy with Tune This Engine.</p><details className="garage-colors"><summary>Garage appearance · recolor</summary><ThemeColors themes={themes}/></details><div className="forge-garage-list">{BUILTIN_PATCHES.filter(p=>isEngineIdVisible(p.id)||audio.engineId===p.id).map(p=><article className="rev-engine-card" key={p.id}><button aria-pressed={audio.engineId===p.id} onClick={()=>onSelectEngine(structuredClone(p))}><strong>{p.name}</strong><small>{{ice:"Combustion",scifi:"Sci-fi",aerospace:"Jet",'ev-whine':"Electric"}[p.kind]} · Original preset</small></button><button onClick={()=>tuneEngine(p)}>Tune This Engine<span className="sr-only"> · {p.name}</span></button></article>)}</div></>}
            {(panel==='studio'||panel==='dashlab')&&<><div role="tablist" aria-label="Lab tabs">{dashLabListed&&<button role="tab" aria-selected={panel==='dashlab'} onClick={()=>setPanel('dashlab')}>DashLab</button>}<button role="tab" aria-selected={panel==='studio'} onClick={()=>setPanel('studio')}>EngineForge</button></div>{panel==='dashlab'&&dashLabListed?<Guide kind="dash"><ClusterBuilder widgets={themes.widgets} onChange={themes.saveWidgets} onUse={()=>{themes.selectSkin('custom-grid');setPanel(null);}}/></Guide>:<Guide kind="engine">{patch&&(!isCustomEngine(patch)?<section className="locked-engine"><h3>{patch.name}</h3><p>This is an original preset. Create a custom engine to tune its components.</p><button onClick={()=>tuneEngine(patch)}>Tune This Engine</button></section>:<><h3>{patch.name}</h3>{userPatches.length>0&&<label>Custom engine<select aria-label="Custom engine" value={patch.id} onChange={e=>{const p=userPatches.find(p=>p.id===e.target.value);if(p)onSelectEngine(p);}}>{userPatches.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}<button disabled={audio.starting} onClick={audio.running?stop:start}>{audio.running?'Stop audition':'Audition sound'}</button><NativeStudio key={patch.id} patch={patch} onChange={next=>{onSelectEngine(next);setRevision(r=>r+1);}} onSave={onSavePatch}/></>)}</Guide>}</>}
            {panel==='account'&&<AccountPanel garage={garage} themes={themes} patch={patch} userPatches={userPatches} onEngine={onSavePatch} onLoad={id=>{const c=themes.combinations.find(c=>c.id===id);if(c){themes.loadAppearance(c);onSavePatch(resolveVisibleEnginePatch(c.sound));}}}/>}
            {panel === "tune" && (
              <div className="forge-tune">
                <FontPicker value={themes.fonts[themes.skinId]??{numbers:"default",labels:"default"}} onChange={value=>themes.setFont(themes.skinId,value)}/><label>Dashboard scale · {Math.round(scale*100)}%<input aria-label="Dashboard scale" type="range" min=".65" max="1.35" step=".01" value={scale} onChange={e=>setScale(Number(e.target.value))}/></label><label>Instrument opacity<input aria-label="Instrument opacity" type="range" min=".25" max="1" step=".01" value={opacity} onChange={e=>update({hudOpacity:Number(e.target.value)})}/></label><label>Volume<input aria-label="Master volume" type="range" min="0" max="1" step=".01" value={prefs.masterVolume} onChange={e=>update({masterVolume:Number(e.target.value)})}/></label><label>Mute<input aria-label="Mute" type="checkbox" checked={prefs.masterMuted} onChange={e=>update({masterMuted:e.target.checked})}/></label>
                <label>Background audio<input aria-label="Background audio" type="checkbox" checked={audio.background} onChange={e=>audio.setBackgroundEnabled(e.target.checked)}/></label><TimeJumpCueSwitch on={timeJumpCue} onChange={setTimeJumpCue}/><p role="status">{audio.backgroundStatus} · Audio context: {audio.getDiag().contextState}</p><label>Demo mode<input aria-label="Demo mode" type="checkbox" checked={source==='demo'} onChange={e=>sourceChange(e.target.checked?'demo':'gps')}/></label>
                <p className="forge-control-hint">Turn Demo off to use browser GPS. Location permission is required.</p>{source==='gps'&&<div role="status"><p>{gpsLabel} · {gps.accuracy===null?'No fix':`Accuracy ±${Math.round(gps.accuracy)} m`}</p><p>{gps.errorMessage}</p><button onClick={gps.start}>Retry GPS</button></div>}
                <label>Idle jitter<input aria-label="Idle jitter" type="checkbox" checked={jitterEnabled} onChange={e=>setJitterEnabled(e.target.checked)}/></label><label>Idle jitter intensity · {Math.round(jitterAmount*100)}%<input aria-label="Idle jitter intensity" type="range" min="0" max="1" step=".01" disabled={!jitterEnabled} value={jitterAmount} onChange={e=>setJitterAmount(Number(e.target.value))}/></label><p className="forge-control-hint">Adds subtle RPM wander at idle. Fades out as you accelerate.</p>
                <label>Steering-wheel media buttons shift gears<input type="checkbox" checked={mediaButtons} onChange={e=>setMediaButtons(e.target.checked)}/></label>
                <p className="forge-control-hint">While the engine runs, RevForge takes the media controls (Miniplayer and steering wheel). Shutdown hands them back to your music. Background playback and wheel events depend on the browser. If interrupted, tap Ignition to resume; touch shifting remains available.</p>
                <label>Play/pause button upshifts in Manual<input type="checkbox" checked={pauseShifts} onChange={e=>setPauseShifts(e.target.checked)}/></label>
                <p className="forge-control-hint">Twin-Ion: received play/pause events fire a pulse burst. Other engines: pause stops (or upshifts in Manual). Next/previous shift gears like the paddles (in Auto they switch to Manual). Touch Shutdown always stops.</p>
                <div className="compatibility-box"><h3>Tesla input check</h3><dl><dt>Location API</dt><dd>{typeof navigator!=='undefined'&&'geolocation' in navigator?'Available':'Unavailable'}</dd><dt>GPS status</dt><dd>{gps.status}</dd><dt>Position accuracy</dt><dd>{gps.accuracy===null?'No reading':`±${Math.round(gps.accuracy)} m`}</dd><dt>Speed reading</dt><dd>{gps.timestamp===null?'Not received':`${gps.mph.toFixed(1)} mph`}</dd><dt>Media handlers</dt><dd>{media.accepted.length}/4 registered</dd><dt>Media session</dt><dd>{media.carrier}</dd><dt>Engine output element</dt><dd>{media.outputPlaying?'Playing':'Direct Web Audio'}</dd></dl><p className="input-check-log" role="status">{media.lastEvent}</p>{media.history.length>1&&<p className="input-check-log">{media.history.slice(1).map((line,i)=><span key={i} style={{display:'block'}}>{line}</span>)}</p>}<button className="forge-text-button" disabled={!mediaButtons || !audio.running} onClick={media.arm}>Enable controls / recheck</button><p>While parked, start the engine and press your media buttons. An event appearing here confirms delivery to this browser. Button registration alone does not mean Tesla delivers the event. GPS speed requires an actual location reading.</p></div>

                <label>
                  Speed units
                  <select
                    value={prefs.speedUnit}
                    onChange={(e) =>
                      update({
                        speedUnit: e.target.value as UiPrefs["speedUnit"],
                      })
                    }
                  >
                    <option value="mph">Miles per hour</option>
                    <option value="kph">Kilometers per hour</option>
                  </select>
                </label>
                <label>
                  Animated environment
                  <input
                    type="checkbox"
                    checked={motion}
                    onChange={(e) => setMotion(e.target.checked)}
                  />
                </label>
                <label>
                  Shift sound
                  <input
                    type="checkbox"
                    checked={prefs.upshiftSfx}
                    onChange={(e) => update({ upshiftSfx: e.target.checked })}
                  />
                </label>
                <label>
                  Ion lock cues
                  <input
                    type="checkbox"
                    checked={prefs.ionTwinLockSfx}
                    onChange={(e) =>
                      update({ ionTwinLockSfx: e.target.checked })
                    }
                  />
                </label>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
