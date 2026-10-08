export type VehicleMediaAction = 'play'|'pause'|'nexttrack'|'previoustrack';
export type VehicleMediaCommand = 'start'|'stop'|'up'|'down'|'blaster'|'none';
/**
 * Media-key action → drive command.
 * `canShift` (gearbox has more than one gear) lets next/previous act like the on-screen paddles in Auto too:
 * the caller switches to Manual and shifts (paddle override). It defaults to `manual`, i.e. the old Manual-only rule.
 */
export function mediaCommand(action:VehicleMediaAction, running:boolean, manual:boolean, pauseShifts:boolean, blasters=false, canShift=manual):VehicleMediaCommand {
 if(running&&blasters&&(action==='play'||action==='pause'))return 'blaster';
 if(action==='play') return running?'none':'start';
 if(!running) return 'none';
 if(action==='pause') return manual&&pauseShifts?'up':'stop';
 if(!manual&&!canShift) return 'none';
 return action==='nexttrack'?'up':'down';
}
/**
 * RevForge holds the media session only while the engine runs (or is starting) and the setting is on.
 * Otherwise it releases it (no handlers, carrier unloaded, state 'none') so the wheel controls the driver's music again.
 */
export function mediaSessionHeld(enabled:boolean, running:boolean, starting=false):boolean {
 return enabled&&(running||starting);
}
export function mediaPlaybackState(held:boolean):MediaSessionPlaybackState {
 return held?'playing':'none';
}
/** Setting key (default on). The old opt-in key is dropped once, so a stored opt-in "false" becomes on. */
export const MEDIA_BUTTONS_KEY='revforge.mediaButtons';
export const LEGACY_MEDIA_OPT_IN_KEY='revforge.media.experimental';
export function readMediaButtons(storage:Pick<Storage,'getItem'|'removeItem'>|null|undefined, key=MEDIA_BUTTONS_KEY, legacyKey=LEGACY_MEDIA_OPT_IN_KEY):boolean {
 try{
  if(!storage)return true;
  if(storage.getItem(legacyKey)!==null)storage.removeItem(legacyKey);
  return storage.getItem(key)!=='false';
 }catch{return true;}
}
export const MEDIA_ARTWORK_SIZES=[96,192,512] as const;
export interface MediaMetadataFields {title:string;artist:string;album:string;artwork:{src:string;sizes:string;type:string}[];}
export function mediaMetadataFields(name:string, manual:boolean, artwork:{src:string;sizes:string;type:string}[]=[]):MediaMetadataFields {
 return {title:name||'RevForge',artist:'RevForge',album:manual?'Manual gearbox':'Automatic gearbox',artwork};
}
/** True only for an element Chromium can treat as playing media (Audio's MediaOutput element may exist but never play). */
export function isElementPlaying(a:Pick<HTMLMediaElement,'paused'|'muted'|'volume'|'ended'|'readyState'>|null|undefined):boolean {
 return !!a&&!a.paused&&!a.ended&&!a.muted&&a.volume>0&&a.readyState>=2;
}
/**
 * Media-session carrier: 16-bit mono PCM WAV, low-level noise (default 10 s at -60 dBFS peak, ≈ -65 dBFS RMS).
 * Chromium ignores MediaStream-backed elements for the media session and gives clips under 5 s only transient
 * focus, so the carrier must be a real, non-silent, >5 s file. Deterministic LCG noise, original content.
 */
export function carrierWav(seconds=10, sampleRate=8000, peak=0.001):ArrayBuffer {
 const n=Math.round(seconds*sampleRate),bytes=new ArrayBuffer(44+n*2),v=new DataView(bytes);
 const text=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,36+n*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,n*2,true);
 let seed=0x2545f491;const scale=peak*32767;
 for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;v.setInt16(44+i*2,Math.round((seed/0xffffffff*2-1)*scale),true);}
 return bytes;
}
