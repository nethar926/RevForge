import type {EnginePatch} from '../audio';
import {drivetrainFor} from './catalog';
export function EngineSetup({patch,onChange}:{patch:EnginePatch;onChange:(p:EnginePatch)=>void}){
 const c=drivetrainFor(patch);
 const speedUnit=patch.params.topSpeedUnit==='mph'?'mph':'kph';
 const speedFactor=speedUnit==='mph'?1.609344:1;
 const setSpeedUnit=(unit:'kph'|'mph')=>onChange({...patch,params:{...patch.params,topSpeedUnit:unit}});
 const change=(key:string,value:number)=>{
  const params={...patch.params,[key]:value};
  const max=Number(params.maxRpm??c.redline),idle=c.idleRpm;
  params.autoShiftRpm=Math.max(idle+100,Math.min(max,Number(params.autoShiftRpm??c.shiftRpm)));
  params.redlinePercent=Math.max(50,Math.min(100,Number(params.redlinePercent??90)));
  onChange({...patch,params,revforge:patch.revforge?{...patch.revforge,redline:max,shiftRpm:Number(params.autoShiftRpm),gears:Number(params.gearCount??c.gears)}:undefined});
 };
 const row=(name:string,value:number,min:number,max:number,step:number|"any",on:(v:number)=>void)=><label className="character-slider"><span>{name}<output>{Math.round(value).toLocaleString()}</output></span><input aria-label={name} type="range" min={min} max={max} step={step} value={value} onChange={e=>on(Number(e.target.value))}/></label>;
 return <section className="sound-character engine-setup"><h3>Drivetrain</h3><div className="character-knobs">
 {row('Number of gears',c.gears,1,10,1,v=>change('gearCount',v))}
 {row('Maximum RPM',c.redline,Math.max(2000,c.idleRpm+500),18000,100,v=>change('maxRpm',v))}
 {row('Automatic shift RPM',c.shiftRpm,c.idleRpm+100,c.redline,1,v=>change('autoShiftRpm',v))}
 {row('Redline percentage',(c.warningRpm??c.redline*.9)/c.redline*100,50,100,1,v=>change('redlinePercent',v))}
 {row('Redline RPM',c.warningRpm??c.redline*.9,c.redline*.5,c.redline,1,v=>change('redlinePercent',v/c.redline*100))}
 <div><div role="group" aria-label="Top speed units" className="forge-studio-actions">{(['kph','mph'] as const).map(unit=><button key={unit} type="button" aria-pressed={speedUnit===unit} onClick={()=>setSpeedUnit(unit)} style={{opacity:speedUnit===unit?1:.55}}>{unit.toUpperCase()}</button>)}</div>
 {row(`Top speed · ${speedUnit.toUpperCase()}`,(c.topSpeedMps??100)*3.6/speedFactor,40/speedFactor,500/speedFactor,'any',v=>change('topSpeedKph',v*speedFactor))}</div>
 </div><p className="forge-control-hint">Maximum RPM is the limiter; redline is the warning band. Top speed sets demo speed and gear scaling. GPS continues to show measured speed.</p></section>;
}
