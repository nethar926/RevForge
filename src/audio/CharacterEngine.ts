import {spatialPanner,setPosition} from './spatial';
import {LayerMixer} from './LayerMixer';
import type {SoundLayer} from './types';
import {nextLockStage} from './lockStage';
import {JetLayers} from './JetLayers';
import {SignalGraph} from './SignalGraph';
import type {EngineSynth,EnginePatch,EngineParams,DrivingInput,LockStage,SynthNodeDesc,ScannerEdge} from './types';
import {EnvelopeMeter} from './envelopeMeter';
import {ProceduralCharacter} from './ProceduralCharacter';
import {BassDriver,type BassDriverListener,type BassDriverSettings,type BassEngineFrame} from './bassDriver';
import {shutoffDuration,starterDuration} from './engineStartShutdown';
const keys=['screamTone','digitalCueLevel','tieSignature','roarOne','roarTwo','roarThree','ionCannonPitch','roarDepth','roarAir','roarWidth','roarLevel','roarVariant','roarPitch','roarThroat','roarRasp','roarPulse','roarAttack','roarRelease','interiorNoise','interiorLevel','targetingNoise','targetingLevel','gearingNoise','gearingLevel','blasterLevel','lifecycleSounds','lifecycleLevel'] as const;
/** Keep the native engine core, with a single independently controlled procedural character bus. */
export class CharacterEngine implements EngineSynth {
 readonly context:AudioContext;readonly output:GainNode;
 private mainSpatial:PannerNode;private mainBus:GainNode;private mixLimiter:DynamicsCompressorNode;private mixer:LayerMixer;private layers:SoundLayer[]=[];private jet:JetLayers;private fx:ProceduralCharacter;private options:Partial<EngineParams>={};private disposed=false;
 private acoustic: BiquadFilterNode;private lockStage:LockStage='none';private lockSfx=false;onLockStageChange?: (s:LockStage)=>void;private legacyGate:GainNode;private base:EngineSynth;private graph:SignalGraph;private dry:GainNode;private raw:GainNode;private graphDesc:SynthNodeDesc[]=[];private running=false;private envelope:EnvelopeMeter;
 /** Shared bass-driver master bus (off by default; Frontend persists the prefs). */
 private bass:BassDriver;private patchKind:EnginePatch['kind']='ice';private patchTopology='';private lastDrive:DrivingInput|null=null;
 constructor(base:EngineSynth,patch:EnginePatch,factory:(p:EnginePatch)=>EngineSynth){this.base=base;this.context=base.context;this.output=this.context.createGain();this.output.gain.value=.65;base.output.disconnect();this.raw=this.context.createGain();this.mainBus=this.context.createGain();this.mainSpatial=spatialPanner(this.context);this.mainBus.connect(this.mainSpatial);this.mainSpatial.connect(this.raw);this.mixLimiter=this.context.createDynamicsCompressor();this.mixLimiter.threshold.value=-12;this.mixLimiter.knee.value=6;this.mixLimiter.ratio.value=20;this.mixLimiter.attack.value=.002;this.mixLimiter.release.value=.18;this.bass=new BassDriver(this.context,this.mixLimiter,this.output);this.dry=this.context.createGain();this.legacyGate=this.context.createGain();this.acoustic=this.context.createBiquadFilter();this.acoustic.type='lowpass';this.acoustic.Q.value=.55;this.acoustic.frequency.value=6000;base.output.connect(this.acoustic);this.acoustic.connect(this.legacyGate);this.legacyGate.connect(this.mainBus);this.raw.connect(this.dry);this.dry.connect(this.mixLimiter);this.graph=new SignalGraph(this.context,this.raw,this.mixLimiter);this.output.connect(this.context.destination);this.mixer=new LayerMixer(this.context,this.raw,factory);this.fx=new ProceduralCharacter(this.context,this.mainBus);this.jet=new JetLayers(this.context,this.mainBus);this.envelope=new EnvelopeMeter(this.context,this.output);this.fromPatch(patch);}
 get id(){return this.base.id;}
 async start(){await this.base.start();if(!this.disposed){this.running=true;this.bass.setRunning(true);await this.mixer.start();if(this.disposed||!this.running)return;this.fx.start();if(this.base.toPatch().kind==='aerospace'&&Number(this.getParams().jetSimulation??0)!==0)this.jet.start();if(this.graphActive()){this.graph.configure(this.graphDesc);this.graph.start();}}}
 stop(){this.mixer.stop();this.running=false;this.bass.setRunning(false);this.lockStage='none';const hidden=typeof document!=='undefined'&&document.visibilityState==='hidden';this.graph.stop(hidden?0:1.8);this.base.stop();this.fx.stop(hidden);this.jet.stop();}
 dispose(){this.disposed=true;this.bass.dispose();this.mixer.dispose();this.base.dispose();this.fx.dispose();this.jet.dispose();this.graph.dispose();this.envelope.dispose();this.mainSpatial.disconnect();this.mainBus.disconnect();this.mixLimiter.disconnect();this.acoustic.disconnect();this.legacyGate.disconnect();this.raw.disconnect();this.dry.disconnect();this.output.disconnect();}
 setDriving(d:DrivingInput){this.mixer.update(d);const kind=this.base.toPatch().kind;const rpm=Math.max(0,Math.min(1,d.rpmNorm??d.speed));const load=Math.max(0,Math.min(1,d.throttle));this.acoustic.frequency.setTargetAtTime(kind==='ev-whine'?2600+rpm*6200:850+rpm*4500+load*1500,this.context.currentTime,.09);const next=kind==='scifi'&&this.running?nextLockStage(rpm,this.lockStage):'none';if(next!==this.lockStage){this.lockStage=next;this.onLockStageChange?.(next);if(next==='lock'&&this.lockSfx)this.fx.cue('lock');}this.base.setDriving(d);this.lastDrive=d;this.bass.update(()=>this.bassFrame(d));this.fx.update(d);if(this.base.toPatch().kind==='aerospace'&&Number(this.getParams().jetSimulation??0)!==0)this.jet.update(d);}
 playStarter(){this.base.playStarter?.();this.bassCue('starter');}
 playShutoff(){this.base.playShutoff?.();this.bassCue('shutoff');}
 /** Bass driver (sub layer on the shared master bus). Default { enabled: false, amount: 0.5 }; ramps ~150 ms. */
 setBassDriver(settings:Partial<BassDriverSettings>):void{if(this.disposed)return;this.bass.set(settings);const d=this.lastDrive;if(d&&this.bass.active)this.bass.update(()=>this.bassFrame(d));}
 getBassDriver():BassDriverSettings{return this.bass.get();}
 onBassDriverChange(cb:BassDriverListener):()=>void{return this.bass.onChange(cb);}
 /** Engine state the bass bus follows (only queried while the driver is on). */
 private bassFrame(d:DrivingInput):BassEngineFrame{const hud=this.base.getHud();const p=this.base.getParams();const kind=this.patchKind;let rpm:number|undefined;if(kind==='ice'&&this.base.getDiag().iceMode==='worklet'){const st=this.base.getEngineState?.();if(st&&st.rpm>0)rpm=st.rpm;}const fam=Number(p.firingFamily??0);return {kind,rpm,cylinders:Number(p.cylinders??8),rotary:fam>=3.5,rotors:Number(p.rotors??1),fundamentalHz:hud.fundamentalHz,rpmNorm:hud.rpmNorm,speed:d.speed,throttle:d.throttle,load:d.load,overrun:d.overrun};}
 private bassCue(cue:'starter'|'shutoff'){if(this.disposed||(cue==='starter'&&!this.running))return;const kind=this.patchKind;const dur=cue==='starter'?starterDuration(kind,this.patchTopology):shutoffDuration(kind,this.patchTopology);const d=this.lastDrive??{speed:0,throttle:0};this.bass.cue(cue,dur,this.bass.active?this.bassFrame({...d,speed:0,throttle:0}):undefined);}
 /** Pack hooks (src/packs/audioBridge PackAudioHooks) — always present on the wrapper so typeof checks pass. */
 getEnvelope():number{return this.disposed?0:this.envelope.read();}
 getVoiceEnvelope():number{return this.getEnvelope();}
 scannerTick(edge:ScannerEdge='right'):void{if(!this.disposed&&this.running)this.base.scannerTick?.(edge);}
 setPursuitBoost(amount:number):void{const v=Math.max(0,Math.min(1,Number.isFinite(amount)?amount:0));if(typeof this.base.setPursuitBoost==='function')this.base.setPursuitBoost(v);else this.base.setParams({pursuitBoost:v});}
 /** Chrono Coupe charge 0..1 — forwarded (base ignores it on other packs). Safe when stopped. */
 setChargeLevel(level:number):void{if(this.disposed)return;const v=Math.max(0,Math.min(1,Number.isFinite(level)?level:0));this.base.setChargeLevel?.(v);}
 /** Chrono Coupe discharge one-shot — only while running; base rate-limits. */
 triggerDischarge():void{if(!this.disposed&&this.running)this.base.triggerDischarge?.();}
 setParams(params:Partial<EngineParams>){for(const k of keys)if(params[k]!==undefined)this.options[k]=Number(params[k]);const next={...params};if(this.base.toPatch().kind==='scifi')next.tieSignature=0;this.base.setParams(next);this.configure();if(params.graphEnabled!==undefined)this.routeGraph();}
 getParams(){return {...this.base.getParams(),...this.options};}
 toPatch(){return {...this.base.toPatch(),layers:this.layers,graph:this.graphDesc.length?this.graphDesc:this.base.toPatch().graph,params:this.getParams() as EnginePatch["params"]};}
 fromPatch(p:EnginePatch){this.patchKind=p.kind;this.patchTopology=String(p.topology??'');this.layers=p.layers??[];this.mixer.configure(this.layers);this.options={};for(const k of keys)if(p.params[k]!==undefined)this.options[k]=Number(p.params[k]);this.base.fromPatch(p.kind==='scifi'?{...p,params:{...p.params,tieSignature:0}}:p);this.configure();this.graphDesc=p.graph??[];this.routeGraph();}
 private configure(){setPosition(this.mainSpatial,Number(this.getParams().mainPan??0),Number(this.getParams().mainDepth??0),this.context.currentTime);this.mainBus.gain.setTargetAtTime(this.layers.some(l=>l.solo&&!l.muted)?0:Math.max(0,Math.min(1,Number(this.getParams().mainLayerLevel??1))),this.context.currentTime,.04);const kind=this.base.toPatch().kind;this.legacyGate.gain.value=Math.max(0,Math.min(1,Number(this.getParams().baseLayerLevel??1)));this.fx.configure(this.getParams(),kind);this.jet.configure({...this.getParams(),jetIdleRpm:this.base.toPatch().revforge?.idleRpm??800});const jetOn=kind==='aerospace'&&Number(this.getParams().jetSimulation??0)!==0;if(!jetOn)this.jet.stop();else if(this.running)this.jet.start();}
 private graphActive(){return this.getParams().graphEnabled===1&&this.graphDesc.some(n=>n.type==='Output');}
 private routeGraph(){const active=this.graphActive();if(active)this.graph.configure(this.graphDesc);this.dry.gain.setTargetAtTime(active?0:1,this.context.currentTime,.025);if(active&&this.running)this.graph.start();else this.graph.stop();}
 applyGraphToParams(graph:SynthNodeDesc[]){if(graph.some(n=>n.type==='Output')){this.graph.configure(graph);this.graphDesc=graph;this.base.setParams({graphEnabled:1});this.routeGraph();}else{this.base.applyGraphToParams?.(graph);this.configure();}}
 getHud(){return {...this.base.getHud(),lockStage:this.lockStage};}getDiag(){return this.base.getDiag();}getLockStage(){return this.lockStage;}
 setLockSfxEnabled(v:boolean){this.lockSfx=v;this.base.setLockSfxEnabled(false);}getLockSfxEnabled(){return this.lockSfx;}
 setUpshiftSfxEnabled(v:boolean){this.base.setUpshiftSfxEnabled(v);}getUpshiftSfxEnabled(){return this.base.getUpshiftSfxEnabled();}
 triggerUiCue(cue:string){if(cue==='time-jump')this.fx.cue('time-jump');else if(cue==='ion-cannon'||cue==='blaster')this.fx.cue('ion-cannon');else if((cue==='upshift'||cue==='downshift')&&this.base.toPatch().kind==='scifi')this.fx.cue('gearing');else{this.base.triggerUiCue?.(cue);const c=String(cue||'').toLowerCase();if(c==='starter'||c==='ignition')this.bassCue('starter');else if(c==='shutdown'||c==='shutoff')this.bassCue('shutoff');}}
}
