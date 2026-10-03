import {fontCss,type FontChoice} from './FontPicker';
import {CustomCluster} from './CustomCluster';
import {defaultCluster,speedScale,type ClusterWidget} from './clusterModel';
import {TimeCircuits} from './TimeCircuits';
import {GalacticEnforcer} from './GalacticEnforcer';
import {AerospaceF14Overlay} from '../skins/aerospace-f14/AerospaceF14Overlay';
import '../skins/aerospace-f14/aerospace-f14.css';
import {NewWorldsCluster} from '../skins/new-worlds/NewWorldsCluster';
import '../skins/new-worlds/new-worlds.css';
import {EnterpriseCluster} from '../skins/enterprise/EnterpriseCluster';
import '../skins/enterprise/enterprise.css';
import {GradientCluster} from '../skins/gradient/GradientCluster';
import {GradientMacro} from '../skins/gradient/GradientMacro';
import {useMemo} from 'react';
import {instrumentDefaults} from './ThemeColors';
import type {CSSProperties} from 'react';
import {SceneCanvas} from '../forge/SceneCanvas';
import {sceneForId} from '../forge/catalog';
import type {Simulation} from '../forge/simulation';
import type {ThemePreset} from './catalog';
import './themes.css';
import './special-dashes.css';
interface Props {maxSpeedMps?:number;fonts?:FontChoice;widgets?:ClusterWidget[];lockStage?:string;onTimeJump?:()=>void;colors?:Record<string,string>;sceneColors?:Record<string,string>;theme:ThemePreset; state:Simulation; simulation:{current:Simulation}; redline:number; unit:'mph'|'kph'; demo:boolean; motion:boolean; running:boolean; warningRpm?:number;gpsLabel?:string; atmosphereId?:string;}
function Dial({value,max,label,unit}:{value:number;max:number;label:string;unit:string}) {
 const pct=Math.max(0,Math.min(1,value/max));
 return <div className="skin-dial"><svg viewBox="0 0 220 220" role="img" aria-label={`${label}: ${Math.round(value)} ${unit}`}>
  <circle cx="110" cy="110" r="102" className="dial-rim"/><circle cx="110" cy="110" r="94" className="dial-face"/>
  {Array.from({length:41},(_,i)=>{const angle=(-135+i*6.75)*Math.PI/180;return <line key={i} x1={110+Math.sin(angle)*(i%5?83:77)} y1={110-Math.cos(angle)*(i%5?83:77)} x2={110+Math.sin(angle)*89} y2={110-Math.cos(angle)*89} className={i>33?'dial-mark red':'dial-mark'}/>;})}
  {Array.from({length:9},(_,i)=>{const angle=(-135+i*33.75)*Math.PI/180;return <text key={i} x={110+Math.sin(angle)*65} y={115-Math.cos(angle)*65} textAnchor="middle" className="dial-label">{Math.round(max*i/8)}</text>;})}
  <g style={{transform:`rotate(${-135+pct*270}deg)`,transformOrigin:'110px 110px'}} className="dial-needle"><path d="M107 123 L110 34 L113 123 Z"/><circle cx="110" cy="110" r="7"/></g>
  <text x="110" y="163" textAnchor="middle" className="dial-title">{label}</text><text x="110" y="179" textAnchor="middle" className="dial-unit">{unit}</text>
 </svg></div>;
}
function Rail({value,label,segmented=false}:{value:number;label:string;segmented?:boolean}) {
 return <div className={`skin-rail ${segmented?'segmented':''}`}><span>{label}</span><div className="rail-track">{segmented?Array.from({length:32},(_,i)=><i key={i} className={i/32<value?'lit':''}/>):<i style={{width:`${Math.max(0,Math.min(1,value))*100}%`}}/>}</div></div>;
}
export function ThemeStage({maxSpeedMps,fonts,widgets=defaultCluster,theme,state,simulation,redline,unit,demo,motion,running,gpsLabel='GPS waiting',atmosphereId,warningRpm,colors={},sceneColors,onTimeJump,lockStage}:Props) {
 const scene=useMemo(()=>{const original=sceneForId(atmosphereId??theme.sceneId??'road-66');return sceneColors?{...original,palette:{...original.palette,...sceneColors}}:original;},[atmosphereId,theme.sceneId,sceneColors]);
 const palette={...instrumentDefaults,accent:theme.accent,secondary:theme.secondary,...colors};
 const speed=state.speedMps*(unit==='kph'?3.6:2.236936), rpm=running?state.rpm:0;
 const rev=Math.max(0,Math.min(1,rpm/redline)), speedPct=Math.min(1,speed/speedScale(maxSpeedMps,unit));
 const spaceFont=theme.id==='galactic-enforcer';
 const fullscreen=theme.family==='Full Screen';
 const style={...(fonts?.numbers!=='default'&&fontCss[fonts?.numbers??'']?{'--number-font':fontCss[fonts!.numbers]}:{}),...(fonts?.labels!=='default'&&fontCss[fonts?.labels??'']?{'--label-font':fontCss[fonts!.labels]}:{}),...Object.fromEntries(Object.entries(palette).map(([k,v])=>['--skin-'+k,v])),'--rev':rev,'--speed':speedPct,'--flow-time':`${Math.max(.4,3-state.speedMps/25)}s`} as CSSProperties;
 const hero=<div className="skin-speed"><strong className="skin-number" data-testid="speed" aria-label={`${Math.round(speed)} ${unit}`}>{Math.round(speed).toString().padStart(2,'0')}</strong><span className="skin-descriptor">{unit==='kph'?'KM/H':'MPH'}</span><small className={`skin-source ${demo?'is-demo':''}`}>{demo?'DEMO':gpsLabel}</small></div>;
 const telemetry=<div className="skin-telemetry"><div><small className="skin-descriptor">ENGINE RPM</small><b className="skin-number" data-testid="rpm">{Math.round(rpm).toLocaleString()}</b></div><div><small className="skin-descriptor">GEAR</small><b className="skin-number" data-testid="gear">{state.gear===0?'N':state.gear}</b></div><div><small className="skin-descriptor">LOAD</small><b className="skin-number">{Math.round(state.load*100)}<em>%</em></b></div></div>;
 const radar=<div className="skin-radar" aria-hidden="true"><i/><b/><span/></div>;
 return <div className={`theme-stage layout-${theme.layout} theme-${theme.id} ${spaceFont?'galactic-type':''} ${fullscreen?'is-fullscreen':''} ${!motion?'motion-off':''} ${running&&rpm>=(warningRpm??redline*.9)?'at-redline':''}`} style={style} data-theme-id={theme.id} data-skin={theme.id==='f14'?'aerospace-f14':undefined}>
  {!fullscreen&&(theme.layout==='road'||atmosphereId)&&<><SceneCanvas scene={scene} simulation={simulation} motion={motion}/><div className="road-atmosphere"/>{['neon-drive','miami','alpine'].includes(atmosphereId??theme.sceneId!)&&<div className={`road-weather ${(atmosphereId??theme.sceneId)==='alpine'?'snow':''}`} aria-hidden="true"/>}<div className="road-stream" aria-hidden="true"/></>}
  {!fullscreen&&<div className="skin-ambient" aria-hidden="true"/>}
  {!fullscreen&&<div className="skin-heading"><small>{theme.family} / {theme.group}</small><h2>{theme.name}</h2><span className="skin-descriptor">{theme.feature}</span></div>}
  <div className="skin-body">
   {theme.layout==='custom'&&<CustomCluster widgets={widgets} state={state} unit={unit} maxSpeed={speedScale(maxSpeedMps,unit)} redline={redline} demo={demo} gpsLabel={gpsLabel} lockStage={lockStage} running={running}/>}
   {['numerical','road'].includes(theme.layout)&&<>{hero}{telemetry}<Rail value={rev} label="RPM"/></>}
   {theme.layout==='arc'&&<><div className="skin-arc-core"><svg viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="133" className="arc-track"/><circle cx="150" cy="150" r="133" className="arc-value" style={{strokeDasharray:`${rev*627} 836`}}/></svg>{hero}<div className="shift-lights">{Array.from({length:9},(_,i)=><i key={i} className={rev>.55+i*.045?'lit':''}/>)}</div></div>{telemetry}<Rail value={rev} label="RPM"/></>}
   {['line','bar'].includes(theme.layout)&&<><div className="skin-line-main">{hero}<Rail value={speedPct} label="SPEED" segmented={theme.layout==='bar'}/></div>{telemetry}<Rail value={rev} label="RPM" segmented={theme.layout==='bar'}/><Rail value={state.load} label="LOAD" segmented={theme.layout==='bar'}/></>}
   {theme.id==='f14'&&<><div className="f14-inherited"><AerospaceF14Overlay rpmNorm={rev} speedNorm={speedPct} throttle={state.overrun?0:state.load} loadFeel={state.load}/>{hero}</div>{telemetry}</>}
   {theme.layout==='analog'&&theme.id!=='f14'&&<><div className="skin-twin-dials"><Dial value={speed} max={speedScale(maxSpeedMps,unit)} label="SPEED" unit={unit}/><div className="dial-center">{hero}{theme.family==='Cockpit'?radar:<span className={`shift-telltale ${rev>.9?'lit':''}`}>SHIFT</span>}</div><Dial value={rpm/1000} max={redline/1000} label="RPM" unit="× 1000"/></div>{telemetry}<Rail value={rev} label="ENGINE"/></>}
   {theme.layout==='gradient'&&<GradientCluster rpmNorm={rev} speedNorm={speedPct} rpm={rpm} speed={speed} unit={unit} gear={state.gear} load={state.load}/>}
   {theme.layout==='gradient-macro'&&<GradientMacro speedNorm={speedPct} speed={speed} unit={unit}/>}
   {theme.layout==='digital'&&<><div className="digital-cluster"><div className="digital-bank"><Rail value={state.load} label="LOAD" segmented/><Rail value={rev} label="ENGINE" segmented/></div>{hero}<div className="digital-tach" aria-label="Tachometer">{Array.from({length:20},(_,i)=><i key={i} className={i/20<rev?'lit':''} style={{height:`${25+i*3.6}%`}}/>)}</div></div>{telemetry}<div className="skin-grid-readout"><span>ENGINE MONITOR</span><span>{state.overrun?'OVERRUN':state.shifting?'SHIFT':'STEADY'}</span><span>{Math.round(warningRpm??redline*.9)} REDLINE</span></div></>}
   {theme.layout==='driver'&&<><div className="driver-cluster"><Rail value={rev} label="RPM"/><div className="driver-horizon"><div className="driver-lanes"/><svg viewBox="0 0 80 130" aria-hidden="true"><path d="M23 8 Q40 0 57 8 L66 103 Q65 120 40 122 Q15 120 14 103 Z"/><path d="M24 34 Q40 26 56 34 L60 73 L20 73 Z"/></svg></div>{hero}</div>{telemetry}<Rail value={state.load} label="POWER"/></>}
   {theme.layout==='scanner'&&<><div className="skin-scanner"><i/></div><div className="scanner-cluster"><div className="scanner-bank"><Rail value={rev} label="ENGINE" segmented/><Rail value={state.load} label="LOAD" segmented/></div>{hero}</div>{telemetry}<div className="skin-grid-readout"><span>SYSTEM ACTIVE</span><span>{state.shifting?'SHIFTING':'MONITORING'}</span></div></>}
   {theme.layout==='time'&&<TimeCircuits speedMps={state.speedMps} running={running} motion={motion} onJump={onTimeJump}/>}
   {theme.layout==='new-worlds'&&<NewWorldsCluster rpmNorm={rev} speedNorm={speedPct} rpm={rpm} speed={speed} unit={unit} gear={state.gear}/>}
   {theme.layout==='enterprise'&&<EnterpriseCluster rpmNorm={rev} speedNorm={speedPct} rpm={rpm} speed={speed} unit={unit} gear={state.gear}/>}
   {theme.id==='galactic-enforcer'&&<GalacticEnforcer lockStage={lockStage} state={state} redline={redline} unit={unit} demo={demo} running={running}/>}
   {theme.layout==='jet'&&<><div className="jet-instruments"><div className="jet-tape"><span>ENGINE</span><b>{Math.round(rev*100)}%</b><Rail value={rev} label="RPM" segmented/></div><div className="jet-center"><div className="jet-reticle" aria-hidden="true">{Array.from({length:5},(_,i)=><i key={i}/>)}</div>{hero}</div><div className="jet-tape"><span>LOAD</span><b>{Math.round(state.load*100)}%</b>{radar}</div></div>{telemetry}<div className="skin-grid-readout"><span>SIMULATED COCKPIT</span><span>{state.shifting?'SHIFT':'ENGINE MONITOR'}</span></div></>}
   {theme.layout==='space'&&theme.id!=='galactic-enforcer'&&<><div className="space-viewport" aria-hidden="true"><i/><i/><i/><i/><div className="space-stars"/></div><div className="space-instruments"><div className="reactor-meter"><Rail value={rev} label="REACTOR" segmented/></div>{hero}<div className="reactor-meter"><Rail value={state.load} label="LOAD" segmented/></div></div>{telemetry}<div className="space-lock" aria-hidden="true"><i/><span className="skin-descriptor">{state.shifting?'SHIFT':'ENGINE ONLINE'}</span><i/></div></>}
  </div>
 </div>;
}
