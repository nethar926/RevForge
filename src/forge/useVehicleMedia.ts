import {useCallback,useEffect,useRef,useState} from 'react';
import {MEDIA_ARTWORK_SIZES,carrierWav,isElementPlaying,mediaCommand,mediaMetadataFields,mediaPlaybackState,mediaSessionHeld,type VehicleMediaAction} from './mediaActions';
interface Options {enabled:boolean;getMediaElement?:()=>HTMLAudioElement|null;blasters?:boolean;fire?:()=>void;running:boolean;starting?:boolean;manual:boolean;canShift?:boolean;pauseShifts:boolean;name:string;stop:()=>void;shift:(direction:number)=>void;}
type Artwork={src:string;sizes:string;type:string};
const ACTIONS:VehicleMediaAction[]=['play','pause','nexttrack','previoustrack'];
/** App icon rasterised to PNG at 96/192/512 (SVG artwork is not decoded by every media hub), plus the SVG. */
async function appArtwork():Promise<Artwork[]> {
 const url=new URL('favicon.svg',document.baseURI).href,svg:Artwork={src:url,sizes:MEDIA_ARTWORK_SIZES.map(s=>`${s}x${s}`).join(' '),type:'image/svg+xml'};
 try{
  const img=new Image();img.src=url;await img.decode();
  const png=MEDIA_ARTWORK_SIZES.map(size=>{const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');if(!g)throw Error('no 2d');g.drawImage(img,0,0,size,size);return {src:c.toDataURL('image/png'),sizes:`${size}x${size}`,type:'image/png'};});
  return [...png,svg];
 }catch{return [svg];}
}
/**
 * Steering-wheel / media-key controls (Tesla Miniplayer, OS media keys). On by default; held only while the engine runs.
 * Chromium builds a media session only from a playing, file-backed <audio> (MediaStream elements such as Audio's
 * MediaOutput are ignored) and gives clips under 5 s transient focus, so a 10 s low-level (-60 dBFS) carrier plays
 * for as long as the engine runs. Engine sound is not routed through it: one audible path.
 * Engine off → release (handlers cleared, carrier unloaded, state 'none') so the wheel controls music again.
 */
export function useVehicleMedia(options:Options) {
 const current=useRef(options),element=useRef<HTMLAudioElement|null>(null),url=useRef(''),registered=useRef(false),ourPause=useRef(false),last=useRef(-Infinity),artwork=useRef<Artwork[]>([]),dispatch=useRef<(action:VehicleMediaAction)=>void>(()=>{});
 const [accepted,setAccepted]=useState<string[]>([]),[lastEvent,setLastEvent]=useState('No media-button event received'),[history,setHistory]=useState<string[]>([]),[carrier,setCarrier]=useState('Released (engine off)'),[artReady,setArtReady]=useState(0);
 useEffect(()=>{current.current=options;});
 const supported=typeof navigator!=='undefined'&&'mediaSession' in navigator;
 /** Take the session: handlers + carrier playing. Call inside the Ignition gesture; later calls rely on sticky activation. */
 const arm=useCallback(()=>{
  if(!supported||!current.current.enabled)return;
  const session=navigator.mediaSession;
  if(!registered.current){const ok:string[]=[];for(const action of ACTIONS){try{session.setActionHandler(action,()=>dispatch.current(action));ok.push(action);}catch{/* unsupported action stays unregistered */}}registered.current=true;setAccepted(ok);}
  if(!url.current)url.current=URL.createObjectURL(new Blob([carrierWav()],{type:'audio/wav'}));
  let a=element.current;
  if(!a){a=new Audio();a.loop=true;a.preload='auto';a.setAttribute('playsinline','');element.current=a;
   a.addEventListener('pause',()=>{if(ourPause.current){ourPause.current=false;return;}if(registered.current)setCarrier('Interrupted by the browser — press play or Enable controls');});
   a.addEventListener('playing',()=>{if(registered.current)setCarrier('Active');});}
  if(!a.getAttribute('src'))a.src=url.current;
  if(!a.paused){setCarrier('Active');return;}
  void a.play().then(()=>setCarrier('Active')).catch(()=>{if(registered.current)setCarrier('Playback blocked — tap Ignition or Enable controls');});
 },[supported]);
 /** Give the session back: no handlers, carrier paused and unloaded (Chromium drops the player), state 'none'. */
 const release=useCallback(()=>{
  if(!supported)return;
  const session=navigator.mediaSession,a=element.current;
  if(a){if(!a.paused){ourPause.current=true;a.pause();}if(a.getAttribute('src')){a.removeAttribute('src');a.load();}}
  if(registered.current){for(const action of ACTIONS){try{session.setActionHandler(action,null);}catch{/* unsupported */}}registered.current=false;setAccepted([]);}
  session.metadata=null;session.playbackState='none';
  setCarrier(current.current.enabled?'Released (engine off)':'Off in Settings');
 },[supported]);
 useEffect(()=>{
  if(!supported)return;
  let closing=false;
  void appArtwork().then(art=>{if(!closing){artwork.current=art;setArtReady(n=>n+1);}});
  dispatch.current=(action)=>{
   const o=current.current;if(closing||!registered.current)return;
   const now=performance.now();if(now-last.current<300)return;last.current=now;
   const command=mediaCommand(action,o.running,o.manual,o.pauseShifts,!!o.blasters,o.canShift??o.manual);
   const line=`${action} → ${command} · ${new Date().toLocaleTimeString()}`;setLastEvent(line);setHistory(h=>[line,...h].slice(0,6));
   if(command==='blaster')o.fire?.();
   if(command==='stop'){o.stop();return;}
   if(command==='up'||command==='down')o.shift(command==='up'?1:-1);
   if(o.running){arm();navigator.mediaSession.playbackState='playing';}
  };
  return ()=>{closing=true;release();const a=element.current;element.current=null;a?.remove();if(url.current){URL.revokeObjectURL(url.current);url.current='';}};
 },[supported,arm,release]);
 const held=mediaSessionHeld(options.enabled,options.running,options.starting);
 useEffect(()=>{
  if(!supported)return;
  if(!held){release();return;}
  arm();
  if(typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata(mediaMetadataFields(options.name,options.manual,artwork.current));
  navigator.mediaSession.playbackState=mediaPlaybackState(true);
 },[supported,held,options.name,options.manual,artReady,arm,release]);
 /** Diagnostics only: is Audio's MediaOutput element actually playing (it is not part of the media session). */
 const outputPlaying=isElementPlaying(options.getMediaElement?.());
 return {arm,accepted,lastEvent,history,carrier,outputPlaying};
}
