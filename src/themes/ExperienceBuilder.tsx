import {useVehicleGarage} from '../account/useVehicleGarage';
import {editableEngine} from '../forge/engineDraft';
import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {BUILTIN_PATCHES} from '../audio';
import type {EnginePatch} from '../audio';
import type {useAudioEngine} from '../hooks/useAudioEngine';
import type {useThemes} from './useThemes';
import {ThemePicker} from './ThemePicker';
import {ThemeStage} from './ThemeStage';
import {LISTED_THEMES,resolveThemeId,themeForId} from './catalog';
import {createSimulation} from '../forge/simulation';
import {drivetrainFor,sceneForId} from '../forge/catalog';
import '../forge/forge.css';
interface Props {themes:ReturnType<typeof useThemes>;audio:ReturnType<typeof useAudioEngine>;userPatches:EnginePatch[];onSelect:(p:EnginePatch)=>void;onLoadCombination:(skinId:string,p:EnginePatch,atmosphereId?:string)=>void;}
export function ExperienceBuilder({themes,audio,userPatches,onSelect,onLoadCombination}:Props) {
 const [preview,setPreview]=useState(.42),[name,setName]=useState(''),[message,setMessage]=useState('');
 const garage=useVehicleGarage();
 const patch=audio.getPatch()??BUILTIN_PATCHES[0],config={...drivetrainFor(patch,sceneForId('road-66')),...(garage.active?{topSpeedMps:garage.active.topSpeedKph/3.6}:{})};
 const simulation=useRef(createSimulation(config));
 const state={...createSimulation(config),rpm:config.idleRpm+preview*(config.redline-config.idleRpm),speedMps:preview*42,load:preview,gear:Math.max(1,Math.round(preview*(config.gears-1)+1)),distance:preview*1000};
 useEffect(()=>{simulation.current=state;});
 useEffect(()=>{if(audio.running)audio.setDriving({speed:preview*.8,throttle:preview,load:preview,rpm:config.idleRpm+preview*(config.redline-config.idleRpm),rpmNorm:preview});},[audio,preview,config.idleRpm,config.redline]);
 const stop=audio.stop;
 useEffect(()=>{const hide=()=>{if(document.visibilityState==='hidden')stop();};document.addEventListener('visibilitychange',hide);return()=>{document.removeEventListener('visibilitychange',hide);stop();};},[stop]);
 const options=[...BUILTIN_PATCHES,...userPatches];if(!options.some(p=>p.id===patch.id))options.push(patch);
 const skin=themeForId(themes.skinId);
 return <div className="forge"><main className="theme-builder"><header className="theme-builder-header"><div><span className="forge-eyebrow">REVFORGE / EXPERIENCE BUILDER</span><h1>Your look. Your sound.</h1><p>{LISTED_THEMES.length} dynamic skins. Every sound can pair with every skin.</p></div><Link className="forge-text-button" to="/drive">Return to drive ↗</Link></header>
 <div className="theme-builder-layout"><div className="theme-builder-preview"><ThemeStage maxSpeedMps={config.topSpeedMps} fonts={themes.fonts[themes.skinId]} widgets={themes.widgets} colors={themes.colors[themes.skinId]} sceneColors={themes.colors[themes.atmosphereId+'-scene']} atmosphereId={themeForId(themes.atmosphereId).sceneId} theme={skin} state={state} simulation={simulation} warningRpm={config.warningRpm} redline={config.redline} unit="mph" demo motion running/>
  <div className="theme-builder-tools"><label>Preview intensity<input aria-label="Preview intensity" type="range" min="0" max="1" step=".01" value={preview} onChange={e=>setPreview(Number(e.target.value))}/></label><button className="forge-text-button" disabled={audio.starting} onClick={()=>audio.running?audio.stop():void audio.start()}>{audio.running?'Stop sound':'Audition sound'}</button></div>
  <p className="forge-control-hint">Preview uses simulated values. Selecting a skin keeps your current sound.</p>{audio.error&&<p role="alert">{audio.error}</p>}
  <section className="theme-builder-panel"><h2>02 / Sound</h2><select aria-label="Sound preset" value={patch.id} onChange={e=>{const p=options.find(p=>p.id===e.target.value);if(p)onSelect(p);}}>{options.map(p=><option key={p.id} value={p.id}>{p.name}{p.revforge?' · RevForge':''}</option>)}</select><Link className="rf-hit rf-hit-link" to="/drive?studio=1" onClick={()=>onSelect(editableEngine(patch))}>Tune This Engine</Link><p className="forge-control-hint">{patch.revforge?'Native RevForge synthesis':'DriveSynth synthesis'} · {skin.name} appearance</p><Link className="forge-text-button" to="/drive?studio=1">Tune this sound ↗</Link></section>
  <section className="theme-builder-panel"><h2>03 / Save combination</h2><input type="text" aria-label="Combination name" value={name} onChange={e=>setName(e.target.value)} placeholder={`${skin.name} + ${patch.name}`}/><button className="forge-text-button" onClick={()=>{themes.saveCombination(name,patch);setMessage('Combination added.');setName('');}}>Save skin + sound</button><p role="status">{themes.storageError||message}</p>
  {themes.combinations.map(c=><div className="combination-row" key={c.id}><button className="forge-text-button" onClick={()=>{onLoadCombination(c.skinId,c.sound,c.atmosphereId);setMessage(`Loaded ${c.name}`);}}>{c.name}<small>{themeForId(resolveThemeId(c.skinId)).name} · {c.sound.name}</small></button><button className="forge-icon" aria-label={`Delete ${c.name}`} onClick={()=>themes.removeCombination(c.id)}>×</button></div>)}
  </section>
 </div><section className="theme-builder-panel"><h2>01 / Appearance</h2>{LISTED_THEMES.some(t=>t.family==='RoadView')&&<><h3>Atmosphere</h3><ThemePicker mode="atmosphere" selected={themes.atmosphereId} onSelect={themes.selectAtmosphere}/></>}<h3>Dashboard overlay</h3><ThemePicker mode="cluster" selected={themes.skinId} onSelect={themes.selectSkin}/></section></div></main></div>;
}
