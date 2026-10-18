import {useCallback,useEffect,useRef,useState} from 'react';
import {mediaCommand,runMediaCommand,VEHICLE_MEDIA_ACTIONS,type VehicleMediaAction} from './mediaActions';
interface Options {getMediaElement?:()=>HTMLAudioElement|null;blasters?:boolean;fire?:()=>void;enabled:boolean;running:boolean;manual:boolean;/** false = the pack has no gearbox (Carrier Jet): no gearbox wording, never shifts. */gearbox?:boolean;pauseShifts:boolean;name:string;start:()=>void;/** car 'stop' only: the full Shutdown */stop:()=>void;/** car pause: mute the engine output (engine + sim keep running) */mute:()=>void;/** car play while running: unmute */unmute:()=>void;/** muted by the app (media pause or the mute control): the session reads 'paused' */paused?:boolean;shift:(direction:number)=>void;}
function carrierUrl() {
 // Original one-second silent PCM clip. It activates a native media element without duplicating the synth output.
 const bytes=new ArrayBuffer(16044),v=new DataView(bytes);
 const text=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,16036,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,16000,true);
 return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
}
export function useVehicleMedia(options:Options) {
 const current=useRef(options),element=useRef<HTMLAudioElement|null>(null),last=useRef(-Infinity),dispatch=useRef<(action:VehicleMediaAction)=>void>(()=>{});
 const [accepted,setAccepted]=useState<string[]>([]),[lastEvent,setLastEvent]=useState('No media-button event received'),[carrier,setCarrier]=useState('Not activated');
 useEffect(()=>{current.current=options;});
 const arm=useCallback(()=>{
  // no hidden-page guard: a car pause / play while the backup camera covers the page must be able to re-arm the media
  // session (play() rejections are caught below)
  if(!current.current.enabled)return;
  const a=current.current.getMediaElement?.()??element.current;if(!a)return;
  void a.play().then(()=>setCarrier('Active')).catch(()=>setCarrier('Playback blocked — tap Enable controls again'));
 },[]);
 useEffect(()=>{
  if(!options.enabled||!('mediaSession' in navigator)){setAccepted([]);return;}
  const session=navigator.mediaSession,a=new Audio(carrierUrl());a.loop=true;a.preload='auto';a.setAttribute('playsinline','');element.current=a;
  let closing=false;
  dispatch.current=(action)=>{
   const o=current.current;if(closing||!o.enabled)return;
   const now=performance.now();if(now-last.current<300)return;last.current=now;
   const command=mediaCommand(action,o.running,o.manual,o.pauseShifts,!!o.blasters);
   setLastEvent(`${action} → ${command} · ${new Date().toLocaleTimeString()}`);
   runMediaCommand(command,{session,arm,fire:o.fire,start:o.start,stop:o.stop,mute:o.mute,unmute:o.unmute,shift:o.shift});
  };
  const actions=VEHICLE_MEDIA_ACTIONS;const registered:string[]=[];
  for(const action of actions){try{session.setActionHandler(action,()=>dispatch.current(action));registered.push(action);}catch{/* Unsupported actions remain visible as unregistered. */}}
  setAccepted(registered);
  const pause=()=>{if(!closing&&!current.current.getMediaElement?.()&&current.current.running&&a.paused){dispatch.current('pause');if(current.current.blasters||(current.current.manual&&current.current.pauseShifts))arm();}};
  a.addEventListener('pause',pause);
  return ()=>{closing=true;a.removeEventListener('pause',pause);a.pause();URL.revokeObjectURL(a.src);a.removeAttribute('src');a.load();element.current=null;for(const action of actions){try{session.setActionHandler(action,null);}catch{/* unsupported */}}session.metadata=null;session.playbackState='none';};
 },[options.enabled,arm]);
 useEffect(()=>{
  if(!options.enabled||!('mediaSession' in navigator))return;
  if(options.running){if(current.current.getMediaElement?.())element.current?.pause();if(typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata({title:options.name,artist:'RevForge',album:options.gearbox===false?'No gearbox':options.manual?'Manual gearbox':'Automatic gearbox'});navigator.mediaSession.playbackState=options.paused?'paused':'playing';}
  else{element.current?.pause();navigator.mediaSession.playbackState='none';setCarrier('Not activated');}
 },[options.enabled,options.running,options.name,options.manual,options.gearbox,options.paused]);
 return {arm,accepted,lastEvent,carrier};
}
