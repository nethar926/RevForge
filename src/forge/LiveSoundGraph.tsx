import {useState} from 'react';
import {HigListPicker} from '../ui/hig';
import type {EnginePatch,SynthNodeDesc,SynthNodeType} from '../audio/types';
import {validateGraph} from '../audio/SignalGraph';
const initial:SynthNodeDesc[]=[{id:'engine',type:'EngineInput',params:{gain:1},outs:[{to:'filter'}]},{id:'filter',type:'Filter',params:{frequency:12000,Q:.7,gain:1},outs:[{to:'output'}]},{id:'output',type:'Output',params:{gain:1},outs:[]}];
export function LiveSoundGraph({patch,onChange}:{patch:EnginePatch;onChange:(p:EnginePatch)=>void}){
 const [error,setError]=useState('');const enabled=patch.params.graphEnabled===1;
 const nodes=patch.graph?.some(n=>n.type==='Output')?patch.graph:initial;
 const change=(next:SynthNodeDesc[],active=enabled)=>{try{validateGraph(next);setError('');onChange({...patch,graph:next,params:{...patch.params,graphEnabled:active?1:0}});}catch(e){setError(String((e as Error).message));}};
 const param=(id:string,key:string,value:number)=>change(nodes.map(n=>n.id===id?{...n,params:{...n.params,[key]:value}}:n));
 const add=(type:SynthNodeType)=>change([...nodes,{id:`node-${crypto.randomUUID().slice(0,8)}`,type,params:type==='Filter'?{frequency:3000,Q:.7,gain:1}:type==='Osc'?{frequency:120,detune:0,gain:.08}:{gain:.08},outs:[{to:'output'}]}]);
 return <section className="sound-character"><h3>Live signal routing</h3><label className="forge-music-toggle">Enable custom routing<input type="checkbox" checked={enabled} onChange={e=>change(nodes,e.target.checked)}/></label>
 <p className="forge-control-hint">Engine input includes your voice and effects. Connect nodes to Output to hear them. Disconnected nodes are silent; edits apply live while auditioning.</p>
 {enabled&&<><div className="forge-studio-actions">{(['Osc','Noise','Filter','Gain'] as const).map(type=><button key={type} onClick={()=>add(type)}>+ {type}</button>)}</div>
 {nodes.map(n=><fieldset key={n.id} className="sound-character"><legend>{n.type}</legend>
 {Object.entries(n.params).filter(([,v])=>typeof v==='number').map(([key,value])=><label key={key} className="character-slider"><span>{key}<output>{Number(value).toFixed(key==='frequency'?0:2)}</output></span><input aria-label={`${n.id} ${key}`} type="range" min={key==='frequency'?40:key==='Q'?.1:key==='detune'?-1200:0} max={key==='frequency'?16000:key==='Q'?12:key==='detune'?1200:1} step={key==='frequency'||key==='detune'?1:.01} value={value} onChange={e=>param(n.id,key,Number(e.target.value))}/></label>)}
 {n.type!=='Output'&&<HigListPicker label={`${n.type} connects to`} value={n.outs[0]?.to??''} options={[{value:'',label:'Disconnected'},...nodes.filter(other=>other.id!==n.id&&other.type!=='EngineInput'&&other.type!=='Osc'&&other.type!=='Noise').map(other=>({value:other.id,label:`${other.type} · ${other.id.slice(0,12)}`}))]} onChange={to=>change(nodes.map(item=>item.id===n.id?{...item,outs:to?[{to}]:[]}:item))}/>}
 {n.type!=='EngineInput'&&n.type!=='Output'&&<button onClick={()=>change(nodes.filter(item=>item.id!==n.id).map(item=>({...item,outs:item.outs.filter(o=>o.to!==n.id)})))}>Remove {n.type}</button>}
 </fieldset>)}</>}{error&&<p role="alert">{error}</p>}</section>;
}
