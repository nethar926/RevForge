import {BUILTIN_PATCHES} from '../audio/builtins';
import type {EnginePatch} from '../audio/types';
import {isEngineListed} from '../themes/visibility';
const ion=BUILTIN_PATCHES.find(p=>p.kind==='scifi')!,jet=BUILTIN_PATCHES.find(p=>p.kind==='aerospace')!;
const atomic=(id:string,name:string,base:EnginePatch,params:EnginePatch['params']):EnginePatch=>({...base,id:'source-'+id,name,layers:[],params:{...base.params,lifecycleSounds:0,tieSignature:0,digitalCueLevel:0,interiorNoise:0,targetingNoise:0,gearingNoise:0,roarOne:0,roarTwo:0,roarThree:0,jetSpoolEnabled:0,jetThrusterEnabled:0,jetAfterburnerEnabled:0,...params}});
// Built-in engines follow the visible engine allowlist; the atomic sources below are building blocks, not engines.
export const SOUND_SOURCES:EnginePatch[]=[...BUILTIN_PATCHES.filter(p=>isEngineListed(p.id)),
 ...(['engine','exhaust','turbo'] as const).map(componentKind=>atomic(componentKind,componentKind==='engine'?'Engine mechanical':componentKind==='exhaust'?'Exhaust pulses':'Turbo whistle',ion,{componentKind,componentLevel:.6})),
 ...['Low bellow','Rising howl','Broad scream'].map((name,i)=>atomic('roar-'+i,name,ion,{tieSignature:1,[['roarOne','roarTwo','roarThree'][i]]:1})),
 atomic('digital','Digital acceleration cue',ion,{digitalCueLevel:.7}),atomic('interior','Interior hum',ion,{interiorNoise:1,interiorLevel:1}),atomic('targeting','Targeting oscillator',ion,{targetingNoise:1,targetingLevel:1}),
 atomic('spool','Jet compressor spool',jet,{jetSpoolEnabled:1}),atomic('thruster','Jet thruster exhaust',jet,{jetThrusterEnabled:1,jetSimulation:1}),atomic('afterburner','Jet afterburner',jet,{jetAfterburnerEnabled:1,jetSimulation:1}),
 ...(['Osc','Noise'] as const).map(type=>({...atomic(type,type==='Osc'?'Pure oscillator':'Filtered noise',ion,{graphEnabled:1}),graph:[{id:'source',type,params:type==='Osc'?{frequency:220,gain:.3,waveform:'sine'}:{gain:.2},outs:[{to:'out'}]},{id:'out',type:'Output',params:{gain:1},outs:[]}]} as EnginePatch))];
